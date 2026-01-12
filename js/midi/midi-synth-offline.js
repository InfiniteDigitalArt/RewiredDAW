window.BasicSawSynthForContext = class BasicSawSynthForContext {
  constructor(audioCtx, trackGainNode) {
    this.audioCtx = audioCtx;
    this.trackGainNode = trackGainNode;
  }

  playNote(pitch, startTime, duration, velocity = 0.8) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = "sawtooth";
    osc.frequency.value = 440 * Math.pow(2, (pitch - 69) / 12);

    const eps = 0.0001; // ⭐ prevents fade-in at time 0

    gain.gain.setValueAtTime(velocity, startTime + eps);
    gain.gain.linearRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.trackGainNode);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }
};
