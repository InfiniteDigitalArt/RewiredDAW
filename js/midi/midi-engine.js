window.MidiEngine = class MidiEngine {
  constructor(audioCtx) {
    this.audioCtx = audioCtx;
    this.instruments = {}; // name → synth instance
  }

  registerInstrument(name, synthInstance) {
    this.instruments[name] = synthInstance;
  }

  // startTime is ABSOLUTE SECONDS (from audioEngine)
  scheduleClip(clip, track, startTime) {
    const instrumentName = (track && track.instrument) || "basic-saw";
    const synth = this.instruments[instrumentName];
    if (!synth) {
      console.warn("No synth registered for instrument:", instrumentName);
      return;
    }

    const beatsPerBar = 4; // 4/4
    const clipLengthBeats = (clip.bars || 1) * beatsPerBar;
    const now = this.audioCtx.currentTime;

    clip.notes.forEach(note => {
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

      // Beats → bars
      const startBars    = noteStartBeats / beatsPerBar;
      const durationBars = durationBeats  / beatsPerBar;

      // Bars → seconds (relative to this clip's startTime, which is already in seconds)
      let noteStartSec = startTime + window.barsToSeconds(startBars);
      let durationSec  = window.barsToSeconds(durationBars);

      // Safety: guard against NaN / Infinity
      if (!isFinite(noteStartSec) || !isFinite(durationSec)) return;
      if (durationSec <= 0) return;

      // ⭐ Clamp notes that would start in the past (after seeking)
      if (noteStartSec < now) {
        const shift = now - noteStartSec;
        noteStartSec = now;
        durationSec = durationSec - shift;
        if (durationSec <= 0) return;
      }

      synth.playNoteFromClip(
        clip,
        note.pitch,
        noteStartSec,
        durationSec,
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

// Generate unique name for New MIDI Clip with auto-numbering
function generateUniqueNewMidiClipName(baseName) {
  // Check if baseName already exists
  const existingNames = window.clips
    .filter(c => c.type === "midi" && c.name)
    .map(c => c.name);
  
  if (!existingNames.includes(baseName)) {
    return baseName;
  }
  
  // Find the highest number used
  let maxNum = 0;
  const pattern = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} #(\\d+)$`);
  
  existingNames.forEach(name => {
    if (name === baseName) {
      maxNum = Math.max(maxNum, 0);
    }
    const match = name.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      maxNum = Math.max(maxNum, num);
    }
  });
  
  return `${baseName} #${maxNum + 1}`;
}