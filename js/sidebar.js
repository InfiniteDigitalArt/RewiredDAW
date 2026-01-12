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
      item.textContent = `${loop.displayName || loop.id || "Unnamed Loop"} (${loop.bars} bars, ${loop.bpm} bpm)`;
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
      item.textContent = `${loop.displayName || loop.id || "Unnamed Loop"} (MIDI)`;
      item.addEventListener("dragstart", () => {
        window.draggedLoop = {
          type: "midi",
          id: loop.id,
          notes: JSON.parse(JSON.stringify(loop.notes)),
          bars: loop.bars
        };
        console.log("DRAGSTART NOTES:", loop.notes);
      });
    }

    item.addEventListener("dragend", () => {
      window.draggedLoop = null;
    });

    container.appendChild(item);
  });
};

// 4. Wait for DOM before populating sidebar
window.addEventListener("DOMContentLoaded", () => {
  console.log("DOMContentLoaded. MidiClip is:", window.MidiClip);

  // Now MidiClip DEFINITELY exists
  basicMidiClip = new MidiClip(0, 1);
  basicMidiClip.id = "basic-midi-clip";
  basicMidiClip.displayName = "Basic MIDI Clip (C4 x4)";
  basicMidiClip.notes = [
    { pitch: 60, start: 0, end: 0.5 },
    { pitch: 60, start: 1, end: 1.5 },
    { pitch: 64, start: 2, end: 2.5 },
    { pitch: 67, start: 3, end: 3.5 }
  ];

  window.populateSidebar([basicMidiClip, ...otherLoops]);
});
