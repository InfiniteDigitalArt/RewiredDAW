window.BasicSawSynthForContext = class BasicSawSynthForContext {
  constructor(audioCtx, trackGainNode, sampleBuffer) {
    this.audioCtx = audioCtx;
    this.trackGainNode = trackGainNode;
    this.sampleBuffer = sampleBuffer; // passed in from realtime synth
  }

  playNote(pitch, startTime, duration, velocity = 0.8) {
    if (!this.sampleBuffer) return;

    const src = this.audioCtx.createBufferSource();
    src.buffer = this.sampleBuffer;

    // MIDI pitch → playbackRate
    const semitone = pitch - 69;
    src.playbackRate.value = Math.pow(2, semitone / 12);

    const gain = this.audioCtx.createGain();

    // ADSR
    const attack = 0.001;
    const release = 0.05;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(velocity, startTime + attack);
    gain.gain.setValueAtTime(velocity, startTime + duration);
    gain.gain.linearRampToValueAtTime(0.0001, startTime + duration + release);

    src.connect(gain);
    gain.connect(this.trackGainNode);

    src.start(startTime);
    src.stop(startTime + duration + release);
  }
};
