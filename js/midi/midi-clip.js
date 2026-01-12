// midi-clip.js

export class MidiClip {
  constructor(start, end) {
    this.id = crypto.randomUUID();
    this.start = start;
    this.end = end;

    this.notes = []; 
    // Each note: { pitch, start, end, velocity }
  }

  addNote(pitch, start, end, velocity = 0.8) {
    this.notes.push({ pitch, start, end, velocity });
  }

  removeNote(index) {
    this.notes.splice(index, 1);
  }
}

const basicMidiClip = {
  id: "basic-midi-clip",
  type: "midi",
  displayName: "Basic MIDI Clip (C4 x4)",
  notes: [
    { pitch: 60, start: 0, end: 0.5 }, // beat 1
    { pitch: 60, start: 1, end: 1.5 }, // beat 2
    { pitch: 64, start: 2, end: 2.5 }, // beat 3
    { pitch: 67, start: 3, end: 3.5 }  // beat 4
  ],
  bars: 1,

  bpm: 120 // irrelevant for MIDI but keeps structure consistent
};
