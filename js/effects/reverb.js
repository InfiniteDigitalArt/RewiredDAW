/**
 * reverb.js
 * Convolution reverb effect using Web Audio API
 */

class ReverbEffect {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.input = audioContext.createGain();
    this.output = audioContext.createGain();
    
    // Dry/wet mix control
    this.dryGain = audioContext.createGain();
    this.wetGain = audioContext.createGain();
    
    // Convolver node for reverb
    this.convolver = audioContext.createConvolver();

    // Pre-delay to add space before reflections
    this.preDelay = audioContext.createDelay(1.0);
    this.preDelay.delayTime.value = 0.01; // 10ms default
    
    // High pass filter on wet path to remove low frequencies
    this.highPass = audioContext.createBiquadFilter();
    this.highPass.type = 'highpass';
    this.highPass.frequency.value = 200; // Remove rumble and mud below 150Hz
    this.highPass.Q.value = 0.7;
    
    // Default parameters
    this.params = {
      mix: 0.5,      // 0-1, wet/dry mix
      decay: 3.0,    // seconds
      preDelay: 0.01, // seconds
      lowCut: 150,   // Hz
      roomSize: 0.7  // 0-1, room size (affects decay and character)
    };
    
    // Build impulse response
    this.buildImpulse();
    
    // Setup routing
    this.setupRouting();
    
    // Apply initial parameters
    this.updateMix();
  }
  
  setupRouting() {
    // Input splits to dry and wet paths
    this.input.connect(this.dryGain);
    this.input.connect(this.preDelay);
    this.preDelay.connect(this.convolver);
    
    // Wet path: convolver → highPass filter → wetGain
    this.convolver.connect(this.highPass);
    this.highPass.connect(this.wetGain);
    
    // Both paths merge at output
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
  }
  
  /**
   * Build a simple impulse response for reverb
   */
  buildImpulse() {
    const rate = this.audioContext.sampleRate;
    const length = rate * this.params.decay;
    const impulse = this.audioContext.createBuffer(2, length, rate);
    
    const leftChannel = impulse.getChannelData(0);
    const rightChannel = impulse.getChannelData(1);
    
    // Room size affects the character of reflections
    // Small room (0): quick, tight reflections
    // Large room (1): diffuse, complex reflections
    const roomSize = Math.max(0, Math.min(1, this.params.roomSize || 0.7));
    
    // Generate exponentially decaying noise with room-size character
    for (let i = 0; i < length; i++) {
      const n = Math.random() * 2 - 1; // white noise
      const decay = Math.pow(1 - i / length, 2); // exponential decay
      
      // Room size affects early reflection character
      // Smaller rooms have sharper early reflections, larger rooms more diffuse
      const roomCharacter = 1 + roomSize * 0.5;
      const roomDecay = Math.pow(1 - i / length, 1.5 + roomSize * 0.5);
      
      leftChannel[i] = n * decay * roomDecay;
      rightChannel[i] = n * decay * roomDecay * (0.7 + roomSize * 0.3); // stereo variation increases with room size
    }
    
    this.convolver.buffer = impulse;
  }
  
  /**
   * Update the dry/wet mix
   */
  updateMix() {
    const mix = Math.max(0, Math.min(1, this.params.mix));
    this.dryGain.gain.value = 1; // Always full dry
    this.wetGain.gain.value = mix; // Only wet is controlled
  }
  
  /**
   * Set reverb parameters
   * @param {Object} params - { mix, decay, preDelay, lowCut, roomSize }
   */
  setParams(params) {
    if (params.mix !== undefined) {
      this.params.mix = params.mix;
      this.updateMix();
    }
    
    if (params.decay !== undefined || params.preDelay !== undefined || params.roomSize !== undefined) {
      if (params.decay !== undefined) this.params.decay = params.decay;
      if (params.preDelay !== undefined) this.params.preDelay = params.preDelay;
      if (params.roomSize !== undefined) this.params.roomSize = params.roomSize;
      this.buildImpulse();
    }

    if (params.preDelay !== undefined) {
      this.preDelay.delayTime.value = Math.max(0, Math.min(1.0, params.preDelay));
    }

    if (params.lowCut !== undefined) {
      this.params.lowCut = params.lowCut;
      this.highPass.frequency.value = Math.max(10, params.lowCut);
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
    this.preDelay.disconnect();
    this.convolver.disconnect();
    this.highPass.disconnect();
    this.wetGain.disconnect();
    this.output.disconnect();
  }
}

// Export to window
window.ReverbEffect = ReverbEffect;
