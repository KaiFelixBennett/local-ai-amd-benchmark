/**
 * Cutscene director.
 *
 * Plays a list of camera shots with eased interpolation between a `from` and a
 * `to` pose, while a parallel subtitle track runs on its own clock. Shot poses
 * may be plain arrays or functions of the live context, so a shot can find the
 * player wherever they happen to be standing.
 *
 * The director owns the camera outright while playing; the explore camera is
 * disabled and re-synced on exit so control returns without a visual jump.
 */

import * as THREE from 'three';
import { clamp01, easeInOutCubic, easeOutCubic, lerp } from '../core/easing.js';

const EASES = {
  linear: (t) => t,
  in: (t) => t * t,
  out: easeOutCubic,
  inOut: easeInOutCubic,
};

export class CutsceneDirector {
  constructor(camera) {
    this.camera = camera;
    this.active = false;
    this.scene = null;
    this.shotIndex = 0;
    this.shotTime = 0;
    this.totalTime = 0;
    this.onComplete = null;
    this.context = null;
    this.letterbox = 0;
    this.fade = 0;          // 1 = fully black
    this.skipRequested = false;

    this._from = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this._to = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._resolved = null;
  }

  /**
   * @param {object} scene a CUTSCENES entry
   * @param {object} context { player, world } for dynamic shot poses
   * @param {() => void} onComplete
   */
  play(scene, context, onComplete) {
    this.scene = scene;
    this.context = context;
    this.onComplete = onComplete || null;
    this.active = true;
    this.shotIndex = 0;
    this.shotTime = 0;
    this.totalTime = 0;
    this.skipRequested = false;
    this.letterbox = scene.letterbox || 1;
    this._resolveShot();
  }

  get currentShot() {
    return this.scene ? this.scene.shots[this.shotIndex] : null;
  }

  /** Subtitle visible right now, or null. */
  get subtitle() {
    if (!this.active || !this.scene) return null;
    for (const line of this.scene.lines || []) {
      if (this.totalTime >= line.t && this.totalTime < line.t + line.dur) {
        const age = this.totalTime - line.t;
        const fadeIn = clamp01(age / 0.35);
        const fadeOut = clamp01((line.t + line.dur - this.totalTime) / 0.45);
        return { ...line, alpha: Math.min(fadeIn, fadeOut) };
      }
    }
    return null;
  }

  get duration() {
    if (!this.scene) return 0;
    const shots = this.scene.shots.reduce((a, s) => a + s.dur, 0);
    const lines = (this.scene.lines || []).reduce((a, l) => Math.max(a, l.t + l.dur), 0);
    return Math.max(shots, lines);
  }

  skip() {
    if (this.active && this.scene && this.scene.skippable !== false) this.skipRequested = true;
  }

  _resolveShot() {
    const shot = this.currentShot;
    if (!shot) return;
    const resolve = (side) => {
      const v = typeof side === 'function' ? side(this.context) : side;
      return v;
    };
    const from = resolve(shot.from);
    const to = resolve(shot.to);
    this._from.pos.fromArray(from.pos);
    this._from.look.fromArray(from.look);
    this._to.pos.fromArray(to.pos);
    this._to.look.fromArray(to.look);
    this._resolved = shot;
  }

  update(dt) {
    if (!this.active) return;

    if (this.skipRequested) {
      // Fade out fast, then finish.
      this.fade = Math.min(1, this.fade + dt * 3.4);
      if (this.fade >= 1) this._finish();
      return;
    }

    this.shotTime += dt;
    this.totalTime += dt;

    const shot = this.currentShot;
    if (!shot) { this._finish(); return; }

    const t = clamp01(this.shotTime / shot.dur);
    const ease = EASES[shot.ease] || EASES.inOut;
    const e = ease(t);

    this._pos.lerpVectors(this._from.pos, this._to.pos, e);
    this._look.lerpVectors(this._from.look, this._to.look, e);
    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._look);
    if (shot.fov && Math.abs(this.camera.fov - shot.fov) > 0.01) {
      this.camera.fov = lerp(this.camera.fov, shot.fov, clamp01(dt * 3));
      this.camera.updateProjectionMatrix();
    }

    // Cross-shot fade: dip to black briefly at each cut.
    const tailIn = clamp01(this.shotTime / 0.4);
    const tailOut = clamp01((shot.dur - this.shotTime) / 0.4);
    const isLast = this.shotIndex === this.scene.shots.length - 1;
    this.fade = 1 - Math.min(tailIn, isLast ? 1 : tailOut);

    if (this.shotTime >= shot.dur) {
      this.shotIndex++;
      this.shotTime = 0;
      if (this.shotIndex >= this.scene.shots.length) {
        // Hold on the last frame until the dialogue has finished.
        if (this.totalTime >= this.duration) { this._finish(); return; }
        this.shotIndex = this.scene.shots.length - 1;
        this.shotTime = shot.dur;
      } else {
        this._resolveShot();
      }
    }
  }

  _finish() {
    this.active = false;
    this.fade = 0;
    this.letterbox = 0;
    const cb = this.onComplete;
    this.onComplete = null;
    this.scene = null;
    if (cb) cb();
  }
}
