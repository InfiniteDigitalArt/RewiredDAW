// midi-synth-basic.js

window.BasicSawSynth = class BasicSawSynth {
  constructor(audioCtx) {
    this.audioCtx = audioCtx;
  }

  playNote(pitch, startTime, duration, velocity = 0.8, trackIndex = 0) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = "sawtooth";
    osc.frequency.value = 440 * Math.pow(2, (pitch - 69) / 12);

    // Velocity → gain
    gain.gain.setValueAtTime(velocity, startTime);
    gain.gain.linearRampToValueAtTime(0.0001, startTime + duration);

    // ⭐ Route through track gain, not directly to destination
    gain.connect(window.trackGains[trackIndex]);

    osc.connect(gain);

    osc.start(startTime);
    osc.stop(startTime + duration);

    // ⭐ Register both nodes so stopAll() can kill them
    window.scheduledMidiVoices.push(osc, gain);
  }
};
