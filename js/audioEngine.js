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
window.scheduledSources = new Set();
window.scheduledMidiVoices = new Set();


window.isPlaying = false;
window.transportStartTime = 0;


/* -------------------------------------------------------
   MASTER OUTPUT (must be created BEFORE tracks)
------------------------------------------------------- */
window.masterGain = audioContext.createGain();
window.masterGain.gain.value = 0.8;

// Create a stereo splitter for master VU meters
window.masterSplitter = audioContext.createChannelSplitter(2);

window.masterAnalyserLeft = audioContext.createAnalyser();
window.masterAnalyserRight = audioContext.createAnalyser();
window.masterAnalyserLeft.fftSize = 256;
window.masterAnalyserRight.fftSize = 256;

// Connect masterGain to splitter and destination
window.masterGain.connect(window.masterSplitter);
window.masterGain.connect(audioContext.destination);

// Connect splitter outputs to analysers
window.masterSplitter.connect(window.masterAnalyserLeft, 0);
window.masterSplitter.connect(window.masterAnalyserRight, 1);


/* -------------------------------------------------------
   TRACK GAIN + ANALYSER NODES
------------------------------------------------------- */
window.trackGains = [];
window.trackPanners = [];
window.trackAnalysersL = [];
window.trackAnalysersR = [];

for (let i = 0; i < 16; i++) {
  const gain = audioContext.createGain();
  gain.gain.value = 0.8;

  const panner = audioContext.createStereoPanner();
  panner.pan.value = 0; // center

  // Stereo splitter and analysers for L/R
  const splitter = audioContext.createChannelSplitter(2);
  const analyserL = audioContext.createAnalyser();
  const analyserR = audioContext.createAnalyser();
  analyserL.fftSize = 256;
  analyserR.fftSize = 256;

  // Track → gain → panner → masterGain (for real audio)
  gain.connect(panner);
  panner.connect(window.masterGain);

  // Track → gain → panner → splitter → analyserL/R (for VU meters)
  panner.connect(splitter);
  splitter.connect(analyserL, 0);
  splitter.connect(analyserR, 1);

  window.trackGains.push(gain);
  window.trackPanners.push(panner);
  window.trackAnalysersL.push(analyserL);
  window.trackAnalysersR.push(analyserR);
}


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

  // ⭐ CRITICAL: originalBars should have been set when clip was created
  // It represents the full buffer length in bars and should NEVER change
  if (!isFinite(clip.originalBars) || clip.originalBars <= 0) {
    // Fallback: calculate from buffer if somehow missing
    const barDuration = barsToSeconds(1);
    clip.originalBars = sourceDuration / barDuration;
  }

  // ⭐ Ensure bars never exceeds originalBars (prevents extending past buffer)
  if (!isFinite(clip.bars) || clip.bars <= 0) {
    clip.bars = clip.originalBars;
  }
  if (clip.bars > clip.originalBars) {
    clip.bars = clip.originalBars;
  }

  // ⭐ Calculate visible duration based on current bar length
  const barDuration = sourceDuration / clip.originalBars;
  const visibleDuration = clip.bars * barDuration;

  // start offset (only used for left-trim, currently always 0)
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
   4. Scheduling logic (correct + DAW-accurate)
------------------------------------------------------- */

const clipStart = clip.startBar;
const clipEnd   = clip.startBar + clip.bars;

// CASE A: Transport BEFORE the clip → schedule normally
if (seekBars < clipStart) {
  const when = transportStartTime + barsToSeconds(clipStart);

  let dur = visibleDuration;
  if (!isFinite(dur) || dur <= 0) dur = 0.001;

  window.scheduledSources.add(source);
  source.onended = () => window.scheduledSources.delete(source);

  source.start(when, startOffset, dur);
  return;
}

// CASE B: Transport INSIDE the clip → start from offset
if (seekBars >= clipStart && seekBars < clipEnd) {
  const barsIntoClip = seekBars - clipStart;
  const secondsPerBarInSource = sourceDuration / clip.originalBars;
  const offsetSeconds = startOffset + (barsIntoClip * secondsPerBarInSource);

  const playbackProgress = barsIntoClip * secondsPerBarInSource;
  let safeDuration = visibleDuration - playbackProgress;
  if (!isFinite(safeDuration) || safeDuration <= 0) safeDuration = 0.001;

  window.scheduledSources.add(source);
  source.onended = () => window.scheduledSources.delete(source);

  source.start(audioContext.currentTime, offsetSeconds, safeDuration);
  return;
}

// CASE C: Transport AFTER the clip → only play if looped
if (clip.looped) {
  const barsIntoClip = seekBars - clipStart;
  const loopLengthBars = clip.originalBars;

  const wrappedBarsIntoClip =
    (barsIntoClip % loopLengthBars + loopLengthBars) % loopLengthBars;

  const secondsPerBarInSource = sourceDuration / clip.originalBars;
  const offsetSeconds = startOffset + (wrappedBarsIntoClip * secondsPerBarInSource);

  const playbackProgress = wrappedBarsIntoClip * secondsPerBarInSource;
  let safeDuration = visibleDuration - playbackProgress;
  if (!isFinite(safeDuration) || safeDuration <= 0) safeDuration = 0.001;

  window.scheduledSources.add(source);
  source.onended = () => window.scheduledSources.delete(source);

  source.start(audioContext.currentTime, offsetSeconds, safeDuration);
}

return;



  /* -------------------------------------------------------
     5. Track scheduled sources
  ------------------------------------------------------- */


};


// add this near the top of audioEngine.js
window.onScheduleMidiClip = window.onScheduleMidiClip || null;

window.playAll = function(seekBars = 0) {
  window.scheduledSources.clear();
  window.scheduledMidiVoices.clear();

  // Seek: bar `seekBars` is "now"
  transportStartTime = audioContext.currentTime - barsToSeconds(seekBars);

  clips.forEach(clip => {
    if (clip.type === "midi") {
      if (window.onScheduleMidiClip) {
        const startTime = transportStartTime + barsToSeconds(clip.startBar);
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
  window.scheduledSources.forEach(s => {
    try { s.stop(); } catch(e) {}
    try { s.disconnect(); } catch(e) {}
  });
  window.scheduledSources.clear();


  // NEW: stop MIDI voices too
  window.scheduledMidiVoices.forEach(v => {
    try { v.stop(); } catch(e) {}
    try { v.disconnect(); } catch(e) {}
  });
  window.scheduledMidiVoices.clear();


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

function updateTrackActiveState(trackIndex) {
  const hasClips = window.clips.some(c => c.trackIndex === trackIndex);

  if (!hasClips) {
    // Silence the track
    if (trackGains[trackIndex]) trackGains[trackIndex].gain.value = 0;

    // Optionally disconnect reverb send
    if (trackReverbSend[trackIndex]) trackReverbSend[trackIndex].disconnect();
  } else {
    // Restore normal gain
    if (trackGains[trackIndex]) {
      trackGains[trackIndex].gain.value =
        Number(document.querySelectorAll(".track")[trackIndex]
          .querySelector(".volume-knob").dataset.value);
    }

    // Restore reverb routing
    if (trackReverbSend[trackIndex] && !trackReverbSend[trackIndex].numberOfOutputs) {
      trackGains[trackIndex].connect(trackReverbSend[trackIndex]);
    }
  }
}

window.makeSmallReverbBuffer = function(ctx) {
  const length = ctx.sampleRate * 3;
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const channel = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      channel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
    }
  }
  return impulse;
};

// Add after track creation loop
function drawTrackVUMeter(canvas, value, color) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (value > 0.01) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w * value, h);
  }
}

function updateTrackVUMeters() {
  for (let i = 0; i < 16; i++) {
    const analyserL = window.trackAnalysersL[i];
    const analyserR = window.trackAnalysersR[i];
    const controls = document.querySelector(`.track-controls[data-index="${i}"]`);
    if (!controls) continue;

    // Find or create canvas for left/right VU
    let canvasL = controls.querySelector(".track-vu-canvas-left");
    let canvasR = controls.querySelector(".track-vu-canvas-right");
    const color = window.TRACK_COLORS[i % window.TRACK_COLORS.length];

    if (!canvasL) {
      canvasL = document.createElement("canvas");
      canvasL.className = "track-vu-canvas-left";
      canvasL.width = 60;
      canvasL.height = 6;
      // Insert before/after meter-fill if needed, or just append to .track-meter
      const meter = controls.querySelector(".track-meter");
      if (meter) meter.appendChild(canvasL);
    }
    if (!canvasR) {
      canvasR = document.createElement("canvas");
      canvasR.className = "track-vu-canvas-right";
      canvasR.width = 60;
      canvasR.height = 6;
      const meter = controls.querySelector(".track-meter");
      if (meter) meter.appendChild(canvasR);
    }

    // Get analyser data
    const arrayL = new Uint8Array(analyserL.fftSize);
    const arrayR = new Uint8Array(analyserR.fftSize);
    analyserL.getByteTimeDomainData(arrayL);
    analyserR.getByteTimeDomainData(arrayR);

    // Calculate RMS for each channel
    let sumL = 0, sumR = 0;
    let maxL = 0, maxR = 0;
    for (let j = 0; j < arrayL.length; j++) {
      const vL = (arrayL[j] - 128) / 128;
      sumL += vL * vL;
      if (Math.abs(vL) > maxL) maxL = Math.abs(vL);
      const vR = (arrayR[j] - 128) / 128;
      sumR += vR * vR;
      if (Math.abs(vR) > maxR) maxR = Math.abs(vR);
    }
    const rmsL = Math.sqrt(sumL / arrayL.length);
    const rmsR = Math.sqrt(sumR / arrayR.length);

    // Convert RMS to dB, then to a 0-1 scale for the meter
    function rmsToDb(rms) {
      return rms > 0 ? 20 * Math.log10(rms) : -96;
    }
    const minDb = -48;
    const maxDb = 0;
    let dbL = rmsToDb(rmsL);
    let dbR = rmsToDb(rmsR);

    let percentL = (dbL - minDb) / (maxDb - minDb);
    let percentR = (dbR - minDb) / (maxDb - minDb);

    percentL = Math.max(0, Math.min(1, percentL));
    percentR = Math.max(0, Math.min(1, percentR));

    // Use both RMS and max sample value to detect silence
    const isSilentL = (rmsL < 0.001 && maxL < 0.001);
    const isSilentR = (rmsR < 0.001 && maxR < 0.001);

    drawTrackVUMeter(canvasL, (isSilentL ? 0 : percentL), color);
    drawTrackVUMeter(canvasR, (isSilentR ? 0 : percentR), color);
  }
  requestAnimationFrame(updateTrackVUMeters);
}
updateTrackVUMeters();

