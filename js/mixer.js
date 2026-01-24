// Allow mixer to update stereo width in realtime
window.setTrackStereoWidth = function(trackIndex, width) {
  if (window.trackStereoWidthNodes && window.trackStereoWidthNodes[trackIndex]) {
    if (typeof window.trackStereoWidthNodes[trackIndex].setStereoWidth === 'function') {
      window.trackStereoWidthNodes[trackIndex].setStereoWidth(width);
    } else if ('width' in window.trackStereoWidthNodes[trackIndex]) {
      window.trackStereoWidthNodes[trackIndex].width = width;
    }
  }
  if (window.mixerStereoValues) {
    window.mixerStereoValues[trackIndex] = width;
  }
};
/**
 * mixer.js
 * FL Studio-style mixer interface
 */

window.mixer = {
  isOpen: false,
  tracks: [],
  vuUpdateRunning: false,
  selectedTrackIndex: null, // null = master, 0-15 = track index
  selectedFxSlotIndex: null
};

// Track FX slots data: trackFxSlots['master'] or trackFxSlots[0-15]
// Each track has 10 slots, each slot has { name, type, params }
window.trackFxSlots = {};

function getDefaultEffectParams(effectType) {
  if (effectType === 'reverb') {
    return {
      mix: 0.5,
      decay: 3.0,
      preDelay: 0.01,
      lowCut: 150,
      roomSize: 0.7
    };
  }
  if (effectType === 'distortion') {
    return {
      mix: 0.5,
      drive: 0.5,
      threshold: 0.5,
      type: 'softclip'
    };
  }
  if (effectType === 'lowhighcut') {
    return {
      lowCut: 30,
      highCut: 18000
    };
  }
  return {};
}

/**
 * Initialize FX slots for a track
 * @param {string|number} trackId - 'master' or track index 0-15
 */
function initTrackFxSlots(trackId) {
  if (!window.trackFxSlots[trackId]) {
    window.trackFxSlots[trackId] = [];
    for (let i = 0; i < 10; i++) {
      window.trackFxSlots[trackId].push({ name: 'Empty', type: 'empty', params: {} });
    }
  }
}

// VU meter calibration
const VU_MIN_DB = -60;
const VU_MAX_DB = 5; // top of the bar = +5 dBFS
const VU_ORANGE_DB = -6; // caution band start
const VU_RED_DB = 0;    // distortion risk above 0 dBFS
const VU_PEAK_HOLD_MS = 2000;
const VU_PEAK_DECAY_PER_SEC = 0.5;
const VU_RMS_SMOOTHING = 0.7;

// Expose calibration so other views (timeline, top bar) draw the same levels
window.VU_CAL = {
  MIN_DB: VU_MIN_DB,
  MAX_DB: VU_MAX_DB,
  ORANGE_DB: VU_ORANGE_DB,
  RED_DB: VU_RED_DB,
  SMOOTHING: VU_RMS_SMOOTHING
};

// Fader gain mapping: 0% = silence, 75% = 0 dB (gain=1), 100% ≈ +5 dB
const FADER_GAIN_MAX = Math.pow(10, VU_MAX_DB / 20); // linear gain at +5 dB

function percentageToGain(pct) {
  const clamped = Math.max(0, Math.min(1, pct));
  if (clamped <= 0) return 0;
  if (clamped >= 1) return FADER_GAIN_MAX;
  if (clamped <= 0.75) return clamped / 0.75;
  const over = (clamped - 0.75) / 0.25;
  return 1 + over * (FADER_GAIN_MAX - 1);
}

function gainToPercentage(gain) {
  const clamped = Math.max(0, Math.min(FADER_GAIN_MAX, gain));
  if (clamped <= 0) return 0;
  if (clamped <= 1) return 0.75 * clamped;
  const over = (clamped - 1) / (FADER_GAIN_MAX - 1);
  return 0.75 + 0.25 * Math.max(0, Math.min(1, over));
}

/**
 * Select a mixer track and update FX panel title
 * @param {number|null} trackIndex - Track index (null for master, 0-15 for tracks)
 */
function selectMixerTrack(trackIndex) {
  // Only proceed if the track selection is changing, unless force is true
  let force = false;
  if (arguments.length > 1) force = arguments[1];
  if (!force && window.mixer.selectedTrackIndex === trackIndex) {
    // If clicking the already-selected track, do nothing (keep effect controls open)
    return;
  }

  // Remove selection from all tracks
  if (window.mixer.masterTrack) {
    window.mixer.masterTrack.classList.remove('selected');
  }
  window.mixer.tracks.forEach(track => {
    if (track) track.classList.remove('selected');
  });

  // Update selected track index
  window.mixer.selectedTrackIndex = trackIndex;

  // Add selection to the new track
  let selectedTrack;
  let trackName;

  if (trackIndex === null) {
    // Master track selected
    selectedTrack = window.mixer.masterTrack;
    trackName = 'Master';
  } else {
    // Regular track selected
    selectedTrack = window.mixer.tracks[trackIndex];
    trackName = window.trackStates && window.trackStates[trackIndex]
      ? window.trackStates[trackIndex].name
      : `Track ${trackIndex + 1}`;
  }

  if (selectedTrack) {
    selectedTrack.classList.add('selected');
  }

  // Update FX panel title
  const fxHeader = document.querySelector('.mixer-fx-header');
  if (fxHeader) {
    fxHeader.textContent = `FX Slots (${trackName})`;
  }

  // Update FX slots display for the selected track
  updateFxSlotsDisplay(trackIndex === null ? 'master' : trackIndex);

  // Reset selected FX slot when switching tracks
  window.mixer.selectedFxSlotIndex = null;
  document.querySelectorAll('.fx-slot').forEach(s => s.classList.remove('selected'));
  renderFxSettingsPlaceholder();
}

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
  
  // Create VU tooltip element
  if (!document.getElementById('mixer-vu-tooltip')) {
    const tooltip = document.createElement('div');
    tooltip.id = 'mixer-vu-tooltip';
    tooltip.className = 'mixer-vu-tooltip hidden';
    document.body.appendChild(tooltip);
  }
  
  // Generate mixer tracks based on timeline tracks
  generateMixerTracks();
  
  // Initialize FX slot dropdowns
  initFxSlotDropdowns();
}

// Add independent mixer fader state

// Per-track lowpass filter cutoff (Hz), default 20000 (no filter)
window.mixerFaderValues = window.mixerFaderValues || Array.from({ length: 16 }, () => 1.0);
window.mixerLowpassValues = window.mixerLowpassValues || Array.from({ length: 16 }, () => 20000);
// Per-track stereo width (0 = mono, 0.5 = normal, 1 = extra wide)
window.mixerStereoValues = window.mixerStereoValues || Array.from({ length: 16 }, () => 0.5);

/**
 * Update FX slots display for the selected track
 * @param {string|number} trackId - 'master' or track index 0-15
 */
function updateFxSlotsDisplay(trackId) {
  // Initialize FX slots for this track if not already done
  initTrackFxSlots(trackId);
  
  const slots = document.querySelectorAll('.fx-slot');
  const trackFx = window.trackFxSlots[trackId];
  
  slots.forEach((slot, index) => {
    const nameEl = slot.querySelector('.fx-slot-name');
    if (nameEl && trackFx[index]) {
      nameEl.textContent = trackFx[index].name;
    }
  });
}

/**
 * Initialize FX slot dropdown menus
 */
function initFxSlotDropdowns() {
  const fxSlots = document.querySelectorAll('.fx-slot');
  
  fxSlots.forEach(slot => {
    const dropdown = slot.querySelector('.fx-slot-dropdown');
    const menu = slot.querySelector('.fx-slot-menu');
    const nameEl = slot.querySelector('.fx-slot-name');
    
    if (!dropdown || !menu || !nameEl) return;
    
    // Toggle menu on dropdown click
    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Close all other menus
      document.querySelectorAll('.fx-slot-menu').forEach(m => {
        if (m !== menu) m.classList.add('hidden');
      });
      
      // Toggle this menu
      menu.classList.toggle('hidden');
    });
    
    // Handle menu item selection
    const menuItems = menu.querySelectorAll('.fx-menu-item');
    menuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const effectName = item.textContent;
        const effectType = item.dataset.effect;
        const slotNumber = parseInt(slot.dataset.slot) - 1; // 0-indexed
        
        nameEl.textContent = effectName;
        menu.classList.add('hidden');
        
        // Save effect to current track's FX slots
        const currentTrackId = window.mixer.selectedTrackIndex === null ? 'master' : window.mixer.selectedTrackIndex;
        initTrackFxSlots(currentTrackId);
        
        const defaultParams = getDefaultEffectParams(effectType);
        window.trackFxSlots[currentTrackId][slotNumber] = {
          name: effectName,
          type: effectType,
          params: defaultParams
        };

        window.mixer.selectedFxSlotIndex = slotNumber;
        
        const trackName = currentTrackId === 'master' ? 'Master' : 
          (window.trackStates && window.trackStates[currentTrackId] ? 
           window.trackStates[currentTrackId].name : `Track ${currentTrackId + 1}`);
        
        console.log(`${trackName} - FX Slot ${slotNumber + 1}: ${effectName} (${effectType}) selected`);
        
        // Apply the effect to the audio chain
        if (currentTrackId !== 'master') {
          applyEffectToTrack(currentTrackId, slotNumber, effectType, defaultParams);
        }

        // Show settings for this slot
        renderFxSettingsPanel(currentTrackId, slotNumber);
      });
    });

    // Click on slot (not dropdown) opens settings
    slot.addEventListener('click', (e) => {
      if (e.target.closest('.fx-slot-dropdown') || e.target.closest('.fx-slot-menu')) return;
      const slotNumber = parseInt(slot.dataset.slot) - 1;
      const currentTrackId = window.mixer.selectedTrackIndex === null ? 'master' : window.mixer.selectedTrackIndex;
      window.mixer.selectedFxSlotIndex = slotNumber;
      
      // Remove selected class from all slots
      document.querySelectorAll('.fx-slot').forEach(s => s.classList.remove('selected'));
      
      // Add selected class to clicked slot
      slot.classList.add('selected');
      
      renderFxSettingsPanel(currentTrackId, slotNumber);
    });
  });
  
  // Close all menus when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.fx-slot')) {
      document.querySelectorAll('.fx-slot-menu').forEach(menu => {
        menu.classList.add('hidden');
      });
    }
  });
}

function renderFxSettingsPlaceholder() {
  const panel = document.getElementById('mixer-equalizer');
  if (!panel) return;
  const header = panel.querySelector('.mixer-eq-header');
  const display = panel.querySelector('.mixer-eq-display');
  if (!header || !display) return;
  header.textContent = 'Effect Settings';
  display.innerHTML = '<div class="fx-settings-empty">Select an FX slot to edit its settings.</div>';
}

function renderFxSettingsPanel(trackId, slotIndex) {
  const panel = document.getElementById('mixer-equalizer');
  if (!panel) return;

  const header = panel.querySelector('.mixer-eq-header');
  const display = panel.querySelector('.mixer-eq-display');
  if (!header || !display) return;

  // Reset layout defaults for each render
  display.style.justifyContent = 'center';
  display.style.alignItems = 'center';

  // Run any cleanup from prior effect render
  if (typeof display._cleanup === 'function') {
    try {
      display._cleanup();
    } catch (err) {
      console.warn('FX panel cleanup failed', err);
    }
    display._cleanup = null;
  }

  initTrackFxSlots(trackId);
  const slot = window.trackFxSlots[trackId][slotIndex];
  const trackName = trackId === 'master'
    ? 'Master'
    : (window.trackStates && window.trackStates[trackId] ? window.trackStates[trackId].name : `Track ${trackId + 1}`);

  if (!slot || slot.type === 'empty') {
    header.textContent = 'Effect Settings';
    display.innerHTML = `<div class="fx-settings-empty">Select an effect for Slot ${slotIndex + 1}</div>`;
    return;
  }

  if (slot.type === 'reverb') {
    const params = slot.params || getDefaultEffectParams('reverb');
    header.textContent = `Reverb — ${trackName} (Slot ${slotIndex + 1})`;
    display.innerHTML = '';

    const controls = [
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, format: v => `${Math.round(v * 100)}%` },
      { key: 'decay', label: 'Decay', min: 0.2, max: 10, step: 0.05, format: v => `${v.toFixed(2)}s` },
      { key: 'preDelay', label: 'Pre-delay', min: 0, max: 0.1, step: 0.005, format: v => `${Math.round(v * 1000)}ms` },
      { key: 'lowCut', label: 'Low-cut', min: 20, max: 500, step: 5, format: v => `${Math.round(v)}Hz` },
      { key: 'roomSize', label: 'Room Size', min: 0, max: 1, step: 0.01, format: v => `${Math.round(v * 100)}%` }
    ];

    controls.forEach(ctrl => {
      const row = document.createElement('div');
      row.className = 'fx-setting-row';

      const label = document.createElement('label');
      label.textContent = `${ctrl.label}`;

      const valueSpan = document.createElement('span');
      valueSpan.className = 'fx-setting-value';
      valueSpan.textContent = ctrl.format(params[ctrl.key]);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = ctrl.min;
      input.max = ctrl.max;
      input.step = ctrl.step;
      input.value = params[ctrl.key];
      input.addEventListener('input', () => {
        const newVal = parseFloat(input.value);
        valueSpan.textContent = ctrl.format(newVal);
        updateEffectParams(trackId, slotIndex, slot.type, { [ctrl.key]: newVal });
      });

      const headerRow = document.createElement('div');
      headerRow.className = 'fx-setting-label';
      headerRow.appendChild(label);
      headerRow.appendChild(valueSpan);

      row.appendChild(headerRow);
      row.appendChild(input);
      display.appendChild(row);
    });
  }

  if (slot.type === 'distortion') {
    const params = slot.params || getDefaultEffectParams('distortion');
    header.textContent = `Distortion — ${trackName} (Slot ${slotIndex + 1})`;
    display.innerHTML = '';

    // Type selector
    const typeRow = document.createElement('div');
    typeRow.className = 'fx-setting-row';
    const typeLabel = document.createElement('label');
    typeLabel.textContent = 'Type';
    const typeSelect = document.createElement('select');
    typeSelect.style.flex = '1';
    typeSelect.style.padding = '4px 8px';
    typeSelect.style.borderRadius = '3px';
    typeSelect.style.border = '1px solid #2b2b33';
    typeSelect.style.backgroundColor = '#1c1c22';
    typeSelect.style.color = '#fff';
    typeSelect.style.cursor = 'pointer';
    typeSelect.style.fontFamily = 'inherit';
    typeSelect.style.fontSize = '12px';
    typeSelect.style.outline = 'none';
    typeSelect.style.transition = 'border 0.15s';
    
    const types = ['softclip', 'hardclip', 'foldback'];
    types.forEach(t => {
      const option = document.createElement('option');
      option.value = t;
      option.textContent = t.charAt(0).toUpperCase() + t.slice(1).replace('clip', ' Clip');
      if (t === params.type) option.selected = true;
      typeSelect.appendChild(option);
    });
    
    typeSelect.addEventListener('change', () => {
      updateEffectParams(trackId, slotIndex, slot.type, { type: typeSelect.value });
    });
    
    const headerRow = document.createElement('div');
    headerRow.className = 'fx-setting-label';
    headerRow.appendChild(typeLabel);
    typeRow.appendChild(headerRow);
    typeRow.appendChild(typeSelect);
    display.appendChild(typeRow);

    const controls = [
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, format: v => `${Math.round(v * 100)}%` },
      { key: 'drive', label: 'Drive', min: 0, max: 1, step: 0.01, format: v => `${Math.round(v * 100)}%` },
      { key: 'threshold', label: 'Threshold', min: 0, max: 1, step: 0.01, format: v => `${Math.round(v * 100)}%` }
    ];

    controls.forEach(ctrl => {
      const row = document.createElement('div');
      row.className = 'fx-setting-row';

      const label = document.createElement('label');
      label.textContent = `${ctrl.label}`;

      const valueSpan = document.createElement('span');
      valueSpan.className = 'fx-setting-value';
      valueSpan.textContent = ctrl.format(params[ctrl.key]);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = ctrl.min;
      input.max = ctrl.max;
      input.step = ctrl.step;
      input.value = params[ctrl.key];
      input.addEventListener('input', () => {
        const newVal = parseFloat(input.value);
        valueSpan.textContent = ctrl.format(newVal);
        updateEffectParams(trackId, slotIndex, slot.type, { [ctrl.key]: newVal });
      });

      const headerRow = document.createElement('div');
      headerRow.className = 'fx-setting-label';
      headerRow.appendChild(label);
      headerRow.appendChild(valueSpan);

      row.appendChild(headerRow);
      row.appendChild(input);
      display.appendChild(row);
    });
  }

  if (slot.type === 'lowhighcut') {
    const params = slot.params || getDefaultEffectParams('lowhighcut');
    header.textContent = `Low/High Cut — ${trackName} (Slot ${slotIndex + 1})`;
    display.innerHTML = '';
    display.style.justifyContent = 'flex-start';
    display.style.alignItems = 'stretch';

    const wrapper = document.createElement('div');
    wrapper.className = 'lhc-wrapper';

    const readout = document.createElement('div');
    readout.className = 'lhc-readout';

    const lowLabel = document.createElement('span');
    lowLabel.textContent = 'Low Cut';
    const lowValue = document.createElement('span');
    lowValue.className = 'lhc-value lhc-value-low';
    lowLabel.appendChild(document.createTextNode(' '));
    lowLabel.appendChild(lowValue);

    const highLabel = document.createElement('span');
    highLabel.textContent = 'High Cut';
    const highValue = document.createElement('span');
    highValue.className = 'lhc-value lhc-value-high';
    highLabel.appendChild(document.createTextNode(' '));
    highLabel.appendChild(highValue);

    readout.appendChild(lowLabel);
    readout.appendChild(highLabel);

    const graph = document.createElement('div');
    graph.className = 'lhc-graph';
    const canvas = document.createElement('canvas');
    graph.appendChild(canvas);

    const handleLow = document.createElement('div');
    handleLow.className = 'lhc-handle low';
    const handleHigh = document.createElement('div');
    handleHigh.className = 'lhc-handle high';
    graph.appendChild(handleLow);
    graph.appendChild(handleHigh);

    wrapper.appendChild(readout);
    wrapper.appendChild(graph);
    display.appendChild(wrapper);

    const minFreq = 20;
    const maxFreq = 20000;
    const minGap = 30;
    const logMin = Math.log10(minFreq);
    const logRange = Math.log10(maxFreq) - logMin;

    const state = {
      lowCut: Math.max(minFreq, Math.min(maxFreq - minGap, params.lowCut || minFreq)),
      highCut: Math.max(minFreq + minGap, Math.min(maxFreq, params.highCut || maxFreq))
    };

    const formatFreq = (value) => {
      if (value >= 1000) {
        const k = value / 1000;
        return `${k.toFixed(k >= 10 ? 1 : 2)} kHz`;
      }
      return `${Math.round(value)} Hz`;
    };

    const freqToX = (freq, width) => {
      const clamped = Math.max(minFreq, Math.min(maxFreq, freq));
      const norm = (Math.log10(clamped) - logMin) / logRange;
      return norm * width;
    };

    const xToFreq = (x, width) => {
      const norm = Math.max(0, Math.min(1, x / width));
      const logFreq = logMin + norm * logRange;
      return Math.pow(10, logFreq);
    };

    const syncReadout = () => {
      lowValue.textContent = formatFreq(state.lowCut);
      highValue.textContent = formatFreq(state.highCut);
    };

    const draw = () => {
      const width = graph.clientWidth || 1;
      const height = graph.clientHeight || 1;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, width, height);

      // Draw frequency spectrum heatmap if effect instance exists
      const effectInstance = window.trackFxChains?.[trackId]?.[slotIndex];
      if (effectInstance && effectInstance.getFrequencyData) {
        const freqData = effectInstance.getFrequencyData();
        const binCount = freqData.length;
        const nyquist = audioContext.sampleRate / 2;
        
        // Draw frequency bars
        const barWidth = Math.max(1, width / 100);
        for (let i = 0; i < 100; i++) {
          const norm = i / 100;
          const logFreq = Math.pow(10, logMin + norm * logRange);
          const binIndex = Math.floor((logFreq / nyquist) * binCount);
          
          if (binIndex < binCount) {
            const magnitude = freqData[binIndex] / 255;
            const barHeight = magnitude * (height - 20);
            const x = i * (width / 100);
            
            // Blend between green (low freq) and blue (high freq) to match handle colors
            // Green: #7be0a3 (123, 224, 163), Blue: #6ab7ff (106, 183, 255)
            const t = norm; // 0 = low freq (green), 1 = high freq (blue)
            const r = Math.round(123 + (106 - 123) * t);
            const g = Math.round(224 + (183 - 224) * t);
            const b = Math.round(163 + (255 - 163) * t);
            
            const alpha = Math.min(0.8, magnitude * 1.2);
            const color = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            
            ctx.fillStyle = color;
            ctx.fillRect(x, height - 18 - barHeight, barWidth, barHeight);
          }
        }
      }

      // Grid with labels
      const freqs = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.font = '9px sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.textAlign = 'center';
      
      freqs.forEach(f => {
        const x = freqToX(f, width);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        
        // Add frequency labels at bottom
        let label = f >= 1000 ? `${f/1000}k` : f.toString();
        ctx.fillText(label, x, height - 3);
      });

      // Horizontal reference line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, height * 0.35);
      ctx.lineTo(width, height * 0.35);
      ctx.stroke();
      ctx.setLineDash([]);

      // Curve
      const xLow = freqToX(state.lowCut, width);
      const xHigh = freqToX(state.highCut, width);
      const floorY = height - 18;
      const passBandY = height * 0.35;
      const knee = Math.max(28, width * 0.055);

      // Fill under the curve with gradient
      const gradient = ctx.createLinearGradient(0, passBandY, 0, height);
      gradient.addColorStop(0, 'rgba(106, 183, 255, 0.15)');
      gradient.addColorStop(1, 'rgba(106, 183, 255, 0.02)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, floorY);
      ctx.lineTo(Math.max(0, xLow - knee), floorY);
      ctx.quadraticCurveTo(xLow, floorY * 0.55, xLow + knee * 0.25, passBandY);
      ctx.lineTo(Math.max(xHigh - knee * 0.25, xLow + knee * 0.25 + 6), passBandY);
      ctx.quadraticCurveTo(xHigh, floorY * 0.55, xHigh + knee, floorY);
      ctx.lineTo(width, floorY);
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();

      // Draw the curve line with glow
      ctx.shadowColor = 'rgba(106, 183, 255, 0.4)';
      ctx.shadowBlur = 6;
      ctx.strokeStyle = '#6ab7ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, floorY);
      ctx.lineTo(Math.max(0, xLow - knee), floorY);
      ctx.quadraticCurveTo(xLow, floorY * 0.55, xLow + knee * 0.25, passBandY);
      ctx.lineTo(Math.max(xHigh - knee * 0.25, xLow + knee * 0.25 + 6), passBandY);
      ctx.quadraticCurveTo(xHigh, floorY * 0.55, xHigh + knee, floorY);
      ctx.lineTo(width, floorY);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Position handles with edge padding to prevent cutoff
      const handlePadding = 12;
      const clampedXLow = Math.max(handlePadding, Math.min(width - handlePadding, xLow));
      const clampedXHigh = Math.max(handlePadding, Math.min(width - handlePadding, xHigh));
      
      handleLow.style.left = `${clampedXLow}px`;
      handleLow.style.top = `${passBandY}px`;
      handleHigh.style.left = `${clampedXHigh}px`;
      handleHigh.style.top = `${passBandY}px`;

      syncReadout();
    };

    const commit = () => {
      updateEffectParams(trackId, slotIndex, slot.type, { ...state });
    };

    // Continuously update spectrum visualization
    let animationId = null;
    const animate = () => {
      draw();
      animationId = requestAnimationFrame(animate);
    };
    animate();

    // Store cleanup function
    const originalCleanup = window.lhcCleanup || (() => {});
    window.lhcCleanup = () => {
      originalCleanup();
      if (animationId) cancelAnimationFrame(animationId);
    };

    const startDrag = (target) => (event) => {
      event.preventDefault();

      const handleMove = (moveEvent) => {
        // Get fresh rect on each move for accuracy
        const rect = graph.getBoundingClientRect();
        const x = moveEvent.clientX - rect.left;
        let freq = xToFreq(x, rect.width);

        if (target === 'lowCut') {
          freq = Math.min(freq, state.highCut - minGap);
          freq = Math.max(minFreq, freq);
          state.lowCut = freq;
        } else {
          freq = Math.max(freq, state.lowCut + minGap);
          freq = Math.min(maxFreq, freq);
          state.highCut = freq;
        }

        // Use requestAnimationFrame for smooth, synchronized visual updates
        requestAnimationFrame(() => {
          draw();
          commit();
        });
      };

      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    };

    handleLow.addEventListener('mousedown', startDrag('lowCut'));
    handleHigh.addEventListener('mousedown', startDrag('highCut'));

    const resizeHandler = () => draw();
    window.addEventListener('resize', resizeHandler);
    display._cleanup = () => window.removeEventListener('resize', resizeHandler);

    draw();
  }
}

function updateEffectParams(trackId, slotIndex, effectType, paramPatch) {
  initTrackFxSlots(trackId);
  const slot = window.trackFxSlots[trackId][slotIndex];
  if (!slot) return;

  if (!slot.params) slot.params = getDefaultEffectParams(effectType);
  slot.params = { ...slot.params, ...paramPatch };

  if (trackId === 'master') return; // Master FX not processed in realtime chain

  // Update live effect instance if present
  const fxInstance = window.trackFxChains?.[trackId]?.[slotIndex];
  if (fxInstance && fxInstance.setParams) {
    fxInstance.setParams(slot.params);
  } else {
    // Ensure effect exists
    applyEffectToTrack(trackId, slotIndex, effectType, slot.params);
  }
}

/**
 * Apply an effect to a track's audio chain
 * @param {number} trackIndex - Track index (0-15)
 * @param {number} slotIndex - FX slot index (0-9)
 * @param {string} effectType - Type of effect ('reverb', 'empty', etc.)
 * @param {Object} effectParams - Parameters for the effect
 */
function applyEffectToTrack(trackIndex, slotIndex, effectType, effectParams = {}) {
  if (!window.trackFxChains || !window.trackFxChains[trackIndex]) {
    console.error('Track FX chain not initialized');
    return;
  }
  const fxChain = window.trackFxChains[trackIndex];
  const slotData = window.trackFxSlots?.[trackIndex]?.[slotIndex];
  const finalParams = slotData && slotData.params ? { ...slotData.params, ...effectParams } : { ...effectParams };

  // Persist params back onto slot
  if (slotData) {
    const defaults = getDefaultEffectParams(effectType);
    slotData.params = { ...defaults, ...finalParams };
  }

  // If setting to empty, remove any existing effect
  if (effectType === 'empty') {
    if (fxChain[slotIndex]?.destroy) fxChain[slotIndex].destroy();
    fxChain[slotIndex] = null;
    // Remove nulls from chain for correct wiring
    window.trackFxChains[trackIndex] = fxChain.filter(fx => fx);
    window.updateTrackFxChain(trackIndex);
    return;
  }

  const existing = fxChain[slotIndex];
  if (existing && existing._type === effectType) {
    if (existing.setParams) existing.setParams(finalParams);
    window.updateTrackFxChain(trackIndex);
    return;
  }

  // Remove old effect if different type
  if (existing && existing.destroy) existing.destroy();
  fxChain[slotIndex] = null;

  // Create new effect based on type
  let effect = null;
  if (effectType === 'reverb' && window.ReverbEffect) {
    effect = new window.ReverbEffect(window.audioContext);
    effect._type = 'reverb';
    if (effect.setParams) effect.setParams(finalParams);
    console.log(`Created reverb effect for track ${trackIndex}, slot ${slotIndex}`);
  } else if (effectType === 'distortion' && window.DistortionEffect) {
    effect = new window.DistortionEffect(window.audioContext);
    effect._type = 'distortion';
    if (effect.setParams) effect.setParams(finalParams);
    console.log(`Created distortion effect for track ${trackIndex}, slot ${slotIndex}`);
  } else if (effectType === 'lowhighcut' && window.LowHighCutEffect) {
    effect = new window.LowHighCutEffect(window.audioContext);
    effect._type = 'lowhighcut';
    if (effect.setParams) effect.setParams(finalParams);
    console.log(`Created low/high cut effect for track ${trackIndex}, slot ${slotIndex}`);
  }

  // Store the effect instance
  fxChain[slotIndex] = effect;
  // Remove nulls from chain for correct wiring
  window.trackFxChains[trackIndex] = fxChain.filter(fx => fx);
  window.updateTrackFxChain(trackIndex);
}

/**
 * Rebuild audio routing for a track to include all active effects
 * @param {number} trackIndex - Track index (0-15)
 */
// No longer needed: replaced by window.updateTrackFxChain in audioEngine.js

/**
 * Open the mixer
 */
function openMixer() {
  const container = document.getElementById('mixer-container');
  container.classList.remove('hidden');
  window.mixer.isOpen = true;
  
  // Refresh tracks in case they've changed
  generateMixerTracks();
  // Restore selected track highlight if any
  if (window.mixer.selectedTrackIndex !== null) {
    selectMixerTrack(window.mixer.selectedTrackIndex, true);
  }
  
  // Start VU meter updates if not already running
  if (!window.mixer.vuUpdateRunning) {
    window.mixer.vuUpdateRunning = true;
    updateMixerVUMeters();
  }
  
  // Initialize FX slots for master and all tracks
  initTrackFxSlots('master');
  for (let i = 0; i < 16; i++) {
    initTrackFxSlots(i);
  }
  
  // Select Track 1 by default if no track is selected
  if (window.mixer.selectedTrackIndex === null) {
    selectMixerTrack(0);
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
  vuMeter.style.height = '180px';
  
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
  attachVuMarkers(vuChannelLeft);
  
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
  attachVuMarkers(vuChannelRight);
  
  vuMeter.appendChild(vuChannelLeft);
  vuMeter.appendChild(vuChannelRight);

  // Spacer to align fader with tracks that have a mute button
  const muteSpacer = document.createElement('div');
  muteSpacer.className = 'mixer-mute-spacer';
  muteSpacer.setAttribute('aria-hidden', 'true');
  
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
  track.appendChild(muteSpacer);
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
  track._color = color;
  
  // Set initial volume from masterGain if available
  if (window.masterGain) {
    track._volume = window.masterGain.gain.value;
  }
  
  // Update fader position
  updateFaderPosition(track, track._volume);
  
  // Add fader drag functionality for master
  setupMasterFaderDrag(track);
  
  // Add click handler for track selection
  track.addEventListener('click', (e) => {
    // Don't trigger selection if clicking on interactive elements that have their own handlers
    if (e.target.closest('input')) return;
    selectMixerTrack(null); // null = master track
  });
  
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
  label.textContent = window.trackStates && window.trackStates[index] ? window.trackStates[index].name : `Track ${index + 1}`;
  label.style.color = color;
  label.style.cursor = 'pointer';
  label.title = 'Click to rename';

  // Add click handler for renaming
  label.addEventListener('click', (e) => {
    e.stopPropagation();
    const currentName = label.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.style.fontSize = 'inherit';
    input.style.fontWeight = 'inherit';
    input.style.color = color;
    input.style.background = 'var(--bg-panel)';
    input.style.border = '1px solid var(--accent-color)';
    input.style.padding = '2px 4px';
    input.style.borderRadius = '3px';
    input.style.textAlign = 'center';
    input.style.width = '100%';
    input.style.boxSizing = 'border-box';
    
    label.textContent = '';
    label.appendChild(input);
    input.focus();
    input.select();
    
    const finishRename = () => {
      const newName = input.value.trim() || currentName;
      input.removeEventListener('blur', finishRename);
      input.removeEventListener('keydown', handleKeydown);
      if (typeof window.renameTrack === 'function') {
        window.renameTrack(index, newName);
      } else {
        // Fallback if timeline.js did not register renameTrack yet
        if (window.trackStates && window.trackStates[index]) {
          window.trackStates[index].name = newName;
        }
        const timelineLabel = document.querySelector(`.track[data-index="${index}"] .track-label`);
        if (timelineLabel) timelineLabel.textContent = newName;
        label.textContent = newName;
      }
      
      // Update FX panel title if this track is currently selected
      if (window.mixer.selectedTrackIndex === index) {
        const fxHeader = document.querySelector('.mixer-fx-header');
        if (fxHeader) {
          fxHeader.textContent = `FX Slots (${newName})`;
        }
      }
    };
    
    const handleKeydown = (e) => {
       if (e.key === 'Enter') {
         e.preventDefault();
         finishRename();
       }
      if (e.key === 'Escape') {
        input.removeEventListener('blur', finishRename);
        input.removeEventListener('keydown', handleKeydown);
        label.textContent = currentName;
      }
    };
    
    input.addEventListener('blur', finishRename);
    input.addEventListener('keydown', handleKeydown);
  });
  
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
  attachVuMarkers(vuChannelLeft);
  
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
  attachVuMarkers(vuChannelRight);
  
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
  


  // --- Stereo Width knob UI ---
  const stereoContainer = document.createElement('div');
  stereoContainer.className = 'mixer-stereo-container';
  stereoContainer.style.display = 'flex';
  stereoContainer.style.flexDirection = 'column';
  stereoContainer.style.alignItems = 'center';
  stereoContainer.style.margin = '6px 0 0 0';

  const stereoLabel = document.createElement('div');
  stereoLabel.className = 'mixer-stereo-label';
  stereoLabel.textContent = 'Stereo';
  stereoLabel.style.fontSize = '10px';
  stereoLabel.style.color = '#aaa';
  stereoLabel.style.marginBottom = '2px';

  // --- Round stereo knob styled like lowpass ---
  const stereoKnob = document.createElement('div');
  stereoKnob.className = 'mixer-knob stereo-knob';
  stereoKnob.style.margin = '2px 0 0 0';
  stereoKnob.style.border = `2.5px solid ${color}`;
  stereoKnob.style.width = '38px';
  stereoKnob.style.height = '38px';
  stereoKnob.style.borderRadius = '50%';
  stereoKnob.style.position = 'relative';
  stereoKnob.style.background = '#18181c';
  stereoKnob.style.display = 'flex';
  stereoKnob.style.alignItems = 'center';
  stereoKnob.style.justifyContent = 'center';
  stereoKnob.style.cursor = 'pointer';
  stereoKnob.style.boxShadow = 'none';

  // Filled circle indicator (dot on edge)
  const stereoKnobIndicator = document.createElement('div');
  stereoKnobIndicator.style.position = 'absolute';
  stereoKnobIndicator.style.width = '10px';
  stereoKnobIndicator.style.height = '10px';
  stereoKnobIndicator.style.background = color;
  stereoKnobIndicator.style.borderRadius = '50%';
  stereoKnobIndicator.style.boxShadow = `0 0 4px ${color}88`;
  stereoKnobIndicator.style.left = '50%';
  stereoKnobIndicator.style.top = '50%';
  stereoKnobIndicator.style.transform = 'translate(-50%, -50%)';
  stereoKnob.appendChild(stereoKnobIndicator);

  // Value display
  const stereoValue = document.createElement('div');
  stereoValue.className = 'mixer-stereo-value';
  stereoValue.style.fontSize = '10px';
  stereoValue.style.color = color;
  stereoValue.style.marginTop = '2px';
  stereoValue.style.textAlign = 'center';

  // Range and state
  const minStereo = 0;
  const maxStereo = 1;
  let stereoVal = window.mixerStereoValues[index] ?? 0.5;

  function setStereoKnobVisual(val) {
    // Angle: -135deg (min) to +135deg (max)
    const angle = ((val - minStereo) / (maxStereo - minStereo)) * 270 - 135;
    const radius = 15;
    const rad = (angle - 90) * Math.PI / 180;
    const cx = 19 + radius * Math.cos(rad);
    const cy = 19 + radius * Math.sin(rad);
    stereoKnobIndicator.style.left = `${cx}px`;
    stereoKnobIndicator.style.top = `${cy}px`;
    if (val <= minStereo) stereoValue.textContent = 'Mono';
    else if (val >= maxStereo) stereoValue.textContent = 'Extra';
    else if (Math.abs(val - 0.5) < 0.01) stereoValue.textContent = 'Normal';
    else stereoValue.textContent = `${Math.round(val * 100)}%`;
    stereoKnob.style.borderColor = color;
    stereoKnobIndicator.style.background = color;
    stereoValue.style.color = color;
  }
  setStereoKnobVisual(stereoVal);

  // Mouse drag to change value
  let stereoDragging = false;
  let stereoLastY = 0;
  let stereoLastX = 0;
  stereoKnob.addEventListener('mousedown', (e) => {
    stereoDragging = true;
    stereoLastY = e.clientY;
    stereoLastX = e.clientX;
    document.body.style.userSelect = 'none';
  });
  window.addEventListener('mousemove', (e) => {
    if (!stereoDragging) return;
    const deltaY = stereoLastY - e.clientY;
    const deltaX = e.clientX - stereoLastX;
    stereoLastY = e.clientY;
    stereoLastX = e.clientX;
    let newVal = stereoVal + (deltaY * 0.005) + (deltaX * 0.005);
    newVal = Math.max(minStereo, Math.min(maxStereo, newVal));
    stereoVal = newVal;
    window.mixerStereoValues[index] = stereoVal;
    setStereoKnobVisual(stereoVal);
    if (typeof window.setTrackStereoWidth === 'function') {
      window.setTrackStereoWidth(index, stereoVal);
    }
  });
  window.addEventListener('mouseup', () => {
    stereoDragging = false;
    document.body.style.userSelect = '';
  });

  stereoContainer.appendChild(stereoLabel);
  stereoContainer.appendChild(stereoKnob);
  stereoContainer.appendChild(stereoValue);

  // Lowpass filter knob UI (existing code)
  const lpContainer = document.createElement('div');
  lpContainer.className = 'mixer-lowpass-container';
  lpContainer.style.display = 'flex';
  lpContainer.style.flexDirection = 'column';
  lpContainer.style.alignItems = 'center';
  lpContainer.style.margin = '6px 0 0 0';

  const lpLabel = document.createElement('div');
  lpLabel.className = 'mixer-lowpass-label';
  lpLabel.textContent = 'Lowpass';
  lpLabel.style.fontSize = '10px';
  lpLabel.style.color = '#aaa';
  lpLabel.style.marginBottom = '2px';

  // --- Round lowpass knob styled like PAN/STEREO ---
  const lpKnob = document.createElement('div');

  lpKnob.className = 'mixer-knob lowpass-knob';
  lpKnob.style.margin = '2px 0 0 0';
  lpKnob.style.border = `2.5px solid ${color}`;
  lpKnob.style.width = '38px';
  lpKnob.style.height = '38px';
  lpKnob.style.borderRadius = '50%';
  lpKnob.style.position = 'relative';
  lpKnob.style.background = '#18181c';
  lpKnob.style.display = 'flex';
  lpKnob.style.alignItems = 'center';
  lpKnob.style.justifyContent = 'center';
  lpKnob.style.cursor = 'pointer';
  lpKnob.style.boxShadow = 'none';

  // Filled circle indicator (dot on edge)
  const lpKnobIndicator = document.createElement('div');
  lpKnobIndicator.style.position = 'absolute';
  lpKnobIndicator.style.width = '10px';
  lpKnobIndicator.style.height = '10px';
  lpKnobIndicator.style.background = color;
  lpKnobIndicator.style.borderRadius = '50%';
  lpKnobIndicator.style.boxShadow = `0 0 4px ${color}88`;
  lpKnobIndicator.style.left = '50%';
  lpKnobIndicator.style.top = '50%';
  lpKnobIndicator.style.transform = 'translate(-50%, -50%)';
  lpKnob.appendChild(lpKnobIndicator);

  // Value display
  const lpValue = document.createElement('div');
  lpValue.className = 'mixer-lowpass-value';
  lpValue.style.fontSize = '10px';
  lpValue.style.color = color;
  lpValue.style.marginTop = '2px';
  lpValue.style.textAlign = 'center';

  // Range and state
  const minHz = 0;
  const maxHz = 20000;
  let lpValueHz = window.mixerLowpassValues[index] || maxHz;

  function setKnobVisual(valHz) {
    // Angle: -135deg (min) to +135deg (max)
    const angle = ((valHz - minHz) / (maxHz - minHz)) * 270 - 135;
    // Place dot on edge of knob
    const radius = 15; // px, from center
    const rad = (angle - 90) * Math.PI / 180;
    const cx = 19 + radius * Math.cos(rad);
    const cy = 19 + radius * Math.sin(rad);
    lpKnobIndicator.style.left = `${cx}px`;
    lpKnobIndicator.style.top = `${cy}px`;
    lpValue.textContent = valHz <= minHz ? '0 Hz' : (valHz >= maxHz ? 'Off' : `${Math.round(valHz)} Hz`);
    // Always use track color for border and indicator
    lpKnob.style.borderColor = color;
    lpKnobIndicator.style.background = color;
    lpValue.style.color = color;
  }
  setKnobVisual(lpValueHz);

  // Mouse drag to change value (vertical+horizontal, supports continued dragging)
  let dragging = false;
  let lastY = 0;
  let lastX = 0;
  lpKnob.addEventListener('mousedown', (e) => {
    dragging = true;
    lastY = e.clientY;
    lastX = e.clientX;
    document.body.style.userSelect = 'none';
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    // Use both vertical and horizontal movement for sensitivity
    const deltaY = lastY - e.clientY;
    const deltaX = e.clientX - lastX;
    lastY = e.clientY;
    lastX = e.clientX;
    // Sensitivity: 1 octave per ~60px, log scale (less sensitive)
    let logVal = Math.log10(lpValueHz + 1);
    logVal += (deltaY * 0.04) + (deltaX * 0.04);
    let newHz = Math.pow(10, logVal) - 1;
    newHz = Math.max(minHz, Math.min(maxHz, newHz));
    lpValueHz = newHz;
    window.mixerLowpassValues[index] = lpValueHz;
    setKnobVisual(lpValueHz);
    if (typeof window.setTrackLowpass === 'function') {
      window.setTrackLowpass(index, lpValueHz);
    }
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
    document.body.style.userSelect = '';
  });

  lpContainer.appendChild(lpLabel);
  lpContainer.appendChild(lpKnob);
  lpContainer.appendChild(lpValue);

  // Assemble track
  track.appendChild(label);
  track.appendChild(vuMeter);
  track.appendChild(muteBtn);
  track.appendChild(faderContainer);
  track.appendChild(stereoContainer); // Stereo knob above lowpass
  track.appendChild(lpContainer); // Lowpass knob
  // ...existing code for PAN/STEREO controls...

  // Mixer number label at bottom
  const mixerNumLabel = document.createElement('div');
  mixerNumLabel.className = 'mixer-number-label';
  mixerNumLabel.textContent = (index + 1).toString();
  mixerNumLabel.style.textAlign = 'center';
  mixerNumLabel.style.fontSize = '13px';
  mixerNumLabel.style.fontWeight = 'bold';
  mixerNumLabel.style.color = color;
  mixerNumLabel.style.margin = '12px 0 4px 0';
  track.appendChild(mixerNumLabel);
  
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
  track._color = color;
  
  // Set initial volume from trackGains if available
  // Set initial volume from mixerFaderValues only
  if (window.mixerFaderValues && window.mixerFaderValues[index] !== undefined) {
    track._volume = window.mixerFaderValues[index];
  } else {
    track._volume = 1.0;
  }
  // Update fader position
  updateFaderPosition(track, track._volume);
  
  // Add fader drag functionality
  setupFaderDrag(track, index);
  
  // Add click handler for track selection
  track.addEventListener('click', (e) => {
    // Don't trigger selection if clicking on interactive elements that have their own handlers
    if (e.target.closest('input')) return;
    selectMixerTrack(index);
  });
  
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
      const volume = 0.5; // -6dB
      window.mixerFaderValues[trackIndex] = volume;
      track._volume = volume;
      updateFaderPosition(track, volume);
      if (window.trackGains && window.trackGains[trackIndex]) {
        window.trackGains[trackIndex].gain.value = volume;
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
      
      // Calculate relative position (inverted because fader goes from bottom to top)
      // Range: 0 (bottom) to 1 (top) travel; gain mapping is shaped below
      const y = moveEvent.clientY - faderRect.top - 8;
      let percentage = 1 - (y / faderHeight);
      percentage = Math.max(0, Math.min(1, percentage));
      
      // Map 0-1 travel to gain: 75% = 0dB, 100% = +5dB
      const volume = percentageToGain(percentage);
      
      // Update mixer fader value only
      window.mixerFaderValues[trackIndex] = volume;
      track._volume = volume;
      updateFaderPosition(track, volume);
      // Update gain node: track volume * mixer fader
      const trackVolume = window.trackStates && window.trackStates[trackIndex] ? window.trackStates[trackIndex].volume : 1.0;
      if (window.trackGains && window.trackGains[trackIndex]) {
        window.trackGains[trackIndex].gain.value = trackVolume * volume;
      }
      // Do NOT update timeline trackStates or timeline volume knob
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
        masterSlider.value = gainToPercentage(volume);
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
      
      // Map travel to gain: 75% = 0dB, 100% = +5dB
      const volume = percentageToGain(percentage);
      
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
  const percentage = gainToPercentage(volume);
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

function vuDbToHeight(db) {
  const clamped = Math.max(VU_MIN_DB, Math.min(VU_MAX_DB, db));
  return (clamped - VU_MIN_DB) / (VU_MAX_DB - VU_MIN_DB);
}

function vuHeightToDb(heightPct) {
  const clamped = Math.max(0, Math.min(1, heightPct));
  return VU_MIN_DB + clamped * (VU_MAX_DB - VU_MIN_DB);
}

function attachVuMarkers(channelEl) {
  const markerLayer = document.createElement('div');
  markerLayer.className = 'mixer-vu-markers';

  const markers = [
    { db: VU_MAX_DB, cls: 'top' },
    { db: 0, cls: 'zero' },
    { db: -6, cls: 'neg-six' }
  ];

  markers.forEach(marker => {
    const line = document.createElement('div');
    line.className = `mixer-vu-marker ${marker.cls}`;
    line.style.bottom = `${(vuDbToHeight(marker.db) * 100).toFixed(2)}%`;
    markerLayer.appendChild(line);
  });

  channelEl.appendChild(markerLayer);
  
  // Add hover tooltip functionality
  const tooltip = document.getElementById('mixer-vu-tooltip');
  
  channelEl.addEventListener('mouseenter', () => {
    if (tooltip) tooltip.classList.remove('hidden');
  });
  
  channelEl.addEventListener('mouseleave', () => {
    if (tooltip) tooltip.classList.add('hidden');
  });
  
  channelEl.addEventListener('mousemove', (e) => {
    if (!tooltip) return;
    
    const rect = channelEl.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const heightPct = 1 - (y / rect.height);
    const db = vuHeightToDb(heightPct);
    
    tooltip.textContent = `${db.toFixed(1)} dB`;
    tooltip.style.left = `${e.clientX + 15}px`;
    tooltip.style.top = `${e.clientY - 10}px`;
  });
}

/**
 * Update VU meters for all mixer tracks
 */
function updateMixerVUMeters() {
  if (!window.mixer.isOpen) {
    window.mixer.vuUpdateRunning = false;
    return;
  }

  const toDb = (value) => (value > 0 ? 20 * Math.log10(value) : VU_MIN_DB);

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

    // Use smoothed peak for fill (more responsive to transients)
    const smoothedKey = side === 'L' ? '_smoothedRmsLeft' : '_smoothedRmsRight';
    track[smoothedKey] = VU_RMS_SMOOTHING * track[smoothedKey] + (1 - VU_RMS_SMOOTHING) * peak;

    const smoothedPeakDb = toDb(track[smoothedKey]);
    const peakDb = toDb(peak);

    // Convert to 0-1 range for display (already clamped in dbToHeight)
    const fillHeight = vuDbToHeight(smoothedPeakDb);
    const peakHeight = vuDbToHeight(peakDb);

    const fillEl = side === 'L' ? track._vuFillLeft : track._vuFillRight;
    const peakEl = side === 'L' ? track._vuPeakLeft : track._vuPeakRight;

    fillEl.style.height = `${(fillHeight * 100).toFixed(2)}%`;

    let fillColor = track._color || '#2aff2a'; // Use track color as default (safe zone)
    if (smoothedPeakDb >= VU_RED_DB) fillColor = '#ff2b2b';
    else if (smoothedPeakDb >= VU_ORANGE_DB) fillColor = '#ff9900';
    fillEl.style.backgroundColor = fillColor;

    const holdHeightKey = side === 'L' ? '_peakHoldHeightLeft' : '_peakHoldHeightRight';
    const holdUntilKey = side === 'L' ? '_peakHoldUntilLeft' : '_peakHoldUntilRight';

    let holdHeight = track[holdHeightKey] || 0;
    let holdUntil = track[holdUntilKey] || 0;

    if (peakHeight > holdHeight) {
      holdHeight = peakHeight;
      holdUntil = now + VU_PEAK_HOLD_MS;
    } else if (now > holdUntil && deltaSeconds > 0) {
      holdHeight = Math.max(peakHeight, holdHeight - VU_PEAK_DECAY_PER_SEC * deltaSeconds);
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
window.selectMixerTrack = selectMixerTrack;