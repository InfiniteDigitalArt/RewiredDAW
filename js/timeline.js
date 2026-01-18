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

// Global click handler to close clip dropdowns
document.addEventListener("click", () => {
  document.querySelectorAll('.clip-dropdown-open').forEach(el => {
    el.classList.remove('clip-dropdown-open');
    el.style.display = 'none';
  });
}, true); // Use capture phase to ensure it runs


window.initTimeline = function () {
  const tracksEl = document.getElementById("tracks");
  const marker = document.getElementById("seekMarker");
  marker.style.left = "156px";


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

    // FX button (to the right of pan)
    const fxBtn = document.createElement("button");
    fxBtn.className = "fx-btn";
    fxBtn.textContent = "FX";
    fxBtn.title = "Track FX (coming soon)";
    knobRow.appendChild(fxBtn);

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

    // Left-click to paint/duplicate selected clip
    drop.addEventListener("mousedown", function(e) {
      // Only respond to left-click
      if (e.button !== 0) return;
      // Prevent if dragging or selecting
      if (window.draggedClipId || window.draggedLoop) return;
      
      const selected = window.activeClip;
      if (!selected) return;

      // Find bar and track index
      const rect = drop.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const startBar = window.snapToGrid(x / window.PIXELS_PER_BAR);
      const trackIndex = i;

      // Check if clicking on an existing clip - if so, let the clip handle it
      const clickedOnClip = e.target.closest('.clip');
      if (clickedOnClip) return;

      // Check if a clip already exists at this bar/track
      const overlap = window.clips.some(c => c.trackIndex === trackIndex && c.startBar <= startBar && (c.startBar + c.bars) > startBar);
      if (overlap) return;

      // Prevent event from bubbling to prevent any drag handlers
      e.preventDefault();
      e.stopPropagation();

      // Start paint mode
      isPainting = true;
      paintedBars.clear();

      // Paint first clip
      const newClip = {
        ...selected,
        id: crypto.randomUUID(),
        trackIndex,
        startBar
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

      drop.innerHTML = "";
      window.clips
        .filter(c => c.trackIndex === trackIndex)
        .forEach(c => window.renderClip(c, drop));
    }, true); // Use capture phase to intercept before clip handlers

    // Paint on mouse move
    drop.addEventListener("mousemove", function(e) {
      if (!isPainting) return;

      const selected = window.activeClip;
      if (!selected) return;

      const rect = drop.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const startBar = window.snapToGrid(x / window.PIXELS_PER_BAR);
      const trackIndex = i;

      // Skip if already painted at this bar or if clip exists
      if (paintedBars.has(startBar)) return;
      const overlap = window.clips.some(c => c.trackIndex === trackIndex && c.startBar <= startBar && (c.startBar + c.bars) > startBar);
      if (overlap) return;

      // Paint new clip
      const newClip = {
        ...selected,
        id: crypto.randomUUID(),
        trackIndex,
        startBar
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

      drop.innerHTML = "";
      window.clips
        .filter(c => c.trackIndex === trackIndex)
        .forEach(c => window.renderClip(c, drop));
    });

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


  // Find if dropping on an existing MIDI clip
  const rect = drop.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const startBar = window.snapToGrid(x / window.PIXELS_PER_BAR);
  const trackIndex = i;
  // Find the clip at this position (if any)
  const targetClip = window.clips.find(c => c.trackIndex === trackIndex && c.startBar <= startBar && (c.startBar + c.bars) > startBar && c.type === "midi");

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
  drop.innerHTML = "";
  window.clips
    .filter(c => c.trackIndex === trackIndex)
    .forEach(c => window.renderClip(c, drop));
  continue;
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
    // Note: Missing activeClip and refreshClipDropdown for audio files in the loop - add if needed
    // But since it's in a loop, perhaps handle after all files
  }

  // After processing all files, refresh once
  const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
  window.refreshClipDropdown(uniqueClips);  // Refresh dropdown with unique clips

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
  if (targetClip) {
    // Replace notes in the existing MIDI clip
    targetClip.notes = JSON.parse(JSON.stringify(loop.notes));
    targetClip.bars = loop.bars;
    targetClip.name = loop.displayName || generateMidiClipName();
    window.activeClip = targetClip;
    resolveClipCollisions(targetClip);
  } else {
    const clip = new MidiClip(startBar, loop.bars);
    clip.trackIndex = trackIndex;
    clip.notes = JSON.parse(JSON.stringify(loop.notes));
    clip.sampleBuffer = window.defaultMidiSampleBuffer;
    clip.sampleName = window.defaultMidiSampleName;
    clip.name = loop.displayName || generateMidiClipName();
    window.clips.push(clip);
    resolveClipCollisions(clip);
    window.activeClip = clip;
  }
  const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
  window.refreshClipDropdown(uniqueClips);
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
    window.activeClip = clip;  // Set as active immediately after creation
    const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
    window.refreshClipDropdown(uniqueClips);  // Refresh dropdown with unique clips

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
        window.activeClip = clip;  // Set as active immediately after creation
        const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
        window.refreshClipDropdown(uniqueClips);  // Refresh dropdown with unique clips

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
      window.activeClip = newClip;  // Set as active immediately after duplication
      const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
      window.refreshClipDropdown(uniqueClips);  // Refresh dropdown with unique clips
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
      // Keep playhead visually locked at the left edge of the timeline grid
      if (playhead) {
        playhead.style.left = (156 + scrollX) + "px";
      }
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

  // --- MOUSE MOVE FOR CONTINUOUS DELETION ---
  el.addEventListener("mousemove", function (e) {
    if (isDeletingClipsWithRightClick && !deletedClipIds.has(clip.id)) {
      e.preventDefault();
      e.stopPropagation();
      
      const trackIndex = clip.trackIndex;
      window.clips = window.clips.filter(c => c.id !== clip.id);
      deletedClipIds.add(clip.id);
      
      // Re-render the track
      dropArea.innerHTML = "";
      window.clips
        .filter(c => c.trackIndex === trackIndex)
        .forEach(c => window.renderClip(c, dropArea));
      
      // Close piano roll if this clip was active
      if (window.activeClip && window.activeClip.id === clip.id) {
        document.getElementById("piano-roll-container").classList.add("hidden");
        window.activeClip = null;
      }
      
      // Refresh dropdown
      const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
      window.refreshClipDropdown(uniqueClips);
    }
  });

  // --- Real-time drag/move with double-click threshold ---
  el.addEventListener("mousedown", function (e) {
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
      
      // Re-render the track
      dropArea.innerHTML = "";
      window.clips
        .filter(c => c.trackIndex === trackIndex)
        .forEach(c => window.renderClip(c, dropArea));
      
      // Close piano roll if this clip was active
      if (window.activeClip && window.activeClip.id === clip.id) {
        document.getElementById("piano-roll-container").classList.add("hidden");
        window.activeClip = null;
      }
      
      // Refresh dropdown
      const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
      window.refreshClipDropdown(uniqueClips);
      
      return;
    }

    if (e.button !== 0) return; // Only left mouse for normal operations
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
      // --- Always link the same reverbGain object ---
      if (clip.type === "midi") {
        dragClip.notes = clip.notes;
        dragClip.sampleBuffer = clip.sampleBuffer;
        dragClip.sampleName = clip.sampleName;
        if (clip.reverbGain) dragClip.reverbGain = clip.reverbGain;
      }
      if (clip.type === "audio") {
        dragClip.audioBuffer = clip.audioBuffer;
        if (clip.reverbGain) dragClip.reverbGain = clip.reverbGain;
      }
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
        // ⚠️ This line will recursively call renderClip for all clips in the track:
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
      // Select this clip in the dropdown after drag ends
      const dropdown = document.getElementById("clipListDropdown");
      if (dropdown) dropdown.value = dragClip.name || dragClip.fileName || dragClip.id;
      // No simulated double-click. Only native dblclick will open piano roll.
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);

    // Select this clip in the dropdown on mouse down
    window.activeClip = clip;  // Set as active on interaction
    const uniqueClips = [...new Map(window.clips.map(c => [c.name || c.fileName || c.id, c])).values()];
    window.refreshClipDropdown(uniqueClips);  // Refresh dropdown with unique clips

    // --- Always switch piano roll to this clip if it's open and this is a MIDI clip ---
    const pianoRoll = document.getElementById("piano-roll-container");
    if (
      pianoRoll &&
      !pianoRoll.classList.contains("hidden") &&
      clip.type === "midi"
    ) {
      // Use the same logic as double-click: update activeClip, header, and call openPianoRoll
      window.activeClip = clip;
      const clipNameEl = document.getElementById("piano-roll-clip-name");
      if (clipNameEl) {
        clipNameEl.textContent = clip.name || "MIDI Clip";
      }
      openPianoRoll(clip);
      // Also update dropdown value to match the opened clip
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
  e.preventDefault();
  e.stopPropagation(); // Prevent menu from showing
  
  // Don't re-delete if already deleted during drag
  if (deletedClipIds.has(clip.id)) return;

  const trackIndex = clip.trackIndex;

  // 1. Remove the clip from the project
  window.clips = window.clips.filter(c => c.id !== clip.id);

  // 2. Re-render the track visually
  dropArea.innerHTML = "";
  window.clips
    .filter(c => c.trackIndex === trackIndex)
    .forEach(c => window.renderClip(c, dropArea));

  // 3. Close piano roll
  document.getElementById("piano-roll-container").classList.add("hidden");
  activeClip = null;

  // Refresh the dropdown after deletion
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
    }
  }
});

// --- DISABLE CONTEXT MENU GLOBALLY FOR THE ENTIRE APPLICATION ---
document.addEventListener("contextmenu", function (e) {
  e.preventDefault();
}, true);


