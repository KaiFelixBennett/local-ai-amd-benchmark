// audio.js — all runtime sound is synthesized (Web Audio API). No samples.
// Layered battle bed + stingers + telegraph cues + menu blips.

export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.sfxBus = null;
        this.bedNodes = [];
        this.bedGains = [];
        this.stingerBus = null;
        this._started = false;
        this._lowHp = false;
        this._intensity = 0; // 0..1 battle intensity (interp)
    }

    // Must be called after a user gesture (browser autoplay policy).
    start() {
        if (this._started) return this.ctx;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
        this.ctx.resume();

        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(this.ctx.destination);

        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = 0.9;
        this.sfxBus.connect(this.master);

        this.stingerBus = this.ctx.createGain();
        this.stingerBus.gain.value = 0.9;
        this.stingerBus.connect(this.master);

        this._started = true;
        this._buildBattleBed();
        return this.ctx;
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    // ---------------- Battle bed ----------------
    _buildBattleBed() {
        const ctx = this.ctx;
        // Low drone (timpani-ish): two detuned saws through lowpass.
        const droneGain = ctx.createGain();
        droneGain.gain.value = 0.16;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 220;
        droneGain.connect(lp); lp.connect(this.master);

        const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
        const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 55.5;
        const o3 = ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = 110;
        o1.connect(droneGain); o2.connect(droneGain); o3.connect(droneGain);
        o1.start(); o2.start(); o3.start();
        this.bedNodes.push(o1, o2, o3);
        this.bedGains.push(droneGain);

        // Slow pulse arpeggio (art-nouveau feel): minor chord tones cycling.
        const seqGain = ctx.createGain();
        seqGain.gain.value = 0.05;
        seqGain.connect(this.master);
        this.bedNodes.push(seqGain);
        this.bedGains.push(seqGain);
        const notes = [110, 130.8, 164.8, 196, 220, 261.6, 329.6]; // A minor-ish
        let idx = 0;
        const step = () => {
            const osc = ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = notes[idx % notes.length];
            idx++;
            const env = ctx.createGain();
            env.gain.setValueAtTime(0, ctx.currentTime);
            env.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 0.05);
            env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
            osc.connect(env); env.connect(seqGain);
            osc.start();
            osc.stop(ctx.currentTime + 0.75);
        };
        this._arpTimer = window.setInterval(step, 550);

        // Airy pad: two saws through chorus-ish detune.
        const padGain = ctx.createGain();
        padGain.gain.value = 0.03;
        padGain.connect(this.master);
        this.bedNodes.push(padGain);
        this.bedGains.push(padGain);
        const p1 = ctx.createOscillator(); p1.type = 'sawtooth'; p1.frequency.value = 329.6;
        const p2 = ctx.createOscillator(); p2.type = 'sawtooth'; p2.frequency.value = 330.8;
        p1.connect(padGain); p2.connect(padGain);
        p1.start(); p2.start();
        this.bedNodes.push(p1, p2);
    }

    // Call each frame with battle intensity 0..1 (rising as HP drops / phase pressure).
    updateIntensity(target) {
        if (!this.ctx) return;
        this._intensity += (target - this._intensity) * 0.08;
        const f = this._intensity;
        for (const g of this.bedGains) {
            const base = 0.16;
            g.gain.value = base + f * 0.28;
        }
    }

    setLowHp(on) {
        this._lowHp = on;
        // darken the pad slightly (color shift: cold high harmonic)
        if (this.ctx && this.bedNodes.length) {
            // no-op here; intensity envelope covers it
        }
    }

    // ---------------- Generic tone helper ----------------
    _blip(freq, dur, vol, type = 'sine', glideTo = null) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, ctx.currentTime);
        env.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.01);
        env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        osc.connect(env);
        env.connect(this.sfxBus);
        osc.start();
        if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, ctx.currentTime + dur);
        osc.stop(ctx.currentTime + dur + 0.02);
    }

    _stinger(freqs, dur, vol, type = 'triangle') {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const oscillator = this.ctx.createOscillator();
        oscillator.type = type;
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(vol, now + 0.02);
        env.gain.setValueAtTime(vol, now + dur * 0.6);
        env.gain.exponentialRampToValueAtTime(0.001, now + dur);
        env.connect(this.stingerBus);
        oscillator.connect(env);
        freqs.forEach((f, i) => {
            const osc2 = this.ctx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.value = f * (i === 0 ? 1 : 1.003);
            const g2 = this.ctx.createGain();
            g2.gain.value = 0.7;
            g2.connect(env);
            osc2.connect(g2);
            osc2.start(now + 0.02);
            osc2.stop(now + dur + 0.05);
        });
        oscillator.start(now);
        oscillator.stop(now + dur + 0.02);
    }

    // ---------------- UI blips ----------------
    menuBlip() { this._blip(660, 0.06, 0.22, 'square'); }
    menuConfirm() { this._blip(880, 0.09, 0.28, 'square'); this._blip(1320, 0.08, 0.2, 'square', null); }
    menuCancel() { this._blip(440, 0.07, 0.18, 'square'); }
    arrowMove() { this._blip(330, 0.04, 0.14, 'square'); }

    // ---------------- Combat ----------------
    telegraphCue(intensity = 1) {
        // rising pitch cue for telegraphs — time to react
        if (!this.ctx) return;
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, ctx.currentTime);
        env.gain.linearRampToValueAtTime(intensity * 0.25, ctx.currentTime + 0.6);
        env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.95);
        osc.connect(env); env.connect(this.sfxBus);
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.85);
        osc.start(); osc.stop(ctx.currentTime + 1.0);
    }

    hit() {
        this._blip(180, 0.12, 0.5, 'sawtooth', 90);
        // noise thump
        this._noiseThump(0.08, 0.4);
    }

    dodge() {
        // whoosh
        this._noiseSweep(600, 200, 0.18, 0.25);
    }

    parry() {
        // bright metal ring
        this._stinger([880, 1320, 1760], 0.4, 0.4, 'triangle');
        this._blip(2200, 0.25, 0.2, 'sine', 4400);
    }

    counterspark() {
        this._stinger([660, 990, 1320], 0.5, 0.5, 'sawtooth');
        this._blip(330, 0.1, 0.4, 'square');
    }

    crit() {
        this._stinger([1100, 1650, 2200], 0.6, 0.55, 'sawtooth');
        this._noiseThump(0.2, 0.6);
    }

    weakspot() {
        this._stinger([1400, 2100], 0.3, 0.3, 'sine');
    }

    ultimate() {
        // big chord swell
        this._stinger([220, 330, 440, 660], 1.6, 0.5, 'sine');
        this._noiseThump(1.2, 0.8);
    }

    // ---------------- scene transitions ----------------
    victory() {
        // fanfare: ascending major arpeggio
        const notes = [523, 659, 784, 1046, 1318];
        notes.forEach((f, i) => {
            setTimeout(() => this._blip(f, 0.3, 0.35, 'triangle'), i * 120);
        });
        this._stinger([523, 659, 784, 1046], 1.4, 0.4, 'sine');
    }

    defeat() {
        this._stinger([110, 92, 82], 2.4, 0.4, 'sine');
    }

    _noiseThump(dur, vol) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const bufferSize = this.ctx.sampleRate * dur;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(vol, this.ctx.currentTime);
        env.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
        src.connect(filter); filter.connect(env); env.connect(this.sfxBus);
        src.start();
    }

    _noiseSweep(f1, f2, dur, vol) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const bufferSize = this.ctx.sampleRate * dur;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(f1, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(f2, this.ctx.currentTime + dur);
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0.001, this.ctx.currentTime);
        env.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 0.05);
        env.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
        src.connect(filter); filter.connect(env); env.connect(this.sfxBus);
        src.start();
    }

    // ---------------- cleanup ----------------
    stop() {
        if (this._arpTimer) window.clearInterval(this._arpTimer);
        this._arpTimer = null;
        if (this.ctx) {
            this.ctx.close();
            this.ctx = null;
        }
        this._started = false;
    }
}
