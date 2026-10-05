import { freshPolyphonicPitches, PolyphonicAnalyser, POLY_SAMPLE_RATE, POLY_WINDOW_SIZE, PolyphonicEstimate } from './polyphonicAnalysis';

export interface PolyphonicPacket {
  samples: Float32Array;
  sampleRate: number;
  hopSamples: number;
  audioTimeMs: number;
  requestedAtMs: number;
  pluckId: number;
  attackStrength: number;
  noiseThreshold: number;
  attackAgeMs?: number;
}

export const POLY_COLLECTION_MS = 350;
const ATTACK_ANALYSIS_MS = 20;
const IDLE_ANALYSIS_MS = 60;

export class PolyphonicStream {
  private analyser = new PolyphonicAnalyser();
  private rolling = new Float32Array(POLY_WINDOW_SIZE);
  private ordered = new Float32Array(POLY_WINDOW_SIZE);
  private write = 0;
  private filled = 0;
  private resamplePhase = 0;
  private previousSample = 0;
  private lastSampleTime = -Infinity;
  private lastAnalysisTime = -Infinity;
  private latest: PolyphonicEstimate = { midiNumbers: [], amplitudes: new Float32Array(128) };
  private previousPluck = -1;
  private group: { baseline: Float32Array; startedAt: number; attackAudioTimeMs: number; samples: number; strength: number; closed: boolean; emitted: Uint8Array } | null = null;

  reset() {
    this.rolling.fill(0);
    this.write = this.filled = this.resamplePhase = 0;
    this.lastSampleTime = this.lastAnalysisTime = -Infinity;
    this.latest = { midiNumbers: [], amplitudes: new Float32Array(128) };
    this.previousPluck = -1;
    this.group = null;
  }

  // Segmentation hints contain no expected pitches. A new score beat may
  // end a strum; actual pitches still come exclusively from the audio.
  beginAttack(audioTimeMs: number) {
    if (this.group && this.group.attackAudioTimeMs < audioTimeMs - 1) {
      this.group.closed = true;
      this.previousPluck = -1;
    }
  }

  finishAttack(audioTimeMs: number) {
    if (this.group && Math.abs(this.group.attackAudioTimeMs - audioTimeMs) < 1) this.group.closed = true;
  }

  append(packet: PolyphonicPacket) {
    const gap = packet.audioTimeMs - this.lastSampleTime;
    const discontinuity = gap > packet.hopSamples / packet.sampleRate * 1000 * 2.5;
    if (discontinuity) {
      // Silence/threshold recovery or older native capture can omit windows.
      // Keep the preceding ringing baseline across short gaps, but never
      // stitch non-contiguous audio into one FFT.
      if (gap > 250) this.reset();
      else { this.write = this.filled = this.resamplePhase = 0; }
    }
    if (packet.pluckId !== this.previousPluck && (packet.attackAgeMs ?? 0) <= 250) {
      // A short strum may produce several capture attacks. Collect it as one
      // window while preserving the baseline from before its first string.
      if (!this.group || this.group.closed || packet.audioTimeMs - this.group.startedAt > POLY_COLLECTION_MS) {
        this.group = { baseline: this.latest.amplitudes.slice(), startedAt: packet.audioTimeMs, attackAudioTimeMs: packet.audioTimeMs - (packet.attackAgeMs ?? 0),
          samples: 0, strength: packet.attackStrength, closed: false, emitted: new Uint8Array(128) };
      } else this.group.strength = Math.max(this.group.strength, packet.attackStrength);
      this.previousPluck = packet.pluckId;
    }
    // Gate/threshold recovery can shift the next snapshot by less than one
    // nominal hop. Append only the samples actually newer than the previous
    // window; duplicate overlap creates spurious spectral peaks/subharmonics.
    const actualHop = Math.max(1, Math.min(packet.samples.length, Math.round(gap * packet.sampleRate / 1000)));
    const unique = discontinuity ? packet.samples : packet.samples.subarray(-actualHop);
    const step = packet.sampleRate / POLY_SAMPLE_RATE;
    for (; this.resamplePhase < unique.length - 1; this.resamplePhase += step) {
      const left = Math.floor(this.resamplePhase);
      const leftSample = left < 0 ? this.previousSample : unique[left];
      const sample = leftSample + (unique[left + 1] - leftSample) * (this.resamplePhase - left);
      this.rolling[this.write] = sample;
      this.write = (this.write + 1) % POLY_WINDOW_SIZE;
      this.filled = Math.min(POLY_WINDOW_SIZE, this.filled + 1);
      if (this.group) this.group.samples++;
    }
    // Preserve fractional positions; reusing the final sample at the next hop
    // prevents a per-packet rounding error from drifting the pitch estimate.
    this.resamplePhase -= unique.length;
    this.previousSample = unique[unique.length - 1];
    this.lastSampleTime = packet.audioTimeMs;
    const collecting = this.group && !this.group.closed && packet.audioTimeMs - this.group.startedAt <= POLY_COLLECTION_MS;
    if (this.filled < POLY_WINDOW_SIZE || packet.audioTimeMs - this.lastAnalysisTime < (collecting ? ATTACK_ANALYSIS_MS : IDLE_ANALYSIS_MS)) return null;
    const tail = POLY_WINDOW_SIZE - this.write;
    this.ordered.set(this.rolling.subarray(this.write), 0);
    this.ordered.set(this.rolling.subarray(0, this.write), tail);
    this.latest = this.analyser.analyse(this.ordered, packet.noiseThreshold);
    this.lastAnalysisTime = packet.audioTimeMs;
    if (!this.group || this.group.closed || this.group.samples < POLY_WINDOW_SIZE) return null;
    const freshMidiNumbers = freshPolyphonicPitches(this.latest, this.group.baseline, this.group.strength)
      .filter(midi => !this.group!.emitted[midi]);
    for (const midi of freshMidiNumbers) this.group.emitted[midi] = 1;
    if (packet.audioTimeMs - this.group.startedAt >= POLY_COLLECTION_MS) this.group.closed = true;
    if (!freshMidiNumbers.length) return null;
    return { midiNumbers: this.latest.midiNumbers,
      freshMidiNumbers,
      attackAudioTimeMs: this.group.attackAudioTimeMs, pluckId: packet.pluckId, audioTimeMs: packet.audioTimeMs, requestedAtMs: packet.requestedAtMs };
  }
}
