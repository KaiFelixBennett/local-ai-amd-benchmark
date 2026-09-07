/**
 * The combat camera.
 *
 * Framing is expressed as named shots; the director computes a desired
 * position/target for the active shot each frame and critically damps the real
 * camera toward it, so cuts read as fast pushes rather than teleports.
 *
 * The reaction shot is the important one: during an enemy attack the camera
 * sits perpendicular to the attacker->defender axis so the wind-up silhouette
 * and the ground telegraph are both fully legible, and it deliberately holds
 * still — no bob, no sway — because the player is reading frames.
 */

import * as THREE from 'three';
import { clamp01, damp, lerp, easeOutCubic, easeInOutCubic } from '../core/easing.js';

const UP = new THREE.Vector3(0, 1, 0);

export class CameraDirector {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 7.4, 17);
    this.look = new THREE.Vector3(0, 1.6, 0);
    this.desiredPos = this.pos.clone();
    this.desiredLook = this.look.clone();
    this.shot = { name: 'overview', params: {} };
    this.speed = 3.4;
    this.baseFov = camera.fov;
    this.fov = camera.fov;
    this.desiredFov = camera.fov;
    this.shakeAmount = 0;
    this.shakeDecay = 4;
    this.roll = 0;
    this.desiredRoll = 0;
    this.time = 0;
    this._v = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._shake = new THREE.Vector3();
  }

  /**
   * @param {string} name overview | actor | strike | reaction | aim | intro |
   *                      victory | defeat | boss
   * @param {object} params shot-specific references
   * @param {{speed:number, snap:boolean}} opts
   */
  set(name, params = {}, opts = {}) {
    this.shot = { name, params };
    this.speed = opts.speed || this._defaultSpeed(name);
    this.time = 0;
    if (opts.snap) {
      this._compute(0);
      this.pos.copy(this.desiredPos);
      this.look.copy(this.desiredLook);
      this.fov = this.desiredFov;
    }
  }

  _defaultSpeed(name) {
    if (name === 'strike') return 8.5;
    if (name === 'reaction') return 5.0;
    if (name === 'aim') return 7.0;
    if (name === 'intro') return 1.1;
    return 3.4;
  }

  shake(amount, decay = 4.5) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
    this.shakeDecay = decay;
  }

  punchFov(delta) {
    this.desiredFov = this.baseFov + delta;
  }

  /** Compute the desired framing for the active shot. */
  _compute(dt) {
    const p = this.shot.params;
    this.desiredFov = this.baseFov;
    this.desiredRoll = 0;

    switch (this.shot.name) {
      case 'actor': return this._shotActor(p);
      case 'strike': return this._shotStrike(p);
      case 'reaction': return this._shotReaction(p);
      case 'aim': return this._shotAim(p);
      case 'intro': return this._shotIntro();
      case 'victory': return this._shotVictory(p);
      case 'defeat': return this._shotDefeat(p);
      case 'boss': return this._shotBoss(p);
      default: return this._shotOverview();
    }
  }

  _shotOverview() {
    this.desiredPos.set(0, 7.6, 17.2);
    this.desiredLook.set(0.4, 1.7, 0);
  }

  _shotIntro() {
    const u = easeInOutCubic(clamp01(this.time / 3.6));
    const a = lerp(-0.75, -0.16, u);
    const r = lerp(23, 17.5, u);
    this.desiredPos.set(Math.sin(a) * r, lerp(3.2, 7.6, u), Math.cos(a) * r);
    this.desiredLook.set(lerp(3.5, 0.4, u), lerp(2.4, 1.7, u), 0);
    this.desiredFov = lerp(52, this.baseFov, u);
  }

  _shotActor(p) {
    const actor = p.actor;
    const focus = p.focus;
    if (!actor) return this._shotOverview();
    const from = actor.root.position;
    this._dir.copy(focus || new THREE.Vector3(6, 0, 0)).sub(from).setY(0).normalize();
    this._side.crossVectors(UP, this._dir).normalize();
    this.desiredPos.copy(from)
      .addScaledVector(this._dir, -4.6)
      .addScaledVector(this._side, -3.1)
      .add(this._v.set(0, 3.5, 0));
    this.desiredLook.copy(from)
      .addScaledVector(this._dir, 3.0)
      .add(this._v.set(0, 1.35, 0));
    this.desiredFov = this.baseFov + 2;
  }

  _shotStrike(p) {
    const target = p.target;
    const attacker = p.attacker;
    if (!target) return this._shotOverview();
    const tp = target.anchor(this._v).clone();
    const ap = attacker ? attacker.root.position : new THREE.Vector3(0, 0, 0);
    this._dir.copy(ap).sub(tp).setY(0).normalize();
    this._side.crossVectors(UP, this._dir).normalize();
    if (this._side.z < 0) this._side.negate();
    this.desiredPos.copy(tp)
      .addScaledVector(this._dir, 2.9)
      .addScaledVector(this._side, 3.4)
      .add(this._v.set(0, 1.5, 0));
    this.desiredLook.copy(tp).addScaledVector(this._dir, -0.4);
    this.desiredFov = this.baseFov - 4;
  }

  /**
   * Enemy attack framing: perpendicular to the attack axis, both combatants in
   * frame, camera locked still.
   */
  _shotReaction(p) {
    const attacker = p.attacker;
    const defender = p.defender;
    if (!attacker || !defender) return this._shotOverview();
    const a = attacker.root.position;
    const d = defender.root.position;
    this._dir.copy(a).sub(d).setY(0);
    const separation = Math.max(3, this._dir.length());
    this._dir.normalize();
    this._side.crossVectors(UP, this._dir).normalize();
    if (this._side.z < 0) this._side.negate();

    // Bias the framing toward the defender rather than the midpoint: they are
    // the character the player is actually reading, and on a wide battlefield a
    // true two-shot pushes them out to the edge of frame.
    const focus = this._v.copy(a).add(d).multiplyScalar(0.5).lerp(d, 0.34).clone();

    const dist = 5.0 + separation * 0.34;
    this.desiredPos.copy(focus)
      .addScaledVector(this._side, dist)
      .addScaledVector(this._dir, -0.6)
      .add(this._v.set(0, 3.0, 0));
    this.desiredLook.copy(focus)
      .addScaledVector(this._dir, 0.6)
      .add(this._v.set(0, 1.45, 0));
    this.desiredFov = this.baseFov + 3;
  }

  _shotAim(p) {
    const shooter = p.shooter;
    const focus = p.focus;
    if (!shooter) return this._shotOverview();
    const from = shooter.root.position;
    this._dir.copy(focus || new THREE.Vector3(6, 1.4, 0)).sub(from).setY(0).normalize();
    this._side.crossVectors(UP, this._dir).normalize();
    this.desiredPos.copy(from)
      .addScaledVector(this._dir, -1.5)
      .addScaledVector(this._side, -0.85)
      .add(this._v.set(0, 2.05, 0));
    this.desiredLook.copy(from)
      .addScaledVector(this._dir, 9)
      .add(this._v.set(0, 1.6, 0));
    this.desiredFov = this.baseFov - 8;
  }

  _shotVictory(p) {
    const centre = p.centre || new THREE.Vector3(-6, 1.2, 0);
    const a = this.time * 0.22 - 0.5;
    this.desiredPos.set(centre.x + Math.sin(a) * 8.5, 3.4, centre.z + Math.cos(a) * 8.5);
    this.desiredLook.copy(centre).add(this._v.set(0, 1.1, 0));
    this.desiredFov = this.baseFov - 3;
  }

  _shotDefeat(p) {
    const centre = p.centre || new THREE.Vector3(-6, 1, 0);
    this.desiredPos.set(centre.x + 1.6, 1.05, centre.z + 6.2);
    this.desiredLook.copy(centre).add(this._v.set(0, 0.55, 0));
    this.desiredFov = this.baseFov + 8;
    this.desiredRoll = 0.09;
  }

  _shotBoss(p) {
    const boss = p.boss;
    if (!boss) return this._shotOverview();
    const bp = boss.root.position;
    const u = clamp01(this.time / 2.6);
    this.desiredPos.set(bp.x - 6.5 + u * 1.5, lerp(0.9, 4.4, easeOutCubic(u)), bp.z + 7.2);
    this.desiredLook.set(bp.x, lerp(1.2, 2.4, u), bp.z);
    this.desiredFov = lerp(38, this.baseFov, u);
  }

  update(dt) {
    this.time += dt;
    this._compute(dt);

    this.pos.x = damp(this.pos.x, this.desiredPos.x, this.speed, dt);
    this.pos.y = damp(this.pos.y, this.desiredPos.y, this.speed, dt);
    this.pos.z = damp(this.pos.z, this.desiredPos.z, this.speed, dt);
    this.look.x = damp(this.look.x, this.desiredLook.x, this.speed * 1.15, dt);
    this.look.y = damp(this.look.y, this.desiredLook.y, this.speed * 1.15, dt);
    this.look.z = damp(this.look.z, this.desiredLook.z, this.speed * 1.15, dt);
    this.fov = damp(this.fov, this.desiredFov, 6, dt);
    this.roll = damp(this.roll, this.desiredRoll, 4, dt);

    this.shakeAmount = Math.max(0, this.shakeAmount - dt * this.shakeDecay * Math.max(0.2, this.shakeAmount));
    if (this.shakeAmount > 0.0005) {
      const s = this.shakeAmount;
      const t = this.time * 47;
      this._shake.set(
        Math.sin(t * 1.7) * s,
        Math.sin(t * 2.3 + 1.1) * s * 0.8,
        Math.sin(t * 1.3 + 2.2) * s * 0.5,
      );
    } else {
      this._shake.set(0, 0, 0);
    }

    const cam = this.camera;
    cam.position.copy(this.pos).add(this._shake);
    cam.lookAt(this.look);
    if (Math.abs(this.roll) > 0.0005) cam.rotateZ(this.roll);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}
