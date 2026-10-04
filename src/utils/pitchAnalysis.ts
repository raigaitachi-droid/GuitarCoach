import type { PitchResult } from './pitchDetector';
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export class PitchAnalyser {
  noiseThreshold = 0.002;
  private lastMidi = -1;
  private lastCents = 0;
  private lastPitchTimeMs = 0;
  reset() { this.lastMidi = -1; this.lastCents = 0; this.lastPitchTimeMs = 0; }
  analysePitch(
    buffer: Float32Array,
    sampleRate: number,
    rms: number,
    audioTimeMs: number,
    onset: boolean,
    pluckId: number,
    crestFactor: number,
    expectedHarmonicMidi?: number
  ): PitchResult | null {
    if (rms < this.noiseThreshold) return null;

    const minPeriod = Math.floor(sampleRate / 1350);
    const maxPeriod = Math.min(
      Math.floor(sampleRate / 68),
      // At 96 kHz low E has a 1165-sample period, longer than half
      // this 2048-sample window. Keep the available overlapping samples.
      buffer.length - minPeriod
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

    // A string repeats at T, 2T, 3T... Choosing the absolute maximum can
    // report a lower octave just because a longer period fits marginally better.
    // Prefer the first strong local peak, without treating weak harmonics as T.
    for (let period = minPeriod + 1; period < bestPeriod; period++) {
      if (correlations[period] >= Math.max(minRequiredCorrelation, bestCorrelation * 0.98) &&
          correlations[period] >= correlations[period - 1] &&
          correlations[period] > correlations[period + 1]) {
        bestPeriod = period;
        bestCorrelation = correlations[period];
        break;
      }
    }

    // Residual open-string vibration can make the whole waveform repeat at
    // its lower period. Only for a marked harmonic, consider a measured peak
    // near the score's sounding pitch, backed by actual energy at that pitch.
    if (expectedHarmonicMidi !== undefined) {
      const targetHz = 440 * 2 ** ((expectedHarmonicMidi - 69) / 12);
      const ratio = 2 ** (50 / 1200);
      const low = Math.max(minPeriod + 1, Math.floor(sampleRate / (targetHz * ratio)));
      const high = Math.min(maxPeriod - 1, Math.ceil(sampleRate / (targetHz / ratio)));
      let candidate = -1;
      let candidateCorrelation = 0.8;
      for (let period = low; period <= high; period++) {
        if (correlations[period] >= candidateCorrelation && correlations[period] >= correlations[period - 1] &&
            correlations[period] > correlations[period + 1]) {
          candidate = period;
          candidateCorrelation = correlations[period];
        }
      }
      if (candidate > 0) {
        let real = 0;
        let imaginary = 0;
        let energy = 0;
        const denominator = 2 * (2 * correlations[candidate] - correlations[candidate + 1] - correlations[candidate - 1]);
        const shift = denominator === 0 ? 0 : (correlations[candidate + 1] - correlations[candidate - 1]) / denominator;
        const measuredHz = sampleRate / (candidate + (Math.abs(shift) < 1 ? shift : 0));
        const angle = 2 * Math.PI * measuredHz / sampleRate;
        for (let i = 0; i < buffer.length; i++) {
          const sample = buffer[i];
          real += sample * Math.cos(angle * i);
          imaginary += sample * Math.sin(angle * i);
          energy += sample * sample;
        }
        const targetEnergyRatio = 2 * (real * real + imaginary * imaginary) / (buffer.length * energy);
        if (targetEnergyRatio >= 0.08) {
          bestPeriod = candidate;
          bestCorrelation = candidateCorrelation;
        } else if (Math.abs(1200 * Math.log2(sampleRate / bestPeriod / targetHz)) <= 50) {
          // A higher octave also repeats at this period, but has no energy
          // at the target itself. Do not let the generic fallback award it.
          return null;
        }
      }
    }

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
