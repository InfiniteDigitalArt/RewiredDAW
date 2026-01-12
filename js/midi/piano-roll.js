// piano-roll.js

let canvas, ctx;
let activeClip = null;

window.initPianoRoll = function () {
  canvas = document.getElementById("piano-roll-canvas");
  ctx = canvas.getContext("2d");

  canvas.addEventListener("mousedown", onMouseDown);
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
};

window.openPianoRoll = function (clip) {
  activeClip = clip;

  const container = document.getElementById("piano-roll-container");
  container.classList.remove("hidden");

  renderPianoRoll();
};

function resizeCanvas() {
  if (!canvas) return;
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  renderPianoRoll();
}

function renderPianoRoll() {
  if (!activeClip || !ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawGrid();
  drawNotes();
}

function drawGrid() {
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;

  const rows = 48; // 4 octaves
  const rowHeight = canvas.height / rows;

  for (let i = 0; i < rows; i++) {
    const y = i * rowHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawNotes() {
  const rows = 48;
  const rowHeight = canvas.height / rows;

  activeClip.notes.forEach(note => {
    const pitchOffset = 84 - note.pitch; // maps pitch to row
    const y = pitchOffset * rowHeight;

    const x = note.start * 100; // 100px per beat (adjust later)
    const w = (note.end - note.start) * 100;
    const h = rowHeight - 2;

    ctx.fillStyle = "#4af";
    ctx.fillRect(x, y, w, h);
  });
}

function onMouseDown(e) {
  if (!activeClip) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const beat = x / 100;
  const rows = 48;
  const rowHeight = canvas.height / rows;
  const pitch = 84 - Math.floor(y / rowHeight);

  activeClip.addNote(pitch, beat, beat + 1);
  renderPianoRoll();
}
