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


window.initTimeline = function () {
  const tracksEl = document.getElementById("tracks");

  for (let i = 0; i < 16; i++) {
    const track = document.createElement("div");
    track.className = "track";
    track.dataset.index = i;
    const color = window.TRACK_COLORS[i % 10];

    track.style.setProperty("--track-color", color);


    /* -------------------------------------------------------
       LEFT CONTROL STRIP
    ------------------------------------------------------- */
    const controls = document.createElement("div");
    controls.className = "track-controls";

    const label = document.createElement("div");
    label.className = "track-label";
    label.textContent = "Track " + (i + 1);

    // Horizontal knob row
    const knobRow = document.createElement("div");
    knobRow.className = "knob-row";

    // Volume knob + label
    const volWrap = document.createElement("div");
    volWrap.className = "knob-wrap";

    const vol = document.createElement("div");
    vol.className = "knob volume-knob";
    vol.dataset.value = 0.8;

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
    pan.dataset.value = 0.5;

    const panLabel = document.createElement("div");
    panLabel.className = "knob-label";
    panLabel.textContent = "PAN";

    panWrap.appendChild(pan);
    panWrap.appendChild(panLabel);

    knobRow.appendChild(volWrap);
    knobRow.appendChild(panWrap);

    controls.appendChild(label);
    controls.appendChild(knobRow);

    // Create meter
    const meter = document.createElement("div");
    meter.className = "track-meter";

    const meterFill = document.createElement("div");
    meterFill.className = "track-meter-fill";
    meter.appendChild(meterFill);

    // Add meter to the knob row (NOT controls)
    knobRow.appendChild(meter);


    /* -------------------------------------------------------
      CLIP AREA
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

    let playhead = document.getElementById("playhead");
    if (!playhead) {
      playhead = document.createElement("div");
      playhead.id = "playhead";
      playhead.classList.add("hidden");
      document.getElementById("timeline").appendChild(playhead);
    }


drop.addEventListener("drop", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  const rect = drop.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const startBar = Math.floor(x / window.PIXELS_PER_BAR);
  const trackIndex = i;

  // CASE 0: Dropping local audio files
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {

    for (const file of e.dataTransfer.files) {
      if (!file.type.startsWith("audio/")) continue;

      const arrayBuffer = await file.arrayBuffer();
      await window.audioContext.resume();
      const audioBuffer = await window.audioContext.decodeAudioData(arrayBuffer);
      const normalizedBuffer = normalizeBuffer(audioBuffer);

      const meta = window.parseLoopMetadata(file.name);

      // 1. Detect LOOP BPM (never use project BPM here)
      const loopBpm = meta.bpm || 175; // or your default loop BPM

      // 2. REAL duration from buffer
      const durationSeconds = normalizedBuffer.duration;

      // 3. REAL bars at LOOP BPM (correct)
      const bars = (durationSeconds * loopBpm) / 240;


    const clip = {
      id: crypto.randomUUID(),
      type: "audio",          // ⭐ REQUIRED
      loopId: null,
      fileName: meta.displayName || file.name,
      audioBuffer: normalizedBuffer,
      trackIndex,
      startBar,
      bars,
      bpm: loopBpm,
      originalBars: bars,
      startOffset: 0,
      durationSeconds,
    };




      window.clips.push(clip);
      resolveClipCollisions(clip);
    }

    drop.innerHTML = "";
    window.clips
      .filter(c => c.trackIndex === trackIndex)
      .forEach(c => window.renderClip(c, drop));

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
      const clip = new MidiClip(startBar, loop.bars);
      clip.trackIndex = trackIndex;
      clip.notes = JSON.parse(JSON.stringify(loop.notes));

      window.clips.push(clip);
      resolveClipCollisions(clip);

      drop.innerHTML = "";
      window.clips
        .filter(c => c.trackIndex === trackIndex)
        .forEach(c => window.renderClip(c, drop));

      return;
    }

    // DROPBOX MIDI (lazy-loaded)
    if (loop.url) {
      // Load + parse MIDI on demand
      loadMidiFromDropbox(loop.url, loop.displayName).then(clip => {
        if (!clip) return;

        clip.startBar = startBar;
        clip.trackIndex = trackIndex;

        window.clips.push(clip);
        resolveClipCollisions(clip);

        drop.innerHTML = "";
        window.clips
          .filter(c => c.trackIndex === trackIndex)
          .forEach(c => window.renderClip(c, drop));
      });

      return;
    }
  }





      /* -------------------------
        CASE 1B: AUDIO CLIP
      ------------------------- */
      if (loop.type === "audio") {
        await window.loadLoop(loop.id, loop.url, loop.bpm);
        const loopData = window.loopBuffers.get(loop.id);

        const bars = loopData ? loopData.bars : 1;
        const durationSeconds = loopData.buffer.duration;

        const clip = {
          id: crypto.randomUUID(),
          type: "audio",
          loopId: loop.id,
          audioBuffer: null,
          trackIndex,
          startBar,
          bars,
          bpm: loop.bpm,
          fileName: loop.displayName || loop.id,
          startOffset: 0,
          durationSeconds,
          originalBars: bars
        };

        window.clips.push(clip);
        resolveClipCollisions(clip);

        drop.innerHTML = "";
        window.clips
          .filter(c => c.trackIndex === trackIndex)
          .forEach(c => window.renderClip(c, drop));

        return;
      }
    }


/* CASE 2: Moving or duplicating an existing clip */
if (window.draggedClipId) {
  const original = window.clips.find((c) => c.id === window.draggedClipId);
  if (original) {
    if (window.isDuplicateDrag) {
      const newClip = {
        ...original,
        id: crypto.randomUUID(),
        trackIndex,
        startBar
      };
      window.clips.push(newClip);
      resolveClipCollisions(newClip);
    } else {
      original.trackIndex = trackIndex;
      original.startBar = startBar;
      resolveClipCollisions(original);
    }
  }
}


  // Re-render this track
  drop.innerHTML = "";
  window.clips
    .filter((c) => c.trackIndex === trackIndex)
    .forEach((c) => window.renderClip(c, drop));

  // Reset drag state
  window.draggedLoop = null;
  window.draggedClipId = null;
  window.isDuplicateDrag = false;
});


    /* Add drop area after grid */
    inner.appendChild(drop);


    /* -------------------------------------------------------
       BUILD TRACK
    ------------------------------------------------------- */
    track.appendChild(controls);
    track.appendChild(inner);
    tracksEl.appendChild(track);
  }

/* -------------------------------------------------------
   GRID RENDERING (per track)
------------------------------------------------------- */
function renderGrid() {
  const grids = document.querySelectorAll(".track-grid");
  if (!grids.length) return;

  const totalBars = 64;
  const beatsPerBar = 4;

  grids.forEach(grid => {
    grid.innerHTML = "";

    const totalWidth = totalBars * window.PIXELS_PER_BAR;
    grid.style.width = totalWidth + "px";


    // Height of one track lane
    const trackHeight = grid.parentElement.offsetHeight;

    // Vertical bars + beats
    for (let i = 0; i < totalBars; i++) {
      const bar = document.createElement("div");
      bar.className = "grid-bar";
      bar.style.left = (i * window.PIXELS_PER_BAR) + "px";
      grid.appendChild(bar);

      for (let b = 1; b < beatsPerBar; b++) {
        const beat = document.createElement("div");
        beat.className = "grid-beat";
        beat.style.left =
          (i * window.PIXELS_PER_BAR) +
          (b * (window.PIXELS_PER_BAR / beatsPerBar)) +
          "px";
        grid.appendChild(beat);
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
}

renderGrid();
window.renderTimelineBar(64);
};

/* -------------------------------------------------------
   CLIP RENDERING (supports local files + library loops)
------------------------------------------------------- */
window.renderClip = function (clip, dropArea) {
  console.log("RENDER CLIP:", clip);

  const el = document.createElement("div");
  el.className = "clip";
  el.dataset.clipId = clip.id;

  // Compute width fresh every render
  const width = clip.bars * window.PIXELS_PER_BAR;
  el.style.left = (clip.startBar * window.PIXELS_PER_BAR) + "px";
  el.style.width = width + "px";

  /* -------------------------------------------------------
     RIGHT-CLICK DELETE
  ------------------------------------------------------- */
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    window.clips = window.clips.filter((c) => c.id !== clip.id);

    dropArea.innerHTML = "";
    window.clips
      .filter((c) => c.trackIndex === clip.trackIndex)
      .forEach((c) => window.renderClip(c, dropArea));
  });

/* -------------------------------------------------------
   RESIZE HANDLE (right-edge trim) — snap to whole bars
   + glow + bar ruler preview
------------------------------------------------------- */
const handle = document.createElement("div");
handle.className = "resize-handle";
el.appendChild(handle);

handle.addEventListener("mousedown", (e) => {
  e.stopPropagation();
  e.preventDefault();

  const startX = e.clientX;

  // Clean integer starting point for snapping
  const startBarsInt = Math.max(1, Math.round(clip.bars));

  /* -------------------------------------------------------
     PREVIEW OVERLAY (glow + bar ruler)
  ------------------------------------------------------- */
  const preview = document.createElement("div");
  preview.className = "clip-resize-preview";

  const glow = document.createElement("div");
  glow.className = "glow";
  preview.appendChild(glow);

  el.appendChild(preview);

  function move(ev) {
    const deltaPx = ev.clientX - startX;
    const deltaBarsRaw = deltaPx / window.PIXELS_PER_BAR;

    // Snap delta to whole bars
    const snappedDeltaBars = Math.round(deltaBarsRaw);

    // New bar length
    let newBars = Math.max(1, startBarsInt + snappedDeltaBars);
    clip.bars = newBars;

    // Update clip width
    const newWidth = newBars * window.PIXELS_PER_BAR;
    el.style.width = newWidth + "px";

    /* -------------------------------------------------------
       Update preview overlay
    ------------------------------------------------------- */

    // Set preview width
    preview.style.width = newWidth + "px";

    // Rebuild bar ruler
    preview.innerHTML = ""; // clear
    preview.appendChild(glow); // keep glow on top

    for (let i = 0; i < newBars; i++) {
      const bar = document.createElement("div");
      bar.className = "bar";
      preview.appendChild(bar);
    }
  }

  function up() {
    preview.remove();

    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);

    resolveClipCollisions(clip);

    // Re-render track
    dropArea.innerHTML = "";
    window.clips
      .filter(c => c.trackIndex === clip.trackIndex)
      .forEach(c => window.renderClip(c, dropArea));
  }

  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
});


el.addEventListener("dblclick", () => {
  if (clip.type === "midi") {
    window.openPianoRoll(clip);
  }
});

// ⭐ Open piano roll on double‑click
el.addEventListener("dblclick", () => {
  if (clip.type === "midi") {
    openPianoRoll(clip);
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


  


  el.appendChild(midiCanvas);
}






  /* -------------------------------------------------------
     LABEL
     - Local file: show filename
     - Loop: show loopId
  ------------------------------------------------------- */
  const label = document.createElement("div");
  label.style.position = "absolute";
  label.style.top = "2px";
  label.style.left = "4px";
  label.style.fontSize = "10px";
  label.style.color = "#fff";
  label.style.pointerEvents = "none";


  if (clip.audioBuffer) {
    label.textContent = clip.fileName || "Audio File";
  } else {
    label.textContent = clip.loopId || "Clip";
  }

  el.appendChild(label);

/* -------------------------------------------------------
   DRAGGABLE CLIP (child-safe)
------------------------------------------------------- */
el.draggable = true;

el.addEventListener("dragstart", (e) => {
  // ensure drag always originates from the clip container
  if (e.target !== el) {
    e.stopPropagation();
  }

  window.isDuplicateDrag = window.shiftDown;
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
};


/* -------------------------------------------------------
   KNOB INTERACTION (reduced sensitivity)
------------------------------------------------------- */
document.addEventListener("mousedown", (e) => {
  if (!e.target.classList.contains("knob")) return;

  const knob = e.target;
  const rect = knob.getBoundingClientRect();
  const centerY = rect.top + rect.height / 2;

  function move(ev) {
    const dy = centerY - ev.clientY;
    let v = parseFloat(knob.dataset.value) + dy * 0.0007; // smoother
    v = Math.max(0, Math.min(1, v));
    knob.dataset.value = v;
    knob.style.setProperty("--val", v);
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
  const newStart = newClip.startBar;
  const newEnd = newClip.startBar + newClip.bars;

  for (const clip of window.clips) {
    if (clip.id === newClip.id) continue;
    if (clip.trackIndex !== newClip.trackIndex) continue;

    const clipStart = clip.startBar;
    const clipEnd = clip.startBar + clip.bars;

    // Skip trimming MIDI clips
    if (clip.type === "midi") continue;

    // Only care if existing clip starts before new clip and overlaps its start
    if (clipStart < newStart && clipEnd > newStart) {
      const newLengthBars = newStart - clipStart;
      clip.bars = Math.max(1, newLengthBars);

      // Update durationSeconds to match new bar length
      const barDuration = window.barsToSeconds(1);
      clip.durationSeconds = clip.bars * barDuration;
    }
  }
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


