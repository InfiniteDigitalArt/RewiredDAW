window.BasicSawSynth = class BasicSawSynth {
  constructor(audioCtx) {
    this.audioCtx = audioCtx;

    // --- Load sample once ---
    this.sampleBuffer = null;
    this.loadSample();

    // --- Subtle reverb ---
    this.reverb = audioCtx.createConvolver();
    this.reverb.buffer = this.makeSmallReverbBuffer(audioCtx);

    this.reverbGain = audioCtx.createGain();
    this.reverbGain.gain.value = 0.5;
  }

async loadSample() {
  const url =
    "https://dl.dropboxusercontent.com/scl/fi/kouvzt916w2y4bnqc4cva/LD-1.wav?rlkey=q4q2qz72p91b6ueaqo8gplws9&st=echs7o93";

  const res = await fetch(url);
  const arrayBuf = await res.arrayBuffer();
  this.sampleBuffer = await this.audioCtx.decodeAudioData(arrayBuf);

  // ⭐ Make available to exportSong.js
  window.loadedLeadSample = this.sampleBuffer;

  console.log("LD-1 sample loaded", this.sampleBuffer);
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
    if (!this.sampleBuffer) return; // sample not ready yet

    const src = this.audioCtx.createBufferSource();
    src.buffer = this.sampleBuffer;

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
    // Dry → track
    gain.connect(window.trackGains[trackIndex]);

    // Wet → reverb → track
    gain.connect(this.reverb);
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(window.trackGains[trackIndex]);

    src.connect(gain);

    // --- Start/stop ---
    src.start(startTime);
    src.stop(startTime + duration + release);

    window.scheduledMidiVoices.push(src, gain);
  }
};
