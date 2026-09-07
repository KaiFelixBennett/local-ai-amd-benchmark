/**
 * Free-aim mode: a reticle the player steers with the mouse or arrow keys,
 * plus weak-point detection.
 *
 * Body hits are resolved with a real raycast against the creature's meshes.
 * Weak points are resolved in *screen space* against their projected radius,
 * which is far more forgiving than a pixel-perfect ray and lets us apply a
 * gentle magnetism so the reticle settles onto a weak point rather than
 * skating past it.
 */

import * as THREE from 'three';
import { clamp, clamp01, damp } from '../core/easing.js';

const AIM_LIMIT = 0.86;

export class TargetingSystem {
  constructor(camera) {
    this.camera = camera;
    this.active = false;
    this.aim = new THREE.Vector2(0, 0);
    this.raycaster = new THREE.Raycaster();
    this.enemies = [];
    this.shooter = null;
    this.hover = null;         // { enemy, weakPoint, screen, distance }
    this.magnetism = 0.55;
    this.sensitivity = 1.0;
    this.shotsLeft = 0;
    this._bodyCache = new Map();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._tmpNdc = new THREE.Vector2();
  }

  enter(shooter, enemies, shots = 1) {
    this.active = true;
    this.shooter = shooter;
    this.enemies = enemies;
    this.shotsLeft = shots;
    this.aim.set(0, 0.05);
    this.hover = null;
    for (const e of enemies) e.setWeakPointsVisible(e.alive);
  }

  exit() {
    this.active = false;
    for (const e of this.enemies) e.setWeakPointsVisible(false);
    this.hover = null;
    this.shooter = null;
  }

  /**
   * @param {{dx:number, dy:number}} delta pointer movement in normalised units
   * @param {{x:number, y:number}} pad keyboard axis (-1..1)
   */
  move(delta, pad, dt) {
    if (!this.active) return;
    this.aim.x = clamp(this.aim.x + delta.dx * this.sensitivity + pad.x * dt * 1.15, -AIM_LIMIT, AIM_LIMIT);
    this.aim.y = clamp(this.aim.y - delta.dy * this.sensitivity + pad.y * dt * 1.15, -AIM_LIMIT, AIM_LIMIT);
  }

  /** Meshes belonging to an enemy body, excluding weak-point markers. */
  _bodyMeshes(enemy) {
    let list = this._bodyCache.get(enemy.id);
    if (list) return list;
    list = [];
    enemy.root.traverse((o) => {
      if (o.isMesh && !o.userData.weakPoint && o !== enemy.shadowBlob) list.push(o);
    });
    this._bodyCache.set(enemy.id, list);
    return list;
  }

  update(dt) {
    if (!this.active) return;
    const cam = this.camera;
    const alive = this.enemies.filter((e) => e.alive);

    // --- Body raycast ------------------------------------------------------
    this._tmpNdc.set(this.aim.x, this.aim.y);
    this.raycaster.setFromCamera(this._tmpNdc, cam);
    let bodyHit = null;
    for (const e of alive) {
      const hits = this.raycaster.intersectObjects(this._bodyMeshes(e), false);
      if (hits.length && (!bodyHit || hits[0].distance < bodyHit.distance)) {
        bodyHit = { enemy: e, distance: hits[0].distance, point: hits[0].point.clone() };
      }
    }

    // --- Weak points in screen space --------------------------------------
    let best = null;
    for (const e of alive) {
      for (const wp of e.weakPointMeshes()) {
        wp.getWorldPosition(this._v);
        const centre = this._v.clone().project(cam);
        if (centre.z < -1 || centre.z > 1) continue;
        const info = wp.userData.weakPoint;
        const scale = wp.getWorldScale(this._v2).x;
        // Project a point offset along camera-right to measure NDC radius.
        this._v2.copy(this._v);
        this._v2.addScaledVector(
          new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0),
          info.radius * scale,
        );
        const edge = this._v2.project(cam);
        const radius = Math.max(0.02, Math.abs(edge.x - centre.x));
        const dx = this.aim.x - centre.x;
        const dy = this.aim.y - centre.y;
        const dist = Math.hypot(dx, dy);
        if (dist < radius * 1.6 && (!best || dist < best.dist)) {
          best = { enemy: e, wp, info, centre, radius, dist };
        }
      }
    }

    // --- Magnetism ---------------------------------------------------------
    if (best && best.dist < best.radius * 1.6) {
      const pull = (1 - clamp01(best.dist / (best.radius * 1.6))) * this.magnetism;
      this.aim.x = damp(this.aim.x, best.centre.x, pull * 9, dt);
      this.aim.y = damp(this.aim.y, best.centre.y, pull * 9, dt);
    }

    const onWeak = best && best.dist <= best.radius * 1.05
      && (!bodyHit || bodyHit.enemy === best.enemy);

    this.hover = onWeak
      ? {
        enemy: best.enemy, weakPoint: best.info, ndc: { x: best.centre.x, y: best.centre.y },
        radius: best.radius, kind: 'weak',
      }
      : bodyHit
        ? { enemy: bodyHit.enemy, weakPoint: null, ndc: null, radius: 0, kind: 'body' }
        : null;
  }

  /**
   * Resolve a shot at the current reticle position.
   * @returns {{hit:boolean, enemy:object|null, weakPoint:object|null, point:THREE.Vector3|null}}
   */
  fire() {
    if (!this.active) return { hit: false, enemy: null, weakPoint: null, point: null };
    this.shotsLeft = Math.max(0, this.shotsLeft - 1);
    if (!this.hover) return { hit: false, enemy: null, weakPoint: null, point: null };

    const enemy = this.hover.enemy;
    const point = new THREE.Vector3();
    if (this.hover.kind === 'weak') {
      const wp = enemy.weakPointMeshes().find((w) => w.userData.weakPoint === this.hover.weakPoint);
      if (wp) wp.getWorldPosition(point);
      else enemy.anchor(point);
    } else {
      enemy.anchor(point);
    }
    return {
      hit: true,
      enemy,
      weakPoint: this.hover.kind === 'weak' ? this.hover.weakPoint : null,
      point,
    };
  }

  /** Reticle position in CSS pixels for the HUD overlay. */
  screenPosition(width, height) {
    return {
      x: (this.aim.x * 0.5 + 0.5) * width,
      y: (-this.aim.y * 0.5 + 0.5) * height,
    };
  }

  invalidateCache() {
    this._bodyCache.clear();
  }
}
