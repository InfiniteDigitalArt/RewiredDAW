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
  vuMeter.style.height = '170px';
  
  const vuChannelLeft = document.createElement('div');
  vuChannelLeft.className = 'mixer-vu-channel';
  const vuFillLeft = document.createElement('div');
  vuFillLeft.className = 'mixer-vu-fill';
  vuChannelLeft.appendChild(vuFillLeft);
  
  const vuChannelRight = document.createElement('div');
  vuChannelRight.className = 'mixer-vu-channel';
  const vuFillRight = document.createElement('div');
  vuFillRight.className = 'mixer-vu-fill';
  vuChannelRight.appendChild(vuFillRight);
  
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
  track._fader = fader;
  track._faderFill = faderFill;
  track._faderThumb = faderThumb;
  track._faderValue = faderValue;
  track._volume = 0.8;
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
  vuChannelLeft.appendChild(vuFillLeft);
  
  const vuChannelRight = document.createElement('div');
  vuChannelRight.className = 'mixer-vu-channel';
  const vuFillRight = document.createElement('div');
  vuFillRight.className = 'mixer-vu-fill';
  vuChannelRight.appendChild(vuFillRight);
  
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
        const previousVolume = parseFloat(muteBtn.dataset.previousVolume) || track._volume || 0.8;
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
  track._muteBtn = muteBtn;
  track._fader = fader;
  track._faderFill = faderFill;
  track._faderThumb = faderThumb;
  track._faderValue = faderValue;
  track._volume = 0.8; // Default volume
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
  
  const startDrag = (e) => {
    e.preventDefault();
    isDragging = true;
    
    const faderRect = fader.getBoundingClientRect();
    const faderHeight = faderRect.height - 16; // Account for padding
    
    const onMove = (moveEvent) => {
      if (!isDragging) return;
      
      // Calculate relative position (inverted because fader goes from bottom to top)
      const y = moveEvent.clientY - faderRect.top - 8;
      let percentage = 1 - (y / faderHeight);
      percentage = Math.max(0, Math.min(1, percentage));
      
      // Update volume
      track._volume = percentage;
      updateFaderPosition(track, percentage);
      
      // Update audio engine
      if (window.trackGains && window.trackGains[trackIndex]) {
        window.trackGains[trackIndex].gain.value = percentage;
      }
      
      // Update trackStates for project saving
      if (window.trackStates && window.trackStates[trackIndex]) {
        window.trackStates[trackIndex].volume = percentage;
      }
      
      // Update timeline knob if it exists
      const timelineControls = window.trackControls?.[trackIndex];
      if (timelineControls && timelineControls.vol) {
        timelineControls.vol.dataset.value = percentage;
        timelineControls.vol.style.setProperty("--val", percentage);
      }
    };
    
    const onUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  
  thumb.addEventListener('mousedown', startDrag);
  fader.addEventListener('mousedown', (e) => {
    if (e.target === fader || e.target === track._faderFill || e.target === track._faderTrack) {
      startDrag(e);
    }
  });
}

/**
 * Setup master fader drag interaction
 * @param {HTMLElement} track - Master mixer track element
 */
function setupMasterFaderDrag(track) {
  const fader = track._fader;
  const thumb = track._faderThumb;
  
  let isDragging = false;
  
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
      
      // Update volume
      track._volume = percentage;
      updateFaderPosition(track, percentage);
      
      // Update master gain
      if (window.masterGain) {
        window.masterGain.gain.value = percentage;
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
    
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  
  thumb.addEventListener('mousedown', startDrag);
  fader.addEventListener('mousedown', (e) => {
    if (e.target === fader || e.target === track._faderFill || e.target === track._faderTrack) {
      startDrag(e);
    }
  });
}

/**
 * Update fader visual position based on volume
 * @param {HTMLElement} track - Mixer track element
 * @param {number} volume - Volume value (0-1)
 */
function updateFaderPosition(track, volume) {
  const percentage = volume * 100;
  track._faderFill.style.height = `${percentage}%`;
  track._faderThumb.style.bottom = `calc(${percentage}% - 6px)`;
  
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
  
  // Update master track VU meter (stereo)
  if (window.mixer.masterTrack && window.mixer.masterTrack._vuFillLeft) {
    const masterAnalyserLeft = window.masterAnalyserLeft;
    const masterAnalyserRight = window.masterAnalyserRight;
    
    if (masterAnalyserLeft) {
      const dataL = new Uint8Array(masterAnalyserLeft.frequencyBinCount);
      masterAnalyserLeft.getByteTimeDomainData(dataL);
      
      let peakL = 0;
      for (let j = 0; j < dataL.length; j++) {
        const v = Math.abs(dataL[j] - 128) / 128;
        if (v > peakL) peakL = v;
      }
      
      window.mixer.masterTrack._vuFillLeft.style.height = (peakL * 100) + '%';
    }
    
    if (masterAnalyserRight) {
      const dataR = new Uint8Array(masterAnalyserRight.frequencyBinCount);
      masterAnalyserRight.getByteTimeDomainData(dataR);
      
      let peakR = 0;
      for (let j = 0; j < dataR.length; j++) {
        const v = Math.abs(dataR[j] - 128) / 128;
        if (v > peakR) peakR = v;
      }
      
      window.mixer.masterTrack._vuFillRight.style.height = (peakR * 100) + '%';
    }
  }
  
  // Update each track's VU meter (stereo)
  for (let i = 0; i < window.mixer.tracks.length; i++) {
    const track = window.mixer.tracks[i];
    if (!track || !track._vuFillLeft || !track._vuFillRight) continue;
    
    const analyserLeft = window.trackAnalysersLeft?.[i];
    const analyserRight = window.trackAnalysersRight?.[i];
    
    if (analyserLeft) {
      const dataL = new Uint8Array(analyserLeft.frequencyBinCount);
      analyserLeft.getByteTimeDomainData(dataL);
      
      let peakL = 0;
      for (let j = 0; j < dataL.length; j++) {
        const v = Math.abs(dataL[j] - 128) / 128;
        if (v > peakL) peakL = v;
      }
      
      track._vuFillLeft.style.height = (peakL * 100) + '%';
    }
    
    if (analyserRight) {
      const dataR = new Uint8Array(analyserRight.frequencyBinCount);
      analyserRight.getByteTimeDomainData(dataR);
      
      let peakR = 0;
      for (let j = 0; j < dataR.length; j++) {
        const v = Math.abs(dataR[j] - 128) / 128;
        if (v > peakR) peakR = v;
      }
      
      track._vuFillRight.style.height = (peakR * 100) + '%';
    }
  }
  
  requestAnimationFrame(updateMixerVUMeters);
}

// Export functions
window.initMixer = initMixer;
window.openMixer = openMixer;
window.closeMixer = closeMixer;
window.updateFaderPosition = updateFaderPosition;
