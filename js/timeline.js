// --- Minor style: highlight label on hover for future editing ---
const labelStyle = document.createElement('style');
labelStyle.textContent = `
.timeline-label:hover {
  background: #333;
  color: #fff;
  border-color: #FFD24D;
  cursor: pointer;
}
`;
document.head.appendChild(labelStyle);
// --- TIMELINE LABELS DATA ---
// Only set timelineLabels if truly undefined (not null, not already set by loader)
if (!('timelineLabels' in window)) window.timelineLabels = [];

// Show input for label at bar
function showLabelInput(bar, event) {
  hideTimelineContextMenu();
  // Remove any existing input
  const oldInput = document.getElementById('timeline-label-input');
  if (oldInput) oldInput.remove();

  const timelineBar = document.getElementById('timeline-bar');
  if (!timelineBar) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'timeline-label-input';
  input.placeholder = 'Section label...';
  input.style.position = 'absolute';
  input.style.zIndex = '10001';
  input.style.fontSize = '13px';
  input.style.padding = '2px 6px';
  input.style.border = '1.5px solid #4D88FF';
  input.style.borderRadius = '3px';
  input.style.background = '#222';
  input.style.color = '#fff';
  input.style.left = (bar * window.PIXELS_PER_BAR + 4) + 'px';
  input.style.top = (timelineBar.offsetHeight) + 'px';
  input.style.minWidth = '80px';
  input.style.maxWidth = '200px';
  input.style.outline = 'none';

  timelineBar.parentElement.appendChild(input);
  input.focus();

  let finished = false;
  function finishLabel() {
    if (finished) return;
    finished = true;
    const text = input.value.trim();
    // Defensive: bar must be a number
    if (typeof bar !== 'number' || isNaN(bar)) {
      if (input.parentNode) input.remove();
      return;
    }
    if (text) {
      window.timelineLabels.push({ bar, text });
      if (typeof renderTimelineLabels === 'function') {
        renderTimelineLabels();
      }
    }
    if (input.parentNode) input.remove();
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finishLabel();
    if (e.key === 'Escape') {
      if (!finished && input.parentNode) input.remove();
      finished = true;
    }
  });
  input.addEventListener('blur', finishLabel);
}

// Render timeline labels below the timeline
function renderTimelineLabels() {
  // Debug: log current timelineLabels
  console.log('Rendering timelineLabels:', window.timelineLabels);
  // Remove old labels
  const timelineBar = document.getElementById('timeline-bar');
  if (!timelineBar) return;
  let labelRow = timelineBar.querySelector('#timeline-label-row');
  if (!labelRow) {
    labelRow = document.createElement('div');
    labelRow.id = 'timeline-label-row';
    timelineBar.appendChild(labelRow);
  }
  // Style label row to fit inside timeline-bar
  labelRow.style.position = 'absolute';
  labelRow.style.left = '0';
  // Place label row below the bar numbers (assume bar numbers ~22px tall)
  labelRow.style.top = '22px';
  labelRow.style.width = '100%';
  labelRow.style.height = '20px';
  labelRow.style.display = 'flex';
  labelRow.style.pointerEvents = 'none';
  labelRow.style.zIndex = '10';
  labelRow.style.alignItems = 'flex-start';
  labelRow.style.userSelect = 'none';
  labelRow.innerHTML = '';
  window.timelineLabels.forEach((label, idx) => {
    const el = document.createElement('div');
    el.className = 'timeline-label';
    el.textContent = label.text;
    el.style.position = 'absolute';
    el.style.left = (label.bar * window.PIXELS_PER_BAR) + 'px';
    el.style.top = '0px';
    el.style.background = '#222';
    el.style.color = '#FFD24D';
    el.style.border = '1px solid #444';
    el.style.borderRadius = '3px';
    el.style.padding = '2px 8px';
    el.style.fontSize = '12px';
    el.style.whiteSpace = 'nowrap';
    el.style.pointerEvents = 'auto';
    // Prevent default context menu so right mouse drag works
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
    el.style.boxShadow = '0 1px 4px #0008';

    // --- Drag to move label (per-label listeners, no re-render during drag) ---
    let dragStartX = null;
    let dragBarStart = null;
    let dragging = false;
    let dragFrame = null;
    const onMouseMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragStartX;
      const barDelta = Math.round(dx / window.PIXELS_PER_BAR);
      let newBar = dragBarStart + barDelta;
      newBar = Math.max(0, newBar);
      // Only update position visually during drag
      el.style.left = (newBar * window.PIXELS_PER_BAR) + 'px';
    };
    const onMouseUp = (e) => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = '';
      // On drag end, update label data and re-render
      const dx = e.clientX - dragStartX;
      const barDelta = Math.round(dx / window.PIXELS_PER_BAR);
      let newBar = dragBarStart + barDelta;
      newBar = Math.max(0, newBar);
      if (label.bar !== newBar) {
        label.bar = newBar;
      }
      renderTimelineLabels();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Only left mouse button
      // Do not call preventDefault here, so double click works
      dragStartX = e.clientX;
      dragBarStart = label.bar;
      dragging = true;
      document.body.style.cursor = 'grabbing';
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    // --- Right click to edit label text ---
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Replace label with input
      const input = document.createElement('input');
      input.type = 'text';
      input.value = label.text;
      input.style.position = 'absolute';
      input.style.left = el.style.left;
      input.style.top = el.style.top;
      input.style.zIndex = '10002';
      input.style.fontSize = '12px';
      input.style.padding = '2px 8px';
      input.style.border = '1.5px solid #FFD24D';
      input.style.borderRadius = '3px';
      input.style.background = '#222';
      input.style.color = '#FFD24D';
      input.style.minWidth = '80px';
      input.style.maxWidth = '200px';
      input.style.outline = 'none';
      labelRow.appendChild(input);
      input.focus();
      input.select();
      el.style.visibility = 'hidden';
      let finished = false;
      function finishEdit() {
        if (finished) return;
        finished = true;
        const newText = input.value.trim();
        if (!newText) {
          // Remove label if empty
          window.timelineLabels.splice(idx, 1);
        } else {
          label.text = newText;
        }
        renderTimelineLabels();
      }
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') finishEdit();
        if (ev.key === 'Escape') {
          finished = true;
          renderTimelineLabels();
        }
      });
      input.addEventListener('blur', finishEdit);
    });

    labelRow.appendChild(el);
  });
}

// Make timeline area taller to fit labels
function adjustTimelineHeightForLabels() {
  const timeline = document.getElementById('timeline');
  if (timeline) {
    timeline.style.paddingBottom = '32px';
  }
}

// Call after DOMContentLoaded and after adding a label
document.addEventListener('DOMContentLoaded', () => {
  // Make timeline bar taller to fit both numbers and labels
  const timelineBar = document.getElementById('timeline-bar');
  if (timelineBar) {
    timelineBar.style.height = '42px'; // 22px for numbers, 20px for labels
    timelineBar.style.position = 'relative';
  }
  adjustTimelineHeightForLabels();
  renderTimelineLabels();
});
window.TRACK_COLORS = [
  "#FF4D4D", // red
  "#FF884D", // orange
  "#FFD24D", // yellow
  "#A6E34D", // lime
  "#4DE38A", // mint
  "#4DD2FF", // cyan
  "#4D88FF", // blue
  "#A64DFF", // purple
  "#FF4DE3", // magenta
  "#FF4D88"  // pink
];


// Global timeline event hooks
window.timeline = {
  onScheduleClip: null,        // audio scheduling callback
  onScheduleMidiClip: null,    // midi scheduling callback
  onPlayheadMove: null,
  onStop: null
};

// Right-click deletion state
let isDeletingClipsWithRightClick = false;
let deletedClipIds = new Set();

// Paint mode state
let isPainting = false;
let paintedBars = new Set();
let paintingTrackIndex = -1;

// Marquee selection state
let isSelecting = false;
let selectionStart = null;
let selectionRect = null;
window.selectedClipIds = new Set();

// Timeline expansion state
window.timelineBars = 64;
const TIMELINE_EXPANSION_THRESHOLD = 8; // bars from end
const TIMELINE_EXPANSION_SIZE = 64; // bars to add

// Global click handler to close clip dropdowns
document.addEventListener("click", () => {
  document.querySelectorAll('.clip-dropdown-open').forEach(el => {
    el.classList.remove('clip-dropdown-open');
    el.style.display = 'none';
  });
}, true); // Use capture phase to ensure it runs

/* -------------------------------------------------------
   LOADING BAR UTILITIES
------------------------------------------------------- */
window.showLoadingBar = function(message = "Loading...") {
  let bar = document.getElementById("timeline-loading-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "timeline-loading-bar";
    bar.innerHTML = `
      <div class="loading-bar-text">${message}</div>
      <div class="loading-bar-track">
        <div class="loading-bar-fill"></div>
      </div>
      <div class="loading-bar-stage"></div>
    `;
    document.body.appendChild(bar);
  } else {
    bar.querySelector(".loading-bar-text").textContent = message;
    bar.querySelector(".loading-bar-fill").style.width = "0%";
    bar.querySelector(".loading-bar-stage").textContent = "";
  }
  bar.classList.add("visible");
};

window.updateLoadingBar = function(percent, stage) {
  const bar = document.getElementById("timeline-loading-bar");
  if (bar) {
    const fill = bar.querySelector(".loading-bar-fill");
    if (fill) fill.style.width = Math.min(100, Math.max(0, percent)) + "%";
    
    if (stage !== undefined) {
      const stageEl = bar.querySelector(".loading-bar-stage");
      if (stageEl) stageEl.textContent = stage;
    }
  }
};

window.hideLoadingBar = function() {
  const bar = document.getElementById("timeline-loading-bar");
  if (bar) {
    bar.classList.remove("visible");
  }
};

/* -------------------------------------------------------
   TIMELINE AUTO-EXPANSION
------------------------------------------------------- */
window.checkAndExpandTimeline = function() {
  if (!window.clips || window.clips.length === 0) return;
  
  // Find the maximum end point of all clips (startBar + bars = actual end position)
  let maxClipEnd = 0;
  window.clips.forEach(clip => {
    const clipEnd = clip.startBar + clip.bars;
    if (clipEnd > maxClipEnd) maxClipEnd = clipEnd;
  });
  
  // Check if any clip extends within threshold of current end
  const expansionThreshold = window.timelineBars - TIMELINE_EXPANSION_THRESHOLD;
  
  // Keep expanding until all clips fit comfortably
  if (maxClipEnd > expansionThreshold) {
    // Calculate how many bars we need total (with some padding)
    const requiredBars = Math.ceil(maxClipEnd) + TIMELINE_EXPANSION_THRESHOLD;
    
    // Expand to the required size (in multiples of EXPANSION_SIZE for consistency)
    const expandedSize = Math.ceil(requiredBars / TIMELINE_EXPANSION_SIZE) * TIMELINE_EXPANSION_SIZE;
    window.timelineBars = Math.max(window.timelineBars, expandedSize);
    
    // Update track min-width in CSS
    const trackMinWidth = window.timelineBars * window.PIXELS_PER_BAR;
    const tracks = document.querySelectorAll('.track');
    tracks.forEach(track => {
      track.style.minWidth = trackMinWidth + 'px';
    });
    
    // Update track-drop-area width
    const dropAreas = document.querySelectorAll('.track-drop-area');
    dropAreas.forEach(dropArea => {
      dropArea.style.minWidth = trackMinWidth + 'px';
    });
    
    // Re-render grid and timeline bar
    try {
      if (typeof window.renderGrid === 'function') {
        window.renderGrid();
      }
      if (typeof window.renderTimelineBar === 'function') {
        window.renderTimelineBar(window.timelineBars);
      }
      if (typeof renderTimelineLabels === 'function') {
        renderTimelineLabels();
      }
    } catch (error) {
      console.error('Error expanding timeline:', error);
    }
  }
};

window.initTimeline = function () {
  // Track current timeline tool
  window.timelineCurrentTool = 'pencil';
  let timelineToolBeforeCtrl = null;
  let isTimelineCtrlHeld = false;
  
  const tracksEl = document.getElementById("tracks");
  const controlsColumn = document.getElementById("track-controls-column");
  const marker = document.getElementById("seekMarker");
  marker.style.left = "156px";

  // === TIMELINE TOOL BUTTONS: Only one active at a time ===
  const timelineToolButtons = Array.from(document.querySelectorAll('.timeline-tool-btn'));
  // Set pencil as default active tool
  if (timelineToolButtons.length > 0) {
    timelineToolButtons[0].classList.add('active');
  }
  const toolNames = ['pencil', 'select', 'slice', 'fade'];
  timelineToolButtons.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      timelineToolButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.timelineCurrentTool = toolNames[index] || 'pencil';
      
      // ⭐ Re-render all clips when tool changes
      const tracks = document.querySelectorAll('.track');
      tracks.forEach((track, trackIndex) => {
        const dropArea = track.querySelector('.track-drop-area');
        if (dropArea) {
          dropArea.innerHTML = "";
          window.clips
            .filter(c => c.trackIndex === trackIndex)
            .forEach(c => window.renderClip(c, dropArea));
        }
      });
    });
  });

  // Ctrl key detection for temporary timeline select mode
  window.addEventListener('keydown', function(e) {
    // Ctrl key temporarily switches to select tool (but not when mixer is open)
    if ((e.key === 'Control' || e.ctrlKey) && !isTimelineCtrlHeld && window.timelineCurrentTool !== 'select' && !window.mixer?.isOpen) {
      isTimelineCtrlHeld = true;
      timelineToolBeforeCtrl = window.timelineCurrentTool;
      window.timelineCurrentTool = 'select';
      
      // Update UI to show select tool is active
      timelineToolButtons.forEach(b => b.classList.remove('active'));
      if (timelineToolButtons[1]) { // Select tool is second button
        timelineToolButtons[1].classList.add('active');
      }
    }
  });

  window.addEventListener('keyup', function(e) {
    // Release Ctrl key switches back to previous tool (only if we had switched to select)
    if ((e.key === 'Control' || !e.ctrlKey) && isTimelineCtrlHeld && timelineToolBeforeCtrl) {
      isTimelineCtrlHeld = false;
      window.timelineCurrentTool = timelineToolBeforeCtrl;
      timelineToolBeforeCtrl = null;
      
      // Update UI to show previous tool is active
      timelineToolButtons.forEach(b => b.classList.remove('active'));
      const toolIndex = toolNames.indexOf(window.timelineCurrentTool);
      if (timelineToolButtons[toolIndex]) {
        timelineToolButtons[toolIndex].classList.add('active');
      }
    }
  });

  // Store references for later updates (e.g., VU meters)
  window.trackControls = [];
  // ⭐ Store per-track state for volume/pan/name/mute/solo
  window.trackStates = Array.from({ length: 16 }, (_, i) => ({
    volume: 0.5,
    pan: 0.5,
    name: `Track ${i + 1}`,
    muted: false,
    solo: false // <-- add solo state
  }));

  // If loading a project, use its track states
  if (window.loadedProject && Array.isArray(window.loadedProject.tracks)) {
    window.trackStates = window.loadedProject.tracks.map((t, i) => ({
      volume: Math.max(0, Math.min(1, Number(t.volume))),
      pan: Math.max(0, Math.min(1, Number(t.pan))),
      name: t.name || `Track ${i + 1}`,
      muted: !!t.muted,
      solo: !!t.solo // ensure boolean
    }));
    // Pad to 16 tracks if needed
    while (window.trackStates.length < 16) {
      const idx = window.trackStates.length;
      window.trackStates.push({ volume: 0.5, pan: 0.5, name: `Track ${idx + 1}`, muted: false, solo: false });
    }
  } else {
    window.trackStates = Array.from({ length: 16 }, (_, i) => ({
      volume: 0.5,
      pan: 0.5,
      name: `Track ${i + 1}`,
      muted: false,
      solo: false
    }));
  }

  // Global function to rename a track and sync both timeline and mixer
  window.renameTrack = function(trackIndex, newName) {
    if (trackIndex < 0 || trackIndex >= 16) return;
    
    // Update trackStates
    if (window.trackStates[trackIndex]) {
      window.trackStates[trackIndex].name = newName;
    }
    
    // Update timeline label (controls column)
    const timelineLabel = document.querySelector(`.track-controls[data-index="${trackIndex}"] .track-label`);
    if (timelineLabel) {
      timelineLabel.textContent = newName;
    }
    
    // Update mixer label
    if (window.mixer && window.mixer.tracks && window.mixer.tracks[trackIndex]) {
      const mixerLabel = window.mixer.tracks[trackIndex].querySelector('.mixer-track-label');
      if (mixerLabel) {
        mixerLabel.textContent = newName;
      }
    }
  };

  for (let i = 0; i < 16; i++) {
    const track = document.createElement("div");
    track.className = "track";
    track.dataset.index = i;
    const color = window.TRACK_COLORS[i % 10];
    track.style.setProperty("--track-color", color);

    /* -------------------------------------------------------
       LEFT CONTROL STRIP (goes into controlsColumn)
    ------------------------------------------------------- */
    const controls = document.createElement("div");
    controls.className = "track-controls";
    controls.dataset.index = i; // Link controls to track index

    // Set color for controls (for knobs, meter, etc)
    controls.style.setProperty("--track-color", color);
    // --- ADD: Set background to var(--bg-panel) ---
    controls.style.background = "var(--bg-panel)";

    const label = document.createElement("div");
    label.className = "track-label";
    label.textContent = window.trackStates[i]?.name || ("Track " + (i + 1));
    label.style.color = color;
    label.style.cursor = "pointer";
    label.title = "Click to rename";
    
    // Add click handler for renaming
    label.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentName = label.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentName;
      input.style.fontSize = 'inherit';
      input.style.fontWeight = 'inherit';
      input.style.color = color;
      input.style.background = 'var(--bg-panel)';
      input.style.border = '1px solid var(--accent-color)';
      input.style.padding = '2px 4px';
      input.style.borderRadius = '3px';
      input.style.textAlign = 'center';
      input.style.width = '100%';
      input.style.boxSizing = 'border-box';
      
      label.textContent = '';
      label.appendChild(input);
      input.focus();
      input.select();
      
      const finishRename = () => {
        const newName = input.value.trim() || currentName;
        input.removeEventListener('blur', finishRename);
        input.removeEventListener('keydown', handleKeydown);
        window.renameTrack(i, newName);
      };
      
      const handleKeydown = (e) => {
         if (e.key === 'Enter') {
           e.preventDefault();
           finishRename();
         }
        if (e.key === 'Escape') {
          input.removeEventListener('blur', finishRename);
          input.removeEventListener('keydown', handleKeydown);
          label.textContent = currentName;
        }
      };
      
      input.addEventListener('blur', finishRename);
      input.addEventListener('keydown', handleKeydown);
    });

    // Horizontal knob row
    const knobRow = document.createElement("div");
    knobRow.className = "knob-row";

    // Use trackStates for initial knob values
    const initialVol = window.trackStates[i]?.volume ?? 0.5;
    const initialPan = window.trackStates[i]?.pan ?? 0.5;
    const initialMute = !!window.trackStates[i]?.muted;
    const initialSolo = !!window.trackStates[i]?.solo;

    // --- SOLO BUTTON ---
    const soloWrap = document.createElement("div");
    soloWrap.className = "solo-wrap";
    soloWrap.style.display = "flex";
    soloWrap.style.alignItems = "center";
    soloWrap.style.marginRight = "0px";
    const soloBtn = document.createElement("button");
    soloBtn.className = "solo-btn";
    soloBtn.title = "Solo Track";
    soloBtn.style.width = "22px";
    soloBtn.style.height = "22px";
    soloBtn.style.border = "none";
    soloBtn.style.borderRadius = "50%";
    soloBtn.style.background = initialSolo ? "#FFD24D" : "#222";
    soloBtn.style.color = initialSolo ? "#222" : "#aaa";
    soloBtn.style.fontWeight = "bold";
    soloBtn.style.fontSize = "13px";
    soloBtn.style.cursor = "pointer";
    soloBtn.style.margin = "0 0px 0 0";
    soloBtn.textContent = "S";
    if (initialSolo) soloBtn.classList.add("soloed");

    // --- MUTE BUTTON ---
    const muteWrap = document.createElement("div");
    muteWrap.className = "mute-wrap";
    muteWrap.style.display = "flex";
    muteWrap.style.alignItems = "center";
    muteWrap.style.marginRight = "6px";
    const muteBtn = document.createElement("button");
    muteBtn.className = "mute-btn";
    muteBtn.title = "Mute Track";
    muteBtn.style.width = "22px";
    muteBtn.style.height = "22px";
    muteBtn.style.border = "none";
    muteBtn.style.borderRadius = "50%";
    muteBtn.style.background = initialMute ? "#4D88FF" : "#222";
    muteBtn.style.color = initialMute ? "#fff" : "#aaa";
    muteBtn.style.fontWeight = "bold";
    muteBtn.style.fontSize = "13px";
    muteBtn.style.cursor = "pointer";
    muteBtn.style.margin = "0 0px 0 0";
    muteBtn.textContent = "M";
    if (initialMute) muteBtn.classList.add("muted");

    // --- SOLO/MUTE LOGIC ---
    function updateTrackMuteSoloStates() {
      // Check if any track is soloed
      const anySolo = window.trackStates.some(t => t.solo);
      for (let j = 0; j < 16; j++) {
        const state = window.trackStates[j];
        const gain = window.trackGains && window.trackGains[j];
        const muteBtnEl = document.querySelector(`.track-controls[data-index="${j}"] .mute-btn`);
        const soloBtnEl = document.querySelector(`.track-controls[data-index="${j}"] .solo-btn`);
        // Determine if this track should be muted
        let effectiveMute = false;
        if (anySolo) {
          effectiveMute = !state.solo;
        }
        if (state.muted) effectiveMute = true;
        // Update gain
        if (gain) gain.gain.value = effectiveMute ? 0 : (state.volume ?? 0.5);
        // Update mute button UI
        if (muteBtnEl) {
          muteBtnEl.style.background = state.muted ? "#4D88FF" : "#222";
          muteBtnEl.style.color = state.muted ? "#fff" : "#aaa";
          if (state.muted) muteBtnEl.classList.add("muted");
          else muteBtnEl.classList.remove("muted");
          // Dim if muted by solo
          muteBtnEl.style.opacity = (!state.muted && anySolo && !state.solo) ? "0.5" : "";
        }
        // Update solo button UI
        if (soloBtnEl) {
          soloBtnEl.style.background = state.solo ? "#FFD24D" : "#222";
          soloBtnEl.style.color = state.solo ? "#222" : "#aaa";
          if (state.solo) soloBtnEl.classList.add("soloed");
          else soloBtnEl.classList.remove("soloed");
        }
      }
    }

    soloBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      window.trackStates[i].solo = !window.trackStates[i].solo;
      updateTrackMuteSoloStates();
    });

    muteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      window.trackStates[i].muted = !window.trackStates[i].muted;
      updateTrackMuteSoloStates();
    });

    soloWrap.appendChild(soloBtn);
    muteWrap.appendChild(muteBtn);

    // Volume knob + label
    const volWrap = document.createElement("div");
    volWrap.className = "knob-wrap";
    const vol = document.createElement("div");
    vol.className = "knob volume-knob";
    vol.dataset.value = initialVol;
    vol.dataset.idx = i;
    vol.dataset.type = "volume";
    vol.style.setProperty("--track-color", color);
    vol.style.setProperty("--val", initialVol);
    const volLabel = document.createElement("div");
    volLabel.className = "knob-label";
    volLabel.textContent = "VOL";
    volWrap.appendChild(vol);
    volWrap.appendChild(volLabel);

    // Pan knob + label
    const panWrap = document.createElement("div");
    panWrap.className = "knob-wrap";
    const pan = document.createElement("div");
    pan.className = "knob pan-knob";
    pan.dataset.value = initialPan;
    pan.dataset.idx = i;
    pan.dataset.type = "pan";
    pan.style.setProperty("--track-color", color);
    pan.style.setProperty("--val", initialPan);
    const panLabel = document.createElement("div");
    panLabel.className = "knob-label";
    panLabel.textContent = "PAN";
    panWrap.appendChild(pan);
    panWrap.appendChild(panLabel);

    // Set audio engine values immediately (handled by updateTrackMuteSoloStates)
    if (window.trackGains && window.trackGains[i]) {
      window.trackGains[i].gain.value = initialMute ? 0 : initialVol;
    }
    if (window.trackPanners && window.trackPanners[i]) {
      window.trackPanners[i].pan.value = (initialPan - 0.5) * 2;
    }

    // Attach knob listeners to update window.trackStates AND audio engine
    function knobHandler(knob, type, idx) {
      knob.addEventListener("mousedown", function (e) {
        e.preventDefault();
        const rect = knob.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        function move(ev) {
          let delta = (centerY - ev.clientY) / 60;
          let v = Number(knob.dataset.value) + delta;
          v = Math.max(0, Math.min(1, v));
          knob.dataset.value = v;
          knob.style.setProperty("--val", v);
          window.trackStates[idx][type] = v;
          if (type === "volume" && window.trackGains && window.trackGains[idx]) {
            // Only update gain if not muted or solo-muted
            const anySolo = window.trackStates.some(t => t.solo);
            const effectiveMute = (anySolo && !window.trackStates[idx].solo) || window.trackStates[idx].muted;
            if (!effectiveMute) {
              window.trackGains[idx].gain.value = v;
            }
          }
          // Do NOT update mixer fader or mixerFaderValues
        }
        function up() {
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
        }
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      });
    }
    knobHandler(vol, "volume", i);
    knobHandler(pan, "pan", i);

    // --- INSERT SOLO/MUTE BUTTONS BEFORE VOLUME KNOB ---
    knobRow.appendChild(soloWrap);
    knobRow.appendChild(muteWrap);
    knobRow.appendChild(volWrap);
    knobRow.appendChild(panWrap);
    

    controls.appendChild(label);
    controls.appendChild(knobRow);

    // Create meter
    const meter = document.createElement("div");
    meter.className = "track-meter";
    meter.style.setProperty("--track-color", color);
    const meterFill = document.createElement("div");
    meterFill.className = "track-meter-fill";
    meter.appendChild(meterFill);
    knobRow.appendChild(meter);

    // Store references for later updates (e.g., VU meter)
    window.trackControls[i] = {
      controls,
      vol,
      pan,
      meterFill,
      color
    };

    /* -------------------------------------------------------
      CLIP AREA (goes into tracksEl)
    ------------------------------------------------------- */
    const inner = document.createElement("div");
    inner.className = "track-inner";

    /* -------------------------------------------------------
      GRID (inside track-inner)
    ------------------------------------------------------- */
    const grid = document.createElement("div");
    grid.className = "track-grid";   // use class, not id
    inner.appendChild(grid);

    /* -------------------------------------------------------
      DROP AREA (above grid)
    ------------------------------------------------------- */
    const drop = document.createElement("div");
    drop.className = "track-drop-area";

    drop.addEventListener("dragover", (e) => e.preventDefault());

    // Left-click to paint/duplicate selected clip
    drop.addEventListener("mousedown", function(e) {
      if (window.timelineCurrentTool !== 'pencil') return;
      // --- Right mouse button: Start right-click drag delete mode ---
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        isDeletingClipsWithRightClick = true;
        deletedClipIds.clear();
        return;
      }
      // Only respond to left-click for painting
      if (e.button !== 0) return;
      // Prevent if dragging or selecting
      if (window.draggedClipId || window.draggedLoop) return;
      const selected = window.activeClip;
      if (!selected) return;
      // Find bar and track index
      const rect = drop.getBoundingClientRect();
      const x = e.clientX - rect.left;
      // Always use integer bar index for painting
      const startBar = Math.floor(window.snapToGrid(x / window.PIXELS_PER_BAR));
      const trackIndex = i;
      // Check if clicking on an existing clip - if so, let the clip handle it
      const clickedOnClip = e.target.closest('.clip');
      if (clickedOnClip) return;
      // Check if a clip already exists at this bar/track
      const overlap = window.clips.some(c =>
        c.trackIndex === trackIndex &&
        c.startBar < startBar + selected.bars &&
        (c.startBar + c.bars) > startBar
      );
      if (overlap) return;
      // Prevent event from bubbling to prevent any drag handlers
      e.preventDefault();
      e.stopPropagation();
      // Start paint mode
      isPainting = true;
      paintingTrackIndex = trackIndex;
      paintedBars.clear();
      // Stop painting on mouse up
      const stopPainting = () => {
        isPainting = false;
        paintingTrackIndex = -1;
        paintedBars.clear();
        document.removeEventListener('mousemove', globalPaintMove);
        document.removeEventListener('mouseup', stopPainting);
      };
      // Global paint handler that tracks X position across all tracks
      const globalPaintMove = (ev) => {
        if (window.timelineCurrentTool !== 'pencil') return;
        if (!isPainting) return;
        const selected = window.activeClip;
        if (!selected) return;
        // Get the timeline scroll area to calculate correct X position
        const timelineScroll = document.getElementById("timeline-scroll");
        if (!timelineScroll) return;
        const rect = timelineScroll.getBoundingClientRect();
        const x = ev.clientX - rect.left + timelineScroll.scrollLeft;
        // Always use integer bar index for painting
        const startBar = Math.floor(window.snapToGrid(x / window.PIXELS_PER_BAR));
        // Skip if already painted at this bar or if clip exists on the painting track
        if (paintedBars.has(startBar)) return;
        // Check for overlap: only block if the new clip would overlap an existing one
        const overlap = window.clips.some(c =>
          c.trackIndex === paintingTrackIndex &&
          ((startBar < c.startBar + c.bars) && (startBar + selected.bars > c.startBar))
        );
        if (overlap) return;
        // Paint new clip on the original track
        const newClip = {
          ...selected,
          id: crypto.randomUUID(),
          trackIndex: paintingTrackIndex,
          startBar
        };
        // Share references for MIDI clips (NOT deep copy)
        if (selected.type === "midi") {
          newClip.notes = selected.notes;
          newClip.sampleBuffer = selected.sampleBuffer;
          newClip.sampleName = selected.sampleName;
          if (selected.reverbGain) newClip.reverbGain = selected.reverbGain;
        }
        if (selected.type === "audio") {
          if (selected.reverbGain) newClip.reverbGain = selected.reverbGain;
        }
        window.clips.push(newClip);
        resolveClipCollisions(newClip);
        paintedBars.add(startBar);
        window.checkAndExpandTimeline();
        // Re-render only the painting track
        const paintingTrack = document.querySelector(`.track[data-index="${paintingTrackIndex}"]`);
        if (paintingTrack) {
          const paintingDrop = paintingTrack.querySelector(".track-drop-area");
          if (paintingDrop) {
            paintingDrop.innerHTML = "";
            window.clips
              .filter(c => c.trackIndex === paintingTrackIndex)
              .forEach(c => window.renderClip(c, paintingDrop));
          }
        }
      };
      document.addEventListener('mousemove', globalPaintMove);
      document.addEventListener('mouseup', stopPainting);
      // Paint first clip
      const newClip = {
        ...selected,
        id: crypto.randomUUID(),
        trackIndex,
        startBar // already floored above
      };
      // Share references for MIDI clips (NOT deep copy)
      if (selected.type === "midi") {
        newClip.notes = selected.notes; // Share the same notes array
        newClip.sampleBuffer = selected.sampleBuffer;
        newClip.sampleName = selected.sampleName;
        if (selected.reverbGain) newClip.reverbGain = selected.reverbGain;
      }
      if (selected.type === "audio") {
        if (selected.reverbGain) newClip.reverbGain = selected.reverbGain;
      }
      window.clips.push(newClip);
      resolveClipCollisions(newClip);
      paintedBars.add(startBar);
      const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
      window.refreshClipDropdown(uniqueClips);
      window.refreshGhostDropdown();
      window.checkAndExpandTimeline();
      drop.innerHTML = "";
      window.clips
        .filter(c => c.trackIndex === trackIndex)
        .forEach(c => window.renderClip(c, drop));
    }, true); // Use capture phase to intercept before clip handlers
// --- GLOBAL RIGHT-CLICK DRAG DELETE LOGIC ---
// Listen for mousemove on the timeline-scroll area to delete clips as you drag over them
document.addEventListener("mousemove", function(e) {
  if (!isDeletingClipsWithRightClick) return;
  // Only act if right mouse is held
  if (e.buttons !== undefined && (e.buttons & 2) === 0) return;
  // Find the element under the mouse
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (!el) return;
  // If it's a clip, delete it if not already deleted
  const clipEl = el.closest && el.closest('.clip');
  if (clipEl) {
    const clipId = clipEl.dataset.clipId;
    if (!deletedClipIds.has(clipId)) {
      // Find the clip object
      const clip = window.clips.find(c => c.id === clipId);
      if (clip) {
        const trackIndex = clip.trackIndex;
        window.clips = window.clips.filter(c => c.id !== clipId);
        deletedClipIds.add(clipId);
        // Re-render the track
        const track = document.querySelector(`.track[data-index="${trackIndex}"]`);
        if (track) {
          const dropArea = track.querySelector('.track-drop-area');
          if (dropArea) {
            dropArea.innerHTML = "";
            window.clips
              .filter(c => c.trackIndex === trackIndex)
              .forEach(c => window.renderClip(c, dropArea));
          }
        }
        if (window.activeClip && window.activeClip.id === clipId) {
          document.getElementById("piano-roll-container").classList.add("hidden");
          window.activeClip = null;
        }
        const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
        window.refreshClipDropdown(uniqueClips);
        window.refreshGhostDropdown();
      }
    }
  }
});




drop.addEventListener("drop", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  const isFileDrop = e.dataTransfer.files && e.dataTransfer.files.length > 0;
  const isLoopDrop = !!window.draggedLoop;
  const isClipDrop = !!window.draggedClipId;

  if (!isFileDrop && !isLoopDrop && !isClipDrop) return;


  // Find if dropping on an existing MIDI or audio clip
  const rect = drop.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const startBar = window.snapToGrid(x / window.PIXELS_PER_BAR);
  const trackIndex = i;
  // Find the clip at this position (if any)
  const targetClip = window.clips.find(c => c.trackIndex === trackIndex && c.startBar <= startBar && (c.startBar + c.bars) > startBar && c.type === "midi");
  const targetAudioClip = window.clips.find(c => c.trackIndex === trackIndex && c.startBar <= startBar && (c.startBar + c.bars) > startBar && c.type === "audio");

  // CASE 0: Dropping local audio or MIDI files
   

if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {

  for (const file of e.dataTransfer.files) {
    const name = file.name.toLowerCase();

/* ----------------------------------------------------
   CASE 0A: Local MIDI file
---------------------------------------------------- */
if (
  name.endsWith(".mid") ||
  name.endsWith(".midi") ||
  file.type === "audio/midi" ||
  file.type === "audio/x-midi"
) {
  const arrayBuffer = await file.arrayBuffer();
  // Parse MIDI → notes[]
  const midi = new Midi(arrayBuffer); // using tonejs/midi
  const notes = [];
  midi.tracks.forEach(t => {
    t.notes.forEach(n => {
      notes.push({
        pitch: n.midi,
        start: n.ticks / midi.header.ppq,
        end: (n.ticks + n.durationTicks) / midi.header.ppq
      });
    });
  });
  const maxEnd = Math.max(...notes.map(n => n.end));
  const bars = Math.ceil(maxEnd / 4);
  if (targetClip) {
    // Replace notes in ALL MIDI clips that share the same notes array (i.e., all duplicates)
    const targetNotes = targetClip.notes;
    const replacedIds = [];
window.clips.forEach(c => {
  if (c.type === "midi" && c.notes === targetNotes) {
    c.notes = notes;
    c.bars = bars;
    c.name = file.name.replace(/\.(mid|midi)$/i, "");
    replacedIds.push(c.id);
    resolveClipCollisions(c);
  }
});

// Update activeClip if it's one of the replaced clips (by id) or was sharing the same notes
if (window.activeClip) {
  // Prefer finding the actual clip object in window.clips by id
  const realActiveClip = window.clips.find(c => c.id === window.activeClip.id);
  if (realActiveClip && realActiveClip.type === "midi" && replacedIds.includes(realActiveClip.id)) {
    // Re-point activeClip to the canonical object from window.clips
    window.activeClip = realActiveClip;
    // Update piano roll UI if open
    const pianoRoll = document.getElementById("piano-roll-container");
    if (pianoRoll && !pianoRoll.classList.contains("hidden")) {
      if (typeof window.openPianoRoll === "function") {
        window.openPianoRoll(realActiveClip);
      }
      if (typeof window.renderPianoRoll === "function") {
        window.renderPianoRoll(realActiveClip);
      }
      const clipNameEl = document.getElementById("piano-roll-clip-name");
      if (clipNameEl) clipNameEl.textContent = realActiveClip.name || "MIDI Clip";
    }
  } else if (window.activeClip.notes === targetNotes) {
    // Fallback for the previous reference-sharing case
    window.activeClip.notes = notes;
    window.activeClip.bars = bars;
    window.activeClip.name = file.name.replace(/\.(mid|midi)$/i, "");
    const pianoRoll = document.getElementById("piano-roll-container");
    if (pianoRoll && !pianoRoll.classList.contains("hidden")) {
      if (typeof window.openPianoRoll === "function") {
        const realActive = window.clips.find(c => c.id === window.activeClip.id);
        if (realActive) {
          window.activeClip = realActive;
          window.openPianoRoll(realActive);
        }
      }
    }
  }
}
} else {
    // Create new MIDI clip as before
    const clip = new MidiClip(startBar, bars);
    clip.trackIndex = trackIndex;
    clip.notes = notes;
    clip.name = file.name.replace(/\.(mid|midi)$/i, "");
    clip.sampleBuffer = window.defaultMidiSampleBuffer;
    clip.sampleName = window.defaultMidiSampleName;
    window.clips.push(clip);
    resolveClipCollisions(clip);
    window.activeClip = clip;
  }
  const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
  window.refreshClipDropdown(uniqueClips);
  window.refreshGhostDropdown();
  drop.innerHTML = "";
  window.clips
    .filter(c => c.trackIndex === trackIndex)
    .forEach(c => window.renderClip(c, drop));
  window.checkAndExpandTimeline();
  continue;
}


    /* ----------------------------------------------------
       CASE 0B: Local audio file
    ---------------------------------------------------- */
    if (!file.type.startsWith("audio/")) continue;

    window.showLoadingBar(`Loading ${file.name}...`);
    window.updateLoadingBar(10);

    const arrayBuffer = await file.arrayBuffer();
    window.updateLoadingBar(30);
    
    await window.audioContext.resume();
    window.updateLoadingBar(50);
    
    const audioBuffer = await window.audioContext.decodeAudioData(arrayBuffer);
    window.updateLoadingBar(70);
    
    const normalizedBuffer = normalizeBuffer(audioBuffer);
    window.updateLoadingBar(90);

    const meta = window.parseLoopMetadata(file.name);
    
    const sourceBpm = meta.bpm || 175;
    const durationSeconds = normalizedBuffer.duration;
    // Calculate bars using the loop's own BPM (source BPM)
    const bars = window.calculateBarsFromAudio(normalizedBuffer, sourceBpm);

    if (targetAudioClip) {
      // Replace all audio clips that share the same fileName as the target (i.e., all duplicates)
      const targetFileName = targetAudioClip.fileName;
      const replacedIds = [];
      window.clips.forEach(c => {
        if (c.type === "audio" && c.fileName === targetFileName) {
          c.audioBuffer = normalizedBuffer;
          c.loopId = null;
          c.fileName = meta.displayName || file.name;
          c.bars = bars;
          c.durationSeconds = durationSeconds;
          c.bpm = sourceBpm;
          c.sourceBpm = sourceBpm;           // persist source BPM
          c.originalBars = bars;
          c.startOffset = 0;
          replacedIds.push(c.id);
          resolveClipCollisions(c);
        }
      });

      // Update activeClip if it's one of the replaced clips
      if (window.activeClip) {
        const realActiveClip = window.clips.find(c => c.id === window.activeClip.id);
        if (realActiveClip && realActiveClip.type === "audio" && replacedIds.includes(realActiveClip.id)) {
          window.activeClip = realActiveClip;
        } else if (window.activeClip.type === "audio" && window.activeClip.fileName === targetFileName) {
          window.activeClip.audioBuffer = normalizedBuffer;
          window.activeClip.loopId = null;
          window.activeClip.fileName = meta.displayName || file.name;
          window.activeClip.bars = bars;
          window.activeClip.durationSeconds = durationSeconds;
          window.activeClip.bpm = sourceBpm;
          window.activeClip.sourceBpm = sourceBpm;
          window.activeClip.originalBars = bars;
          window.activeClip.startOffset = 0;
        }
      }
    } else {
      // Create new audio clip using source BPM
      const clip = {
        id: crypto.randomUUID(),
        type: "audio",
        loopId: loop.id,
        audioBuffer: newBuffer,
        trackIndex,
        startBar,
        bars,
        bpm: loop.bpm,
        sourceBpm: loop.bpm,          // persist source BPM
        fileName: loop.displayName || loop.id,
        startOffset: 0,
        durationSeconds,
        originalBars: bars
      };

      window.clips.push(clip);
      resolveClipCollisions(clip);
      window.activeClip = clip;  // Set as active immediately after creation
    }  
    }
    
    // After processing all files, refresh once
    window.updateLoadingBar(100);
    
    const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
    window.refreshClipDropdown(uniqueClips);  // Refresh dropdown with unique clips
    window.refreshGhostDropdown();

    drop.innerHTML = "";
    window.clips
      .filter(c => c.trackIndex === trackIndex)
      .forEach(c => window.renderClip(c, drop));

    window.hideLoadingBar();
    window.checkAndExpandTimeline();
    return;
}

  /* CASE 1: Dropping a loop from sidebar */
  if (window.draggedLoop) {
    const loop = window.draggedLoop;

    /* -------------------------
     CASE 1A: MIDI CLIP
  ------------------------- */
  if (loop.type === "midi") {

    // BUILT-IN MIDI CLIP (already has notes)
if (loop.notes) {
  if (targetClip) {
    const newNotes = JSON.parse(JSON.stringify(loop.notes));
    const newBars = loop.bars;
    const newName = loop.displayName || generateMidiClipName();

    const replacedIds = [];
    const targetName = targetClip.name;

    window.clips.forEach(c => {
      if (c.type === "midi" && (c === targetClip || c.name === targetName)) {
        c.notes = JSON.parse(JSON.stringify(newNotes));
        c.bars = newBars;
        c.name = newName;
        replacedIds.push(c.id);
        resolveClipCollisions(c);
      }
    });

    // Update active clip if linked
    if (window.activeClip && replacedIds.includes(window.activeClip.id)) {
      const realActive = window.clips.find(c => c.id === window.activeClip.id);
      if (realActive) {
        window.activeClip = realActive;
        if (typeof window.renderPianoRoll === "function") {
          window.renderPianoRoll(realActive);
        }
      }
    } else if (window.activeClip && window.activeClip.name === targetName) {
      window.activeClip.notes = JSON.parse(JSON.stringify(newNotes));
      window.activeClip.bars = newBars;
      window.activeClip.name = newName;
      if (typeof window.renderPianoRoll === "function") {
        window.renderPianoRoll(window.activeClip);
      }
    }
  } else {
    const clip = new MidiClip(startBar, loop.bars);
    clip.trackIndex = trackIndex;
    clip.notes = JSON.parse(JSON.stringify(loop.notes));
    clip.sampleBuffer = window.defaultMidiSampleBuffer;
    clip.sampleName = window.defaultMidiSampleName;
    // Use unique name generator for "New MIDI Clip"
    if (loop.displayName === "New MIDI Clip") {
      clip.name = generateUniqueNewMidiClipName("New MIDI Clip");
    } else {
      clip.name = loop.displayName || generateMidiClipName();
    }
    window.clips.push(clip);
    resolveClipCollisions(clip);
    window.activeClip = clip;
  }
  const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
  window.refreshClipDropdown(uniqueClips);
  window.refreshGhostDropdown();
  drop.innerHTML = "";
  window.clips
    .filter(c => c.trackIndex === trackIndex)
    .forEach(c => window.renderClip(c, drop));
  window.checkAndExpandTimeline();
  return;
}


    // DROPBOX MIDI (lazy-loaded)
if (loop.url) {
  loadMidiFromDropbox(loop.url, loop.displayName).then(clip => {
    if (!clip) return;

    clip.startBar = startBar;
    clip.trackIndex = trackIndex;

    // ⭐ Per‑clip sample fields
    clip.sampleBuffer = window.defaultMidiSampleBuffer;
    clip.sampleName = window.defaultMidiSampleName;

    const newName = loop.displayName || generateMidiClipName();

    if (targetClip) {
      const targetName = targetClip.name;
      const replacedIds = [];

      window.clips.forEach(c => {
        if (c.type === "midi" && (c === targetClip || c.name === targetName)) {
          c.notes = JSON.parse(JSON.stringify(clip.notes));
          c.bars = clip.bars;
          c.name = newName;
          c.sampleBuffer = window.defaultMidiSampleBuffer;
          c.sampleName = window.defaultMidiSampleName;
          replacedIds.push(c.id);
          resolveClipCollisions(c);
        }
      });

      if (window.activeClip && replacedIds.includes(window.activeClip.id)) {
        const realActive = window.clips.find(c => c.id === window.activeClip.id);
        if (realActive) {
          window.activeClip = realActive;
          if (typeof window.renderPianoRoll === "function") {
            window.renderPianoRoll(realActive);
          }
        }
      }
    } else {
      clip.name = newName;
      window.clips.push(clip);
      resolveClipCollisions(clip);
      window.activeClip = clip;  // Set as active immediately after creation
    }

    const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
    window.refreshClipDropdown(uniqueClips);  // Refresh dropdown with unique clips
    window.refreshGhostDropdown();

    drop.innerHTML = "";
    window.clips
      .filter(c => c.trackIndex === trackIndex)
      .forEach(c => window.renderClip(c, drop));
    
    window.checkAndExpandTimeline();
  });

  return;
}

  }





      /* -------------------------
        CASE 1B: AUDIO CLIP
      ------------------------- */
      if (loop.type === "audio") {
        window.showLoadingBar(`Loading ${loop.displayName || loop.id}...`);
        window.updateLoadingBar(20);
        
        await window.loadLoop(loop.id, loop.url, loop.bpm);
        window.updateLoadingBar(80);
        
        const loopData = window.loopBuffers.get(loop.id);

        // Recompute bars using loop's source BPM, not project BPM
        const bars = loopData && loopData.buffer
          ? window.calculateBarsFromAudio(loopData.buffer, loop.bpm)
          : 1;
        const durationSeconds = loopData?.buffer?.duration || 0;

        const newBuffer = loopData?.buffer || null;

        if (targetAudioClip) {
          const targetBuffer = targetAudioClip.audioBuffer;
          const targetLoopId = targetAudioClip.loopId;
          const targetFileName = targetAudioClip.fileName;
          const replacedIds = [];

          window.clips.forEach(c => {
            if (c.type === "audio" && (c === targetAudioClip || c.audioBuffer === targetBuffer || c.loopId === targetLoopId || c.fileName === targetFileName)) {
              c.audioBuffer = newBuffer;
              c.loopId = loop.id;
              c.fileName = loop.displayName || loop.id;
              c.bars = bars;
              c.durationSeconds = durationSeconds;
              c.bpm = loop.bpm;
              c.sourceBpm = loop.bpm;     // persist source BPM
              c.originalBars = bars;
              c.startOffset = 0;
              replacedIds.push(c.id);
              resolveClipCollisions(c);
            }
          });

          if (window.activeClip) {
            const realActiveClip = window.clips.find(c => c.id === window.activeClip.id);
            if (realActiveClip && realActiveClip.type === "audio" && replacedIds.includes(realActiveClip.id)) {
              window.activeClip = realActiveClip;
            } else if (window.activeClip.type === "audio" && (window.activeClip.audioBuffer === targetBuffer || window.activeClip.loopId === targetLoopId || window.activeClip.fileName === targetFileName)) {
              window.activeClip.audioBuffer = newBuffer;
              window.activeClip.loopId = loop.id;
              window.activeClip.fileName = loop.displayName || loop.id;
              window.activeClip.bars = bars;
              window.activeClip.durationSeconds = durationSeconds;
              window.activeClip.bpm = loop.bpm;   // fix: use loop.bpm, not undefined loopBpm
              window.activeClip.sourceBpm = loop.bpm;
              window.activeClip.originalBars = bars;
              window.activeClip.startOffset = 0;
            }
          }
        } else {
          const clip = {
            id: crypto.randomUUID(),
            type: "audio",
            loopId: loop.id,
            audioBuffer: newBuffer,
            trackIndex,
            startBar,
            bars,
            bpm: loop.bpm,
            sourceBpm: loop.bpm,          // persist source BPM
            fileName: loop.displayName || loop.id,
            startOffset: 0,
            durationSeconds,
            originalBars: bars
          };

          window.clips.push(clip);
          resolveClipCollisions(clip);
          window.activeClip = clip;  // Set as active immediately after creation
        }
        
        window.updateLoadingBar(100);
        
        const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
        window.refreshClipDropdown(uniqueClips);  // Refresh dropdown with unique clips
        window.refreshGhostDropdown();

        drop.innerHTML = "";
        window.clips
          .filter(c => c.trackIndex === trackIndex)
          .forEach(c => window.renderClip(c, drop));

        window.hideLoadingBar();
        window.checkAndExpandTimeline();
        return;
      }
    }


/* CASE 2: Moving or duplicating an existing clip */
if (window.draggedClipId) {
  if (window.timelineCurrentTool !== 'pencil') return;
  const original = window.clips.find(c => c.id === window.draggedClipId);

  if (original) {

    const oldTrackIndex = original.trackIndex;

    // ⭐ Force MOVE when dragging to a different track
    if (oldTrackIndex !== trackIndex) {
      window.isDuplicateDrag = false;
    }

    if (window.isDuplicateDrag) {
      const newClip = {
        ...original,
        id: crypto.randomUUID(),
        trackIndex,
        startBar
      };
      window.clips.push(newClip);
      resolveClipCollisions(newClip);
      window.activeClip = newClip;  // Set as active immediately after duplication
      const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
      window.refreshClipDropdown(uniqueClips);  // Refresh dropdown with unique clips
      window.refreshGhostDropdown();
    } else {
      original.trackIndex = trackIndex;
      original.startBar = startBar;
      resolveClipCollisions(original);
      // ⭐ If this clip is currently open in the piano roll, update it
      if (window.activeClip && window.activeClip.id === original.id) {
        window.activeClip = original;            // update reference
        window.activeTrackIndex = trackIndex;    // update track index
        window.openPianoRoll(original);

        window.renderPianoRoll(original);        // refresh colours + notes
      }

    }

    // ⭐ Remove old DOM element directly (no track refresh)
    const oldEl = document.querySelector(`[data-clip-id="${original.id}"]`);
    if (oldEl) oldEl.remove();
  }
}

/* Re-render NEW track */
drop.innerHTML = "";
window.clips
  .filter(c => c.trackIndex === trackIndex)
  .forEach(c => window.renderClip(c, drop));

/* Reset drag state */
window.draggedClipId = null;
window.draggedLoop = null;
window.isDuplicateDrag = false;

/* Check if timeline needs to expand */
window.checkAndExpandTimeline();



});


    /* Add drop area after grid */
    inner.appendChild(drop);


    /* -------------------------------------------------------
       BUILD TRACK - SEPARATE CONTROLS AND INNER
    ------------------------------------------------------- */
    // Add controls to fixed column
    controlsColumn.appendChild(controls);
    
    // Add inner to scrollable tracks
    track.appendChild(inner);
    tracksEl.appendChild(track);
    
  }

  // Set initial track min-width based on timeline bars
  const trackMinWidth = window.timelineBars * window.PIXELS_PER_BAR;
  const tracks = document.querySelectorAll('.track');
  tracks.forEach(track => {
    track.style.minWidth = trackMinWidth + 'px';
  });

  // Set initial drop area min-width
  const dropAreas = document.querySelectorAll('.track-drop-area');
  dropAreas.forEach(dropArea => {
    dropArea.style.minWidth = trackMinWidth + 'px';
  });

/* -------------------------------------------------------
   GRID RENDERING (per track)
------------------------------------------------------- */
window.renderGrid = function() {
  const grids = document.querySelectorAll(".track-grid");
  if (!grids.length) return;

  const totalBars = window.timelineBars || 64;
  const beatsPerBar = 4;

  grids.forEach(grid => {
    grid.innerHTML = "";

    const totalWidth = totalBars * window.PIXELS_PER_BAR;
    grid.style.width = totalWidth + "px";

    const trackHeight = grid.parentElement.offsetHeight;

    // Vertical bars + beats
    for (let i = 0; i < totalBars; i++) {
      const bar = document.createElement("div");
      bar.className = "grid-bar";
      bar.style.left = (i * window.PIXELS_PER_BAR) + "px";
      grid.appendChild(bar);

      // Beat lines
      for (let b = 1; b < beatsPerBar; b++) {
        const beat = document.createElement("div");
        beat.className = "grid-beat";
        beat.style.left =
          (i * window.PIXELS_PER_BAR) +
          (b * (window.PIXELS_PER_BAR / beatsPerBar)) +
          "px";
        grid.appendChild(beat);
      }

      // ⭐ NEW: 1/4-beat subdivision lines
      const quarter = window.PIXELS_PER_BAR / (beatsPerBar * 4);
      for (let q = 1; q < beatsPerBar * 4; q++) {
        // Skip positions that coincide with full beats
        if (q % 4 === 0) continue;

        const sub = document.createElement("div");
        sub.className = "grid-subbeat";
        sub.style.left =
          (i * window.PIXELS_PER_BAR) +
          (q * quarter) +
          "px";
        grid.appendChild(sub);
      }

      // 1-bar guide line
      if (i % 4 === 0) {
        const onebar = document.createElement("div");
        onebar.className = "grid-onebar";
        onebar.style.left = (i * window.PIXELS_PER_BAR) + "px";
        grid.appendChild(onebar);
      }

            // 4-bar guide line
      if (i % 16 === 0) {
        const fourBar = document.createElement("div");
        fourBar.className = "grid-fourbar";
        fourBar.style.left = (i * window.PIXELS_PER_BAR) + "px";
        grid.appendChild(fourBar);
      }
    }

    // Horizontal lines
    for (let y = 12; y < trackHeight; y += 12) {
      const row = document.createElement("div");
      row.className = "grid-row";
      row.style.top = y + "px";
      grid.appendChild(row);
    }
  });
};

window.renderGrid();
window.renderTimelineBar(window.timelineBars);

  // --- Timeline bar, playhead, and seekMarker horizontal sync ---
  const timelineScroll = document.getElementById("timeline-scroll");
  const timelineBar = document.getElementById("timeline-bar");
  const playhead = document.getElementById("playhead");
  const seekMarker = document.getElementById("seekMarker");

  // ⭐ NEW: Sync vertical scroll between controls and timeline
  //const controlsColumn = document.getElementById("track-controls-column");
  
  if (timelineScroll && timelineBar) {
    timelineScroll.addEventListener("scroll", function () {
      const scrollX = timelineScroll.scrollLeft;
      const scrollY = timelineScroll.scrollTop;
      
      timelineBar.style.transform = `translateX(${-scrollX}px)`;
      if (seekMarker) seekMarker.style.transform = `translateX(${-scrollX}px)`;
      
      // Keep playhead visually locked at the left edge of the timeline grid
      if (playhead) {
        playhead.style.left = (scrollX) + "px";
      }
      
      // ⭐ Sync vertical scroll to controls column
      if (controlsColumn) {
        controlsColumn.scrollTop = scrollY;
      }
    });
  }
};

/* -------------------------------------------------------
   CLIP RENDERING (supports local files + library loops)
------------------------------------------------------- */
window.renderClip = function (clip, dropArea) {
  

  const el = document.createElement("div");
  el.className = "clip";
  el.dataset.clipId = clip.id;


  // --- Ensure selected outline if this clip is selected ---
  if (window.selectedClipIds && window.selectedClipIds.has(clip.id)) {
    el.classList.add("clip-selected");
  }

  // --- SELECTION LOGIC FOR SELECT MODE ---
  el.addEventListener("mousedown", function(e) {
    if (window.timelineCurrentTool === 'select' && e.button === 0) {
      if (e.shiftKey) {
        // Shift-click: toggle selection
        e.preventDefault();
        e.stopPropagation();
        if (!window.selectedClipIds) window.selectedClipIds = new Set();
        if (window.selectedClipIds.has(clip.id)) {
          window.selectedClipIds.delete(clip.id);
          el.classList.remove("clip-selected");
        } else {
          window.selectedClipIds.add(clip.id);
          el.classList.add("clip-selected");
        }
        return;
      } else {
        // Only clear and select if not starting a drag (marquee) selection
        // Only do this if the click is not part of a drag (handled by timelineScroll mousedown)
        // We use a short timeout to check if mouse moves (drag) or not (click)
        let clickHandled = false;
        const onMouseMove = () => { clickHandled = true; document.removeEventListener('mousemove', onMouseMove); };
        document.addEventListener('mousemove', onMouseMove);
        setTimeout(() => {
          document.removeEventListener('mousemove', onMouseMove);
          if (!clickHandled) {
            // This was a click, not a drag
            e.preventDefault();
            e.stopPropagation();
            if (!window.selectedClipIds) window.selectedClipIds = new Set();
            document.querySelectorAll('.clip-selected').forEach(el2 => el2.classList.remove('clip-selected'));
            window.selectedClipIds.clear();
            window.selectedClipIds.add(clip.id);
            el.classList.add("clip-selected");
          }
        }, 0);
      }
    }
  });

  // --- MOUSE MOVE FOR CONTINUOUS DELETION ---
  el.addEventListener("mousemove", function (e) {
    if (window.timelineCurrentTool !== 'pencil') return;
    if (isDeletingClipsWithRightClick && !deletedClipIds.has(clip.id)) {
      e.preventDefault();
      e.stopPropagation();
      const trackIndex = clip.trackIndex;
      window.clips = window.clips.filter(c => c.id !== clip.id);
      deletedClipIds.add(clip.id);
      dropArea.innerHTML = "";
      window.clips
        .filter(c => c.trackIndex === trackIndex)
        .forEach(c => window.renderClip(c, dropArea));
      if (window.activeClip && window.activeClip.id === clip.id) {
        document.getElementById("piano-roll-container").classList.add("hidden");
        window.activeClip = null;
      }
      const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
      window.refreshClipDropdown(uniqueClips);
      window.refreshGhostDropdown();
    }
  });

  // --- Real-time drag/move with double-click threshold ---
  el.addEventListener("mousedown", function (e) {
    if (window.timelineCurrentTool !== 'pencil') return;
    // --- RIGHT CLICK → START DELETION ---
    if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
      isDeletingClipsWithRightClick = true;
      deletedClipIds.clear();
      // Delete the clicked clip
      const trackIndex = clip.trackIndex;
      window.clips = window.clips.filter(c => c.id !== clip.id);
      deletedClipIds.add(clip.id);
      dropArea.innerHTML = "";
      window.clips
        .filter(c => c.trackIndex === trackIndex)
        .forEach(c => window.renderClip(c, dropArea));
      if (window.activeClip && window.activeClip.id === clip.id) {
        document.getElementById("piano-roll-container").classList.add("hidden");
        window.activeClip = null;
      }
      const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
      window.refreshClipDropdown(uniqueClips);
      window.refreshGhostDropdown();
      return;
    }
    if (e.button !== 0) return; // Only left mouse for normal operations

    // --- SHIFT+DRAG TO DUPLICATE MULTI-CLIP IN PENCIL MODE ---
    const isMultiSelect = window.selectedClipIds && window.selectedClipIds.size > 1 && window.selectedClipIds.has(clip.id);
    if (e.shiftKey && isMultiSelect) {
      e.preventDefault();
      e.stopPropagation();
      // Duplicate all selected clips (shallow copy for MIDI)
      const selectedClips = window.clips.filter(c => window.selectedClipIds.has(c.id));
      // Clear selection outline and selection set from original clips
      selectedClips.forEach(c => {
        const origEl = document.querySelector(`.clip[data-clip-id="${c.id}"]`);
        if (origEl) origEl.classList.remove("clip-selected");
      });
      if (window.selectedClipIds) window.selectedClipIds.clear();
      // Map from old id to new id for updating selection
      const oldToNewIds = new Map();
      // Find anchor (the one being dragged)
      const anchorIdx = selectedClips.findIndex(c => c.id === clip.id);
      // Store original positions
      const originalPositions = selectedClips.map(c => ({
        id: c.id,
        startBar: c.startBar,
        trackIndex: c.trackIndex
      }));
      // Create duplicates
      const duplicates = selectedClips.map(orig => {
        let newClip;
        if (orig.type === 'midi') {
          // Shallow copy: share notes array, new id
          newClip = Object.assign({}, orig);
          newClip.id = crypto.randomUUID();
          // Do NOT deep copy notes, keep reference
        } else {
          // Audio: shallow copy, new id
          newClip = Object.assign({}, orig);
          newClip.id = crypto.randomUUID();
        }
        oldToNewIds.set(orig.id, newClip.id);
        return newClip;
      });
      // Add to window.clips
      window.clips.push(...duplicates);
      // Set up for drag
      let moved = false;
      const trackRect = el.parentElement.getBoundingClientRect();
      const mouseX = e.clientX - trackRect.left;
      const mouseBar = mouseX / window.PIXELS_PER_BAR;
      const beatsPerBar = 4;
      const beat = Math.floor(mouseBar * beatsPerBar) / beatsPerBar;
      const startX = trackRect.left + (beat * window.PIXELS_PER_BAR);
      function onMove(ev) {
        const dx = ev.clientX - startX;
        if (Math.abs(dx) > (window.PIXELS_PER_BAR/8)) moved = true;
        if (!moved) return;
        // Calculate newBar for anchor
        let newBar = originalPositions[anchorIdx].startBar + dx / window.PIXELS_PER_BAR;
        newBar = window.snapToGrid(newBar);
        newBar = Math.max(0, newBar);
        const deltaBars = newBar - originalPositions[anchorIdx].startBar;
        // Move all duplicates by deltaBars
        duplicates.forEach((c, idx) => {
          let orig = originalPositions[idx];
          c.startBar = Math.max(0, orig.startBar + deltaBars);
        });
        // Redraw all affected tracks
        const affectedTracks = new Set(duplicates.map(c => c.trackIndex));
        affectedTracks.forEach(trackIdx => {
          const track = document.querySelector(`.track[data-index="${trackIdx}"]`);
          if (track) {
            const dropArea = track.querySelector(".track-drop-area");
            if (dropArea) {
              dropArea.innerHTML = "";
              window.clips.filter(c => c.trackIndex === trackIdx)
                .forEach(c => {
                  window.renderClip(c, dropArea);
                  if (duplicates.some(d => d.id === c.id)) {
                    cEl = dropArea.querySelector(`[data-clip-id="${c.id}"]`);
                    if (cEl) cEl.classList.add("clip-selected");
                  }
                });
            }
          }
        });
      }
      function onUp(ev) {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (moved) {
          duplicates.forEach(c => resolveClipCollisions(c));
          // Redraw all affected tracks
          const affectedTracks = new Set(duplicates.map(c => c.trackIndex));
          affectedTracks.forEach(trackIdx => {
            const track = document.querySelector(`.track[data-index="${trackIdx}"]`);
            if (track) {
              const dropArea = track.querySelector(".track-drop-area");
              if (dropArea) {
                dropArea.innerHTML = "";
                window.clips.filter(c => c.trackIndex === trackIdx)
                  .forEach(c => {
                    window.renderClip(c, dropArea);
                    if (duplicates.some(d => d.id === c.id)) {
                      cEl = dropArea.querySelector(`[data-clip-id="${c.id}"]`);
                      if (cEl) cEl.classList.add("clip-selected");
                    }
                  });
              }
            }
          });
          // Update selection to new duplicates
          window.selectedClipIds.clear();
          duplicates.forEach(c => window.selectedClipIds.add(c.id));
        } else {
          // If not moved, remove the duplicates
          window.clips = window.clips.filter(c => !duplicates.some(d => d.id === c.id));
        }
        // Set dropdown to the anchor duplicate
        const dropdown = document.getElementById("clipListDropdown");
        if (dropdown) dropdown.value = duplicates[anchorIdx].name || duplicates[anchorIdx].fileName || duplicates[anchorIdx].id;
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      return;
    }

    // --- NORMAL DRAG (NO SHIFT) ---
    e.preventDefault();
    e.stopPropagation();
    let clipsToMove = [clip];
    let originalPositions = [{ id: clip.id, startBar: clip.startBar, trackIndex: clip.trackIndex }];
    if (isMultiSelect) {
      clipsToMove = window.clips.filter(c => window.selectedClipIds.has(c.id));
      originalPositions = clipsToMove.map(c => ({
        id: c.id,
        startBar: c.startBar,
        trackIndex: c.trackIndex
      }));
    }
    const trackRect = el.parentElement.getBoundingClientRect();
    const mouseX = e.clientX - trackRect.left;
    const mouseBar = mouseX / window.PIXELS_PER_BAR;
    const beatsPerBar = 4;
    const beat = Math.floor(mouseBar * beatsPerBar) / beatsPerBar;
    const startX = trackRect.left + (beat * window.PIXELS_PER_BAR);
    let moved = false;
    let lastDx = 0;
    function onMove(ev) {
      const dx = ev.clientX - startX;
      lastDx = dx;
      if (Math.abs(dx) > (window.PIXELS_PER_BAR/8)) moved = true;
      if (!moved) return;
      let newBar = originalPositions[0].startBar + dx / window.PIXELS_PER_BAR;
      newBar = window.snapToGrid(newBar);
      newBar = Math.max(0, newBar);
      const deltaBars = newBar - originalPositions[0].startBar;
      clipsToMove.forEach((c, idx) => {
        let orig = originalPositions.find(op => op.id === c.id);
        if (!orig) orig = { startBar: c.startBar, trackIndex: c.trackIndex };
        c.startBar = Math.max(0, orig.startBar + deltaBars);
      });
      const affectedTracks = new Set(clipsToMove.map(c => c.trackIndex));
      affectedTracks.forEach(trackIdx => {
        const track = document.querySelector(`.track[data-index="${trackIdx}"]`);
        if (track) {
          const dropArea = track.querySelector(".track-drop-area");
          if (dropArea) {
            dropArea.innerHTML = "";
            window.clips.filter(c => c.trackIndex === trackIdx)
              .forEach(c => {
                window.renderClip(c, dropArea);
                const el = dropArea.querySelector(`[data-clip-id="${c.id}"]`);
                if (el && window.selectedClipIds.has(c.id)) {
                  el.classList.add("clip-selected");
                }
              });
          }
        }
      });
    }
    function onUp(ev) {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (moved) {
        clipsToMove.forEach(c => resolveClipCollisions(c));
        const affectedTracks = new Set(clipsToMove.map(c => c.trackIndex));
        affectedTracks.forEach(trackIdx => {
          const track = document.querySelector(`.track[data-index="${trackIdx}"]`);
          if (track) {
            const dropArea = track.querySelector(".track-drop-area");
            if (dropArea) {
              dropArea.innerHTML = "";
              window.clips.filter(c => c.trackIndex === trackIdx)
                .forEach(c => {
                  window.renderClip(c, dropArea);
                  const el = dropArea.querySelector(`[data-clip-id="${c.id}"]`);
                  if (el && window.selectedClipIds.has(c.id)) {
                    el.classList.add("clip-selected");
                  }
                });
            }
          }
        });
      }
      const dropdown = document.getElementById("clipListDropdown");
      if (dropdown) dropdown.value = clip.name || clip.fileName || clip.id;
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    window.activeClip = clip;
    const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
    window.refreshClipDropdown(uniqueClips);
    window.refreshGhostDropdown();
    const pianoRoll = document.getElementById("piano-roll-container");
    if (
      pianoRoll &&
      !pianoRoll.classList.contains("hidden") &&
      clip.type === "midi"
    ) {
      window.activeClip = clip;
      const clipNameEl = document.getElementById("piano-roll-clip-name");
      if (clipNameEl) {
        clipNameEl.textContent = clip.name || "MIDI Clip";
      }
      openPianoRoll(clip);
      const dropdown = document.getElementById("clipListDropdown");
      if (dropdown) {
        dropdown.value = clip.name || clip.fileName || clip.id;
      }
    }
  });

  // Compute width fresh every render
  const width = clip.bars * window.PIXELS_PER_BAR;
  el.style.left = (clip.startBar * window.PIXELS_PER_BAR) + "px";
  el.style.width = width + "px";

/* -------------------------------------------------------
   RIGHT-CLICK DELETE
------------------------------------------------------- */
el.addEventListener("contextmenu", (e) => {
  if (window.timelineCurrentTool !== 'pencil') return;
  e.preventDefault();
  e.stopPropagation();
  if (deletedClipIds.has(clip.id)) return;
  const trackIndex = clip.trackIndex;
  window.clips = window.clips.filter(c => c.id !== clip.id);
  dropArea.innerHTML = "";
  window.clips
    .filter(c => c.trackIndex === trackIndex)
    .forEach(c => window.renderClip(c, dropArea));
  document.getElementById("piano-roll-container").classList.add("hidden");
  activeClip = null;
  window.refreshClipDropdown(window.clips);
});


/* -------------------------------------------------------
   RESIZE HANDLE (right-edge trim) — snap to whole bars
   + glow + bar ruler preview
------------------------------------------------------- */
const handle = document.createElement("div");
handle.className = "resize-handle";
el.appendChild(handle);

handle.addEventListener("mousedown", (e) => {
  if (window.timelineCurrentTool !== 'pencil') return;
  e.stopPropagation();
  e.preventDefault();
  const startX = e.clientX;
  const startBars = clip.bars;
  const preview = document.createElement("div");
  preview.className = "clip-resize-preview";
  const glow = document.createElement("div");
  glow.className = "glow";
  preview.appendChild(glow);
  el.appendChild(preview);
  function move(ev) {
    const deltaPx = ev.clientX - startX;
    const deltaBarsRaw = deltaPx / window.PIXELS_PER_BAR;
    const snappedDeltaBars = window.snapDeltaToGrid(deltaBarsRaw);
      let minSnap = window.getSnapValue();
      let newBars = Math.max(minSnap, startBars + snappedDeltaBars);
    clip.bars = newBars;
    const newWidth = newBars * window.PIXELS_PER_BAR;
    el.style.width = newWidth + "px";
    preview.style.width = newWidth + "px";
    preview.innerHTML = "";
    preview.appendChild(glow);
    if (clip.type === "midi") {
      let midiCanvas = el.querySelector(".midi-preview");
      const beatsPerBar = 4;
      const pxPerBar = window.PIXELS_PER_BAR;
      const pxPerBeat = pxPerBar / beatsPerBar;
      if (!midiCanvas) {
        midiCanvas = document.createElement("canvas");
        midiCanvas.className = "midi-preview";
        midiCanvas.style.position = "absolute";
        midiCanvas.style.bottom = "0";
        midiCanvas.style.left = "0";
        midiCanvas.style.pointerEvents = "none";
        midiCanvas.style.zIndex = "2";
        el.appendChild(midiCanvas);
      }
      midiCanvas.width = clip.bars * pxPerBar;
      midiCanvas.height = 40;
      const ctx = midiCanvas.getContext("2d");
      ctx.clearRect(0, 0, midiCanvas.width, midiCanvas.height);
      let minPitch = Infinity;
      let maxPitch = -Infinity;
      clip.notes.forEach(n => {
        if (n.pitch < minPitch) minPitch = n.pitch;
        if (n.pitch > maxPitch) maxPitch = n.pitch;
      });
      minPitch -= 1;
      maxPitch += 1;
      const pitchRange = Math.max(1, maxPitch - minPitch);
      const rowHeight = midiCanvas.height / pitchRange;
      clip.notes.forEach(note => {
        const gap = 1;
        const x = note.start * pxPerBeat + gap;
        const w = (note.end - note.start) * pxPerBeat - gap * 2;
        const y = (maxPitch - note.pitch) * rowHeight;
        const h = Math.max(3, rowHeight - 2);
               ctx.fillStyle = window.TRACK_COLORS[clip.trackIndex % 10];
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.strokeRect(x, y, w, h);
      });
    }
  }
  function up() {
    preview.remove();
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
  }
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
});

el.addEventListener("dblclick", () => {
  if (clip.type === "midi") {
    const realClip = window.clips.find(c => c.id === el.dataset.clipId);
    window.activeClip = realClip;

    // ⭐ Update clip name in the piano roll header
    const clipNameEl = document.getElementById("piano-roll-clip-name");
    if (clipNameEl) {
      clipNameEl.textContent = realClip.name || "MIDI Clip";
    }

    // ⭐ Open piano roll (this will update the sample name)
    openPianoRoll(realClip);

    // --- FIX: Set dropdown value to match the opened clip ---
    const dropdown = document.getElementById("clipListDropdown");
    if (dropdown) {
      dropdown.value = realClip.name || realClip.fileName || realClip.id;
    }
  } else {
    // Select this clip in the dropdown on double-click
    const dropdown = document.getElementById("clipListDropdown");
    if (dropdown) dropdown.value = clip.id;
  }
});


/* -------------------------------------------------------
   AUDIO WAVEFORM RENDERING
------------------------------------------------------- */
let bufferToDraw = null;

if (clip.type === "audio") {
  if (clip.audioBuffer) {
    bufferToDraw = clip.audioBuffer;
  } else if (clip.loopId) {
    const loopData = window.loopBuffers.get(clip.loopId);
    if (loopData && loopData.buffer) {
      bufferToDraw = loopData.buffer;

      if (!clip.originalBars && loopData.bars) {
        clip.originalBars = loopData.bars;
      }
    }
  }
}


if (clip.type === "audio" && bufferToDraw) {
  const durationSeconds = bufferToDraw.duration;
  const barDuration = window.barsToSeconds(1);
  const projectBars = durationSeconds / barDuration;

  if (!isFinite(clip.originalBars) || clip.originalBars <= 0) {
    clip.originalBars = projectBars;
  }

  if (!isFinite(clip.bars) || clip.bars <= 0) {
    clip.bars = clip.originalBars;
  }

  const originalBars = clip.originalBars;
  const playbackBars = clip.bars;

  const waveformWidth = originalBars * window.PIXELS_PER_BAR;

  const color = window.TRACK_COLORS[clip.trackIndex % 10];
  const samples = bufferToDraw.getChannelData(0);

  const waveform = window.renderWaveformSlice(
    samples,
    waveformWidth,
    40,
    color
  );

  waveform.style.position = "absolute";
  waveform.style.bottom = "0";
  waveform.style.left = "0";
  waveform.style.pointerEvents = "none";

  const clipWidth = playbackBars * window.PIXELS_PER_BAR;
  el.style.width = clipWidth + "px";

  waveform.style.width = waveformWidth + "px";
  el.style.overflow = "hidden";

  el.appendChild(waveform);
}


if (clip.type === "midi") {
  el.style.width = (clip.bars * window.PIXELS_PER_BAR) + "px";

  const beatsPerBar = 4;
  const pxPerBar = window.PIXELS_PER_BAR;
  const pxPerBeat = pxPerBar / beatsPerBar;

  // ⭐ Reuse or create preview canvas
  let midiCanvas = el.querySelector(".midi-preview");
  if (!midiCanvas) {
    midiCanvas = document.createElement("canvas");
    midiCanvas.className = "midi-preview";
    midiCanvas.style.position = "absolute";
    midiCanvas.style.bottom = "0";
    midiCanvas.style.left = "0";
    midiCanvas.style.pointerEvents = "none";
    midiCanvas.style.zIndex = "2";
    el.appendChild(midiCanvas);
  }

  // ⭐ Resize canvas
  midiCanvas.width = clip.bars * pxPerBar;
  midiCanvas.height = 40;

  const ctx = midiCanvas.getContext("2d");
  ctx.clearRect(0, 0, midiCanvas.width, midiCanvas.height);

  // Match piano roll pitch range
  // Auto-fit pitch range
  let minPitch = Infinity;
  let maxPitch = -Infinity;

  clip.notes.forEach(n => {
    if (n.pitch < minPitch) minPitch = n.pitch;
    if (n.pitch > maxPitch) maxPitch = n.pitch;
  });

  // Add a little padding so notes aren't touching the edges
  minPitch -= 1;
  maxPitch += 1;

  const pitchRange = Math.max(1, maxPitch - minPitch);
  const rowHeight = midiCanvas.height / pitchRange;


  clip.notes.forEach(note => {
    const gap = 1;

    const x = note.start * pxPerBeat + gap;
    const w = (note.end - note.start) * pxPerBeat - gap * 2;

    const y = (maxPitch - note.pitch) * rowHeight;

    const h = Math.max(3, rowHeight - 2);

    ctx.fillStyle = window.TRACK_COLORS[clip.trackIndex % 10];
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.strokeRect(x, y, w, h);
  });
}

// --- FADE OVERLAYS (for both audio and MIDI clips) ---
if ((clip.fadeIn > 0 || clip.fadeOut > 0)) {
  const clipWidth = clip.bars * window.PIXELS_PER_BAR;
  const fadeCanvas = document.createElement("canvas");
  fadeCanvas.className = "fade-overlay";
  fadeCanvas.width = clipWidth;
  fadeCanvas.height = 40;
  fadeCanvas.style.position = "absolute";
  fadeCanvas.style.bottom = "0";
  fadeCanvas.style.left = "0";
  fadeCanvas.style.pointerEvents = "none";
  
  const ctx = fadeCanvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, clipWidth, 0);
  
  const fadeInPx = (clip.fadeIn / clip.bars) * clipWidth;
  const fadeOutPx = (clip.fadeOut / clip.bars) * clipWidth;
  
  // Fade in gradient
  if (clip.fadeIn > 0) {
    gradient.addColorStop(0, "rgba(0,0,0,0.5)");
    gradient.addColorStop(fadeInPx / clipWidth, "rgba(0,0,0,0)");
  }
  
  // Fade out gradient
  if (clip.fadeOut > 0) {
    const fadeOutStart = 1 - (fadeOutPx / clipWidth);
    gradient.addColorStop(fadeOutStart, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.5)");
  }
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, clipWidth, 40);
  
  // Draw fade curves
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  
  // Fade in curve
  if (clip.fadeIn > 0) {
    ctx.moveTo(0, 40);
    ctx.lineTo(fadeInPx, 0);
  }
  
  // Fade out curve
  if (clip.fadeOut > 0) {
    ctx.moveTo(clipWidth - fadeOutPx, 0);
    ctx.lineTo(clipWidth, 40);
  }
  
  ctx.stroke();
  
  el.appendChild(fadeCanvas);
}


/* -------------------------------------------------------
   LABEL
   - Local audio: fileName
   - Loop audio: fileName
   - MIDI: name
------------------------------------------------------- */
// Create a container for the triangle and label
const labelWrap = document.createElement("div");
labelWrap.style.position = "absolute";
labelWrap.style.top = "2px";
labelWrap.style.left = "4px";
labelWrap.style.display = "flex";
labelWrap.style.alignItems = "center";
labelWrap.style.pointerEvents = "none";

// Downwards triangle (future menu button)
const triangle = document.createElement("span");
triangle.textContent = "▼";
triangle.style.fontSize = "10px";
triangle.style.marginRight = "4px";
triangle.style.color = "#fff";
triangle.style.pointerEvents = "auto";
triangle.style.cursor = "pointer";

// Only add dropdown for MIDI clips
if (clip.type === "midi") {
  const dropdown = document.createElement("div");
  dropdown.style.position = "fixed";
  dropdown.style.background = "#222";
  dropdown.style.color = "#fff";
  dropdown.style.border = "1px solid #444";
  dropdown.style.borderRadius = "4px";
  dropdown.style.fontSize = "12px";
  dropdown.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
  dropdown.style.display = "none";
  dropdown.style.zIndex = "1000";
  dropdown.style.minWidth = "100px";
  dropdown.style.pointerEvents = "auto";

  // Dropdown item: Make Unique
  const makeUnique = document.createElement("div");
  makeUnique.textContent = "Make Unique";
  makeUnique.style.padding = "6px 12px";
  makeUnique.style.cursor = "pointer";
  makeUnique.style.pointerEvents = "auto";
  makeUnique.addEventListener("mouseenter", () => makeUnique.style.background = "#333");
  makeUnique.addEventListener("mouseleave", () => makeUnique.style.background = "#222");

  makeUnique.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.style.display = "none";
    // Find all clips with same name and data
    let isUnique = true;
    isUnique = window.clips.filter(c => c !== clip && c.type === "midi" && c.name === clip.name && JSON.stringify(c.notes) === JSON.stringify(clip.notes)).length === 0;
    if (!isUnique) {
      // Duplicate the clip with a new id and name
      const newClip = { ...clip, id: crypto.randomUUID() };
      // Find all clips with the same base name and count them for numbering
      const baseName = (clip.name || "MIDI Clip").replace(/( #\d{2})$/, "");
      const siblings = window.clips.filter(c => c !== clip && c.type === "midi" && c.name && c.name.startsWith(baseName));
      const nextNum = siblings.length + 1;
      newClip.name = `${baseName} #${String(nextNum).padStart(2, '0')}`;
      // Deep copy notes so they're not shared
      newClip.notes = JSON.parse(JSON.stringify(clip.notes));
      // --- Make sample and reverb unique ---
      if (clip.sampleBuffer) {
        // Deep copy AudioBuffer if possible (fallback to same if not supported)
        if (clip.sampleBuffer.clone) {
          newClip.sampleBuffer = clip.sampleBuffer.clone();
        } else {
          // Manual deep copy for AudioBuffer (browser support varies)
          try {
            const ctx = window.audioContext;
            const buf = ctx.createBuffer(
              clip.sampleBuffer.numberOfChannels,
              clip.sampleBuffer.length,
              clip.sampleBuffer.sampleRate
            );
            for (let ch = 0; ch < buf.numberOfChannels; ch++) {
              buf.copyToChannel(clip.sampleBuffer.getChannelData(ch), ch);
            }
            newClip.sampleBuffer = buf;
          } catch {
            newClip.sampleBuffer = clip.sampleBuffer;
          }
        }


      }
      if (clip.reverbGain) {
        // Create a new GainNode for reverb
        const ctx = window.audioContext;
        newClip.reverbGain = ctx.createGain();
        newClip.reverbGain.gain.value = clip.reverbGain.gain.value;
      }
      // Replace this clip in window.clips
      const idx = window.clips.findIndex(c => c.id === clip.id);
      if (idx !== -1) {
        window.clips[idx] = newClip;
        // Re-render the parent drop area
        if (el.parentElement) {
          const dropArea = el.parentElement;
          dropArea.innerHTML = "";
          window.clips.filter(c => c.trackIndex === newClip.trackIndex).forEach(c => window.renderClip(c, dropArea));
        }
      }
    }
  });

  dropdown.appendChild(makeUnique);

  // Dropdown item: Rename
  const rename = document.createElement("div");
  rename.textContent = "Rename";
  rename.style.padding = "6px 12px";
  rename.style.cursor = "pointer";
  rename.style.pointerEvents = "auto";
  rename.addEventListener("mouseenter", () => rename.style.background = "#333");
  rename.addEventListener("mouseleave", () => rename.style.background = "#222");

  rename.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.style.display = "none";

    // Custom modal for renaming
    const currentName = clip.name || "MIDI Clip";
    const modal = document.createElement("div");
    modal.style.position = "fixed";
    modal.style.top = "0";
    modal.style.left = "0";
    modal.style.width = "100vw";
    modal.style.height = "100vh";
    modal.style.background = "rgba(0,0,0,0.35)";
    modal.style.display = "flex";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.zIndex = "10001";

    const box = document.createElement("div");
    box.style.background = "#222";
    box.style.border = "1px solid #444";
    box.style.borderRadius = "8px";
    box.style.padding = "24px 24px 16px 24px";
    box.style.minWidth = "280px";
    box.style.boxShadow = "0 4px 24px rgba(0,0,0,0.4)";
    box.style.display = "flex";
    box.style.flexDirection = "column";
    box.style.alignItems = "stretch";

    const title = document.createElement("div");
    title.textContent = "Rename Clip";
    title.style.fontSize = "18px";
    title.style.fontWeight = "bold";
    title.style.color = "#fff";
    title.style.marginBottom = "12px";
    box.appendChild(title);

    const input = document.createElement("input");
    input.type = "text";
    input.value = currentName;
    input.style.fontSize = "15px";
    input.style.padding = "8px";
    input.style.border = "1px solid #444";
    input.style.borderRadius = "4px";
    input.style.background = "#111";
    input.style.color = "#fff";
    input.style.marginBottom = "16px";
    box.appendChild(input);

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.justifyContent = "flex-end";
    btnRow.style.gap = "8px";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.background = "#333";
    cancelBtn.style.color = "#fff";
    cancelBtn.style.border = "none";
    cancelBtn.style.borderRadius = "4px";
    cancelBtn.style.padding = "6px 16px";
    cancelBtn.style.cursor = "pointer";
    cancelBtn.addEventListener("click", () => {
      document.body.removeChild(modal);
    });

    const okBtn = document.createElement("button");
    okBtn.textContent = "OK";
    okBtn.style.background = "#4D88FF";
    okBtn.style.color = "#fff";
    okBtn.style.border = "none";
    okBtn.style.borderRadius = "4px";
    okBtn.style.padding = "6px 16px";
    okBtn.style.cursor = "pointer";
    okBtn.addEventListener("click", () => {
      const newName = input.value.trim();
      if (newName && newName !== currentName) {
        // Check if the active clip is one of the clips being renamed
        const isActiveClipAffected = window.activeClip && window.activeClip.type === "midi" && window.activeClip.name === currentName;
        // Find all clips with the same name (linked clips)
        const linkedClips = window.clips.filter(c => c.type === "midi" && c.name === currentName);
        // Update all linked clips
        linkedClips.forEach(c => {
          c.name = newName;
        });
        // Re-render all affected tracks
        const affectedTracks = new Set(linkedClips.map(c => c.trackIndex));
        affectedTracks.forEach(trackIndex => {
          const track = document.querySelector(`.track[data-index="${trackIndex}"]`);
          if (track) {
            const dropArea = track.querySelector(".track-drop-area");
            if (dropArea) {
              dropArea.innerHTML = "";
              window.clips
                .filter(c => c.trackIndex === trackIndex)
                .forEach(c => window.renderClip(c, dropArea));
            }
          }
        });
        // Update the clip list dropdown
        const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
        window.refreshClipDropdown(uniqueClips);
        window.refreshGhostDropdown();
        // Update the piano roll header if the active clip was renamed
        if (isActiveClipAffected) {
          const clipNameEl = document.getElementById("piano-roll-clip-name");
          if (clipNameEl) {
            clipNameEl.textContent = newName;
          }
        }
      }
      document.body.removeChild(modal);
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);
    box.appendChild(btnRow);
    modal.appendChild(box);
    document.body.appendChild(modal);
    input.focus();
    input.select();
    // Allow Enter to confirm, Esc to cancel
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") okBtn.click();
      if (ev.key === "Escape") cancelBtn.click();
    });
  });
  

  dropdown.appendChild(rename);
  document.body.appendChild(dropdown);
  
  // Prevent dropdown from closing when clicking inside it
  dropdown.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // Show/hide dropdown on triangle click
  triangle.addEventListener("click", (e) => {
    e.stopPropagation();
    // Hide any other open dropdowns
    document.querySelectorAll('.clip-dropdown-open').forEach(el => {
      if (el !== dropdown) {
        el.classList.remove('clip-dropdown-open');
        el.style.display = 'none';
      }
    });
    
    if (dropdown.style.display === "none") {
      // Calculate position relative to viewport
      const triangleRect = triangle.getBoundingClientRect();
      dropdown.style.top = (triangleRect.bottom + 4) + "px";
      dropdown.style.left = triangleRect.left + "px";
      dropdown.style.display = "block";
      dropdown.classList.add('clip-dropdown-open');
    } else {
      dropdown.style.display = "none";
      dropdown.classList.remove('clip-dropdown-open');
    }
  });
}

const label = document.createElement("div");
label.style.fontSize = "10px";
label.style.color = "#fff";
label.style.pointerEvents = "none";

if (clip.type === "audio") {
  label.textContent = clip.fileName || clip.loopId || "Audio";
} 
else if (clip.type === "midi") {
  label.textContent = clip.name || "MIDI Clip";
} 
else {
  label.textContent = "Clip";
}

labelWrap.appendChild(triangle);
labelWrap.appendChild(label);
el.appendChild(labelWrap);
const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
window.refreshClipDropdown(uniqueClips);  // Refresh dropdown with unique clips at end of render
window.refreshGhostDropdown();


/* -------------------------------------------------------
   DRAGGABLE CLIP (child-safe)
------------------------------------------------------- */


el.addEventListener("dragstart", (e) => {
  el.draggable = true;
  if (window.timelineCurrentTool !== 'pencil') {
    e.preventDefault();
    return false;
  }
  if (e.target !== el) {
    e.stopPropagation();
  }
  // Set duplication state based on modifier keys
  window.isDuplicateDrag = e.shiftKey || e.altKey || e.ctrlKey;
  // Set which clip is being dragged
  window.draggedClipId = clip.id;
  window.draggedLoop = null;
  // ghost
  const ghost = el.cloneNode(true);
  ghost.style.position = "absolute";
  ghost.style.top = "-9999px";
  ghost.style.left = "-9999px";
  ghost.style.opacity = "1";
  ghost.style.pointerEvents = "none";
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 0, 0);
  setTimeout(() => ghost.remove(), 0);
});

/* -------------------------------------------------------
   TOUCH DRAG SUPPORT (iPad / mobile)
------------------------------------------------------- */
let touchDrag = null;

el.addEventListener("touchstart", (e) => {
  if (window.timelineCurrentTool !== 'pencil') return;
  e.preventDefault(); // stop scrolling / text selection
  const t = e.touches[0];

  touchDrag = {
    clip,
    el,
    dropArea,
    startX: t.clientX,
    originalStartBar: clip.startBar
  };
}, { passive: false });

el.addEventListener("touchmove", (e) => {
  if (!touchDrag) return;
  e.preventDefault();

  const t = e.touches[0];
  const deltaPx = t.clientX - touchDrag.startX;
  const deltaBars = Math.round(deltaPx / window.PIXELS_PER_BAR);

  touchDrag.clip.startBar = Math.max(0, touchDrag.originalStartBar + deltaBars);
  touchDrag.el.style.left = touchDrag.clip.startBar * window.PIXELS_PER_BAR + "px";
}, { passive: false });

el.addEventListener("touchend", () => {
  if (!touchDrag) return;

  const { clip, dropArea } = touchDrag;

  resolveClipCollisions(clip);

  // Re-render track
  dropArea.innerHTML = "";
  window.clips
    .filter(c => c.trackIndex === clip.trackIndex)
    .forEach(c => window.renderClip(c, dropArea));

  touchDrag = null;
});



  dropArea.appendChild(el);
  

  // Initialize fade values if not present
  if (clip.type === "audio") {
    if (clip.fadeIn === undefined) clip.fadeIn = 0;
    if (clip.fadeOut === undefined) clip.fadeOut = 0;
  }
  // Utility: ensure fades don't overlap past clip length
  function clampFadeLengths(clip) {
    if (clip.type !== "audio") return;
    const maxFadeIn = Math.max(0, clip.bars - (clip.fadeOut || 0));
    const maxFadeOut = Math.max(0, clip.bars - (clip.fadeIn || 0));
    clip.fadeIn = Math.min(clip.fadeIn || 0, maxFadeIn);
    clip.fadeOut = Math.min(clip.fadeOut || 0, maxFadeOut);
  }

  // Initialize fade properties for both audio and MIDI clips
  if (clip.fadeIn === undefined) clip.fadeIn = 0;
  if (clip.fadeOut === undefined) clip.fadeOut = 0;
  clampFadeLengths(clip);

  // --- FADE HANDLES (for both audio and MIDI clips in fade mode) ---
  if (window.timelineCurrentTool === 'fade') {
    // Left fade handle
    const fadeInHandle = document.createElement("div");
    fadeInHandle.className = "fade-handle fade-in-handle";
    fadeInHandle.style.left = "0px";
    
    fadeInHandle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startFade = clip.fadeIn || 0;
      
      function move(ev) {
        const deltaPx = ev.clientX - startX;
        const deltaBars = deltaPx / window.PIXELS_PER_BAR;
        let newFade = Math.max(0, startFade + deltaBars);
        newFade = Math.min(newFade, Math.max(0, clip.bars - (clip.fadeOut || 0)));
        clip.fadeIn = newFade;
        clampFadeLengths(clip);
        dropArea.innerHTML = "";
        window.clips
          .filter(c => c.trackIndex === clip.trackIndex)
          .forEach(c => window.renderClip(c, dropArea));
      }
      
      function up() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      }
      
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
    el.appendChild(fadeInHandle);

    // Right fade handle
    const fadeOutHandle = document.createElement("div");
    fadeOutHandle.className = "fade-handle fade-out-handle";
    fadeOutHandle.style.right = "0px";
    
    fadeOutHandle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startFade = clip.fadeOut || 0;
      
      function move(ev) {
        const deltaPx = startX - ev.clientX;
        const deltaBars = deltaPx / window.PIXELS_PER_BAR;
        let newFade = Math.max(0, startFade + deltaBars);
        newFade = Math.min(newFade, Math.max(0, clip.bars - (clip.fadeIn || 0)));
        clip.fadeOut = newFade;
        clampFadeLengths(clip);
        dropArea.innerHTML = "";
        window.clips
          .filter(c => c.trackIndex === clip.trackIndex)
          .forEach(c => window.renderClip(c, dropArea));
      }
      
      function up() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      }
      
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
    el.appendChild(fadeOutHandle);
  }

  // --- WAVEFORM AND MIDI PREVIEW RENDERING ---
  //let bufferToDraw = null;

  if (clip.type === "audio") {
    if (clip.audioBuffer) {
      bufferToDraw = clip.audioBuffer;
    } else if (clip.loopId) {
      const loopData = window.loopBuffers.get(clip.loopId);
      if (loopData && loopData.buffer) {
        bufferToDraw = loopData.buffer;

        if (!clip.originalBars && loopData.bars) {
          clip.originalBars = loopData.bars;
        }
      }
    }
  }


  if (clip.type === "audio" && bufferToDraw) {
    clampFadeLengths(clip);
    const durationSeconds = bufferToDraw.duration;
    const barDuration = window.barsToSeconds(1);
    const projectBars = durationSeconds / barDuration;

    if (!isFinite(clip.originalBars) || clip.originalBars <= 0) {
      clip.originalBars = projectBars;
    }

    if (!isFinite(clip.bars) || clip.bars <= 0) {
      clip.bars = clip.originalBars;
    }

    const originalBars = clip.originalBars;
    const playbackBars = clip.bars;

    const waveformWidth = originalBars * window.PIXELS_PER_BAR;

    const color = window.TRACK_COLORS[clip.trackIndex % 10];
    const samples = bufferToDraw.getChannelData(0);

    const waveform = window.renderWaveformSlice(
      samples,
      waveformWidth,
      40,
      color
    );

    waveform.style.position = "absolute";
    waveform.style.bottom = "0";
    waveform.style.left = "0";
    waveform.style.pointerEvents = "none";

    const clipWidth = playbackBars * window.PIXELS_PER_BAR;
    el.style.width = clipWidth + "px";

    waveform.style.width = waveformWidth + "px";
    el.style.overflow = "hidden";

    el.appendChild(waveform);
    
    // --- FADE OVERLAYS ---
    if ((clip.fadeIn > 0 || clip.fadeOut > 0)) {
      const fadeCanvas = document.createElement("canvas");
      fadeCanvas.className = "fade-overlay";
      fadeCanvas.width = clipWidth;
      fadeCanvas.height = 40;
      fadeCanvas.style.position = "absolute";
      fadeCanvas.style.bottom = "0";
      fadeCanvas.style.left = "0";
      fadeCanvas.style.pointerEvents = "none";
      
      const ctx = fadeCanvas.getContext("2d");
      const gradient = ctx.createLinearGradient(0, 0, clipWidth, 0);
      
      const fadeInPx = (clip.fadeIn / clip.bars) * clipWidth;
      const fadeOutPx = (clip.fadeOut / clip.bars) * clipWidth;
      
      // Fade in gradient
      if (clip.fadeIn > 0) {
        gradient.addColorStop(0, "rgba(0,0,0,0.5)");
        gradient.addColorStop(fadeInPx / clipWidth, "rgba(0,0,0,0)");
      }
      
      // Fade out gradient
      if (clip.fadeOut > 0) {
        const fadeOutStart = 1 - (fadeOutPx / clipWidth);
        gradient.addColorStop(fadeOutStart, "rgba(0,0,0,0)");
        gradient.addColorStop(1, "rgba(0,0,0,0.5)");
      }
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, clipWidth, 40);
      
      // Draw fade curves
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      
      // Fade in curve
      if (clip.fadeIn > 0) {
        ctx.moveTo(0, 40);
        ctx.lineTo(fadeInPx, 0);
      }
      
      // Fade out curve
      if (clip.fadeOut > 0) {
        ctx.moveTo(clipWidth - fadeOutPx, 0);
        ctx.lineTo(clipWidth, 40);
      }
      
      ctx.stroke();
      
      el.appendChild(fadeCanvas);
    }
  }


  if (clip.type === "midi") {
    el.style.width = (clip.bars * window.PIXELS_PER_BAR) + "px";

    const beatsPerBar = 4;
    const pxPerBar = window.PIXELS_PER_BAR;
    const pxPerBeat = pxPerBar / beatsPerBar;

    // ⭐ Reuse or create preview canvas
    let midiCanvas = el.querySelector(".midi-preview");
    if (!midiCanvas) {
      midiCanvas = document.createElement("canvas");
      midiCanvas.className = "midi-preview";
      midiCanvas.style.position = "absolute";
      midiCanvas.style.bottom = "0";
      midiCanvas.style.left = "0";
      midiCanvas.style.pointerEvents = "none";
      midiCanvas.style.zIndex = "2";
      el.appendChild(midiCanvas);
    }

    // ⭐ Resize canvas
    midiCanvas.width = clip.bars * pxPerBar;
    midiCanvas.height = 40;

    const ctx = midiCanvas.getContext("2d");
    ctx.clearRect(0, 0, midiCanvas.width, midiCanvas.height);

    // Match piano roll pitch range
    // Auto-fit pitch range
    let minPitch = Infinity;
    let maxPitch = -Infinity;

    clip.notes.forEach(n => {
      if (n.pitch < minPitch) minPitch = n.pitch;
      if (n.pitch > maxPitch) maxPitch = n.pitch;
    });

    // Add a little padding so notes aren't touching the edges
    minPitch -= 1;
    maxPitch += 1;

    const pitchRange = Math.max(1, maxPitch - minPitch);
    const rowHeight = midiCanvas.height / pitchRange;


    clip.notes.forEach(note => {
      const gap = 1;

      const x = note.start * pxPerBeat + gap;
      const w = (note.end - note.start) * pxPerBeat - gap * 2;

      const y = (maxPitch - note.pitch) * rowHeight;

      const h = Math.max(3, rowHeight - 2);

      ctx.fillStyle = window.TRACK_COLORS[clip.trackIndex % 10];
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.strokeRect(x, y, w, h);
    });
  }



}


/* -------------------------------------------------------
   KNOB INTERACTION (reduced sensitivity)
------------------------------------------------------- */
document.addEventListener("mousedown", (e) => {
  if (!e.target.classList.contains("knob")) return;

  const knob = e.target;
  const rect = knob.getBoundingClientRect();
  const centerY = rect.top + rect.height / 2;
  const idx = Number(knob.dataset.idx);
  const type = knob.dataset.type;

  function move(ev) {
    const dy = centerY - ev.clientY;
    let v = parseFloat(knob.dataset.value) + dy * 0.0007; // smoother
    v = Math.max(0, Math.min(1, v));
    knob.dataset.value = v;
    knob.style.setProperty("--val", v);
    if (!isNaN(idx) && type && window.trackStates && window.trackStates[idx]) {
      window.trackStates[idx][type] = v;
      if (type === "volume" && window.trackGains && window.trackGains[idx]) {
        // Only update gain if not muted or solo-muted
        const anySolo = window.trackStates.some(t => t.solo);
        const effectiveMute = (anySolo && !window.trackStates[idx].solo) || window.trackStates[idx].muted;
        if (!effectiveMute) {
          window.trackGains[idx].gain.value = v;
        }
      }
    }
    // Do NOT update mixer fader or mixerFaderValues
  }
  function up() {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
  }
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
});

window.calculateBarsFromAudio = function (audioBuffer, bpm) {
  const seconds = audioBuffer.duration;
  if (!seconds || seconds <= 0) return 1;

  const beats = (seconds / 60) * bpm;
  const bars = beats / 4;

  return Math.max(0.25, bars);
};

function resolveClipCollisions(newClip) {
  // Allow overlapping clips without auto-trim
  return;
}


window.renderWaveformSlice = function(samples, width, height = 40, color = "#2a6cff") {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const step = Math.max(1, Math.floor(samples.length / width));
  const amp = height / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;   // <-- FIXED: dynamic color

  for (let i = 0; i < width; i++) {
    let min = 1.0;
    let max = -1.0;

    const start = i * step;
    const end = Math.min(samples.length, start + step);

    for (let j = start; j < end; j++) {
      const v = samples[j];
      if (v < min) min = v;
      if (v > max) max = v;
    }

    ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
  }

  return canvas;
};

// Add snap settings utility functions
window.getSnapValue = function () {
  const snapSelect = document.getElementById("snapValue");
  if (!snapSelect) return 1;
  const value = parseFloat(snapSelect.value);
  return isNaN(value) ? 1 : value;
};

window.snapToGrid = function (rawBar) {
  const snap = window.getSnapValue();
  if (snap === 0) return rawBar; // No snapping
  return Math.floor(rawBar / snap) * snap;
};

window.snapDeltaToGrid = function (deltaBarsRaw) {
  const snap = window.getSnapValue();
  if (snap === 0) return deltaBarsRaw; // No snapping
  return Math.floor(deltaBarsRaw / snap) * snap;
};

// Utility to show/hide playhead
function setPlayheadVisible(visible) {
  const playhead = document.getElementById("playhead");
  if (playhead) {
    if (visible) {
      playhead.classList.remove("hidden");
    } else {
      playhead.classList.add("hidden");
    }
  }
}

// Attach play/stop button logic after DOMContentLoaded or in main.js
document.addEventListener("DOMContentLoaded", () => {
  const playBtn = document.getElementById("playToggleBtn");
  if (!playBtn) return;

  let isPlaying = false;

  playBtn.addEventListener("click", () => {
    isPlaying = !isPlaying;
    setPlayheadVisible(isPlaying);
    // Toggle icon visibility (no text)
    const playIcon = playBtn.querySelector('.play-icon');
    const stopIcon = playBtn.querySelector('.stop-icon');
    if (playIcon && stopIcon) {
      playIcon.style.display = isPlaying ? 'none' : '';
      stopIcon.style.display = isPlaying ? '' : 'none';
    }
    // you may want to call your actual play/stop logic here as well
    // e.g. window.playAll() / window.stopAll()
  });
});

// --- GLOBAL MOUSEUP TO RESET DELETION STATE ---
document.addEventListener("mouseup", function (e) {
  if (e.button === 2) {
    isDeletingClipsWithRightClick = false;
    deletedClipIds.clear();
  }
  if (e.button === 0) {
    // Reset paint mode and refresh dropdown
    if (isPainting) {
      isPainting = false;
      paintedBars.clear();
      const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
      window.refreshClipDropdown(uniqueClips);
      window.refreshGhostDropdown();
    }
  }
});


// --- TIMELINE CONTEXT MENU FOR LABELS ---
let timelineContextMenu = null;
let timelineContextMenuBar = null;

function createTimelineContextMenu() {
  if (timelineContextMenu) return timelineContextMenu;
  const menu = document.createElement("div");
  menu.id = "timeline-context-menu";
  menu.style.position = "fixed";
  menu.style.background = "#222";
  menu.style.color = "#fff";
  menu.style.border = "1px solid #444";
  menu.style.borderRadius = "4px";
  menu.style.fontSize = "13px";
  menu.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
  menu.style.display = "none";
  menu.style.zIndex = "10000";
  menu.style.minWidth = "120px";
  menu.style.pointerEvents = "auto";


  // Add Label item
  const addLabel = document.createElement("div");
  addLabel.textContent = "Add Label";
  addLabel.style.padding = "8px 16px";
  addLabel.style.cursor = "pointer";
  addLabel.addEventListener("mouseenter", () => addLabel.style.background = "#333");
  addLabel.addEventListener("mouseleave", () => addLabel.style.background = "#222");
  addLabel.addEventListener("click", (e) => {
    menu.style.display = "none";
    showLabelInput(timelineContextMenuBar, e);
  });
  menu.appendChild(addLabel);

  // Add Set Loop End item
  const setLoopEnd = document.createElement("div");
  setLoopEnd.textContent = "Set Loop End";
  setLoopEnd.style.padding = "8px 16px";
  setLoopEnd.style.cursor = "pointer";
  setLoopEnd.addEventListener("mouseenter", () => setLoopEnd.style.background = "#333");
  setLoopEnd.addEventListener("mouseleave", () => setLoopEnd.style.background = "#222");
  setLoopEnd.addEventListener("click", (e) => {
    menu.style.display = "none";
    // Prevent loop smaller than 1 bar
    let loopEnd = timelineContextMenuBar;
    if (typeof window.seekBars === 'number') {
      if (loopEnd - window.seekBars < 1) {
        loopEnd = window.seekBars + 1;
      }
    }
    window.timelineLoopEndBar = loopEnd;
    if (typeof window.renderLoopEndMarker === 'function') window.renderLoopEndMarker();
  });
  menu.appendChild(setLoopEnd);

  // Add Remove Loop item
  const removeLoop = document.createElement("div");
  removeLoop.textContent = "Remove Loop";
  removeLoop.style.padding = "8px 16px";
  removeLoop.style.cursor = "pointer";
  removeLoop.addEventListener("mouseenter", () => removeLoop.style.background = "#333");
  removeLoop.addEventListener("mouseleave", () => removeLoop.style.background = "#222");
  removeLoop.addEventListener("click", (e) => {
    menu.style.display = "none";
    window.timelineLoopEndBar = undefined;
    if (typeof window.renderLoopEndMarker === 'function') window.renderLoopEndMarker();
  });
  menu.appendChild(removeLoop);

  document.body.appendChild(menu);
  timelineContextMenu = menu;
  return menu;
}

// --- LOOP END MARKER RENDERING ---
window.renderLoopEndMarker = function() {
  // Remove any existing marker
  document.querySelectorAll('.loop-end-marker').forEach(el => el.remove());
  if (typeof window.timelineLoopEndBar !== 'number') return;
  const timelineBar = document.getElementById('timeline-bar');
  if (!timelineBar) return;
  const marker = document.createElement('div');
  marker.className = 'loop-end-marker';
  marker.style.position = 'absolute';
  marker.style.top = '0';
  marker.style.height = '100%';
  marker.style.width = '4px';
  marker.style.background = '#ffb300';
  marker.style.left = (window.timelineLoopEndBar * window.PIXELS_PER_BAR - 2) + 'px';
  marker.style.zIndex = '1000';
  marker.title = 'Loop End';
  timelineBar.appendChild(marker);
};

// Redraw marker on timeline bar render
document.addEventListener('DOMContentLoaded', () => {
  window.renderLoopEndMarker();
});
// --- LOOPING PLAYBACK LOGIC ---
// Patch playback to support looping from seek marker to loop end
// (Removed timeline.js override of window.startPlayhead. Main playhead/looping logic is now only in main.js for consistency.)
// --- STYLE FOR LOOP END MARKER ---
const loopEndStyle = document.createElement('style');
loopEndStyle.textContent = `
.loop-end-marker {
  pointer-events: none;
  box-shadow: 0 0 6px 2px #ffb30099;
}
`;
document.head.appendChild(loopEndStyle);


function showTimelineContextMenu(x, y, bar) {
  const menu = createTimelineContextMenu();
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.style.display = "block";
  timelineContextMenuBar = bar;
}

function hideTimelineContextMenu() {
  if (timelineContextMenu) timelineContextMenu.style.display = "none";
}

// Attach context menu to timeline-bar (bar numbers area)
document.addEventListener("DOMContentLoaded", () => {
  const timelineBar = document.getElementById("timeline-bar");
  if (timelineBar) {
    timelineBar.addEventListener("contextmenu", function(e) {
      // Only show if not right-clicking on a clip or label
      if (e.target.closest('.clip') || e.target.closest('.timeline-label')) return;
      e.preventDefault();
      e.stopPropagation();
      // Find bar number from mouse X
      const rect = timelineBar.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const bar = Math.floor(x / window.PIXELS_PER_BAR);
      showTimelineContextMenu(e.clientX, e.clientY, bar);
    });
  }
  // Hide menu on click elsewhere
  document.addEventListener("mousedown", (e) => {
    if (timelineContextMenu && timelineContextMenu.style.display === "block" && !timelineContextMenu.contains(e.target)) {
      hideTimelineContextMenu();
    }
  });
});

// Remove global context menu disable, but keep for clips if needed
// (If you want to keep context menu disabled globally, move this logic to only timeline-bar)
// document.addEventListener("contextmenu", function (e) {
//   e.preventDefault();
// }, true);

// --- Always clear selection rectangles on any mouseup (global) ---
document.addEventListener("mouseup", function () {
  document.querySelectorAll("#timeline-selection-rect").forEach(rectEl => {
    if (rectEl.parentNode) rectEl.parentNode.removeChild(rectEl);
  });
  selectionRect = null;
  isSelecting = false;
});

// --- Also clear selection rectangles on double-click ---
document.addEventListener("dblclick", function () {
  document.querySelectorAll("#timeline-selection-rect").forEach(rectEl => {
    if (rectEl.parentNode) rectEl.parentNode.removeChild(rectEl);
  });
  selectionRect = null;
  isSelecting = false;
});

/* -------------------------------------------------------
   MARQUEE SELECTION
------------------------------------------------------- */

// Utility: get all visible clips DOM elements
function getAllClipElements() {
  return Array.from(document.querySelectorAll('.clip'));
}

// Utility: get bounding rect for a clip (relative to timeline-scroll)
function getClipRect(clipEl) {
  const scroll = document.getElementById("timeline-scroll");
  const scrollRect = scroll.getBoundingClientRect();
  const rect = clipEl.getBoundingClientRect();
  return {
    left: rect.left - scrollRect.left + scroll.scrollLeft,
    top: rect.top - scrollRect.top + scroll.scrollTop,
    right: rect.right - scrollRect.left + scroll.scrollLeft,
    bottom: rect.bottom - scrollRect.top + scroll.scrollTop
  };
}

// Utility: get bounding rect for selection box (relative to timeline-scroll)
function getSelectionRect(start, end) {
  const scroll = document.getElementById("timeline-scroll");
  const scrollRect = scroll.getBoundingClientRect();
  const x1 = start.x - scrollRect.left + scroll.scrollLeft;
  const y1 = start.y - scrollRect.top + scroll.scrollTop;
  const x2 = end.x - scrollRect.left + scroll.scrollLeft;
  const y2 = end.y - scrollRect.top + scroll.scrollTop;
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2)
  };
}

// Utility: check if two rects intersect
function rectsIntersect(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > a.top;
}

// --- Marquee selection logic ---
function attachMarqueeSelection() {
  const timelineScroll = document.getElementById("timeline-scroll");
  if (!timelineScroll) return;

  // --- Prevent default drag behavior in select mode ---
  timelineScroll.addEventListener("dragstart", function(e) {
    if (window.timelineCurrentTool === "select") {
      e.preventDefault();
      return false;
    }
  });

  timelineScroll.addEventListener("dragover", function(e) {
    if (window.timelineCurrentTool === "select") {
      e.preventDefault();
      return false;
    }
  });

  timelineScroll.addEventListener("mousedown", function(e) {

    // If in select mode, and there are selected clips, and click is on empty space (not a clip)
    if (
      window.timelineCurrentTool === 'select' &&
      window.selectedClipIds && window.selectedClipIds.size > 0 &&
      !e.target.closest('.clip')
    ) {
      window.selectedClipIds.clear();
      document.querySelectorAll('.clip-selected').forEach(el => el.classList.remove('clip-selected'));
      // Do not start marquee selection
      return;
    }

    if (window.timelineCurrentTool !== "select") return;
    if (e.button !== 0) return;
    if (e.target.closest('.knob, .fx-btn, .clip-dropdown-open, .resize-handle')) return;

    // --- Prevent any drag behavior ---
    e.preventDefault();

    isSelecting = true;
    
    // --- FIX: Calculate position relative to timeline-scroll container ---
    const scrollRect = timelineScroll.getBoundingClientRect();
    const x = e.clientX - scrollRect.left + timelineScroll.scrollLeft;
    const y = e.clientY - scrollRect.top + timelineScroll.scrollTop;
    
    selectionStart = { x: e.clientX, y: e.clientY };

    selectionRect = document.createElement("div");
    selectionRect.style.position = "absolute";
    selectionRect.style.zIndex = "9999";
    selectionRect.style.pointerEvents = "none";
    selectionRect.style.border = "1.5px dashed #4D88FF";
    selectionRect.style.background = "rgba(77,136,255,0.10)";
    selectionRect.style.left = x + "px";
    selectionRect.style.top = y + "px";
    selectionRect.style.width = "0px";
    selectionRect.style.height = "0px";
    selectionRect.id = "timeline-selection-rect";
    timelineScroll.appendChild(selectionRect);

    window.selectedClipIds.clear();

    function onMove(ev) {
      if (!isSelecting) return;
      const end = { x: ev.clientX, y: ev.clientY };
      const rect = getSelectionRect(selectionStart, end);
      selectionRect.style.left = rect.left + "px";
      selectionRect.style.top = rect.top + "px";
      selectionRect.style.width = (rect.right - rect.left) + "px";
      selectionRect.style.height = (rect.bottom - rect.top) + "px";

      window.selectedClipIds.clear();
      getAllClipElements().forEach(clipEl => {
        const clipBox = getClipRect(clipEl);
        // Only select if the clip actually intersects the selection rectangle
        if (
          rect.left < clipBox.right &&
          rect.right > clipBox.left &&
          rect.top < clipBox.bottom &&
          rect.bottom > clipBox.top
        ) {
          window.selectedClipIds.add(clipEl.dataset.clipId);
          clipEl.classList.add("clip-selected");
        } else {
          clipEl.classList.remove("clip-selected");
        }
      });
    }

    function onUp(ev) {
      if (!isSelecting) return;
      isSelecting = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      // --- Clear selection rect on mouseup ---
      document.querySelectorAll("#timeline-selection-rect").forEach(rectEl => {
        if (rectEl.parentNode) rectEl.parentNode.removeChild(rectEl);
      });
      selectionRect = null;
      getAllClipElements().forEach(clipEl => {
        if (window.selectedClipIds.has(clipEl.dataset.clipId)) {
          clipEl.classList.add("clip-selected");
        } else {
          clipEl.classList.remove("clip-selected");
        }
      });
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

// Add CSS for .clip-selected (blue border)
const style = document.createElement("style");
style.textContent = `
.clip-selected {
  outline: 2px solid #d3e2ff !important;
  outline-offset: -2px;
 
  box-shadow: 0 0 0 2px #4D88FF33;
}
`;
document.head.appendChild(style);

// Attach marquee selection after DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  // ...existing code...
  attachMarqueeSelection();
  // ...existing code...
});

// --- GLOBAL DELETE KEY HANDLER FOR SELECTED CLIPS ---
document.addEventListener("keydown", function(e) {
  // Only act if DELETE key is pressed and there are selected clips
  if (
    (e.key === "Delete" || e.key === "Del") &&
    window.selectedClipIds &&
    window.selectedClipIds.size > 0
  ) {
    e.preventDefault();
    // Remove selected clips from window.clips
    const toDelete = new Set(window.selectedClipIds);
    const affectedTracks = new Set();
    window.clips = window.clips.filter(c => {
      if (toDelete.has(c.id)) {
        affectedTracks.add(c.trackIndex);
        return false;
      }
      return true;
    });
    // Clear selection
    window.selectedClipIds.clear();
    document.querySelectorAll('.clip-selected').forEach(el => el.classList.remove('clip-selected'));
    // Hide piano roll if active clip was deleted
    if (window.activeClip && toDelete.has(window.activeClip.id)) {
      document.getElementById("piano-roll-container").classList.add("hidden");
      window.activeClip = null;
    }
    // Refresh affected tracks
    affectedTracks.forEach(trackIndex => {
      const track = document.querySelector(`.track[data-index="${trackIndex}"]`);
      if (track) {
        const dropArea = track.querySelector('.track-drop-area');
        if (dropArea) {
          dropArea.innerHTML = "";
          window.clips
            .filter(c => c.trackIndex === trackIndex)
            .forEach(c => window.renderClip(c, dropArea));
        }
      }
    });
    // Refresh dropdown
    const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
    window.refreshClipDropdown(uniqueClips);
    window.refreshGhostDropdown();
  }
});

