// Real-time Web Audio Pitch Detector using Normalized Autocorrelation (McLeod / YIN)
export interface PitchResult {
  frequency: number;
  noteName: string;
  midiNumber: number;
  cents: number;
  volumeRms: number;
  inTune: boolean;
  stringIndex?: number;
  fret?: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export class MicrophonePitchDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private buffer: Float32Array = new Float32Array(2048);
  private isListening = false;
  // Guitar-friendly noise threshold: 0.005 lets acoustic & unplugged electric plucks register cleanly
  private noiseThreshold = 0.005;
  private speakerMuteUntil = 0;
  private lastRms = 0;

  setNoiseThreshold(threshold: number) {
    this.noiseThreshold = Math.max(0.001, Math.min(0.05, threshold));
  }

  getNoiseThreshold(): number {
    return this.noiseThreshold;
  }

  getVolumeRms(): number {
    return this.lastRms;
  }

  // Prevent speaker-to-microphone acoustic feedback loops
  notifySpeakerPlayed(refractoryMs = 350) {
    this.speakerMuteUntil = Date.now() + refractoryMs;
  }

  async startListening(): Promise<boolean> {
    try {
      if (this.isListening && this.audioContext && this.audioContext.state === 'running') {
        return true;
      }

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // CRITICAL FOR MUSICAL INSTRUMENTS:
      // Voice filters (echoCancellation, noiseSuppression) distort guitar harmonics and mute plucks!
      // Raw audio delivers the true musical acoustic waveform into Web Audio.
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            latency: 0,
          } as MediaTrackConstraints,
        });
      } catch {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.2;
      this.sourceNode.connect(this.analyser);
      this.buffer = new Float32Array(this.analyser.fftSize);
      this.isListening = true;
      return true;
    } catch (err) {
      console.warn('Microphone access denied or unavailable:', err);
      this.isListening = false;
      return false;
    }
  }

  stopListening() {
    this.isListening = false;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  getIsListening(): boolean {
    return this.isListening;
  }

  detectPitch(): PitchResult | null {
    if (!this.isListening || !this.analyser || !this.audioContext) {
      return null;
    }

    // Ignore audio if speaker sound was recently played (prevents feedback loops)
    if (Date.now() < this.speakerMuteUntil) {
      return null;
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    this.analyser.getFloatTimeDomainData(this.buffer as unknown as Float32Array<ArrayBuffer>);

    // Compute RMS signal volume
    let sumSquares = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const val = this.buffer[i];
      sumSquares += val * val;
    }
    const rms = Math.sqrt(sumSquares / this.buffer.length);
    this.lastRms = rms;

    // Filter silence and background room hum
    if (rms < this.noiseThreshold) {
      return null;
    }

    const sampleRate = this.audioContext.sampleRate;
    const minPeriod = Math.floor(sampleRate / 1350); // Up to ~1350 Hz (high guitar frets)
    const maxPeriod = Math.floor(sampleRate / 68);   // Down to ~68 Hz (Low E, Drop D, Low C)

    // Normalized Autocorrelation with step optimization
    let bestCorrelation = 0;
    let bestPeriod = -1;

    for (let period = minPeriod; period <= maxPeriod; period++) {
      let sumProd = 0;
      let energy1 = 0;
      let energy2 = 0;
      const len = this.buffer.length - period;

      for (let i = 0; i < len; i += 2) {
        const x1 = this.buffer[i];
        const x2 = this.buffer[i + period];
        sumProd += x1 * x2;
        energy1 += x1 * x1;
        energy2 += x2 * x2;
      }

      const denominator = Math.sqrt(energy1 * energy2);
      const normCorrelation = denominator > 0 ? sumProd / denominator : 0;

      if (normCorrelation > bestCorrelation) {
        bestCorrelation = normCorrelation;
        bestPeriod = period;
      }
    }

    // Correlation threshold: 0.48 reliably captures guitar plucks while rejecting random hiss
    if (bestPeriod === -1 || bestCorrelation < 0.48) {
      return null;
    }

    // Parabolic interpolation around peak for micro-tuning cents accuracy
    let adjustedPeriod = bestPeriod;
    if (bestPeriod > minPeriod && bestPeriod < maxPeriod) {
      const cPrev = this.getNormalizedCorrelation(bestPeriod - 1);
      const cCurr = bestCorrelation;
      const cNext = this.getNormalizedCorrelation(bestPeriod + 1);
      const denom = 2 * (2 * cCurr - cNext - cPrev);
      if (denom !== 0) {
        const shift = (cNext - cPrev) / denom;
        if (Math.abs(shift) < 1) {
          adjustedPeriod += shift;
        }
      }
    }

    const frequency = sampleRate / adjustedPeriod;
    if (frequency < 65 || frequency > 1400) {
      return null;
    }

    // Convert frequency to MIDI number: 69 + 12 * log2(freq / 440)
    const midiExact = 69 + 12 * Math.log2(frequency / 440);
    const midiRound = Math.round(midiExact);
    const cents = Math.round((midiExact - midiRound) * 100);

    const noteIndex = ((midiRound % 12) + 12) % 12;
    const octave = Math.floor(midiRound / 12) - 1;
    const noteName = `${NOTE_NAMES[noteIndex]}${octave}`;

    return {
      frequency,
      noteName,
      midiNumber: midiRound,
      cents,
      volumeRms: rms,
      inTune: Math.abs(cents) <= 20,
    };
  }

  private getNormalizedCorrelation(period: number): number {
    let sumProd = 0;
    let energy1 = 0;
    let energy2 = 0;
    const len = this.buffer.length - period;
    for (let i = 0; i < len; i++) {
      const x1 = this.buffer[i];
      const x2 = this.buffer[i + period];
      sumProd += x1 * x2;
      energy1 += x1 * x1;
      energy2 += x2 * x2;
    }
    const denom = Math.sqrt(energy1 * energy2);
    return denom > 0 ? sumProd / denom : 0;
  }
}

export const micDetector = new MicrophonePitchDetector();
