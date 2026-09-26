// Low-latency guitar detector: AudioWorklet capture + event-driven pitch analysis.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

interface CaptureMessage {
  type: 'level' | 'ONSET_TRIGGERED' | 'samples';
  rms: number;
  samples?: Float32Array | number[];
  peak?: number;
  crestFactor?: number;
  onset?: boolean;
  pluckId?: number;
  audioTimeMs?: number;
}

interface NativeCaptureStarted {
  sampleRate: number;
}

export interface PitchResult {
  frequency: number;
  noteName: string;
  midiNumber: number;
  cents: number;
  volumeRms: number;
  inTune: boolean;
  audioTimeMs: number;
  onset: boolean;
  pluckId: number;
  crestFactor?: number;
  confidence: number;
  isVoiceLike?: boolean;
  stringIndex?: number;
  fret?: number;
  /** Experimental Basic Pitch preview; never used to award a score yet. */
  polyphonicMidiNumbers?: number[];
  polyphonicWorkerMs?: number;
  polyphonicRoundTripMs?: number;
  polyphonicError?: string;
  /** Fast RMS attack marker; it intentionally has no pitch estimate yet. */
  quickOnset?: boolean;
}

type PitchListener = (result: PitchResult | null) => void;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export class MicrophonePitchDetector {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private silentGain: GainNode | null = null;
  private isListening = false;
  // USB interfaces often expose a much quieter DI signal than a laptop mic.
  // The score-aware matcher below still guards against accepting room noise.
  private noiseThreshold = 0.002;
  private lastRms = 0;
  private latestResult: PitchResult | null = null;
  private listeners = new Set<PitchListener>();
  private estimatedInputLatencyMs = 0;
  private activeDeviceId = '';
  private requestId = 0;
  private errorMessage: string | null = null;
  private polyphonicWorker: Worker | null = null;
  private polyphonicError: string | null = null;
  private nativeCapture = false;
  private nativeSampleRate = 48000;
  private nativeUnlisteners: UnlistenFn[] = [];

  getErrorMessage(): string | null {
    return this.errorMessage;
  }

  // Voice vs guitar stability tracking
  private lastMidi = -1;
  private lastCents = 0;
  private lastPitchTimeMs = 0;

  setNoiseThreshold(threshold: number) {
    this.noiseThreshold = Math.max(0.0005, Math.min(0.05, threshold));
    if (this.nativeCapture) {
      void invoke('set_noise_threshold', { value: this.noiseThreshold }).catch(() => undefined);
      return;
    }
    this.workletNode?.port.postMessage({
      type: 'threshold',
      value: this.noiseThreshold,
    });
  }

  setExpectedString(stringNumber: number | null) {
    const normalized = Number.isInteger(stringNumber) && stringNumber! >= 1 && stringNumber! <= 6
      ? stringNumber
      : null;
    if (normalized === this.expectedString) return;
    this.expectedString = normalized;
    if (this.nativeCapture) {
      void invoke('set_expected_string', { stringNumber: normalized }).catch(() => undefined);
      return;
    }
    this.workletNode?.port.postMessage({ type: 'expected-string', value: normalized });
  }

  getNoiseThreshold(): number {
    return this.noiseThreshold;
  }

  getVolumeRms(): number {
    return this.lastRms;
  }

  getEstimatedInputLatencyMs(): number {
    return this.estimatedInputLatencyMs;
  }

  clearPitchHistory() {
    this.latestResult = null;
    this.lastMidi = -1;
    this.lastCents = 0;
    this.lastPitchTimeMs = 0;
  }

  subscribe(listener: PitchListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(result: PitchResult | null) {
    for (const listener of this.listeners) listener(result);
  }

  notifySpeakerPlayed(refractoryMs = 350) {
    if (this.nativeCapture) {
      void invoke('mute_output', { durationMs: refractoryMs }).catch(() => undefined);
      return;
    }
    this.workletNode?.port.postMessage({
      type: 'mute',
      durationMs: refractoryMs,
    });
  }

  isNativeCaptureAvailable(): boolean {
    return isTauri();
  }

  async listInputDevices(): Promise<AudioInputDevice[]> {
    if (isTauri()) {
      const devices = await invoke<Array<{ id: string; label: string }>>('list_audio_devices');
      return devices.map((device) => ({ deviceId: device.id, label: device.label }));
    }
    const available = await navigator.mediaDevices?.enumerateDevices();
    return (available || [])
      .filter((device) => device.kind === 'audioinput')
      .map((device) => ({ deviceId: device.deviceId, label: device.label }));
  }

  async startListening(deviceId = ''): Promise<boolean> {
    if (this.isListening && this.activeDeviceId === deviceId && (this.nativeCapture || this.audioContext?.state === 'running')) return true;
    this.stopListening();
    const requestId = this.requestId;
    this.errorMessage = null;
    if (isTauri()) return this.startNativeListening(deviceId, requestId);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('unsupported');
      }

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      this.audioContext = new AudioCtx({
        latencyHint: 'interactive',
      });

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      if (requestId !== this.requestId) return false;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
            sampleRate: { ideal: 48000 },
            latency: { ideal: 0.01 },
          } as MediaTrackConstraints,
        });
      } catch (error) {
        // Only relax optional constraints; never silently switch a selected input.
        if ((error as DOMException).name !== 'OverconstrainedError') throw error;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        });
      }
      if (requestId !== this.requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      this.mediaStream = stream;

      await this.audioContext.audioWorklet.addModule(
        `${import.meta.env.BASE_URL}pitch-worklet.js`
      );
      if (requestId !== this.requestId) return false;

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        'guitar-pitch-processor',
        {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          processorOptions: { noiseThreshold: this.noiseThreshold },
        }
      );
      this.workletNode.port.postMessage({ type: 'expected-string', value: this.expectedString });

      // Keep the worklet graph alive without feeding microphone audio to speakers.
      this.silentGain = this.audioContext.createGain();
      this.silentGain.gain.value = 0;
      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.silentGain);
      this.silentGain.connect(this.audioContext.destination);

      const trackLatency =
        (this.mediaStream.getAudioTracks()[0]?.getSettings() as { latency?: number } | undefined)?.latency || 0;
      this.estimatedInputLatencyMs = Math.round(
        (trackLatency + (this.audioContext.baseLatency || 0)) * 1000
      );

      this.workletNode.port.onmessage = (event) => this.handleCaptureMessage(event.data, this.audioContext!.sampleRate);

      this.startPolyphonicPreview();

      this.isListening = true;
      this.activeDeviceId = deviceId;
      this.mediaStream.getAudioTracks()[0]?.addEventListener('ended', () => {
        if (requestId !== this.requestId) return;
        this.errorMessage = 'Your guitar input disconnected. Check the cable and try again.';
        this.stopListening();
        this.emit(null);
      });
      return true;
    } catch (error) {
      if (requestId !== this.requestId) return false;
      const name = (error as DOMException).name;
      this.errorMessage = name === 'NotAllowedError'
        ? 'Allow microphone access in your browser, then try again.'
        : name === 'NotFoundError' || name === 'OverconstrainedError'
        ? 'We can’t find that guitar input. Connect your device and try again.'
        : !navigator.mediaDevices?.getUserMedia
        ? 'Audio input needs HTTPS and a supported browser. Open GuitarCoach in Chrome or Edge.'
        : 'We can’t hear your guitar. Check your input device and try again.';
      this.stopListening();
      return false;
    }
  }

  private async startNativeListening(deviceId: string, requestId: number): Promise<boolean> {
    try {
      this.nativeUnlisteners = await Promise.all([
        listen<{ rms: number }>('pitch:level', ({ payload }) => this.handleCaptureMessage({ type: 'level', rms: payload.rms }, this.nativeSampleRate)),
        listen<{ rms: number; audioTimeMs: number }>('pitch:onset', ({ payload }) => this.handleCaptureMessage({
          type: 'ONSET_TRIGGERED', rms: payload.rms, audioTimeMs: payload.audioTimeMs,
        }, this.nativeSampleRate)),
        listen<Omit<CaptureMessage, 'type'> & { samples: number[] }>('pitch:samples', ({ payload }) => this.handleCaptureMessage({
          type: 'samples', ...payload,
        }, this.nativeSampleRate)),
      ]);
      const started = await invoke<NativeCaptureStarted>('start_native_capture', { deviceId: deviceId || null });
      this.nativeSampleRate = started.sampleRate;
      this.nativeCapture = true;
      void invoke('set_expected_string', { stringNumber: this.expectedString }).catch(() => undefined);
      this.startPolyphonicPreview();
      if (requestId !== this.requestId) {
        this.stopListening();
        return false;
      }
      this.estimatedInputLatencyMs = 0;
      this.isListening = true;
      this.activeDeviceId = deviceId;
      return true;
    } catch (error) {
      this.clearNativeListeners();
      this.errorMessage = error instanceof Error
        ? error.message
        : typeof error === 'string'
        ? error
        : 'We can’t open that native audio input.';
      this.stopListening();
      return false;
    }
  }

  private handleCaptureMessage(message: CaptureMessage, sampleRate: number) {
    if (message?.type === 'level') {
      this.lastRms = message.rms;
      return;
    }
    if (message?.type === 'ONSET_TRIGGERED') {
      this.lastRms = message.rms;
      this.emit({
        frequency: 0, noteName: '', midiNumber: 0, cents: 0, volumeRms: message.rms,
        inTune: false, audioTimeMs: message.audioTimeMs || 0, onset: false, pluckId: 0,
        confidence: 0, quickOnset: true,
      });
      return;
    }
    if (message?.type !== 'samples' || !message.samples) return;

    this.lastRms = message.rms;
    const samples = message.samples instanceof Float32Array
      ? message.samples
      : Float32Array.from(message.samples);
    // The worklet emits a 2048-sample window every 1024 samples. Preserve
    // the overlap for the optional browser-only polyphonic preview.
    const polyphonicSamples = samples.slice();
    this.polyphonicWorker?.postMessage({
      type: 'samples',
      samples: polyphonicSamples,
      hopSamples: polyphonicSamples.length / 2,
      sampleRate,
      audioTimeMs: message.audioTimeMs || 0,
      requestedAtMs: performance.now(),
    }, [polyphonicSamples.buffer]);
    const result = this.analysePitch(
      samples,
      sampleRate,
      message.rms,
      message.audioTimeMs || 0,
      Boolean(message.onset),
      Number(message.pluckId || 1),
      Number(message.crestFactor || 1.8)
    );
    this.latestResult = result;
    this.emit(result);
  }

  private clearNativeListeners() {
    for (const unlisten of this.nativeUnlisteners) unlisten();
    this.nativeUnlisteners = [];
  }

  stopListening() {
    this.requestId += 1;
    this.isListening = false;
    if (this.nativeCapture) void invoke('stop_native_capture').catch(() => undefined);
    this.nativeCapture = false;
    this.clearNativeListeners();
    if (this.workletNode) this.workletNode.port.onmessage = null;
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();
    this.silentGain?.disconnect();
    this.workletNode = null;
    this.sourceNode = null;
    this.silentGain = null;

    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;

    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close();
    }
    this.audioContext = null;
    this.clearPitchHistory();
    this.lastRms = 0;
    this.polyphonicWorker?.terminate();
    this.polyphonicWorker = null;
    this.polyphonicError = null;
  }

  getIsListening(): boolean {
    return this.isListening;
  }

  private startPolyphonicPreview() {
    this.polyphonicWorker?.terminate();
    this.polyphonicError = null;
    this.polyphonicWorker = new Worker(new URL('../workers/polyphonicPitchWorker.ts', import.meta.url), { type: 'module' });
    this.polyphonicWorker.onmessage = (event: MessageEvent<{ type: string; midiNumbers?: number[]; message?: string; audioTimeMs?: number; requestedAtMs?: number; workerDurationMs?: number }>) => {
      if (event.data.type === 'error') {
        this.polyphonicError = event.data.message || 'Polyphonic preview could not start.';
        this.emit({
          frequency: 0, noteName: '', midiNumber: 0, cents: 0, volumeRms: this.lastRms,
          inTune: false, audioTimeMs: 0, onset: false, pluckId: 0, confidence: 0,
          polyphonicError: this.polyphonicError,
        });
        return;
      }
      if (event.data.type !== 'polyphonic' || !event.data.midiNumbers?.length) return;
      const midiNumber = event.data.midiNumbers[0];
      const noteIndex = ((midiNumber % 12) + 12) % 12;
      const octave = Math.floor(midiNumber / 12) - 1;
      const result: PitchResult = {
        frequency: 440 * Math.pow(2, (midiNumber - 69) / 12),
        noteName: `${NOTE_NAMES[noteIndex]}${octave}`,
        midiNumber,
        cents: 0,
        volumeRms: this.lastRms,
        inTune: true,
        audioTimeMs: event.data.audioTimeMs || 0,
        onset: false,
        pluckId: 0,
        confidence: 1,
        polyphonicMidiNumbers: event.data.midiNumbers,
        polyphonicWorkerMs: event.data.workerDurationMs,
        polyphonicRoundTripMs: event.data.requestedAtMs === undefined
          ? undefined
          : performance.now() - event.data.requestedAtMs,
      };
      this.emit(result);
    };
    const modelUrl = new URL(`${import.meta.env.BASE_URL}basic-pitch/model.json`, window.location.href).href;
    this.polyphonicWorker.postMessage({ type: 'init', modelUrl });
  }

  // Kept for compatibility with tuner code; event subscribers are preferred.
  detectPitch(): PitchResult | null {
    const result = this.latestResult;
    this.latestResult = null;
    return result;
  }

  private analysePitch(
    buffer: Float32Array,
    sampleRate: number,
    rms: number,
    audioTimeMs: number,
    onset: boolean,
    pluckId: number,
    crestFactor: number
  ): PitchResult | null {
    if (rms < this.noiseThreshold) return null;

    const minPeriod = Math.floor(sampleRate / 1350);
    const maxPeriod = Math.min(
      Math.floor(sampleRate / 68),
      Math.floor(buffer.length / 2)
    );

    let bestCorrelation = 0;
    let bestPeriod = -1;
    const correlations = new Float32Array(maxPeriod + 2);
    const windowLength = buffer.length;

    for (let period = minPeriod; period <= maxPeriod; period++) {
      let sumProd = 0;
      let energy1 = 0;
      let energy2 = 0;
      const length = buffer.length - period;

      for (let i = 0; i < length; i += 2) {
        const x1 = buffer[i];
        const x2 = buffer[i + period];
        // Prefer recent samples after a re-pluck without starving low notes
        // of the period history needed for a stable correlation.
        const weight = onset ? 0.15 + 0.85 * (i / (windowLength - 1)) : 1;
        sumProd += weight * x1 * x2;
        energy1 += weight * x1 * x1;
        energy2 += weight * x2 * x2;
      }

      const denominator = Math.sqrt(energy1 * energy2);
      const correlation = denominator > 0 ? sumProd / denominator : 0;
      correlations[period] = correlation;

      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestPeriod = period;
      }
    }

    // Require clean periodicity. Spoken room noise and low-clarity chatter are filtered here.
    // The first 40–80 ms of a guitar note has a noisy pick transient. Keep a
    // usable pitch candidate through that transient; PlayingStage only accepts
    // it when it matches the note currently due in the tab.
    const minRequiredCorrelation = onset ? 0.50 : 0.56;
    if (bestPeriod < 0 || bestCorrelation < minRequiredCorrelation) return null;

    let adjustedPeriod = bestPeriod;
    if (bestPeriod > minPeriod && bestPeriod < maxPeriod) {
      const previous = correlations[bestPeriod - 1];
      const current = correlations[bestPeriod];
      const next = correlations[bestPeriod + 1];
      const denominator = 2 * (2 * current - next - previous);
      if (denominator !== 0) {
        const shift = (next - previous) / denominator;
        if (Math.abs(shift) < 1) adjustedPeriod += shift;
      }
    }

    const frequency = sampleRate / adjustedPeriod;
    if (frequency < 65 || frequency > 1400) return null;

    const midiExact = 69 + 12 * Math.log2(frequency / 440);
    const midiNumber = Math.round(midiExact);
    const cents = Math.round((midiExact - midiNumber) * 100);
    const noteIndex = ((midiNumber % 12) + 12) % 12;
    const octave = Math.floor(midiNumber / 12) - 1;

    // Detect Voice vs Guitar:
    // A guitar string fundamental is fixed by fret and tension (cents jitter is small: < 15c).
    // Human speech has continuous vocal glide/inflection (jitter > 26c within 50ms) and low crest factor (smooth vowels).
    const timeDeltaMs = audioTimeMs - this.lastPitchTimeMs;
    const centsJitter =
      this.lastMidi === midiNumber && timeDeltaMs > 8 && timeDeltaMs < 80
        ? Math.abs(cents - this.lastCents)
        : 0;

    const isSpeechVocalRange = frequency >= 85 && frequency <= 250;
    const isSpeechLikeVowel =
      !onset && isSpeechVocalRange && crestFactor < 1.45 && bestCorrelation < 0.62;
    const isVocalJitter = !onset && centsJitter > 26;

    const isVoiceLike = Boolean(!onset && (isSpeechLikeVowel || isVocalJitter));

    this.lastMidi = midiNumber;
    this.lastCents = cents;
    this.lastPitchTimeMs = audioTimeMs;

    return {
      frequency,
      noteName: `${NOTE_NAMES[noteIndex]}${octave}`,
      midiNumber,
      cents,
      volumeRms: rms,
      inTune: Math.abs(cents) <= 20,
      audioTimeMs,
      onset,
      pluckId,
      crestFactor,
      confidence: bestCorrelation,
      isVoiceLike,
    };
  }
}

export const micDetector = new MicrophonePitchDetector();
