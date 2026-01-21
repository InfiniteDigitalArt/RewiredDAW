window.playheadInterval = null;
window.playheadStartTime = 0;
window.playheadRAF = null;
window.isDuplicateDrag = false;
window.shiftDown = false;
window.midiClipCounter = 1;





// main.js

// --- AUDIO CONTEXT ---
// IMPORTANT: use the existing global audioContext, not a new one
const audioCtx = window.audioContext;

// --- MIDI ENGINE ---
const midiEngine = new window.MidiEngine(audioCtx);
midiEngine.registerInstrument("basic-saw", new window.BasicSawSynth(audioCtx));

// --- UI INIT ---
window.initPianoRoll();

// --- GLOBAL MIDI SCHEDULER HOOK ---
window.onScheduleMidiClip = (clip, track, startTime) => {
  midiEngine.scheduleClip(clip, track, startTime);
};






window.addEventListener("keydown", e => {
  if (e.key === "Shift") window.shiftDown = true;
  
  // Space bar: play/stop piano roll preview if open, otherwise play/stop main song
  if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
    e.preventDefault();
    const pianoRollContainer = document.getElementById("piano-roll-container");
    const isPianoRollOpen = pianoRollContainer && !pianoRollContainer.classList.contains("hidden");
    
    if (isPianoRollOpen) {
      // Piano roll is open - toggle piano roll preview
      const playBtn = document.getElementById("piano-roll-preview-play");
      const stopBtn = document.getElementById("piano-roll-preview-stop");
      if (window.pianoRollPreviewState && window.pianoRollPreviewState.isPlaying) {
        // Currently playing - stop it
        if (stopBtn) stopBtn.click();
      } else {
        // Not playing - start it
        if (playBtn) playBtn.click();
      }
    } else {
      // Piano roll is not open - toggle main song playback
      const playToggleBtn = document.getElementById("playToggleBtn");
      if (playToggleBtn) playToggleBtn.click();
    }
  }
});

window.addEventListener("keyup", e => {
  if (e.key === "Shift") window.shiftDown = false;
});


window.addEventListener("DOMContentLoaded", () => {



  // Everything below MUST be inside DOMContentLoaded
  initTimeline();

  document.getElementById("saveProjectBtn").addEventListener("click", saveProjectZip);

  const playToggleBtn = document.getElementById("playToggleBtn");
  const transportLabel = document.getElementById("transportLabel");

  playToggleBtn.addEventListener("click", async () => {
    if (!window.isPlaying) {
      // Stop piano roll preview when starting main playback
      if (window.stopPianoRollPreview) {
        window.stopPianoRollPreview();
      }
      
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const realStart = playAll(window.seekBars || 0);
      startPlayhead(realStart);
      document.getElementById("playhead").classList.remove("hidden");

      playToggleBtn.textContent = "Stop";
      playToggleBtn.classList.add("active");

      if (transportLabel) {
        transportLabel.textContent = "Playing";
        transportLabel.classList.add("playing");
      }

    } else {
      stopAll();
      stopPlayhead();

      playToggleBtn.textContent = "Play";
      playToggleBtn.classList.remove("active");
      document.getElementById("playhead").classList.add("hidden");

      if (transportLabel) {
        transportLabel.textContent = "Stopped";
        transportLabel.classList.remove("playing");
      }
    }
  });

  // Set activeClip when dropdown changes
  const clipDropdown = document.getElementById("clipListDropdown");
  if (clipDropdown) {
    clipDropdown.addEventListener("change", function() {
      const selectedName = this.value;
      window.activeClip = window.clips.find(c => (c.name || c.fileName || c.id) === selectedName) || null;
        activeClip = clip;
  window.activeClip = activeClip;
  updatePianoRollSampleHeader();
    });
  }

}); // ← only ONE closing brace



const tempoSlider = document.getElementById("tempoSlider");
const tempoValue = document.getElementById("tempoValue");

function applyProjectTempo(rawBpm, { updateUI = true } = {}) {
  let bpm = Number(rawBpm);
  if (!isFinite(bpm)) bpm = 175;

  // Keep in the same range as the UI control
  bpm = Math.max(100, Math.min(200, Math.round(bpm)));

  window.setTempo(bpm);

  if (!updateUI) return bpm;

  if (tempoSlider) tempoSlider.value = bpm;
  if (tempoValue) tempoValue.textContent = bpm + " BPM";

  const tempoBox = document.getElementById("tempoBox");
  if (tempoBox) {
    tempoBox.dataset.tempo = bpm;
    const valueEl = tempoBox.querySelector(".tempo-box-value");
    if (valueEl) valueEl.textContent = bpm;
  }

  return bpm;
}

if (tempoSlider) {
  tempoSlider.addEventListener("input", () => {
    applyProjectTempo(tempoSlider.value);
  });
}

// Tempo Box Drag Handler
const tempoBox = document.getElementById("tempoBox");
if (tempoBox) {
  let isDragging = false;
  let startY = 0;
  let startTempo = 175;

  tempoBox.addEventListener("mousedown", (e) => {
    isDragging = true;
    startY = e.clientY;
    startTempo = parseInt(tempoBox.dataset.tempo);
    document.body.style.cursor = "ns-resize";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    
    const deltaY = startY - e.clientY; // Inverted: drag up = increase
    const tempoChange = Math.round(deltaY / 2); // 2px = 1 BPM
    let newTempo = startTempo + tempoChange;
    
    // Clamp between 100-200
    newTempo = Math.max(100, Math.min(200, newTempo));
    
    applyProjectTempo(newTempo);
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = "";
    }
  });
}

function startPlayhead(realStartTime) {
  const playhead = document.getElementById("playhead");

  // Kill any previous loop
  if (window.playheadRAF) {
    cancelAnimationFrame(window.playheadRAF);
    window.playheadRAF = null;
  }

  // Always use the transport start time
  window.playheadStartTime = realStartTime;

  function update() {
    const playhead = document.getElementById("playhead");
    if (!playhead) return;

    const elapsed = audioContext.currentTime - window.playheadStartTime;
    const bars = (elapsed * window.BPM) / 240;
    const x = bars * window.PIXELS_PER_BAR;

    // --- FIX: No offset, playhead is inside .tracks and grid is at x=0 ---
    playhead.style.left = x + "px";

    window.playheadRAF = requestAnimationFrame(update);
  }

  update();
}

function stopPlayhead() {
  if (window.playheadRAF) {
    cancelAnimationFrame(window.playheadRAF);
    window.playheadRAF = null;
  }

  // ❌ Do NOT reposition the playhead here
  // The caller will position it correctly depending on context
}


document.addEventListener("mousedown", (e) => {
  if (!e.target.classList.contains("knob")) return;

  e.preventDefault();

  // --- FIX: Find track index from controls column, not .track ---
  let trackIndex = null;
  let el = e.target;
  while (el && !el.classList.contains("track-controls")) {
    el = el.parentElement;
  }
  if (el && el.dataset && el.dataset.index !== undefined) {
    trackIndex = parseInt(el.dataset.index);
  }
  if (trackIndex === null || isNaN(trackIndex)) return;

  const knob = e.target;
  let value = parseFloat(knob.dataset.value);

  // Request pointer lock (locks mouse + hides cursor)
  document.body.requestPointerLock?.();

  function move(ev) {
    // Smooth relative movement (movementY works perfectly in pointer lock)
    const delta = -ev.movementY * 0.003;

    value += delta;
    value = Math.max(0, Math.min(1, value));

    knob.dataset.value = value;
    knob.style.setProperty("--val", value);

    // APPLY TO AUDIO
    if (knob.classList.contains("volume-knob")) {
      window.trackGains[trackIndex].gain.value = value;
    }

    if (knob.classList.contains("pan-knob")) {
      const panValue = (value * 2) - 1;
      window.trackPanners[trackIndex].pan.value = panValue;
    }
  }

  function up() {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);

    // Release pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
});


function updateMeters() {
  const fills = document.querySelectorAll(".track-meter-fill");

  for (let i = 0; i < window.trackAnalysers.length; i++) {
    const analyser = window.trackAnalysers[i];
    const fill = fills[i];
    if (!fill) continue;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);

    // Compute peak amplitude
    let peak = 0;
    for (let j = 0; j < data.length; j++) {
      const v = Math.abs(data[j] - 128) / 128;
      if (v > peak) peak = v;
    }

    fill.style.height = (peak * 100) + "%";
  }

  requestAnimationFrame(updateMeters);
}

updateMeters();

async function saveProjectZip() {
  window.showLoadingBar("Saving project...");
  window.updateLoadingBar(5);

  const zip = new JSZip();

  // Folder for audio files
  const audioFolder = zip.folder("audio");

  // Deduplication map for samples
  const savedSamples = new Map();

  // --- FIX: Always get latest knob values from DOM for saving ---
  const tracks = [];
  for (let i = 0; i < 16; i++) {
    // Find the controls column knob for this track
    const controlsCol = document.querySelector(`#track-controls-column .track-controls[data-index="${i}"]`);
    let vol = 0.8, pan = 0.5;
    if (controlsCol) {
      const volKnob = controlsCol.querySelector(".volume-knob");
      const panKnob = controlsCol.querySelector(".pan-knob");
      if (volKnob) vol = Number(volKnob.dataset.value);
      if (panKnob) pan = Number(panKnob.dataset.value);
    }
    tracks.push({ volume: vol, pan: pan });
  }

  const serializedClips = [];
  window.updateLoadingBar(20, "Processing clips...");

  for (const clip of window.clips) {

    // ----------------------------------------------------
    // 0. MIDI CLIP
    // ----------------------------------------------------
    if (clip.type === "midi") {
      const midiData = {
        type: "midi",
        id: clip.id,
        trackIndex: clip.trackIndex,
        startBar: clip.startBar,
        bars: clip.bars,
        notes: clip.notes.map(n => ({
          pitch: n.pitch,
          start: n.start,
          end: n.end
        })),
        name: clip.name,

        sampleName: clip.sampleName || null,
        sampleFile: null,

        reverbAmount: clip.reverbGain?.gain?.value ?? 0.5
      };

      // Save custom sample (deduplicated)
      if (
        clip.sampleBuffer &&
        clip.sampleName &&
        clip.sampleName !== window.defaultMidiSampleName
      ) {
        if (!savedSamples.has(clip.sampleName)) {
          const wavBlob = bufferToWavBlob(clip.sampleBuffer);
          const arrayBuffer = await wavBlob.arrayBuffer();
          const fileName = `${clip.sampleName}.wav`;

          audioFolder.file(fileName, arrayBuffer, { compression: "STORE" });
          savedSamples.set(clip.sampleName, fileName);
        }

        midiData.sampleFile = savedSamples.get(clip.sampleName);
      }

      serializedClips.push(midiData);
      continue;
    }

    // ----------------------------------------------------
    // 1. AUDIO CLIPS (loop or local)
    // ----------------------------------------------------
    if (!clip.loopId && !clip.audioBuffer) continue;

    const baseData = {
      type: "audio",
      id: clip.id,
      loopId: clip.loopId || null,
      trackIndex: clip.trackIndex,
      startBar: clip.startBar,
      bars: clip.bars,
      bpm: clip.bpm,                         // current stored bpm (source)
      sourceBpm: clip.sourceBpm || clip.bpm, // persist source BPM explicitly
      fileName: clip.fileName,
      startOffset: clip.startOffset || 0,
      durationSeconds: clip.durationSeconds,
      originalBars: clip.originalBars || clip.bars,
      fadeIn: Number(clip.fadeIn) || 0,
      fadeOut: Number(clip.fadeOut) || 0
    };

    if (clip.loopId) {
      // Loop clips reference external library
      serializedClips.push(baseData);
    } else {
      // Local audio clips → save WAV file
      const wavBlob = bufferToWavBlob(clip.audioBuffer);
      const arrayBuffer = await wavBlob.arrayBuffer();

      const fileName = `${clip.id}.wav`;
      audioFolder.file(fileName, arrayBuffer, { compression: "STORE" });

      serializedClips.push({
        ...baseData,
        audioFile: fileName
      });
    }
  }

  // ----------------------------------------------------
  // 2. PROJECT JSON
  // ----------------------------------------------------
  window.updateLoadingBar(70, "Creating archive...");
  
  const project = {
    tempo: Number(window.BPM || 175),
    timelineBars: window.timelineBars,
    tracks,
    clips: serializedClips
  };

  zip.file("project.json", JSON.stringify(project, null, 2));

  // ----------------------------------------------------
  // 3. GENERATE ZIP (no compression)
  // ----------------------------------------------------
  window.updateLoadingBar(85, "Finalizing...");
  
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "STORE"
  });

  // ----------------------------------------------------
  // 4. DOWNLOAD
  // ----------------------------------------------------
  window.updateLoadingBar(95);
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rewired_project.zip";
  a.click();
  URL.revokeObjectURL(url);
  
  window.updateLoadingBar(100);
  window.hideLoadingBar();
}



async function loadProjectZip(json, zip) {
  window.showLoadingBar("Loading project...");
  window.updateLoadingBar(10);
  
  stopAll();
  stopPlayhead();

  // Reset UI + engine tempo
  applyProjectTempo(json.tempo);

  // Restore timeline bars (defaults to 64 if not present for backwards compatibility)
  window.timelineBars = json.timelineBars || 64;
  
  window.updateLoadingBar(30, "Building timeline...");

  // --- FIX: Remove any manual playhead/seekMarker offset on load ---
  // Ensure seekMarker and playhead are reset to bar 1 (x=0)
  const marker = document.getElementById("seekMarker");
  if (marker) marker.style.left = "0px";
  const playhead = document.getElementById("playhead");
  if (playhead) playhead.style.left = "0px";
  window.seekBars = 0;
  window.transportStartTime = audioContext.currentTime;

  // --- Set window.loadedProject so timeline.js uses correct values ---
  window.loadedProject = json;

  window.clips = [];
  document.getElementById("tracks").innerHTML = "";
  initTimeline(); // builds 16 fresh tracks with correct knob values

  // Update timeline widths based on loaded timelineBars
  const trackMinWidth = window.timelineBars * window.PIXELS_PER_BAR;
  const trackElements = document.querySelectorAll('.track');
  trackElements.forEach(track => {
    track.style.minWidth = trackMinWidth + 'px';
  });
  const dropAreas = document.querySelectorAll('.track-drop-area');
  dropAreas.forEach(dropArea => {
    dropArea.style.minWidth = trackMinWidth + 'px';
  });
  window.renderGrid();
  window.renderTimelineBar(window.timelineBars);
  
  window.updateLoadingBar(40, "Loading clips...");

  // --- Remove redundant knob/pan sync here, timeline.js now handles it on init ---
  // ----------------------------------------------------
  // Mixer: apply volumes/pans to audio + knobs
  // ----------------------------------------------------
  // --- FIX: Clamp values to [0,1] and ensure numbers ---
  json.tracks.forEach((t, index) => {
    // Clamp and coerce to number
    let vol = Math.max(0, Math.min(1, Number(t.volume)));
    let pan = Math.max(0, Math.min(1, Number(t.pan)));

    // Audio engine
    if (window.trackGains && window.trackGains[index]) {
      window.trackGains[index].gain.value = vol;
    }
    if (window.trackPanners && window.trackPanners[index]) {
      window.trackPanners[index].pan.value = (pan - 0.5) * 2;
    }

    // Update window.trackStates
    if (window.trackStates && window.trackStates[index]) {
      window.trackStates[index].volume = vol;
      window.trackStates[index].pan = pan;
    }

    // UI knobs in controls column
    const controlsCol = document.querySelector(`#track-controls-column .track-controls[data-index="${index}"]`);
    if (controlsCol) {
      const volKnob = controlsCol.querySelector(".volume-knob");
      const panKnob = controlsCol.querySelector(".pan-knob");
      if (volKnob) {
        volKnob.dataset.value = vol;
        volKnob.style.setProperty("--val", vol);
      }
      if (panKnob) {
        panKnob.dataset.value = pan;
        panKnob.style.setProperty("--val", pan);
      }
    }
  });

  // ----------------------------------------------------
  // Load clips (your existing code)
  // ----------------------------------------------------
  for (const raw of json.clips) {
    // 0. MIDI CLIP (with sample restore)
    if (raw.type === "midi") {
      const clip = new MidiClip(raw.startBar, raw.bars);

      clip.id = raw.id || crypto.randomUUID();
      clip.type = "midi";
      clip.trackIndex = raw.trackIndex;
      clip.notes = raw.notes || [];
      clip.name = raw.name || `MIDI Clip`;

      clip.sampleName = raw.sampleName || window.defaultMidiSampleName;

      if (raw.sampleFile) {
        const wavData = await zip.file(`audio/${raw.sampleFile}`).async("arraybuffer");
        clip.sampleBuffer = await audioContext.decodeAudioData(wavData);
      } else {
        clip.sampleBuffer = window.defaultMidiSampleBuffer;
      }

      clip.reverbGain.gain.value = raw.reverbAmount ?? 0.5;

      window.clips.push(clip);
      resolveClipCollisions(clip);

      const trackEl = document.querySelectorAll(".track")[clip.trackIndex];
      if (trackEl) {
        const dropArea = trackEl.querySelector(".track-drop-area");
        window.renderClip(clip, dropArea);
      }

      // Refresh dropdown after adding MIDI clip
      window.refreshClipDropdown(window.clips);

      continue;
    }

    // 1. LOOP CLIP (external library)
    if (raw.loopId) {
      const loopInfo = DROPBOX_LOOP_MAP[raw.loopId];
      await window.loadLoop(raw.loopId, loopInfo.url, loopInfo.bpm);
      const loadedClip = window.createLoopClip(
        raw.loopId,
        raw.trackIndex,
        raw.startBar,
        raw.bars
      );
      if (!loadedClip) {
        console.error("Failed to create loop clip for", raw.loopId);
        continue;
      }

      loadedClip.type = "audio";
      loadedClip.name = loopInfo.displayName || loopInfo.id || "Audio Clip";

      // Recompute bars at source BPM (loop bpm) from loaded buffer
      const ld = window.loopBuffers.get(raw.loopId);
      if (ld && ld.buffer) {
        const barsAtSource = window.calculateBarsFromAudio(ld.buffer, loopInfo.bpm);
        loadedClip.originalBars = raw.originalBars || barsAtSource;
        loadedClip.bars = raw.bars || loadedClip.originalBars;
        loadedClip.sourceBpm = loopInfo.bpm;
        loadedClip.bpm = loopInfo.bpm;
        loadedClip.durationSeconds = ld.buffer.duration;
        loadedClip.startOffset = raw.startOffset || 0;
      }

      loadedClip.fadeIn = Number(raw.fadeIn) || 0;
      loadedClip.fadeOut = Number(raw.fadeOut) || 0;

      resolveClipCollisions(loadedClip);

      const trackEl = document.querySelectorAll(".track")[loadedClip.trackIndex];
      if (trackEl) {
        const dropArea = trackEl.querySelector(".track-drop-area");
        window.renderClip(loadedClip, dropArea);
      }

      window.refreshClipDropdown(window.clips);
      continue;
    }

    // 2. LOCAL AUDIO FILE
    if (raw.audioFile) {
      const wavData = await zip.file(`audio/${raw.audioFile}`).async("arraybuffer");
      const audioBuffer = await audioContext.decodeAudioData(wavData);

      // Fit bars to the original source BPM captured at save (fallback to raw.bpm)
      const sourceBpm = Number(raw.sourceBpm || raw.bpm) || 175;
      const barsAtSource = window.calculateBarsFromAudio(audioBuffer, sourceBpm);

      const clip = {
        id: raw.id,
        type: "audio",
        audioBuffer,
        trackIndex: raw.trackIndex,
        startBar: raw.startBar,
        bars: raw.bars || barsAtSource,      // keep trimmed length if saved
        bpm: sourceBpm,
        sourceBpm,                          // persist source BPM on the clip
        fileName: raw.fileName,
        startOffset: raw.startOffset || 0,
        durationSeconds: audioBuffer.duration,
        originalBars: raw.originalBars || barsAtSource,
        name: raw.name || raw.fileName || `Audio Clip`,
        fadeIn: Number(raw.fadeIn) || 0,
        fadeOut: Number(raw.fadeOut) || 0
      };

      window.clips.push(clip);
      resolveClipCollisions(clip);

      const trackEl = document.querySelectorAll(".track")[clip.trackIndex];
      if (trackEl) {
        const dropArea = trackEl.querySelector(".track-drop-area");
        window.renderClip(clip, dropArea);
      }

      window.refreshClipDropdown(window.clips);
      continue;
    }
  }
  
  window.updateLoadingBar(100);
  window.hideLoadingBar();
}



function bufferToBase64Wav(buffer) {
  return new Promise(resolve => {
    const wavBlob = bufferToWavBlob(buffer);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.readAsDataURL(wavBlob);
  });
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}


document.getElementById("loadProjectBtn").addEventListener("click", () => {
  document.getElementById("projectFileInput").click();
});

document.getElementById("projectFileInput").addEventListener("change", async function () {
  const file = this.files[0];
  if (!file) return;

  // Must be a ZIP
  if (!file.name.endsWith(".zip")) {
    alert("This is not a Rewired project (.zip). Please select a .zip project file.");
    return;
  }

  const zip = await JSZip.loadAsync(file);

  const jsonText = await zip.file("project.json").async("string");
  const json = JSON.parse(jsonText);

  await loadProjectZip(json, zip);
});




window.renderTimelineBar = function(totalBars = 128) {
  const barWidth = window.PIXELS_PER_BAR;
  const container = document.getElementById("timeline-bar");
  container.innerHTML = "";
  
  // Update the timeline-bar min-width to match the total width
  const timelineBarWidth = totalBars * barWidth + 156; // 156 is the padding-left
  container.style.minWidth = timelineBarWidth + 'px';




  for (let i = 0; i < totalBars; i++) {
    const el = document.createElement("div");
    el.className = "timeline-bar-number";
    //el.style.setProperty("--bar-width", barWidth + "px");
    el.textContent = i + 1;

el.addEventListener("click", (e) => {
  e.stopPropagation();

  const barIndex = i;
  window.seekBars = barIndex;

  // Update transportStartTime for new seek
  window.transportStartTime =
    audioContext.currentTime - window.barsToSeconds(barIndex);

const x = barIndex * window.PIXELS_PER_BAR;

// Move the triangle marker
const marker = document.getElementById("seekMarker");
marker.style.left = (x + 150 + 6) + "px";

// --- Account for horizontal scroll offset when moving playhead ---
const timelineScroll = document.getElementById("timeline-scroll");
const scrollX = timelineScroll ? timelineScroll.scrollLeft : 0;

if (window.isPlaying) {
    window.stopAll();
    stopPlayhead();

    window.playAll(barIndex);

    const playhead = document.getElementById("playhead");
    playhead.style.left = (x - scrollX) + "px";
    playhead.classList.remove("hidden");

    startPlayhead(window.transportStartTime);
    return;
  }

  // If stopped → just move the playhead visually
  //const playhead = document.getElementById("playhead");
  //playhead.style.left = (x + 104 - scrollX) + "px";
  //playhead.classList.remove("hidden");

  // Update UI
  const playToggleBtn = document.getElementById("playToggleBtn");
  playToggleBtn.textContent = "Play";
  playToggleBtn.classList.remove("active");

  const transportLabel = document.getElementById("transportLabel");
  if (transportLabel) {
    transportLabel.textContent = "Stopped";
    transportLabel.classList.remove("playing");
  }
});







    container.appendChild(el);
  }
};

  // Prevent parent containers from receiving timeline clicks
  document.getElementById("timeline-bar").addEventListener("click", e => {
    e.stopPropagation();
  });

  document.querySelector(".timeline").addEventListener("click", e => {
    e.stopPropagation();
  });

  document.getElementById("exportBtn").addEventListener("click", () => {
    // Show export dialog instead of directly exporting
    const exportDialog = document.getElementById("export-dialog");
    if (exportDialog) {
      exportDialog.classList.remove("hidden");
    }
  });

  // Export dialog event handlers
  const exportDialogClose = document.getElementById("export-dialog-close");
  const exportDialogCancel = document.getElementById("export-dialog-cancel");
  const exportDialogExport = document.getElementById("export-dialog-export");
  const exportDialog = document.getElementById("export-dialog");

  function closeExportDialog() {
    if (exportDialog) {
      exportDialog.classList.add("hidden");
    }
  }

  if (exportDialogClose) {
    exportDialogClose.addEventListener("click", closeExportDialog);
  }

  if (exportDialogCancel) {
    exportDialogCancel.addEventListener("click", closeExportDialog);
  }

  if (exportDialogExport) {
    exportDialogExport.addEventListener("click", () => {
      // Get selected preset
      const selectedPreset = document.querySelector('input[name="exportPreset"]:checked');
      const preset = selectedPreset ? selectedPreset.value : "premaster";
      
      // Close dialog
      closeExportDialog();
      
      // Start export with selected preset
      window.exportSong(preset);
    });
  }

  // Close dialog when clicking overlay
  if (exportDialog) {
    const overlay = exportDialog.querySelector(".export-dialog-overlay");
    if (overlay) {
      overlay.addEventListener("click", closeExportDialog);
    }
  }

// ------------------------------------------------------
// MASTER VOLUME
// ------------------------------------------------------
document.getElementById("masterVolumeSlider").addEventListener("input", e => {
  masterGain.gain.value = Number(e.target.value);
});

// ------------------------------------------------------
// TRUE STEREO MASTER VU SETUP
// ------------------------------------------------------

// Create a stereo splitter AFTER masterGain
const masterSplitter = audioContext.createChannelSplitter(2);

// Disconnect old analyser if needed
try { masterGain.disconnect(masterAnalyser); } catch {}

// Connect masterGain → splitter
masterGain.connect(masterSplitter);

// ⭐ ADD THIS: connect masterGain to speakers
masterGain.connect(audioContext.destination);

// Create two analysers (L/R)
window.masterAnalyserLeft = audioContext.createAnalyser();
window.masterAnalyserRight = audioContext.createAnalyser();

masterAnalyserLeft.fftSize = 256;
masterAnalyserRight.fftSize = 256;

// Connect splitter → analysers
masterSplitter.connect(masterAnalyserLeft, 0);
masterSplitter.connect(masterAnalyserRight, 1);


// ------------------------------------------------------
// CANVAS + DRAWING
// ------------------------------------------------------
const vuLeft = document.getElementById("vuLeft");
const vuRight = document.getElementById("vuRight");
const ctxL = vuLeft.getContext("2d");
const ctxR = vuRight.getContext("2d");

const leftData = new Uint8Array(masterAnalyserLeft.frequencyBinCount);
const rightData = new Uint8Array(masterAnalyserRight.frequencyBinCount);

function drawVUMeters() {
  requestAnimationFrame(drawVUMeters);

  // Read true stereo data
  masterAnalyserLeft.getByteTimeDomainData(leftData);
  masterAnalyserRight.getByteTimeDomainData(rightData);

  const leftLevel = getPeak(leftData);
  const rightLevel = getPeak(rightData);

  drawMeter(ctxL, leftLevel);
  drawMeter(ctxR, rightLevel);
}

function getPeak(data) {
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i] - 128) / 128;
    if (v > peak) peak = v;
  }
  return peak;
}

function drawMeter(ctx, level) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.clearRect(0, 0, w, h);

  const barWidth = w * level;
  ctx.fillStyle = level > 0.9 ? "#ff3b3b" : "#2aff2a";
  ctx.fillRect(0, 0, barWidth, h);
}

// Start drawing
drawVUMeters();


function attachClipHandlers(clipElement, clip, track) {
  clipElement.addEventListener("dblclick", () => {
    if (track.type === "midi") {
      //window.activeClip = clip;            // ⭐ set active clip FIRST
      
      openPianoRoll(clip);                 // open UI
      
    }
  });
}



function openPianoRoll(clip) {
  activeClip = clip;
  window.activeClip = activeClip;
  updatePianoRollSampleHeader();


  reverbSlider.value = clip.reverbGain.gain.value;

  const container = document.getElementById("piano-roll-container");
  container.classList.remove("hidden");

  // ⭐ Update header background using track colour

const trackColor = window.TRACK_COLORS[clip.trackIndex % 10];

// Clip name tag
const nameBox = document.getElementById("piano-roll-clip-name");
nameBox.style.backgroundColor = trackColor;
nameBox.style.color = "var(--border-dark)";
nameBox.style.padding = "2px 6px";
nameBox.style.borderRadius = "4px";

// Sample name tag
const sampleNameBox = document.getElementById("piano-roll-sample-name");
sampleNameBox.style.backgroundColor = trackColor;
sampleNameBox.style.color = "var(--border-dark)";
sampleNameBox.style.padding = "2px 6px";
sampleNameBox.style.borderRadius = "4px";



  requestAnimationFrame(() => {
    resizeCanvas();
    renderPianoRoll();

    // ⭐ Auto-scroll to highest note
    const notes = activeClip.notes || [];

  });

  // Always use the real clip object from window.clips
  const realClip = window.clips.find(c => c.id === clip.id);
  window.activeClip = realClip;

  // Update dropdown selection
  const dropdown = document.getElementById("clipListDropdown");
  if (dropdown) dropdown.value = realClip.name || realClip.fileName || realClip.id;
}




document.getElementById("piano-roll-close").addEventListener("click", () => {
  // Stop any playing preview
  if (window.stopPianoRollPreview) {
    window.stopPianoRollPreview();
  }
  document.getElementById("piano-roll-container").classList.add("hidden"); // ⭐ hide using class toggle
  activeClip = null;
});

async function loadMidiFromDropbox(url, displayName) {
  if (!window.Midi) {
    console.error("Tone.js MIDI parser not loaded.");
    return null;
  }

  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const midi = new Midi(new Uint8Array(arrayBuffer));

    const notes = [];
    const ppq = midi.header.ppq;

    midi.tracks.forEach(track => {
      track.notes.forEach(n => {
        const startBeats = n.ticks / ppq;
        const endBeats = (n.ticks + n.durationTicks) / ppq;

        notes.push({
          pitch: n.midi,
          start: startBeats,
          end: endBeats,
          velocity: n.velocity
        });
      });
    });

    // Determine clip length in bars
    const maxEnd = notes.length > 0 ? Math.max(...notes.map(n => n.end)) : 1;
    const bars = Math.ceil(maxEnd / 4);

    // Build a MidiClip object
    const clip = new MidiClip(0, bars);
    clip.id = "dropbox-midi-" + Date.now();
    clip.displayName = displayName;
    clip.notes = notes;

    return clip;

  } catch (err) {
    console.error("Failed to load MIDI from Dropbox:", err);
    return null;
  }
}


async function loadAllMidiLoops() {
  return Promise.all(
    window.MIDI_LOOPS.map(loop =>
      loadMidiFromDropbox(loop.url, loop.displayName)
    )
  );
}

document.getElementById("newProjectBtn").addEventListener("click", () => {
  location.reload();
});


const fileMenu = document.getElementById("fileMenu");
const fileDropdown = document.getElementById("fileDropdown");

fileMenu.addEventListener("click", () => {
  const isOpen = fileDropdown.style.display === "block";
  fileDropdown.style.display = isOpen ? "none" : "block";
});

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!fileMenu.contains(e.target)) {
    fileDropdown.style.display = "none";
  }
});

// Close dropdown when clicking any menu item (event delegation + stopPropagation)
fileDropdown.addEventListener("click", (e) => {
  if (e.target.classList.contains("dropdown-item")) {
    e.stopPropagation(); // Prevents bubbling to fileMenu click
    fileDropdown.style.display = "none";
  }
});


/**
 * Populates the clip dropdown list in the top bar.
 * @param {Array} clips - Array of all clips (audio and midi) in the project.
 * Each clip should have at least: { id, name, type }
 */
window.refreshClipDropdown = function(clips) {
  const dropdown = document.getElementById("clipListDropdown");
  if (!dropdown) return;
  dropdown.innerHTML = "";

  if (!Array.isArray(clips) || clips.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No clips";
    dropdown.appendChild(opt);
    return;
  }

  // Make unique by name
  const uniqueClips = [...new Map(clips.map(c => [c.name || c.fileName || c.id, c])).values()];

  uniqueClips.forEach(clip => {
    const opt = document.createElement("option");
    // Use name as value for uniqueness
    opt.value = clip.name || clip.fileName || clip.id;
    opt.textContent = clip.name || clip.displayName || clip.fileName || clip.id;
    dropdown.appendChild(opt);
  });

  // Set the dropdown to the current active clip if it exists
  if (window.activeClip) {
    const key = window.activeClip.name || window.activeClip.fileName || window.activeClip.id;
    dropdown.value = key;
  }

  
};

function openPianoRoll(clip) {
  activeClip = clip;
  window.activeClip = activeClip;
  updatePianoRollSampleHeader();


  reverbSlider.value = clip.reverbGain.gain.value;

  const container = document.getElementById("piano-roll-container");
  container.classList.remove("hidden");

  // ⭐ Update header background using track colour

const trackColor = window.TRACK_COLORS[clip.trackIndex % 10];

// Clip name tag
const nameBox = document.getElementById("piano-roll-clip-name");
nameBox.style.backgroundColor = trackColor;
nameBox.style.color = "var(--border-dark)";
nameBox.style.padding = "2px 6px";
nameBox.style.borderRadius = "4px";

// Sample name tag
const sampleNameBox = document.getElementById("piano-roll-sample-name");
sampleNameBox.style.backgroundColor = trackColor;
sampleNameBox.style.color = "var(--border-dark)";
sampleNameBox.style.padding = "2px 6px";
sampleNameBox.style.borderRadius = "4px";



  requestAnimationFrame(() => {
    resizeCanvas();
    renderPianoRoll();

    // ⭐ Auto-scroll to highest note
    const notes = activeClip.notes || [];
    if (notes.length > 0) {
      const highest = Math.max(...notes.map(n => n.pitch));

      const rowHeight = 16;
      const y = (pitchMax - highest) * rowHeight;

      const scrollContainer = document.getElementById("piano-roll-scroll");

      const extraOffset = 8 * rowHeight; // scroll down by a few notes
      scrollContainer.scrollTop =
        y - scrollContainer.clientHeight / 2 + extraOffset;
    }
  });

  // Always use the real clip object from window.clips
  const realClip = window.clips.find(c => c.id === clip.id);
  window.activeClip = realClip;

  // Update dropdown selection
  const dropdown = document.getElementById("clipListDropdown");
  if (dropdown) dropdown.value = realClip.name || realClip.fileName || realClip.id;
}