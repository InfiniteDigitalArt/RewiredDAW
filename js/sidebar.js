// ---------------------------------------------
// 1. MANUAL FOLDER DEFINITIONS (supports nesting)
// ---------------------------------------------
// window.LOOP_FOLDERS = { ... };


// ---------------------------------------------
// 2. RENDERING HELPERS (recursive folder renderer)
// ---------------------------------------------
function renderFolder(container, name, content, loops) {
  const header = document.createElement("div");
  header.className = "loop-folder";
  header.textContent = name;

  const body = document.createElement("div");
  body.className = "loop-folder-content hidden";

  header.addEventListener("click", () => {
    Array.from(header.parentElement.children).forEach(el => {
      if (el !== body && el.classList.contains("loop-folder-content")) {
        el.classList.add("hidden");
      }
      if (el !== header && el.classList.contains("loop-folder")) {
        el.classList.remove("open");
      }
    });

    body.classList.toggle("hidden");
    header.classList.toggle("open");
  });

  container.appendChild(header);
  container.appendChild(body);

  // Array = list of loopIds
  if (Array.isArray(content)) {
    content.forEach(loopId => {
      const loop = loops[loopId];
      if (!loop) return;

      const item = document.createElement("div");
      item.className = "loop-item";
      item.title = loop.displayName || loop.id;

      item.draggable = true;

      if (loop.type === "audio") {
        item.classList.add("audio-loop");
        item.textContent = `${loop.displayName} (${loop.bpm} bpm)`;

        item.addEventListener("dragstart", () => {
          window.draggedLoop = {
            type: "audio",
            id: loop.id,
            url: loop.url,
            bpm: loop.bpm,
            bars: loop.bars
          };
        });
      }

      if (loop.type === "midi") {
        item.classList.add("midi-loop");
        item.textContent = `${loop.displayName} (MIDI)`;

        item.addEventListener("dragstart", () => {
          window.draggedLoop = {
            type: "midi",
            id: loop.id,
            url: loop.url,
            displayName: loop.displayName
          };
        });
      }

      item.addEventListener("dragend", () => {
        window.draggedLoop = null;
      });

      body.appendChild(item);
    });
  }

  // Object = nested folders
  else if (typeof content === "object") {
    Object.keys(content).forEach(subName => {
      renderFolder(body, subName, content[subName], loops);
    });
  }
}



// ---------------------------------------------
// 3. SIDEBAR POPULATION
// ---------------------------------------------
window.populateSidebar = function() {
  console.log("MIDI_LOOPS:", window.MIDI_LOOPS);
console.log("DROPBOX_LOOP_MAP:", window.DROPBOX_LOOP_MAP);
console.log("LOOP_FOLDERS:", window.LOOP_FOLDERS);


  const container = document.getElementById("sidebar-loops");
  container.innerHTML = "";

  const loops = window.DROPBOX_LOOP_MAP || {};

  if (window.LOOP_FOLDERS) {
    Object.keys(window.LOOP_FOLDERS).forEach(folderName => {
      renderFolder(container, folderName, window.LOOP_FOLDERS[folderName], loops);
    });
  }
};

// ---------------------------------------------
// 4. INIT
// ---------------------------------------------

window.addEventListener("DOMContentLoaded", () => {

  window.DROPBOX_LOOP_MAP = {};

  window.DROPBOX_LOOPS.forEach(url => {
    const filename = decodeURIComponent(url.split("/").pop().split("?")[0]);


    // AUDIO (.wav)
    if (filename.toLowerCase().endsWith(".wav")) {
      const meta = parseLoopMetadata(filename);
      if (!meta || !meta.loopId) return;

      window.DROPBOX_LOOP_MAP[meta.loopId] = {
        id: meta.loopId,
        url,
        bpm: meta.bpm,
        bars: meta.bars,
        displayName: meta.displayName,
        type: "audio"
      };
    }

    // MIDI (.mid)
    else if (filename.toLowerCase().endsWith(".mid")) {
      const id = filename.replace(".mid", "");

      window.DROPBOX_LOOP_MAP[id] = {
        id,
        url,
        displayName: id,
        type: "midi"
      };
    }
  });

  window.populateSidebar();
});
