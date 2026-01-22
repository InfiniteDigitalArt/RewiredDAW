// Shrink the clip if the last notes are deleted
function shrinkClipIfNeeded() {
  if (!activeClip) return;
  if (!activeClip.notes.length) {
    activeClip.bars = 1;
    updateClipPreview();
    refreshClipInTimeline(activeClip);
    return;
  }
  let maxEnd = 0;
  for (const n of activeClip.notes) {
    if (n.end > maxEnd) maxEnd = n.end;
  }
  const beatsPerBar = 4;
  const newBars = Math.ceil(maxEnd / beatsPerBar);
  if (newBars !== activeClip.bars) {
    activeClip.bars = Math.max(1, newBars);
    updateClipPreview();
    refreshClipInTimeline(activeClip);
  }
}
let rowHeight = 16;
const minRowHeight = 6;
const maxRowHeight = 48;
// ======================================================
//  PIANO ROLL — FULL DAW-STYLE IMPLEMENTATION
// ======================================================

let canvas, ctx;
let activeClip = null;
let currentTool = 'pencil'; // Track selected tool: 'pencil', 'select', or 'slice'
let toolBeforeCtrl = null; // Remember tool before Ctrl was pressed
let isCtrlHeld = false; // Track if Ctrl is currently held

// Piano roll preview playback state
let pianoRollPreviewState = {
  isPlaying: false,
  voices: [],
  startTime: 0,
  rafId: null,
  playheadEl: null,
  scheduledNotes: new Set(), // Track which notes have been scheduled
  currentBeat: 0, // Track current playback position in beats
  restartTimeout: null // Debounce timer for live editing restarts
};

// Expose state globally for external access (e.g., Space bar handler)
window.pianoRollPreviewState = pianoRollPreviewState;



const loadSampleBtn = document.getElementById("piano-roll-load-sample");
const sampleName    = document.getElementById("piano-roll-sample-name");

const pitchMin = 12; // C1
const pitchMax = 96; // C8
const pitchRange = pitchMax - pitchMin;

let pxPerBeat = 100;
const minPxPerBeat = 30;
const maxPxPerBeat = 400;
const snap = 0.25; // quarter-beat snapping
const pianoWidth = 60; // width of vertical piano

let snapEnabled = false;

// --- SCALE NOTE MAPS ---
const SCALE_MAPS = {
  'none': [0,1,2,3,4,5,6,7,8,9,10,11],
  'C-major':    [0,2,4,5,7,9,11],
  'C#-major':   [1,3,5,6,8,10,0],
  'D-major':    [2,4,6,7,9,11,1],
  'D#-major':   [3,5,7,8,10,0,2],
  'E-major':    [4,6,8,9,11,1,3],
  'F-major':    [5,7,9,10,0,2,4],
  'F#-major':   [6,8,10,11,1,3,5],
  'G-major':    [7,9,11,0,2,4,6],
  'G#-major':   [8,10,0,1,3,5,7],
  'A-major':    [9,11,1,2,4,6,8],
  'A#-major':   [10,0,2,3,5,7,9],
  'B-major':    [11,1,3,4,6,8,10],
  'A-minor':    [9,11,0,2,4,5,7],
  'A#-minor':   [10,0,1,3,5,6,8],
  'B-minor':    [11,1,2,4,6,7,9],
  'C-minor':    [0,2,3,5,7,8,10],
  'C#-minor':   [1,3,4,6,8,9,11],
  'D-minor':    [2,4,5,7,9,10,0],
  'D#-minor':   [3,5,6,8,10,11,1],
  'E-minor':    [4,6,7,9,11,0,2],
  'F-minor':    [5,7,8,10,0,1,3],
  'F#-minor':   [6,8,9,11,1,2,4],
  'G-minor':    [7,9,10,0,2,3,5],
  'G#-minor':   [8,10,11,1,3,4,6]
};
let currentScale = 'none';

function isNoteInScale(pitch, scaleName) {
  const scale = SCALE_MAPS[scaleName] || SCALE_MAPS['none'];
  return scale.includes((pitch % 12));
}

// Helper function to safely set pitch (prevents NaN)
function setSafePitch(note, newPitch) {
  if (!isFinite(newPitch)) {
    console.warn("Attempted to set invalid pitch:", newPitch, "on note:", note);
    return;
  }
  note.pitch = Math.max(pitchMin, Math.min(pitchMax, newPitch));
}

// ======================================================
//  INITIALIZATION
// ======================================================

window.initPianoRoll = function () {
  // Magnet toggle button (independent from tool buttons)
  const magnetBtn = document.getElementById('piano-roll-magnet-toggle');
  if (magnetBtn) {
    // Helper to shift a pitch up to the next in-scale pitch
    function shiftUpToScale(pitch) {
      if (!isFinite(pitch)) return pitchMax;
      let p = Math.round(pitch);
      while (p <= pitchMax) {
        if (isNoteInScale(p, currentScale)) return p;
        p++;
      }
      // If no valid pitch found, clamp to max
      return pitchMax;
    }
    magnetBtn.addEventListener('click', () => {
      const wasEnabled = snapEnabled;
      snapEnabled = !snapEnabled;
      magnetBtn.setAttribute('aria-pressed', snapEnabled ? 'true' : 'false');
      magnetBtn.classList.toggle('active', snapEnabled);
      // If enabling snap, shift all out-of-scale notes up to the next in-scale pitch
      if (!wasEnabled && snapEnabled && activeClip) {
        activeClip.notes.forEach(n => {
          if (isFinite(n.pitch) && !isNoteInScale(n.pitch, currentScale)) {
            setSafePitch(n, shiftUpToScale(n.pitch));
          }
        });
        renderPianoRoll();
        restartPreviewFromCurrentPosition();
      }
    });
    // Initialize state (disabled by default)
    //magnetBtn.setAttribute('aria-pressed', 'false');
    //magnetBtn.classList.remove('active');
  }

  // Tool selector buttons (do not include magnet button)
  const toolButtons = Array.from(document.querySelectorAll('.piano-roll-tool-btn')).filter(btn => btn.id !== 'piano-roll-magnet-toggle');
  // Set pencil as default active tool
  if (toolButtons.length > 0) {
    toolButtons[0].classList.add('active');
  }
  toolButtons.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      // Remove active class from all tool buttons
      toolButtons.forEach(b => b.classList.remove('active'));
      
      // Add active class to clicked button
      btn.classList.add('active');
      
      // Update current tool based on button index (0: pencil, 1: select, 2: slice)
      const tools = ['pencil', 'select', 'slice'];
      currentTool = tools[index];
    });
  });


  // Ctrl key detection for temporary box select mode
  window.addEventListener('keydown', function(e) {
    // Ctrl key temporarily switches to select tool
    if ((e.key === 'Control' || e.ctrlKey) && !isCtrlHeld && currentTool !== 'select') {
      isCtrlHeld = true;
      toolBeforeCtrl = currentTool;
      currentTool = 'select';
      
      // Update UI to show select tool is active
      const toolButtons = Array.from(document.querySelectorAll('.piano-roll-tool-btn')).filter(btn => btn.id !== 'piano-roll-magnet-toggle');
      toolButtons.forEach(b => b.classList.remove('active'));
      if (toolButtons[1]) { // Select tool is second button
        toolButtons[1].classList.add('active');
      }
    }
  });

  window.addEventListener('keyup', function(e) {
    // Release Ctrl key switches back to previous tool
    if ((e.key === 'Control' || !e.ctrlKey) && isCtrlHeld && toolBeforeCtrl) {
      isCtrlHeld = false;
      currentTool = toolBeforeCtrl;
      toolBeforeCtrl = null;
      
      // Update UI to show previous tool is active
      const toolButtons = Array.from(document.querySelectorAll('.piano-roll-tool-btn')).filter(btn => btn.id !== 'piano-roll-magnet-toggle');
      toolButtons.forEach(b => b.classList.remove('active'));
      const tools = ['pencil', 'select', 'slice'];
      const toolIndex = tools.indexOf(currentTool);
      if (toolButtons[toolIndex]) {
        toolButtons[toolIndex].classList.add('active');
      }
    }
  });

  // Keyboard Delete key removes selected notes
  window.addEventListener('keydown', function(e) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNotes.length > 0 && activeClip) {
      // Remove selected notes from activeClip
      activeClip.notes = activeClip.notes.filter(n => !selectedNotes.includes(n));
      selectedNotes = [];
      shrinkClipIfNeeded();
      renderPianoRoll();
      restartPreviewFromCurrentPosition();
      e.preventDefault();
    }

    // --- ARROW KEYS: Move selected notes in pencil mode ---
    // Don't allow movement during preview playback
    if (
      currentTool === 'pencil' &&
      selectedNotes.length > 0 &&
      activeClip &&
      !e.ctrlKey && !e.metaKey && !e.altKey
    ) {
      let moved = false;
      if (e.key === 'ArrowUp') {
        selectedNotes.forEach(n => setSafePitch(n, n.pitch + 1));
        moved = true;
      }
      if (e.key === 'ArrowDown') {
        selectedNotes.forEach(n => setSafePitch(n, n.pitch - 1));
        moved = true;
      }
      if (e.key === 'ArrowLeft') {
        selectedNotes.forEach(n => {
          n.start = Math.max(0, n.start - snap);
          n.end = Math.max(n.start + snap, n.end - snap);
        });
        moved = true;
      }
      if (e.key === 'ArrowRight') {
        selectedNotes.forEach(n => {
          n.start = n.start + snap;
          n.end = n.end + snap;
        });
        moved = true;
      }
      if (moved) {
        renderPianoRoll();
        updateClipPreview();
        restartPreviewFromCurrentPosition();
        e.preventDefault();
      }
    }
  });

  // ⭐ Two canvases now
  gridCanvas = document.getElementById("piano-roll-canvas");
  gridCtx = gridCanvas.getContext("2d");

  pianoCanvas = document.getElementById("piano-roll-piano-canvas");
  pianoCtx = pianoCanvas.getContext("2d");

    // Mouse wheel zoom for vertical row height (Shift + Scroll)
    gridCanvas.addEventListener('wheel', function(e) {
      if (e.shiftKey) {
        e.preventDefault();
        const scroll = document.getElementById("piano-roll-scroll");
        const rect = gridCanvas.getBoundingClientRect();
        // Mouse Y relative to gridCanvas content (including scroll)
        const mouseY = e.clientY - rect.top + scroll.scrollTop;
        // Calculate pitch under mouse before zoom
        const pitchUnderMouse = pitchMax - (mouseY / rowHeight);
        const delta = Math.sign(e.deltaY);
        let newHeight = rowHeight - delta * 1.2;
        newHeight = Math.max(minRowHeight, Math.min(maxRowHeight, newHeight));
        if (newHeight !== rowHeight) {
          // After zoom, keep the same pitch under the mouse pointer
          // Calculate mouse offset within the visible scroll area
          const mouseOffset = e.clientY - rect.top;
          rowHeight = newHeight;
          resizeCanvas();
          // After resize, calculate new scrollTop so the same pitch is under the mouse pointer
          const newMouseY = (pitchMax - pitchUnderMouse) * rowHeight;
          let newScrollTop = newMouseY - mouseOffset;
          // Clamp scrollTop to valid range
          const maxScroll = scroll.scrollHeight - scroll.clientHeight;
          newScrollTop = Math.max(0, Math.min(maxScroll, newScrollTop));
          scroll.scrollTop = newScrollTop;
        }
      }
      // else: let normal scroll behavior happen
    }, { passive: false });


  // Mouse wheel zoom for vertical row height and grid width (Shift + Scroll)
  gridCanvas.addEventListener('wheel', function(e) {
    if (e.shiftKey) {
      e.preventDefault();
      const scroll = document.getElementById("piano-roll-scroll");
      const rect = gridCanvas.getBoundingClientRect();
      // Mouse Y relative to gridCanvas content (including scroll)
      const mouseY = e.clientY - rect.top + scroll.scrollTop;
      // Mouse X relative to gridCanvas content (including scroll)
      const mouseX = e.clientX - rect.left + scroll.scrollLeft;
      // Calculate pitch under mouse before zoom
      const pitchUnderMouse = pitchMax - (mouseY / rowHeight);
      // Calculate beat under mouse before zoom
      const beatUnderMouse = mouseX / pxPerBeat;
      const delta = Math.sign(e.deltaY);
      let newHeight = rowHeight - delta * 1.2;
      newHeight = Math.max(minRowHeight, Math.min(maxRowHeight, newHeight));
      let newPxPerBeat = pxPerBeat - delta * 10;
      newPxPerBeat = Math.max(minPxPerBeat, Math.min(maxPxPerBeat, newPxPerBeat));
      const heightChanged = newHeight !== rowHeight;
      const widthChanged = newPxPerBeat !== pxPerBeat;
      if (heightChanged || widthChanged) {
        // Calculate mouse offsets within the visible scroll area
        const mouseYOffset = e.clientY - rect.top;
        const mouseXOffset = e.clientX - rect.left;
        rowHeight = newHeight;
        pxPerBeat = newPxPerBeat;
        resizeCanvas();
        // After resize, calculate new scrollTop and scrollLeft so the same pitch and beat are under the mouse pointer
        const newMouseY = (pitchMax - pitchUnderMouse) * rowHeight;
        let newScrollTop = newMouseY - mouseYOffset;
        const newMouseX = beatUnderMouse * pxPerBeat;
        let newScrollLeft = newMouseX - mouseXOffset;
        // Clamp scrollTop and scrollLeft to valid range
        const maxScrollTop = scroll.scrollHeight - scroll.clientHeight;
        newScrollTop = Math.max(0, Math.min(maxScrollTop, newScrollTop));
        const maxScrollLeft = scroll.scrollWidth - scroll.clientWidth;
        newScrollLeft = Math.max(0, Math.min(maxScrollLeft, newScrollLeft));
        scroll.scrollTop = newScrollTop;
        scroll.scrollLeft = newScrollLeft;
      }
    }
    // else: let normal scroll behavior happen
  }, { passive: false });




  const piano = document.getElementById("piano-roll-piano");
  const scroll = document.getElementById("piano-roll-scroll");

  scroll.addEventListener("scroll", () => {
    piano.scrollTop = scroll.scrollTop;
  });

  // ⭐ Load Sample button
  loadSampleBtn.addEventListener("click", async () => {
    if (!activeClip) return;

    const file = await pickAudioFile();
    if (!file) return;

    await loadSampleIntoClip(activeClip, file);

    updatePianoRollSampleHeader();
  });

  // Piano roll preview play button
  const previewPlayBtn = document.getElementById("piano-roll-preview-play");
  const previewStopBtn = document.getElementById("piano-roll-preview-stop");
  
  if (previewPlayBtn) {
    previewPlayBtn.addEventListener("click", () => {
      if (!activeClip) return;
      playPianoRollPreview();
    });
  }
  
  if (previewStopBtn) {
    previewStopBtn.addEventListener("click", () => {
      stopPianoRollPreview();
    });
  }



  // Transpose buttons
  document.addEventListener("click", e => {
    // Only handle actual transpose buttons that define data-step
    const btn = e.target.closest('.transpose-btn[data-step]');
    if (!btn) return;
    if (!activeClip) return;

    const step = Number(btn.dataset.step);
    if (!Number.isFinite(step)) return;

    // Helper to snap a pitch up to the next in-scale pitch (or itself if already in scale)
    function snapUpToScale(pitch) {
      if (!isFinite(pitch)) return pitchMax;
      let p = Math.round(pitch);
      while (p <= pitchMax) {
        if (isNoteInScale(p, currentScale)) return p;
        p++;
      }
      return pitchMax;
    }
    // Helper to snap a pitch down to the next in-scale pitch (or itself if already in scale)
    function snapDownToScale(pitch) {
      if (!isFinite(pitch)) return pitchMin;
      let p = Math.round(pitch);
      while (p >= pitchMin) {
        if (isNoteInScale(p, currentScale)) return p;
        p--;
      }
      return pitchMin;
    }

    // If notes are selected, only transpose selected notes
    if (selectedNotes.length > 0) {
      selectedNotes.forEach(n => {
        if (!isFinite(n.pitch)) return; // Skip notes with invalid pitch
        let newPitch = n.pitch + step;
        if (snapEnabled) {
          newPitch = step > 0 ? snapUpToScale(newPitch) : snapDownToScale(newPitch);
        }
        setSafePitch(n, newPitch);
      });
    } else {
      // Otherwise transpose all notes
      activeClip.notes.forEach(n => {
        if (!isFinite(n.pitch)) return; // Skip notes with invalid pitch
        let newPitch = n.pitch + step;
        if (snapEnabled) {
          newPitch = step > 0 ? snapUpToScale(newPitch) : snapDownToScale(newPitch);
        }
        setSafePitch(n, newPitch);
      });
    }

    scheduleRender();
    restartPreviewFromCurrentPosition();
  });

  // ⭐ Mouse events only on the GRID canvas
  gridCanvas.addEventListener("mousedown", onMouseDown);
  gridCanvas.addEventListener("mousemove", onMouseMove);
  gridCanvas.addEventListener("mouseup", onMouseUp);
  gridCanvas.addEventListener("mouseleave", onMouseUp);
  gridCanvas.addEventListener("contextmenu", e => e.preventDefault());

  // Drag-and-drop MIDI import
  gridCanvas.addEventListener("dragover", e => {
    e.preventDefault();
    gridCanvas.style.backgroundColor = "rgba(255,255,255,0.05)";
  });

  gridCanvas.addEventListener("dragleave", () => {
    gridCanvas.style.backgroundColor = "";
  });

  gridCanvas.addEventListener("drop", e => {
    e.preventDefault();
    e.stopPropagation();
    onMidiDrop(e);
  });

  // Scale selector
  const scaleSelect = document.getElementById('piano-roll-scale');
  if (scaleSelect) {
    // Helper to shift a pitch up to the next in-scale pitch
    function shiftUpToScale(pitch) {
      if (!isFinite(pitch)) return pitchMax;
      let p = Math.round(pitch);
      while (p <= pitchMax) {
        if (isNoteInScale(p, currentScale)) return p;
        p++;
      }
      // If no valid pitch found, clamp to max
      return pitchMax;
    }
    scaleSelect.addEventListener('change', e => {
      currentScale = e.target.value;
      // If snap is enabled, shift all out-of-scale notes up to the next in-scale pitch
      if (snapEnabled && activeClip) {
        activeClip.notes.forEach(n => {
          if (isFinite(n.pitch) && !isNoteInScale(n.pitch, currentScale)) {
            setSafePitch(n, shiftUpToScale(n.pitch));
          }
        });
      }
      renderPianoRoll();
      restartPreviewFromCurrentPosition();
    });
    // Set initial value
    currentScale = scaleSelect.value;
  }

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
};


window.openPianoRoll = function (clip) {
  // Stop any playing preview when opening a different clip
  if (activeClip !== clip) {
    stopPianoRollPreview();
  }
  
  activeClip = clip;

  const container = document.getElementById("piano-roll-container");
  container.classList.remove("hidden");

  resizeCanvas();
};

// ======================================================
//  CANVAS RESIZE + RENDER
// ======================================================

function resizeCanvas() {

  function getClipEndInBars(clip) {
    if (!clip.notes.length) return 4;

    let maxEndBeat = 0;
    for (const n of clip.notes) {
      if (n.end > maxEndBeat) maxEndBeat = n.end;
    }
    return maxEndBeat / 4;
  }

  if (!activeClip) return;

  const container = document.getElementById("piano-roll-container");
  if (container.classList.contains("hidden")) return;

  // use global rowHeight

  // ⭐ Resize piano canvas (fixed width)
  pianoCanvas.width = pianoWidth;
  pianoCanvas.height = pitchRange * rowHeight;

  // ⭐ Resize grid canvas (scrollable, zoomable width)
  const pxPerBar = pxPerBeat * 4;
  const endBars = getClipEndInBars(activeClip);
  const totalBars = endBars + 4;

  // Ensure grid always fills the visible scroll area
  const scroll = document.getElementById("piano-roll-scroll");
  const minGridWidth = scroll ? scroll.clientWidth : 0;
  const gridWidth = Math.max(totalBars * pxPerBar, minGridWidth);
  gridCanvas.width = gridWidth;
  gridCanvas.height = pitchRange * rowHeight;

  renderPianoRoll();
}

// Schedule a render using requestAnimationFrame to throttle updates
function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderPianoRoll();
  });
}

function renderPianoRoll() {
  if (!activeClip) return;

  // Clear both canvases
  pianoCtx.clearRect(0, 0, pianoCanvas.width, pianoCanvas.height);
  gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);

  // Draw piano on fixed canvas
  drawPiano(pianoCtx);

  // Draw grid + notes on scrollable canvas
  drawGrid(gridCtx);
  drawNotes(gridCtx);
  
  // Draw selection box if active
  if (selectBoxStart && selectBoxCurrent) {
    drawSelectionBox(gridCtx);
  }
}


// ======================================================
//  DRAW: PIANO KEYBOARD
// ======================================================

function drawPiano(ctx) {
  // use global rowHeight
  const styles = getComputedStyle(document.documentElement);

  const blackKey = styles.getPropertyValue('--bg-track-odd');
  const whiteKey = '#ffffff';

  const textColor = '#000000';
  const borderColor = styles.getPropertyValue('--border-mid');

  for (let i = 0; i < pitchRange; i++) {
    const pitch = pitchMax - i;
    const y = i * rowHeight;
    const isBlack = [1,3,6,8,10].includes(pitch % 12);
    ctx.fillStyle = isBlack ? blackKey : whiteKey;
    ctx.fillRect(0, y, pianoWidth, rowHeight);
    // Only draw label if rowHeight is large enough for text
    if (!isBlack && rowHeight >= 12) {
      ctx.fillStyle = textColor;
      ctx.font = "12px sans-serif";
      ctx.fillText(midiToNoteName(pitch), 5, y + rowHeight * 0.7);
    }
  }

  // Right border of piano
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pianoWidth, 0);
  ctx.lineTo(pianoWidth, pianoCanvas.height);
  ctx.stroke();
}

function midiToNoteName(pitch) {
  const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const name = names[pitch % 12];
  const octave = Math.floor(pitch / 12);
  return name + octave;
}

function drawGrid(ctx) {
  // use global rowHeight
  const styles = getComputedStyle(document.documentElement);

  const bgDark     = styles.getPropertyValue('--bg-panel');
  const bgLight    = styles.getPropertyValue('--bg-track-even');
  const lineRegular = styles.getPropertyValue('--border-dark');
  const lineOctave  = styles.getPropertyValue('--border-light');
  const beatLine    = styles.getPropertyValue('--accent-beat');
  const barLine     = styles.getPropertyValue('--bar-dark') || '#4444448a';
  const fourBarLine = styles.getPropertyValue('--bar-light') || '#007aff';

  // Background shading (scale-aware)
  for (let i = 0; i < pitchRange; i++) {
    const pitch = pitchMax - i;
    const y = i * rowHeight;
    ctx.fillStyle = isNoteInScale(pitch, currentScale) ? bgLight : bgDark;
    ctx.fillRect(0, y, gridCanvas.width, rowHeight);
  }

  // Vertical lines: 1/4-beat, beat, bar, 4-bar
  const totalBeats = Math.ceil(gridCanvas.width / pxPerBeat);
  const quarterPx = pxPerBeat / 4;
  const totalQuarters = Math.ceil(gridCanvas.width / quarterPx);

  // Horizontal pitch lines
  for (let i = 0; i <= pitchRange; i++) {
    const pitch = pitchMax - i;
    const isOctave = pitch % 12 === 0;

    const y = i * rowHeight + (isOctave ? rowHeight : 0);

    ctx.strokeStyle = isOctave ? lineOctave : lineRegular;
    ctx.lineWidth = isOctave ? 2 : 1;

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(gridCanvas.width, y);
    ctx.stroke();
  }

  // 1/4-beat subdivision lines (lightest)
  ctx.strokeStyle = lineRegular;
  ctx.lineWidth = 1;
  for (let q = 0; q <= totalQuarters; q++) {
    if (q % 4 === 0) continue; // skip full beats
    const x = q * quarterPx;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, gridCanvas.height);
    ctx.stroke();
  }

  // Beat lines (existing)
  for (let b = 0; b <= totalBeats; b++) {
    const x = b * pxPerBeat;
    ctx.strokeStyle = beatLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, gridCanvas.height);
    ctx.stroke();
  }

  // Bar lines (every 4 beats)
  const totalBars = Math.ceil(totalBeats / 4);
  for (let bar = 0; bar <= totalBars; bar++) {
    const x = bar * pxPerBeat * 4;
    ctx.strokeStyle = barLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, gridCanvas.height);
    ctx.stroke();
  }

  // 4-bar lines (every 16 beats)
  const totalFourBars = Math.ceil(totalBars / 4);
  for (let four = 0; four <= totalFourBars; four++) {
    const x = four * pxPerBeat * 16;
    ctx.strokeStyle = fourBarLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, gridCanvas.height);
    ctx.stroke();
  }


}

function drawNotes(ctx) {
  // use global rowHeight
  const radius = 4;
  const trackColor = window.TRACK_COLORS[activeClip.trackIndex % 10];

  activeClip.notes.forEach(note => {
    const y = (pitchMax - note.pitch) * rowHeight;
    const x = note.start * pxPerBeat; // grid only, piano is fixed width
    const w = (note.end - note.start) * pxPerBeat;
    const h = rowHeight - 2;

    // Rounded rectangle helper
    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    // Base fill
    ctx.fillStyle = trackColor;
    roundRect(ctx, x, y, w, h, radius);
    ctx.fill();

    // Soft highlight
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    roundRect(ctx, x, y, w, h * 0.4, radius);
    ctx.fill();

    // Border
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, radius);
    ctx.stroke();

    // Selected note highlight
    if (selectedNotes.includes(note)) {
      ctx.strokeStyle = "rgba(0, 122, 255, 0.8)";
      ctx.lineWidth = 2;
      roundRect(ctx, x - 1, y - 1, w + 2, h + 2, radius + 1);
      ctx.stroke();
    }

    // Hover glow
    if (hoverNote === note) {
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      roundRect(ctx, x - 1, y - 1, w + 2, h + 2, radius + 1);
      ctx.stroke();
    }

    // Resize handle
    if (hoverNote === note && currentTool === 'pencil') {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(x + w - 5, y + 3, 4, h - 6);
    }
  });
}

function drawSelectionBox(ctx) {
  if (!selectBoxStart || !selectBoxCurrent) return;
  
  const minX = Math.min(selectBoxStart.x, selectBoxCurrent.x);
  const minY = Math.min(selectBoxStart.y, selectBoxCurrent.y);
  const width = Math.abs(selectBoxCurrent.x - selectBoxStart.x);
  const height = Math.abs(selectBoxCurrent.y - selectBoxStart.y);
  
  // Draw selection box
  ctx.strokeStyle = "rgba(0, 122, 255, 0.8)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.strokeRect(minX, minY, width, height);
  ctx.setLineDash([]);
  
  // Fill with semi-transparent blue
  ctx.fillStyle = "rgba(0, 122, 255, 0.1)";
  ctx.fillRect(minX, minY, width, height);
}

// ======================================================
//  MOUSE STATE
// ======================================================
let drawingNote = null;
let drawingStartBeat = 0;

let resizingNote = null;
let resizeStartX = 0;
let originalEnd = 0;

let movingNote = null;
let moveStartX = 0;
let moveStartBeat = 0;
let moveStartPitch = 0;

let hoverNote = null;

// Selection state
let selectedNotes = [];
let selectBoxStart = null;
let selectBoxCurrent = null;
let movingSelection = false;
let duplicatingSelection = false;
let duplicatedNotes = [];
let duplicateOriginMap = new Map();
let selectionStartPositions = new Map();
let temporaryBoxSelectMode = false;

// Right-click deletion state
let isDeletingWithRightClick = false;

let lastNoteLength = snap; // Remember last used note length

// Performance optimization: throttle rendering
let renderScheduled = false;
let lastHoverNote = null;


function onMouseDown(e) {
  if (!activeClip) return;

  const scroll = document.getElementById("piano-roll-scroll");
  const rect = scroll.getBoundingClientRect();

  // Convert mouse position → grid coordinates
  const x = e.clientX - rect.left + scroll.scrollLeft;
  const y = e.clientY - rect.top  + scroll.scrollTop;

  // use global rowHeight

  // Convert Y → pitch
  const pitch = pitchMax - Math.floor(y / rowHeight);

  // Convert X → beat (snap to grid)
  const rawBeat = x / pxPerBeat;
  const beat = Math.floor(rawBeat / snap) * snap;

  // Store for dragging, selection, etc.
  mouseDownBeat = beat;
  mouseDownPitch = pitch;

  // Your existing logic (select note, create note, resize note, etc.)
  // ...



  // ---------------------------------------------
  // RIGHT CLICK → DELETE (only with pencil tool)
  // ---------------------------------------------
  if (e.button === 2) {
    if (currentTool === 'pencil') {
      isDeletingWithRightClick = true;
      const idx = activeClip.notes.findIndex(n =>
        pitch === n.pitch &&
        rawBeat >= n.start &&
        rawBeat <= n.end
      );
      if (idx !== -1) {
        activeClip.notes.splice(idx, 1);
        shrinkClipIfNeeded();
        renderPianoRoll();
        updateClipPreview();
      }
    }
    return;
  }

// ---------------------------------------------
// BLOCK drawing before bar 0
// ---------------------------------------------
if (beat < 0) return; // optional, but NO pianoWidth check

  // ---------------------------------------------
  // CHECK NOTE HIT
  // ---------------------------------------------
  const clicked = findNoteAt(x, y);

  // ---------------------------------------------
  // SELECT TOOL → Box selection or move selection
  // ---------------------------------------------
  // Shift+drag duplicate only in pencil mode and if notes are already selected
  if (currentTool === 'select' && e.button === 0) {
    if (clicked && selectedNotes.includes(clicked.note)) {
      // Start moving selected notes (no duplication)
      movingSelection = true;
      moveStartX = x;
      moveStartBeat = beat;
      selectionStartPositions.clear();
      selectedNotes.forEach(note => {
        selectionStartPositions.set(note, {
          start: note.start,
          end: note.end,
          pitch: note.pitch
        });
      });
    } else {
      // Start drawing selection box
      selectBoxStart = { x, y };
      selectBoxCurrent = { x, y };
      // Clear selection if not holding shift
      if (!e.shiftKey) {
        selectedNotes = [];
      }
    }
    return;
  }

  // Pencil mode: shift+drag to duplicate selected notes
  if (currentTool === 'pencil' && e.button === 0 && e.shiftKey && selectedNotes.length > 0 && clicked && selectedNotes.includes(clicked.note)) {
    duplicatingSelection = true;
    duplicatedNotes = [];
    duplicateOriginMap = new Map();
    // Duplicate all selected notes, preserving their relative positions
    selectedNotes.forEach(note => {
      const copy = { ...note };
      activeClip.notes.push(copy);
      duplicatedNotes.push(copy);
      duplicateOriginMap.set(copy, note); // map duplicate to original
    });
    selectedNotes = duplicatedNotes.slice();
    movingSelection = true;
    moveStartX = x;
    moveStartBeat = beat;
    selectionStartPositions.clear();
    duplicatedNotes.forEach(dup => {
      const orig = duplicateOriginMap.get(dup);
      selectionStartPositions.set(dup, {
        start: orig.start,
        end: orig.end,
        pitch: orig.pitch
      });
    });
    return;
  }

  // Pencil mode: Click on selected note to move selection (without Shift or Ctrl)
  if (currentTool === 'pencil' && e.button === 0 && !e.shiftKey && !e.ctrlKey && selectedNotes.length > 0 && clicked && selectedNotes.includes(clicked.note)) {
    movingSelection = true;
    moveStartX = x;
    moveStartBeat = beat;
    selectionStartPositions.clear();
    selectedNotes.forEach(note => {
      selectionStartPositions.set(note, {
        start: note.start,
        end: note.end,
        pitch: note.pitch
      });
    });
    return;
  }

  // ---------------------------------------------
  // SLICE TOOL → Split note at click position
  // ---------------------------------------------
  if (currentTool === 'slice' && clicked && e.button === 0) {
    const note = clicked.note;
    // Offset the clickable area by 1/8 beat to the left
    const offset = snap / 2; // 1/8 beat if snap is 1/4
    const adjustedRawBeat = rawBeat + offset;
    const slicePoint = Math.floor(adjustedRawBeat / snap) * snap;
    // Only slice if click is within note bounds (not at edges)
    if (slicePoint > note.start && slicePoint < note.end) {
      // Create two new notes
      const firstNote = {
        pitch: note.pitch,
        start: note.start,
        end: slicePoint,
        velocity: note.velocity
      };
      
      const secondNote = {
        pitch: note.pitch,
        start: slicePoint,
        end: note.end,
        velocity: note.velocity
      };
      
      // Remove original note
      const idx = activeClip.notes.indexOf(note);
      if (idx !== -1) {
        activeClip.notes.splice(idx, 1);
      }
      
      // Add the two sliced notes
      activeClip.notes.push(firstNote, secondNote);
      
      renderPianoRoll();
      updateClipPreview();
      refreshClipInTimeline(activeClip);
    }
    return;
  }

  // ---------------------------------------------
  // RESIZE HANDLE (only with pencil tool)
  // ---------------------------------------------
  if (clicked && clicked.onRightEdge && currentTool === 'pencil') {
    resizingNote = clicked.note;
    resizeStartX = x;
    originalEnd = clicked.note.end;
    // --- Remember this note's length for next draw ---
    lastNoteLength = Math.max(0.01, clicked.note.end - clicked.note.start);
    return;
  }

  // ---------------------------------------------
  // MOVE EXISTING NOTE (only with pencil tool)
  // ---------------------------------------------
  if (clicked && !clicked.onRightEdge && currentTool === 'pencil') {
    movingNote = clicked.note;
    moveStartX = x;
    moveStartBeat = clicked.note.start;
    moveStartPitch = clicked.note.pitch;
    // --- Remember this note's length for next draw ---
    lastNoteLength = Math.max(0.01, clicked.note.end - clicked.note.start);
    return;
  }

  // ---------------------------------------------
  // DRAW NEW NOTE (only with pencil tool)
  // ---------------------------------------------
  if (currentTool !== 'pencil') return;
  
  drawingStartBeat = beat;

  const newNote = {
    pitch,
    start: beat,
    end: beat + lastNoteLength, // Use lastNoteLength instead of snap
    velocity: 0.8
  };

  // Prevent drawing overlapping notes
  const overlap = activeClip.notes.some(n =>
    n.pitch === pitch &&
    (
      (newNote.start >= n.start && newNote.start < n.end) ||
      (newNote.end > n.start && newNote.end <= n.end)
    )
  );

  if (overlap) return;

  drawingNote = newNote;
  activeClip.notes.push(newNote);
  extendClipIfNeeded(newNote.end);

  renderPianoRoll();
}


function onMouseMove(e) {
  if (!activeClip) return;

  const scroll = document.getElementById("piano-roll-scroll");
  const rect = scroll.getBoundingClientRect();

  // Convert mouse → grid coordinates
  const x = e.clientX - rect.left + scroll.scrollLeft;
  const y = e.clientY - rect.top  + scroll.scrollTop;

  // ---------------------------------------------
  // RIGHT-CLICK DELETION (continuous)
  // ---------------------------------------------
  if (isDeletingWithRightClick && currentTool === 'pencil') {
    const hit = findNoteAt(x, y);
    if (hit) {
      const idx = activeClip.notes.indexOf(hit.note);
      if (idx !== -1) {
        activeClip.notes.splice(idx, 1);
        shrinkClipIfNeeded();
        renderPianoRoll();
        updateClipPreview();
      }
    }
    return;
  }

  // ---------------------------------------------
  // 0. DRAWING SELECTION BOX
  // ---------------------------------------------
  if (selectBoxStart && (currentTool === 'select' || temporaryBoxSelectMode)) {
    selectBoxCurrent = { x, y };
    renderPianoRoll();
    return;
  }

  // ---------------------------------------------
  // 0b. MOVING SELECTED NOTES (in select mode or duplicating in pencil mode, or Ctrl+drag move)
  // ---------------------------------------------
  if (movingSelection && (currentTool === 'select' || (currentTool === 'pencil' && (duplicatingSelection || selectionStartPositions.size > 0)))) {
    const deltaBeats = (x - moveStartX) / pxPerBeat;
    const snapped = Math.round(deltaBeats / snap) * snap;
    // use global rowHeight
    const currentPitch = pitchMax - Math.floor(y / rowHeight);
    
    let pitchDelta;
    if (duplicatingSelection) {
      // In duplication mode, use the difference from the original pitch of the first duplicated note
      const orig = duplicateOriginMap.get(duplicatedNotes[0]);
      pitchDelta = currentPitch - orig.pitch;
    } else {
      // In move mode (select tool or Ctrl+drag), use moveStartBeat to find the reference note
      const firstNote = selectedNotes[0];
      const firstOriginal = selectionStartPositions.get(firstNote);
      if (firstOriginal) {
        pitchDelta = currentPitch - firstOriginal.pitch;
      }
    }
    
    selectedNotes.forEach(note => {
      const original = selectionStartPositions.get(note);
      if (original) {
        let newStart = original.start + snapped;
        newStart = Math.max(0, newStart);
        const duration = original.end - original.start;
        note.start = newStart;
        note.end = newStart + duration;
        setSafePitch(note, original.pitch + pitchDelta);
        extendClipIfNeeded(note.end);
      }
    });
    updateClipPreview();
    scheduleRender();
    return;
  }

  // ---------------------------------------------
  // 1. RESIZING EXISTING NOTE
  // ---------------------------------------------
  if (resizingNote) {
    // --- SHIFT disables snap for fine adjustment and disables min size ---
    let deltaBeats = (x - resizeStartX) / pxPerBeat;
    let snapped;
    let minSize;
    if (e.altKey) {
      snapped = deltaBeats;
      minSize = 0.01; // allow very small notes when shift is held
    } else {
      snapped = Math.round(deltaBeats / snap) * snap;
      minSize = snap; // default minimum size is snap (e.g. 0.25)
    }

    resizingNote.end = Math.max(
      resizingNote.start + minSize,
      originalEnd + snapped
    );

    // --- Remember this note's length for next draw ---
    lastNoteLength = Math.max(0.01, resizingNote.end - resizingNote.start);

    extendClipIfNeeded(resizingNote.end);
    resizeCanvas();
    scheduleRender();
    updateClipPreview();
    return;
  }

  // ---------------------------------------------
  // 2. MOVING EXISTING NOTE
  // ---------------------------------------------
  if (movingNote) {
    const deltaBeats = (x - moveStartX) / pxPerBeat;
    const snapped = Math.round(deltaBeats / snap) * snap;

    // Helper to find the nearest pitch in scale
    function getNearestScalePitch(targetPitch) {
      if (!isFinite(targetPitch)) return pitchMin;
      targetPitch = Math.round(targetPitch);
      // Find all scale pitches in the visible range
      let minDist = Infinity;
      let bestPitch = targetPitch;
      for (let p = pitchMin; p <= pitchMax; p++) {
        if (isNoteInScale(p, currentScale)) {
          const dist = Math.abs(p - targetPitch);
          if (dist < minDist) {
            minDist = dist;
            bestPitch = p;
          }
        }
      }
      return bestPitch;
    }

    // If this note is part of a selection, move all selected notes
    if (selectedNotes.includes(movingNote)) {
      // use global rowHeight
      let currentPitch = pitchMax - Math.floor(y / rowHeight);
      let pitchDelta;
      if (snapEnabled) {
        // Snap to nearest scale pitch
        currentPitch = getNearestScalePitch(currentPitch);
        pitchDelta = currentPitch - moveStartPitch;
      } else {
        pitchDelta = currentPitch - moveStartPitch;
      }

      selectedNotes.forEach(note => {
        const original = selectionStartPositions.get(note);
        if (original) {
          let newStart = original.start + snapped;
          newStart = Math.max(0, newStart);

          const duration = original.end - original.start;
          let newPitch = original.pitch + pitchDelta;
          if (snapEnabled) {
            newPitch = getNearestScalePitch(newPitch);
          }
          note.start = newStart;
          note.end = newStart + duration;
          setSafePitch(note, newPitch);

          extendClipIfNeeded(note.end);
        }
      });
    } else {
      // Move single note
      let newStart = moveStartBeat + snapped;
      newStart = Math.max(0, newStart); // prevent before bar 0

      const newEnd = newStart + (movingNote.end - movingNote.start);

      // Prevent overlap on same pitch
      const collision = activeClip.notes.some(n =>
        n !== movingNote &&
        n.pitch === movingNote.pitch &&
        (
          (newStart >= n.start && newStart < n.end) ||
          (newEnd > n.start && newEnd <= n.end)
        )
      );

      if (!collision) {
        movingNote.start = newStart;
        movingNote.end = newEnd;
      }

      // Vertical movement (pitch)
      // use global rowHeight
      let newPitch = pitchMax - Math.floor(y / rowHeight);
      if (snapEnabled) {
        newPitch = getNearestScalePitch(newPitch);
      }

      if (newPitch !== movingNote.pitch) {
        const pitchCollision = activeClip.notes.some(n =>
          n !== movingNote &&
          n.pitch === newPitch &&
          (
            (movingNote.start >= n.start && movingNote.start < n.end) ||
            (movingNote.end > n.start && movingNote.end <= n.end)
          )
        );

        if (!pitchCollision) {
          setSafePitch(movingNote, newPitch);
        }
      }
      extendClipIfNeeded(movingNote.end);
    }

    updateClipPreview();
    //refreshClipInTimeline(activeClip);
    scheduleRender();
    return;
  }

  // ---------------------------------------------
  // 3. DRAWING NEW NOTE
  // ---------------------------------------------
if (drawingNote) {
  const rawBeat = x / pxPerBeat;  // ⭐ no pianoWidth offset
  const snapped = Math.max(
    drawingStartBeat + snap,
    Math.round(rawBeat / snap) * snap
  );

  drawingNote.end = snapped;

  extendClipIfNeeded(snapped);
  scheduleRender();
  return;
}

// ---------------------------------------------
// 4. HOVER DETECTION (pencil and slice tools)
// ---------------------------------------------
const hit = findNoteAt(x, y);

if (hit && currentTool === 'pencil') {
  gridCanvas.style.cursor = hit.onRightEdge ? "ew-resize" : "pointer";

  if (hoverNote !== hit.note) {
    hoverNote = hit.note;
    scheduleRender();
  }
} else if (hit && currentTool === 'slice') {
  gridCanvas.style.cursor = "text";

  if (hoverNote !== hit.note) {
    hoverNote = hit.note;
    scheduleRender();
  }
} else {
  if (hoverNote !== null) {
    hoverNote = null;
    scheduleRender();
  }
  gridCanvas.style.cursor = "default";
}
}


function onMouseUp() {
  // Finalize selection box
  if (selectBoxStart && selectBoxCurrent && (currentTool === 'select' || temporaryBoxSelectMode)) {
    const minX = Math.min(selectBoxStart.x, selectBoxCurrent.x);
    const maxX = Math.max(selectBoxStart.x, selectBoxCurrent.x);
    const minY = Math.min(selectBoxStart.y, selectBoxCurrent.y);
    const maxY = Math.max(selectBoxStart.y, selectBoxCurrent.y);
    
    // use global rowHeight
    
    // Find notes within selection box
    activeClip.notes.forEach(note => {
      const noteX = note.start * pxPerBeat;
      const noteWidth = (note.end - note.start) * pxPerBeat;
      const noteY = (pitchMax - note.pitch) * rowHeight;
      const noteHeight = rowHeight;
      
      // Check if note overlaps with selection box
      const overlaps = !(noteX + noteWidth < minX || 
                        noteX > maxX || 
                        noteY + noteHeight < minY || 
                        noteY > maxY);
      
      if (overlaps && !selectedNotes.includes(note)) {
        selectedNotes.push(note);
      }
    });
    
    selectBoxStart = null;
    selectBoxCurrent = null;
    temporaryBoxSelectMode = false;
    renderPianoRoll();
  }

  if (drawingNote) {
    updateClipPreview();
    resizeCanvas();
    renderPianoRoll();
    // Schedule the newly drawn note if playing
    scheduleNoteIfPlaying(drawingNote);
  }

  if (movingSelection || resizingNote || movingNote) {
    updateClipPreview();
    refreshClipInTimeline(activeClip);
    restartPreviewFromCurrentPosition();
    // If we were duplicating, keep only the duplicates selected
    if (duplicatingSelection) {
      selectedNotes = duplicatedNotes.slice();
      duplicatingSelection = false;
      duplicatedNotes = [];
    }
  }

  drawingNote = null;
  resizingNote = null;
  movingNote = null;
  movingSelection = false;
  isDeletingWithRightClick = false;
  temporaryBoxSelectMode = false;
}

// ======================================================
//  NOTE HIT TEST
// ======================================================

function findNoteAt(x, y) {
  // use global rowHeight

  for (let note of activeClip.notes) {
    const ny = (pitchMax - note.pitch) * rowHeight;
    const nx = note.start * pxPerBeat;          // ⭐ FIXED
    const nw = (note.end - note.start) * pxPerBeat;
    const nh = rowHeight - 2;

    const inside =
      x >= nx && x <= nx + nw &&
      y >= ny && y <= ny + nh;

    if (inside) {
      const onRightEdge = x >= nx + nw - 6 && x <= nx + nw;
      return { note, onRightEdge };
    }
  }
  return null;
}

// ======================================================
//  CLIP EXTENSION + PREVIEW UPDATE
// ======================================================

function extendClipIfNeeded(noteEndBeat) {
  const beatsPerBar = 4;
  const currentBeats = activeClip.bars * beatsPerBar;

  if (noteEndBeat > currentBeats) {
    const newBars = Math.ceil(noteEndBeat / beatsPerBar);
    activeClip.bars = newBars;
    updateClipPreview();
    refreshClipInTimeline(activeClip);
  }
}

function updateClipPreview() {
  if (!activeClip) return;   // ⭐ Prevent crash

  const el = document.querySelector(`[data-clip-id="${activeClip.id}"]`);
  if (!el) return;

  const dropArea = el.parentElement;
  if (!dropArea) return;

  dropArea.innerHTML = "";

  window.clips
    .filter(c => c.trackIndex === activeClip.trackIndex)
    .forEach(c => window.renderClip(c, dropArea));
}

// Helper function to restart preview from current position (for live editing)
function restartPreviewFromCurrentPosition() {
  if (!pianoRollPreviewState.isPlaying || !activeClip) return;
  
  // Clear any pending restart
  if (pianoRollPreviewState.restartTimeout) {
    clearTimeout(pianoRollPreviewState.restartTimeout);
  }
  
  // Debounce rapid restarts (wait 50ms for user to finish dragging)
  pianoRollPreviewState.restartTimeout = setTimeout(() => {
    const bpm = 175;
    const secondsPerBeat = 60 / bpm;
    const elapsed = window.audioContext.currentTime - pianoRollPreviewState.startTime;
    const currentBeat = elapsed / secondsPerBeat;
    
    // Store current position
    pianoRollPreviewState.currentBeat = currentBeat;
    
    // Stop all currently playing voices
    pianoRollPreviewState.voices.forEach(({ source }) => {
      try {
        source.stop();
      } catch (e) {
        // Already stopped
      }
    });
    pianoRollPreviewState.voices = [];
    pianoRollPreviewState.scheduledNotes.clear();
    
    // Restart from current position
    const now = window.audioContext.currentTime;
    pianoRollPreviewState.startTime = now - (currentBeat * secondsPerBeat);
    
    // Use the clip's sample buffer or default MIDI sample
    const sampleBuffer = activeClip.sampleBuffer || window.defaultMidiSampleBuffer;
    if (!sampleBuffer) return;
    
    // Schedule all notes that should play from current position onwards
    activeClip.notes.forEach(note => {
      // Validate note
      if (!note || 
          typeof note.pitch !== 'number' || !isFinite(note.pitch) ||
          typeof note.start !== 'number' || !isFinite(note.start) ||
          typeof note.end !== 'number' || !isFinite(note.end)) {
        return;
      }
      
      // Only schedule notes that haven't finished playing yet
      if (note.end <= currentBeat) return;
      
      const startBeats = Math.max(note.start, currentBeat);
      const endBeats   = note.end;

      const { t, effectiveDuration } =
        computeScheduleTimes(startBeats, endBeats, secondsPerBeat, pianoRollPreviewState.startTime);

      if (effectiveDuration <= 0.001) return;

      const source = window.audioContext.createBufferSource();
      source.buffer = sampleBuffer;

      const semitone = note.pitch - 60;
      const playbackRate = Math.pow(2, semitone / 12);
      if (!isFinite(playbackRate)) return;
      source.playbackRate.value = playbackRate;

      const gain = window.audioContext.createGain();
      const velocity = note.velocity || 0.8;
      const isMidNote = startBeats > note.start + 1e-6;

      // Envelope: if resuming mid-note, jump straight to sustain to avoid clicks
      if (isMidNote) {
        gain.gain.setValueAtTime(velocity * 0.6, t);
        gain.gain.setValueAtTime(velocity * 0.6, t + effectiveDuration);
        gain.gain.linearRampToValueAtTime(0.0001, t + effectiveDuration + RELEASE_SEC);
      } else {
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(velocity * 0.6, t + ATTACK_SEC);
        gain.gain.setValueAtTime(velocity * 0.6, t + effectiveDuration);
        gain.gain.linearRampToValueAtTime(0.0001, t + effectiveDuration + RELEASE_SEC);
      }

      source.connect(gain);
      gain.connect(window.masterGain || window.audioContext.destination);

      try {
        source.start(t);
        source.stop(t + effectiveDuration + RELEASE_SEC);
      } catch (e) {
        // Skip invalid schedules
        return;
      }

      pianoRollPreviewState.voices.push({ source, gain });
      pianoRollPreviewState.scheduledNotes.add(note);
    });
    
    pianoRollPreviewState.restartTimeout = null;
  }, 50); // 50ms debounce
}

// Helper function to schedule a single note during live playback
function scheduleNoteIfPlaying(note) {
  if (!pianoRollPreviewState.isPlaying || !activeClip) return;
  
  const bpm = 175;
  const secondsPerBeat = 60 / bpm;
  const now = window.audioContext.currentTime;
  const elapsed = now - pianoRollPreviewState.startTime;
  const currentBeat = elapsed / secondsPerBeat;
  
  // Only schedule if note hasn't been played yet
  if (note.start > currentBeat) {
    const sampleBuffer = activeClip.sampleBuffer || window.defaultMidiSampleBuffer;
    if (!sampleBuffer) return;

    const startBeats = note.start;
    const endBeats   = note.end;

    const { t, effectiveDuration } =
      computeScheduleTimes(startBeats, endBeats, secondsPerBeat, pianoRollPreviewState.startTime);

    if (effectiveDuration <= 0.001) return;

    const source = window.audioContext.createBufferSource();
    source.buffer = sampleBuffer;

    const semitone = note.pitch - 60;
    const playbackRate = Math.pow(2, semitone / 12);
    if (!isFinite(playbackRate)) return;
    source.playbackRate.value = playbackRate;

    const gain = window.audioContext.createGain();
    const velocity = note.velocity || 0.8;

    // Fresh note envelope
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(velocity * 0.6, t + ATTACK_SEC);
    gain.gain.setValueAtTime(velocity * 0.6, t + effectiveDuration);
    gain.gain.linearRampToValueAtTime(0.0001, t + effectiveDuration + RELEASE_SEC);

    source.connect(gain);
    gain.connect(window.masterGain || window.audioContext.destination);

    try {
      source.start(t);
      source.stop(t + effectiveDuration + RELEASE_SEC);
    } catch (e) {
      return;
    }

    pianoRollPreviewState.voices.push({ source, gain });
    pianoRollPreviewState.scheduledNotes.add(note);
  }
}

// Small scheduling lookahead and envelope constants
const SCHEDULE_AHEAD_SEC = 0.02;
const ATTACK_SEC = 0.005;
const RELEASE_SEC = 0.05;

// Helper: compute safe start time and effective duration
function computeScheduleTimes(startBeats, endBeats, secondsPerBeat, baseStartTime) {
  const startTime = baseStartTime + (startBeats * secondsPerBeat);
  const endTime   = baseStartTime + (endBeats  * secondsPerBeat);
  const now       = window.audioContext.currentTime;
  // Ensure start is always in the future by at least lookahead
  const t = Math.max(now + SCHEDULE_AHEAD_SEC, startTime + SCHEDULE_AHEAD_SEC);
  const effectiveDuration = Math.max(0.001, endTime - t);
  return { t, effectiveDuration, startTime, endTime };
}

// ======================================================
//  MIDI IMPORT
// ======================================================

async function onMidiDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  gridCanvas.style.backgroundColor = "";   // ⭐ updated

  if (!activeClip) return;

  if (!window.Midi) {
    console.error("Midi parser not loaded.");
    return;
  }

  // Check if dropping from sidebar
  if (window.draggedLoop && window.draggedLoop.type === "midi") {
    const loop = window.draggedLoop;
    
    // Handle built-in MIDI with notes array
    if (loop.notes && Array.isArray(loop.notes)) {
      activeClip.notes = JSON.parse(JSON.stringify(loop.notes));
      
      if (activeClip.notes.length > 0) {
        const maxEnd = Math.max(...activeClip.notes.map(n => n.end));
        const midiBars = Math.ceil(maxEnd / 4);
        activeClip.bars = Math.max(1, midiBars);
      } else {
        activeClip.bars = 1;
      }
      
      resizeCanvas();
      scheduleRender();
      updateClipPreview();
      refreshClipInTimeline(activeClip);
      
      window.draggedLoop = null;
      return;
    }
    
    // Handle Dropbox MIDI with URL
    if (loop.url) {
      try {
        const response = await fetch(loop.url);
        const arrayBuffer = await response.arrayBuffer();
        const midi = new Midi(arrayBuffer);
        
        const importedNotes = [];
        const ppq = midi.header.ppq;
        
        midi.tracks.forEach(track => {
          track.notes.forEach(n => {
            const startBeats = n.ticks / ppq;
            const endBeats = (n.ticks + n.durationTicks) / ppq;
            const pitch = Math.min(pitchMax, Math.max(pitchMin, n.midi));
            
            importedNotes.push({
              pitch,
              start: startBeats,
              end: endBeats,
              velocity: n.velocity
            });
          });
        });
        
        activeClip.notes = importedNotes;
        
        const maxEnd = Math.max(...importedNotes.map(n => n.end));
        const midiBars = Math.ceil(maxEnd / 4);
        activeClip.bars = Math.max(1, midiBars);
        
        resizeCanvas();
        scheduleRender();
        updateClipPreview();
        refreshClipInTimeline(activeClip);
        
        window.draggedLoop = null;
        return;
      } catch (error) {
        console.error("Error loading MIDI from sidebar:", error);
        window.draggedLoop = null;
        return;
      }
    }
  }

  // Handle local file drop
  const file = e.dataTransfer.files[0];
  if (!file || (!file.name.toLowerCase().endsWith(".mid") &&
                !file.name.toLowerCase().endsWith(".midi"))) {
    console.warn("Not a MIDI file");
    return;
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const midi = new Midi(new Uint8Array(arrayBuffer));

    const importedNotes = [];
    const ppq = midi.header.ppq;

    midi.tracks.forEach(track => {
      track.notes.forEach(n => {
        const startBeats = n.ticks / ppq;
        const endBeats = (n.ticks + n.durationTicks) / ppq;

        // ⭐ clamp pitch to piano roll range
        const pitch = Math.min(pitchMax, Math.max(pitchMin, n.midi));

        importedNotes.push({
          pitch,
          start: startBeats,
          end: endBeats,
          velocity: n.velocity
        });
      });
    });

    activeClip.notes = importedNotes;

    // Determine clip length
    const maxEnd = Math.max(...importedNotes.map(n => n.end));
    const midiBars = Math.ceil(maxEnd / 4);

    // ⭐ updated for new canvas
    const visibleBeats = gridCanvas.width / pxPerBeat;
    const visibleBars = Math.ceil(visibleBeats / 4);

    activeClip.bars = Math.max(1, midiBars);
    


    resizeCanvas();
    scheduleRender();
    updateClipPreview();
    refreshClipInTimeline(activeClip);

  } catch (err) {
    console.error("MIDI import failed:", err);
  }
}



function pickAudioFile() {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*";

    input.onchange = () => resolve(input.files[0]);
    input.click();
  });
}

function updatePianoRollSampleHeader() {
  const el = document.getElementById("piano-roll-sample-name");

  if (!window.activeClip) {
    el.textContent = "None";
    return;
  }

  el.textContent = window.activeClip.sampleName || "None";
}

async function loadSampleIntoClip(clip, file) {
  if (!window.audioCtx) {
    window.audioCtx = new AudioContext();
  }

  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await window.audioCtx.decodeAudioData(arrayBuffer);

  clip.sampleBuffer = audioBuffer;
  clip.sampleName = file.name;
}

// ======================================================
//  PIANO ROLL PREVIEW PLAYBACK
// ======================================================

window.stopPianoRollPreview = function stopPianoRollPreview() {
  // Clear any pending restart
  if (pianoRollPreviewState.restartTimeout) {
    clearTimeout(pianoRollPreviewState.restartTimeout);
    pianoRollPreviewState.restartTimeout = null;
  }
  
  // Stop all playing voices immediately
  pianoRollPreviewState.voices.forEach(({ source }) => {
    try {
      source.stop();
    } catch (e) {
      // Already stopped
    }
  });
  
  pianoRollPreviewState.voices = [];
  pianoRollPreviewState.scheduledNotes.clear();
  pianoRollPreviewState.isPlaying = false;
  
  // Stop animation frame
  if (pianoRollPreviewState.rafId) {
    cancelAnimationFrame(pianoRollPreviewState.rafId);
    pianoRollPreviewState.rafId = null;
  }
  
  // Hide playhead
  if (pianoRollPreviewState.playheadEl) {
    pianoRollPreviewState.playheadEl.style.display = 'none';
  }
  
  // Update button states
  const playBtn = document.getElementById("piano-roll-preview-play");
  const stopBtn = document.getElementById("piano-roll-preview-stop");
  if (playBtn) playBtn.style.opacity = '1';
  if (stopBtn) stopBtn.style.opacity = '0.5';
}

async function playPianoRollPreview() {
  // Set isPlaying to true immediately
  pianoRollPreviewState.isPlaying = true;
  pianoRollPreviewState.scheduledNotes.clear();
  
  // Capture the active clip reference at the start to prevent issues if it changes during async operations
  const clipToPlay = activeClip;
  
  if (!clipToPlay || !clipToPlay.notes || clipToPlay.notes.length === 0) {
    pianoRollPreviewState.isPlaying = false;
    return;
  }
  
  // Stop main song playback if playing
  if (window.isPlaying && window.stopAll) {
    window.stopAll();
    if (window.stopPlayhead) window.stopPlayhead();
    
    const playToggleBtn = document.getElementById("playToggleBtn");
    if (playToggleBtn) {
      playToggleBtn.textContent = "Play";
      playToggleBtn.classList.remove("active");
    }
    
    const playhead = document.getElementById("playhead");
    if (playhead) playhead.classList.add("hidden");
  }
  
  // Stop any existing playback (but keep isPlaying true)
  const voices = pianoRollPreviewState.voices.slice();
  voices.forEach(({ source }) => {
    try {
      source.stop();
    } catch (e) {
      // Already stopped
    }
  });
  pianoRollPreviewState.voices = [];
  
  if (pianoRollPreviewState.rafId) {
    cancelAnimationFrame(pianoRollPreviewState.rafId);
    pianoRollPreviewState.rafId = null;
  }
  
  // Ensure audio context is running
  if (!window.audioContext) {
    console.error("Audio context not initialized");
    pianoRollPreviewState.isPlaying = false;
    return;
  }
  
  if (window.audioContext.state === "suspended") {
    await window.audioContext.resume();
  }
  
  const now = window.audioContext.currentTime;
  pianoRollPreviewState.startTime = now;
  
  // Use the clip's sample buffer or default MIDI sample
  const sampleBuffer = clipToPlay.sampleBuffer || window.defaultMidiSampleBuffer;
  if (!sampleBuffer) {
    console.warn("No MIDI sample buffer loaded");
    pianoRollPreviewState.isPlaying = false;
    return;
  }
  
  // Make sure we have notes to play
  if (!clipToPlay.notes || !Array.isArray(clipToPlay.notes) || clipToPlay.notes.length === 0) {
    console.warn("No notes to play");
    pianoRollPreviewState.isPlaying = false;
    return;
  }
  
  // Convert notes from ticks to seconds
  const beatsPerBar = 4;
  const bpm = 175; // Use project BPM
  const secondsPerBeat = 60 / bpm;
  
  // Schedule all notes with error handling
  try {
    clipToPlay.notes.forEach(note => {
      // Validate note has all required properties and they are finite numbers
      if (!note || 
          typeof note.pitch !== 'number' || !isFinite(note.pitch) ||
          typeof note.start !== 'number' || !isFinite(note.start) ||
          typeof note.end !== 'number' || !isFinite(note.end)) {
        console.warn("Skipping invalid note:", note);
        return;
      }
      
      const startBeats = note.start;
      const endBeats   = note.end;

      const { t, effectiveDuration } =
        computeScheduleTimes(startBeats, endBeats, secondsPerBeat, now);

      if (effectiveDuration <= 0.001) return;

      const source = window.audioContext.createBufferSource();
      source.buffer = sampleBuffer;

      const semitone = note.pitch - 60;
      const playbackRate = Math.pow(2, semitone / 12);
      if (!isFinite(playbackRate)) return;
      source.playbackRate.value = playbackRate;

      const gain = window.audioContext.createGain();
      const velocity = note.velocity || 0.8;

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(velocity * 0.6, t + ATTACK_SEC);
      gain.gain.setValueAtTime(velocity * 0.6, t + effectiveDuration);
      gain.gain.linearRampToValueAtTime(0.0001, t + effectiveDuration + RELEASE_SEC);

      source.connect(gain);
      gain.connect(window.masterGain || window.audioContext.destination);

      source.start(t);
      source.stop(t + effectiveDuration + RELEASE_SEC);

      pianoRollPreviewState.voices.push({ source, gain });
      pianoRollPreviewState.scheduledNotes.add(note);
    });
  } catch (error) {
    console.error("Error scheduling piano roll preview notes:", error);
    pianoRollPreviewState.isPlaying = false;
    // Re-render to ensure UI is in sync
    if (activeClip) {
      renderPianoRoll();
    }
    return;
  }
  
  // Create or update playhead
  if (!pianoRollPreviewState.playheadEl) {
    const playhead = document.createElement('div');
    playhead.id = 'piano-roll-playhead';
    playhead.style.position = 'absolute';
    playhead.style.left = '0';
    playhead.style.top = '0';
    playhead.style.width = '2px';
    playhead.style.height = gridCanvas.height + 'px';
    playhead.style.backgroundColor = '#007aff';
    playhead.style.pointerEvents = 'none';
    playhead.style.zIndex = '1000';
    playhead.style.display = 'block';
    
    const scrollContainer = document.getElementById('piano-roll-scroll');
    if (scrollContainer) {
      scrollContainer.appendChild(playhead);
      pianoRollPreviewState.playheadEl = playhead;
    }
  } else {
    pianoRollPreviewState.playheadEl.style.display = 'block';
    pianoRollPreviewState.playheadEl.style.left = '0';
    pianoRollPreviewState.playheadEl.style.height = gridCanvas.height + 'px';
  }
  
  // Update button states
  const playBtn = document.getElementById("piano-roll-preview-play");
  const stopBtn = document.getElementById("piano-roll-preview-stop");
  if (playBtn) playBtn.style.opacity = '0.5';
  if (stopBtn) stopBtn.style.opacity = '1';
  
  // Start playhead animation
  updatePianoRollPlayhead();
}

function updatePianoRollPlayhead() {
  if (!pianoRollPreviewState.isPlaying) return;
  
  const elapsed = window.audioContext.currentTime - pianoRollPreviewState.startTime;
  
  // Calculate clip duration in seconds
  const beatsPerBar = 4;
  const bpm = 175;
  const secondsPerBeat = 60 / bpm;
  const clipDurationBeats = activeClip.bars * beatsPerBar;
  const clipDuration = clipDurationBeats * secondsPerBeat;
  
  if (elapsed >= clipDuration) {
    stopPianoRollPreview();
    return;
  }
  
  // Update playhead position
  if (pianoRollPreviewState.playheadEl) {
    const elapsedBeats = elapsed / secondsPerBeat;
    const x = elapsedBeats * pxPerBeat;
    pianoRollPreviewState.playheadEl.style.left = x + 'px';
  }
  
  pianoRollPreviewState.rafId = requestAnimationFrame(updatePianoRollPlayhead);
}