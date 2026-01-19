console.log("midi-clip.js loaded");

window.MidiClip = class MidiClip {
  constructor(startBar, bars) {
    this.id = crypto.randomUUID();
    this.type = "midi";
    this.startBar = startBar;
    this.bars = bars;
    this.notes = [];

    // --- Per-clip sample ---
    this.sampleName = window.defaultMidiSampleName || "LD-1.wav";
    this.sampleBuffer = window.defaultMidiSampleBuffer || null;

    // --- Per-clip reverb ---
    this.reverb = audioContext.createConvolver();
    this.reverb.buffer = window.makeSmallReverbBuffer(audioContext);


    // High pass filter for reverb (wet only)
    this.reverbHighPass = audioContext.createBiquadFilter();
    this.reverbHighPass.type = "highpass";
    this.reverbHighPass.frequency.value = 300; // Remove bass below 300Hz (adjust as needed)

    this.reverbGain = audioContext.createGain();
    this.reverbGain.gain.value = 0; // default wet amount

    // Connect clip reverb → highpass → reverbGain → master
    this.reverb.connect(this.reverbHighPass);
    this.reverbHighPass.connect(this.reverbGain);
    this.reverbGain.connect(audioContext.destination);
  }

  addNote(pitch, start, end, velocity = 0.8) {
    this.notes.push({ pitch, start, end, velocity });
  }

  removeNote(index) {
    this.notes.splice(index, 1);
  }
};