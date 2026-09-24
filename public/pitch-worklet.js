class GuitarPitchProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.filled = 0;
    this.blockCounter = 0;
    // Keep sustained-note analysis below roughly 50 Hz. Onsets still run immediately.
    this.analysisIntervalBlocks = Math.max(4, Math.round(sampleRate / 128 / 45));
    this.noiseThreshold = options.processorOptions?.noiseThreshold || 0.005;
    this.mutedUntilFrame = 0;

    // Advanced guitar attack & re-pluck tracking
    this.shortRms = 0; // Fast envelope (~5-8 ms)
    this.decayRms = 0; // Slow envelope tracking decaying resonance (~120 ms)
    this.decayHfRms = 0; // High-frequency difference baseline
    this.lastOnsetFrame = -99999;
    this.pluckCount = 1;
    this.minFramesBetweenPlucks = Math.round(sampleRate * 0.065); // 65ms minimum spacing between distinct picks

    this.port.onmessage = (event) => {
      if (event.data?.type === 'threshold') {
        this.noiseThreshold = event.data.value;
      } else if (event.data?.type === 'mute') {
        this.mutedUntilFrame = currentFrame + Math.round(
          (event.data.durationMs / 1000) * sampleRate
        );
      }
    };
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    let sumSquares = 0;
    let blockPeak = 0;
    let sumHfDiff = 0;

    for (let i = 0; i < channel.length; i++) {
      const sample = channel[i];
      const absSample = Math.abs(sample);
      if (absSample > blockPeak) blockPeak = absSample;

      this.buffer[this.writeIndex] = sample;
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
      this.filled = Math.min(this.bufferSize, this.filled + 1);
      sumSquares += sample * sample;

      if (i > 0) {
        const diff = sample - channel[i - 1];
        sumHfDiff += diff * diff;
      }
    }

    const rms = Math.sqrt(sumSquares / channel.length);
    const hfRms = Math.sqrt(sumHfDiff / channel.length);
    const crestFactor = blockPeak / (rms + 1e-6);

    // Fast envelope follower (attack tracking, ~6 ms)
    this.shortRms = this.shortRms * 0.45 + rms * 0.55;

    // Slow envelope follower (string decay tracking, ~120 ms)
    if (this.shortRms < this.decayRms) {
      this.decayRms = this.decayRms * 0.965 + this.shortRms * 0.035;
    } else {
      this.decayRms = this.decayRms * 0.82 + this.shortRms * 0.18;
    }
    this.decayHfRms = this.decayHfRms * 0.94 + hfRms * 0.06;

    // Physical Guitar Pluck / Re-pluck Detection:
    // 1) Initial attack from silence: sudden jump above noise floor
    // 2) Re-pluck on an already ringing string: energy surges above decaying tail (+25-30% jump)
    // 3) High crest factor / pick transient spike: sharp plectrum release impulse
    const framesSinceLastOnset = currentFrame - this.lastOnsetFrame;
    const canTriggerNewPluck = framesSinceLastOnset >= this.minFramesBetweenPlucks;

    const isInitialPluck =
      rms >= this.noiseThreshold &&
      this.decayRms <= this.noiseThreshold * 1.25 &&
      canTriggerNewPluck;

    const isRePluckOnRingingString =
      canTriggerNewPluck &&
      rms >= this.noiseThreshold &&
      (
        rms > this.decayRms * 1.28 ||
        (hfRms > this.decayHfRms * 1.55 && rms > this.decayRms * 1.15) ||
        (crestFactor >= 2.45 && rms > this.decayRms * 1.12)
      );

    const onset = isInitialPluck || isRePluckOnRingingString;

    if (onset) {
      this.pluckCount++;
      this.lastOnsetFrame = currentFrame;
      this.decayRms = Math.max(this.decayRms, rms);
    }

    this.blockCounter++;

    if (
      currentFrame >= this.mutedUntilFrame &&
      this.filled === this.bufferSize &&
      rms >= this.noiseThreshold &&
      (onset || this.blockCounter % this.analysisIntervalBlocks === 0)
    ) {
      const snapshot = new Float32Array(this.bufferSize);
      const tail = this.bufferSize - this.writeIndex;
      snapshot.set(this.buffer.subarray(this.writeIndex), 0);
      snapshot.set(this.buffer.subarray(0, this.writeIndex), tail);

      this.port.postMessage(
        {
          type: 'samples',
          samples: snapshot,
          rms,
          peak: blockPeak,
          crestFactor,
          onset,
          pluckId: this.pluckCount,
          audioTimeMs: (currentFrame / sampleRate) * 1000,
        },
        [snapshot.buffer]
      );
    } else if (this.blockCounter % 8 === 0) {
      this.port.postMessage({ type: 'level', rms });
    }

    return true;
  }
}

registerProcessor('guitar-pitch-processor', GuitarPitchProcessor);
