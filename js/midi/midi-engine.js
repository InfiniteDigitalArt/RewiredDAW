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
    const clipLengthBeats = (clip.bars || 1) * beatsPerBar;

    clip.notes.forEach(note => {
      // Note times are in BEATS, relative to clip start
      let noteStartBeats = note.start;
      let noteEndBeats   = note.end;

      // Skip notes that start entirely beyond the trimmed clip
      if (noteStartBeats >= clipLengthBeats) return;

      // Clamp notes that extend past the clip boundary
      if (noteEndBeats > clipLengthBeats) {
        noteEndBeats = clipLengthBeats;
      }

      const durationBeats = noteEndBeats - noteStartBeats;
      if (durationBeats <= 0) return;

      // Convert beats → bars (same pattern you already used)
      const startBars    = noteStartBeats / beatsPerBar;
      const durationBars = durationBeats  / beatsPerBar;

      const noteStart = startTime + window.barsToSeconds(startBars);
      const duration  = window.barsToSeconds(durationBars);

    synth.playNoteFromClip(
      clip,
      note.pitch,
      noteStart,
      duration,
      note.velocity || 0.8,
      clip.trackIndex ?? 0
    );

    });
  }
};

function generateMidiClipName() {
  const num = String(window.midiClipCounter).padStart(3, "0");
  window.midiClipCounter++;
  return `MIDI Clip ${num}`;
}
