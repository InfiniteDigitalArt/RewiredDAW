/**
 * mixer.js
 * FL Studio-style mixer interface
 */

window.mixer = {
  isOpen: false,
  tracks: [],
  vuUpdateRunning: false
};

/**
 * Initialize the mixer
 */
function initMixer() {
  const container = document.getElementById('mixer-container');
  const closeBtn = document.getElementById('mixer-close');
  
  // Close button
  closeBtn.addEventListener('click', () => {
    closeMixer();
  });
  
  // Generate mixer tracks based on timeline tracks
  generateMixerTracks();
}

/**
 * Open the mixer
 */
function openMixer() {
  const container = document.getElementById('mixer-container');
  container.classList.remove('hidden');
  window.mixer.isOpen = true;
  
  // Refresh tracks in case they've changed
  generateMixerTracks();
  
  // Start VU meter updates if not already running
  if (!window.mixer.vuUpdateRunning) {
    window.mixer.vuUpdateRunning = true;
    updateMixerVUMeters();
  }
}

/**
 * Close the mixer
 */
function closeMixer() {
  const container = document.getElementById('mixer-container');
  container.classList.add('hidden');
  window.mixer.isOpen = false;
}

/**
 * Generate mixer tracks matching timeline tracks
 */
function generateMixerTracks() {
  const tracksContainer = document.getElementById('mixer-tracks-scroll');
  tracksContainer.innerHTML = '';
  
  // Use TRACK_COLORS from timeline.js
  const colors = window.TRACK_COLORS || [
    "#FF4D4D", "#FF884D", "#FFD24D", "#A6E34D", "#4DE38A",
    "#4DD2FF", "#4D88FF", "#A64DFF", "#FF4DE3", "#FF4D88"
  ];
  
  // Create master track first
  const masterTrack = createMasterTrack();
  tracksContainer.appendChild(masterTrack);
  window.mixer.masterTrack = masterTrack;
  
  // Create 16 mixer tracks to match timeline
  window.mixer.tracks = [];
  for (let i = 0; i < 16; i++) {
    const track = createMixerTrack(i, colors[i % colors.length]);
    tracksContainer.appendChild(track);
    window.mixer.tracks[i] = track;
  }
}

/**
 * Create the master mixer track
 * @returns {HTMLElement} - Master mixer track element
 */
function createMasterTrack() {
  const track = document.createElement('div');
  track.className = 'mixer-track master';
  track.dataset.index = 'master';
  
  const color = '#007aff'; // Accent color
  
  // Track label
  const label = document.createElement('div');
  label.className = 'mixer-track-label';
  label.textContent = 'Master';
  label.style.color = color;
  label.style.fontSize = '12px';
  label.style.fontWeight = 'bold';
  
  // VU Meter (taller for master, stereo)
  const vuMeter = document.createElement('div');
  vuMeter.className = 'mixer-vu';
  vuMeter.style.height = '210px';
  
  const vuChannelLeft = document.createElement('div');
  vuChannelLeft.className = 'mixer-vu-channel';
  const vuFillLeft = document.createElement('div');
  vuFillLeft.className = 'mixer-vu-fill';
  vuFillLeft.style.background = color;
  const vuPeakLeft = document.createElement('div');
  vuPeakLeft.className = 'mixer-vu-peak';
  vuPeakLeft.style.background = color;
  vuChannelLeft.appendChild(vuFillLeft);
  vuChannelLeft.appendChild(vuPeakLeft);
  
  const vuChannelRight = document.createElement('div');
  vuChannelRight.className = 'mixer-vu-channel';
  const vuFillRight = document.createElement('div');
  vuFillRight.className = 'mixer-vu-fill';
  vuFillRight.style.background = color;
  const vuPeakRight = document.createElement('div');
  vuPeakRight.className = 'mixer-vu-peak';
  vuPeakRight.style.background = color;
  vuChannelRight.appendChild(vuFillRight);
  vuChannelRight.appendChild(vuPeakRight);
  
  vuMeter.appendChild(vuChannelLeft);
  vuMeter.appendChild(vuChannelRight);
  
  // Fader container
  const faderContainer = document.createElement('div');
  faderContainer.className = 'mixer-fader-container';
  
  // Fader
  const fader = document.createElement('div');
  fader.className = 'mixer-fader';
  
  const faderTrack = document.createElement('div');
  faderTrack.className = 'mixer-fader-track';
  
  const faderFill = document.createElement('div');
  faderFill.className = 'mixer-fader-fill';
  
  const faderThumb = document.createElement('div');
  faderThumb.className = 'mixer-fader-thumb';
  
  fader.appendChild(faderTrack);
  fader.appendChild(faderFill);
  fader.appendChild(faderThumb);
  
  // Fader value display
  const faderValue = document.createElement('div');
  faderValue.className = 'mixer-fader-value';
  faderValue.textContent = '0.0 dB';
  
  faderContainer.appendChild(fader);
  faderContainer.appendChild(faderValue);
  
  // Assemble track
  track.appendChild(label);
  track.appendChild(vuMeter);
  track.appendChild(faderContainer);
  
  // Store references for later updates
  track._vuFillLeft = vuFillLeft;
  track._vuFillRight = vuFillRight;
  track._vuPeakLeft = vuPeakLeft;
  track._vuPeakRight = vuPeakRight;
  track._peakLevelLeft = 0;
  track._peakLevelRight = 0;
  track._peakHoldHeightLeft = 0;
  track._peakHoldHeightRight = 0;
  track._peakHoldUntilLeft = 0;
  track._peakHoldUntilRight = 0;
  track._smoothedRmsLeft = 0;
  track._smoothedRmsRight = 0;
  track._lastVuUpdate = performance.now();
  track._fader = fader;
  track._faderTrack = faderTrack;
  track._faderFill = faderFill;
  track._faderThumb = faderThumb;
  track._faderValue = faderValue;
  track._volume = 1.0;
  track._isMaster = true;
  
  // Set initial volume from masterGain if available
  if (window.masterGain) {
    track._volume = window.masterGain.gain.value;
  }
  
  // Update fader position
  updateFaderPosition(track, track._volume);
  
  // Add fader drag functionality for master
  setupMasterFaderDrag(track);
  
  return track;
}

/**
 * Create a single mixer track
 * @param {number} index - Track index
 * @param {string} color - Track color
 * @returns {HTMLElement} - Mixer track element
 */
function createMixerTrack(index, color) {
  const track = document.createElement('div');
  track.className = 'mixer-track';
  track.dataset.index = index;
  
  // Track label
  const label = document.createElement('div');
  label.className = 'mixer-track-label';
  label.textContent = `Track ${index + 1}`;
  label.style.color = color;
  
  // VU Meter (stereo)
  const vuMeter = document.createElement('div');
  vuMeter.className = 'mixer-vu';
  
  const vuChannelLeft = document.createElement('div');
  vuChannelLeft.className = 'mixer-vu-channel';
  const vuFillLeft = document.createElement('div');
  vuFillLeft.className = 'mixer-vu-fill';
  vuFillLeft.style.background = color;
  const vuPeakLeft = document.createElement('div');
  vuPeakLeft.className = 'mixer-vu-peak';
  vuPeakLeft.style.background = color;
  vuChannelLeft.appendChild(vuFillLeft);
  vuChannelLeft.appendChild(vuPeakLeft);
  
  const vuChannelRight = document.createElement('div');
  vuChannelRight.className = 'mixer-vu-channel';
  const vuFillRight = document.createElement('div');
  vuFillRight.className = 'mixer-vu-fill';
  vuFillRight.style.background = color;
  const vuPeakRight = document.createElement('div');
  vuPeakRight.className = 'mixer-vu-peak';
  vuPeakRight.style.background = color;
  vuChannelRight.appendChild(vuFillRight);
  vuChannelRight.appendChild(vuPeakRight);
  
  vuMeter.appendChild(vuChannelLeft);
  vuMeter.appendChild(vuChannelRight);
  
  // Mute button (blue circle)
  const muteBtn = document.createElement('div');
  muteBtn.className = 'mixer-mute-btn';
  muteBtn.title = 'Mute';
  muteBtn.dataset.muted = 'false';
  
  // Mute button click handler
  muteBtn.addEventListener('click', () => {
    const isMuted = muteBtn.dataset.muted === 'true';
    muteBtn.dataset.muted = !isMuted ? 'true' : 'false';
    muteBtn.classList.toggle('active', !isMuted);
    
    // Update audio engine
    if (window.trackGains && window.trackGains[index]) {
      if (!isMuted) {
        // Muting - store current volume and set to 0
        muteBtn.dataset.previousVolume = window.trackGains[index].gain.value;
        window.trackGains[index].gain.value = 0;
      } else {
        // Unmuting - restore previous volume
        const previousVolume = parseFloat(muteBtn.dataset.previousVolume) || track._volume || 1.0;
        window.trackGains[index].gain.value = previousVolume;
      }
    }
  });
  
  // Fader container
  const faderContainer = document.createElement('div');
  faderContainer.className = 'mixer-fader-container';
  
  // Fader
  const fader = document.createElement('div');
  fader.className = 'mixer-fader';
  
  const faderTrack = document.createElement('div');
  faderTrack.className = 'mixer-fader-track';
  
  const faderFill = document.createElement('div');
  faderFill.className = 'mixer-fader-fill';
  faderFill.style.background = `linear-gradient(to top, ${color}, rgba(${hexToRgb(color)}, 0.3))`;
  
  const faderThumb = document.createElement('div');
  faderThumb.className = 'mixer-fader-thumb';
  
  fader.appendChild(faderTrack);
  fader.appendChild(faderFill);
  fader.appendChild(faderThumb);
  
  // Fader value display
  const faderValue = document.createElement('div');
  faderValue.className = 'mixer-fader-value';
  faderValue.textContent = '0.0 dB';
  
  faderContainer.appendChild(fader);
  faderContainer.appendChild(faderValue);
  
  // Assemble track
  track.appendChild(label);
  track.appendChild(vuMeter);
  track.appendChild(muteBtn);
  track.appendChild(faderContainer);
  
  // Store references for later updates
  track._vuFillLeft = vuFillLeft;
  track._vuFillRight = vuFillRight;
  track._vuPeakLeft = vuPeakLeft;
  track._vuPeakRight = vuPeakRight;
  track._peakLevelLeft = 0;
  track._peakLevelRight = 0;
  track._peakHoldHeightLeft = 0;
  track._peakHoldHeightRight = 0;
  track._peakHoldUntilLeft = 0;
  track._peakHoldUntilRight = 0;
  track._smoothedRmsLeft = 0;
  track._smoothedRmsRight = 0;
  track._lastVuUpdate = performance.now();
  track._muteBtn = muteBtn;
  track._fader = fader;
  track._faderTrack = faderTrack;
  track._faderFill = faderFill;
  track._faderThumb = faderThumb;
  track._faderValue = faderValue;
  track._volume = 1.0; // Default to 0dB
  track._trackIndex = index;
  
  // Set initial volume from trackGains if available
  if (window.trackGains && window.trackGains[index]) {
    track._volume = window.trackGains[index].gain.value;
  }
  
  // Update fader position
  updateFaderPosition(track, track._volume);
  
  // Add fader drag functionality
  setupFaderDrag(track, index);
  
  return track;
}

/**
 * Setup fader drag interaction
 * @param {HTMLElement} track - Mixer track element
 * @param {number} trackIndex - Track index
 */
function setupFaderDrag(track, trackIndex) {
  const fader = track._fader;
  const thumb = track._faderThumb;
  
  let isDragging = false;
  
  // Ctrl+Click to reset to 0dB
  const handleCtrlClick = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const volume = 1.0; // 0dB
      
      track._volume = volume;
      updateFaderPosition(track, volume);
      
      // Update audio engine
      if (window.trackGains && window.trackGains[trackIndex]) {
        window.trackGains[trackIndex].gain.value = volume;
      }
      
      // Update trackStates for project saving
      if (window.trackStates && window.trackStates[trackIndex]) {
        window.trackStates[trackIndex].volume = volume;
      }
      
      // Update timeline knob if it exists
      const timelineControls = window.trackControls?.[trackIndex];
      if (timelineControls && timelineControls.vol) {
        timelineControls.vol.dataset.value = volume;
        timelineControls.vol.style.setProperty("--val", volume);
      }
    }
  };
  
  const startDrag = (e) => {
    e.preventDefault();
    isDragging = true;
    
    const faderRect = fader.getBoundingClientRect();
    const faderHeight = faderRect.height - 16; // Account for padding
    
    const onMove = (moveEvent) => {
      if (!isDragging) return;
      
      // Calculate relative position (inverted because fader goes from bottom to top)
      // Range: 0 (bottom) to 2.0 (top) = -Infinity to +6dB
      const y = moveEvent.clientY - faderRect.top - 8;
      let percentage = 1 - (y / faderHeight);
      percentage = Math.max(0, Math.min(1, percentage));
      
      // Map 0-1 range to 0-2.0 volume range
      const volume = percentage * 2.0;
      
      // Update volume
      track._volume = volume;
      updateFaderPosition(track, volume);
      
      // Update audio engine
      if (window.trackGains && window.trackGains[trackIndex]) {
        window.trackGains[trackIndex].gain.value = volume;
      }
      
      // Update trackStates for project saving
      if (window.trackStates && window.trackStates[trackIndex]) {
        window.trackStates[trackIndex].volume = volume;
      }
      
      // Update timeline knob if it exists
      const timelineControls = window.trackControls?.[trackIndex];
      if (timelineControls && timelineControls.vol) {
        timelineControls.vol.dataset.value = volume;
        timelineControls.vol.style.setProperty("--val", volume);
      }
    };
    
    const onUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    
    // Set initial position on click
    onMove(e);
    
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  
  thumb.addEventListener('mousedown', startDrag);
  thumb.addEventListener('click', handleCtrlClick);
  fader.addEventListener('mousedown', (e) => {
    if (e.target === fader || e.target === track._faderFill || e.target === track._faderTrack) {
      startDrag(e);
    }
  });
  fader.addEventListener('click', handleCtrlClick);
  track._faderFill.addEventListener('mousedown', startDrag);
  track._faderFill.addEventListener('click', handleCtrlClick);
}

/**
 * Setup master fader drag interaction
 * @param {HTMLElement} track - Master mixer track element
 */
function setupMasterFaderDrag(track) {
  const fader = track._fader;
  const thumb = track._faderThumb;
  
  let isDragging = false;
  
  // Ctrl+Click to reset to 0dB
  const handleCtrlClick = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const volume = 1.0; // 0dB
      
      track._volume = volume;
      updateFaderPosition(track, volume);
      
      // Update master gain
      if (window.masterGain) {
        window.masterGain.gain.value = volume;
      }
      
      // Update master volume slider in top bar if it exists
      const masterSlider = document.getElementById('masterVolumeSlider');
      if (masterSlider) {
        masterSlider.value = volume;
      }
    }
  };
  
  const startDrag = (e) => {
    e.preventDefault();
    isDragging = true;
    
    const faderRect = fader.getBoundingClientRect();
    const faderHeight = faderRect.height - 16;
    
    const onMove = (moveEvent) => {
      if (!isDragging) return;
      
      const y = moveEvent.clientY - faderRect.top - 8;
      let percentage = 1 - (y / faderHeight);
      percentage = Math.max(0, Math.min(1, percentage));
      
      // Map 0-1 range to 0-2.0 volume range
      const volume = percentage * 2.0;
      
      // Update volume
      track._volume = volume;
      updateFaderPosition(track, volume);
      
      // Update master gain
      if (window.masterGain) {
        window.masterGain.gain.value = volume;
      }
      
      // Update master volume slider in top bar if it exists
      const masterSlider = document.getElementById('masterVolumeSlider');
      if (masterSlider) {
        masterSlider.value = percentage;
      }
    };
    
    const onUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    
    // Set initial position on click
    onMove(e);
    
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  
  thumb.addEventListener('mousedown', startDrag);
  thumb.addEventListener('click', handleCtrlClick);
  fader.addEventListener('mousedown', (e) => {
    if (e.target === fader || e.target === track._faderFill || e.target === track._faderTrack) {
      startDrag(e);
    }
  });
  fader.addEventListener('click', handleCtrlClick);
  track._faderFill.addEventListener('mousedown', startDrag);
  track._faderFill.addEventListener('click', handleCtrlClick);
}

/**
 * Update fader visual position based on volume
 * @param {HTMLElement} track - Mixer track element
 * @param {number} volume - Volume value (0-1)
 */
function updateFaderPosition(track, volume) {
  const faderElement = track._fader;
  let faderHeight = faderElement.offsetHeight;
  
  // If offsetHeight is 0 (element not yet rendered), use default
  if (faderHeight === 0) {
    faderHeight = 200; // Default CSS height
  }
  
  const thumbHeight = 20; // px
  const maxTravel = faderHeight - thumbHeight;
  
  // volume is 0-2.0, convert to 0-1 percentage, then to pixels
  const percentage = volume / 2.0;
  const thumbBottom = percentage * maxTravel;
  
  // Fill height matches where the thumb is
  const fillHeight = Math.max(0, thumbBottom);
  
  track._faderFill.style.height = `${fillHeight}px`;
  track._faderThumb.style.bottom = `${thumbBottom}px`;
  
  // Update value display
  const db = volumeToDb(volume);
  track._faderValue.textContent = `${db.toFixed(1)} dB`;
}

/**
 * Convert volume (0-1) to dB
 * @param {number} volume - Volume value (0-1)
 * @returns {number} - dB value
 */
function volumeToDb(volume) {
  if (volume === 0) return -Infinity;
  return 20 * Math.log10(volume);
}

/**
 * Convert hex color to RGB
 * @param {string} hex - Hex color string
 * @returns {string} - RGB values as string "r, g, b"
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result 
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '255, 255, 255';
}

/**
 * Update VU meters for all mixer tracks
 */
function updateMixerVUMeters() {
  if (!window.mixer.isOpen) {
    window.mixer.vuUpdateRunning = false;
    return;
  }
  
  const MIN_DB = -60; // Floor for meter scaling
  const ORANGE_DB = 0; // Turn bar orange at 0dBFS (start of digital clipping)
  const RED_DB = 3;    // Hard clip warning if overs hit +3dBFS
  const PEAK_HOLD_MS = 2000;
  const PEAK_DECAY_PER_SEC = 0.5; // Smooth fall after hold
  const RMS_SMOOTHING = 0.7; // EMA smoothing

  const toDb = (value) => (value > 0 ? 20 * Math.log10(value) : MIN_DB);
  const dbToHeight = (db) => {
    // Clamp dB to range, then scale to 0-1
    const clamped = Math.max(MIN_DB, Math.min(0, db));
    const height = (clamped - MIN_DB) / (0 - MIN_DB);
    return Math.max(0, Math.min(1, height)); // Extra safety clamp
  };

  const now = performance.now();

  const updateChannel = (track, analyser, side, deltaSeconds) => {
    if (!analyser) return;

    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    let sumSquares = 0;
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = buffer[i];
      sumSquares += v * v;
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
    }

    const rms = Math.sqrt(sumSquares / buffer.length);
    const smoothedKey = side === 'L' ? '_smoothedRmsLeft' : '_smoothedRmsRight';
    track[smoothedKey] = RMS_SMOOTHING * track[smoothedKey] + (1 - RMS_SMOOTHING) * rms;

    const rmsDb = toDb(track[smoothedKey]);
    const peakDb = toDb(peak);

    // Convert to 0-1 range for display (already clamped in dbToHeight)
    const rmsHeight = dbToHeight(rmsDb);
    const peakHeight = dbToHeight(peakDb);

    const fillEl = side === 'L' ? track._vuFillLeft : track._vuFillRight;
    const peakEl = side === 'L' ? track._vuPeakLeft : track._vuPeakRight;

    fillEl.style.height = `${(rmsHeight * 100).toFixed(2)}%`;

    let fillColor = '#2aff2a'; // Green safe zone
    if (rmsDb >= RED_DB) fillColor = '#ff2b2b';
    else if (rmsDb >= ORANGE_DB) fillColor = '#ff9900';
    fillEl.style.backgroundColor = fillColor;

    const holdHeightKey = side === 'L' ? '_peakHoldHeightLeft' : '_peakHoldHeightRight';
    const holdUntilKey = side === 'L' ? '_peakHoldUntilLeft' : '_peakHoldUntilRight';

    let holdHeight = track[holdHeightKey] || 0;
    let holdUntil = track[holdUntilKey] || 0;

    if (peakHeight > holdHeight) {
      holdHeight = peakHeight;
      holdUntil = now + PEAK_HOLD_MS;
    } else if (now > holdUntil && deltaSeconds > 0) {
      holdHeight = Math.max(peakHeight, holdHeight - PEAK_DECAY_PER_SEC * deltaSeconds);
    }

    // Ensure holdHeight never exceeds 1.0 (100%)
    holdHeight = Math.max(0, Math.min(1, holdHeight));

    peakEl.style.bottom = `${(holdHeight * 100).toFixed(2)}%`;

    track[holdHeightKey] = holdHeight;
    track[holdUntilKey] = holdUntil;
  };

  // Update master track VU meter (stereo)
  if (window.mixer.masterTrack && window.mixer.masterTrack._vuFillLeft) {
    const track = window.mixer.masterTrack;
    const deltaSeconds = track._lastVuUpdate ? (now - track._lastVuUpdate) / 1000 : 0;
    updateChannel(track, window.masterAnalyserLeft, 'L', deltaSeconds);
    updateChannel(track, window.masterAnalyserRight, 'R', deltaSeconds);
    track._lastVuUpdate = now;
  }
  
  // Update each track's VU meter (stereo)
  for (let i = 0; i < window.mixer.tracks.length; i++) {
    const track = window.mixer.tracks[i];
    if (!track || !track._vuFillLeft || !track._vuFillRight) continue;
    
    const deltaSeconds = track._lastVuUpdate ? (now - track._lastVuUpdate) / 1000 : 0;
    updateChannel(track, window.trackAnalysersLeft?.[i], 'L', deltaSeconds);
    updateChannel(track, window.trackAnalysersRight?.[i], 'R', deltaSeconds);
    track._lastVuUpdate = now;
  }
  
  requestAnimationFrame(updateMixerVUMeters);
}

// Export functions
window.initMixer = initMixer;
window.openMixer = openMixer;
window.closeMixer = closeMixer;
window.updateFaderPosition = updateFaderPosition;
