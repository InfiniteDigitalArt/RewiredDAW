window.audioContext = new (window.AudioContext || window.webkitAudioContext)();



window.defaultMidiSampleBuffer = null;
window.defaultMidiSampleName = "LD-1.wav";


async function loadDefaultMidiSample() {
  const url =
    "https://dl.dropboxusercontent.com/scl/fi/kouvzt916w2y4bnqc4cva/LD-1.wav?rlkey=q4q2qz72p91b6ueaqo8gplws9&st=pdc37b5y";

  const res = await fetch(url);
  const arrayBuf = await res.arrayBuffer();
  window.defaultMidiSampleBuffer = await audioContext.decodeAudioData(arrayBuf);

  
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
window.masterGain.gain.value = 1.0;

// Create stereo splitter for master
const masterSplitter = audioContext.createChannelSplitter(2);
window.masterAnalyserLeft = audioContext.createAnalyser();
window.masterAnalyserRight = audioContext.createAnalyser();
window.masterAnalyserLeft.fftSize = 256;
window.masterAnalyserRight.fftSize = 256;

// Create merger to combine back to stereo
const masterMerger = audioContext.createChannelMerger(2);

// Master → splitter → [analysers] → merger → speakers
window.masterGain.connect(masterSplitter);
masterSplitter.connect(window.masterAnalyserLeft, 0);
masterSplitter.connect(window.masterAnalyserRight, 1);
window.masterAnalyserLeft.connect(masterMerger, 0, 0);
window.masterAnalyserRight.connect(masterMerger, 0, 1);
masterMerger.connect(audioContext.destination);

// Keep old masterAnalyser for backwards compatibility
window.masterAnalyser = window.masterAnalyserLeft;


/* -------------------------------------------------------
   TRACK GAIN + ANALYSER NODES
------------------------------------------------------- */


window.trackGains = [];
window.trackLowpassFilters = [];
window.trackStereoWidthNodes = [];
window.trackPanners = [];
window.trackAnalysers = [];
window.trackAnalysersLeft = [];
window.trackAnalysersRight = [];
window.trackSplitters = [];
window.trackFxChains = []; // Array of arrays - each track has an FX chain

// --- Update FX Chain Connections for a Track ---
window.updateTrackFxChain = function(trackIndex) {
  const lowpass = window.trackLowpassFilters[trackIndex];
  const panner = window.trackPanners[trackIndex];
  const fxChain = window.trackFxChains[trackIndex];

  // Disconnect lowpass from all outputs
  try { lowpass.disconnect(); } catch(e) {}
  // Disconnect all FX nodes
  if (fxChain && fxChain.length) {
    fxChain.forEach((fx, i) => {
      try { fx.disconnect && fx.disconnect(); } catch(e) {}
    });
  }

  // Reconnect: lowpass -> [fx1 -> fx2 ...] -> panner
  if (fxChain && fxChain.length) {
    // Connect lowpass to first FX
    lowpass.connect(fxChain[0].input || fxChain[0]);
    // Chain all FX nodes
    for (let i = 0; i < fxChain.length - 1; i++) {
      const out = fxChain[i].output || fxChain[i];
      const nextIn = fxChain[i+1].input || fxChain[i+1];
      out.connect(nextIn);
    }
    // Last FX to panner
    const lastOut = fxChain[fxChain.length-1].output || fxChain[fxChain.length-1];
    lastOut.connect(panner);
  } else {
    // No FX: connect lowpass directly to panner
    lowpass.connect(panner);
  }
};


// --- Stereo Width Node Constructor ---


function createStereoWidthNode(ctx, initialWidth = 0.5) {
  // Mid/Side matrix for width control (corrected)
  const input = ctx.createGain();
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  input.connect(splitter);

  // Mid = (L+R)/2, Side = (L-R)/2
  const midGainL = ctx.createGain();
  const midGainR = ctx.createGain();
  const sideGainL = ctx.createGain();
  const sideGainR = ctx.createGain();

  splitter.connect(midGainL, 0); // L
  splitter.connect(midGainR, 1); // R
  splitter.connect(sideGainL, 0); // L
  splitter.connect(sideGainR, 1); // R

  // Set up for mid: (L+R)/2, side: (L-R)/2
  midGainL.gain.value = 0.5;
  midGainR.gain.value = 0.5;
  sideGainL.gain.value = 0.5;
  sideGainR.gain.value = -0.5;

  // Mid and side nodes
  const midNode = ctx.createGain();
  const sideNode = ctx.createGain();
  midGainL.connect(midNode);
  midGainR.connect(midNode);
  sideGainL.connect(sideNode);
  sideGainR.connect(sideNode);

  // Width control: adjust sideNode.gain
  function setStereoWidth(width) {
    // width: 0 = mono, 0.5 = normal, 1 = double side
    // At 0: only mid (mono), at 0.5: normal, at 1: side doubled
    sideNode.gain.value = width * 2; // 0 = mono, 1 = normal, 2 = double
  }
  setStereoWidth(initialWidth);

  // Convert back to L/R:
  // L = Mid + Side
  // R = Mid - Side
  const sumL = ctx.createGain();
  const sumR = ctx.createGain();
  midNode.connect(sumL);
  sideNode.connect(sumL);
  midNode.connect(sumR);
  // For R: mid - side, so invert sideNode for R
  const inverter = ctx.createGain();
  inverter.gain.value = -1;
  sideNode.connect(inverter);
  inverter.connect(sumR);

  sumL.connect(merger, 0, 0); // Left
  sumR.connect(merger, 0, 1); // Right

  return {
    input,
    output: merger,
    setStereoWidth,
    get width() { return sideNode.gain.value / 2; },
    set width(val) { setStereoWidth(val); }
  };
}



for (let i = 0; i < 16; i++) {
  const gain = audioContext.createGain();
  gain.gain.value = 1.0;

  // Per-track lowpass filter
  const lowpass = audioContext.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = (window.mixerLowpassValues && window.mixerLowpassValues[i]) || 20000;
  lowpass.Q.value = 0.7;
  window.trackLowpassFilters.push(lowpass);

  // Panner node (now before stereo width)
  const panner = audioContext.createStereoPanner();
  panner.pan.value = 0; // center
  window.trackPanners.push(panner);

  // Stereo width node (now after panner)
  const stereoWidth = createStereoWidthNode(audioContext, (window.mixerStereoValues && window.mixerStereoValues[i]) ?? 0.5);
  window.trackStereoWidthNodes.push(stereoWidth);

  // Create stereo splitter and dual analysers
  const splitter = audioContext.createChannelSplitter(2);
  const analyserLeft = audioContext.createAnalyser();
  const analyserRight = audioContext.createAnalyser();
  analyserLeft.fftSize = 256;
  analyserRight.fftSize = 256;

  // Create a merger to combine back to stereo for master
  const merger = audioContext.createChannelMerger(2);

  // Initialize empty FX chain for this track
  const fxChain = [];
  window.trackFxChains.push(fxChain);


  // Track → gain → lowpass → (FX chain inserted here) → panner → stereoWidth → splitter → [analysers] → merger → master
  gain.connect(lowpass);
  // FX chain will be inserted between lowpass and panner at runtime
  // Initial connection: lowpass to panner (no FX yet)
  lowpass.connect(panner);
  panner.connect(stereoWidth.input);
  stereoWidth.output.connect(splitter);
  splitter.connect(analyserLeft, 0);
  splitter.connect(analyserRight, 1);
  analyserLeft.connect(merger, 0, 0);
  analyserRight.connect(merger, 0, 1);
  merger.connect(window.masterGain);

  window.trackGains.push(gain);
  window.trackAnalysers.push(analyserLeft); // Keep for backwards compatibility
  window.trackAnalysersLeft.push(analyserLeft);
  window.trackAnalysersRight.push(analyserRight);
  window.trackSplitters.push(splitter);
}

// Allow mixer to update lowpass filter in realtime
window.setTrackLowpass = function(trackIndex, freq) {
  if (window.trackLowpassFilters && window.trackLowpassFilters[trackIndex]) {
    window.trackLowpassFilters[trackIndex].frequency.value = freq;
  }
  if (window.mixerLowpassValues) {
    window.mixerLowpassValues[trackIndex] = freq;
  }
};


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

  source._clipBpm = clipBpm;

  // --- APPLY FADE ENVELOPE ---
  let gainNode = null;
  if (clip.fadeIn > 0 || clip.fadeOut > 0) {
    gainNode = audioContext.createGain();
    source.connect(gainNode);
    gainNode.connect(window.trackGains[clip.trackIndex]);
  } else {
    source.connect(window.trackGains[clip.trackIndex]);
  }

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

  // Apply fade envelope
  if (gainNode) {
    applyFadeEnvelope(gainNode, clip, when, dur);
  }

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

  if (offsetSeconds >= visibleDuration) return;

  let safeDuration = Math.min(
    sourceDuration - offsetSeconds,
    visibleDuration - offsetSeconds
  );
  if (!isFinite(safeDuration) || safeDuration <= 0.001) safeDuration = 0.001;

  // Apply fade envelope with offset
  if (gainNode) {
    const fadeInSeconds = barsToSeconds(clip.fadeIn);
    const fadeOutSeconds = barsToSeconds(clip.fadeOut);
    const totalDuration = visibleDuration;
    
    if (offsetSeconds < fadeInSeconds) {
      // Still in fade-in region
      gainNode.gain.setValueAtTime(offsetSeconds / fadeInSeconds, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(1, audioContext.currentTime + (fadeInSeconds - offsetSeconds));
    } else {
      gainNode.gain.setValueAtTime(1, audioContext.currentTime);
    }
    
    // Fade out
    if (fadeOutSeconds > 0) {
      const fadeOutStart = totalDuration - fadeOutSeconds;
      if (offsetSeconds < fadeOutStart) {
        const fadeOutTime = audioContext.currentTime + (fadeOutStart - offsetSeconds);
        gainNode.gain.setValueAtTime(1, fadeOutTime);
        gainNode.gain.linearRampToValueAtTime(0, fadeOutTime + fadeOutSeconds);
      }
    }
  }

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

// Helper function to apply fade envelope
function applyFadeEnvelope(gainNode, clip, startTime, duration) {
  const fadeInSeconds = barsToSeconds(clip.fadeIn || 0);
  const fadeOutSeconds = barsToSeconds(clip.fadeOut || 0);
  
  // Fade in
  if (fadeInSeconds > 0) {
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(1, startTime + fadeInSeconds);
  } else {
    gainNode.gain.setValueAtTime(1, startTime);
  }
  
  // Fade out
  if (fadeOutSeconds > 0 && duration >= fadeOutSeconds) {
    const fadeOutStart = startTime + duration - fadeOutSeconds;
    gainNode.gain.setValueAtTime(1, fadeOutStart);
    gainNode.gain.linearRampToValueAtTime(0, fadeOutStart + fadeOutSeconds);
  }
}

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