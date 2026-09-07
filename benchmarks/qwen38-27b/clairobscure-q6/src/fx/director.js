/**
 * fx/director.js — the cinematic camera director.
 *
 * Plays a beat sheet (story.INTRO) as choreographed shots. It moves the SAME
 * shared THREE camera the battle and overworld use, over the SAME shared
 * scene (the real overworld terrain) — that is the signature COE33 move: the
 * cutscene and the game are one engine, so the camera never "leaves" the
 * world. While a shot is active the Director owns the camera; the overworld
 * and battle rigs are simply not driving it (game.js gates that).
 *
 * Shots are resolved from concrete anchor points on the overworld (the Spire,
 * area centres, the player spawn) so the camera flies over real terrain and
 * stays legible. Wall-clock timing (performance.now) — the intro is narrative,
 * not combat, so it is seed- and timescale-independent and skippable.
 */
import * as THREE from 'three';
import { clamp, lerp } from '../core/rng.js';

const EASE_IN_OUT = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class Director {
  /**
   * @param {THREE.Camera} camera
   * @param {object} overworld  (uses .heightAt, .spire, .areas, .player)
   * @param {object} beats      story.INTRO
   * @param {object} cb { onSubtitle(line|null), onCard(text,sub|null), onLetterbox(bool), onDone(), onBeat(i) }
   */
  constructor(camera, overworld, beats, cb = {}) {
    this.camera = camera;
    this.ow = overworld;
    this.beats = beats || [];
    this.cb = cb;
    this.playing = false;
    this.index = 0;
    this._t = 0;
    this._last = 0;
    this._from = { pos: new THREE.Vector3() };
    this._curLook = null;
    this._initCamera();
  }

  _initCamera() {
    const spire = this._spirePos();
    this.camera.position.set(spire.x + 40, 26, spire.z + 55);
    this.camera.lookAt(spire.x, 24, spire.z);
    this._curLook = new THREE.Vector3(spire.x, 24, spire.z);
  }

  _spirePos() {
    return new THREE.Vector3(0, 0, 0); // Spire landmark sits at the clearing centre
  }

  /** Resolve a shot kind into concrete {pos, look} anchors over the terrain. */
  _anchors(kind, beat) {
    const h = (x, z) => this.ow ? this.ow.heightAt(x, z) : 0;
    const spire = { x: 0, z: 0 };
    switch (kind) {
      case 'sky':     return { pos: { x: 44, y: h(44, 58) + 30, z: 58 }, look: { x: 0, y: 30, z: 0 } };
      case 'street':  return { pos: { x: 30, y: h(30, 24) + 4, z: 30 }, look: { x: 18, y: h(18, 18) + 6, z: 18 } };
      case 'gap':     return { pos: { x: 14, y: h(14, 12) + 3, z: 20 }, look: { x: 22, y: h(22, 14) + 2, z: 10 } };
      case 'crowd':   return { pos: { x: 20, y: h(20, 16) + 5, z: 22 }, look: { x: 16, y: h(16, 12) + 5, z: 14 } };
      case 'spire':   return { pos: { x: 26, y: h(26, 26) + 14, z: 34 }, look: { x: spire.x, y: 34, z: spire.z } };
      case 'trio':    return { pos: { x: 8, y: h(8, 8) + 3, z: 12 }, look: { x: 0, y: h(0, 0) + 6, z: 0 } };
      case 'close_mae': {
        // Close on the player spawn (the dusk city edge).
        const px = this.ow && this.ow.player ? this.ow.player.position.x : 26;
        const pz = this.ow && this.ow.player ? this.ow.player.position.z : 20;
        return { pos: { x: px + 3, y: h(px, pz) + 2.4, z: pz + 3.4 }, look: { x: px, y: h(px, pz) + 1.6, z: pz } };
      }
      case 'title':   return { pos: { x: 30, y: h(30, 40) + 12, z: 46 }, look: { x: 0, y: 22, z: 0 } };
      default:        return { pos: { x: 30, y: h(30, 30) + 8, z: 34 }, look: { x: 0, y: 16, z: 0 } };
    }
  }

  play() {
    this.playing = true;
    this.index = 0;
    this._t = 0;
    this._last = performance.now();
    if (this.cb.onLetterbox) this.cb.onLetterbox(true);
    this._goTo(0, true);
    if (this.cb.onDone) this._done = this.cb.onDone.bind(this.cb);
  }

  _goTo(i, snap) {
    this.index = i;
    this._t = 0;
    const beat = this.beats[i];
    if (!beat) return;
    const a = this._anchors(beat.shot ? beat.shot.kind : 'spire', beat);
    this._from = {
      pos: this.camera.position.clone(),
      look: this._currentLook().clone(),
    };
    this._to = a;
    if (snap) {
      this.camera.position.set(a.pos.x, a.pos.y, a.pos.z);
      this._lookAt(this._to.look);
    }
    // Subtitle / card for this beat
    if (this.cb.onSubtitle) this.cb.onSubtitle(beat.subtitle || null);
    if (this.cb.onCard) this.cb.onCard(beat.card || null, beat.sub || null);
    if (this.cb.onBeat) this.cb.onBeat(i);
  }

  _currentLook() {
    // Derive the current look target from camera orientation.
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return new THREE.Vector3()
      .copy(this.camera.position)
      .addScaledVector(dir, 20);
  }

  _lookAt(p) {
    this._curLook = new THREE.Vector3(p.x, p.y, p.z);
    this.camera.lookAt(this._curLook);
  }

  update(now) {
    if (!this.playing) return;
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    const beat = this.beats[this.index];
    if (!beat) { this._finish(); return; }
    this._t += dt;
    const k = clamp(this._t / beat.dur, 0, 1);
    const e = EASE_IN_OUT(k);
    const a = this._to;
    this.camera.position.set(
      lerp(this._from.pos.x, a.pos.x, e),
      lerp(this._from.pos.y, a.pos.y, e),
      lerp(this._from.pos.z, a.pos.z, e),
    );
    if (!this._curLook) this._curLook = this._currentLook();
    this._curLook.set(
      lerp(this._from.look.x, a.look.x, e),
      lerp(this._from.look.y, a.look.y, e),
      lerp(this._from.look.z, a.look.z, e),
    );
    this.camera.lookAt(this._curLook);

    // A beat with a push/rise adds a subtle, BOUNDED dolly toward the look
    // target: offset = (push||rise) * 0.4 * eased-progress. Keyed off `e`
    // (0→1 over the beat) it never accumulates frame over frame.
    if (beat.shot && (beat.shot.push || beat.shot.rise)) {
      const amt = (beat.shot.push || beat.shot.rise);
      const dir = new THREE.Vector3().subVectors(this._curLook, this.camera.position).normalize();
      this.camera.position.addScaledVector(dir, amt * 0.4 * e);
    }
    if (k >= 1) {
      if (this.index + 1 < this.beats.length) this._goTo(this.index + 1, false);
      else this._finish();
    }
  }

  skip() {
    // Jump straight to the end, show the title card, then hand back control.
    const last = this.beats[this.beats.length - 1];
    if (last && last.card && this.cb.onCard) this.cb.onCard(last.card, last.sub || null);
    this._finish();
  }

  _finish() {
    if (!this.playing) return;
    this.playing = false;
    if (this.cb.onSubtitle) this.cb.onSubtitle(null);
    if (this.cb.onCard) this.cb.onCard(null, null);
    if (this.cb.onLetterbox) this.cb.onLetterbox(false);
    if (this._done) this._done();
  }
}

export default Director;
