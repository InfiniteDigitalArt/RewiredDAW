window.BasicSawSynth = class BasicSawSynth {
  constructor(audioCtx) {
    this.audioCtx = audioCtx;

    this.reverb = audioCtx.createConvolver();
    this.reverb.buffer = this.makeSmallReverbBuffer(audioCtx);

    this.reverbGain = audioCtx.createGain();
    this.reverbGain.gain.value = 0.5;
  }

  makeSmallReverbBuffer(ctx) {
    const length = ctx.sampleRate * 3;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const channel = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        channel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
      }
    }
    return impulse;
  }

  playNote(pitch, startTime, duration, velocity = 0.8, trackIndex = 0) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = "sawtooth";
    osc.frequency.value = 440 * Math.pow(2, (pitch - 69) / 12);

    const attack = 0.001;
    const release = 0.05;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(velocity, startTime + attack);
    gain.gain.setValueAtTime(velocity, startTime + duration);
    gain.gain.linearRampToValueAtTime(0.0001, startTime + duration + release);

    // Dry → track
    gain.connect(window.trackGains[trackIndex]);

    // Wet → reverb → track
    gain.connect(this.reverb);
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(window.trackGains[trackIndex]);

    osc.connect(gain);

    osc.start(startTime);
    osc.stop(startTime + duration + release);

    window.scheduledMidiVoices.push(osc, gain);
  }
};
