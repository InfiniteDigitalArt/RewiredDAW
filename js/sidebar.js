let basicMidiClip = null;

// 2. Ensure otherLoops is a valid array
const otherLoops = Array.isArray(window.otherLoops) ? window.otherLoops : [];

// 3. Define populateSidebar
window.populateSidebar = function(loops) {
  const container = document.getElementById("sidebar-loops");
  container.innerHTML = "";

  loops.forEach(loop => {
    const item = document.createElement("div");
    item.className = "loop-item";
    item.draggable = true;

    if (loop.type === "audio") {
      // AUDIO LOOP
      item.classList.add("audio-loop");
      item.textContent = `${loop.displayName || loop.id} (${loop.bars} bars, ${loop.bpm} bpm)`;

      item.addEventListener("dragstart", () => {
        window.draggedLoop = {
          type: "audio",
          id: loop.id,
          url: loop.url,
          bpm: loop.bpm,
          bars: loop.bars
        };
      });

    } else if (loop.type === "midi") {
      // MIDI LOOP (lazy-loaded)
      item.classList.add("midi-loop");
      item.textContent = `${loop.displayName || loop.id} (MIDI)`;

      item.addEventListener("dragstart", () => {
        // Built-in MIDI clip has notes → use them
        if (loop.notes) {
          window.draggedLoop = {
            type: "midi",
            id: loop.id,
            notes: JSON.parse(JSON.stringify(loop.notes)),
            bars: loop.bars
          };
        } else {
          // Dropbox MIDI → lazy-load on drop
          window.draggedLoop = {
            type: "midi",
            id: loop.id,
            url: loop.url,
            displayName: loop.displayName
          };
        }
      });
    }

    item.addEventListener("dragend", () => {
      window.draggedLoop = null;
    });

    container.appendChild(item);
  });
};



window.addEventListener("DOMContentLoaded", () => {

  // ----------------------------------------------------
  // 1. Load AUDIO LOOPS (old system)
  // ----------------------------------------------------
  window.DROPBOX_LOOP_MAP = {};

  window.DROPBOX_LOOPS.forEach(url => {
    const filename = url.split("/").pop().split("?")[0];
    const meta = parseLoopMetadata(filename);

    if (!meta || !meta.loopId) return;

    window.DROPBOX_LOOP_MAP[meta.loopId] = {
      id: meta.loopId,
      url: url,
      bpm: meta.bpm,
      bars: meta.bars,
      displayName: meta.displayName,
      type: "audio"
    };
  });

  const audioLoops = Object.values(window.DROPBOX_LOOP_MAP);

  // ----------------------------------------------------
  // 2. MIDI METADATA (lazy-loaded on drop)
  // ----------------------------------------------------
  const midiLoops = Array.isArray(window.MIDI_LOOPS) ? window.MIDI_LOOPS : [];

  // ----------------------------------------------------
  // 3. Built-in MIDI clip (optional, pre-baked)
  // ----------------------------------------------------
  basicMidiClip = {
    id: "basic-midi-clip",
    type: "midi",
    displayName: "Basic MIDI Clip (C4 x4)",
    bars: 1,
    // you can keep notes here if you want this one pre-defined
    notes: [
      { pitch: 60, start: 0, end: 0.5 },
      { pitch: 60, start: 1, end: 1.5 },
      { pitch: 64, start: 2, end: 2.5 },
      { pitch: 67, start: 3, end: 3.5 }
    ]
  };

  // ----------------------------------------------------
  // 4. FINAL unified sidebar population (metadata only)
  // ----------------------------------------------------
  window.populateSidebar([
    basicMidiClip,
    ...midiLoops,
    ...audioLoops
  ]);
});
