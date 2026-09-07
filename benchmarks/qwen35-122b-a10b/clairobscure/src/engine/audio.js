// Simple Web Audio API wrapper for game sounds
let audioCtx = null;
let isInitialized = false;
let masterVolume = 0.5;

// Master gain node
let masterGain = null;

export async function initAudio() {
  if (isInitialized) return;
  
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = masterVolume;
    masterGain.connect(audioCtx.destination);
    
    isInitialized = true;
    console.log('Audio system initialized');
  } catch (e) {
    console.warn('Audio initialization failed:', e);
  }
}

// Create an oscillator with envelope
function createOscillatorSound(frequency, type = 'sine', duration = 0.3, volume = 0.3, slideTo = null) {
  if (!audioCtx || !masterGain) return;
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
  
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(slideTo, audioCtx.currentTime + duration);
  }
  
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  
  osc.connect(gain);
  gain.connect(masterGain);
  
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

// Create noise burst for impacts
function createNoiseBurst(duration = 0.2, volume = 0.4) {
  if (!audioCtx || !masterGain) return;
  
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  
  noise.connect(gain);
  gain.connect(masterGain);
  
  noise.start();
}

// SFX: Hit sound
export function playHitSound(crit = false) {
  if (crit) {
    createOscillatorSound(150, 'sawtooth', 0.4, 0.5, 50);
  } else {
    createNoiseBurst(0.15, 0.3);
  }
}

// SFX: Perfect parry (bright metallic clang)
export function playParrySound() {
  if (!audioCtx || !masterGain) return;
  
  // High-pitched metallic ping
  createOscillatorSound(800, 'sine', 0.3, 0.4, 1200);
  setTimeout(() => createOscillatorSound(600, 'square', 0.2, 0.2, 800), 50);
}

// SFX: Dodge (whoosh)
export function playDodgeSound() {
  createNoiseBurst(0.15, 0.25);
}

// SFX: Menu navigation
export function playMenuSound() {
  createOscillatorSound(880, 'sine', 0.08, 0.15);
}

// SFX: Menu select
export function playMenuSelectSound() {
  createOscillatorSound(1200, 'sine', 0.12, 0.2);
}

// SFX: Telegraph warning (rising tone)
export function playTelegraphSound() {
  if (!audioCtx || !masterGain) return;
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, audioCtx.currentTime);
  osc.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 0.4);
  
  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.4);
  
  osc.connect(gain);
  gain.connect(masterGain);
  
  osc.start();
  osc.stop(audioCtx.currentTime + 0.4);
}

// SFX: Victory fanfare
export async function playVictorySound() {
  if (!audioCtx || !masterGain) return;
  
  const notes = [523, 659, 784, 1047, 1319]; // C5, E5, G5, C6, E6
  if (!notes || !Array.isArray(notes)) return;
  for (let i = 0; i < notes.length; i++) {
    const freq = notes[i];
    setTimeout(() => createOscillatorSound(freq, 'triangle', 0.3, 0.25), i * 100);
  }
}

// SFX: Defeat (dark descending)
export async function playDefeatSound() {
  if (!audioCtx || !masterGain) return;
  
  const notes = [65, 49, 44, 39]; // C2, B1, A1, G1
  if (!notes || !Array.isArray(notes)) return;
  for (let i = 0; i < notes.length; i++) {
    const freq = notes[i];
    setTimeout(() => createOscillatorSound(freq, 'sawtooth', 0.6, 0.3), i * 300);
  }
}

// SFX: Skill cast (magic sparkle)
export function playSkillSound() {
  if (!audioCtx || !masterGain) return;
  
  // Quick arpeggio
  const notes = [880, 1100, 1320];
  if (!notes || !Array.isArray(notes)) return;
  for (let i = 0; i < notes.length; i++) {
    const freq = notes[i];
    setTimeout(() => createOscillatorSound(freq, 'sine', 0.15, 0.15), i * 50);
  }
}

// SFX: Status effect applied
export function playStatusSound() {
  createOscillatorSound(600, 'sine', 0.1, 0.15, 900);
}

export function setMasterVolume(value) {
  masterVolume = value;
  if (masterGain) {
    masterGain.gain.value = value;
  }
}

export function pauseAudio() {
  if (audioCtx && audioCtx.state === 'running') {
    audioCtx.suspend();
  }
}

export function resumeAudio() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

export function isAudioInitialized() {
  return isInitialized;
}
