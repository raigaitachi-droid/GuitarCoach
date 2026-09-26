use std::{
  sync::{mpsc, Arc, Mutex},
  thread,
};

use cpal::{
  traits::{DeviceTrait, HostTrait, StreamTrait},
  BufferSize, Device, SampleFormat, Stream, StreamConfig,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

const TARGET_SAMPLE_RATE: u32 = 48_000;
const BUFFER_SIZE: usize = 2_048;
const HOP_SIZE: usize = BUFFER_SIZE / 2;
const QUICK_ONSET_WINDOW: usize = 256;
const BLOCK_SIZE: usize = 128;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioDevice {
  id: String,
  label: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureStarted {
  sample_rate: u32,
}

#[derive(Clone, Serialize)]
struct LevelPayload {
  rms: f32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OnsetPayload {
  rms: f32,
  audio_time_ms: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SamplesPayload {
  samples: Vec<f32>,
  rms: f32,
  peak: f32,
  crest_factor: f32,
  onset: bool,
  pluck_id: u64,
  audio_time_ms: f64,
}

enum CaptureEvent {
  Level(LevelPayload),
  Onset(OnsetPayload),
  Samples(SamplesPayload),
}

enum CaptureControl {
  Stop,
  SetNoiseThreshold(f32),
  MuteOutput(u32),
}

struct AudioProcessor {
  sample_rate: u32,
  noise_threshold: f32,
  muted_until_frame: u64,
  sample_clock: u64,
  ring: Vec<f32>,
  write_index: usize,
  filled: usize,
  samples_since_snapshot: usize,
  // Do not analyse a ring buffer that still contains the previous note.
  samples_since_onset: u64,
  quick_samples: usize,
  quick_squares: f64,
  previous_quick_rms: f32,
  last_quick_onset_frame: u64,
  quick_onset_refractory_frames: u64,
  block: Vec<f32>,
  block_counter: u64,
  pending_onset: bool,
  short_rms: f32,
  decay_rms: f32,
  decay_hf_rms: f32,
  last_onset_frame: u64,
  min_frames_between_plucks: u64,
  pluck_count: u64,
}

impl AudioProcessor {
  fn new(sample_rate: u32) -> Self {
    Self {
      sample_rate,
      noise_threshold: 0.002,
      muted_until_frame: 0,
      sample_clock: 0,
      ring: vec![0.0; BUFFER_SIZE],
      write_index: 0,
      filled: 0,
      samples_since_snapshot: 0,
      samples_since_onset: u64::MAX,
      quick_samples: 0,
      quick_squares: 0.0,
      previous_quick_rms: 0.0,
      last_quick_onset_frame: 0,
      quick_onset_refractory_frames: (sample_rate as f32 * 0.04).round() as u64,
      block: Vec::with_capacity(BLOCK_SIZE),
      block_counter: 0,
      pending_onset: false,
      short_rms: 0.0,
      decay_rms: 0.0,
      decay_hf_rms: 0.0,
      last_onset_frame: 0,
      min_frames_between_plucks: (sample_rate as f32 * 0.065).round() as u64,
      pluck_count: 1,
    }
  }

  fn audio_time_ms(&self) -> f64 {
    self.sample_clock as f64 / self.sample_rate as f64 * 1000.0
  }

  fn muted(&self) -> bool {
    self.sample_clock < self.muted_until_frame
  }

  fn set_noise_threshold(&mut self, value: f32) {
    self.noise_threshold = value.clamp(0.0005, 0.05);
  }

  fn mute(&mut self, duration_ms: u32) {
    let duration_frames = (duration_ms as f64 / 1000.0 * self.sample_rate as f64).round() as u64;
    self.muted_until_frame = self.sample_clock.saturating_add(duration_frames);
    self.pending_onset = false;
  }

  fn ingest(&mut self, samples: &[f32]) -> Vec<CaptureEvent> {
    let mut events = Vec::new();
    for &sample in samples {
      self.sample_clock += 1;
      self.ring[self.write_index] = sample;
      self.write_index = (self.write_index + 1) % BUFFER_SIZE;
      self.filled = (self.filled + 1).min(BUFFER_SIZE);
      self.samples_since_snapshot += 1;
      self.samples_since_onset = self.samples_since_onset.saturating_add(1);

      self.quick_squares += (sample * sample) as f64;
      self.quick_samples += 1;
      if self.quick_samples == QUICK_ONSET_WINDOW {
        let quick_rms = (self.quick_squares / QUICK_ONSET_WINDOW as f64).sqrt() as f32;
        let is_quick_onset = !self.muted()
          && self.sample_clock.saturating_sub(self.last_quick_onset_frame) >= self.quick_onset_refractory_frames
          && quick_rms > self.noise_threshold
          && quick_rms > self.previous_quick_rms * 2.5;
        if is_quick_onset {
          self.last_quick_onset_frame = self.sample_clock;
          events.push(CaptureEvent::Onset(OnsetPayload {
            rms: quick_rms,
            audio_time_ms: self.audio_time_ms(),
          }));
        }
        self.previous_quick_rms = quick_rms;
        self.quick_squares = 0.0;
        self.quick_samples = 0;
      }

      self.block.push(sample);
      if self.block.len() == BLOCK_SIZE {
        let block = std::mem::take(&mut self.block);
        events.extend(self.process_block(&block));
        self.block = Vec::with_capacity(BLOCK_SIZE);
      }
    }
    events
  }

  fn process_block(&mut self, block: &[f32]) -> Vec<CaptureEvent> {
    let mut sum_squares = 0.0_f64;
    let mut sum_hf_diff = 0.0_f64;
    let mut peak = 0.0_f32;
    for (index, sample) in block.iter().enumerate() {
      peak = peak.max(sample.abs());
      sum_squares += (*sample * *sample) as f64;
      if index > 0 {
        let difference = *sample - block[index - 1];
        sum_hf_diff += (difference * difference) as f64;
      }
    }
    let rms = (sum_squares / block.len() as f64).sqrt() as f32;
    let hf_rms = (sum_hf_diff / block.len() as f64).sqrt() as f32;
    let crest_factor = peak / (rms + 0.000_001);

    self.short_rms = self.short_rms * 0.45 + rms * 0.55;
    self.decay_rms = if self.short_rms < self.decay_rms {
      self.decay_rms * 0.965 + self.short_rms * 0.035
    } else {
      self.decay_rms * 0.82 + self.short_rms * 0.18
    };
    self.decay_hf_rms = self.decay_hf_rms * 0.94 + hf_rms * 0.06;

    let can_trigger_new_pluck = self.sample_clock.saturating_sub(self.last_onset_frame) >= self.min_frames_between_plucks;
    let initial_pluck = rms >= self.noise_threshold
      && self.decay_rms <= self.noise_threshold * 1.25
      && can_trigger_new_pluck;
    let repluck = can_trigger_new_pluck
      && rms >= self.noise_threshold
      && (rms > self.decay_rms * 1.28
        || (hf_rms > self.decay_hf_rms * 1.55 && rms > self.decay_rms * 1.15)
        || (crest_factor >= 2.45 && rms > self.decay_rms * 1.12));
    let onset = initial_pluck || repluck;
    if onset {
      self.pluck_count += 1;
      self.last_onset_frame = self.sample_clock;
      self.decay_rms = self.decay_rms.max(rms);
      if !self.muted() {
        self.pending_onset = true;
        self.samples_since_onset = 0;
      }
    }

    self.block_counter += 1;
    if !self.muted()
      && self.filled == BUFFER_SIZE
      && rms >= self.noise_threshold
      && self.samples_since_snapshot >= HOP_SIZE
      && self.samples_since_onset >= BUFFER_SIZE as u64
    {
      let mut samples = Vec::with_capacity(BUFFER_SIZE);
      samples.extend_from_slice(&self.ring[self.write_index..]);
      samples.extend_from_slice(&self.ring[..self.write_index]);
      self.samples_since_snapshot %= HOP_SIZE;
      let pending_onset = self.pending_onset;
      self.pending_onset = false;
      return vec![CaptureEvent::Samples(SamplesPayload {
        samples,
        rms,
        peak,
        crest_factor,
        onset: pending_onset,
        pluck_id: self.pluck_count,
        audio_time_ms: self.audio_time_ms(),
      })];
    }

    if self.block_counter % 8 == 0 {
      return vec![CaptureEvent::Level(LevelPayload { rms })];
    }
    Vec::new()
  }
}

#[derive(Default)]
struct CaptureController {
  control_tx: Option<mpsc::Sender<CaptureControl>>,
  thread: Option<thread::JoinHandle<()>>,
}

#[derive(Default)]
struct CaptureState {
  controller: Mutex<CaptureController>,
}

fn emit_events(app: &AppHandle, events: Vec<CaptureEvent>) {
  for event in events {
    let result = match event {
      CaptureEvent::Level(payload) => app.emit("pitch:level", payload),
      CaptureEvent::Onset(payload) => app.emit("pitch:onset", payload),
      CaptureEvent::Samples(payload) => app.emit("pitch:samples", payload),
    };
    if let Err(error) = result {
      eprintln!("Could not emit native audio event: {error}");
    }
  }
}

fn process_input(samples: Vec<f32>, processor: &Arc<Mutex<AudioProcessor>>, app: &AppHandle) {
  let events = processor.lock().map(|mut processor| processor.ingest(&samples)).unwrap_or_default();
  emit_events(app, events);
}

fn stop_controller(controller: &mut CaptureController) {
  if let Some(control_tx) = controller.control_tx.take() {
    let _ = control_tx.send(CaptureControl::Stop);
  }
  if let Some(thread) = controller.thread.take() {
    let _ = thread.join();
  }
}

fn build_stream(
  device: &Device,
  config: &StreamConfig,
  sample_format: SampleFormat,
  processor: Arc<Mutex<AudioProcessor>>,
  app: AppHandle,
) -> Result<Stream, String> {
  let channels = config.channels as usize;
  let error_callback = |error| eprintln!("Native audio input error: {error}");
  match sample_format {
    SampleFormat::F32 => device.build_input_stream(
      config,
      move |data: &[f32], _| {
        let mono = data.chunks(channels).map(|frame| frame.iter().sum::<f32>() / frame.len() as f32).collect();
        process_input(mono, &processor, &app);
      },
      error_callback,
      None,
    ).map_err(|error| error.to_string()),
    SampleFormat::I16 => device.build_input_stream(
      config,
      move |data: &[i16], _| {
        let mono = data.chunks(channels).map(|frame| frame.iter().map(|sample| *sample as f32 / i16::MAX as f32).sum::<f32>() / frame.len() as f32).collect();
        process_input(mono, &processor, &app);
      },
      error_callback,
      None,
    ).map_err(|error| error.to_string()),
    SampleFormat::U16 => device.build_input_stream(
      config,
      move |data: &[u16], _| {
        let mono = data.chunks(channels).map(|frame| frame.iter().map(|sample| (*sample as f32 / u16::MAX as f32) * 2.0 - 1.0).sum::<f32>() / frame.len() as f32).collect();
        process_input(mono, &processor, &app);
      },
      error_callback,
      None,
    ).map_err(|error| error.to_string()),
    SampleFormat::U8 => device.build_input_stream(
      config,
      move |data: &[u8], _| {
        let mono = data.chunks(channels).map(|frame| frame.iter().map(|sample| (*sample as f32 / u8::MAX as f32) * 2.0 - 1.0).sum::<f32>() / frame.len() as f32).collect();
        process_input(mono, &processor, &app);
      },
      error_callback,
      None,
    ).map_err(|error| error.to_string()),
    unsupported => Err(format!("Unsupported input sample format: {unsupported:?}")),
  }
}

fn select_device(device_id: Option<&str>) -> Result<Device, String> {
  let host = cpal::default_host();
  if let Some(device_id) = device_id.filter(|id| !id.is_empty()) {
    if let Ok(index) = device_id.parse::<usize>() {
      return host.input_devices()
        .map_err(|error| error.to_string())?
        .nth(index)
        .ok_or_else(|| "Selected audio input is not available.".to_string());
    }
    return host.input_devices()
      .map_err(|error| error.to_string())?
      .find(|device| device.name().map(|name| name == device_id).unwrap_or(false))
      .ok_or_else(|| "Selected audio input is not available.".to_string());
  }
  host.default_input_device().ok_or_else(|| "No audio input device is available.".to_string())
}

fn preferred_input_config(device: &Device) -> Result<(StreamConfig, SampleFormat), String> {
  let requested = device.supported_input_configs()
    .map_err(|error| error.to_string())?
    .find(|range| range.min_sample_rate().0 <= TARGET_SAMPLE_RATE && range.max_sample_rate().0 >= TARGET_SAMPLE_RATE)
    .map(|range| range.with_sample_rate(cpal::SampleRate(TARGET_SAMPLE_RATE)));
  let config = match requested {
    Some(config) => config,
    None => device.default_input_config().map_err(|error| error.to_string())?,
  };
  let sample_format = config.sample_format();
  Ok((config.into(), sample_format))
}

#[tauri::command]
fn list_audio_devices() -> Result<Vec<AudioDevice>, String> {
  let devices = cpal::default_host().input_devices()
    .map_err(|error| error.to_string())?
    .enumerate()
    .filter_map(|(index, device)| device.name().ok().map(|name| (index, name)))
    .map(|(index, name)| AudioDevice { id: index.to_string(), label: name })
    .collect::<Vec<_>>();
  Ok(devices)
}

fn run_capture_thread(
  app: AppHandle,
  device_id: Option<String>,
  control_rx: mpsc::Receiver<CaptureControl>,
  started_tx: mpsc::Sender<Result<u32, String>>,
) {
  let result = (|| {
    let device = select_device(device_id.as_deref())?;
    let (default_config, sample_format) = preferred_input_config(&device)?;
    let mut low_latency_config = default_config.clone();
    low_latency_config.buffer_size = BufferSize::Fixed(BLOCK_SIZE as u32);
    let processor = Arc::new(Mutex::new(AudioProcessor::new(default_config.sample_rate.0)));
    let stream = build_stream(&device, &low_latency_config, sample_format, processor.clone(), app.clone())
      .or_else(|_| build_stream(&device, &default_config, sample_format, processor.clone(), app))?;
    stream.play().map_err(|error| error.to_string())?;

    let sample_rate = default_config.sample_rate.0;
    started_tx.send(Ok(sample_rate)).map_err(|error| error.to_string())?;

    while let Ok(control) = control_rx.recv() {
      match control {
        CaptureControl::Stop => break,
        CaptureControl::SetNoiseThreshold(value) => {
          if let Ok(mut processor) = processor.lock() {
            processor.set_noise_threshold(value);
          }
        }
        CaptureControl::MuteOutput(duration_ms) => {
          if let Ok(mut processor) = processor.lock() {
            processor.mute(duration_ms);
          }
        }
      }
    }

    drop(stream);
    Ok(())
  })();

  if let Err(error) = result {
    let _ = started_tx.send(Err(error));
  }
}

#[tauri::command]
fn start_native_capture(
  app: AppHandle,
  state: State<CaptureState>,
  device_id: Option<String>,
) -> Result<CaptureStarted, String> {
  let mut controller = state.controller.lock().map_err(|_| "Native capture state is unavailable.".to_string())?;
  stop_controller(&mut controller);

  let (control_tx, control_rx) = mpsc::channel();
  let (started_tx, started_rx) = mpsc::channel();
  let thread = thread::spawn(move || run_capture_thread(app, device_id, control_rx, started_tx));
  let sample_rate = started_rx.recv().map_err(|error| error.to_string())??;

  controller.control_tx = Some(control_tx);
  controller.thread = Some(thread);
  Ok(CaptureStarted { sample_rate })
}

#[tauri::command]
fn stop_native_capture(state: State<CaptureState>) -> Result<(), String> {
  let mut controller = state.controller.lock().map_err(|_| "Native capture state is unavailable.".to_string())?;
  stop_controller(&mut controller);
  Ok(())
}

#[tauri::command]
fn set_noise_threshold(state: State<CaptureState>, value: f32) -> Result<(), String> {
  if let Some(control_tx) = state.controller.lock().map_err(|_| "Native capture state is unavailable.".to_string())?.control_tx.as_ref() {
    let _ = control_tx.send(CaptureControl::SetNoiseThreshold(value));
  }
  Ok(())
}

#[tauri::command]
fn mute_output(state: State<CaptureState>, duration_ms: u32) -> Result<(), String> {
  if let Some(control_tx) = state.controller.lock().map_err(|_| "Native capture state is unavailable.".to_string())?.control_tx.as_ref() {
    let _ = control_tx.send(CaptureControl::MuteOutput(duration_ms));
  }
  Ok(())
}

pub fn run() {
  tauri::Builder::default()
    .manage(CaptureState::default())
    .invoke_handler(tauri::generate_handler![
      list_audio_devices,
      start_native_capture,
      stop_native_capture,
      set_noise_threshold,
      mute_output,
    ])
    .run(tauri::generate_context!())
    .expect("error while running GuitarCoach");
}
