window.audioContext = new (window.AudioContext || window.webkitAudioContext)();

window.defaultMidiSampleBuffer = null;
window.defaultMidiSampleName = "LD-1.wav";


async function loadDefaultMidiSample() {
  const url =
    "https://dl.dropboxusercontent.com/scl/fi/kouvzt916w2y4bnqc4cva/LD-1.wav?rlkey=q4q2qz72p91b6ueaqo8gplws9&st=pdc37b5y";

  const res = await fetch(url);
  const arrayBuf = await res.arrayBuffer();
  window.defaultMidiSampleBuffer = await audioContext.decodeAudioData(arrayBuf);

  console.log("Default MIDI sample loaded", window.defaultMidiSampleBuffer);
}

loadDefaultMidiSample();


window.PIXELS_PER_BAR = 80;
window.BPM = 175;

window.loopBuffers = new Map();
window.clips = [];
// near top of audioEngine.js
window.scheduledSources = [];
window.scheduledMidiVoices = [];

window.isPlaying = false;
window.transportStartTime = 0;


/* -------------------------------------------------------
   MASTER OUTPUT (must be created BEFORE tracks)
------------------------------------------------------- */
window.masterGain = audioContext.createGain();
window.masterGain.gain.value = 0.8;

window.masterAnalyser = audioContext.createAnalyser();
window.masterAnalyser.fftSize = 256;

// Master → analyser → speakers
window.masterGain.connect(window.masterAnalyser);
window.masterAnalyser.connect(audioContext.destination);


/* -------------------------------------------------------
   TRACK GAIN + ANALYSER NODES
------------------------------------------------------- */
window.trackGains = [];
window.trackAnalysers = [];

for (let i = 0; i < 16; i++) {
  const gain = audioContext.createGain();
  gain.gain.value = 0.8;

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;

  // Track → analyser → master
  gain.connect(analyser);
  analyser.connect(window.masterGain);

  window.trackGains.push(gain);
  window.trackAnalysers.push(analyser);
}

/* -------------------------------------------------------
   IMPORTANT:
   ❌ DO NOT connect track gains directly to master again.
   The analyser already feeds into master.
------------------------------------------------------- */


/* -------------------------------------------------------
   NORMALIZATION FUNCTION
------------------------------------------------------- */
function normalizeBuffer(audioBuffer) {
  let max = 0;

  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    const data = audioBuffer.getChannelData(i);
    for (let s = 0; s < data.length; s++) {
      max = Math.max(max, Math.abs(data[s]));
    }
  }

  if (max < 0.0001) return audioBuffer; // avoid divide-by-zero

  const scale = 1 / max;

  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    const data = audioBuffer.getChannelData(i);
    for (let s = 0; s < data.length; s++) {
      data[s] *= scale;
    }
  }

  return audioBuffer;
}

/* -------------------------------------------------------
   TIME CONVERSION
------------------------------------------------------- */
window.barsToSeconds = function(bars) {
  return (60 / BPM) * (bars * 4);
};

window.loopBuffers = window.loopBuffers || new Map();

/* -------------------------------------------------------
   LOAD LOOP (NORMALIZED)
------------------------------------------------------- */
window.loadLoop = async function(id, url, bpmFromFilename) {
  if (window.loopBuffers.has(id)) return;

  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = await audioContext.decodeAudioData(arrayBuffer);

  const normalized = normalizeBuffer(buffer);

  const duration = normalized.duration; // seconds
  const bpm = bpmFromFilename || 175;
  const bars = Math.round((duration * bpm) / 240);

  // Store loop buffer
  window.loopBuffers.set(id, { buffer: normalized, bpm, bars });

  /* -------------------------------------------------------
     NEW: Re-render any clips using this loop
  ------------------------------------------------------- */
  window.clips
    .filter(c => c.loopId === id)
    .forEach(c => {
      const drop = document.querySelector(
        `.track[data-index="${c.trackIndex}"] .track-drop-area`
      );
      if (drop) {
        drop.innerHTML = "";
        window.clips
          .filter(x => x.trackIndex === c.trackIndex)
          .forEach(x => window.renderClip(x, drop));
      }
    });

}; // ← this closes the function properly

/* -------------------------------------------------------
   CREATE CLIP FROM LOADED LOOP
------------------------------------------------------- */
window.createLoopClip = function(loopId, trackIndex, startBar, bars) {
  const loopData = window.loopBuffers.get(loopId);
  if (!loopData) return null;

  const clip = {
    id: crypto.randomUUID(),
    type: "audio",            // ⭐ REQUIRED
    loopId,
    audioBuffer: loopData.buffer,
    trackIndex,
    startBar,
    bars: bars || loopData.bars,
    bpm: loopData.bpm,
    fileName: loopId
  };

  window.clips.push(clip);
  return clip;
};


/* -------------------------------------------------------
   SCHEDULING (SAFE + DAW-ACCURATE)
------------------------------------------------------- */
window.scheduleClip = function(clip, seekBars = 0) {

  /* -------------------------------------------------------
     1. Resolve buffer + BPM + loop length
  ------------------------------------------------------- */
  let buffer = null;
  let clipBpm = window.BPM;

  if (clip.loopId) {
    const loopData = window.loopBuffers.get(clip.loopId);
    if (!loopData) return;

    buffer = loopData.buffer;
    clipBpm = loopData.bpm || window.BPM;

  } else if (clip.audioBuffer) {
    buffer = clip.audioBuffer;
    clipBpm = clip.bpm || window.BPM;

  } else {
    return;
  }

  /* -------------------------------------------------------
     2. SAFETY GUARDS
  ------------------------------------------------------- */

  // playback length (resizable)
  if (!isFinite(clip.bars) || clip.bars <= 0) {
    console.warn("Invalid clip.bars", clip.bars, clip);
    clip.bars = 1;
  }

  // Source duration in buffer seconds
  const sourceDuration = buffer.duration;

  // Ensure originalBars exists for trimming math
  if (!isFinite(clip.originalBars) || clip.originalBars <= 0) {
    clip.originalBars = clip.bars; // fallback
  }

  // How much of the buffer to play (in source seconds)
  let visibleDuration = sourceDuration;

  // If the user has trimmed the clip (bars < originalBars), trim audio too
  if (clip.bars < clip.originalBars) {
    const trimRatio = clip.bars / clip.originalBars;
    visibleDuration = sourceDuration * trimRatio;
  }

  // start offset
  if (!isFinite(clip.startOffset) || clip.startOffset < 0) {
    clip.startOffset = 0;
  }
  const startOffset = clip.startOffset;

  /* -------------------------------------------------------
     3. Create + configure source
  ------------------------------------------------------- */
  const source = audioContext.createBufferSource();
  source.buffer = buffer;

  const rate = window.BPM / clipBpm;
  source.playbackRate.value = isFinite(rate) ? rate : 1;

  // store BPM for tempo changes
  source._clipBpm = clipBpm;

  const trackGain = window.trackGains[clip.trackIndex];
  source.connect(trackGain);

  /* -------------------------------------------------------
     4. Scheduling logic
  ------------------------------------------------------- */
  const relativeStartBars = clip.startBar - seekBars;

  // CASE 1: Normal forward scheduling
  if (relativeStartBars >= 0) {
    const when = transportStartTime + barsToSeconds(relativeStartBars);

    let dur = visibleDuration;
    if (!isFinite(dur) || dur <= 0) dur = 0.001;

    source.start(when, startOffset, dur);
  } else {
    // CASE 2: Starting in the middle of a clip (wrapped)
    const barsIntoClip = -relativeStartBars;

    // Use originalBars for wrapping, not clip.bars (UI length)
    const loopLengthBars = clip.originalBars;

    // Safe modulo for fractional bars
    const wrappedBarsIntoClip =
      (barsIntoClip % loopLengthBars + loopLengthBars) % loopLengthBars;

    // Convert wrapped bars into SOURCE seconds
    const secondsPerBarInSource = sourceDuration / clip.originalBars;
    const offsetSeconds = wrappedBarsIntoClip * secondsPerBarInSource;

    // Trim duration safely
    let safeDuration = sourceDuration - offsetSeconds;
    if (!isFinite(safeDuration) || safeDuration <= 0) {
      safeDuration = 0.001;
    }

    source.start(audioContext.currentTime, offsetSeconds, safeDuration);
  }

  /* -------------------------------------------------------
     5. Track scheduled sources
  ------------------------------------------------------- */
  scheduledSources.push(source);
};




// add this near the top of audioEngine.js
window.onScheduleMidiClip = window.onScheduleMidiClip || null;

window.playAll = function(seekBars = 0) {
  scheduledSources = [];

  const offsetSeconds = barsToSeconds(seekBars);

  // Seek: bar `seekBars` is "now"
  transportStartTime = audioContext.currentTime - offsetSeconds;

  clips.forEach(clip => {
    if (clip.type === "midi") {
      if (window.onScheduleMidiClip) {
        // simple track object for now; you can evolve this later
        const relativeStartBars = clip.startBar - seekBars;
        const startTime = transportStartTime + barsToSeconds(relativeStartBars);
        const track = { instrument: "basic-saw" };

        window.onScheduleMidiClip(clip, track, startTime);
      }
    } else {
      scheduleClip(clip, seekBars);
    }
  });

  isPlaying = true;
  return transportStartTime;
};



window.stopAll = function() {
  scheduledSources.forEach(s => {
    try { s.stop(); } catch(e) {}
    try { s.disconnect(); } catch(e) {}
  });
  scheduledSources = [];

  // NEW: stop MIDI voices too
  scheduledMidiVoices.forEach(v => {
    try { v.stop(); } catch(e) {}
    try { v.disconnect(); } catch(e) {}
  });
  scheduledMidiVoices = [];

  isPlaying = false;
  stopPlayhead();
};



window.setTempo = function(newBpm) {
  window.BPM = newBpm;

  window.scheduledSources.forEach(src => {
    if (src.playbackRate) {
      const loopData = window.loopBuffers.get(src.loopId);
      if (loopData) {
        src.playbackRate.value = window.BPM / loopData.bpm;
      }
    }
  });
};

window.renderWaveform = function(audioBuffer, width, height = 40) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");

  const data = audioBuffer.getChannelData(0);
  const step = Math.floor(data.length / width);
  const amp = height / 2;

  ctx.fillStyle = "#2a6cff";
  ctx.clearRect(0, 0, width, height);

  for (let i = 0; i < width; i++) {
    let min = 1.0;
    let max = -1.0;

    for (let j = 0; j < step; j++) {
      const v = data[(i * step) + j];
      if (v < min) min = v;
      if (v > max) max = v;
    }

    ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
  }

  return canvas;
};