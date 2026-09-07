/**
 * fx/camera.js — The dynamic combat camera.
 *
 * The camera is a smooth, spring-damped observer that "cuts" and "travels"
 * to whoever is acting, keeping both the actor and the target in frame. It
 * never snaps (except on an explicit hard cut), so combat reads as a
 * continuously directed sequence rather than a slideshow.
 *
 * Modes:
 *   wide      — overview of the whole stage (idle, intro, menu)
 *   focus     — tracks a single actor (their turn, an enemy winding up)
 *   duel      — frames actor + target (attacks, reactions) — the default
 *   over      — slightly higher, for a telegraph to read clearly
 *
 * `game.js` sets the rig's focus via setMode/setSubject; the rig resolves a
 * target position+lookAt each frame and damps toward it. A subtle idle
 * sway keeps the frame alive; a slow dolly adds weight to big moments.
 *
 * All positions are in the scene's world space (stage centered at origin,
 * party at +z, enemies at -z).
 */
import * as THREE from 'three';
import { damp, clamp } from '../core/rng.js';

export class CameraRig {
  /**
   * @param {THREE.PerspectiveCamera} camera
   */
  constructor(camera) {
    this.camera = camera;
    this.mode = 'wide';
    this._pos = new THREE.Vector3(0, 3.4, 11.5);
    this._look = new THREE.Vector3(0, 1.2, -1);
    this._curPos = this._pos.clone();
    this._curLook = this._look.clone();
    this._subject = null;    // THREE object (actor root)
    this._target = null;     // THREE object (opponent root)
    this._t = 0;
    this._shake = 0;
    this._dolly = 0;         // extra z push for dramatic beats
    this._hardCut = false;
    camera.position.copy(this._curPos);
  }

  /**
   * Set focus.
   * @param {string} mode 'wide'|'focus'|'duel'|'over'
   * @param {object} subject  combatant (has .root) to center
   * @param {object} target   combatant to keep in frame (optional)
   */
  setMode(mode, subject = null, target = null) {
    if (mode === this.mode && subject === this._subject && target === this._target) return;
    this.mode = mode;
    this._subject = subject;
    this._target = target;
    // A subject change is a "cut": snap closer to avoid a long travel across
    // the stage, but keep it smooth (not a hard teleport).
    this._hardCut = !!subject && subject !== this._prevSubject;
    this._prevSubject = subject;
  }

  addShake(amount) {
    this._shake = Math.min(1.4, this._shake + amount);
  }

  /** Push the camera in for a beat (parry, ultimate). */
  dolly(amount) {
    this._dolly = Math.min(2.5, this._dolly + amount);
  }

  update(dt, worldT) {
    this._t += dt;
    const p = this._pos;
    const l = this._look;
    const s = this._subject;

    if (this.mode === 'wide') {
      p.set(Math.sin(this._t * 0.15) * 0.6, 3.4 + Math.sin(this._t * 0.2) * 0.1, 11.5);
      l.set(0, 1.25, -1.2);
    } else if (s && s.root) {
      const a = s.root.position;
      const b = this._target && this._target.root ? this._target.root.position : null;
      if (this.mode === 'focus') {
        // Side-on, framing the subject with the enemy side behind
        const dirX = a.x >= 0 ? 1 : -1;
        p.set(a.x + dirX * 3.4, a.y + 1.9, a.z + 4.6);
        l.set(a.x, a.y + 1.15, a.z - 0.5);
      } else if (this.mode === 'over') {
        // Higher & further so the whole telegraph reads
        p.set(a.x * 0.5, 4.6, a.z + 6.6);
        l.set(a.x, a.y + 1.0, a.z - 1.0);
      } else {
        // duel: midpoint, offset toward the subject's side
        const mx = b ? (a.x + b.x) / 2 : a.x;
        const mz = b ? (a.z + b.z) / 2 : a.z - 1;
        const side = (b ? a.x >= b.x : a.x >= 0) ? 1 : -1;
        p.set(mx + side * 2.6, 2.6, mz + 5.4);
        l.set(mx, 1.25, mz - 0.6);
      }
    }

    // Apply dolly (push in) and ease it back out
    if (this._dolly > 0.001) {
      const dir = new THREE.Vector3().subVectors(l, p).normalize();
      p.addScaledVector(dir, this._dolly);
      this._dolly = Math.max(0, this._dolly - dt * 2.2);
    }

    // Damp toward the resolved pose (fast on a cut, gentler otherwise)
    const lambda = this._hardCut ? 10 : 4.5;
    this._curPos.x = damp(this._curPos.x, p.x, lambda, dt);
    this._curPos.y = damp(this._curPos.y, p.y, lambda, dt);
    this._curPos.z = damp(this._curPos.z, p.z, lambda, dt);
    this._curLook.x = damp(this._curLook.x, l.x, lambda, dt);
    this._curLook.y = damp(this._curLook.y, l.y, lambda, dt);
    this._curLook.z = damp(this._curLook.z, l.z, lambda, dt);
    if (this._hardCut) this._hardCut = false;

    // Idle sway + hit shake
    const sway = 0.06;
    const sx = Math.sin(this._t * 0.7) * sway;
    const sy = Math.cos(this._t * 0.9) * sway * 0.5;
    let shakeX = 0, shakeY = 0;
    if (this._shake > 0.001) {
      const sh = this._shake;
      shakeX = (Math.random() - 0.5) * sh * 0.18;
      shakeY = (Math.random() - 0.5) * sh * 0.18;
      this._shake = Math.max(0, this._shake - dt * 3);
    }

    this.camera.position.set(this._curPos.x + sx + shakeX, this._curPos.y + sy + shakeY, this._curPos.z);
    this.camera.lookAt(this._curLook.x + shakeX * 0.4, this._curLook.y + shakeY * 0.4, this._curLook.z);
  }
}
