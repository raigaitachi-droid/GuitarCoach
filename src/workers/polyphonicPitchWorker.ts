/// <reference lib="webworker" />
import { PolyphonicStream, PolyphonicPacket } from '../utils/polyphonicStream';

const stream = new PolyphonicStream();
let epoch = 0;
self.onmessage = (event: MessageEvent<({ type: 'samples'; epoch: number } & PolyphonicPacket) | { type: 'reset'; epoch: number } | { type: 'begin_attack' | 'finish_attack'; epoch: number; audioTimeMs: number }>) => {
  const packet = event.data;
  if (packet.type === 'reset') { stream.reset(); epoch = packet.epoch; return; }
  if (packet.epoch !== epoch) { stream.reset(); epoch = packet.epoch; }
  if (packet.type === 'begin_attack') { stream.beginAttack(packet.audioTimeMs); return; }
  if (packet.type === 'finish_attack') { stream.finishAttack(packet.audioTimeMs); return; }
  if (packet.type !== 'samples') return;
  const started = performance.now();
  try {
    const result = stream.append(packet);
    if (result) self.postMessage({ type: 'polyphonic', ...result, epoch, workerDurationMs: performance.now() - started });
  } catch (error) {
    self.postMessage({ type: 'error', epoch, message: error instanceof Error ? error.message : 'Chord recognition could not start.' });
  }
};
