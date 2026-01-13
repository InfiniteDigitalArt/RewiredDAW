window.BasicSawSynth = class BasicSawSynth {
  constructor(audioCtx) {
    this.audioCtx = audioCtx;

    // --- Subtle reverb ---
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

  // ⭐ NEW: clip is passed in
  playNoteFromClip(clip, pitch, startTime, duration, velocity = 0.8, trackIndex = 0) {
    if (!clip.sampleBuffer) return; // no sample loaded for this clip

    const src = this.audioCtx.createBufferSource();
    src.buffer = clip.sampleBuffer;

    // MIDI pitch → playbackRate
    const semitone = pitch - 69;
    src.playbackRate.value = Math.pow(2, semitone / 12);

    const gain = this.audioCtx.createGain();

    // --- ADSR ---
    const attack = 0.001;
    const release = 0.05;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(velocity, startTime + attack);
    gain.gain.setValueAtTime(velocity, startTime + duration);
    gain.gain.linearRampToValueAtTime(0.0001, startTime + duration + release);

    // --- Routing ---
    gain.connect(window.trackGains[trackIndex]); // dry
    gain.connect(this.reverb);                   // wet
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(window.trackGains[trackIndex]);

    src.connect(gain);

    src.start(startTime);
    src.stop(startTime + duration + release);

    window.scheduledMidiVoices.push(src, gain);
  }
};
