window.BasicSawSynth = class BasicSawSynth {
  constructor(audioCtx) {
    this.audioCtx = audioCtx;
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

  // clip now owns its own reverb + reverbGain
  playNoteFromClip(clip, pitch, startTime, duration, velocity = 0.8, trackIndex = 0) {
    if (!clip.sampleBuffer) return;

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

    // --- Routing (per‑clip reverb) ---
    gain.connect(window.trackGains[trackIndex]); // dry path
    gain.connect(clip.reverb);                   // wet path (per‑clip)
    // clip.reverb → clip.reverbGain → master is already connected in MidiClip constructor

    src.connect(gain);

    src.start(startTime);
    src.stop(startTime + duration + release);

    window.scheduledMidiVoices.push(src, gain);
  }
};
