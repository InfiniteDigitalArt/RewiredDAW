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

    try {
      const src = this.audioCtx.createBufferSource();
      src.buffer = clip.sampleBuffer;

      // MIDI pitch → playbackRate
      const semitone = pitch - 60;
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
    // Dry path → track gain (so track volume/mute affects dry signal)
    if (window.trackGains && window.trackGains[trackIndex]) {
      gain.connect(window.trackGains[trackIndex]);
    } else {
      gain.connect(this.audioCtx.destination);
    }

    // Wet (reverb) path:
    // - create a per-clip reverb SEND gain (clip._reverbSend) if missing
    // - send = gain -> clip._reverbSend -> clip.reverb (Convolver)
    // - ensure clip.reverb (convolver) -> clip.reverbGain -> trackGain (NOT master)
    if (clip.reverb) {
      // Ensure a send node exists on the clip for controlling send level
      if (!clip._reverbSend) {
        clip._reverbSend = this.audioCtx.createGain();
        // default send level; clips may override this externally
        clip._reverbSend.gain.value = (typeof clip.reverbSendLevel === "number") ? clip.reverbSendLevel : 0.35;
      }

      // connect the note's gain to the clip send
      gain.connect(clip._reverbSend);
      clip._reverbSend.connect(clip.reverb);

      // Make sure convolver output goes to a per-clip reverbGain that then connects to the track gain.
      if (!clip.reverbGain) {
        clip.reverbGain = this.audioCtx.createGain();
        clip.reverbGain.gain.value = (typeof clip.reverbWetLevel === "number") ? clip.reverbWetLevel : 0.9;
      }

      // Connect convolver -> reverbGain (if not already connected)
      try {
        // Avoid duplicate connect by checking a flag
        if (!clip._reverbWired) {
          clip.reverb.connect(clip.reverbGain);
          // Route wet into track gain so track volume affects reverb and VU meters see it
          if (window.trackGains && window.trackGains[trackIndex]) {
            // Disconnect any previous outputs on reverbGain to avoid stale master routing
            try { clip.reverbGain.disconnect(); } catch (e) {}
            clip.reverbGain.connect(window.trackGains[trackIndex]);
          } else {
            try { clip.reverbGain.disconnect(); } catch (e) {}
            clip.reverbGain.connect(this.audioCtx.destination);
          }
          clip._reverbWired = true;
        }
      } catch (err) {
        // best-effort; don't break playback on errors
        console.warn("Reverb wiring failed:", err);
      }
    }

    src.connect(gain);

    src.start(startTime);
    src.stop(startTime + duration + release);

    window.scheduledMidiVoices.add(src);
    window.scheduledMidiVoices.add(gain);

    } catch (err) {
      console.error("Error playing MIDI note:", err, {
        pitch,
        startTime,
        duration,
        hasSampleBuffer: !!clip.sampleBuffer,
        clipId: clip.id
      });
    }
  }
};