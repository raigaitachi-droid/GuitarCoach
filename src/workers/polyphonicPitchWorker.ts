/// <reference lib="webworker" />

import { BasicPitch, outputToNotesPoly } from '@spotify/basic-pitch';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-wasm';

type IncomingMessage =
  | { type: 'init'; modelUrl: string }
  | { type: 'samples'; samples: Float32Array; hopSamples: number; sampleRate: number; audioTimeMs: number };

const MODEL_SAMPLE_RATE = 22050;
const WINDOW_SAMPLES = MODEL_SAMPLE_RATE * 2;
const ANALYSIS_EVERY_MS = 250;
const REALTIME_ONSET_THRESHOLD = 0.25;
const REALTIME_FRAME_THRESHOLD = 0.15;
const REALTIME_MINIMUM_NOTE_LENGTH_FRAMES = 3;
const REALTIME_INFER_ONSETS = true;
let model: BasicPitch | null = null;
// Basic Pitch uses a two-second receptive field. Leading zeroes let the first
// short notes be evaluated without waiting for a full window of microphone data.
let rolling = new Float32Array(WINDOW_SAMPLES);
let lastAnalysisAt = -Infinity;
let busy = false;

async function initialiseTensorFlow() {
  try {
    const webglEnabled = await tf.setBackend('webgl');
    if (!webglEnabled) throw new Error('WebGL is unavailable in this worker.');
    await tf.ready();
    console.info('TF.js running on WebGL');
  } catch (error) {
    const wasmEnabled = await tf.setBackend('wasm');
    if (!wasmEnabled) throw error;
    await tf.ready();
    console.warn('TF.js WebGL unavailable; using WASM instead.');
  }
}

const tensorflowReady = initialiseTensorFlow();

function appendSamples(samples: Float32Array, sampleRate: number) {
  const targetLength = Math.max(1, Math.round(samples.length * MODEL_SAMPLE_RATE / sampleRate));
  const resampled = new Float32Array(targetLength);
  for (let index = 0; index < targetLength; index++) {
    const source = index * (samples.length - 1) / Math.max(1, targetLength - 1);
    const left = Math.floor(source);
    const right = Math.min(samples.length - 1, left + 1);
    resampled[index] = samples[left] + (samples[right] - samples[left]) * (source - left);
  }
  const next = new Float32Array(Math.min(WINDOW_SAMPLES, rolling.length + resampled.length));
  const retained = Math.max(0, next.length - resampled.length);
  if (retained) next.set(rolling.subarray(Math.max(0, rolling.length - retained)), 0);
  next.set(resampled.subarray(Math.max(0, resampled.length - next.length)), retained);
  rolling = next;
}

async function analyse(audioTimeMs: number) {
  if (!model || busy) return;
  busy = true;
  try {
    // Basic Pitch is batch-oriented, so this is deliberately a rolling preview,
    // not yet the authoritative score engine. Only notes active near the newest
    // edge of the window are surfaced to the UI.
    const frames: number[][] = [];
    const onsets: number[][] = [];
    await model.evaluateModel(rolling, (nextFrames, nextOnsets) => {
      frames.push(...nextFrames);
      onsets.push(...nextOnsets);
    }, () => undefined);
    const notes = outputToNotesPoly(
      frames,
      onsets,
      REALTIME_ONSET_THRESHOLD,
      REALTIME_FRAME_THRESHOLD,
      REALTIME_MINIMUM_NOTE_LENGTH_FRAMES,
      REALTIME_INFER_ONSETS
    );
    const recentFrame = Math.max(0, frames.length - 28);
    const midiNumbers = [...new Set(notes
      .filter((note) => note.startFrame + note.durationFrames >= recentFrame)
      .map((note) => note.pitchMidi)
    )].sort((a, b) => a - b);
    self.postMessage({ type: 'polyphonic', midiNumbers, audioTimeMs });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Polyphonic preview could not start.' });
  } finally {
    busy = false;
  }
}

async function initialise(modelUrl: string) {
  await tensorflowReady;
  model = new BasicPitch(modelUrl);
  self.postMessage({ type: 'ready' });
}

self.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;
  if (message.type === 'init') {
    void initialise(message.modelUrl).catch((error) => {
      self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Polyphonic preview could not start.' });
    });
    return;
  }
  const hopSamples = Math.min(
    message.samples.length,
    Math.max(1, Math.trunc(message.hopSamples))
  );
  appendSamples(message.samples.subarray(-hopSamples), message.sampleRate);
  if (message.audioTimeMs - lastAnalysisAt >= ANALYSIS_EVERY_MS) {
    lastAnalysisAt = message.audioTimeMs;
    void analyse(message.audioTimeMs);
  }
};

export {};
