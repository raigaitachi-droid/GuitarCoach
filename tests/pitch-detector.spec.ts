import { expect, test } from '@playwright/test';
import { MicrophonePitchDetector, PitchResult } from '../src/utils/pitchDetector';

// Exercise the actual detector with a guitar-like fundamental and overtones,
// across phases and sample rates: correlation maxima at 2T must not win.
for (const sampleRate of [44100, 48000, 96000]) {
  for (const midi of [40, 42, 45, 50, 55, 59, 64, 67, 71, 76, 79]) {
    test(`guitar fundamental MIDI ${midi} at ${sampleRate} Hz`, () => {
      const detector = new MicrophonePitchDetector();
      const frequency = 440 * 2 ** ((midi - 69) / 12);
      for (const phase of [0, 0.7, 2.1]) {
        const samples = Float32Array.from({ length: 2048 }, (_, index) => {
          const t = index / sampleRate;
          return 0.09 * (Math.sin(2 * Math.PI * frequency * t + phase)
            + 0.6 * Math.sin(4 * Math.PI * frequency * t + 0.4)
            + 0.3 * Math.sin(6 * Math.PI * frequency * t + 0.9));
        });
        const result: PitchResult | null = (detector as any).analysePitch(samples, sampleRate, 0.08, 200, false, 1, 2);
        expect(result?.midiNumber).toBe(midi);
        expect(Math.abs(result!.cents)).toBeLessThan(8);
      }
    });
  }
}
