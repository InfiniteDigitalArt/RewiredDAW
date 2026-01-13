window.playheadPosition = 0;
window.playheadInterval = null;
window.playheadStartTime = 0;
window.playheadRAF = null;
window.isDuplicateDrag = false;
window.shiftDown = false;

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


// --- CLIP DOUBLE-CLICK HANDLER ---
function attachClipHandlers(clipElement, clip, track) {
  clipElement.addEventListener("dblclick", () => {
    if (track.type === "midi") {
      openPianoRoll(clip);
    }
  });
}


window.addEventListener("keydown", e => {
  if (e.key === "Shift") window.shiftDown = true;
});

window.addEventListener("keyup", e => {
  if (e.key === "Shift") window.shiftDown = false;
});


window.addEventListener("DOMContentLoaded", () => {



  // Everything below MUST be inside DOMContentLoaded
  initTimeline();

  document.getElementById("saveProjectBtn").addEventListener("click", saveProjectZip);

  const playToggleBtn = document.getElementById("playToggleBtn");
  const transportLabel = document.getElementById("transportLabel");

  playToggleBtn.addEventListener("click", async () => {
    if (!window.isPlaying) {
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const realStart = playAll(window.seekBars || 0);
      startPlayhead(realStart);
      document.getElementById("playhead").classList.remove("hidden");

      playToggleBtn.textContent = "Stop";
      playToggleBtn.classList.add("active");

      if (transportLabel) {
        transportLabel.textContent = "Playing";
        transportLabel.classList.add("playing");
      }

    } else {
      stopAll();
      stopPlayhead();

      playToggleBtn.textContent = "Play";
      playToggleBtn.classList.remove("active");
      document.getElementById("playhead").classList.add("hidden");

      if (transportLabel) {
        transportLabel.textContent = "Stopped";
        transportLabel.classList.remove("playing");
      }
    }
  });

}); // ← only ONE closing brace



const tempoSlider = document.getElementById("tempoSlider");
const tempoValue = document.getElementById("tempoValue");

tempoSlider.addEventListener("input", () => {
  const bpm = parseInt(tempoSlider.value);
  tempoValue.textContent = bpm + " BPM";
  window.setTempo(bpm);
});

function startPlayhead(realStartTime) {
  const playhead = document.getElementById("playhead");

  // Kill any previous loop
  if (window.playheadRAF) {
    cancelAnimationFrame(window.playheadRAF);
    window.playheadRAF = null;
  }

  window.playheadStartTime = realStartTime;

  function update() {
    const playhead = document.getElementById("playhead");
    if (!playhead) return; // timeline rebuilt

    const elapsed = audioContext.currentTime - window.playheadStartTime;
    const bars = (elapsed * window.BPM) / 240;
    const x = bars * window.PIXELS_PER_BAR;

    playhead.style.left = (x + 100) + "px";

    window.playheadRAF = requestAnimationFrame(update);
  }

  update();
}

function stopPlayhead() {
  if (window.playheadRAF) {
    cancelAnimationFrame(window.playheadRAF);
    window.playheadRAF = null;
  }

  const playhead = document.getElementById("playhead");
  if (playhead) playhead.style.left = "100px"; // reset to start
}


document.addEventListener("mousedown", (e) => {
  if (!e.target.classList.contains("knob")) return;

  e.preventDefault();

  const knob = e.target;
  const trackEl = knob.closest(".track");
  const trackIndex = parseInt(trackEl.dataset.index);

  let value = parseFloat(knob.dataset.value);

  function move(ev) {
    // Smooth relative movement
    const delta = -ev.movementY * 0.003; // sensitivity

    value += delta;
    value = Math.max(0, Math.min(1, value));

    knob.dataset.value = value;
    knob.style.setProperty("--val", value);

    // APPLY TO AUDIO (kept exactly as needed)
    if (knob.classList.contains("volume-knob")) {
      window.trackGains[trackIndex].gain.value = value;
    }
  }

  function up() {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
  }

  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
});

function updateMeters() {
  const fills = document.querySelectorAll(".track-meter-fill");

  for (let i = 0; i < window.trackAnalysers.length; i++) {
    const analyser = window.trackAnalysers[i];
    const fill = fills[i];
    if (!fill) continue;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);

    // Compute peak amplitude
    let peak = 0;
    for (let j = 0; j < data.length; j++) {
      const v = Math.abs(data[j] - 128) / 128;
      if (v > peak) peak = v;
    }

    fill.style.height = (peak * 100) + "%";
  }

  requestAnimationFrame(updateMeters);
}

updateMeters();

async function saveProjectZip() {
  const zip = new JSZip();

  // Folder for audio files
  const audioFolder = zip.folder("audio");

  const tracks = [...document.querySelectorAll(".track")].map(track => ({
    volume: Number(track.querySelector(".volume-knob").dataset.value),
    pan: Number(track.querySelector(".pan-knob").dataset.value)
  }));

  const serializedClips = [];

  for (const clip of window.clips) {
    if (!clip.loopId && !clip.audioBuffer) continue;

    const baseData = {
      id: clip.id,
      loopId: clip.loopId,
      trackIndex: clip.trackIndex,
      startBar: clip.startBar,
      bars: clip.bars,
      bpm: clip.bpm,
      fileName: clip.fileName,
      startOffset: clip.startOffset || 0,
      durationSeconds: clip.durationSeconds,
      originalBars: clip.originalBars || clip.bars
    };

    if (clip.loopId) {
      // Loop clips reference external library
      serializedClips.push(baseData);
    } else {
      // Local audio clips → save WAV file into ZIP
      const wavBlob = bufferToWavBlob(clip.audioBuffer);
      const arrayBuffer = await wavBlob.arrayBuffer();

      const fileName = `${clip.id}.wav`;
      audioFolder.file(fileName, arrayBuffer);

      serializedClips.push({
        ...baseData,
        audioFile: fileName
      });
    }
  }

  const project = {
    tempo: Number(document.getElementById("tempoSlider").value),
    tracks,
    clips: serializedClips
  };

  // Add JSON to ZIP
  zip.file("project.json", JSON.stringify(project, null, 2));

  // Generate ZIP
  const blob = await zip.generateAsync({ type: "blob" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rewired_project.zip";
  a.click();
  URL.revokeObjectURL(url);
}

async function loadProjectZip(json, zip) {
  stopAll();
  stopPlayhead();

  // Reset UI
  document.getElementById("tempoSlider").value = json.tempo;
  document.getElementById("tempoValue").textContent = json.tempo + " BPM";
  window.setTempo(json.tempo);

  window.clips = [];
  document.getElementById("tracks").innerHTML = "";
  initTimeline();

  // Mixer
  json.tracks.forEach((t, index) => {
    if (window.trackGains[index]) window.trackGains[index].gain.value = t.volume;
    if (window.trackPans && window.trackPans[index]) window.trackPans[index].pan.value = t.pan;
  });

  // Load clips
  for (const raw of json.clips) {
    const clip = {
      id: raw.id,
      loopId: raw.loopId,
      audioBuffer: null,
      trackIndex: raw.trackIndex,
      startBar: raw.startBar,
      bars: raw.bars,
      bpm: raw.bpm,
      fileName: raw.fileName,
      startOffset: raw.startOffset || 0,
      durationSeconds: raw.durationSeconds,
      originalBars: raw.originalBars
    };

    if (raw.loopId) {
      const loopInfo = DROPBOX_LOOP_MAP[raw.loopId];
      await window.loadLoop(raw.loopId, loopInfo.url, loopInfo.bpm);
    } else if (raw.audioFile) {
      const wavData = await zip.file(`audio/${raw.audioFile}`).async("arraybuffer");
      clip.audioBuffer = await audioContext.decodeAudioData(wavData);
    }

    window.clips.push(clip);
    resolveClipCollisions(clip);

    const trackEl = document.querySelectorAll(".track")[clip.trackIndex];
    if (!trackEl) continue;
    const dropArea = trackEl.querySelector(".track-drop-area");
    window.renderClip(clip, dropArea);
  }
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
});




window.renderTimelineBar = function(totalBars = 64) {
  const barWidth = window.PIXELS_PER_BAR;
  const container = document.getElementById("timeline-bar");
  container.innerHTML = "";




  for (let i = 0; i < totalBars; i++) {
    const el = document.createElement("div");
    el.className = "timeline-bar-number";
    //el.style.setProperty("--bar-width", barWidth + "px");
    el.textContent = i + 1;

    el.addEventListener("click", (e) => {
      e.stopPropagation();

      const barIndex = i;

      // Always stop audio + playhead
      window.stopAll();
      stopPlayhead();

      // Store the new seek position
      window.seekBars = barIndex;

      // Move the playhead visually
      const x = barIndex * window.PIXELS_PER_BAR;
      document.getElementById("playhead").style.left = (x + 80) + "px";

      // Update transportStartTime so next Play starts from here
      window.transportStartTime =
        audioContext.currentTime - window.barsToSeconds(barIndex);

      // Reset play button UI
      const playToggleBtn = document.getElementById("playToggleBtn");
      playToggleBtn.textContent = "Play";
      playToggleBtn.classList.remove("active");
      document.getElementById("playhead").classList.add("hidden");

      const transportLabel = document.getElementById("transportLabel");
      if (transportLabel) {
        transportLabel.textContent = "Stopped";
        transportLabel.classList.remove("playing");
      }

      window.isPlaying = false;
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
  window.exportSong();
});

document.getElementById("masterVolumeSlider").addEventListener("input", e => {
  masterGain.gain.value = Number(e.target.value);
});

const vuLeft = document.getElementById("vuLeft");
const vuRight = document.getElementById("vuRight");
const ctxL = vuLeft.getContext("2d");
const ctxR = vuRight.getContext("2d");

const meterData = new Uint8Array(masterAnalyser.frequencyBinCount);

function drawVUMeters() {
  requestAnimationFrame(drawVUMeters);

  masterAnalyser.getByteTimeDomainData(meterData);

  // Split into L/R (simple approximation)
  const half = meterData.length / 2;
  const left = meterData.slice(0, half);
  const right = meterData.slice(half);

  const leftLevel = getPeak(left);
  const rightLevel = getPeak(right);

  drawMeter(ctxL, leftLevel);
  drawMeter(ctxR, rightLevel);
}

function getPeak(data) {
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i] - 128) / 128;
    if (v > peak) peak = v;
  }
  return peak;
}

function drawMeter(ctx, level) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.clearRect(0, 0, w, h);

  const barWidth = w * level;
  ctx.fillStyle = level > 0.9 ? "#ff3b3b" : "#2aff2a";
  ctx.fillRect(0, 0, barWidth, h);
}


drawVUMeters();

function attachClipHandlers(clipElement, clip, track) {
  clipElement.addEventListener("dblclick", () => {
    if (track.type === "midi") {
      openPianoRoll(clip);
    }
  });
}

function openPianoRoll(clip) {
  activeClip = clip;

  const container = document.getElementById("piano-roll-container");
  container.style.display = "block";

  resizeCanvas();
  renderPianoRoll();
}

document.getElementById("piano-roll-close").addEventListener("click", () => {
  document.getElementById("piano-roll-container").style.display = "none";
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

