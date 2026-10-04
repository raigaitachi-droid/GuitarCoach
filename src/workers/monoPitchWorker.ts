import { PitchAnalyser } from '../utils/pitchAnalysis';
import type { PitchAnalysisPacket } from '../utils/pitchDetector';
const analyser = new PitchAnalyser();
self.onmessage = (event: MessageEvent<PitchAnalysisPacket | { type: 'reset' }>) => {
  const message = event.data;
  if (message.type === 'reset') { analyser.reset(); return; }
  analyser.noiseThreshold = message.noiseThreshold;
  const result = analyser.analysePitch(message.samples, message.sampleRate, message.rms,
    message.audioTimeMs, message.onset, message.pluckId, message.crestFactor, message.expectedHarmonicMidi);
  if (result) {
    result.attackStrength = message.attackStrength;
    result.attackAgeMs = message.attackAgeMs;
  }
  self.postMessage({ epoch: message.epoch, result });
};
