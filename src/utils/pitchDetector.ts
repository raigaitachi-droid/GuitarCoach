// Low-latency guitar detector: AudioWorklet capture + event-driven pitch analysis.
import { PitchAnalyser } from './pitchAnalysis';
import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
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
  monoReady?: boolean;
  pluckId?: number;
  attackStrength?: number;
  attackAgeMs?: number;
  audioTimeMs?: number;
}

interface NativeCaptureStarted {
  sampleRate: number;
}

export interface PitchAnalysisPacket extends CaptureMessage {
  samples: Float32Array;
  sampleRate: number;
  epoch: number;
  noiseThreshold: number;
  audioTimeMs: number;
  onset: boolean;
  pluckId: number;
  crestFactor: number;
  expectedHarmonicMidi?: number;
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
  /** Windowed energy increase at the physical attack; retained for its samples. */
  attackStrength?: number;
  attackAgeMs?: number;
  crestFactor?: number;
  confidence: number;
  isVoiceLike?: boolean;
  stringIndex?: number;
  fret?: number;
  /** Audible chord tones; fresh tones exclude the preceding ringing baseline. */
  polyphonicMidiNumbers?: number[];
  polyphonicFreshMidiNumbers?: number[];
  polyphonicAttackAudioTimeMs?: number;
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
  private polyphonicEpoch = 0;
  private polyphonicEnabled = false;
  private pitchWorker: Worker | null = null;
  private analysisEpoch = 0;
  private analysisBusy = false;
  private pendingAnalysis: PitchAnalysisPacket | null = null;
  private polyphonicError: string | null = null;
  private nativeCapture = false;
  private nativeSampleRate = 48000;
  private nativeUnlisteners: UnlistenFn[] = [];
  private expectedString: number | null = null;
  private expectedHarmonicMidi: number | undefined;

  getErrorMessage(): string | null {
    return this.errorMessage;
  }

  // Voice vs guitar stability tracking
  private pitchAnalyser = new PitchAnalyser();

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

  setExpectedHarmonicMidi(midi: number | null) {
    this.expectedHarmonicMidi = midi !== null && Number.isInteger(midi) && midi >= 36 && midi <= 96 ? midi : undefined;
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
    this.pitchAnalyser.reset();
    this.analysisEpoch++;
    this.pendingAnalysis = null;
    this.pitchWorker?.postMessage({ type: 'reset' });
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

      this.startPitchWorker();
      this.workletNode.port.onmessage = (event) => this.handleCaptureMessage(event.data, this.audioContext!.sampleRate);

      this.startPolyphonicRecognition();

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
      this.startPitchWorker();
      // Channels use Tauri's ordered streaming IPC. Events serialise their
      // payload as JSON and are reserved below for the small level/onset data.
      const samplesChannel = new Channel<Omit<CaptureMessage, 'type'> & { samples: number[] }>();
      samplesChannel.onmessage = (payload) => this.handleCaptureMessage({
        type: 'samples', ...payload,
      }, this.nativeSampleRate);
      this.nativeUnlisteners = await Promise.all([
        listen<{ rms: number }>('pitch:level', ({ payload }) => this.handleCaptureMessage({ type: 'level', rms: payload.rms }, this.nativeSampleRate)),
        listen<{ rms: number; audioTimeMs: number }>('pitch:onset', ({ payload }) => this.handleCaptureMessage({
          type: 'ONSET_TRIGGERED', rms: payload.rms, audioTimeMs: payload.audioTimeMs,
        }, this.nativeSampleRate)),
      ]);
      const started = await invoke<NativeCaptureStarted>('start_native_capture', {
        deviceId: deviceId || null,
        samplesChannel,
      });
      this.nativeSampleRate = started.sampleRate;
      this.nativeCapture = true;
      this.startPolyphonicRecognition();
      void invoke('set_expected_string', { stringNumber: this.expectedString }).catch(() => undefined);
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
    // the overlap for the separate realtime polyphonic worker.
    if (this.polyphonicWorker) {
      const polyphonicSamples = samples.slice();
      this.polyphonicWorker.postMessage({
        type: 'samples',
        samples: polyphonicSamples,
        hopSamples: polyphonicSamples.length / 2,
        sampleRate,
        audioTimeMs: message.audioTimeMs || 0,
        requestedAtMs: performance.now(),
        onset: Boolean(message.onset),
        pluckId: Number(message.pluckId || 1),
        attackStrength: Number(message.attackStrength || 0),
        attackAgeMs: message.attackAgeMs,
        noiseThreshold: this.noiseThreshold,
        epoch: this.polyphonicEpoch,
      }, [polyphonicSamples.buffer]);
    }
    // Polyphony needs contiguous audio even during attacks/strums. Mono keeps
    // its old clean-window gate so a prior ringing tone cannot win the pick.
    if (message.monoReady === false) return;
    if (this.pitchWorker) {
      const packet: PitchAnalysisPacket = { ...message, samples, sampleRate, epoch: this.analysisEpoch,
        noiseThreshold: this.noiseThreshold, audioTimeMs: message.audioTimeMs || 0,
        expectedHarmonicMidi: this.expectedHarmonicMidi,
        onset: Boolean(message.onset), pluckId: Number(message.pluckId || 1),
        crestFactor: Number(message.crestFactor || 1.8) };
      if (this.analysisBusy) {
        // Keep at most one newest window, retaining its attack flag. Slow
        // hardware must not accumulate a queue of obsolete audio estimates.
        if (this.pendingAnalysis?.pluckId === packet.pluckId) packet.onset ||= this.pendingAnalysis.onset;
        this.pendingAnalysis = packet;
      } else this.dispatchPitchAnalysis(packet);
      return;
    }
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
    if (result) result.attackStrength = message.attackStrength;
    if (result) result.attackAgeMs = message.attackAgeMs;
    this.emit(result);
  }

  private clearNativeListeners() {
    for (const unlisten of this.nativeUnlisteners) unlisten();
    this.nativeUnlisteners = [];
  }

  stopListening() {
    this.requestId += 1;
    this.isListening = false;
    this.expectedHarmonicMidi = undefined;
    this.pitchWorker?.terminate();
    this.pitchWorker = null;
    this.analysisBusy = false;
    this.pendingAnalysis = null;
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
    this.polyphonicEnabled = false;
    this.polyphonicError = null;
  }

  getIsListening(): boolean {
    return this.isListening;
  }

  private startPolyphonicRecognition() {
    if (!this.polyphonicEnabled) return;
    this.polyphonicWorker?.terminate();
    this.polyphonicError = null;
    this.polyphonicEpoch++;
    this.polyphonicWorker = new Worker(new URL('../workers/polyphonicPitchWorker.ts', import.meta.url), { type: 'module' });
    this.polyphonicWorker.onmessage = (event: MessageEvent<{ type: string; epoch?: number; midiNumbers?: number[]; freshMidiNumbers?: number[]; attackAudioTimeMs?: number; pluckId?: number; message?: string; audioTimeMs?: number; requestedAtMs?: number; workerDurationMs?: number }>) => {
      if (event.data.epoch !== this.polyphonicEpoch) return;
      if (event.data.type === 'error') {
        this.polyphonicError = event.data.message || 'Chord recognition could not start.';
        this.emit({
          frequency: 0, noteName: '', midiNumber: 0, cents: 0, volumeRms: this.lastRms,
          inTune: false, audioTimeMs: 0, onset: false, pluckId: 0, confidence: 0,
          polyphonicError: this.polyphonicError,
        });
        return;
      }
      if (event.data.type !== 'polyphonic' || event.data.epoch !== this.polyphonicEpoch || !event.data.midiNumbers?.length) return;
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
        pluckId: event.data.pluckId || 0,
        confidence: 1,
        polyphonicMidiNumbers: event.data.midiNumbers,
        polyphonicFreshMidiNumbers: event.data.freshMidiNumbers,
        polyphonicAttackAudioTimeMs: event.data.attackAudioTimeMs,
        polyphonicWorkerMs: event.data.workerDurationMs,
        polyphonicRoundTripMs: event.data.requestedAtMs === undefined
          ? undefined
          : performance.now() - event.data.requestedAtMs,
      };
      this.emit(result);
    };
    this.polyphonicWorker.onerror = () => {
      this.polyphonicWorker?.terminate();
      this.polyphonicWorker = null;
      this.polyphonicError = 'Chord recognition is unavailable. Try reconnecting your input.';
      this.emit({ frequency: 0, noteName: '', midiNumber: 0, cents: 0, volumeRms: this.lastRms,
        inTune: false, audioTimeMs: 0, onset: false, pluckId: 0, confidence: 0,
        polyphonicError: this.polyphonicError });
    };
  }

  beginPolyphonicAttack(audioTimeMs: number) {
    this.polyphonicWorker?.postMessage({ type: 'begin_attack', audioTimeMs, epoch: this.polyphonicEpoch });
  }

  finishPolyphonicAttack(audioTimeMs: number) {
    this.polyphonicWorker?.postMessage({ type: 'finish_attack', audioTimeMs, epoch: this.polyphonicEpoch });
  }

  clearPolyphonicHistory() {
    this.polyphonicEpoch++;
    this.polyphonicWorker?.postMessage({ type: 'reset', epoch: this.polyphonicEpoch });
  }

  setPolyphonicEnabled(enabled: boolean) {
    if (enabled === this.polyphonicEnabled) return;
    this.polyphonicEnabled = enabled;
    if (enabled && this.isListening) this.startPolyphonicRecognition();
    else if (!enabled) {
      this.polyphonicWorker?.terminate();
      this.polyphonicWorker = null;
      this.polyphonicError = null;
    }
  }

  // Kept for compatibility with tuner code; event subscribers are preferred.
  detectPitch(): PitchResult | null {
    const result = this.latestResult;
    this.latestResult = null;
    return result;
  }

  private analysePitch(buffer: Float32Array, sampleRate: number, rms: number, audioTimeMs: number, onset: boolean, pluckId: number, crestFactor: number): PitchResult | null {
    this.pitchAnalyser.noiseThreshold = this.noiseThreshold;
    return this.pitchAnalyser.analysePitch(buffer, sampleRate, rms, audioTimeMs, onset, pluckId, crestFactor, this.expectedHarmonicMidi);
  }

  private startPitchWorker() {
    this.pitchWorker?.terminate();
    this.analysisBusy = false;
    this.pendingAnalysis = null;
    try {
      const worker = new Worker(new URL('../workers/monoPitchWorker.ts', import.meta.url), { type: 'module' });
      this.pitchWorker = worker;
      worker.onmessage = (event: MessageEvent<{ epoch: number; result: PitchResult | null }>) => {
        if (this.pitchWorker !== worker) return;
        this.analysisBusy = false;
        if (this.isListening && event.data.epoch === this.analysisEpoch) {
          this.latestResult = event.data.result;
          this.emit(event.data.result);
        }
        const pending = this.pendingAnalysis;
        this.pendingAnalysis = null;
        if (pending && this.isListening && pending.epoch === this.analysisEpoch) this.dispatchPitchAnalysis(pending);
      };
      worker.onerror = () => {
        worker.terminate();
        if (this.pitchWorker === worker) {
          this.pitchWorker = null;
          this.analysisBusy = false;
          this.pendingAnalysis = null;
        }
      };
    } catch {
      // Preserve input on browsers where workers cannot start.
      this.pitchWorker = null;
    }
  }

  private dispatchPitchAnalysis(packet: PitchAnalysisPacket) {
    this.analysisBusy = true;
    this.pitchWorker!.postMessage(packet, [packet.samples.buffer]);
  }
}

export const micDetector = new MicrophonePitchDetector();
