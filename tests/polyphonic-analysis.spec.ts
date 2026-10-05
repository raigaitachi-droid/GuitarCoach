import { expect, test } from '@playwright/test';
import { freshPolyphonicPitches, PolyphonicAnalyser, POLY_SAMPLE_RATE, POLY_WINDOW_SIZE } from '../src/utils/polyphonicAnalysis';

function signal(midis: number[], harmonics = true, detune = 0, levels?: number[]) {
  return Float32Array.from({ length: POLY_WINDOW_SIZE }, (_, i) => midis.reduce((sum, midi, index) => {
    const phase = 2 * Math.PI * 440 * 2 ** ((midi - 69 + detune / 100) / 12) * i / POLY_SAMPLE_RATE;
    return sum + (levels?.[index] ?? 0.08) * (Math.sin(phase + index * 0.4) + (harmonics ? 0.35 * Math.sin(2 * phase + 0.3) + 0.15 * Math.sin(3 * phase + 0.7) : 0));
  }, 0));
}

for (const midis of [[40], [40, 47], [55, 59], [60, 62], [50, 57, 62, 66], [40, 47, 52, 56, 59, 64], [45, 52, 57, 61, 64]]) {
  for (const harmonics of [false, true]) {
    test(`multi-pitch ${midis} with ${harmonics ? 'guitar partials' : 'sines'}`, () => {
      expect(new PolyphonicAnalyser().analyse(signal(midis, harmonics)).midiNumbers).toEqual(midis);
    });
  }
}
for (const cents of [-25, 25]) {
  test(`two strings detuned by ${cents} cents`, () => {
    expect(new PolyphonicAnalyser().analyse(signal([40, 47], true, cents)).midiNumbers).toEqual([40, 47]);
  });
}
test('fresh tone filter excludes ringing baseline and requires a real rise for repeated pitches', () => {
  const analyser = new PolyphonicAnalyser();
  const before = analyser.analyse(signal([40]));
  const after = analyser.analyse(signal([40, 47], true, 0, [0.06, 0.08]));
  expect(freshPolyphonicPitches(after, before.amplitudes, 2)).toEqual([47]);
  expect(freshPolyphonicPitches(before, before.amplitudes, 1.15)).toEqual([]);
  const repicked = analyser.analyse(signal([40], true, 0, [0.15]));
  expect(freshPolyphonicPitches(repicked, before.amplitudes, 1.8)).toEqual([40]);
});
test('silence and broad noise are not chords', () => {
  const analyser = new PolyphonicAnalyser();
  expect(analyser.analyse(new Float32Array(POLY_WINDOW_SIZE)).midiNumbers).toEqual([]);
  let seed = 123;
  const noise = Float32Array.from({ length: POLY_WINDOW_SIZE }, () => { seed = (1664525 * seed + 1013904223) >>> 0; return (seed / 2 ** 32 - 0.5) * 0.02; });
  expect(analyser.analyse(noise).midiNumbers).toEqual([]);
});

// Packet-level coverage includes capture overlap and clean-window gaps at an attack.
import { PolyphonicStream } from '../src/utils/polyphonicStream';
for (const sampleRate of [44100, 48000, 96000]) {
  test(`stream keeps overlap/resampling accurate and rejects ringing at ${sampleRate} Hz`, () => {
    const stream = new PolyphonicStream();
    const readings: ReturnType<PolyphonicStream['append']>[] = [];
    const synth = (time: number) => {
      if (time < 0.1) return 0;
      const old = 0.08 * Math.exp(-(time - 0.1) / 1.5) * Math.sin(2 * Math.PI * 82.406889 * time);
      return old + (time >= 0.8 ? 0.08 * Math.sin(2 * Math.PI * 123.470825 * time) : 0);
    };
    for (let end = 2048; end < sampleRate * 1.5; end += 1024) {
      const time = end / sampleRate;
      if (time < 0.1 || (time >= 0.8 && time - 0.8 < 2048 / sampleRate)) continue;
      const samples = Float32Array.from({ length: 2048 }, (_, i) => synth((end - 2048 + i) / sampleRate));
      const result = stream.append({ samples, sampleRate, hopSamples: 1024, audioTimeMs: time * 1000,
        requestedAtMs: 0, pluckId: time < 0.8 ? 1 : 2, attackStrength: 2, noiseThreshold: 0.002 });
      if (result) readings.push(result);
    }
    expect(readings).toHaveLength(2);
    expect(readings[0]?.freshMidiNumbers).toEqual([40]);
    expect(readings[1]?.midiNumbers).toEqual([40, 47]);
    expect(readings[1]?.freshMidiNumbers).toEqual([47]);
    expect(readings[1]!.audioTimeMs - 800).toBeLessThan(350);
  });
}

test('a short strum collects its strings without manufacturing extra reports', () => {
  const sampleRate = 48000;
  const stream = new PolyphonicStream();
  const notes = [{ midi: 40, at: 0.1 }, { midi: 47, at: 0.18 }, { midi: 52, at: 0.25 }];
  const readings: NonNullable<ReturnType<PolyphonicStream['append']>>[] = [];
  for (let end = 2048; end < sampleRate * 0.9; end += 1024) {
    const time = end / sampleRate;
    const played = notes.filter((note) => note.at <= time);
    if (!played.length || time - played[played.length - 1].at < 2048 / sampleRate) continue;
    const samples = Float32Array.from({ length: 2048 }, (_, i) => notes.reduce((sum, note) => {
      const age = (end - 2048 + i) / sampleRate - note.at;
      return sum + (age < 0 ? 0 : 0.08 * Math.sin(2 * Math.PI * 440 * 2 ** ((note.midi - 69) / 12) * age));
    }, 0));
    const result = stream.append({ samples, sampleRate, hopSamples: 1024, audioTimeMs: time * 1000,
      requestedAtMs: 0, pluckId: played.length, attackStrength: 2, noiseThreshold: 0.002 });
    if (result) readings.push(result);
  }
  expect(readings).toHaveLength(1);
  expect(readings[0].freshMidiNumbers).toEqual([40, 47, 52]);
  expect(readings[0].pluckId).toBe(3);
  stream.reset();
  expect(stream.append({ samples: new Float32Array(2048), sampleRate, hopSamples: 1024,
    audioTimeMs: 1000, requestedAtMs: 0, pluckId: 4, attackStrength: 2, noiseThreshold: 0.002 })).toBeNull();
});

for (const sampleRate of [44100, 48000, 96000]) {
  test(`a continuous 220ms strum emits each tone once and accepts a re-strum at ${sampleRate} Hz`, () => {
    const stream = new PolyphonicStream();
    const readings: NonNullable<ReturnType<PolyphonicStream['append']>>[] = [];
    const picks = [0.1, 0.8].flatMap(start => [40, 47, 52].map((midi, index) => ({ midi, at: start + index * 0.11 })));
    for (let end = 2048; end < sampleRate * 1.6; end += 1024) {
      const time = end / sampleRate;
      const lastPick = picks.filter(pick => pick.at <= time).length - 1;
      const samples = Float32Array.from({ length: 2048 }, (_, i) => picks.reduce((sum, pick) => {
        const age = (end - 2048 + i) / sampleRate - pick.at;
        return sum + (age < 0 ? 0 : 0.08 * Math.exp(-age / 0.7) * Math.sin(2 * Math.PI * 440 * 2 ** ((pick.midi - 69) / 12) * (end - 2048 + i) / sampleRate));
      }, 0));
      const reading = stream.append({ samples, sampleRate, hopSamples: 1024, audioTimeMs: time * 1000,
        requestedAtMs: 0, pluckId: lastPick + 1, attackAgeMs: lastPick < 0 ? 1000 : (time - picks[lastPick].at) * 1000,
        attackStrength: 2, noiseThreshold: 0.002 });
      if (reading) readings.push(reading);
    }
    expect(readings.flatMap(reading => reading.freshMidiNumbers)).toEqual([40, 47, 52, 40, 47, 52]);
    const first = readings.filter(reading => reading.attackAudioTimeMs < 800);
    expect(first.length).toBeGreaterThan(1);
    expect(first[0].audioTimeMs).toBeLessThan(330);
    expect(first.every(reading => Math.abs(reading.attackAudioTimeMs - 100) < 1)).toBe(true);
    expect(readings.at(-1)!.audioTimeMs - 800).toBeLessThan(350);
  });
}

test('a beat boundary separates rapid chords and a stale completion cannot close the next attack', () => {
  const stream = new PolyphonicStream();
  const sampleRate = 48000;
  const readings: NonNullable<ReturnType<PolyphonicStream['append']>>[] = [];
  let boundarySent = false;
  for (let end = 2048; end < sampleRate * 0.9; end += 1024) {
    const time = end / sampleRate;
    if (time >= 0.34 && !boundarySent) {
      stream.beginAttack(340);
      boundarySent = true;
    }
    const samples = Float32Array.from({ length: 2048 }, (_, i) => [55, 59].reduce((sum, midi) => {
      const t = (end - 2048 + i) / sampleRate;
      const frequency = 440 * 2 ** ((midi - 69) / 12);
      return sum + [0.1, 0.34].reduce((level, at) => {
        const age = t - at;
        return level + (age < 0 ? 0 : 0.08 * Math.exp(-age / 0.15) * Math.sin(2 * Math.PI * frequency * t));
      }, 0);
    }, 0));
    const reading = stream.append({ samples, sampleRate, hopSamples: 1024, audioTimeMs: time * 1000,
      requestedAtMs: 0, pluckId: time < 0.1 ? 0 : time < 0.34 ? 1 : 2,
      attackAgeMs: time < 0.1 ? 1000 : (time - (time < 0.34 ? 0.1 : 0.34)) * 1000,
      attackStrength: 2, noiseThreshold: 0.002 });
    if (boundarySent) stream.finishAttack(100); // delayed acknowledgement of the previous chord
    if (reading) readings.push(reading);
  }
  expect(readings.flatMap(reading => reading.freshMidiNumbers)).toEqual([55, 59, 55, 59]);
  expect(readings.at(-1)?.attackAudioTimeMs).toBeCloseTo(340, 5);
});
for (const partial of [0.2, 0.5]) {
  test(`unequal strings and ${partial} second-partial level do not inflate octaves`, () => {
    const samples = Float32Array.from({ length: POLY_WINDOW_SIZE }, (_, i) => {
      const phase = 2 * Math.PI * 82.406889 * i / POLY_SAMPLE_RATE;
      const other = 2 * Math.PI * 123.470825 * i / POLY_SAMPLE_RATE;
      return 0.08 * (Math.sin(phase) + partial * Math.sin(2 * phase) + 0.15 * Math.sin(3 * phase)) + 0.025 * Math.sin(other);
    });
    expect(new PolyphonicAnalyser().analyse(samples).midiNumbers).toEqual([40, 47]);
  });
}

// Feed actual browser capture into the worker stream: chord beating may emit
// multiple attack IDs, but must not interrupt the PCM or re-credit the bass.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
for (const sampleRate of [44100, 48000, 96000]) {
  test(`continuous chord capture preserves new tones over ringing at ${sampleRate} Hz`, () => {
    const stream = new PolyphonicStream();
    const readings: NonNullable<ReturnType<PolyphonicStream['append']>>[] = [];
    let Processor: any;
    let transientPackets = 0;
    const runtime = createContext({ sampleRate, currentFrame: 0, Float32Array, Math,
      AudioWorkletProcessor: class { port = { onmessage: null, postMessage: (packet: any) => {
        if (packet.type !== 'samples') return;
        if (!packet.monoReady) transientPackets++;
        const reading = stream.append({ ...packet, sampleRate, hopSamples: 1024,
          requestedAtMs: 0, noiseThreshold: 0.002 });
        if (reading) readings.push(reading);
      } }; },
      registerProcessor: (_name: string, processor: any) => { Processor = processor; },
    });
    runInContext(readFileSync('public/pitch-worklet.js', 'utf8'), runtime);
    const processor = new Processor({ processorOptions: { noiseThreshold: 0.002 } });
    for (let frame = 0; frame < sampleRate * 1.8; frame += 128) {
      const input = Float32Array.from({ length: 128 }, (_, i) => {
        const time = (frame + i) / sampleRate;
        return [40, 47, 50].reduce((sum, midi, index) => {
          const age = time - (index === 2 ? 0.9 : 0.1);
          return sum + (age < 0 ? 0 : (index === 2 ? 0.1 : 0.08) *
            Math.sin(2 * Math.PI * 440 * 2 ** ((midi - 69) / 12) * age));
        }, 0);
      });
      runtime.currentFrame = frame;
      processor.process([[input]]);
    }
    expect(transientPackets).toBeGreaterThan(0);
    expect(readings.some((reading) => reading.freshMidiNumbers.includes(40) && reading.freshMidiNumbers.includes(47))).toBe(true);
    const following = readings.filter((reading) => reading.attackAudioTimeMs >= 900);
    expect(following.some((reading) => reading.freshMidiNumbers.includes(50))).toBe(true);
    expect(following.flatMap((reading) => reading.freshMidiNumbers)).not.toContain(40);
    expect(following.flatMap((reading) => reading.freshMidiNumbers)).not.toContain(47);
  });
}

test('first recovered samples cannot associate a new pick with a stale attack', () => {
  const stream = new PolyphonicStream();
  const sampleRate = 48000;
  const readings: NonNullable<ReturnType<PolyphonicStream['append']>>[] = [];
  for (let end = 2048; end < 20000; end += 1024) {
    const audioTimeMs = 3000 + end / sampleRate * 1000;
    const oldId = end === 2048;
    const samples = Float32Array.from({ length: 2048 }, (_, i) =>
      0.1 * Math.sin(2 * Math.PI * 82.406889 * (end - 2048 + i) / sampleRate));
    const reading = stream.append({ samples, sampleRate, hopSamples: 1024,
      audioTimeMs, requestedAtMs: 0, pluckId: oldId ? 1 : 2,
      attackAgeMs: oldId ? audioTimeMs - 1000 : audioTimeMs - 3050,
      attackStrength: 2, noiseThreshold: 0.002 });
    if (reading) readings.push(reading);
  }
  expect(readings).toHaveLength(1);
  expect(readings[0].attackAudioTimeMs).toBe(3050);
  expect(readings[0].freshMidiNumbers).toEqual([40]);
});

test('open E keeps a quieter high string across independent phases', () => {
  const midis = [40, 47, 52, 56, 59, 64];
  const analyser = new PolyphonicAnalyser();
  for (let seed = 0; seed < 24; seed++) {
    const samples = Float32Array.from({ length: POLY_WINDOW_SIZE }, (_, i) => midis.reduce((sum, midi, index) => {
      const phase = 2 * Math.PI * 440 * 2 ** ((midi - 69) / 12) * i / POLY_SAMPLE_RATE + seed * (index + 1) * 0.71;
      return sum + (index === 5 ? 0.06 : 0.08) * (Math.sin(phase) + 0.35 * Math.sin(2 * phase) + 0.15 * Math.sin(3 * phase));
    }, 0));
    expect(analyser.analyse(samples).midiNumbers, `phase ${seed}`).toEqual(midis);
  }
});
test('a single string with higher partials does not manufacture octave strings', () => {
  const samples = Float32Array.from({ length: POLY_WINDOW_SIZE }, (_, i) => {
    const phase = 2 * Math.PI * 82.406889 * i / POLY_SAMPLE_RATE;
    return 0.1 * [1, 0.35, 0.15, 0.08, 0.04, 0.03, 0.02, 0.01].reduce((sum, level, index) =>
      sum + level * Math.sin((index + 1) * phase), 0);
  });
  expect(new PolyphonicAnalyser().analyse(samples).midiNumbers).toEqual([40]);
});
