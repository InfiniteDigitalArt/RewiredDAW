/**
 * low-high-cut.js
 * Simple high-pass / low-pass utility effect with draggable UI support
 */

class LowHighCutEffect {
  constructor(audioContext) {
    this.audioContext = audioContext;

    this.input = audioContext.createGain();
    this.output = audioContext.createGain();

    // Two cascaded filters per side for a steeper slope
    this.highpassA = audioContext.createBiquadFilter();
    this.highpassB = audioContext.createBiquadFilter();
    this.lowpassA = audioContext.createBiquadFilter();
    this.lowpassB = audioContext.createBiquadFilter();

    this.highpassA.type = 'highpass';
    this.highpassB.type = 'highpass';
    this.lowpassA.type = 'lowpass';
    this.lowpassB.type = 'lowpass';

    // Gentle resonance to avoid phasey ringing while keeping the slope tight
    [this.highpassA, this.highpassB, this.lowpassA, this.lowpassB].forEach(f => {
      f.Q.value = 0.707; // Butterworth-ish
    });

    // Default parameters
    this.params = {
      lowCut: 30,    // Hz
      highCut: 18000 // Hz
    };

    this.setupRouting();
    this.setParams(this.params);
  }

  setupRouting() {
    // Add analyser to visualize frequency content after EQ
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.75;
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

    this.input.connect(this.highpassA);
    this.highpassA.connect(this.highpassB);
    this.highpassB.connect(this.lowpassA);
    this.lowpassA.connect(this.lowpassB);
    this.lowpassB.connect(this.analyser);
    this.analyser.connect(this.output);
  }

  setParams(params = {}) {
    const minFreq = 20;
    const maxFreq = 20000;
    const minGap = 30; // Hz gap to keep filters ordered and stable

    const merged = { ...this.params, ...params };

    let lowCut = Math.max(minFreq, Math.min(maxFreq - minGap, merged.lowCut));
    let highCut = Math.max(lowCut + minGap, Math.min(maxFreq, merged.highCut));

    // Ensure ordering if params were inverted
    if (lowCut >= highCut) {
      lowCut = highCut - minGap;
    }

    this.params.lowCut = lowCut;
    this.params.highCut = highCut;

    // Smooth changes to avoid zipper noise
    [this.highpassA, this.highpassB].forEach(filter => {
      filter.frequency.setTargetAtTime(lowCut, this.audioContext.currentTime, 0.01);
    });
    [this.lowpassA, this.lowpassB].forEach(filter => {
      filter.frequency.setTargetAtTime(highCut, this.audioContext.currentTime, 0.01);
    });
  }

  getParams() {
    return { ...this.params };
  }

  getFrequencyData() {
    this.analyser.getByteFrequencyData(this.frequencyData);
    return this.frequencyData;
  }

  connect(destination) {
    this.output.connect(destination);
  }

  disconnect() {
    this.output.disconnect();
  }

  destroy() {
    this.input.disconnect();
    this.highpassA.disconnect();
    this.highpassB.disconnect();
    this.lowpassA.disconnect();
    this.lowpassB.disconnect();
    this.output.disconnect();
  }
}

// Export to window
window.LowHighCutEffect = LowHighCutEffect;
