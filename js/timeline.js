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
  const controlsContainer = document.getElementById("track-controls-container");
  const marker = document.getElementById("seekMarker");
  marker.style.left = "160px";

  // Clear containers
  tracksEl.innerHTML = "";
  controlsContainer.innerHTML = "";

  for (let i = 0; i < 16; i++) {
    const color = window.TRACK_COLORS[i % 10];

    const controls = document.createElement("div");
    controls.className = "track-controls";
    controls.dataset.index = i; // ⭐ Add data-index for mapping
    // Remove: controls.style.background = color;

    const label = document.createElement("div");
    label.className = "track-label";
    label.textContent = "Track " + (i + 1);
    label.style.color = window.TRACK_COLORS[i % 10];


    // Horizontal knob row
    const knobRow = document.createElement("div");
    knobRow.className = "knob-row";
    knobRow.style.display = "flex";
    knobRow.style.alignItems = "center"; // ⭐ Center vertically

    // Volume knob + label
    const volWrap = document.createElement("div");
    volWrap.className = "knob-wrap";

    const vol = document.createElement("div");
    vol.className = "knob volume-knob";
    vol.dataset.value = 0.8;
    vol.style.background = color; // ⭐ knob color

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
    pan.style.background = color; // ⭐ knob color

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
    meter.style.background = "#222";
    meter.style.position = "relative";
    meter.style.overflow = "hidden";
    meter.style.display = "flex";
    meter.style.flexDirection = "column";
    meter.style.justifyContent = "center";
    meter.style.height = "18px"; // ⭐ Make taller for vertical centering
    meter.style.marginLeft = "12px";
    meter.style.marginRight = "0";

    // Left channel
    const meterFillL = document.createElement("div");
    meterFillL.className = "track-meter-fill track-meter-fill-left";
    meterFillL.style.background = color;
    meterFillL.style.position = "absolute";
    meterFillL.style.left = "0";
    meterFillL.style.top = "0";
    meterFillL.style.height = "45%";
    meterFillL.style.width = "0%";
    meterFillL.style.borderRadius = "4px 4px 0 0";
    meter.appendChild(meterFillL);

    // Right channel
    const meterFillR = document.createElement("div");
    meterFillR.className = "track-meter-fill track-meter-fill-right";
    meterFillR.style.background = color;
    meterFillR.style.position = "absolute";
    meterFillR.style.left = "0";
    meterFillR.style.bottom = "0";
    meterFillR.style.height = "45%";
    meterFillR.style.width = "0%";
    meterFillR.style.borderRadius = "0 0 4px 4px";
    meter.appendChild(meterFillR);

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
  const rawStartBar = x / window.PIXELS_PER_BAR;
  
  // ⭐ Snap to grid
  const startBar = window.snapToGrid(rawStartBar);
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
    const track = document.createElement("div");
    track.className = "track";
    track.dataset.index = i;
    track.style.setProperty("--track-color", window.TRACK_COLORS[i % 10]);
    track.appendChild(inner);

    controlsContainer.appendChild(controls);
    tracksEl.appendChild(track);
  }

  // Ensure grid/clip area starts after controls
  const tracksScrollable = document.querySelector('.tracks-scrollable');
  if (tracksScrollable) {
    tracksScrollable.style.marginLeft = "160px";
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

    // Horizontal lines: split into 4 equal sections
    const sectionHeight = trackHeight / 4;
    for (let s = 1; s < 4; s++) { // 3 lines to split into 4 sections
      const y = s * sectionHeight;
      const row = document.createElement("div");
      row.className = "grid-row";
      row.style.top = y + "px";
      grid.appendChild(row);
    }
  });
}

renderGrid();
window.renderTimelineBar(64);

  // ⭐ Make timeline bar scroll horizontally with tracks
  const timelineScroll = document.getElementById("timeline-scroll");
  const timelineBar = document.getElementById("timeline-bar");
  const playhead = document.getElementById("playhead");
  const seekMarker = document.getElementById("seekMarker");

  if (timelineScroll && timelineBar) {
    timelineScroll.addEventListener("scroll", function () {
      timelineBar.style.transform = `translateX(${-timelineScroll.scrollLeft}px)`;
      if (playhead) playhead.style.transform = `translateX(${-timelineScroll.scrollLeft}px)`;
      if (seekMarker) seekMarker.style.transform = `translateX(${-timelineScroll.scrollLeft}px)`;
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

  // 3. Update audio engine state for this track
  //updateTrackActiveState(trackIndex);


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
  const startBarsInt = clip.bars; // ⭐ Use actual bars (may be fractional)

  const preview = document.createElement("div");
  preview.className = "clip-resize-preview";

  const glow = document.createElement("div");
  glow.className = "glow";
  preview.appendChild(glow);

  el.appendChild(preview);

  function move(ev) {
    const deltaPx = ev.clientX - startX;
    const deltaBarsRaw = deltaPx / window.PIXELS_PER_BAR;

    // ⭐ Calculate the raw new size first
    let rawNewBars = startBarsInt + deltaBarsRaw;
    
    // ⭐ Snap the final size intelligently
    const snapValue = window.getSnapValue();
    
    // Find the nearest snap grid line
    const snappedNewBars = Math.round(rawNewBars / snapValue) * snapValue;
    
    // Use snapped value, but enforce minimum
    let newBars = Math.max(snapValue, snappedNewBars);
    clip.bars = newBars;

    // ⭐ Update durationSeconds based on new bar length
    if (clip.type === "audio") {
      const barDuration = window.barsToSeconds(1);
      clip.durationSeconds = newBars * barDuration;
    }

    const newWidth = newBars * window.PIXELS_PER_BAR;
    el.style.width = newWidth + "px";

    preview.style.width = newWidth + "px";
    preview.innerHTML = "";
    preview.appendChild(glow);

    // ⭐ Render preview bars (show fractional bars too)
    const barCount = Math.floor(newBars);
    for (let i = 0; i < barCount; i++) {
      const bar = document.createElement("div");
      bar.className = "bar";
      preview.appendChild(bar);
    }
    
    // ⭐ Show fractional bar if exists
    const fraction = newBars - barCount;
    if (fraction > 0.01) {
      const fracBar = document.createElement("div");
      fracBar.className = "bar";
      fracBar.style.opacity = String(fraction);
      preview.appendChild(fracBar);
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

  // ⭐ CRITICAL: Set originalBars ONLY if it doesn't exist
  // Never overwrite it after clip creation
  if (!clip.originalBars || !isFinite(clip.originalBars) || clip.originalBars <= 0) {
    clip.originalBars = projectBars;
  }

  // ⭐ bars should never exceed originalBars
  if (!isFinite(clip.bars) || clip.bars <= 0) {
    clip.bars = clip.originalBars;
  }

  const originalBars = clip.originalBars;
  const playbackBars = clip.bars;

  // ⭐ Calculate playback duration from trimmed bars
  const playbackDurationSeconds = playbackBars * barDuration;
  clip.durationSeconds = playbackDurationSeconds;

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
const label = document.createElement("div");
label.style.position = "absolute";
label.style.top = "2px";
label.style.left = "4px";
label.style.fontSize = "10px";
label.style.color = "#fff";
label.style.pointerEvents = "none";

if (clip.type === "audio") {
  // Works for both local audio and loop clips
  label.textContent = clip.fileName || clip.loopId || "Audio";
} 
else if (clip.type === "midi") {
  label.textContent = clip.name || "MIDI Clip";
} 
else {
  label.textContent = "Clip";
}

el.appendChild(label);


/* -------------------------------------------------------
   DRAGGABLE CLIP (child-safe)
------------------------------------------------------- */
el.draggable = true;

el.addEventListener("dragstart", (e) => {
  if (e.target !== el) {
    e.stopPropagation();
  }

  window.isDuplicateDrag = e.shiftKey || e.altKey || e.ctrlKey;
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
  e.preventDefault();
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
  const deltaBarsRaw = deltaPx / window.PIXELS_PER_BAR;
  
  // ⭐ Snap delta to grid
  const deltaBars = window.snapDeltaToGrid(deltaBarsRaw);

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

/* -------------------------------------------------------
   MOUSE DRAG SUPPORT (real-time movement)
------------------------------------------------------- */
let mouseDrag = null;

el.addEventListener("mousedown", (e) => {
  // Don't drag if clicking on the resize handle
  if (e.target.classList.contains("resize-handle")) return;

  e.preventDefault();
  const rect = el.getBoundingClientRect();
  const dropRect = dropArea.getBoundingClientRect();

  // ⭐ Check for shift key to enable duplication
  const isDuplicateDrag = e.shiftKey || e.altKey || e.ctrlKey;

  // ⭐ If duplicating, create a visual clone element
  let dragElement = el;
  let dragOffsetY = 0;
  if (isDuplicateDrag) {
    dragElement = el.cloneNode(true);
    // Copy computed styles for perfect match
    const computed = window.getComputedStyle(el);
    dragElement.style.position = "absolute";
    dragElement.style.zIndex = "1000";
    dragElement.style.width = computed.width;
    dragElement.style.height = computed.height;
    dragElement.style.left = el.style.left;
    dragElement.style.top = el.style.top;
    dragElement.style.pointerEvents = "none";
    dragElement.style.opacity = "0.7";
    dragElement.classList.add("clip-dragging");
    // Remove resize handle from clone (optional)
    const cloneHandle = dragElement.querySelector(".resize-handle");
    if (cloneHandle) cloneHandle.remove();
    // Place clone at same vertical position as original
    dragOffsetY = el.offsetTop;
    dragElement.style.top = dragOffsetY + "px";
    // ⭐ Copy waveform canvas bitmap if present
    const origCanvas = el.querySelector("canvas");
    const cloneCanvas = dragElement.querySelector("canvas");
    if (origCanvas && cloneCanvas && origCanvas.width && origCanvas.height) {
      cloneCanvas.width = origCanvas.width;
      cloneCanvas.height = origCanvas.height;
      cloneCanvas.getContext("2d").drawImage(origCanvas, 0, 0);
    }
    dropArea.appendChild(dragElement);
  }

  mouseDrag = {
    clip,
    el,
    dragElement,
    dropArea,
    startX: e.clientX,
    originalStartBar: clip.startBar,
    dropAreaLeft: dropRect.left,
    isDuplicateDrag,
    dragOffsetY
  };
});

document.addEventListener("mousemove", (e) => {
  if (!mouseDrag) return;

  const deltaPx = e.clientX - mouseDrag.startX;
  const deltaBarsRaw = deltaPx / window.PIXELS_PER_BAR;
  const deltaBars = window.snapDeltaToGrid(deltaBarsRaw);

  const newStartBar = Math.max(0, mouseDrag.originalStartBar + deltaBars);

  // ⭐ Update the drag element (clone during duplication, original during move)
  mouseDrag.dragElement.style.left = newStartBar * window.PIXELS_PER_BAR + "px";
  mouseDrag.dragElement.style.opacity = "0.7";
  // Keep vertical position fixed
  if (mouseDrag.isDuplicateDrag) {
    mouseDrag.dragElement.style.top = mouseDrag.dragOffsetY + "px";
  }
});

document.addEventListener("mouseup", () => {
  if (!mouseDrag) return;

  const { clip, el, dragElement, dropArea, isDuplicateDrag, originalStartBar } = mouseDrag;

  dragElement.style.opacity = "1";

  if (isDuplicateDrag) {
    // Get position from the drag element (clone)
    const newStartBar = parseInt(dragElement.style.left) / window.PIXELS_PER_BAR;
    if (newStartBar !== originalStartBar) {
      const newClip = {
        ...clip,
        id: crypto.randomUUID(),
        startBar: newStartBar
      };
      window.clips.push(newClip);
      resolveClipCollisions(newClip);
    }
    dragElement.remove();
  } else {
    const newStartBar = parseInt(dragElement.style.left) / window.PIXELS_PER_BAR;
    clip.startBar = newStartBar;
    resolveClipCollisions(clip);
  }

  // Re-render track to ensure clean state
  dropArea.innerHTML = "";
  window.clips
    .filter(c => c.trackIndex === clip.trackIndex)
    .forEach(c => window.renderClip(c, dropArea));

  mouseDrag = null;
});



  dropArea.appendChild(el);
  

};


/* -------------------------------------------------------
   KNOB INTERACTION (reduced sensitivity)
------------------------------------------------------- */
document.addEventListener("mousedown", (e) => {
  if (!e.target.classList.contains("knob")) return;

  const knob = e.target;
  // ⭐ Find the parent .track-controls to get the track index
  const controls = knob.closest('.track-controls');
  if (!controls) return;
  const trackIndex = Number(controls.dataset.index);

  const rect = knob.getBoundingClientRect();
  const centerY = rect.top + rect.height / 2;

  function move(ev) {
    const dy = centerY - ev.clientY;
    let v = parseFloat(knob.dataset.value) + dy * 0.0007; // smoother
    v = Math.max(0, Math.min(1, v));
    knob.dataset.value = v;
    knob.style.setProperty("--val", v);

    // ⭐ Update audio engine in real time
    if (knob.classList.contains("volume-knob")) {
      if (window.trackGains && window.trackGains[trackIndex]) {
        window.trackGains[trackIndex].gain.value = v;
      }
    }
    if (knob.classList.contains("pan-knob")) {
      if (window.trackPanners && window.trackPanners[trackIndex]) {
        window.trackPanners[trackIndex].pan.value = v * 2 - 1;
      }
    }
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


