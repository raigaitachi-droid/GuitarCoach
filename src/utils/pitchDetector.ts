// Low-latency guitar detector: AudioWorklet capture + event-driven pitch analysis.
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

  getErrorMessage(): string | null {
    return this.errorMessage;
  }

  // Voice vs guitar stability tracking
  private lastMidi = -1;
  private lastCents = 0;
  private lastPitchTimeMs = 0;

  setNoiseThreshold(threshold: number) {
    this.noiseThreshold = Math.max(0.0005, Math.min(0.05, threshold));
    this.workletNode?.port.postMessage({
      type: 'threshold',
      value: this.noiseThreshold,
    });
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

  subscribe(listener: PitchListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(result: PitchResult | null) {
    for (const listener of this.listeners) listener(result);
  }

  notifySpeakerPlayed(refractoryMs = 350) {
    this.workletNode?.port.postMessage({
      type: 'mute',
      durationMs: refractoryMs,
    });
  }

  async startListening(deviceId = ''): Promise<boolean> {
    if (this.isListening && this.audioContext?.state === 'running' && this.activeDeviceId === deviceId) return true;
    this.stopListening();
    const requestId = this.requestId;
    this.errorMessage = null;
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

      this.workletNode.port.onmessage = (event) => {
        const message = event.data;
        if (message?.type === 'level') {
          this.lastRms = message.rms;
          return;
        }
        if (message?.type !== 'samples') return;

        this.lastRms = message.rms;
        const result = this.analysePitch(
          message.samples as Float32Array,
          this.audioContext!.sampleRate,
          message.rms,
          message.audioTimeMs,
          Boolean(message.onset),
          Number(message.pluckId || 1),
          Number(message.crestFactor || 1.8)
        );
        this.latestResult = result;
        this.emit(result);
      };

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

  stopListening() {
    this.requestId += 1;
    this.isListening = false;
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
    this.latestResult = null;
    this.lastRms = 0;
    this.lastMidi = -1;
    this.lastPitchTimeMs = 0;
  }

  getIsListening(): boolean {
    return this.isListening;
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

    for (let period = minPeriod; period <= maxPeriod; period++) {
      let sumProd = 0;
      let energy1 = 0;
      let energy2 = 0;
      const length = buffer.length - period;

      for (let i = 0; i < length; i += 2) {
        const x1 = buffer[i];
        const x2 = buffer[i + period];
        sumProd += x1 * x2;
        energy1 += x1 * x1;
        energy2 += x2 * x2;
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
      !onset && isSpeechVocalRange && crestFactor < 1.72 && bestCorrelation < 0.78;
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
