import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

function capturePicks(frequency: number, sampleRate: number, attacks: number[], gain = 0.1) {
  const messages: { type: string; onset?: boolean; pluckId?: number }[] = [];
  let Processor: any;
  const runtime = createContext({
    sampleRate, currentFrame: 0, Float32Array, Math,
    AudioWorkletProcessor: class { port = { postMessage: (message: any) => messages.push(message), onmessage: null }; },
    registerProcessor: (_name: string, processor: any) => { Processor = processor; },
  });
  runInContext(readFileSync('public/pitch-worklet.js', 'utf8'), runtime);
  const processor = new Processor({ processorOptions: { noiseThreshold: 0.002 } });
  const newestFirst = [...attacks].reverse();
  for (let frame = 0; frame < sampleRate * 2; frame += 128) {
    const input = new Float32Array(128);
    for (let index = 0; index < input.length; index++) {
      const time = (frame + index) / sampleRate;
      // Re-picking the same string restarts its vibration/envelope.
      for (const attack of newestFirst) {
        const age = time - attack;
        if (age < 0) continue;
        const envelope = gain * (1 - Math.exp(-age / 0.003)) * Math.exp(-age / 0.8);
        input[index] += envelope * (Math.sin(2 * Math.PI * frequency * age)
          + 0.35 * Math.sin(4 * Math.PI * frequency * age + 0.4)
          + 0.15 * Math.sin(6 * Math.PI * frequency * age + 0.7));
        break;
      }
    }
    runtime.currentFrame = frame;
    // The score moving to a new string must not turn the same ringing audio
    // into another physical attack.
    processor.expectedString = frame < sampleRate * 0.5 ? 6 : 5;
    processor.process([[input]]);
  }
  return new Set(messages.filter((message) => message.type === 'samples').map((message) => message.pluckId));
}

for (const sampleRate of [44100, 48000, 96000]) {
  for (const frequency of [82.41, 110, 196, 329.63]) {
    test(`one decaying pick stays one pick at ${frequency} Hz / ${sampleRate} Hz`, () => {
      expect(capturePicks(frequency, sampleRate, [0.1]).size).toBe(1);
    });
  }
  test(`a real second pick is recognized over the ringing tail at ${sampleRate} Hz`, () => {
    expect(capturePicks(82.41, sampleRate, [0.1, 0.7]).size).toBe(2);
  });
  test(`quiet DI attack remains detectable at ${sampleRate} Hz`, () => {
    expect(capturePicks(82.41, sampleRate, [0.1], 0.006).size).toBe(1);
  });
  test(`quick repeated picking is still recognized at ${sampleRate} Hz`, () => {
    expect(capturePicks(82.41, sampleRate, [0.1, 0.25, 0.4]).size).toBe(3);
  });
}
