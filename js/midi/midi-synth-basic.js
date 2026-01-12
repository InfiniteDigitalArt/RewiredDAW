// midi-synth-basic.js

window.BasicSawSynth = class BasicSawSynth {
  constructor(audioCtx) {
    this.audioCtx = audioCtx;
  }

  playNote(pitch, startTime, duration, velocity = 0.8) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = "sawtooth";
    osc.frequency.value = 440 * Math.pow(2, (pitch - 69) / 12);

    gain.gain.setValueAtTime(velocity, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain).connect(this.audioCtx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }
};
