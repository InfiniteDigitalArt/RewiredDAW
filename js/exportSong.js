// ======================================================
//  EXPORT FULL SONG AS WAV (DAW‑GRADE QUALITY)
// ======================================================

// Prevent OfflineAudioContext fade-in at time 0
const EXPORT_START_OFFSET = 0.1;

/**
 * Build a FX chain for a track during export
 * Applies all active effects from trackFxSlots
 * @param {OfflineAudioContext} offline - The offline context
 * @param {number} trackIndex - Track index (0-15)
 * @returns {Object} - { input, output } nodes
 */

function createStereoWidthNodeExport(ctx, width = 0.5) {
  // Mid/Side matrix for width control (same as audioEngine.js)
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

  const midSum = ctx.createGain();
  midGainL.connect(midSum);
  midGainR.connect(midSum);
  const sideSum = ctx.createGain();
  sideGainL.connect(sideSum);
  sideGainR.connect(sideSum);

  const outL = ctx.createGain();
  const outR = ctx.createGain();
  midSum.connect(outL);
  sideSum.connect(outL);
  midSum.connect(outR);
  sideSum.connect(outR);

  outL.connect(merger, 0, 0);
  outR.connect(merger, 0, 1);

  // Set width
  function setStereoWidth(w) {
    const mid = 0.5;
    const side = w;
    midGainL.gain.value = mid;
    midGainR.gain.value = mid;
    sideGainL.gain.value = side * 0.5;
    sideGainR.gain.value = -side * 0.5;
  }
  setStereoWidth(width);

  return { input, output: merger, setStereoWidth };
}

function buildTrackFxChainForExport(offline, trackIndex) {
  // Get FX slots for this track in order (preserve slot order)
  const trackFxSlots = window.trackFxSlots?.[trackIndex] || [];

  // If no effects, return a pass-through gain
  const input = offline.createGain();
  let currentNode = input;

  // --- Insert per-track lowpass filter before FX chain ---
  const lowpass = offline.createBiquadFilter();
  lowpass.type = 'lowpass';
  let freq = 20000;
  if (window.mixerLowpassValues && window.mixerLowpassValues[trackIndex] !== undefined) {
    freq = window.mixerLowpassValues[trackIndex];
  }
  lowpass.frequency.value = freq;
  lowpass.Q.value = 0.7;
  currentNode.connect(lowpass);
  currentNode = lowpass;

  // --- FX chain (insert all effects here) ---
  trackFxSlots.forEach(slot => {
    if (!slot || slot.type === 'empty' || !slot.type) return;

    if (slot.type === 'reverb' && window.ReverbEffect) {
      const reverb = new window.ReverbEffect(offline);
      if (slot.params && reverb.setParams) {
        reverb.setParams(slot.params);
      }
      currentNode.connect(reverb.input);
      currentNode = reverb.output;
    } else if (slot.type === 'distortion' && window.DistortionEffect) {
      const distortion = new window.DistortionEffect(offline);
      if (slot.params && distortion.setParams) {
        distortion.setParams(slot.params);
      }
      currentNode.connect(distortion.input);
      currentNode = distortion.output;
    } else if (slot.type === 'lowhighcut' && window.LowHighCutEffect) {
      const lowhighcut = new window.LowHighCutEffect(offline);
      if (slot.params && lowhighcut.setParams) {
        lowhighcut.setParams(slot.params);
      }
      currentNode.connect(lowhighcut.input);
      currentNode = lowhighcut.output;
    }
  });

  // --- Panner node (after FX) ---
  const panner = offline.createStereoPanner();
  panner.pan.value = (window.mixerPanValues && window.mixerPanValues[trackIndex]) || 0;
  currentNode.connect(panner);
  currentNode = panner;

  // --- Stereo width node (after panner) ---
  let stereoWidthVal = 0.5;
  if (window.mixerStereoValues && window.mixerStereoValues[trackIndex] !== undefined) {
    stereoWidthVal = window.mixerStereoValues[trackIndex];
  }
  const stereoWidth = createStereoWidthNodeExport(offline, stereoWidthVal);
  currentNode.connect(stereoWidth.input);
  currentNode = stereoWidth.output;

  return { input, output: currentNode };
}

// ======================================================
//  MASTERING CHAIN PRESETS
// ======================================================

function createPreMasterChain(offline) {
  // Simple clean chain with makeup gain
  // Input will be normalized to -6dB, so we need to restore to -6dB output
  const masterGain = offline.createGain();
  
  // Mute master at time 0
  masterGain.gain.setValueAtTime(0, 0);
  
  // Jump to full level at the offset
  // Target is -6dB (0.501 amplitude), input is -6dB, so gain = 1.0
  masterGain.gain.setValueAtTime(1.0, EXPORT_START_OFFSET);
  
  return masterGain;
}

function createClubMasterChain(offline) {
  // CLUB MASTER: Professional mastering chain for loud, punchy dance tracks
  // Simplified to keep bass intact
  
  // ===== 1. HIGH-PASS FILTER (20 Hz only) =====
  const highPass = offline.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = 20;
  highPass.Q.value = 0.7071;
  
  // ===== 2. TONAL EQ (3-band parametric) =====
  // +1-2 dB @ 60-90 Hz (bass boost)
  const eqLow = offline.createBiquadFilter();
  eqLow.type = "peaking";
  eqLow.frequency.value = 75;
  eqLow.gain.value = 1.5;
  eqLow.Q.value = 0.7;
  
  // -1 dB @ 250-350 Hz (mud reduction)
  const eqMid = offline.createBiquadFilter();
  eqMid.type = "peaking";
  eqMid.frequency.value = 300;
  eqMid.gain.value = -1.0;
  eqMid.Q.value = 0.7;
  
  // +0.5-1 dB @ 8-12 kHz (presence/air)
  const eqHigh = offline.createBiquadFilter();
  eqHigh.type = "peaking";
  eqHigh.frequency.value = 10000;
  eqHigh.gain.value = 0.75;
  eqHigh.Q.value = 0.7;
  
  // ===== 3. GENTLE GLUE COMPRESSION =====
  const glueComp = offline.createDynamicsCompressor();
  glueComp.threshold.value = -18;
  glueComp.knee.value = 6;
  glueComp.ratio.value = 2;
  glueComp.attack.setValueAtTime(0, 0);
  glueComp.attack.setValueAtTime(0.020, EXPORT_START_OFFSET);
  glueComp.release.value = 0.120;
  
  // ===== 4. SATURATION / HARMONIC ENHANCER =====
  const saturation = offline.createWaveShaper();
  saturation.curve = makeSaturationCurve(2048, 10); // 10% drive
  saturation.oversample = "4x";
  
  // ===== 5. PRE-LIMITER MAKEUP GAIN =====
  const makeupGain = offline.createGain();
  makeupGain.gain.setValueAtTime(0, 0);
  // Input is normalized to -6dB (0.501), reduced to 1.6 for more dynamics
  // This allows the limiter to work less aggressively while still reaching ~-1dB
  makeupGain.gain.setValueAtTime(1.8, EXPORT_START_OFFSET);
  
  // ===== 6. LIMITER (less aggressive for better dynamics) =====
  const limiter = offline.createDynamicsCompressor();
  limiter.threshold.value = -0.5; // Slightly higher threshold for more headroom
  limiter.knee.value = 3; // Soft knee for more natural limiting
  limiter.ratio.value = 14; // Less aggressive than brick-wall
  limiter.attack.setValueAtTime(0, 0);
  limiter.attack.setValueAtTime(0.002, EXPORT_START_OFFSET); // Slightly longer attack
  limiter.release.value = 0.075; // Longer release for smoother response
  
  // Output gain
  const outputGain = offline.createGain();
  outputGain.gain.value = 1.0;
  
  // ===== ROUTING =====
  highPass.connect(eqLow);
  eqLow.connect(eqMid);
  eqMid.connect(eqHigh);
  eqHigh.connect(glueComp);
  glueComp.connect(saturation);
  saturation.connect(makeupGain);
  makeupGain.connect(limiter);
  limiter.connect(outputGain);
  
  return { input: highPass, output: outputGain };
}

function createStreamingPlatformChain(offline) {
  // STREAMING PLATFORM: Optimized for Spotify, Apple Music, SoundCloud
  // Target: -14 LUFS (streaming standard), preserve dynamics, minimize loudness compression
  
  // ===== 1. HIGH-PASS FILTER (20 Hz only) =====
  const highPass = offline.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = 20;
  highPass.Q.value = 0.7071;
  
  // ===== 2. SUBTLE TONAL EQ =====
  // +0.5 dB @ 60-90 Hz (gentle bass presence)
  const eqLow = offline.createBiquadFilter();
  eqLow.type = "peaking";
  eqLow.frequency.value = 75;
  eqLow.gain.value = 0.5;
  eqLow.Q.value = 0.7;
  
  // -0.5 dB @ 250-350 Hz (slight mud reduction)
  const eqMid = offline.createBiquadFilter();
  eqMid.type = "peaking";
  eqMid.frequency.value = 300;
  eqMid.gain.value = -0.5;
  eqMid.Q.value = 0.7;
  
  // +0.3 dB @ 8-12 kHz (minimal presence)
  const eqHigh = offline.createBiquadFilter();
  eqHigh.type = "peaking";
  eqHigh.frequency.value = 10000;
  eqHigh.gain.value = 0.3;
  eqHigh.Q.value = 0.7;
  
  // ===== 3. LIGHT COMPRESSION (preserve dynamics) =====
  const lightComp = offline.createDynamicsCompressor();
  lightComp.threshold.value = -12;
  lightComp.knee.value = 8;
  lightComp.ratio.value = 1.3; // Very gentle
  lightComp.attack.setValueAtTime(0, 0);
  lightComp.attack.setValueAtTime(0.040, EXPORT_START_OFFSET);
  lightComp.release.value = 0.200; // Slower release
  
  // ===== 4. MINIMAL SATURATION =====
  const saturation = offline.createWaveShaper();
  saturation.curve = makeSaturationCurve(2048, 2); // 2% subtle warmth
  saturation.oversample = "2x";
  
  // ===== 5. GENTLE PRE-LIMITER GAIN =====
  const makeupGain = offline.createGain();
  makeupGain.gain.setValueAtTime(0, 0);
  // Input is normalized to -6dB (0.501), target output is -1dBTP (0.89)
  // Makeup gain needed: 0.89 / 0.501 ≈ 1.78 ≈ +5 dB
  makeupGain.gain.setValueAtTime(1.78, EXPORT_START_OFFSET);
  
  // ===== 6. SOFT-KNEE LIMITER (prevent clipping) =====
  const limiter = offline.createDynamicsCompressor();
  limiter.threshold.value = -2.0; // Softer ceiling
  limiter.knee.value = 6; // Soft knee
  limiter.ratio.value = 8; // Less aggressive
  limiter.attack.setValueAtTime(0, 0);
  limiter.attack.setValueAtTime(0.005, EXPORT_START_OFFSET); // Slower attack
  limiter.release.value = 0.080; // Longer release
  
  // Output gain
  const outputGain = offline.createGain();
  outputGain.gain.value = 1.0;
  
  // ===== ROUTING =====
  highPass.connect(eqLow);
  eqLow.connect(eqMid);
  eqMid.connect(eqHigh);
  eqHigh.connect(lightComp);
  lightComp.connect(saturation);
  saturation.connect(makeupGain);
  makeupGain.connect(limiter);
  limiter.connect(outputGain);
  
  return { input: highPass, output: outputGain };
}

// Helper: Create saturation curve for waveshaper
function makeSaturationCurve(samples, amount) {
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  const k = amount / 100; // 0-1 range for subtle effect
  
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  
  return curve;
}


window.exportSong = async function(preset = "premaster", songTitle = "Untitled", presetName = "Pre-Master") {
  // Show loading bar
  window.showLoadingBar("Exporting...");
  window.updateLoadingBar(5, "Finding clips...");

  // ------------------------------------------------------
  // 1. Find the last bar in the song based on clip durations
  // Clip.bars determines the actual playback duration at project BPM
  // ------------------------------------------------------
let lastBar = 0;

window.clips.forEach(clip => {
  // For audio clips, the bars value determines timeline duration
  // For MIDI clips, use clip.bars directly
  const bars = clip.bars || 1;
  const clipEnd = clip.startBar + bars;
  if (clipEnd > lastBar) lastBar = clipEnd;
});


  if (lastBar === 0) {
    alert("No clips to export.");
    window.hideLoadingBar();
    return;
  }

  window.updateLoadingBar(15, "Setting up audio context...");

  // ------------------------------------------------------
  // 2. Convert bars → seconds
  // ------------------------------------------------------
  const durationSeconds = window.barsToSeconds(lastBar) + EXPORT_START_OFFSET;

  // DEBUG: Log what we're rendering
  console.log("EXPORT DEBUG - OfflineAudioContext setup:", {
    lastBar,
    durationSeconds,
    barsToSecondsValue: window.barsToSeconds(lastBar),
    projectBpm: window.BPM,
    barsPerSecond: window.BPM / 120,
  });

  // ------------------------------------------------------
  // 3. Create OfflineAudioContext
  // ------------------------------------------------------
  window.updateLoadingBar(5, "Creating offline context...");
  const sampleRate = 48000; // Match your audio file sample rate
  const offline = new OfflineAudioContext(
    2, // stereo
    durationSeconds * sampleRate,
    sampleRate
  );

  // ------------------------------------------------------
  // 4. Master chain based on preset
  // ------------------------------------------------------
  window.updateLoadingBar(10, "Building mastering chain...");
  let masterInput;
  
  if (preset === "clubmaster") {
    // CLUB MASTER preset
    const chain = createClubMasterChain(offline);
    masterInput = chain.input;
    chain.output.connect(offline.destination);
  } else if (preset === "streaming") {
    // STREAMING PLATFORM preset
    const chain = createStreamingPlatformChain(offline);
    masterInput = chain.input;
    chain.output.connect(offline.destination);
  } else {
    // PRE-MASTER preset (default)
    masterInput = createPreMasterChain(offline);
    masterInput.connect(offline.destination);
  }

// ------------------------------------------------------
// 4B. Create offline track gains + panners + FX chains
// ------------------------------------------------------
window.updateLoadingBar(15, "Setting up tracks and effects...");
const offlineTrackGains = [];
const offlineTrackPans = [];
const offlineTrackFxChains = [];

for (let i = 0; i < window.trackGains.length; i++) {
  const g = offline.createGain();
  // Combine mixer fader and track control volume
  const mixerFader = window.mixerFaderValues ? window.mixerFaderValues[i] : 1.0;
  const trackControlVol = (window.trackStates && window.trackStates[i]) ? window.trackStates[i].volume : 1.0;
  g.gain.value = mixerFader * trackControlVol;

  const p = offline.createStereoPanner();
  p.pan.value = window.trackPanners[i].pan.value;

  // Build FX chain for this track
  const fxChain = buildTrackFxChainForExport(offline, i);
  // Routing: gain → FX chain input → FX chain output → panner → master
  g.connect(fxChain.input);
  fxChain.output.connect(p);
  p.connect(masterInput);

  offlineTrackGains.push(g);
  offlineTrackPans.push(p);
  offlineTrackFxChains.push(fxChain);
}


// ------------------------------------------------------
// 5. Schedule all clips (loops + dropped audio)
// ------------------------------------------------------
window.updateLoadingBar(25, "Scheduling audio clips...");
window.clips.forEach(clip => {
  console.log("Processing clip:", { clipId: clip.clipId, type: clip.type, hasAudioBuffer: !!clip.audioBuffer, hasLoopId: !!clip.loopId });
  
  let buffer = null;
  let bpm = window.BPM;
  let bars = clip.bars || 1;

  // CASE B: Dropped audio (check first - prioritize over loopId for accurate playback)
  if (clip.audioBuffer && clip.sourceBpm) {
    buffer = clip.audioBuffer;
    bpm = clip.sourceBpm || clip.bpm || window.BPM;
    bars = clip.bars;

  // CASE A: Library loop
  } else if (clip.loopId) {
    const loopData = window.loopBuffers.get(clip.loopId);
    if (!loopData) return;

    buffer = loopData.buffer;
    bpm = loopData.bpm;
  }

  if (!buffer) return;

  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = window.BPM / bpm;

  // DEBUG: Log the clip details
  if (clip.audioBuffer && clip.sourceBpm) {
    console.log("=== FULL CLIP DEBUG (Clip at bar " + clip.startBar + ") ===");
    console.log("Buffer info:", {
      bufferDuration: buffer.duration,
      bufferLength: buffer.length,
      bufferSampleRate: buffer.sampleRate,
    });
    console.log("Clip properties:", {
      bars: clip.bars,
      originalBars: clip.originalBars,
      sourceBpm: clip.sourceBpm,
      startOffset: clip.startOffset,
    });
    console.log("Calculations:", {
      projectBpm: window.BPM,
      playbackRate: src.playbackRate.value,
      expectedTimelineSeconds: window.barsToSeconds(bars),
    });
    console.log("===================================");
  }

  // Respect trimming/slip the same way as realtime playback
  // For dropped audio clips with sourceBpm, use bars directly (don't pull from loop)
  let playbackBars = bars;
  if (!isFinite(playbackBars) || playbackBars <= 0) {
    // Fallback only if bars is invalid
    const fallbackOriginalBars = (clip.loopId && window.loopBuffers.get(clip.loopId)?.bars) || bars || 1;
    const originalBars = (clip.originalBars && clip.originalBars > 0)
      ? clip.originalBars
      : fallbackOriginalBars;
    playbackBars = Math.max(0.0001, originalBars);
  }

  // Support slip editing offsets (in buffer seconds)
  const startOffset = Math.max(0, clip.startOffset || 0);

  // Actual buffer duration in seconds
  const sourceBufferDuration = buffer.duration || 0;

  // Desired timeline duration based on clip bars and project tempo
  const desiredTimelineSeconds = window.barsToSeconds(playbackBars);

  // Available buffer duration after offset
  const availableBufferDuration = Math.max(0, sourceBufferDuration - startOffset);

  // Convert desired timeline to buffer seconds using playback rate
  // and clamp to actual available buffer duration
  const playableDurationAtPlaybackRate = desiredTimelineSeconds * src.playbackRate.value;
  const actualPlaybackDuration = Math.min(playableDurationAtPlaybackRate, availableBufferDuration);

  // DEBUG: Log all calculations
  if (clip.audioBuffer && clip.sourceBpm) {
    console.log("EXPORT DEBUG - Duration Calculations:", {
      sourceBufferDuration,
      startOffset,
      availableBufferDuration,
      desiredTimelineSeconds,
      playbackRate: src.playbackRate.value,
      playableDurationAtPlaybackRate,
      actualPlaybackDuration,
      limitedBy: actualPlaybackDuration === availableBufferDuration ? "buffer length" : "playback calculation",
    });
  }

  // Only prevent obviously invalid durations
  if (actualPlaybackDuration <= 0) return; // nothing audible

  // ⭐ FIX: Define trackIndex before using it
  const trackIndex = clip.trackIndex ?? 0;

  // ⭐ Apply fade envelope for audio clips
  let destination = offlineTrackGains[trackIndex];
  if (clip.type === "audio" && (clip.fadeIn > 0 || clip.fadeOut > 0)) {
    const fadeGain = offline.createGain();
    src.connect(fadeGain);
    fadeGain.connect(destination);
    destination = fadeGain;

    const when = EXPORT_START_OFFSET + window.barsToSeconds(clip.startBar);
    const fadeInSeconds = window.barsToSeconds(clip.fadeIn || 0);
    const fadeOutSeconds = window.barsToSeconds(clip.fadeOut || 0);
    // Clip duration in seconds at project BPM (after playback rate adjustment)
    const clipDurationSeconds = actualPlaybackDuration / Math.max(0.0001, src.playbackRate.value);

    // Fade in
    if (fadeInSeconds > 0) {
      fadeGain.gain.setValueAtTime(0, when);
      fadeGain.gain.linearRampToValueAtTime(1, when + Math.min(fadeInSeconds, clipDurationSeconds));
    } else {
      fadeGain.gain.setValueAtTime(1, when);
    }

    // Fade out
    if (fadeOutSeconds > 0) {
      const fadeOutStart = when + Math.max(0, clipDurationSeconds - fadeOutSeconds);
      fadeGain.gain.setValueAtTime(1, fadeOutStart);
      fadeGain.gain.linearRampToValueAtTime(0, fadeOutStart + fadeOutSeconds);
    }
  } else {
    src.connect(destination);
  }

  const when = EXPORT_START_OFFSET + window.barsToSeconds(clip.startBar);
  src.start(when, startOffset, actualPlaybackDuration);

  // DEBUG: Log what we're passing to src.start
  if (clip.audioBuffer && clip.sourceBpm) {
    console.log("EXPORT DEBUG - src.start() call:", {
      when,
      startOffset,
      actualPlaybackDuration,
      expectedOutputDuration: actualPlaybackDuration / src.playbackRate.value,
    });
  }
});


// ------------------------------------------------------
// 5B. Schedule MIDI clips
// ------------------------------------------------------
window.updateLoadingBar(35, "Scheduling MIDI clips...");
window.clips.forEach(clip => {
  if (clip.type !== "midi") return;
  if (!Array.isArray(clip.notes) || clip.notes.length === 0) return;

  const trackIndex = clip.trackIndex ?? 0;

const synth = new BasicSawSynthForContext(
  offline,
  offlineTrackGains[trackIndex],
  clip.sampleBuffer,
  window.makeSmallReverbBuffer(offline),     // ⭐ same impulse as realtime
  clip.reverbGain.gain.value                 // ⭐ per‑clip wet amount
);




  const clipLengthBars = clip.bars;

  clip.notes.forEach(note => {
    const noteStartBarsLocal = (note.start || 0) / 4;
    const noteEndBarsLocal   = (note.end   || 0) / 4;

    if (noteStartBarsLocal >= clipLengthBars) return;

    const clampedEndBarsLocal = Math.min(noteEndBarsLocal, clipLengthBars);

    const absoluteStartBars = clip.startBar + noteStartBarsLocal;
    const startTime = EXPORT_START_OFFSET + window.barsToSeconds(absoluteStartBars);


    const durationBars = clampedEndBarsLocal - noteStartBarsLocal;
    const durationSec  = window.barsToSeconds(durationBars);

    if (durationSec <= 0) return;

    synth.playNote(
      note.pitch,
      startTime,
      durationSec,
      note.velocity || 0.8
    );
  });
});




  // ------------------------------------------------------
  // 6. Render the full mix
  // ------------------------------------------------------
  window.updateLoadingBar(45, "Rendering full mix...");
  const renderedBuffer = await offline.startRendering();
  // DEBUG: Log rendered buffer info
  console.log("EXPORT DEBUG - Rendered Buffer:", {
    renderedLength: renderedBuffer.length,
    renderedDuration: renderedBuffer.length / renderedBuffer.sampleRate,
    expectedLength: durationSeconds * 44100,
    expectedDuration: durationSeconds,
  });
  window.updateLoadingBar(60, "Trimming silence...");

  // ------------------------------------------------------
  // 6B. Trim off the EXPORT_START_OFFSET from the beginning
  // ------------------------------------------------------
  const offsetSamples = Math.floor(EXPORT_START_OFFSET * sampleRate);
  const trimmedLength = renderedBuffer.length - offsetSamples;
  const trimmedBuffer = offline.createBuffer(
    renderedBuffer.numberOfChannels,
    trimmedLength,
    sampleRate
  );
  // DEBUG: Log trimmed buffer info
  console.log("EXPORT DEBUG - Trimmed Buffer:", {
    offsetSamples,
    trimmedLength,
    trimmedDuration: trimmedLength / sampleRate,
  });
  // Copy audio data after the offset
  for (let ch = 0; ch < renderedBuffer.numberOfChannels; ch++) {
    const sourceData = renderedBuffer.getChannelData(ch);
    const destData = trimmedBuffer.getChannelData(ch);
    for (let i = 0; i < trimmedLength; i++) {
      destData[i] = sourceData[i + offsetSamples];
    }
  }

  window.updateLoadingBar(70, "Normalizing to headroom...");

  // ------------------------------------------------------
  // 7. Normalize the mix to -6dB (headroom for mastering)
  // ------------------------------------------------------
  normalizeToTarget(trimmedBuffer, 0.501); // -6dB ≈ 0.501

  window.updateLoadingBar(75, "Applying mastering EQ and compression...");

  // ------------------------------------------------------
  // 8. Apply the mastering chain to the normalized buffer
  // ------------------------------------------------------
  const masteredBuffer = await applyMasteringToNormalizedBuffer(trimmedBuffer, preset);

  window.updateLoadingBar(90, "Finalizing mastered audio...");

  // DEBUG: Log buffer before WAV encoding
  console.log("EXPORT DEBUG - Before WAV Encoding:", {
    masteredBufferLength: masteredBuffer.length,
    masteredBufferDuration: masteredBuffer.length / masteredBuffer.sampleRate,
    channels: masteredBuffer.numberOfChannels,
  });

  // ------------------------------------------------------
  // 9. Convert to WAV and download
  // ------------------------------------------------------
  window.updateLoadingBar(95, "Encoding to WAV...");
  const wavBlob = bufferToWavBlob(masteredBuffer);
  
  // DEBUG: Log WAV blob info
  const wavDurationSeconds = (wavBlob.size - 44) / (2 * 2 * 44100); // assuming stereo, 16-bit
  console.log("EXPORT DEBUG - WAV File Info:", {
    blobSize: wavBlob.size,
    calculatedDuration: wavDurationSeconds,
  });

  // Create filename with song title and preset name
  const filename = `${songTitle} (${presetName}).wav`;
  triggerDownload(wavBlob, filename);
  
  window.updateLoadingBar(100, "Complete!");
  
  // Hide after a brief delay so user sees "Complete!"
  setTimeout(() => {
    window.hideLoadingBar();
  }, 500);
};


// ======================================================
//  NORMALIZE BUFFER TO TARGET LEVEL
// ======================================================

function normalizeToTarget(buffer, targetLevel = 0.97) {
  let peak = 0;

  // Find peak
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      peak = Math.max(peak, Math.abs(data[i]));
    }
  }

  if (peak < 0.00001) return; // silent

  const scale = targetLevel / peak;

  // Apply gain
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] *= scale;
    }
  }
}

// Legacy function for backward compatibility
function normalizeToMinus1dB(buffer) {
  normalizeToTarget(buffer, 0.97);
}

// ======================================================
//  APPLY MASTERING CHAIN TO NORMALIZED BUFFER
// ======================================================
async function applyMasteringToNormalizedBuffer(buffer, preset) {
  const sampleRate = buffer.sampleRate;
  const masteringContext = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    sampleRate
  );

  // Create mastering chain based on preset
  let masteringInput;
  
  if (preset === "clubmaster") {
    const chain = createClubMasterChain(masteringContext);
    masteringInput = chain.input;
    chain.output.connect(masteringContext.destination);
  } else if (preset === "streaming") {
    const chain = createStreamingPlatformChain(masteringContext);
    masteringInput = chain.input;
    chain.output.connect(masteringContext.destination);
  } else {
    // PRE-MASTER preset
    masteringInput = createPreMasterChain(masteringContext);
    masteringInput.connect(masteringContext.destination);
  }

  // Create a buffer source from the normalized audio
  const source = masteringContext.createBufferSource();
  source.buffer = buffer;
  source.connect(masteringInput);
  source.start(0);

  // Render through the mastering chain
  const masteredBuffer = await masteringContext.startRendering();
  return masteredBuffer;
}

// ======================================================
//  WAV ENCODING
// ======================================================

function bufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;

  let samples;
  if (numChannels === 2) {
    const ch1 = buffer.getChannelData(0);
    const ch2 = buffer.getChannelData(1);
    samples = interleave(ch1, ch2);
  } else {
    samples = buffer.getChannelData(0);
  }

  const wavBuffer = encodeWAV(samples, numChannels, sampleRate, bitDepth);
  return new Blob([wavBuffer], { type: "audio/wav" });
}

function interleave(ch1, ch2) {
  const length = ch1.length + ch2.length;
  const result = new Float32Array(length);

  let index = 0;
  for (let i = 0; i < ch1.length; i++) {
    result[index++] = ch1[i];
    result[index++] = ch2[i];
  }
  return result;
}

function encodeWAV(samples, numChannels, sampleRate, bitDepth) {
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  floatTo16BitPCM(view, 44, samples);
  return buffer;
}

function floatTo16BitPCM(view, offset, samples) {
  for (let i = 0; i < samples.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}


// ======================================================
//  DOWNLOAD HELPER
// ======================================================

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}