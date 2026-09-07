/**
 * Third-person chase camera.
 *
 * Orbits a point above the player, driven by mouse look (pointer lock when the
 * player grants it) or by Q/E and the arrow keys so the camera is fully usable
 * from the keyboard alone. The boom shortens when geometry gets between the
 * camera and the character, and the whole rig can be handed over to the
 * cutscene director, which is why `enabled` exists.
 */

import * as THREE from 'three';
import { clamp, clamp01, damp } from '../core/easing.js';
import { heightAt } from './terrain.js';

const PITCH_MIN = -0.42;
const PITCH_MAX = 1.05;
const DIST_MIN = 3.0;
// A collapsed boom that fills the screen with the character's back is worse
// than a little geometry clipping, so the arm never shortens past this.
const BOOM_MIN = 3.1;
const DIST_MAX = 11.0;

export class ExploreCamera {
  constructor(camera, collision) {
    this.camera = camera;
    this.collision = collision;
    this.yaw = Math.PI;
    this.pitch = 0.28;
    this.distance = 7.2;
    this.targetDistance = 7.2;
    this.enabled = true;
    this.sensitivity = 2.6;

    this.position = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this._desiredPos = new THREE.Vector3();
    this._focus = new THREE.Vector3();
    this.shakeAmount = 0;
    this._shake = new THREE.Vector3();
    this.time = 0;
    this.fov = camera.fov;
    this.baseFov = camera.fov;
  }

  /** @param {{dx:number, dy:number}} look normalised pointer delta */
  applyLook(look, keyboardYaw, keyboardPitch, dt) {
    if (!this.enabled) return;
    this.yaw -= look.dx * this.sensitivity;
    this.pitch = clamp(this.pitch + look.dy * this.sensitivity, PITCH_MIN, PITCH_MAX);
    this.yaw -= keyboardYaw * dt * 2.1;
    this.pitch = clamp(this.pitch + keyboardPitch * dt * 1.3, PITCH_MIN, PITCH_MAX);
  }

  zoom(delta) {
    this.targetDistance = clamp(this.targetDistance + delta, DIST_MIN, DIST_MAX);
  }

  shake(amount) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** Snap directly behind the player — used when returning from a battle. */
  snapBehind(player) {
    this.yaw = player.facing + Math.PI;
    this.pitch = 0.28;
    this.distance = this.targetDistance;
    this.update(0.016, player, true);
  }

  update(dt, player, snap = false) {
    this.time += dt;
    this.distance = damp(this.distance, this.targetDistance, 6, dt);

    // Focus slightly above and ahead of the character.
    this._focus.set(
      player.position.x,
      player.position.y + 1.5 + this.pitch * 0.35,
      player.position.z,
    );

    const cp = Math.cos(this.pitch);
    const dirX = Math.sin(this.yaw) * cp;
    const dirZ = Math.cos(this.yaw) * cp;
    const dirY = Math.sin(this.pitch);

    // Shorten the boom if something is in the way.
    let dist = this.distance;
    const free = this.collision.rayDistance(
      this._focus.x, this._focus.z, dirX, dirZ, dist, 0.45,
      this._focus.y + dirY * this.distance * 0.5,
    );
    dist = Math.min(dist, Math.max(BOOM_MIN, free));

    this._desiredPos.set(
      this._focus.x + dirX * dist,
      this._focus.y + dirY * dist + 0.35,
      this._focus.z + dirZ * dist,
    );
    // Never let the lens sink into the ground.
    const floor = heightAt(this._desiredPos.x, this._desiredPos.z) + 0.85;
    if (this._desiredPos.y < floor) this._desiredPos.y = floor;

    const rate = snap ? 1000 : 14;
    this.position.x = damp(this.position.x, this._desiredPos.x, rate, dt);
    this.position.y = damp(this.position.y, this._desiredPos.y, rate, dt);
    this.position.z = damp(this.position.z, this._desiredPos.z, rate, dt);
    this.lookAt.x = damp(this.lookAt.x, this._focus.x, rate, dt);
    this.lookAt.y = damp(this.lookAt.y, this._focus.y, rate, dt);
    this.lookAt.z = damp(this.lookAt.z, this._focus.z, rate, dt);

    // A touch of extra FOV while sprinting sells the speed.
    const sprintT = clamp01((player.speed - 4.2) / 4.2);
    this.fov = damp(this.fov, this.baseFov + sprintT * 6, 4, dt);

    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 1.8 * Math.max(0.25, this.shakeAmount));
    if (this.shakeAmount > 0.001) {
      const t = this.time * 43;
      this._shake.set(
        Math.sin(t * 1.7) * this.shakeAmount,
        Math.sin(t * 2.3 + 1.1) * this.shakeAmount * 0.8,
        Math.sin(t * 1.3 + 2.2) * this.shakeAmount * 0.5,
      );
    } else {
      this._shake.set(0, 0, 0);
    }

    this.apply();
  }

  /** Push the current rig state onto the actual THREE camera. */
  apply() {
    this.camera.position.copy(this.position).add(this._shake);
    this.camera.lookAt(this.lookAt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
