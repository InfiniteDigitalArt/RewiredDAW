// ======================================================
//  PIANO ROLL — FULL DAW-STYLE IMPLEMENTATION
// ======================================================

let canvas, ctx;
let activeClip = null;
let hoverNote = null;

const loadSampleBtn = document.getElementById("piano-roll-load-sample");
const sampleName    = document.getElementById("piano-roll-sample-name");

const pitchMin = 12; // C1
const pitchMax = 96; // C8
const pitchRange = pitchMax - pitchMin;

const pxPerBeat = 100;
const snap = 0.25; // quarter-beat snapping
const pianoWidth = 60; // width of vertical piano

let drawingNote = null;
let drawingStartBeat = 0;

let resizingNote = null;
let resizeStartX = 0;
let originalEnd = 0;

// ======================================================
//  INITIALIZATION
// ======================================================

window.initPianoRoll = function () {
  canvas = document.getElementById("piano-roll-canvas");
  ctx = canvas.getContext("2d");

  reverbSlider.addEventListener("input", () => {
    if (!activeClip) return;
    activeClip.reverbGain.gain.value = Number(reverbSlider.value);
  });
  
document.addEventListener("click", e => {
  if (!e.target.classList.contains("transpose-btn")) return;
  if (!activeClip) return;

  const step = Number(e.target.dataset.step);

  // Transpose all notes in the active clip
  activeClip.notes.forEach(n => {
    n.pitch += step;
  });

  // Re-render piano roll
  renderPianoRoll();
});


  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mouseleave", onMouseUp);
  canvas.addEventListener("contextmenu", e => e.preventDefault());

  // Drag-and-drop MIDI import
  canvas.addEventListener("dragover", e => {
    e.preventDefault();
    canvas.style.backgroundColor = "rgba(255,255,255,0.05)";
  });

  canvas.addEventListener("dragleave", () => {
    canvas.style.backgroundColor = "";
  });

  canvas.addEventListener("drop", e => {
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
    if (!clip.notes.length) return 4; // default minimum

    let maxEndBeat = 0;

    for (const n of clip.notes) {
      if (n.end > maxEndBeat) maxEndBeat = n.end;
    }

    return maxEndBeat / 4; // convert beats → bars
  }


  if (!canvas || !activeClip) return;

  const container = document.getElementById("piano-roll-container");
  if (container.classList.contains("hidden")) return;

  const rowHeight = 16;
  canvas.height = pitchRange * rowHeight;

  const pxPerBar = pxPerBeat * 4;

  const endBars = getClipEndInBars(activeClip);
  const totalBars = endBars + 4;   // ⭐ always 4 bars extra

  canvas.width = totalBars * pxPerBar;


  renderPianoRoll();
}


function resizePianoRollCanvas() {
  const canvas = document.getElementById("piano-roll-canvas");
  const scroll = document.getElementById("piano-roll-scroll");

  canvas.width = scroll.clientWidth * 4;   // enough horizontal room for notes
  canvas.height = scroll.clientHeight;     // match visible height
}


function renderPianoRoll() {
  if (!activeClip || !ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawPiano();
  drawGrid();
  drawNotes();
}

// ======================================================
//  DRAW: PIANO KEYBOARD
// ======================================================

function drawPiano() {
  const rowHeight = 16;
  const styles = getComputedStyle(document.documentElement);

  const blackKey = styles.getPropertyValue('--bg-track-odd');   // dark theme black keys
  const whiteKey = '#ffffff';                                   // true white

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

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pianoWidth, 0);
  ctx.lineTo(pianoWidth, canvas.height);
  ctx.stroke();
}



function midiToNoteName(pitch) {
  const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const name = names[pitch % 12];
  const octave = Math.floor(pitch / 12);
  return name + octave;
}

// ======================================================
//  DRAW: GRID
// ======================================================

function drawGrid() {
  const rowHeight = 16;
  const styles = getComputedStyle(document.documentElement);

  const bgDark = styles.getPropertyValue('--bg-panel');
  const bgLight = styles.getPropertyValue('--bg-track-even');
  const lineRegular = styles.getPropertyValue('--border-dark');
  const lineOctave  = styles.getPropertyValue('--border-light');
  const beatLine    = styles.getPropertyValue('--accent-beat');

  // Background shading (black/white keys)
  for (let i = 0; i < pitchRange; i++) {
    const pitch = pitchMax - i;
    const y = i * rowHeight;

    const isBlack = [1,3,6,8,10].includes(pitch % 12);
    ctx.fillStyle = isBlack ? bgDark : bgLight;
    ctx.fillRect(pianoWidth, y, canvas.width - pianoWidth, rowHeight);
  }

  // Horizontal pitch lines
  for (let i = 0; i <= pitchRange; i++) {
    const y = i * rowHeight;
    const pitch = pitchMax - i;
    const isOctave = pitch % 12 === 0;

    ctx.strokeStyle = isOctave ? lineOctave : lineRegular;
    ctx.lineWidth = isOctave ? 2 : 1;

    ctx.beginPath();
    ctx.moveTo(pianoWidth, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Vertical beat lines
  const totalBeats = Math.ceil((canvas.width - pianoWidth) / pxPerBeat);
  for (let b = 0; b <= totalBeats; b++) {
    const x = pianoWidth + b * pxPerBeat;

    ctx.strokeStyle = beatLine;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
}

// ======================================================
//  DRAW: NOTES (rounded, coloured, hover-aware)
// ======================================================

function drawNotes() {
  const rowHeight = 16;
  const radius = 4; // rounded corner radius
  const trackColor = window.TRACK_COLORS[activeClip.trackIndex % 10];

  activeClip.notes.forEach(note => {
    const y = (pitchMax - note.pitch) * rowHeight;
    const x = pianoWidth + note.start * pxPerBeat;
    const w = (note.end - note.start) * pxPerBeat;
    const h = rowHeight - 2;

    // ---------------------------------------------
    // Rounded rectangle helper
    // ---------------------------------------------
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

    // ---------------------------------------------
    // Base note fill (track colour)
    // ---------------------------------------------
    ctx.fillStyle = trackColor;
    roundRect(ctx, x, y, w, h, radius);
    ctx.fill();

    // ---------------------------------------------
    // Soft highlight on top
    // ---------------------------------------------
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    roundRect(ctx, x, y, w, h * 0.4, radius);
    ctx.fill();

    // ---------------------------------------------
    // Border
    // ---------------------------------------------
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, radius);
    ctx.stroke();

    // ---------------------------------------------
    // Hover glow (if this is the hovered note)
    // ---------------------------------------------
    if (hoverNote === note) {
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      roundRect(ctx, x - 1, y - 1, w + 2, h + 2, radius + 1);
      ctx.stroke();
    }

    // ---------------------------------------------
    // Resize handle (only on hover)
    // ---------------------------------------------
    if (hoverNote === note) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(x + w - 5, y + 3, 4, h - 6);
    }
  });
}

// ======================================================
//  MOUSE HANDLERS
// ======================================================

function onMouseDown(e) {
  if (!activeClip) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const rawBeat = (x - pianoWidth) / pxPerBeat;
  const beat = Math.floor(rawBeat / snap) * snap;

  const rowHeight = 16;


  const pitch = pitchMax - Math.floor(y / rowHeight);

  // RIGHT CLICK → DELETE
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
    refreshClipInTimeline(activeClip);   // ⭐ NEW
  }

    return;
  }

  // Check resize handle
  const clicked = findNoteAt(x, y);
  if (clicked && clicked.onRightEdge) {
    resizingNote = clicked.note;
    resizeStartX = x;
    originalEnd = clicked.note.end;
    return;
  }

  // LEFT CLICK → START DRAWING NEW NOTE
  drawingStartBeat = beat;

  drawingNote = {
    pitch,
    start: beat,
    end: beat + snap,
    velocity: 0.8
  };

  activeClip.notes.push(drawingNote);
  renderPianoRoll();
}

function onMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

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

  // ---------------------------------------------
  // 2. DRAWING NEW NOTE
  // ---------------------------------------------
  if (drawingNote) {
    const rawBeat = (x - pianoWidth) / pxPerBeat;
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
  // 3. HOVER DETECTION (for styling + resize handle)
  // ---------------------------------------------
  const hit = findNoteAt(x, y);

  let needsRedraw = false;

  if (hit) {
    if (hit.onRightEdge) {
      canvas.style.cursor = "ew-resize";
    } else {
      canvas.style.cursor = "pointer";
    }

    if (hoverNote !== hit.note) {
      hoverNote = hit.note;
      needsRedraw = true;
    }
  } else {
    if (hoverNote !== null) {
      hoverNote = null;
      needsRedraw = true;
    }
    canvas.style.cursor = "default";
  }

  if (needsRedraw) {
    renderPianoRoll();
  }
}

function onMouseUp() {
  if (drawingNote) {
    updateClipPreview();
    resizeCanvas();
    renderPianoRoll();

  }
  drawingNote = null;
  resizingNote = null;
}



// ======================================================
//  NOTE HIT TEST
// ======================================================

function findNoteAt(x, y) {
  const rowHeight = 16;


  for (let note of activeClip.notes) {
    const ny = (pitchMax - note.pitch) * rowHeight;
    const nx = pianoWidth + note.start * pxPerBeat;
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
  const el = document.querySelector(`[data-clip-id="${activeClip.id}"]`);
  if (!el) return;

  const dropArea = el.parentElement;
  if (!dropArea) return;

  // ⭐ Full re-render of this track lane
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
  canvas.style.backgroundColor = "";

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

        importedNotes.push({
          pitch: n.midi,
          start: startBeats,
          end: endBeats,
          velocity: n.velocity
        });
      });
    });

    activeClip.notes = importedNotes;

    const maxEnd = Math.max(...importedNotes.map(n => n.end));
    const midiBars = Math.ceil(maxEnd / 4);

    const visibleBeats = canvas.width / pxPerBeat;
    const visibleBars = Math.ceil(visibleBeats / 4);

    activeClip.bars = Math.max(midiBars, visibleBars);

    resizeCanvas();
    renderPianoRoll();
    updateClipPreview();
    refreshClipInTimeline(activeClip);

  } catch (err) {
    console.error("MIDI import failed:", err);
  }
}

loadSampleBtn.onclick = async () => {
  if (!activeClip) return;

  const file = await pickAudioFile();
  if (!file) return;

  const arrayBuf = await file.arrayBuffer();
  const decoded = await audioContext.decodeAudioData(arrayBuf);

  activeClip.sampleBuffer = decoded;
  activeClip.sampleName = file.name;

  sampleName.textContent = file.name;
};


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
