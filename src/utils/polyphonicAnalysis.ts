// Conservative, score-independent multi-pitch estimates for clean guitar input.
// A fundamental must be audible; ambiguous/missing fundamentals are omitted.
export const POLY_SAMPLE_RATE = 22050;
export const POLY_WINDOW_SIZE = 4096;
const MAX_MIDI = 88;
const MIN_MIDI = 36;

export interface PolyphonicEstimate {
  midiNumbers: number[];
  amplitudes: Float32Array;
}

export class PolyphonicAnalyser {
  private real = new Float64Array(POLY_WINDOW_SIZE);
  private imaginary = new Float64Array(POLY_WINDOW_SIZE);
  private magnitudes = new Float64Array(POLY_WINDOW_SIZE / 2);
  private window = Float64Array.from({ length: POLY_WINDOW_SIZE }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (POLY_WINDOW_SIZE - 1)));

  analyse(samples: Float32Array, noiseThreshold = 0.002): PolyphonicEstimate {
    const real = this.real;
    const imaginary = this.imaginary;
    imaginary.fill(0);
    let mean = 0;
    for (const sample of samples) mean += sample;
    mean /= samples.length || 1;
    for (let i = 0; i < POLY_WINDOW_SIZE; i++) real[i] = ((samples[i] || 0) - mean) * this.window[i];
    // In-place radix-two FFT. Buffers are reused between estimates.
    for (let i = 1, j = 0; i < POLY_WINDOW_SIZE; i++) {
      let bit = POLY_WINDOW_SIZE >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { const value = real[i]; real[i] = real[j]; real[j] = value; }
    }
    for (let length = 2; length <= POLY_WINDOW_SIZE; length <<= 1) {
      const angle = -2 * Math.PI / length;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      for (let start = 0; start < POLY_WINDOW_SIZE; start += length) {
        let wr = 1;
        let wi = 0;
        for (let offset = 0; offset < length / 2; offset++) {
          const left = start + offset;
          const right = left + length / 2;
          const tr = wr * real[right] - wi * imaginary[right];
          const ti = wr * imaginary[right] + wi * real[right];
          real[right] = real[left] - tr;
          imaginary[right] = imaginary[left] - ti;
          real[left] += tr;
          imaginary[left] += ti;
          const nextWr = wr * cos - wi * sin;
          wi = wr * sin + wi * cos;
          wr = nextWr;
        }
      }
    }
    const spectrum = this.magnitudes;
    let strongest = 0;
    for (let i = 0; i < spectrum.length; i++) {
      spectrum[i] = Math.hypot(real[i], imaginary[i]) * 4 / POLY_WINDOW_SIZE;
      if (i >= 12 && i <= 1000) strongest = Math.max(strongest, spectrum[i]);
    }
    const peaks: { frequency: number; amplitude: number; midi: number }[] = [];
    const threshold = Math.max(noiseThreshold * 1.6, strongest * 0.09);
    for (let i = 12; i < Math.min(1000, spectrum.length - 3); i++) {
      if (spectrum[i] < threshold || spectrum[i] <= spectrum[i - 1] || spectrum[i] < spectrum[i + 1]) continue;
      // Log-parabolic interpolation keeps detuned fundamentals away from the
      // wrong neighbouring semitone despite the FFT bin spacing.
      const previous = Math.log(spectrum[i - 1] + 1e-12);
      const current = Math.log(spectrum[i] + 1e-12);
      const next = Math.log(spectrum[i + 1] + 1e-12);
      const denominator = previous - 2 * current + next;
      const shift = denominator === 0 ? 0 : Math.max(-0.5, Math.min(0.5, 0.5 * (previous - next) / denominator));
      const frequency = (i + shift) * POLY_SAMPLE_RATE / POLY_WINDOW_SIZE;
      const midiExact = 69 + 12 * Math.log2(frequency / 440);
      const midi = Math.round(midiExact);
      if (midi < MIN_MIDI || midi > MAX_MIDI || Math.abs(midiExact - midi) > 0.46) continue;
      const localFloor = (spectrum[i - 3] + spectrum[i + 3]) / 2;
      if (spectrum[i] < localFloor * 4) continue;
      peaks.push({ frequency, amplitude: Math.exp(current - 0.25 * (previous - next) * shift), midi });
    }
    peaks.sort((a, b) => a.frequency - b.frequency);
    const accepted: typeof peaks = [];
    const amplitudes = new Float32Array(128);
    for (const peak of peaks) {
      const explained = accepted.some((lower) => {
        const harmonic = Math.round(peak.frequency / lower.frequency);
        if (harmonic < 2 || harmonic > 8) return false;
        const cents = Math.abs(1200 * Math.log2(peak.frequency / (lower.frequency * harmonic)));
        // Conservative octave/partial rejection. A separately played octave
        // needs energy beyond a plausible partial of the lower string.
        const separatePartial = peaks.some((upper) =>
          Math.abs(1200 * Math.log2(upper.frequency / (peak.frequency * 2))) < 32 &&
          upper.amplitude > peak.amplitude * 0.2 && accepted.every((fundamental) => {
            const upperHarmonic = Math.round(upper.frequency / fundamental.frequency);
            const upperCents = Math.abs(1200 * Math.log2(upper.frequency / (fundamental.frequency * upperHarmonic)));
            // Evidence for the upper string must not itself be explained by
            // a different lower string's overtone (common in octave chords).
            return upperHarmonic < 2 || upperHarmonic > 16 || upperCents >= 32 ||
              upper.amplitude > fundamental.amplitude * 0.7 / upperHarmonic;
          }));
        return cents < 32 && peak.amplitude <= lower.amplitude * (1.25 / harmonic) && !separatePartial;
      });
      if (!explained && !accepted.some((other) => other.midi === peak.midi)) {
        accepted.push(peak);
        amplitudes[peak.midi] = peak.amplitude;
      }
    }
    const strongestFirst = accepted.sort((a, b) => b.amplitude - a.amplitude).slice(0, 6);
    return { midiNumbers: strongestFirst.map((peak) => peak.midi).sort((a, b) => a - b), amplitudes };
  }
}

export function freshPolyphonicPitches(current: PolyphonicEstimate, baseline: Float32Array, attackStrength: number): number[] {
  return current.midiNumbers.filter((midi) => baseline[midi] === 0 ||
    (attackStrength >= 1.4 && current.amplitudes[midi] >= baseline[midi] * 1.5));
}
