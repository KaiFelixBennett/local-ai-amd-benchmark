/**
 * Web Audio API synth engine — cinematic battle soundtrack.
 * Look-ahead scheduler, rich harmonies, arpeggiated figures, dynamic intensity.
 * Hit/parry/counter stingers, menu blips, telegraph cue, victory/defeat.
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this._battlePlaying = false;
    this._battleGain = null;
    this._schedulerId = null;
    this._scheduleLookahead = 250; // ms
    this._scheduleInterval = 25; // ms
    this._nextNoteTime = 0;
    this._currentBeat = 0;
    this._muted = false;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.35;
    this.masterGain.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    if (this.masterGain) this.masterGain.gain.value = v;
  }

  // ─── Chord Progression (dark, cinematic) ───
  // Am9 → Gmaj7 → Fmaj7 → Em9 (4-bar loop, 2 bars per chord)
  _getChordForBeat(beat) {
    const bar = Math.floor((beat % 32) / 8); // 0-3
    const chords = [
      { root: 220, third: 261.6, fifth: 329.6, seventh: 392, ninth: 493.9 },   // Am9
      { root: 220, third: 261.6, fifth: 329.6, seventh: 392, ninth: 493.9 },   // Am9
      { root: 196, third: 246.9, fifth: 293.7, seventh: 349.2, ninth: 440 },   // Gmaj9
      { root: 196, third: 246.9, fifth: 293.7, seventh: 349.2, ninth: 440 },   // Gmaj9
    ];
    return chords[bar] || chords[0];
  }

  // ─── Bass Pattern (walking, expressive) ───
  _getBassNote(beat) {
    const pos = beat % 32;
    const pattern = [
      { p: 0, f: 55, d: 2 },    // A1
      { p: 2, f: 82.4, d: 1 },  // E2 (passing)
      { p: 4, f: 73.4, d: 2 },  // C2
      { p: 6, f: 82.4, d: 1 },  // D2 (passing)
      { p: 8, f: 49, d: 2 },    // G1
      { p: 10, f: 73.4, d: 1 }, // B1 (passing)
      { p: 12, f: 65.4, d: 2 }, // F1 (passing)
      { p: 14, f: 73.4, d: 1 }, // A1 (passing)
      { p: 16, f: 43.7, d: 2 }, // F1
      { p: 18, f: 65.4, d: 1 }, // C2 (passing)
      { p: 20, f: 58.3, d: 2 }, // D1
      { p: 22, f: 73.4, d: 1 }, // E2 (passing)
      { p: 24, f: 41.2, d: 2 }, // E1
      { p: 26, f: 65.4, d: 1 }, // B1 (passing)
      { p: 28, f: 55, d: 2 },   // A1
      { p: 30, f: 82.4, d: 1 }, // C2 (passing)
    ];
    return pattern.find(n => n.p === pos) || null;
  }

  // ─── Arpeggio Pattern (ethereal, rising) ───
  _getArpNote(beat) {
    const pos = beat % 16;
    // Plays on every quarter note
    if (pos % 2 !== 0) return null;
    const chord = this._getChordForBeat(beat);
    const arpNotes = [chord.root, chord.third, chord.fifth, chord.seventh, chord.ninth, chord.fifth, chord.third, chord.root];
    const idx = pos / 2;
    return { f: arpNotes[idx] * 2, d: 0.15 }; // octave up
  }

  // ─── Melody (heroic motif, sparse and emotional) ───
  _getMelodyNote(beat) {
    const pos = beat % 32;
    const pattern = [
      { p: 0, f: 440, d: 2 },     // A4 (hold)
      { p: 4, f: 523.3, d: 1 },   // C5
      { p: 6, f: 587.3, d: 1 },   // D5
      { p: 8, f: 523.3, d: 2 },   // C5
      { p: 10, f: 493.9, d: 1 },  // B4
      { p: 12, f: 440, d: 2 },    // A4
      { p: 16, f: 587.3, d: 1 },  // D5
      { p: 18, f: 659.3, d: 1 },  // E5
      { p: 20, f: 698.5, d: 2 },  // F5
      { p: 22, f: 659.3, d: 1 },  // E5
      { p: 24, f: 587.3, d: 1 },  // D5
      { p: 26, f: 523.3, d: 1 },  // C5
      { p: 28, f: 493.9, d: 1 },  // B4
      { p: 30, f: 440, d: 2 },    // A4
    ];
    return pattern.find(n => n.p === pos) || null;
  }

  // ─── Scheduler ───
  _scheduler() {
    const bpm = 128;
    const secondsPerBeat = 60.0 / bpm;
    while (this._nextNoteTime < this.ctx.currentTime + this._scheduleLookahead / 1000) {
      this._scheduleNote(this._currentBeat, this._nextNoteTime);
      this._nextNoteTime += secondsPerBeat / 2; // eighth notes
      this._currentBeat++;
    }
    this._schedulerId = setTimeout(() => this._scheduler(), this._scheduleInterval);
  }

  _scheduleNote(beat, time) {
    const pos = beat % 32;
    const chord = this._getChordForBeat(beat);

    // ── Pad (sustained chord tones, smooth) ──
    if (pos % 8 === 0) {
      this._playPadChord(chord, time, 4);
    }

    // ── Bass ──
    const bass = this._getBassNote(beat);
    if (bass) {
      this._playBass(bass.f, time, bass.d * 0.25);
    }

    // ── Arpeggio (ethereal shimmer) ──
    const arp = this._getArpNote(beat);
    if (arp) {
      this._playArp(arp.f, time, arp.d);
    }

    // ── Melody (sparse, emotional) ──
    const mel = this._getMelodyNote(beat);
    if (mel) {
      this._playMelody(mel.f, time, mel.d * 0.25);
    }

    // ── Percussion ──
    this._playPercussion(pos, time);
  }

  _playPadChord(chord, time, duration) {
    const vol = 0.025;
    for (const freq of [chord.root, chord.third, chord.fifth, chord.seventh]) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      // Smooth attack/release
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(vol, time + 0.8);
      gain.gain.setValueAtTime(vol * 0.8, time + duration - 1);
      gain.gain.linearRampToValueAtTime(0, time + duration);
      osc.connect(gain);
      gain.connect(this._battleGain);
      osc.start(time);
      osc.stop(time + duration);
    }
  }

  _playBass(freq, time, duration) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, time);
    gain.gain.setValueAtTime(0.15, time + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain);
    gain.connect(this._battleGain);
    osc.start(time);
    osc.stop(time + duration);
  }

  _playArp(freq, time, duration) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = 'sine';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    filter.Q.value = 2;
    gain.gain.setValueAtTime(0.03, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this._battleGain);
    osc.start(time);
    osc.stop(time + duration);
  }

  _playMelody(freq, time, duration) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, time);
    filter.frequency.linearRampToValueAtTime(1500, time + duration);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.05, time + 0.05);
    gain.gain.setValueAtTime(0.05, time + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this._battleGain);
    osc.start(time);
    osc.stop(time + duration);
  }

  _playPercussion(pos, time) {
    // Kick on beats 0, 8, 16, 24 (every bar start)
    if (pos % 8 === 0) {
      this._playKick(time);
    }
    // Snare on beats 4, 12, 20, 28
    if (pos % 8 === 4) {
      this._playSnare(time);
    }
    // Hi-hat on off-beats
    if (pos % 2 === 1) {
      this._playHihat(time, 0.02);
    }
    // Open hat on beat 6 of each bar
    if (pos % 8 === 6) {
      this._playHihat(time, 0.04);
    }
  }

  _playKick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(35, time + 0.12);
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    osc.connect(gain);
    gain.connect(this._battleGain);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  _playSnare(time) {
    const bufLen = this.ctx.sampleRate * 0.12;
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 800;
    gain.gain.setValueAtTime(0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    src.connect(filt);
    filt.connect(gain);
    gain.connect(this._battleGain);
    src.start(time);
    src.stop(time + 0.12);
  }

  _playHihat(time, vol) {
    const bufLen = this.ctx.sampleRate * 0.04;
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 7000;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    src.connect(filt);
    filt.connect(gain);
    gain.connect(this._battleGain);
    src.start(time);
    src.stop(time + 0.04);
  }

  /** Start battle music with proper scheduler. */
  startBattleBed() {
    if (!this.ctx || this._battlePlaying) return;
    this._battlePlaying = true;

    this._battleGain = this.ctx.createGain();
    this._battleGain.gain.value = 0.5;
    this._battleGain.connect(this.masterGain);

    this._currentBeat = 0;
    this._nextNoteTime = this.ctx.currentTime + 0.1;
    this._scheduler();
  }

  stopBattleBed() {
    this._battlePlaying = false;
    if (this._schedulerId) {
      clearTimeout(this._schedulerId);
      this._schedulerId = null;
    }
  }

  intensifyBattleBed(intensity) {
    if (this._battleGain) {
      this._battleGain.gain.value = 0.5 + intensity * 0.3;
    }
  }

  /** Menu selection blip. */
  playBlip() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  /** Menu confirm. */
  playConfirm() {
    if (!this.ctx) return;
    this._tone(660, 0.06, 'sine');
    setTimeout(() => this._tone(880, 0.08, 'sine'), 60);
  }

  /** Attack whoosh. */
  playAttack() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 200;
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.15);
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  /** Hit impact. */
  playHit() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 150;
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.12);
    gain.gain.value = 0.2;
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
  }

  /** Perfect parry — bright metallic ring. */
  playParry() {
    if (!this.ctx) return;
    this._tone(1200, 0.15, 'sine', 0.2);
    this._tone(1800, 0.1, 'sine', 0.12);
    this._tone(2400, 0.08, 'triangle', 0.06);
  }

  /** Counterattack after parry. */
  playCounter() {
    if (!this.ctx) return;
    this._tone(440, 0.1, 'sawtooth', 0.15);
    setTimeout(() => this._tone(660, 0.12, 'sawtooth', 0.12), 50);
    setTimeout(() => this._tone(880, 0.15, 'square', 0.1), 100);
  }

  /** Dodge — quick slide. */
  playDodge() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 300;
    osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.1);
    gain.gain.value = 0.1;
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  /** Telegraph warning — rising tension. */
  playTelegraph() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 100;
    osc.frequency.linearRampToValueAtTime(300, this.ctx.currentTime + 0.5);
    gain.gain.value = 0.06;
    gain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.6);
  }

  /** Heal — warm chord. */
  playHeal() {
    if (!this.ctx) return;
    this._tone(523, 0.2, 'sine', 0.12);
    this._tone(659, 0.2, 'sine', 0.1);
    this._tone(784, 0.25, 'sine', 0.08);
  }

  /** Critical hit. */
  playCrit() {
    if (!this.ctx) return;
    this._tone(880, 0.1, 'square', 0.18);
    this._tone(1320, 0.08, 'sawtooth', 0.12);
    setTimeout(() => this._tone(1760, 0.12, 'sine', 0.1), 40);
  }

  /** Weakness hit. */
  playWeakness() {
    if (!this.ctx) return;
    this._tone(440, 0.15, 'sawtooth', 0.15);
    this._tone(554, 0.15, 'sawtooth', 0.12);
    this._tone(660, 0.2, 'square', 0.1);
  }

  /** Victory fanfare. */
  playVictory() {
    if (!this.ctx) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => this._tone(freq, 0.3, 'sine', 0.15), i * 150);
    });
    setTimeout(() => {
      this._tone(1047, 0.6, 'sine', 0.15);
      this._tone(1319, 0.6, 'sine', 0.1);
    }, 600);
  }

  /** Defeat — descending minor. */
  playDefeat() {
    if (!this.ctx) return;
    const notes = [392, 349, 330, 262];
    notes.forEach((freq, i) => {
      setTimeout(() => this._tone(freq, 0.4, 'sine', 0.12), i * 250);
    });
  }

  // ─── Open World Ambience ───
  _ambiencePlaying = false;
  _ambienceGain = null;
  _ambienceNodes = [];

  /** Start forest ambience (wind, crickets, distant owl). */
  startAmbience() {
    if (!this.ctx || this._ambiencePlaying) return;
    this._ambiencePlaying = true;

    this._ambienceGain = this.ctx.createGain();
    this._ambienceGain.gain.value = 0.15;
    this._ambienceGain.connect(this.masterGain);

    // Wind — filtered noise
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 400;
    const windGain = this.ctx.createGain();
    windGain.gain.value = 0.3;
    noise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this._ambienceGain);
    noise.start();
    this._ambienceNodes.push(noise);

    // Crickets — periodic high chirps
    const cricketOsc = this.ctx.createOscillator();
    cricketOsc.type = 'sine';
    cricketOsc.frequency.value = 4200;
    const cricketGain = this.ctx.createGain();
    cricketGain.gain.value = 0;
    const cricketLfo = this.ctx.createOscillator();
    cricketLfo.type = 'square';
    cricketLfo.frequency.value = 8; // chirp rate
    const cricketLfoGain = this.ctx.createGain();
    cricketLfoGain.gain.value = 0.04;
    cricketLfo.connect(cricketLfoGain);
    cricketLfoGain.connect(cricketGain.gain);
    cricketOsc.connect(cricketGain);
    cricketGain.connect(this._ambienceGain);
    cricketOsc.start();
    cricketLfo.start();
    this._ambienceNodes.push(cricketOsc, cricketLfo);

    // Distant owl — low hooting
    const owlOsc = this.ctx.createOscillator();
    owlOsc.type = 'sine';
    owlOsc.frequency.value = 280;
    const owlGain = this.ctx.createGain();
    owlGain.gain.value = 0;
    const owlLfo = this.ctx.createOscillator();
    owlLfo.type = 'sine';
    owlLfo.frequency.value = 0.15; // slow hoot
    const owlLfoGain = this.ctx.createGain();
    owlLfoGain.gain.value = 0.02;
    owlLfo.connect(owlLfoGain);
    owlLfoGain.connect(owlGain.gain);
    owlOsc.connect(owlGain);
    owlGain.connect(this._ambienceGain);
    owlOsc.start();
    owlLfo.start();
    this._ambienceNodes.push(owlOsc, owlLfo);
  }

  /** Stop forest ambience. */
  stopAmbience() {
    if (!this._ambiencePlaying) return;
    this._ambienceNodes.forEach(node => {
      try { node.stop(); } catch (e) { /* already stopped */ }
    });
    this._ambienceNodes = [];
    if (this._ambienceGain) {
      this._ambienceGain.disconnect();
      this._ambienceGain = null;
    }
    this._ambiencePlaying = false;
  }

  /** Status effect applied. */
  playStatus() {
    if (!this.ctx) return;
    this._tone(300, 0.15, 'triangle', 0.1);
    this._tone(250, 0.2, 'triangle', 0.08);
  }

  /** Ultimate attack charge. */
  playUltimateCharge() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 80;
    osc.frequency.linearRampToValueAtTime(400, this.ctx.currentTime + 1.0);
    gain.gain.value = 0.1;
    gain.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 1.2);
  }

  /** Ultimate attack release. */
  playUltimateRelease() {
    if (!this.ctx) return;
    this._tone(220, 0.3, 'sawtooth', 0.2);
    this._tone(330, 0.3, 'square', 0.15);
    this._tone(440, 0.35, 'sawtooth', 0.18);
    this._tone(550, 0.4, 'sine', 0.12);
  }

  _tone(freq, duration, type, vol) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.value = vol || 0.1;
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }
}
