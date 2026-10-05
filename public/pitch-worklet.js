class GuitarPitchProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferSize = 2048;
    this.hopSize = this.bufferSize / 2;
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.filled = 0;
    this.samplesSinceLastSnapshot = 0;
    // Do not analyse a ring buffer that still contains the previous note.
    this.samplesSinceOnset = Infinity;
    this.pendingOnset = false;
    // Measure attack energy across more than one low-E cycle, rather than
    // mistaking the peaks of 128-sample audio blocks for new physical picks.
    this.attackWindowSize = Math.round(sampleRate * 0.024 / 128) * 128;
    this.attackSamples = 0;
    this.attackSquares = 0;
    this.attackHfSquares = 0;
    this.previousAttackRms = 0;
    this.blockCounter = 0;
    this.noiseThreshold = options.processorOptions?.noiseThreshold || 0.002;
    this.mutedUntilFrame = 0;

    // Advanced guitar attack & re-pluck tracking
    this.decayRms = 0; // Slow envelope tracking decaying resonance (~120 ms)
    this.decayHfRms = 0; // High-frequency difference baseline
    this.lastOnsetFrame = -99999;
    this.pluckCount = 0;
    this.attackStrength = 0;
    this.minFramesBetweenPlucks = Math.round(sampleRate * 0.065); // 65ms minimum spacing between distinct picks
    this.expectedString = null;

    this.port.onmessage = (event) => {
      if (event.data?.type === 'threshold') {
        this.noiseThreshold = event.data.value;
      } else if (event.data?.type === 'mute') {
        this.mutedUntilFrame = currentFrame + Math.round(
          (event.data.durationMs / 1000) * sampleRate
        );
      } else if (event.data?.type === 'expected-string') {
        const stringNumber = Number(event.data.value);
        this.expectedString = Number.isInteger(stringNumber) && stringNumber >= 1 && stringNumber <= 6
          ? stringNumber
          : null;
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
      this.samplesSinceLastSnapshot++;
      this.samplesSinceOnset++;
      sumSquares += sample * sample;
      if (i > 0) {
        const diff = sample - channel[i - 1];
        sumHfDiff += diff * diff;
      }
    }

    const rms = Math.sqrt(sumSquares / channel.length);
    const crestFactor = blockPeak / (rms + 1e-6);

    this.attackSquares += sumSquares;
    this.attackHfSquares += sumHfDiff;
    this.attackSamples += channel.length;
    if (this.attackSamples >= this.attackWindowSize) {
      const attackRms = Math.sqrt(this.attackSquares / this.attackSamples);
      const attackHfRms = Math.sqrt(this.attackHfSquares / this.attackSamples);
      const canTrigger = currentFrame - this.lastOnsetFrame >= this.minFramesBetweenPlucks;
      const initial = attackRms >= this.noiseThreshold && this.previousAttackRms < this.noiseThreshold;
      const rising = attackRms > this.previousAttackRms * 1.10;
      const repluck = attackRms >= this.noiseThreshold && rising &&
        (attackRms > this.decayRms * 1.02 ||
         (attackHfRms > this.decayHfRms * 1.55 && attackRms > this.decayRms * 1.10));
      if (canTrigger && (initial || repluck) && currentFrame >= this.mutedUntilFrame) {
        this.pluckCount++;
        this.attackStrength = attackRms / Math.max(this.previousAttackRms, this.noiseThreshold * 0.5);
        this.lastOnsetFrame = currentFrame;
        this.pendingOnset = true;
        this.samplesSinceOnset = 0;
        this.port.postMessage({ type: 'ONSET_TRIGGERED', rms: attackRms, audioTimeMs: currentFrame / sampleRate * 1000 });
      }
      this.decayRms = attackRms > this.decayRms ? attackRms : this.decayRms * 0.8 + attackRms * 0.2;
      this.decayHfRms = attackHfRms > this.decayHfRms ? attackHfRms : this.decayHfRms * 0.8 + attackHfRms * 0.2;
      this.previousAttackRms = attackRms;
      this.attackSamples = 0;
      this.attackSquares = 0;
      this.attackHfSquares = 0;
    }

    this.blockCounter++;

    if (
      currentFrame >= this.mutedUntilFrame &&
      this.pluckCount > 0 &&
      this.filled === this.bufferSize &&
      rms >= this.noiseThreshold &&
      this.samplesSinceLastSnapshot >= this.hopSize
    ) {
      const snapshot = new Float32Array(this.bufferSize);
      const tail = this.bufferSize - this.writeIndex;
      snapshot.set(this.buffer.subarray(this.writeIndex), 0);
      snapshot.set(this.buffer.subarray(0, this.writeIndex), tail);
      const monoReady = this.samplesSinceOnset >= this.bufferSize;

      this.port.postMessage(
        {
          type: 'samples',
          samples: snapshot,
          rms,
          peak: blockPeak,
          crestFactor,
          monoReady,
          onset: this.pendingOnset && monoReady,
          pluckId: this.pluckCount,
          attackStrength: this.attackStrength,
          attackAgeMs: (currentFrame - this.lastOnsetFrame) / sampleRate * 1000,
          audioTimeMs: (currentFrame / sampleRate) * 1000,
        },
        [snapshot.buffer]
      );
      this.samplesSinceLastSnapshot %= this.hopSize;
      if (monoReady) this.pendingOnset = false;
    } else if (this.blockCounter % 8 === 0) {
      this.port.postMessage({ type: 'level', rms });
    }

    return true;
  }
}

registerProcessor('guitar-pitch-processor', GuitarPitchProcessor);
