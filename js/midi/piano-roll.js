// ======================================================
//  PIANO ROLL — FULL DAW-STYLE IMPLEMENTATION
// ======================================================

let canvas, ctx;
let activeClip = null;



const loadSampleBtn = document.getElementById("piano-roll-load-sample");
const sampleName    = document.getElementById("piano-roll-sample-name");

const pitchMin = 12; // C1
const pitchMax = 96; // C8
const pitchRange = pitchMax - pitchMin;

const pxPerBeat = 100;
const snap = 0.25; // quarter-beat snapping
const pianoWidth = 60; // width of vertical piano



// ======================================================
//  INITIALIZATION
// ======================================================

window.initPianoRoll = function () {



  // ⭐ Two canvases now
  gridCanvas = document.getElementById("piano-roll-canvas");
  gridCtx = gridCanvas.getContext("2d");

  pianoCanvas = document.getElementById("piano-roll-piano-canvas");
  pianoCtx = pianoCanvas.getContext("2d");

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


  // Reverb slider
  reverbSlider.addEventListener("input", () => {
    if (!activeClip) return;
    activeClip.reverbGain.gain.value = Number(reverbSlider.value);
  });

  // Transpose buttons
  document.addEventListener("click", e => {
    if (!e.target.classList.contains("transpose-btn")) return;
    if (!activeClip) return;

    const step = Number(e.target.dataset.step);

    activeClip.notes.forEach(n => {
      n.pitch += step;
    });

    renderPianoRoll();
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

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
};


window.openPianoRoll = function (clip) {
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

  const rowHeight = 16;

  // ⭐ Resize piano canvas (fixed)
  pianoCanvas.width = pianoWidth; // e.g. 60px
  pianoCanvas.height = pitchRange * rowHeight;

  // ⭐ Resize grid canvas (scrollable)
  const pxPerBar = pxPerBeat * 4;
  const endBars = getClipEndInBars(activeClip);
  const totalBars = endBars + 4;

  gridCanvas.width = totalBars * pxPerBar;
  gridCanvas.height = pitchRange * rowHeight;

  renderPianoRoll();
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
}


// ======================================================
//  DRAW: PIANO KEYBOARD
// ======================================================

function drawPiano(ctx) {
  const rowHeight = 16;
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

    if (!isBlack) {
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
  const rowHeight = 16;
  const styles = getComputedStyle(document.documentElement);

  const bgDark     = styles.getPropertyValue('--bg-panel');
  const bgLight    = styles.getPropertyValue('--bg-track-even');
  const lineRegular = styles.getPropertyValue('--border-dark');
  const lineOctave  = styles.getPropertyValue('--border-light');
  const beatLine    = styles.getPropertyValue('--accent-beat');

  // Background shading (black/white keys)
  for (let i = 0; i < pitchRange; i++) {
    const pitch = pitchMax - i;
    const y = i * rowHeight;

    const isBlack = [1,3,6,8,10].includes(pitch % 12);

    ctx.fillStyle = isBlack ? bgDark : bgLight;
    ctx.fillRect(0, y, gridCanvas.width, rowHeight);
  }

  // Vertical beat lines
  const totalBeats = Math.ceil(gridCanvas.width / pxPerBeat);

  for (let b = 0; b <= totalBeats; b++) {
    const x = b * pxPerBeat;

    ctx.strokeStyle = beatLine;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, gridCanvas.height);
    ctx.stroke();
  }

  // Vertical 1/4-beat subdivision lines
  const quarterPx = pxPerBeat / 4;
  const totalQuarters = Math.ceil(gridCanvas.width / quarterPx);

  ctx.strokeStyle = lineRegular;
  ctx.lineWidth = 1;

  for (let q = 0; q <= totalQuarters; q++) {
    if (q % 4 === 0) continue;

    const x = q * quarterPx;

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, gridCanvas.height);
    ctx.stroke();
  }

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
}

function drawNotes(ctx) {
  const rowHeight = 16;
  const radius = 4;
  const trackColor = window.TRACK_COLORS[activeClip.trackIndex % 10];

  activeClip.notes.forEach(note => {
    const y = (pitchMax - note.pitch) * rowHeight;
    const x = note.start * pxPerBeat;               // ⭐ no pianoWidth offset now
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

    // Hover glow
    if (hoverNote === note) {
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      roundRect(ctx, x - 1, y - 1, w + 2, h + 2, radius + 1);
      ctx.stroke();
    }

    // Resize handle
    if (hoverNote === note) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(x + w - 5, y + 3, 4, h - 6);
    }
  });
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


// ======================================================
//  MOUSE HANDLERS
// ======================================================

function onMouseDown(e) {
  if (!activeClip) return;

const scroll = document.getElementById("piano-roll-scroll");
const rect = scroll.getBoundingClientRect();   // ⭐ correct origin


  // Convert mouse position → grid coordinates
  const x = e.clientX - rect.left + scroll.scrollLeft;
  const y = e.clientY - rect.top  + scroll.scrollTop;

  const rowHeight = 16;

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
  // RIGHT CLICK → DELETE
  // ---------------------------------------------
  if (e.button === 2) {
    const idx = activeClip.notes.findIndex(n =>
      pitch === n.pitch &&
      rawBeat >= n.start &&
      rawBeat <= n.end
    );

    if (idx !== -1) {
      activeClip.notes.splice(idx, 1);
      renderPianoRoll();
      updateClipPreview();
      refreshClipInTimeline(activeClip);
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
  // RESIZE HANDLE
  // ---------------------------------------------
  if (clicked && clicked.onRightEdge) {
    resizingNote = clicked.note;
    resizeStartX = x;
    originalEnd = clicked.note.end;
    return;
  }

  // ---------------------------------------------
  // MOVE EXISTING NOTE
  // ---------------------------------------------
  if (clicked && !clicked.onRightEdge) {
    movingNote = clicked.note;
    moveStartX = x;
    moveStartBeat = clicked.note.start;
    moveStartPitch = clicked.note.pitch;
    return;
  }

  // ---------------------------------------------
  // DRAW NEW NOTE
  // ---------------------------------------------
  drawingStartBeat = beat;

  const newNote = {
    pitch,
    start: beat,
    end: beat + snap,
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
  const rect = scroll.getBoundingClientRect();   // ⭐ correct origin


  // Convert mouse → grid coordinates
  const x = e.clientX - rect.left + scroll.scrollLeft;
  const y = e.clientY - rect.top  + scroll.scrollTop;

  // ---------------------------------------------
  // 1. RESIZING EXISTING NOTE
  // ---------------------------------------------
  if (resizingNote) {
    const deltaBeats = (x - resizeStartX) / pxPerBeat;
    const snapped = Math.round(deltaBeats / snap) * snap;

    resizingNote.end = Math.max(
      resizingNote.start + snap,
      originalEnd + snapped
    );

    extendClipIfNeeded(resizingNote.end);
    resizeCanvas();
    renderPianoRoll();
    updateClipPreview();
    return;
  }

  // ...rest of your logic...



  // ---------------------------------------------
  // 2. MOVING EXISTING NOTE
  // ---------------------------------------------
  if (movingNote) {
    const deltaBeats = (x - moveStartX) / pxPerBeat;
    const snapped = Math.round(deltaBeats / snap) * snap;

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
    const rowHeight = 16;
    const newPitch = pitchMax - Math.floor(y / rowHeight);

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
        movingNote.pitch = newPitch;
      }
    }
    extendClipIfNeeded(movingNote.end);

    updateClipPreview();
    refreshClipInTimeline(activeClip);
    renderPianoRoll();
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
  renderPianoRoll();
  return;
}


// ---------------------------------------------
// 4. HOVER DETECTION
// ---------------------------------------------
const hit = findNoteAt(x, y);
let needsRedraw = false;

if (hit) {
  gridCanvas.style.cursor = hit.onRightEdge ? "ew-resize" : "pointer";

  if (hoverNote !== hit.note) {
    hoverNote = hit.note;
    needsRedraw = true;
  }
} else {
  if (hoverNote !== null) {
    hoverNote = null;
    needsRedraw = true;
  }
  gridCanvas.style.cursor = "default";
}

if (needsRedraw) renderPianoRoll();
}


function onMouseUp() {
  if (drawingNote) {
    updateClipPreview();
    resizeCanvas();
    renderPianoRoll();
  }

  drawingNote = null;
  resizingNote = null;
  movingNote = null;
}


// ======================================================
//  NOTE HIT TEST
// ======================================================

function findNoteAt(x, y) {
  const rowHeight = 16;

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
    renderPianoRoll();
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

const reverbSlider = document.getElementById("piano-roll-reverb");

async function loadSampleIntoClip(clip, file) {
  if (!window.audioCtx) {
    window.audioCtx = new AudioContext();
  }

  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await window.audioCtx.decodeAudioData(arrayBuffer);

  clip.sampleBuffer = audioBuffer;
  clip.sampleName = file.name;
}
