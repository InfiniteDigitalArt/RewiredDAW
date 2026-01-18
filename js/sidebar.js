let basicMidiClip = null;

// 2. Ensure otherLoops is a valid array
const otherLoops = Array.isArray(window.otherLoops) ? window.otherLoops : [];

// 3. Define populateSidebar
// Helper function to render pack folders recursively
function renderPackFolder(folderData, level = 0) {
  const folderDiv = document.createElement("div");
  folderDiv.className = "pack-folder";
  folderDiv.style.paddingLeft = `${level * 6}px`;

  const folderHeader = document.createElement("div");
  folderHeader.className = "pack-folder-header";
  folderHeader.innerHTML = `<span class="folder-icon">📁</span> ${folderData.name}`;
  
  const folderContent = document.createElement("div");
  folderContent.className = "pack-folder-content";
  folderContent.style.display = "none"; // Collapsed by default

  // Toggle folder on click
  folderHeader.addEventListener("click", () => {
    const isOpen = folderContent.style.display !== "none";
    folderContent.style.display = isOpen ? "none" : "block";
    folderHeader.querySelector(".folder-icon").textContent = isOpen ? "📁" : "📂";
  });

  // Render children (subfolders and files)
  if (folderData.children && folderData.children.length > 0) {
    folderData.children.forEach(child => {
      if (child.type === "folder") {
        folderContent.appendChild(renderPackFolder(child, level + 1));
      } else if (child.type === "audio" || child.type === "midi") {
        const fileItem = renderPackFile(child, level + 1);
        folderContent.appendChild(fileItem);
      }
    });
  }

  folderDiv.appendChild(folderHeader);
  folderDiv.appendChild(folderContent);
  return folderDiv;
}

// Helper function to render pack files (audio/midi)
function renderPackFile(fileData, level = 0) {
  const item = document.createElement("div");
  item.className = "loop-item";
  item.classList.add(fileData.type === "audio" ? "audio-loop" : "midi-loop");
  item.draggable = true;
  item.style.paddingLeft = `${level * 6}px`;

  // Display just the filename
  item.textContent = fileData.name;

  // Set up drag data
  item.addEventListener("dragstart", () => {
    const rawPath = `assets/packs/${fileData.path}`;
    // Encode spaces and special chars (#, parentheses) for fetch
    const encodedPath = encodeURI(rawPath).replace(/#/g, "%23");

    if (fileData.type === "audio") {
      window.draggedLoop = {
        type: "audio",
        packFile: true,
        path: encodedPath,
        rawPath,
        fileName: fileData.name
      };
    } else if (fileData.type === "midi") {
      window.draggedLoop = {
        type: "midi",
        packFile: true,
        path: encodedPath,
        rawPath,
        fileName: fileData.name
      };
    }
  });

  item.addEventListener("dragend", () => {
    window.draggedLoop = null;
  });

  return item;
}

// Define populateSidebar
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

    // ----------------------------------------------------
    // 5. Add PACKS section (from assets/packs.js)
    // ----------------------------------------------------
    if (window.PACKS && window.PACKS.length > 0) {
      const container = document.getElementById("sidebar-loops");
    
      // Add a separator
      const separator = document.createElement("div");
      separator.className = "sidebar-separator";
      separator.textContent = "— PACKS —";
      container.appendChild(separator);

      // Render each pack
      window.PACKS.forEach(pack => {
        if (pack.type === "folder") {
          container.appendChild(renderPackFolder(pack, 0));
        }
      });
    }
});
