window.BasicSawSynthForContext = class BasicSawSynthForContext {
  constructor(audioCtx, trackGainNode, sampleBuffer, reverbBuffer, reverbAmount) {
    this.audioCtx = audioCtx;
    this.trackGainNode = trackGainNode;
    this.sampleBuffer = sampleBuffer;

    // ⭐ Build per‑clip reverb chain
    this.reverb = audioCtx.createConvolver();
    this.reverb.buffer = reverbBuffer;

    this.reverbGain = audioCtx.createGain();
    this.reverbGain.gain.value = reverbAmount;

    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(trackGainNode);
  }

  playNote(pitch, startTime, duration, velocity = 0.8) {
    if (!this.sampleBuffer) return;

    const src = this.audioCtx.createBufferSource();
    src.buffer = this.sampleBuffer;

    const semitone = pitch - 69;
    src.playbackRate.value = Math.pow(2, semitone / 12);

    const gain = this.audioCtx.createGain();

    const attack = 0.001;
    const release = 0.05;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(velocity, startTime + attack);
    gain.gain.setValueAtTime(velocity, startTime + duration);
    gain.gain.linearRampToValueAtTime(0.0001, startTime + duration + release);

    // ⭐ Dry path
    gain.connect(this.trackGainNode);

    // ⭐ Wet path
    gain.connect(this.reverb);

    src.connect(gain);

    src.start(startTime);
    src.stop(startTime + duration + release);
  }
};
