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
  const marker = document.getElementById("seekMarker");
  marker.style.left = "106px";


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
    label.style.color = window.TRACK_COLORS[i % 10];


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

// If project is loaded, apply saved values
if (window.loadedProject && window.loadedProject.tracks[i]) {
  const savedVol = window.loadedProject.tracks[i].volume;
  const savedPan = window.loadedProject.tracks[i].pan;

  // ⭐ Update knob UI without triggering events
  vol.dataset.value = savedVol;
  pan.dataset.value = savedPan;

  updateKnobVisual(vol, savedVol);
  updateKnobVisual(pan, savedPan);
}


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

  const isFileDrop = e.dataTransfer.files && e.dataTransfer.files.length > 0;
  const isLoopDrop = !!window.draggedLoop;
  const isClipDrop = !!window.draggedClipId;

  if (!isFileDrop && !isLoopDrop && !isClipDrop) return;


  // Continue with your existing logic...


  // Continue with your existing logic
  const rect = drop.getBoundingClientRect();
  const x = e.clientX - rect.left;
  // Use snap for startBar
  const startBar = window.snapToGrid(x / window.PIXELS_PER_BAR);
  const trackIndex = i;

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
        start: n.ticks / midi.header.ppq,                     // ticks → beats (correct)
        end: (n.ticks + n.durationTicks) / midi.header.ppq    // ticks → beats (correct)
      });
    });
  });

  // Determine clip length in bars (4 beats per bar)
  const maxEnd = Math.max(...notes.map(n => n.end));
  const bars = Math.ceil(maxEnd / 4);

  // Create MIDI clip
  const clip = new MidiClip(startBar, bars);
  clip.trackIndex = trackIndex;
  clip.notes = notes;
  clip.name = file.name.replace(/\.(mid|midi)$/i, "");

  // Default sample
  clip.sampleBuffer = window.defaultMidiSampleBuffer;
  clip.sampleName = window.defaultMidiSampleName;

  window.clips.push(clip);
  resolveClipCollisions(clip);

  drop.innerHTML = "";
  window.clips
    .filter(c => c.trackIndex === trackIndex)
    .forEach(c => window.renderClip(c, drop));

  continue; // move to next file
}


    /* ----------------------------------------------------
       CASE 0B: Local audio file
    ---------------------------------------------------- */
    if (!file.type.startsWith("audio/")) continue;

    const arrayBuffer = await file.arrayBuffer();
    await window.audioContext.resume();
    const audioBuffer = await window.audioContext.decodeAudioData(arrayBuffer);
    const normalizedBuffer = normalizeBuffer(audioBuffer);

    const meta = window.parseLoopMetadata(file.name);

    const loopBpm = meta.bpm || 175;
    const durationSeconds = normalizedBuffer.duration;
    const bars = (durationSeconds * loopBpm) / 240;

    const clip = {
      id: crypto.randomUUID(),
      type: "audio",
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

  // ⭐ Per‑clip sample fields
  clip.sampleBuffer = window.defaultMidiSampleBuffer;
  clip.sampleName = window.defaultMidiSampleName;

  clip.name = generateMidiClipName();


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
  loadMidiFromDropbox(loop.url, loop.displayName).then(clip => {
    if (!clip) return;

    clip.startBar = startBar;
    clip.trackIndex = trackIndex;

    // ⭐ Per‑clip sample fields
    clip.sampleBuffer = window.defaultMidiSampleBuffer;
    clip.sampleName = window.defaultMidiSampleName;

    clip.name = generateMidiClipName();


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

  // --- Timeline bar, playhead, and seekMarker horizontal sync ---
  const timelineScroll = document.getElementById("timeline-scroll");
  const timelineBar = document.getElementById("timeline-bar");
  const playhead = document.getElementById("playhead");
  const seekMarker = document.getElementById("seekMarker");

  if (timelineScroll && timelineBar) {
    timelineScroll.addEventListener("scroll", function () {
      const scrollX = timelineScroll.scrollLeft;
      timelineBar.style.transform = `translateX(${-scrollX}px)`;
      if (seekMarker) seekMarker.style.transform = `translateX(${-scrollX}px)`;
      // Fix: playhead is inside #tracks, so must use its parent scroll
      if (playhead) playhead.style.left = (160 - scrollX) + "px";
    });
  }
};

/* -------------------------------------------------------
   CLIP RENDERING (supports local files + library loops)
------------------------------------------------------- */
window.renderClip = function (clip, dropArea) {
  console.log("RENDER CLIP:", clip);

  const el = document.createElement("div");
  el.className = "clip";
  el.dataset.clipId = clip.id;

  // --- Real-time drag/move with double-click threshold ---
  el.addEventListener("mousedown", function (e) {
    if (e.button !== 0) return; // Only left mouse
    e.preventDefault();
    e.stopPropagation();

    // Snap drag start to the nearest beat to the left of the mouse
    const trackRect = el.parentElement.getBoundingClientRect();
    const mouseX = e.clientX - trackRect.left;
    // Calculate the bar position of the mouse
    const mouseBar = mouseX / window.PIXELS_PER_BAR;
    // Snap to the nearest beat to the left
    const beatsPerBar = 4;
    const beat = Math.floor(mouseBar * beatsPerBar) / beatsPerBar;
    const startX = trackRect.left + (beat * window.PIXELS_PER_BAR);
    const origBar = clip.startBar;
    const dropAreaEl = dropArea;
    let dragClip = clip;
    let isDuplicate = false;
    let moved = false;
    let lastDx = 0;

    // If shift is held, duplicate the clip and drag the duplicate
    if (e.shiftKey) {
      dragClip = { ...clip, id: crypto.randomUUID() };
      window.clips.push(dragClip);
      isDuplicate = true;
    }

    function onMove(ev) {
      const dx = ev.clientX - startX;
      lastDx = dx;
      if (Math.abs(dx) > (window.PIXELS_PER_BAR/8)) moved = true;
      if (!moved) return;
      let newBar = origBar + dx / window.PIXELS_PER_BAR;
      newBar = window.snapToGrid(newBar);
      newBar = Math.max(0, newBar);
      dragClip.startBar = newBar;
      if (dropAreaEl) {
        dropAreaEl.innerHTML = "";
        window.clips.filter(c => c.trackIndex === dragClip.trackIndex)
          .forEach(c => window.renderClip(c, dropAreaEl));
      }
    }

    function onUp(ev) {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (moved) {
        resolveClipCollisions(dragClip);
        if (dropAreaEl) {
          dropAreaEl.innerHTML = "";
          window.clips.filter(c => c.trackIndex === dragClip.trackIndex)
            .forEach(c => window.renderClip(c, dropAreaEl));
        }
      }
      // No simulated double-click. Only native dblclick will open piano roll.
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  // Compute width fresh every render
  const width = clip.bars * window.PIXELS_PER_BAR;
  el.style.left = (clip.startBar * window.PIXELS_PER_BAR) + "px";
  el.style.width = width + "px";

/* -------------------------------------------------------
   RIGHT-CLICK DELETE
------------------------------------------------------- */
el.addEventListener("contextmenu", (e) => {
  e.preventDefault();

  const trackIndex = clip.trackIndex;

  // 1. Remove the clip from the project
  window.clips = window.clips.filter(c => c.id !== clip.id);

  // 2. Re-render the track visually
  dropArea.innerHTML = "";
  window.clips
    .filter(c => c.trackIndex === trackIndex)
    .forEach(c => window.renderClip(c, dropArea));

  // 3. Close piano roll
  document.getElementById("piano-roll-container").classList.add("hidden"); // ⭐ hide using class toggle
  activeClip = null;


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
    // Use snap for resizing
    const snappedDeltaBars = window.snapDeltaToGrid(deltaBarsRaw);
    // Minimum size: 1 beat (0.25 bars)
    let newBars = Math.max(0.25, startBars + snappedDeltaBars);
    clip.bars = newBars;

    const newWidth = newBars * window.PIXELS_PER_BAR;
    el.style.width = newWidth + "px";
    preview.style.width = newWidth + "px";
    preview.innerHTML = "";
    preview.appendChild(glow);

    // Live update MIDI preview during resize
    if (clip.type === "midi") {
      // Find or create the midi-preview canvas
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
      // Pitch range
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
    resolveClipCollisions(clip);
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
    const realClip = window.clips.find(c => c.id === el.dataset.clipId);
    window.activeClip = realClip;

    // ⭐ Update clip name in the piano roll header
    const clipNameEl = document.getElementById("piano-roll-clip-name");
    if (clipNameEl) {
      clipNameEl.textContent = realClip.name || "MIDI Clip";
    }

    // ⭐ Open piano roll (this will update the sample name)
    openPianoRoll(realClip);
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
  dropdown.style.position = "absolute";
  dropdown.style.top = "16px";
  dropdown.style.left = "0";
  dropdown.style.background = "#222";
  dropdown.style.color = "#fff";
  dropdown.style.border = "1px solid #444";
  dropdown.style.borderRadius = "4px";
  dropdown.style.fontSize = "12px";
  dropdown.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
  dropdown.style.display = "none";
  dropdown.style.zIndex = "10";
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
      newClip.notes = JSON.parse(JSON.stringify(clip.notes));
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
  labelWrap.appendChild(dropdown);

  // Show/hide dropdown on triangle click
  triangle.addEventListener("click", (e) => {
    e.stopPropagation();
    // Hide any other open dropdowns
    document.querySelectorAll('.clip-dropdown-open').forEach(el => {
      el.classList.remove('clip-dropdown-open');
      el.style.display = 'none';
    });
    dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
    if (dropdown.style.display === "block") dropdown.classList.add('clip-dropdown-open');
    else dropdown.classList.remove('clip-dropdown-open');
  });

  // Hide dropdown when clicking elsewhere
  document.addEventListener("click", () => {
    dropdown.style.display = "none";
    dropdown.classList.remove('clip-dropdown-open');
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


/* -------------------------------------------------------
   DRAGGABLE CLIP (child-safe)
------------------------------------------------------- */
el.draggable = true;

el.addEventListener("dragstart", (e) => {
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

// Add snap settings utility functions
window.getSnapValue = function () {
  const snapSelect = document.getElementById("snapValue");
  if (!snapSelect) return 1;
  return parseFloat(snapSelect.value) || 1;
};

window.snapToGrid = function (rawBar) {
  const snap = window.getSnapValue();
  return Math.floor(rawBar / snap) * snap;
};

window.snapDeltaToGrid = function (deltaBarsRaw) {
  const snap = window.getSnapValue();
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
    // Optionally update button text/icon
    playBtn.textContent = isPlaying ? "Stop" : "Play";
    // You may want to call your actual play/stop logic here as well
    // e.g. window.playAll() / window.stopAll()
  });
});


