// Web Audio API plucked string synthesizer (Karplus-Strong / filtered harmonic oscillator)
class GuitarAudioEngine {
  private ctx: AudioContext | null = null;

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

  playGuitarNote(stringNum: number, fret: number) {
    try {
      this.initContext();
      if (!this.ctx) return;

      const baseFreq = this.baseFrequencies[stringNum - 1] || 196.0;
      // Frequency formula: base * 2^(fret / 12)
      const frequency = baseFreq * Math.pow(2, fret / 12);

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      // Plucked guitar timbre simulation
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(frequency, now);

      // Lowpass filter closing down to simulate guitar string decay
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(3000, frequency * 5), now);
      filter.frequency.exponentialRampToValueAtTime(frequency * 0.8, now + 1.2);

      // Amplitude envelope: instant attack, exponential acoustic decay
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 1.7);
    } catch {
      // Audio autoplay policy fallback
    }
  }
}

export const guitarSynth = new GuitarAudioEngine();
