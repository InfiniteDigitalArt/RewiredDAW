// midi-engine.js

window.MidiEngine = class MidiEngine {
  constructor(audioCtx) {
    this.audioCtx = audioCtx;
    this.instruments = {}; // name → synth instance
  }

  registerInstrument(name, synthInstance) {
    this.instruments[name] = synthInstance;
  }

  scheduleClip(clip, track, startTime) {
    const instrumentName = (track && track.instrument) || "basic-saw";
    const synth = this.instruments[instrumentName];
    if (!synth) {
      console.warn("No synth registered for instrument:", instrumentName);
      return;
    }

    const beatsPerBar = 4; // standard 4/4

    clip.notes.forEach(note => {
      // Convert beats → bars
      const startBars = note.start / beatsPerBar;
      const durationBars = (note.end - note.start) / beatsPerBar;

      const noteStart = startTime + window.barsToSeconds(startBars);
      const duration = window.barsToSeconds(durationBars);

      synth.playNote(
        note.pitch,
        noteStart,
        duration,
        note.velocity || 0.8
      );
      

    });
  }

};
