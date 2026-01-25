/**
 * distortion.js
 * Distortion effect with multiple algorithms using Web Audio API
 */

class DistortionEffect {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.input = audioContext.createGain();
    this.output = audioContext.createGain();
    
    // Dry/wet mix control
    this.dryGain = audioContext.createGain();
    this.wetGain = audioContext.createGain();
    
    // Pre-drive gain
    this.driveGain = audioContext.createGain();
    
    // Waveshaper for distortion
    this.waveshaper = audioContext.createWaveShaper();
    this.waveshaper.oversample = '4x';
    
    // Post-distortion gain (makeup gain)
    this.makeupGain = audioContext.createGain();
    this.makeupGain.gain.value = 0.5;
    
    // Default parameters
    this.params = {
      mix: 0.5,        // 0-1, wet/dry mix
      drive: 0.5,      // 0-1, input gain before distortion
      threshold: 0.5,  // 0-1, clipping/distortion threshold
      type: 'softclip' // 'softclip', 'hardclip', 'foldback'
    };
    
    // Build initial distortion curve
    this.buildDistortionCurve();
    
    // Setup routing
    this.setupRouting();
    
    // Apply initial parameters
    this.updateMix();
  }
  
  setupRouting() {
    // Input splits to dry and wet paths
    this.input.connect(this.dryGain);
    this.input.connect(this.driveGain);
    
    // Wet path: driveGain → waveshaper → makeupGain → wetGain
    this.driveGain.connect(this.waveshaper);
    this.waveshaper.connect(this.makeupGain);
    this.makeupGain.connect(this.wetGain);
    
    // Both paths to output
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
  }
  
  /**
   * Build distortion curve based on type and threshold
   */
  buildDistortionCurve() {
    const samples = 2048;
    const curve = new Float32Array(samples);
    const threshold = Math.max(0.01, Math.min(1, this.params.threshold));
    
    for (let i = 0; i < samples; i++) {
      const x = (i - samples / 2) / (samples / 2); // -1 to 1
      let y;
      
      switch (this.params.type) {
        case 'hardclip':
          // Hard clipping at threshold
          y = x > threshold ? threshold : (x < -threshold ? -threshold : x);
          break;
          
        case 'foldback':
          // Foldback distortion - reflects signal back across threshold
          const absX = Math.abs(x);
          if (absX <= threshold) {
            y = x;
          } else {
            const foldAmount = (absX - threshold) / (1 - threshold);
            const folded = threshold - foldAmount * (1 - threshold);
            y = x > 0 ? folded : -folded;
          }
          break;
          
        case 'softclip':
        default:
          // Soft clipping using tanh-like curve around threshold
          const scale = 1 / Math.max(0.01, threshold);
          const scaled = x * scale;
          y = Math.tanh(scaled) / scale;
          break;
      }
      
      curve[i] = y;
    }
    
    this.waveshaper.curve = curve;
  }
  
  /**
   * Update the dry/wet mix
   */
  updateMix() {
    const mix = Math.max(0, Math.min(1, this.params.mix));
    this.dryGain.gain.value = 1 - mix;
    this.wetGain.gain.value = mix;
  }
  
  /**
   * Update drive gain
   */
  updateDrive() {
    const drive = Math.max(0, Math.min(1, this.params.drive));
    // Map 0-1 to 1-20x gain
    this.driveGain.gain.value = 1 + drive * 19;
  }
  
  /**
   * Set distortion parameters
   * @param {Object} params - { mix, drive, threshold, type }
   */
  setParams(params) {
    if (params.mix !== undefined) {
      this.params.mix = params.mix;
      this.updateMix();
    }
    
    if (params.drive !== undefined) {
      this.params.drive = params.drive;
      this.updateDrive();
    }
    
    if (params.threshold !== undefined || params.type !== undefined) {
      if (params.threshold !== undefined) this.params.threshold = params.threshold;
      if (params.type !== undefined) this.params.type = params.type;
      this.buildDistortionCurve();
    }
  }
  
  /**
   * Get current parameters
   */
  getParams() {
    return { ...this.params };
  }
  
  /**
   * Connect this effect to a destination
   */
  connect(destination) {
    this.output.connect(destination);
  }
  
  /**
   * Disconnect this effect
   */
  disconnect() {
    this.output.disconnect();
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    this.input.disconnect();
    this.dryGain.disconnect();
    this.driveGain.disconnect();
    this.waveshaper.disconnect();
    this.makeupGain.disconnect();
    this.wetGain.disconnect();
    this.output.disconnect();
  }
}

// Export to window
window.DistortionEffect = DistortionEffect;
