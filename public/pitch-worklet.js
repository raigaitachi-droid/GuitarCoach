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
    this.quickOnsetWindowSize = 256;
    this.quickOnsetSamples = 0;
    this.quickOnsetSquares = 0;
    this.previousQuickOnsetRms = 0;
    this.lastQuickOnsetFrame = -99999;
    this.quickOnsetRefractoryFrames = Math.round(sampleRate * 0.04);
    this.blockCounter = 0;
    this.noiseThreshold = options.processorOptions?.noiseThreshold || 0.002;
    this.mutedUntilFrame = 0;

    // Advanced guitar attack & re-pluck tracking
    this.shortRms = 0; // Fast envelope (~5-8 ms)
    this.decayRms = 0; // Slow envelope tracking decaying resonance (~120 ms)
    this.decayHfRms = 0; // High-frequency difference baseline
    this.lastOnsetFrame = -99999;
    this.pluckCount = 1;
    this.minFramesBetweenPlucks = Math.round(sampleRate * 0.065); // 65ms minimum spacing between distinct picks
    this.expectedString = null;
    this.lastOnsetExpectedString = null;

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
      this.quickOnsetSquares += sample * sample;
      this.quickOnsetSamples++;

      if (this.quickOnsetSamples === this.quickOnsetWindowSize) {
        const quickRms = Math.sqrt(this.quickOnsetSquares / this.quickOnsetWindowSize);
        const quickOnsetFrame = currentFrame + i + 1;
        const isQuickOnset =
          quickOnsetFrame >= this.mutedUntilFrame &&
          quickOnsetFrame - this.lastQuickOnsetFrame >= this.quickOnsetRefractoryFrames &&
          quickRms > this.noiseThreshold &&
          quickRms > this.previousQuickOnsetRms * 2.5;

        if (isQuickOnset) {
          this.lastQuickOnsetFrame = quickOnsetFrame;
          this.port.postMessage({
            type: 'ONSET_TRIGGERED',
            rms: quickRms,
            audioTimeMs: (quickOnsetFrame / sampleRate) * 1000,
          });
        }

        this.previousQuickOnsetRms = quickRms;
        this.quickOnsetSquares = 0;
        this.quickOnsetSamples = 0;
      }

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
    const isCrossStringTransition =
      this.expectedString !== null &&
      this.lastOnsetExpectedString !== null &&
      this.expectedString !== this.lastOnsetExpectedString;
    const repluckEnergyRatio = isCrossStringTransition ? 1.18 : 1.28;
    const repluckHfRatio = isCrossStringTransition ? 1.42 : 1.55;
    const repluckCrestThreshold = isCrossStringTransition ? 2.25 : 2.45;

    const isInitialPluck =
      rms >= this.noiseThreshold &&
      this.decayRms <= this.noiseThreshold * 1.25 &&
      canTriggerNewPluck;

    const isRePluckOnRingingString =
      canTriggerNewPluck &&
      rms >= this.noiseThreshold &&
      (
        rms > this.decayRms * repluckEnergyRatio ||
        (hfRms > this.decayHfRms * repluckHfRatio && rms > this.decayRms * 1.10) ||
        (crestFactor >= repluckCrestThreshold && rms > this.decayRms * 1.08)
      );

    const onset = isInitialPluck || isRePluckOnRingingString;

    if (onset) {
      this.pluckCount++;
      this.lastOnsetFrame = currentFrame;
      this.decayRms = Math.max(this.decayRms, rms);
      if (currentFrame >= this.mutedUntilFrame) {
        this.pendingOnset = true;
        this.samplesSinceOnset = 0;
        this.lastOnsetExpectedString = this.expectedString;
      }
    }

    this.blockCounter++;

    if (
      currentFrame >= this.mutedUntilFrame &&
      this.filled === this.bufferSize &&
      rms >= this.noiseThreshold &&
      this.samplesSinceLastSnapshot >= this.hopSize &&
      this.samplesSinceOnset >= this.bufferSize
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
          onset: this.pendingOnset,
          pluckId: this.pluckCount,
          audioTimeMs: (currentFrame / sampleRate) * 1000,
        },
        [snapshot.buffer]
      );
      this.samplesSinceLastSnapshot %= this.hopSize;
      this.pendingOnset = false;
    } else if (this.blockCounter % 8 === 0) {
      this.port.postMessage({ type: 'level', rms });
    }

    return true;
  }
}

registerProcessor('guitar-pitch-processor', GuitarPitchProcessor);
