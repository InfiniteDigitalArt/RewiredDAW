// --- TIME DISPLAY LOGIC ---
function formatTimeDisplayMs(seconds) {
  seconds = Math.max(0, seconds);
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  return (
    (m < 10 ? '0' : '') + m + ':' +
    (s < 10 ? '0' : '') + s + ':' +
    (ms < 100 ? (ms < 10 ? '00' : '0') : '') + ms
  );
}

function updateTimeDisplayFromBars(bars) {
  // bars: float, can be fractional
  const tempo = window.getTempo ? window.getTempo() : 175;
  const beats = bars * 4;
  const seconds = (60 / tempo) * beats;
  const el = document.getElementById('timeDisplay');
  if (el) el.textContent = formatTimeDisplayMs(seconds);
}

function updateTimeDisplayFromSeconds(seconds) {
  const el = document.getElementById('timeDisplay');
  if (el) el.textContent = formatTimeDisplayMs(seconds);
}

// --- HOOK INTO PLAYBACK ---
let timeDisplayRAF = null;
let playStartTime = 0;
let playStartBar = 0;
let lastSeekBar = 0;

function startUpdatingTimeDisplay(startBar) {
  playStartTime = audioCtx.currentTime;
  playStartBar = startBar || 0;
  function raf() {
    if (!window.isPlaying) return;
    const tempo = window.getTempo ? window.getTempo() : 175;
    const elapsed = audioCtx.currentTime - playStartTime;
    const barsElapsed = (elapsed * tempo) / 240;
    const bars = playStartBar + barsElapsed;
    updateTimeDisplayFromBars(bars);
    timeDisplayRAF = requestAnimationFrame(raf);
  }
  raf();
}

function stopUpdatingTimeDisplay() {
  if (timeDisplayRAF) cancelAnimationFrame(timeDisplayRAF);
  timeDisplayRAF = null;
}

// --- IMMEDIATE TIME DISPLAY UPDATE ON TIMELINE JUMP (EVEN DURING PLAYBACK) ---
function jumpTimeDisplayToBar(bar) {
  // Always update the display immediately
  updateTimeDisplayFromBars(bar);
  // If playing, reset playStartTime and playStartBar so timer resumes from new position
  if (window.isPlaying) {
    playStartTime = audioCtx.currentTime;
    playStartBar = bar || 0;
  } else {
    // If not playing, also ensure the display is correct (already done above)
    stopUpdatingTimeDisplay();
  }
}

// --- INITIALIZE TIME DISPLAY ON LOAD ---
document.addEventListener('DOMContentLoaded', () => {
  updateTimeDisplayFromBars(window.seekBars || 0);
});

// --- PATCH PLAY/STOP BUTTON TO UPDATE TIME DISPLAY ---
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
  
  // Initialize mixer
  if (window.initMixer) {
    window.initMixer();
  }

  document.getElementById("saveProjectBtn").addEventListener("click", saveProjectZip);
  
  // Open Mixer button
  document.getElementById("openMixerBtn").addEventListener("click", () => {
    if (window.mixer && window.mixer.isOpen) {
      if (window.closeMixer) window.closeMixer();
    } else {
      if (window.openMixer) window.openMixer();
    }
  });

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


      // Switch to stop icon
      playToggleBtn.classList.add("active");
      const playIcon = playToggleBtn.querySelector('.play-icon');
      const stopIcon = playToggleBtn.querySelector('.stop-icon');
      if (playIcon && stopIcon) {
        playIcon.style.display = 'none';
        stopIcon.style.display = 'inline';
      }

      if (transportLabel) {
        transportLabel.textContent = "Playing";
        transportLabel.classList.add("playing");
      }

      // Start updating time display
      startUpdatingTimeDisplay(window.seekBars || 0);

    } else {
      stopAll();
      stopPlayhead();

      // Switch to play icon
      playToggleBtn.classList.remove("active");
      const playIcon2 = playToggleBtn.querySelector('.play-icon');
      const stopIcon2 = playToggleBtn.querySelector('.stop-icon');
      if (playIcon2 && stopIcon2) {
        playIcon2.style.display = 'inline';
        stopIcon2.style.display = 'none';
      }
      document.getElementById("playhead").classList.add("hidden");

      if (transportLabel) {
        transportLabel.textContent = "Stopped";
        transportLabel.classList.remove("playing");
      }

      // Stop updating time display
      stopUpdatingTimeDisplay();
      // Snap to current seek bar
      updateTimeDisplayFromBars(window.seekBars || 0);
    }
  });
// --- UPDATE TIME DISPLAY ON TIMELINE BAR CLICK/JUMP ---
// (Assume timeline.js sets window.seekBars and calls window.timeline.onPlayheadMove)
if (!window.timeline) window.timeline = {};
const origOnPlayheadMove = window.timeline.onPlayheadMove;
window.timeline.onPlayheadMove = function(bar) {
  jumpTimeDisplayToBar(bar);
  if (typeof origOnPlayheadMove === 'function') origOnPlayheadMove(bar);
};

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

  // Find track index from controls column
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

  document.body.requestPointerLock?.();

  function move(ev) {
      const delta = -ev.movementY * 0.003;
      value += delta;
      value = Math.max(0, Math.min(1, value));
      knob.dataset.value = value;
      knob.style.setProperty("--val", value);
      // Only update timeline state
      if (knob.classList.contains("volume-knob")) {
        // Update timeline state
        if (window.trackStates && window.trackStates[trackIndex]) {
          window.trackStates[trackIndex].volume = value;
        }
        // Update gain node: track volume * mixer fader
        const mixerFader = window.mixerFaderValues ? window.mixerFaderValues[trackIndex] : 1.0;
        if (window.trackGains && window.trackGains[trackIndex]) {
          window.trackGains[trackIndex].gain.value = value * mixerFader;
        }
      }
      if (knob.classList.contains("pan-knob")) {
        // Update panner node for this track
        if (window.trackPanners && window.trackPanners[trackIndex]) {
          window.trackPanners[trackIndex].pan.value = value * 2 - 1;
        }
        // Update timeline state
        if (window.trackStates && window.trackStates[trackIndex]) {
          window.trackStates[trackIndex].pan = value;
        }
      }
      // Do NOT update mixer fader or mixerFaderValues here
  }

  function up() {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
});


// Shared VU calibration used by mixer/timeline/top bar (falls back if mixer not loaded yet)
const VU_CAL = window.VU_CAL || {
  MIN_DB: -60,
  MAX_DB: 5,
  ORANGE_DB: -6,
  RED_DB: 0,
  SMOOTHING: 0.7
};

function vuAmpToDb(amplitude) {
  return amplitude > 0 ? 20 * Math.log10(amplitude) : VU_CAL.MIN_DB;
}

function vuDbToNorm(db) {
  const clamped = Math.max(VU_CAL.MIN_DB, Math.min(VU_CAL.MAX_DB, db));
  return (clamped - VU_CAL.MIN_DB) / (VU_CAL.MAX_DB - VU_CAL.MIN_DB);
}

const trackVuState = Array.from({ length: 16 }, () => ({ smoothed: 0 }));
const trackVuBuffersLeft = [];
const trackVuBuffersRight = [];

function computePeakFromAnalyser(analyser, bufferCache, idx) {
  if (!analyser) return 0;
  const buffer = bufferCache[idx] || (bufferCache[idx] = new Float32Array(analyser.fftSize));
  analyser.getFloatTimeDomainData(buffer);

  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = Math.abs(buffer[i]);
    if (v > peak) peak = v;
  }
  return peak;
}

function updateMeters() {
  const fills = document.querySelectorAll(".track-meter-fill");
  const analysersLeft = window.trackAnalysersLeft || window.trackAnalysers;
  const analysersRight = window.trackAnalysersRight || window.trackAnalysers;

  for (let i = 0; i < fills.length; i++) {
    const fill = fills[i];
    const analyserL = analysersLeft?.[i];
    const analyserR = analysersRight?.[i];
    if (!fill || !analyserL) continue;

    // Use the louder of L/R to mirror mixer VU behavior
    const peakL = computePeakFromAnalyser(analyserL, trackVuBuffersLeft, i);
    const peakR = analyserR ? computePeakFromAnalyser(analyserR, trackVuBuffersRight, i) : 0;
    const peak = Math.max(peakL, peakR);

    const state = trackVuState[i] || (trackVuState[i] = { smoothed: 0 });
    state.smoothed = VU_CAL.SMOOTHING * state.smoothed + (1 - VU_CAL.SMOOTHING) * peak;

    const smoothedDb = vuAmpToDb(state.smoothed);
    const height = vuDbToNorm(smoothedDb);

    fill.style.height = `${(height * 100).toFixed(2)}%`;

    let color = window.trackControls?.[i]?.color || "#2aff2a";
    if (smoothedDb >= VU_CAL.RED_DB) color = "#ff2b2b";
    else if (smoothedDb >= VU_CAL.ORANGE_DB) color = "#ff9900";
    fill.style.backgroundColor = color;
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
    let vol = 0.8, pan = 0.5, mixerFader = 1.0;
    if (controlsCol) {
      const volKnob = controlsCol.querySelector(".volume-knob");
      const panKnob = controlsCol.querySelector(".pan-knob");
      if (volKnob) vol = Number(volKnob.dataset.value);
      if (panKnob) pan = Number(panKnob.dataset.value);
    }
    // Get mixer fader value
    if (window.mixerFaderValues && window.mixerFaderValues[i] !== undefined) {
      mixerFader = window.mixerFaderValues[i];
    }
    // Get track name from trackStates
    const name = window.trackStates && window.trackStates[i] ? window.trackStates[i].name : `Track ${i + 1}`;
    // --- ADD: Save mute/solo states ---
    const muted = window.trackStates && window.trackStates[i] ? !!window.trackStates[i].muted : false;
    const solo = window.trackStates && window.trackStates[i] ? !!window.trackStates[i].solo : false;
    tracks.push({ volume: vol, pan: pan, mixerFader, name, muted, solo });
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
  
  const masterVolume = typeof masterGain !== "undefined" ? masterGain.gain.value : 1.0;
  const project = {
    tempo: Number(window.BPM || 175),
    timelineBars: window.timelineBars,
    tracks,
    clips: serializedClips,
    // Persist FX slots (master + tracks) for all current and future effect types
    fxSlots: window.trackFxSlots || {},
    // Persist stereo width knob values
    mixerStereoValues: window.mixerStereoValues || [],
    // Persist master volume
    masterVolume
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
    // Restore mixer stereo width values
    if (Array.isArray(json.mixerStereoValues)) {
      window.mixerStereoValues = json.mixerStereoValues.slice();
      // Update all track stereo width nodes if available
      if (window.setTrackStereoWidth) {
        for (let i = 0; i < window.mixerStereoValues.length; i++) {
          window.setTrackStereoWidth(i, window.mixerStereoValues[i]);
        }
      }
    }
    // Restore master volume (if present)
    if (typeof json.masterVolume === "number" && typeof masterGain !== "undefined") {
      masterGain.gain.value = json.masterVolume;
      const masterSlider = document.getElementById("masterVolumeSlider");
      if (masterSlider) masterSlider.value = json.masterVolume;
    }
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

  // Reset all timeline state so load behaves like a fresh boot
  window.clips = [];
  if (window.selectedClipIds) window.selectedClipIds.clear();
  window.activeClip = null;

  const pianoRoll = document.getElementById("piano-roll-container");
  if (pianoRoll) pianoRoll.classList.add("hidden");

  const clipDropdown = document.getElementById("clipListDropdown");
  if (clipDropdown) clipDropdown.innerHTML = "";

  const controlsCol = document.getElementById("track-controls-column");
  if (controlsCol) controlsCol.innerHTML = "";

  const tracksEl = document.getElementById("tracks");
  if (tracksEl) tracksEl.innerHTML = "";

  initTimeline(); // rebuilds controls + tracks from scratch

  const timelineScroll = document.getElementById("timeline-scroll");
  if (timelineScroll) {
    timelineScroll.scrollLeft = 0;
    timelineScroll.scrollTop = 0;
  }
  if (controlsCol) controlsCol.scrollTop = 0;

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
    let mixerFader = t.mixerFader !== undefined ? t.mixerFader : 1.0;
    const name = t.name || `Track ${index + 1}`;

    // Audio engine
    if (window.trackGains && window.trackGains[index]) {
      window.trackGains[index].gain.value = vol * mixerFader;
    }
    if (window.trackPanners && window.trackPanners[index]) {
      window.trackPanners[index].pan.value = (pan - 0.5) * 2;
    }

    // Update window.trackStates
    if (window.trackStates && window.trackStates[index]) {
      window.trackStates[index].volume = vol;
      window.trackStates[index].pan = pan;
      window.trackStates[index].name = name;
      // --- RESTORE mute/solo states ---
      window.trackStates[index].muted = !!t.muted;
      window.trackStates[index].solo = !!t.solo;
    }

    // --- UPDATE MUTE/SOLO BUTTON UI ---
    // (If you have a function to update mute/solo UI, call it here)
    const muteBtn = document.querySelector(`.track-controls[data-index="${index}"] .mute-btn`);
    const soloBtn = document.querySelector(`.track-controls[data-index="${index}"] .solo-btn`);
    if (muteBtn) {
      muteBtn.style.background = t.muted ? "#4D88FF" : "#222";
      muteBtn.style.color = t.muted ? "#fff" : "#aaa";
      if (t.muted) muteBtn.classList.add("muted");
      else muteBtn.classList.remove("muted");
    }
    if (soloBtn) {
      soloBtn.style.background = t.solo ? "#FFD24D" : "#222";
      soloBtn.style.color = t.solo ? "#222" : "#aaa";
      if (t.solo) soloBtn.classList.add("soloed");
      else soloBtn.classList.remove("soloed");
    }

    // Update mixer fader value
    if (!window.mixerFaderValues) window.mixerFaderValues = Array(16).fill(1.0);
    window.mixerFaderValues[index] = mixerFader;

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

    // Sync track label text in timeline (and mixer if open)
    if (typeof window.renameTrack === 'function') {
      window.renameTrack(index, name);
    }
  });

  // --- ADD: After restoring all trackStates, update mute/solo logic globally ---
  if (typeof window.updateTrackMuteSoloStates === "function") {
    window.updateTrackMuteSoloStates();
  } else {
    // fallback: inline mute/solo logic if function not available
    const anySolo = window.trackStates && window.trackStates.some(t => t.solo);
    for (let j = 0; j < 16; j++) {
      const state = window.trackStates[j];
      const gain = window.trackGains && window.trackGains[j];
      let effectiveMute = false;
      if (anySolo) effectiveMute = !state.solo;
      if (state.muted) effectiveMute = true;
      if (gain) gain.gain.value = effectiveMute ? 0 : (state.volume ?? 0.5);
    }
  }

  // ----------------------------------------------------
  // Restore FX slots (master + tracks) and rebuild routing
  // ----------------------------------------------------
  if (json.fxSlots) {
    window.trackFxSlots = json.fxSlots;
  } else {
    // Ensure defaults if older project without FX data
    if (typeof initTrackFxSlots === 'function') {
      initTrackFxSlots('master');
      for (let i = 0; i < 16; i++) initTrackFxSlots(i);
    }
  }

  // Recreate live FX chains for all tracks so realtime + export match
  if (typeof applyEffectToTrack === 'function' && typeof initTrackFxSlots === 'function') {
    for (let trackIndex = 0; trackIndex < 16; trackIndex++) {
      initTrackFxSlots(trackIndex);
      const slots = window.trackFxSlots?.[trackIndex] || [];
      slots.forEach((slot, slotIndex) => {
        if (!slot || !slot.type || slot.type === 'empty') return;
        const params = slot.params || (typeof getDefaultEffectParams === 'function'
          ? getDefaultEffectParams(slot.type)
          : {});
        applyEffectToTrack(trackIndex, slotIndex, slot.type, params);
      });
    }
  }

  // Refresh FX slot labels/settings UI if mixer is available
  if (typeof updateFxSlotsDisplay === 'function') {
    const currentTrackId = window.mixer?.selectedTrackIndex === null || window.mixer?.selectedTrackIndex === undefined
      ? 'master'
      : window.mixer.selectedTrackIndex;
    updateFxSlotsDisplay(currentTrackId);
    if (typeof renderFxSettingsPanel === 'function' && window.mixer?.selectedFxSlotIndex !== null) {
      renderFxSettingsPanel(currentTrackId, window.mixer.selectedFxSlotIndex);
    }
  }

  // ----------------------------------------------------
  // Load clips (with backwards-compat fallbacks)
  // ----------------------------------------------------
  const clipsToLoad = Array.isArray(json.clips) ? json.clips : [];

  for (const raw of clipsToLoad) {
    // 0. MIDI CLIP (with sample restore) — accept old saves that only had notes
    if (raw.type === "midi" || Array.isArray(raw.notes)) {
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

    // 2. LOCAL AUDIO FILE (compat: older saves used fileName only)
    const fileToLoad = raw.audioFile || raw.fileName;
    if (fileToLoad) {
      // Try audio/ first (current format), then root (older zips)
      const wavEntry = zip.file(`audio/${fileToLoad}`) || zip.file(fileToLoad);
      if (!wavEntry) {
        console.warn("Audio file missing in project:", fileToLoad);
        continue;
      }

      const wavData = await wavEntry.async("arraybuffer");
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

  // Allow selecting the same file again without needing a page refresh
  this.value = "";
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

  // Always update the time display immediately
  if (window.timeline && typeof window.timeline.onPlayheadMove === 'function') {
    window.timeline.onPlayheadMove(barIndex);
  }

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
  // Switch to play icon
  playToggleBtn.classList.remove("active");
  const playIcon2 = playToggleBtn.querySelector('.play-icon');
  const stopIcon2 = playToggleBtn.querySelector('.stop-icon');
  if (playIcon2 && stopIcon2) {
    playIcon2.style.display = 'inline';
    stopIcon2.style.display = 'none';
  }

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
      
      // Get song title
      const songTitle = document.getElementById("export-song-title").value.trim() || "Untitled";
      
      // Map preset value to display name
      const presetNames = {
        "premaster": "Pre-Master",
        "clubmaster": "Club Master",
        "streaming": "Streaming Platform"
      };
      const presetName = presetNames[preset] || preset;
      
      // Close dialog
      closeExportDialog();
      
      // Start export with selected preset and song title
      window.exportSong(preset, songTitle, presetName);
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
const masterVolumeSlider = document.getElementById("masterVolumeSlider");
if (masterVolumeSlider) {
  masterVolumeSlider.addEventListener("input", e => {
    const percentage = Number(e.target.value);
    // Map slider [0,1] to gain: 0.75 = 0dB, 1 = +5dB
    const volume = (typeof percentageToGain === 'function') ? percentageToGain(percentage) : percentage;
    masterGain.gain.value = volume;
    // Update mixer master fader if present
    if (window.mixer && window.mixer.masterTrack && window.mixer.masterTrack._fader) {
      window.mixer.masterTrack._volume = volume;
      if (typeof updateFaderPosition === 'function') updateFaderPosition(window.mixer.masterTrack, volume);
    }
  });
}

// ------------------------------------------------------
// TRUE STEREO MASTER VU SETUP
// ------------------------------------------------------
// Note: Master stereo analysers are now created in audioEngine.js
// This section just sets up the top bar VU meter drawing

// ------------------------------------------------------
// CANVAS + DRAWING
// ------------------------------------------------------
const vuLeft = document.getElementById("vuLeft");
const vuRight = document.getElementById("vuRight");
const ctxL = vuLeft.getContext("2d");
const ctxR = vuRight.getContext("2d");

const masterLeftData = new Float32Array(window.masterAnalyserLeft.fftSize);
const masterRightData = new Float32Array(window.masterAnalyserRight.fftSize);

// Peak smoothing state for top bar VU meters (mirrors mixer calculation)
let vuLeftPeakSmooth = 0;
let vuRightPeakSmooth = 0;

function drawVUMeters() {
  requestAnimationFrame(drawVUMeters);

  window.masterAnalyserLeft.getFloatTimeDomainData(masterLeftData);
  window.masterAnalyserRight.getFloatTimeDomainData(masterRightData);

  const leftPeak = getPeak(masterLeftData);
  const rightPeak = getPeak(masterRightData);

  vuLeftPeakSmooth = VU_CAL.SMOOTHING * vuLeftPeakSmooth + (1 - VU_CAL.SMOOTHING) * leftPeak;
  vuRightPeakSmooth = VU_CAL.SMOOTHING * vuRightPeakSmooth + (1 - VU_CAL.SMOOTHING) * rightPeak;

  drawMeter(ctxL, vuLeftPeakSmooth, leftPeak);
  drawMeter(ctxR, vuRightPeakSmooth, rightPeak);
}

function getPeak(data) {
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i]);
    if (v > peak) peak = v;
  }
  return peak;
}

function drawMeter(ctx, smoothedPeak, instantPeak) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.clearRect(0, 0, w, h);

  const smoothedDb = vuAmpToDb(smoothedPeak);
  const instantDb = vuAmpToDb(instantPeak);

  let fillColor = "#2aff2a";
  if (smoothedDb >= VU_CAL.RED_DB) fillColor = "#ff2b2b";
  else if (smoothedDb >= VU_CAL.ORANGE_DB) fillColor = "#ff9900";

  const barWidth = w * vuDbToNorm(smoothedDb);
  ctx.fillStyle = fillColor;
  ctx.fillRect(0, 0, barWidth, h);

  const peakX = w * vuDbToNorm(instantDb);
  ctx.strokeStyle = "#ffd900";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(peakX, 0);
  ctx.lineTo(peakX, h);
  ctx.stroke();
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