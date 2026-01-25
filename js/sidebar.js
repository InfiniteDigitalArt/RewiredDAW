// ---------------------------------------------
// 1. MANUAL FOLDER DEFINITIONS (supports nesting)
// ---------------------------------------------
// window.LOOP_FOLDERS = { ... };


// ---------------------------------------------
// 2. RENDERING HELPERS (recursive folder renderer)
// ---------------------------------------------

const audioPreviewState = {
  bufferCache: new Map(),
  buffer: null,
  source: null,
  rafId: null,
  startTime: 0,
  duration: 0,
  currentLoopId: null,
  pendingLoopId: null
};

const midiPreviewState = {
  midiCache: new Map(),
  notes: [],
  voices: [],
  rafId: null,
  startTime: 0,
  duration: 0,
  currentLoopId: null,
  pendingLoopId: null
};

function setPreviewPlaying(isPlaying) {
  const previewContainer = document.getElementById("audio-preview");
  if (previewContainer) {
    previewContainer.classList.toggle("is-playing", isPlaying);
  }
}

function resetPreviewPlayhead(hide = true) {
  const playheadEl = document.getElementById("audio-preview-playhead");
  if (!playheadEl) return;

  playheadEl.style.transform = "translateX(0px)";
  if (hide) playheadEl.classList.add("hidden");
}

function stopAudioPreview({ hidePlayhead = true, clearPending = true } = {}) {
  if (clearPending) {
    audioPreviewState.pendingLoopId = null;
  }

  if (audioPreviewState.source) {
    try { audioPreviewState.source.onended = null; } catch (e) {}
    try { audioPreviewState.source.stop(); } catch (e) {}
    try { audioPreviewState.source.disconnect(); } catch (e) {}
    audioPreviewState.source = null;
  }

  if (audioPreviewState.rafId) {
    cancelAnimationFrame(audioPreviewState.rafId);
    audioPreviewState.rafId = null;
  }

  setPreviewPlaying(false);
  if (hidePlayhead) resetPreviewPlayhead(true);
}

function stopMidiPreview({ hidePlayhead = true, clearPending = true } = {}) {
  if (clearPending) {
    midiPreviewState.pendingLoopId = null;
  }

  // Stop all MIDI voices
  midiPreviewState.voices.forEach(voice => {
    try { voice.source.stop(); } catch (e) {}
    try { voice.source.disconnect(); } catch (e) {}
    try { voice.gain.disconnect(); } catch (e) {}
  });
  midiPreviewState.voices = [];

  if (midiPreviewState.rafId) {
    cancelAnimationFrame(midiPreviewState.rafId);
    midiPreviewState.rafId = null;
  }

  const midiContainer = document.getElementById("midi-preview");
  if (midiContainer) {
    midiContainer.classList.remove("is-playing");
  }

  if (hidePlayhead) {
    const playheadEl = document.getElementById("midi-preview-playhead");
    if (playheadEl) {
      playheadEl.style.transform = "translateX(0px)";
      playheadEl.classList.add("hidden");
    }
  }
}

function updatePreviewPlayhead() {
  const waveformEl = document.getElementById("audio-preview-waveform");
  const playheadEl = document.getElementById("audio-preview-playhead");

  if (!waveformEl || !playheadEl || !audioPreviewState.source) return;

  const elapsed = Math.max(0, audioContext.currentTime - audioPreviewState.startTime);
  const progress = audioPreviewState.duration > 0
    ? Math.min(elapsed / audioPreviewState.duration, 1)
    : 0;

  const x = waveformEl.clientWidth * progress;
  playheadEl.style.transform = `translateX(${x}px)`;

  if (progress >= 1) {
    stopAudioPreview({ hidePlayhead: true, clearPending: true });
    return;
  }

  audioPreviewState.rafId = requestAnimationFrame(updatePreviewPlayhead);
}

async function playAudioPreview() {
  if (!audioPreviewState.buffer) return;

  stopAudioPreview({ hidePlayhead: false, clearPending: false });

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  const source = audioContext.createBufferSource();
  source.buffer = audioPreviewState.buffer;
  source.connect(window.masterGain || audioContext.destination);

  audioPreviewState.source = source;
  audioPreviewState.startTime = audioContext.currentTime;
  audioPreviewState.duration = source.buffer.duration;

  const playheadEl = document.getElementById("audio-preview-playhead");
  if (playheadEl) playheadEl.classList.remove("hidden");

  setPreviewPlaying(true);

  source.onended = () => stopAudioPreview({ hidePlayhead: true, clearPending: true });

  audioPreviewState.rafId = requestAnimationFrame(updatePreviewPlayhead);
  source.start();
}

async function loadPreviewBuffer(loop) {
  if (audioPreviewState.bufferCache.has(loop.id)) {
    return audioPreviewState.bufferCache.get(loop.id);
  }

  const response = await fetch(loop.url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await window.audioContext.decodeAudioData(arrayBuffer);

  audioPreviewState.bufferCache.set(loop.id, audioBuffer);
  return audioBuffer;
}

async function loadMidiFile(loop) {
  if (midiPreviewState.midiCache.has(loop.id)) {
    return midiPreviewState.midiCache.get(loop.id);
  }

  const response = await fetch(loop.url);
  const arrayBuffer = await response.arrayBuffer();
  
  // Use Tone.js MIDI parser
  const midi = new Midi(arrayBuffer);
  
  // Extract notes from all tracks
  const allNotes = [];
  midi.tracks.forEach(track => {
    track.notes.forEach(note => {
      allNotes.push({
        pitch: note.midi,
        start: note.time,
        duration: note.duration,
        velocity: note.velocity
      });
    });
  });

  // Sort by start time
  allNotes.sort((a, b) => a.start - b.start);

  const midiData = {
    notes: allNotes,
    duration: midi.duration
  };

  midiPreviewState.midiCache.set(loop.id, midiData);
  return midiData;
}

function updateMidiPlayhead() {
  const waveformEl = document.getElementById("midi-preview-waveform");
  const playheadEl = document.getElementById("midi-preview-playhead");

  if (!waveformEl || !playheadEl || midiPreviewState.voices.length === 0) return;

  const elapsed = Math.max(0, audioContext.currentTime - midiPreviewState.startTime);
  const progress = midiPreviewState.duration > 0
    ? Math.min(elapsed / midiPreviewState.duration, 1)
    : 0;

  const x = waveformEl.clientWidth * progress;
  playheadEl.style.transform = `translateX(${x}px)`;

  if (progress >= 1) {
    stopMidiPreview({ hidePlayhead: true, clearPending: true });
    return;
  }

  midiPreviewState.rafId = requestAnimationFrame(updateMidiPlayhead);
}

async function playMidiPreview() {
  if (!midiPreviewState.notes || midiPreviewState.notes.length === 0) return;

  stopMidiPreview({ hidePlayhead: false, clearPending: false });

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  const now = audioContext.currentTime;
  midiPreviewState.startTime = now;
  midiPreviewState.voices = [];

  // Use default MIDI sample if available
  const sampleBuffer = window.defaultMidiSampleBuffer;
  if (!sampleBuffer) {
    console.warn("No MIDI sample buffer loaded");
    return;
  }

  // Schedule all notes
  midiPreviewState.notes.forEach(note => {
    const startTime = now + note.start;
    const duration = note.duration;

    const source = audioContext.createBufferSource();
    source.buffer = sampleBuffer;

    // MIDI pitch to playbackRate
    const semitone = note.pitch - 60;
    source.playbackRate.value = Math.pow(2, semitone / 12);

    const gain = audioContext.createGain();
    const velocity = note.velocity || 0.8;

    // Simple ADSR
    const attack = 0.001;
    const release = 0.05;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(velocity * 0.6, startTime + attack);
    gain.gain.setValueAtTime(velocity * 0.6, startTime + duration);
    gain.gain.linearRampToValueAtTime(0.0001, startTime + duration + release);

    source.connect(gain);
    gain.connect(window.masterGain || audioContext.destination);

    source.start(startTime);
    source.stop(startTime + duration + release);

    midiPreviewState.voices.push({ source, gain });
  });

  const playheadEl = document.getElementById("midi-preview-playhead");
  if (playheadEl) playheadEl.classList.remove("hidden");

  const midiContainer = document.getElementById("midi-preview");
  if (midiContainer) midiContainer.classList.add("is-playing");

  midiPreviewState.rafId = requestAnimationFrame(updateMidiPlayhead);
}

// Show audio preview with waveform
async function showAudioPreview(loop) {
  const previewContainer = document.getElementById("audio-preview");
  const filenameEl = previewContainer.querySelector(".audio-preview-filename");
  const canvas = document.getElementById("audio-preview-canvas");

  // Stop both audio and MIDI previews
  stopAudioPreview({ hidePlayhead: true, clearPending: false });
  stopMidiPreview({ hidePlayhead: true, clearPending: true });

  // Hide MIDI preview
  const midiContainer = document.getElementById("midi-preview");
  if (midiContainer) midiContainer.classList.add("hidden");

  audioPreviewState.pendingLoopId = loop.id;
  audioPreviewState.currentLoopId = loop.id;

  // Show container and update filename
  previewContainer.classList.remove("hidden");
  filenameEl.textContent = loop.displayName;

  // --- Show loading overlay ---
  const waveformArea = previewContainer.querySelector('.audio-preview-waveform');
  let loadingOverlay = waveformArea.querySelector('.audio-preview-loading');
  if (!loadingOverlay) {
    loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'audio-preview-loading';
    loadingOverlay.innerHTML = '<div class="spinner"></div> Loading...';
    waveformArea.appendChild(loadingOverlay);
  }
  loadingOverlay.style.display = 'flex';

  // Draw waveform
  try {
    const audioBuffer = await loadPreviewBuffer(loop);
    if (audioPreviewState.pendingLoopId !== loop.id) {
      loadingOverlay.style.display = "none";
      return;
    }

    audioPreviewState.buffer = audioBuffer;
    drawWaveform(canvas, audioBuffer);
    resetPreviewPlayhead();

    loadingOverlay.style.display = "none";
    await playAudioPreview();
  } catch (error) {
    loadingOverlay.style.display = "none";
    console.error("Error loading audio for preview:", error);
    filenameEl.textContent = `${loop.displayName} (Error loading)`;
    stopAudioPreview();
  }
}

// Show MIDI preview with piano roll
async function showMidiPreview(loop) {
  const midiContainer = document.getElementById("midi-preview");
  const filenameEl = midiContainer.querySelector(".audio-preview-filename");
  const canvas = document.getElementById("midi-preview-canvas");

  // Stop both audio and MIDI previews
  stopAudioPreview({ hidePlayhead: true, clearPending: true });
  stopMidiPreview({ hidePlayhead: true, clearPending: false });
  
  // Hide audio preview
  const audioContainer = document.getElementById("audio-preview");
  if (audioContainer) audioContainer.classList.add("hidden");
  
  midiPreviewState.pendingLoopId = loop.id;
  midiPreviewState.currentLoopId = loop.id;
  
  // Show container and update filename
  midiContainer.classList.remove("hidden");
  filenameEl.textContent = loop.displayName;
  
  // Load and draw MIDI
  try {
    const midiData = await loadMidiFile(loop);
    if (midiPreviewState.pendingLoopId !== loop.id) return;

    midiPreviewState.notes = midiData.notes;
    midiPreviewState.duration = midiData.duration;
    
    drawMidiNotes(canvas, midiData.notes, midiData.duration);
    
    const playheadEl = document.getElementById("midi-preview-playhead");
    if (playheadEl) {
      playheadEl.style.transform = "translateX(0px)";
      playheadEl.classList.add("hidden");
    }

    await playMidiPreview();
  } catch (error) {
    console.error("Error loading MIDI for preview:", error);
    filenameEl.textContent = `${loop.displayName} (Error loading)`;
    stopMidiPreview();
  }
}

// Show empty MIDI preview
function showEmptyMidiPreview() {
  const midiContainer = document.getElementById("midi-preview");
  const filenameEl = midiContainer.querySelector(".audio-preview-filename");
  const canvas = document.getElementById("midi-preview-canvas");

  // Stop both audio and MIDI previews
  stopAudioPreview({ hidePlayhead: true, clearPending: true });
  stopMidiPreview({ hidePlayhead: true, clearPending: true });
  
  // Hide audio preview
  const audioContainer = document.getElementById("audio-preview");
  if (audioContainer) audioContainer.classList.add("hidden");
  
  midiPreviewState.pendingLoopId = "empty-midi";
  midiPreviewState.currentLoopId = "empty-midi";
  
  // Show container and update filename
  midiContainer.classList.remove("hidden");
  filenameEl.textContent = "New MIDI Clip";
  
  // Draw empty piano roll
  midiPreviewState.notes = [];
  midiPreviewState.duration = 4; // 4 seconds = 1 bar at 120 BPM
  
  drawMidiNotes(canvas, [], 4);
  
  const playheadEl = document.getElementById("midi-preview-playhead");
  if (playheadEl) {
    playheadEl.style.transform = "translateX(0px)";
    playheadEl.classList.add("hidden");
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

function drawMidiNotes(canvas, notes, duration) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.offsetWidth;
  const height = canvas.height = canvas.offsetHeight;
  
  // Clear canvas
  ctx.fillStyle = "#0f0f12";
  ctx.fillRect(0, 0, width, height);
  
  if (!notes || notes.length === 0 || duration <= 0) return;
  
  // Find pitch range
  let minPitch = 127;
  let maxPitch = 0;
  notes.forEach(note => {
    if (note.pitch < minPitch) minPitch = note.pitch;
    if (note.pitch > maxPitch) maxPitch = note.pitch;
  });
  
  // Add padding to pitch range
  const pitchRange = Math.max(maxPitch - minPitch, 12);
  minPitch = Math.max(0, minPitch - 2);
  maxPitch = Math.min(127, minPitch + pitchRange + 4);
  
  const pitchHeight = height / (maxPitch - minPitch + 1);
  
  // Create gradient for notes
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#ff3380");
  gradient.addColorStop(0.5, "#ac2257");
  gradient.addColorStop(1, "#5e122f");
  
  ctx.fillStyle = gradient;
  
  // Draw each note
  notes.forEach(note => {
    const x = (note.start / duration) * width;
    const w = Math.max(2, (note.duration / duration) * width);
    const y = height - ((note.pitch - minPitch + 1) * pitchHeight);
    const h = pitchHeight * 0.9;
    
    ctx.fillRect(x, y, w, h);
  });
  
  // Add glow effect
  ctx.shadowBlur = 4;
  ctx.shadowColor = "rgba(255, 51, 128, 0.4)";
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.3;
  
  notes.forEach(note => {
    const x = (note.start / duration) * width;
    const w = Math.max(2, (note.duration / duration) * width);
    const y = height - ((note.pitch - minPitch + 1) * pitchHeight);
    const h = pitchHeight * 0.9;
    
    ctx.fillRect(x, y, w, h);
  });
  
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

      // Helper: is this a one-shot? (by folder or filename)
      const parentName = name.toLowerCase();
      const isOneShot = (
        ["kicks", "claps", "snare", "snare builds", "percussion", "leads", "bass", "fx", "samples"].some(cat => parentName.includes(cat)) ||
        /kick|clap|snare|perc|lead|bass|fx|one[-_]?shot/i.test(loop.displayName)
      );

      if (loop.type === "audio") {
        item.classList.add("audio-loop");
        // Only show the displayName, never append bpm/tempo
        item.textContent = loop.displayName;

        item.addEventListener("dragstart", () => {
          window.draggedLoop = {
            type: "audio",
            id: loop.id,
            url: loop.url,
            bpm: loop.bpm,
            bars: loop.bars,
            displayName: loop.displayName || loop.id || "SidebarAudio.wav"
          };
        });

        // Add click handler for audio preview
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          // Highlight this item, remove highlight from others
          highlightSidebarItem(item);
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

        // Add click handler for MIDI preview
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          // Highlight this item, remove highlight from others
          highlightSidebarItem(item);
          showMidiPreview(loop);
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

// Helper to highlight the selected sidebar item
function highlightSidebarItem(selectedEl) {
  // Remove 'selected' from all .loop-item elements
  document.querySelectorAll("#sidebar-loops .loop-item.selected").forEach(el => {
    el.classList.remove("selected");
  });
  // Add 'selected' to the clicked element
  if (selectedEl) selectedEl.classList.add("selected");
}



// ---------------------------------------------
// 3. SIDEBAR POPULATION
// ---------------------------------------------
window.populateSidebar = function() {



  const container = document.getElementById("sidebar-loops");
  container.innerHTML = "";

  // Add Browser header
  const browserHeader = document.createElement("div");
  browserHeader.className = "browser-header";
  browserHeader.textContent = "Browser";
  container.appendChild(browserHeader);

  // Add separator
  const separator = document.createElement("div");
  separator.className = "browser-separator";
  container.appendChild(separator);

  // Add Empty MIDI item at the top
  const emptyMidiItem = document.createElement("div");
  emptyMidiItem.className = "loop-item midi-loop";
  emptyMidiItem.textContent = "New MIDI Clip";
  emptyMidiItem.title = "Drag to create an empty MIDI clip";
  emptyMidiItem.draggable = true;

  emptyMidiItem.addEventListener("dragstart", () => {
    window.draggedLoop = {
      type: "midi",
      id: "empty-midi",
      displayName: "New MIDI Clip",
      notes: [],
      bars: 1
    };
  });

  emptyMidiItem.addEventListener("dragend", () => {
    window.draggedLoop = null;
  });

  // Add click handler for empty MIDI preview (shows empty piano roll)
  emptyMidiItem.addEventListener("click", (e) => {
    e.stopPropagation();
    highlightSidebarItem(emptyMidiItem);
    showEmptyMidiPreview();
  });

  container.appendChild(emptyMidiItem);

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

  const previewPlayBtn = document.getElementById("audio-preview-play");
  const previewStopBtn = document.getElementById("audio-preview-stop");

  if (previewPlayBtn) {
    previewPlayBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await playAudioPreview();
    });
  }

  if (previewStopBtn) {
    previewStopBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      stopAudioPreview({ hidePlayhead: true, clearPending: true });
    });
  }

  const midiPlayBtn = document.getElementById("midi-preview-play");
  const midiStopBtn = document.getElementById("midi-preview-stop");

  if (midiPlayBtn) {
    midiPlayBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await playMidiPreview();
    });
  }

  if (midiStopBtn) {
    midiStopBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      stopMidiPreview({ hidePlayhead: true, clearPending: true });
    });
  }

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

  // ===== SEARCH FUNCTIONALITY =====
  const searchInput = document.getElementById("sidebar-search");
  const searchClearBtn = document.getElementById("sidebar-search-clear");
  const sidebarLoopsContainer = document.getElementById("sidebar-loops");

  function filterSidebarItems(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    const allFolders = sidebarLoopsContainer.querySelectorAll(".loop-folder");
    const allItems = sidebarLoopsContainer.querySelectorAll(".loop-item");

    if (!term) {
      // Show all
      allFolders.forEach(folder => folder.classList.remove("hidden", "search-no-match"));
      allItems.forEach(item => item.classList.remove("hidden", "search-no-match"));
      sidebarLoopsContainer.querySelectorAll(".loop-folder-content").forEach(content => {
        content.classList.add("hidden");
      });
      return;
    }

    let hasAnyMatch = false;

    // Hide all first
    allFolders.forEach(folder => folder.classList.add("search-no-match"));
    allItems.forEach(item => item.classList.add("hidden", "search-no-match"));
    sidebarLoopsContainer.querySelectorAll(".loop-folder-content").forEach(content => {
      content.classList.add("hidden");
    });

    // Show matching items
    allItems.forEach(item => {
      if (item.textContent.toLowerCase().includes(term)) {
        item.classList.remove("hidden", "search-no-match");
        hasAnyMatch = true;
      }
    });

    // Show folders that contain matching items or match the search term
    allFolders.forEach(folder => {
      const folderName = folder.textContent.toLowerCase();
      const nextContent = folder.nextElementSibling;

      if (!nextContent || !nextContent.classList.contains("loop-folder-content")) return;

      const hasMatchingChild = nextContent.querySelector(".loop-item:not(.search-no-match)");

      if (folderName.includes(term)) {
        // Folder name matches
        folder.classList.remove("search-no-match");
        nextContent.classList.remove("hidden");
        folder.classList.add("open");
      } else if (hasMatchingChild) {
        // Has matching children
        folder.classList.remove("search-no-match");
        nextContent.classList.remove("hidden");
        folder.classList.add("open");
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const value = e.target.value;
      filterSidebarItems(value);

      // Show/hide clear button
      if (searchClearBtn) {
        searchClearBtn.style.display = value ? "flex" : "none";
      }
    });
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener("click", () => {
      if (searchInput) {
        searchInput.value = "";
        filterSidebarItems("");
        searchClearBtn.style.display = "none";
        searchInput.focus();
        // Remove highlight from all sidebar items
        document.querySelectorAll("#sidebar-loops .loop-item.selected").forEach(el => {
          el.classList.remove("selected");
        });
      }
    });
  }
});