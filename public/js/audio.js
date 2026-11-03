/**
 * audio.js - Synthesized Spooky Ambient Soundscape
 * Built purely with Web Audio API (Zero external MP3 dependencies)
 * Generates an eerie autumnal wind drone and distant haunted resonance.
 */

class HalloweenSoundscape {
  constructor() {
    this.audioCtx = null;
    this.isPlaying = false;
    this.masterGain = null;
    this.noiseNode = null;
    this.windFilter = null;
    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.lfo = null;
  }

  init() {
    if (this.audioCtx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioContext();

    // Master volume with smooth ramp
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.setValueAtTime(0.0001, this.audioCtx.currentTime);
    this.masterGain.connect(this.audioCtx.destination);
  }

  start() {
    this.init();
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const now = this.audioCtx.currentTime;

    // 1. Synthesize Haunted Wind Noise using an AudioBuffer
    const bufferSize = this.audioCtx.sampleRate * 4;
    const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    // Pinkish/brown noise for warm wind sound
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5;
    }

    this.noiseNode = this.audioCtx.createBufferSource();
    this.noiseNode.buffer = noiseBuffer;
    this.noiseNode.loop = true;

    // Resonant bandpass filter that swoops like howling wind
    this.windFilter = this.audioCtx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.setValueAtTime(320, now);
    this.windFilter.Q.setValueAtTime(3.2, now);

    // LFO for the howling wind motion
    this.lfo = this.audioCtx.createOscillator();
    this.lfo.frequency.setValueAtTime(0.18, now); // Slow eerie breeze sweep
    const lfoGain = this.audioCtx.createGain();
    lfoGain.gain.setValueAtTime(180, now);

    this.lfo.connect(lfoGain);
    lfoGain.connect(this.windFilter.frequency);

    const windGain = this.audioCtx.createGain();
    windGain.gain.setValueAtTime(0.25, now);

    this.noiseNode.connect(this.windFilter);
    this.windFilter.connect(windGain);
    windGain.connect(this.masterGain);

    // 2. Sub-bass Graveyard Drone (Low haunting resonance)
    this.droneOsc1 = this.audioCtx.createOscillator();
    this.droneOsc1.type = 'sine';
    this.droneOsc1.frequency.setValueAtTime(55, now); // A1 note

    this.droneOsc2 = this.audioCtx.createOscillator();
    this.droneOsc2.type = 'triangle';
    this.droneOsc2.frequency.setValueAtTime(82.4, now); // E2 minor 5th harmonic

    const droneFilter = this.audioCtx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.setValueAtTime(160, now);

    const droneGain = this.audioCtx.createGain();
    droneGain.gain.setValueAtTime(0.18, now);

    this.droneOsc1.connect(droneFilter);
    this.droneOsc2.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(this.masterGain);

    // Start audio generators
    this.noiseNode.start(now);
    this.lfo.start(now);
    this.droneOsc1.start(now);
    this.droneOsc2.start(now);

    // Smooth fade in
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(0.0001, now);
    this.masterGain.gain.exponentialRampToValueAtTime(0.4, now + 2.5);

    this.isPlaying = true;
  }

  stop() {
    if (!this.audioCtx || !this.isPlaying) return;

    const now = this.audioCtx.currentTime;
    // Smooth fade out to eliminate clicks
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    setTimeout(() => {
      try {
        if (this.noiseNode) this.noiseNode.stop();
        if (this.lfo) this.lfo.stop();
        if (this.droneOsc1) this.droneOsc1.stop();
        if (this.droneOsc2) this.droneOsc2.stop();
      } catch (e) {
        // Safe disposal
      }
      this.isPlaying = false;
    }, 1300);
  }

  toggle() {
    if (this.isPlaying) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }
}

// Global ambient sound instance
window.spookyAudio = new HalloweenSoundscape();
