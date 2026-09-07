import * as THREE from 'three';
import { damp, easeInOutQuad } from '../core/easing.js';

// Dynamic combat camera. Holds three presets:
//   overview   — both battle lines framed (turn structure, menus)
//   focus(a,b) — tight two-shot of acting fighter vs. subject
//   defend     — over-the-shoulder on the defending character (enemy turn)
// Cuts are hard snaps with a small punch-in; moves are critically damped.
// Shake is additive and decays exponentially so impacts feel physical.

export class CameraDirector {
  constructor(camera) {
    this.camera = camera;
    this._pos = new THREE.Vector3(0, 4.8, 13.2);
    this._look = new THREE.Vector3(0, 1.5, -1.2);
    this._targetPos = this._pos.clone();
    this._targetLook = this._look.clone();
    this._fovTarget = 46;
    this._fov = 46;
    this._punch = 0;
    this._orbit = 0;
    this.shakeAmp = 0;
    this.speed = 5.0;
    camera.position.copy(this._pos);
    camera.lookAt(this._look);
  }

  overview() {
    this._targetPos.set(0, 4.7, 13.4);
    this._targetLook.set(0, 1.4, -1.2);
    this._fovTarget = 46;
    this.speed = 3.2;
  }

  // Cinematic intro sweep at battle start.
  introSweep() {
    this._pos.set(-9, 7.5, 16);
    this._look.set(0, 1.5, -2);
    this._targetPos.set(0, 4.7, 13.4);
    this._targetLook.set(0, 1.4, -1.2);
    this._fovTarget = 46;
    this._fov = 58;
    this.speed = 1.15;
  }

  // actor & subject are {mesh} entities. Camera slides behind the actor's flank.
  focus(actor, subject) {
    const ap = actor ? actor.mesh.position : new THREE.Vector3();
    const sp = subject ? subject.mesh.position : new THREE.Vector3(0, 1.4, -2);
    const mid = ap.clone().lerp(sp, 0.55);
    const sideSign = mid.x >= 0 ? 1 : -1;
    this._targetPos.set(mid.x * 0.6 + sideSign * 4.2, 2.9 + ap.distanceTo(sp) * 0.16, mid.z + 6.6);
    this._targetLook.copy(mid).setY(1.35);
    this._fovTarget = 40;
    this.speed = 4.4;
    this._punch = Math.min(0.5, this._punch + 0.28);
  }

  // Enemy turn: over-the-shoulder of the defender, enemy looming in frame.
  defend(defender, attacker) {
    const dp = defender ? defender.mesh.position : new THREE.Vector3(0, 1.3, 3);
    const ep = attacker ? attacker.mesh.position : new THREE.Vector3(0, 1.6, -3);
    const back = dp.clone().lerp(ep, -0.55);
    this._targetPos.set(back.x * 0.72 + (dp.x >= 0 ? 2.6 : -2.6), dp.y + 2.5, dp.z + 4.8);
    this._targetLook.copy(dp).lerp(ep, 0.4).setY(1.5);
    this._fovTarget = 43;
    this.speed = 4.6;
  }

  // Victory: slow pull-back hero shot.
  victory(party) {
    this._targetPos.set(0, 3.4, 11.5);
    const c = new THREE.Vector3();
    if (party.length) {
      for (const p of party) c.add(p.mesh.position);
      c.divideScalar(party.length);
    }
    this._targetLook.copy(c).setY(1.5);
    this._fovTarget = 50;
    this.speed = 1.6;
  }

  punch(strength = 1) { this._punch = Math.min(0.9, this._punch + 0.35 * strength); }
  shake(amp = 0.3) { this.shakeAmp = Math.min(1.2, this.shakeAmp + amp); }
  snapNow() {
    this._pos.copy(this._targetPos);
    this._look.copy(this._targetLook);
  }

  update(dt, time, contextLost) {
    if (contextLost) return;
    const s = 1 - Math.exp(-this.speed * dt);
    this._pos.lerp(this._targetPos, s);
    this._look.lerp(this._targetLook, s);
    this._punch = Math.max(0, this._punch - dt * 1.8);
    this._fov = damp(this._fov, this._fovTarget + this._punch * 7, 8, dt);
    this.shakeAmp = this.shakeAmp > 0.001 ? this.shakeAmp * Math.exp(-6.5 * dt) : 0;

    // Idle drift so the frame never goes dead-still.
    const drift = 0.06 * Math.sin(time * 0.5) + 0.03 * Math.sin(time * 0.23 + 2.1);

    this.camera.position.set(
      this._pos.x + drift * 2 + (Math.random() - 0.5) * this.shakeAmp * 0.55,
      this._pos.y + (Math.random() - 0.5) * this.shakeAmp * 0.55,
      this._pos.z + (Math.random() - 0.5) * this.shakeAmp * 0.35
    );
    if (Math.abs(this.camera.fov - this._fov) > 0.01) {
      this.camera.fov = this._fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(this._look);
    // small roll on shake for impact
    this.camera.rotateZ((Math.random() - 0.5) * this.shakeAmp * 0.05);
  }
}
