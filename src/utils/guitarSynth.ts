// Web Audio API plucked string synthesizer (Karplus-Strong / filtered harmonic oscillator)
class GuitarAudioEngine {
  private ctx: AudioContext | null = null;
  private voices = new Set<OscillatorNode>();

  resume() {
    this.initContext();
  }

  stop() {
    for (const voice of this.voices) {
      try { voice.stop(); } catch { /* Already ended. */ }
    }
    this.voices.clear();
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Standard tuning frequencies for strings 1..6: [E4, B3, G3, D3, A2, E2]
  private baseFrequencies = [329.63, 246.94, 196.00, 146.83, 110.00, 82.41];

  playGuitarNote(
    stringNum: number,
    fret: number,
    options?: { isHarmonic?: boolean; isHammerOn?: boolean; isPullOff?: boolean; expectedMidi?: number }
  ) {
    try {
      this.initContext();
      if (!this.ctx) return;

      const baseFreq = this.baseFrequencies[stringNum - 1] || 196.0;
      // Frequency formula: base * 2^(fret / 12)
      let frequency = baseFreq * Math.pow(2, fret / 12);
      if (options?.isHarmonic) {
        if (fret === 12) frequency = baseFreq * 2;
        else if (fret === 7 || fret === 19) frequency = baseFreq * 3;
        else if (fret === 5) frequency = baseFreq * 4;
      }
      if (options?.expectedMidi !== undefined) frequency = 440 * Math.pow(2, (options.expectedMidi - 69) / 12);

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      this.voices.add(osc);
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      const isLegato = Boolean(options?.isHammerOn || options?.isPullOff);

      // Plucked guitar vs legato timbre simulation
      osc.type = options?.isHarmonic ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(frequency, now);

      // Lowpass filter closing down to simulate guitar string decay
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(
        options?.isHarmonic ? Math.min(5000, frequency * 4) : isLegato ? Math.min(2400, frequency * 3.5) : Math.min(3200, frequency * 5),
        now
      );
      filter.frequency.exponentialRampToValueAtTime(frequency * 0.8, now + 1.2);

      // Amplitude envelope: instant attack for pick, soft ramp for hammer-on/pull-off
      gain.gain.setValueAtTime(0.001, now);
      const attackTime = isLegato ? 0.038 : 0.015;
      const attackLevel = isLegato ? 0.30 : options?.isHarmonic ? 0.40 : 0.35;
      gain.gain.linearRampToValueAtTime(attackLevel, now + attackTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (options?.isHarmonic ? 2.1 : 1.6));

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      osc.onended = () => {
        this.voices.delete(osc);
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      };

      osc.start(now);
      osc.stop(now + 1.8);
    } catch {
      // Audio autoplay policy fallback
    }
  }
}

export const guitarSynth = new GuitarAudioEngine();
