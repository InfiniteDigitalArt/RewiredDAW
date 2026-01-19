// ---------------------------------------------
// 1. MANUAL FOLDER DEFINITIONS (supports nesting)
// ---------------------------------------------
// window.LOOP_FOLDERS = { ... };


// ---------------------------------------------
// 2. RENDERING HELPERS (recursive folder renderer)
// ---------------------------------------------

// Show audio preview with waveform
async function showAudioPreview(loop) {
  const previewContainer = document.getElementById("audio-preview");
  const filenameEl = previewContainer.querySelector(".audio-preview-filename");
  const canvas = document.getElementById("audio-preview-canvas");
  
  // Show container and update filename
  previewContainer.classList.remove("hidden");
  filenameEl.textContent = loop.displayName;
  
  // Draw waveform
  try {
    // Fetch and decode audio
    const response = await fetch(loop.url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await window.audioContext.decodeAudioData(arrayBuffer);
    
    // Draw waveform on canvas
    drawWaveform(canvas, audioBuffer);
  } catch (error) {
    console.error("Error loading audio for preview:", error);
    filenameEl.textContent = `${loop.displayName} (Error loading)`;
  }
}

function drawWaveform(canvas, audioBuffer) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.offsetWidth;
  const height = canvas.height = canvas.offsetHeight;
  
  // Clear canvas
  ctx.fillStyle = "#0f0f12";
  ctx.fillRect(0, 0, width, height);
  
  // Get channel data
  const channelData = audioBuffer.getChannelData(0);
  const step = Math.max(1, Math.floor(channelData.length / width));
  const amp = height / 2;
  
  // Find peak value for normalization
  let peakValue = 0;
  for (let i = 0; i < channelData.length; i++) {
    const absValue = Math.abs(channelData[i]);
    if (absValue > peakValue) peakValue = absValue;
  }
  
  // Avoid division by zero
  const normalizationFactor = peakValue > 0 ? 1 / peakValue : 1;
  
  // Create vertical gradient for waveform
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#ff3380");    // Pink at top
  gradient.addColorStop(0.5, "#ac2257");  // Purple in middle
  gradient.addColorStop(1, "#5e122f");    // Blue at bottom
  
  ctx.fillStyle = gradient;
  
  for (let i = 0; i < width; i++) {
    let min = 1.0;
    let max = -1.0;
    
    const start = i * step;
    const end = Math.min(channelData.length, start + step);
    
    for (let j = start; j < end; j++) {
      const v = channelData[j] * normalizationFactor;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    
    ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
  }
  
  // Add subtle glow effect
  ctx.shadowBlur = 8;
  ctx.shadowColor = "rgba(153, 69, 255, 0.3)";
  
  // Redraw with glow (lighter pass)
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.4;
  
  for (let i = 0; i < width; i++) {
    let min = 1.0;
    let max = -1.0;
    
    const start = i * step;
    const end = Math.min(channelData.length, start + step);
    
    for (let j = start; j < end; j++) {
      const v = channelData[j] * normalizationFactor;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    
    ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
  }
  
  // Reset composite mode
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1.0;
  ctx.shadowBlur = 0;
}

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

        // Add click handler for audio preview
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          showAudioPreview(loop);
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