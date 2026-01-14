// ======================================================
//  EXPORT FULL SONG AS WAV (DAW‑GRADE QUALITY)
// ======================================================

// Prevent OfflineAudioContext fade-in at time 0
const EXPORT_START_OFFSET = 0.05; // 5ms


window.exportSong = async function() {
  // ------------------------------------------------------
  // 1. Find the last bar in the song
  // ------------------------------------------------------
let lastBar = 0;

window.clips.forEach(clip => {
  const bars = clip.bars || 1;
  const clipEnd = clip.startBar + bars;
  if (clipEnd > lastBar) lastBar = clipEnd;
});


  if (lastBar === 0) {
    alert("No clips to export.");
    return;
  }

  // ------------------------------------------------------
  // 2. Convert bars → seconds
  // ------------------------------------------------------
  const durationSeconds = window.barsToSeconds(lastBar);

  // ------------------------------------------------------
  // 3. Create OfflineAudioContext
  // ------------------------------------------------------
  const sampleRate = 44100;
  const offline = new OfflineAudioContext(
    2, // stereo
    durationSeconds * sampleRate,
    sampleRate
  );

  // ------------------------------------------------------
  // 4. Master chain: Gain → Limiter → Destination
  // ------------------------------------------------------
  const masterGain = offline.createGain();

  // Mute master at time 0
  masterGain.gain.setValueAtTime(0, 0);

  // Jump to full level at the offset
  masterGain.gain.setValueAtTime(0.89, EXPORT_START_OFFSET);



  const limiter = offline.createDynamicsCompressor();
  limiter.threshold.value = -1.0;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.release.value = 0.050;

  // Force attack = 0 at time 0
  limiter.attack.setValueAtTime(0, 0);

  // Restore your intended attack after the offset
  limiter.attack.setValueAtTime(0.003, EXPORT_START_OFFSET);



  masterGain.connect(limiter);
  limiter.connect(offline.destination);

// ------------------------------------------------------
// 4B. Create offline track gains + panners (for MIDI + audio)
// ------------------------------------------------------
const offlineTrackGains = [];
const offlineTrackPans = [];

for (let i = 0; i < window.trackGains.length; i++) {
  const g = offline.createGain();
  g.gain.value = window.trackGains[i].gain.value;

  const p = offline.createStereoPanner();
  p.pan.value = window.trackPanners[i].pan.value;


  g.connect(p);
  p.connect(masterGain);

  offlineTrackGains.push(g);
  offlineTrackPans.push(p);
}


// ------------------------------------------------------
// 5. Schedule all clips (loops + dropped audio)
// ------------------------------------------------------
window.clips.forEach(clip => {
  let buffer = null;
  let bpm = window.BPM;
  let bars = clip.bars || 1;

  // CASE A: Library loop
  if (clip.loopId) {
    const loopData = window.loopBuffers.get(clip.loopId);
    if (!loopData) return;

    buffer = loopData.buffer;
    bpm = loopData.bpm;
    bars = loopData.bars;

  // CASE B: Dropped audio
  } else if (clip.audioBuffer) {
    buffer = clip.audioBuffer;
    bpm = clip.bpm || window.BPM;
    bars = clip.bars;
  }

  if (!buffer) return;

  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = window.BPM / bpm;

  // ⭐ Correct routing: use shared offline mixer
  const trackIndex = clip.trackIndex ?? 0;
  src.connect(offlineTrackGains[trackIndex]);

  const when = EXPORT_START_OFFSET + window.barsToSeconds(clip.startBar);
  src.start(when);
});


// ------------------------------------------------------
// 5B. Schedule MIDI clips
// ------------------------------------------------------
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
  const renderedBuffer = await offline.startRendering();

  // ------------------------------------------------------
  // 7. Final normalization to -1 dB
  // ------------------------------------------------------
  normalizeToMinus1dB(renderedBuffer);

  // ------------------------------------------------------
  // 8. Convert to WAV and download
  // ------------------------------------------------------
  const wavBlob = bufferToWavBlob(renderedBuffer);
  triggerDownload(wavBlob, "rewired_export.wav");
};


// ======================================================
//  NORMALIZE FINAL BUFFER TO -1 dB
// ======================================================

function normalizeToMinus1dB(buffer) {
  let peak = 0;

  // Find peak
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      peak = Math.max(peak, Math.abs(data[i]));
    }
  }

  if (peak < 0.00001) return; // silent

  const target = 0.89; // -1 dB
  const scale = target / peak;

  // Apply gain
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] *= scale;
    }
  }
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
