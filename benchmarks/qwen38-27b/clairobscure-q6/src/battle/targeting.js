/**
 * battle/targeting.js — Free-aim reticle + weak-point hit detection.
 *
 * Used for ranged attacks and the ultimate's aim phase. The player moves a
 * 3D reticle (ray-cast from the mouse onto the battle plane or directly onto
 * enemy hit-spheres) and confirms with a click. Each enemy exposes weak
 * points as small spheres; a confirmed aim inside a weak-point's radius
 * scores a "weak-point hit" (bonus damage + Lumina + a visual mark).
 *
 * The reticle is a THREE group (two counter-rotating rings + a center dot +
 * a connector line to the target) rendered by the scene. This module only
 * owns the math + hit-testing; fx/particles draws the confirmation burst.
 */
import * as THREE from 'three';

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hit = new THREE.Vector3();

export class Targeting {
  /**
   * @param {THREE.Camera} camera
   * @param {HTMLElement} dom
   */
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.group = new THREE.Group();
    this.group.name = 'reticle';
    this.group.visible = false;
    this.active = false;
    this._buildMesh();
    this._point = new THREE.Vector3();
    this._lockedTarget = null;
    this._spin = 0;
  }

  _buildMesh() {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xe8c979,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this._mat = mat;
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 40), mat);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.022, 8, 32), mat.clone());
    this._mat2 = ring2.material;
    ring2.material.color.setHex(0x7fd8cf);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), mat.clone());
    this._matDot = dot.material;
    this._ring1 = ring1;
    this._ring2 = ring2;
    this.group.add(ring1, ring2, dot);

    // Weak-point indicator (only visible while aiming)
    this.weakMarker = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.05, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.9, depthTest: false })
    );
    this.weakMarker.visible = false;
    this.group.add(this.weakMarker);
    this.group.renderOrder = 999;
  }

  /** Begin aiming. `enemies` is the list of live enemy combatants. */
  beginAim(enemies) {
    this.active = true;
    this.enemies = enemies.filter((e) => e.hp > 0);
    this.group.visible = true;
  }

  endAim() {
    this.active = false;
    this.group.visible = false;
    this.weakMarker.visible = false;
  }

  /**
   * Per-frame: move the reticle with the mouse, hover-test weak points.
   * @returns {{weakPoint, enemy, point} | null} current hover state
   */
  update(dt, mouseNdc) {
    this._spin += dt * 2.2;
    if (!this.active) return null;
    _ndc.set(mouseNdc.x, mouseNdc.y);
    _ray.setFromCamera(_ndc, this.camera);

    // Reticle follows the enemy plane (y=1.1) so it hugs the target line.
    _plane.constant = -1.1;
    let point = _hit;
    if (!_ray.ray.intersectPlane(_plane, _hit)) {
      // Fallback straight ahead
      _ray.ray.at(8, _hit);
    }
    this._point.copy(_hit);
    this.group.position.copy(this._point);

    // Face the camera (billboard)
    this.group.quaternion.copy(this.camera.quaternion);
    this._ring1.rotation.z = this._spin;
    this._ring2.rotation.z = -this._spin * 1.4;

    // Weak-point hover test: smallest angular radius wins.
    let best = null;
    let bestDist = Infinity;
    for (const e of this.enemies || []) {
      if (e.hp <= 0) continue;
      for (const wp of e.weakPoints) {
        const d = this.group.position.distanceTo(wp);
        if (d < 1.15 && d < bestDist) {
          bestDist = d;
          best = { weakPoint: wp, enemy: e, point: wp.clone() };
        }
      }
    }
    this._hover = best;
    // The weak marker is a child of the (billboarded) reticle group, so set
    // its LOCAL offset from the reticle center to the weak point.
    if (best) {
      this.weakMarker.visible = true;
      this.weakMarker.position.copy(best.point).sub(this._point);
      this.weakMarker.quaternion.identity();
    } else {
      this.weakMarker.visible = false;
    }
    // Pulse
    const pulse = 1 + Math.sin(this._spin * 3) * 0.06;
    this.group.scale.setScalar(pulse);
    return best;
  }

  /**
   * Resolve a confirmed aim. If the cursor is on a weak point, returns that
   * enemy + 'weak' flag; otherwise the nearest live enemy on screen.
   */
  confirm() {
    if (!this.active) return null;
    if (this._hover) {
      return { enemy: this._hover.enemy, weak: true, weakPoint: this._hover.weakPoint, point: this._hover.point.clone() };
    }
    // Nearest enemy to the reticle
    let best = null;
    let bestDist = Infinity;
    for (const e of this.enemies || []) {
      if (e.hp <= 0) continue;
      const d = this.group.position.distanceTo(e.root.position);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best ? { enemy: best, weak: false, point: this._point.clone() } : null;
  }

  /** Flash the reticle on confirm (called by fx). */
  pop(strength = 1) {
    this._pop = strength;
  }

  updatePop(dt) {
    if (this._pop > 0) {
      this._pop = Math.max(0, this._pop - dt * 4);
      const s = 1 + this._pop * 0.5;
      if (this.active) this.group.scale.setScalar(s);
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  }
}
