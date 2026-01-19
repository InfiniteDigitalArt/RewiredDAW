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

window.masterAnalyser = audioContext.createAnalyser();
window.masterAnalyser.fftSize = 256;

// Master → analyser → speakers
window.masterGain.connect(window.masterAnalyser);
window.masterAnalyser.connect(audioContext.destination);


/* -------------------------------------------------------
   TRACK GAIN + ANALYSER NODES
------------------------------------------------------- */
window.trackGains = [];
window.trackPanners = [];
window.trackAnalysers = [];

for (let i = 0; i < 16; i++) {
  const gain = audioContext.createGain();
  gain.gain.value = 0.8;

  const panner = audioContext.createStereoPanner();
  panner.pan.value = 0; // center

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;

  // Track → gain → panner → analyser → master
  gain.connect(panner);
  panner.connect(analyser);
  analyser.connect(window.masterGain);

  window.trackGains.push(gain);
  window.trackPanners.push(panner);
  window.trackAnalysers.push(analyser);
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
  const offsetSeconds = barsIntoClip * secondsPerBarInSource;

  // Cap playback to the trimmed clip length
  if (offsetSeconds >= visibleDuration) return; // already past the trimmed region

  let safeDuration = Math.min(
    sourceDuration - offsetSeconds,
    visibleDuration - offsetSeconds
  );
  if (!isFinite(safeDuration) || safeDuration <= 0.001) safeDuration = 0.001;

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
  const offsetSeconds = wrappedBarsIntoClip * secondsPerBarInSource;

  // Respect trimmed length even when seeking past the end of the clip
  if (offsetSeconds >= visibleDuration) return;

  let safeDuration = Math.min(
    sourceDuration - offsetSeconds,
    visibleDuration - offsetSeconds
  );
  if (!isFinite(safeDuration) || safeDuration <= 0.001) safeDuration = 0.001;

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

