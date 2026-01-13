console.log("midi-clip.js loaded");

window.MidiClip = class MidiClip {
  constructor(startBar, bars) {
    this.id = crypto.randomUUID();
    this.type = "midi";
    this.startBar = startBar;
    this.bars = bars;
    this.notes = [];
    this.sampleName = window.defaultMidiSampleName || "LD-1.wav";
  }

  addNote(pitch, start, end, velocity = 0.8) {
    this.notes.push({ pitch, start, end, velocity });
  }

  removeNote(index) {
    this.notes.splice(index, 1);
  }
};
