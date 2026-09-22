class GuitarPitchProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.filled = 0;
    this.blockCounter = 0;
    this.previousRms = 0;
    this.noiseThreshold = options.processorOptions?.noiseThreshold || 0.005;
    this.mutedUntilFrame = 0;

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
    for (let i = 0; i < channel.length; i++) {
      const sample = channel[i];
      this.buffer[this.writeIndex] = sample;
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
      this.filled = Math.min(this.bufferSize, this.filled + 1);
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / channel.length);
    const onset = rms >= this.noiseThreshold && (
      this.previousRms < this.noiseThreshold ||
      rms > Math.max(this.previousRms * 1.7, this.noiseThreshold * 1.4)
    );
    this.previousRms = this.previousRms * 0.72 + rms * 0.28;
    this.blockCounter++;

    if (
      currentFrame >= this.mutedUntilFrame &&
      this.filled === this.bufferSize &&
      rms >= this.noiseThreshold &&
      (onset || this.blockCounter % 4 === 0)
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
          onset,
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
