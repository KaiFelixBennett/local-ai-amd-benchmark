/**
 * Web Audio API synthesizer for all game sounds.
 * Battle music, SFX (parry, hit, counter, menu, telegraph, victory, defeat).
 */

export class AudioSystem {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.initialized = false;
        this.musicPlaying = false;
        this.musicNodes = [];
    }

    init() {
        if (this.initialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.7;
            this.masterGain.connect(this.ctx.destination);

            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = 0.3;
            this.musicGain.connect(this.masterGain);

            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 0.6;
            this.sfxGain.connect(this.masterGain);

            this.initialized = true;
        } catch (e) {
            console.warn('Audio init failed:', e);
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /** Start layered battle music */
    startBattleMusic() {
        if (!this.initialized || this.musicPlaying) return;
        this.musicPlaying = true;
        this._playDrone();
        this._playArpeggio();
        this._playRhythm();
    }

    stopBattleMusic() {
        this.musicPlaying = false;
        for (const node of this.musicNodes) {
            try { node.stop(); } catch (e) {}
        }
        this.musicNodes = [];
    }

    _playDrone() {
        if (!this.initialized) return;
        // Low drone
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 55; // A1
        const gain1 = this.ctx.createGain();
        gain1.gain.value = 0.15;
        osc1.connect(gain1);
        gain1.connect(this.musicGain);
        osc1.start();
        this.musicNodes.push(osc1);

        // Fifth
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 82.5; // E2
        const gain2 = this.ctx.createGain();
        gain2.gain.value = 0.1;
        osc2.connect(gain2);
        gain2.connect(this.musicGain);
        osc2.start();
        this.musicNodes.push(osc2);
    }

    _playArpeggio() {
        if (!this.initialized) return;
        // Pentatonic arpeggio pattern
        const notes = [220, 261.6, 293.7, 349.2, 440, 349.2, 293.7, 261.6];
        const now = this.ctx.currentTime;

        for (let i = 0; i < 64; i++) {
            const osc = this.ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = notes[i % notes.length];
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0, now + i * 0.35);
            gain.gain.linearRampToValueAtTime(0.06, now + i * 0.35 + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.35 + 0.3);
            osc.connect(gain);
            gain.connect(this.musicGain);
            osc.start(now + i * 0.35);
            osc.stop(now + i * 0.35 + 0.35);
            this.musicNodes.push(osc);
        }
    }

    _playRhythm() {
        if (!this.initialized) return;
        // Subtle percussion
        const now = this.ctx.currentTime;
        for (let i = 0; i < 128; i++) {
            // Kick every 4 beats
            if (i % 16 === 0) {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(80, now + i * 0.175);
                osc.frequency.exponentialRampToValueAtTime(30, now + i * 0.175 + 0.15);
                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(0.12, now + i * 0.175);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.175 + 0.2);
                osc.connect(gain);
                gain.connect(this.musicGain);
                osc.start(now + i * 0.175);
                osc.stop(now + i * 0.175 + 0.25);
                this.musicNodes.push(osc);
            }
        }
    }

    /** Play a hit sound */
    playHit(heavy = false) {
        if (!this.initialized) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = heavy ? 'sawtooth' : 'square';
        osc.frequency.setValueAtTime(heavy ? 120 : 200, now);
        osc.frequency.exponentialRampToValueAtTime(heavy ? 40 : 80, now + 0.15);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(heavy ? 0.3 : 0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.2);
    }

    /** Play a parry sound - bright, metallic */
    playParry() {
        if (!this.initialized) return;
        const now = this.ctx.currentTime;
        // Metallic ring
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 1200;
        const gain1 = this.ctx.createGain();
        gain1.gain.setValueAtTime(0.25, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc1.connect(gain1);
        gain1.connect(this.sfxGain);
        osc1.start(now);
        osc1.stop(now + 0.5);

        // Harmonic
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 1800;
        const gain2 = this.ctx.createGain();
        gain2.gain.setValueAtTime(0.15, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc2.connect(gain2);
        gain2.connect(this.sfxGain);
        osc2.start(now);
        osc2.stop(now + 0.4);

        // Noise burst
        const bufferSize = this.ctx.sampleRate * 0.05;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.3;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.2, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        noise.connect(noiseGain);
        noiseGain.connect(this.sfxGain);
        noise.start(now);
    }

    /** Play a counterattack sound */
    playCounter() {
        if (!this.initialized) return;
        const now = this.ctx.currentTime;
        // Rising sweep
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.4);
    }

    /** Play a dodge sound - whoosh */
    playDodge() {
        if (!this.initialized) return;
        const now = this.ctx.currentTime;
        const bufferSize = this.ctx.sampleRate * 0.15;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            const t = i / this.ctx.sampleRate;
            data[i] = (Math.random() * 2 - 1) * Math.sin(t / 0.15 * Math.PI) * 0.2;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2000, now);
        filter.frequency.exponentialRampToValueAtTime(500, now + 0.15);
        filter.Q.value = 2;
        noise.connect(filter);
        filter.connect(this.sfxGain);
        noise.start(now);
    }

    /** Play a telegraph warning sound */
    playTelegraph() {
        if (!this.initialized) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.3);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.1);
        gain.gain.linearRampToValueAtTime(0, now + 0.4);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.5);
    }

    /** Play a menu blip */
    playMenuBlip() {
        if (!this.initialized) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 800;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    /** Play a skill use sound */
    playSkill() {
        if (!this.initialized) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(1000, now + 0.2);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.4);
    }

    /** Play a heal sound */
    playHeal() {
        if (!this.initialized) return;
        const now = this.ctx.currentTime;
        const notes = [523.3, 659.3, 784, 1047];
        for (let i = 0; i < notes.length; i++) {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = notes[i];
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0, now + i * 0.1);
            gain.gain.linearRampToValueAtTime(0.1, now + i * 0.1 + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 0.35);
        }
    }

    /** Play a crit sound */
    playCrit() {
        if (!this.initialized) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.3);

        // High ping
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 2400;
        const gain2 = this.ctx.createGain();
        gain2.gain.setValueAtTime(0.15, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc2.connect(gain2);
        gain2.connect(this.sfxGain);
        osc2.start(now);
        osc2.stop(now + 0.2);
    }

    /** Play victory fanfare */
    playVictory() {
        if (!this.initialized) return;
        const now = this.ctx.currentTime;
        const notes = [523.3, 659.3, 784, 1047, 784, 1047];
        const durations = [0.3, 0.3, 0.3, 0.6, 0.15, 0.6];
        let t = 0;
        for (let i = 0; i < notes.length; i++) {
            const osc = this.ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = notes[i];
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0, now + t);
            gain.gain.linearRampToValueAtTime(0.2, now + t + 0.05);
            gain.gain.setValueAtTime(0.2, now + t + durations[i] - 0.1);
            gain.gain.linearRampToValueAtTime(0, now + t + durations[i]);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(now + t);
            osc.stop(now + t + durations[i] + 0.05);
            t += durations[i];
        }
    }

    /** Play defeat sound */
    playDefeat() {
        if (!this.initialized) return;
        const now = this.ctx.currentTime;
        const notes = [392, 349.2, 330, 261.6];
        let t = 0;
        for (let i = 0; i < notes.length; i++) {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = notes[i];
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0, now + t);
            gain.gain.linearRampToValueAtTime(0.15, now + t + 0.1);
            gain.gain.setValueAtTime(0.15, now + t + 0.5);
            gain.gain.linearRampToValueAtTime(0, now + t + 0.8);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(now + t);
            osc.stop(now + t + 0.9);
            t += 0.5;
        }
    }

    /** Play status effect sound */
    playStatus() {
        if (!this.initialized) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.linearRampToValueAtTime(500, now + 0.15);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.25);
    }

    /** Play ultimate/gradient sound */
    playUltimate() {
        if (!this.initialized) return;
        const now = this.ctx.currentTime;
        // Rising power build
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(2000, now + 0.8);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 1.3);

        // Impact
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(200, now + 0.8);
        osc2.frequency.exponentialRampToValueAtTime(50, now + 1);
        const gain2 = this.ctx.createGain();
        gain2.gain.setValueAtTime(0.3, now + 0.8);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
        osc2.connect(gain2);
        gain2.connect(this.sfxGain);
        osc2.start(now + 0.8);
        osc2.stop(now + 1.2);
    }
}
