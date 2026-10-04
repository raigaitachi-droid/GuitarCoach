import { expect, test } from '@playwright/test';
import { MicrophonePitchDetector, PitchResult } from '../src/utils/pitchDetector';
import { PitchAnalyser } from '../src/utils/pitchAnalysis';

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

for (const sampleRate of [44100, 48000, 96000]) {
  for (const openMidi of [59, 55]) {
    test(`7th-fret harmonic with residual open string ${openMidi} at ${sampleRate} Hz`, () => {
      const open = 440 * 2 ** ((openMidi - 69) / 12);
      for (const residual of [0.2, 0.3, 0.4]) {
        for (const detune of [-35, 0, 35]) {
          const frequency = open * 3 * 2 ** (detune / 1200);
          const samples = Float32Array.from({ length: 2048 }, (_, i) => 0.08 * (
            Math.sin(2 * Math.PI * frequency * i / sampleRate) +
            0.45 * Math.sin(4 * Math.PI * frequency * i / sampleRate + 0.3) +
            residual * Math.sin(2 * Math.PI * open * i / sampleRate + 0.6)));
          const result = new PitchAnalyser().analysePitch(samples, sampleRate, 0.07, 200, false, 1, 2, openMidi + 19);
          expect(result?.midiNumber).toBe(openMidi + 19);
          expect(Math.abs(result!.cents)).toBeLessThanOrEqual(50);
        }
      }
    });
    test(`harmonic hint does not accept open/fretted/upper-octave notes for string ${openMidi} at ${sampleRate} Hz`, () => {
      for (const midi of [openMidi, openMidi + 7, openMidi + 31]) {
        const frequency = 440 * 2 ** ((midi - 69) / 12);
        const samples = Float32Array.from({ length: 2048 }, (_, i) => 0.08 * Math.sin(2 * Math.PI * frequency * i / sampleRate));
        const result = new PitchAnalyser().analysePitch(samples, sampleRate, 0.07, 200, true, 1, 2, openMidi + 19);
        expect(result?.midiNumber).not.toBe(openMidi + 19);
      }
    });
  }
}
