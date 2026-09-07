/**
 * Particle and flash effects.
 *
 * Two pooled THREE.Points fields (fine sparks and fat paint blobs) cover every
 * particle in the game. Both use additive blending, so fading a particle's
 * vertex colour toward black *is* fading it out — no per-point alpha attribute
 * and therefore no custom shader is needed.
 *
 * A small pool of additive quads handles impact flashes and expanding rings.
 */

import * as THREE from 'three';
import { paintSprite, glowSprite, starSprite, decalTexture } from '../engine/textures.js';
import { clamp01, easeOutCubic, easeOutQuad } from '../core/easing.js';

const SPARK_MAX = 900;
const PAINT_MAX = 700;
const QUAD_POOL = 26;

class PointField {
  constructor(scene, max, size, map, opacity) {
    this.max = max;
    this.pool = [];
    this.active = [];
    for (let i = 0; i < max; i++) {
      this.pool.push({
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        col: new THREE.Color(), life: 0, maxLife: 1, gravity: 0, drag: 0.9, flicker: 0,
      });
    }
    const positions = new Float32Array(max * 3);
    const colors = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.PointsMaterial({
      size, map, vertexColors: true, transparent: true, opacity,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  spawn(pos, vel, color, life, gravity, drag, flicker) {
    const p = this.pool.pop();
    if (!p) return null;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.col.set(color);
    p.life = life;
    p.maxLife = life;
    p.gravity = gravity;
    p.drag = drag;
    p.flicker = flicker || 0;
    this.active.push(p);
    return p;
  }

  update(dt) {
    const posAttr = this.points.geometry.attributes.position;
    const colAttr = this.points.geometry.attributes.color;
    const pa = posAttr.array;
    const ca = colAttr.array;
    let n = 0;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.active.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.pow(p.drag, dt * 60));
      p.pos.addScaledVector(p.vel, dt);
    }
    for (let i = 0; i < this.active.length && n < this.max; i++, n++) {
      const p = this.active[i];
      const u = clamp01(p.life / p.maxLife);
      const fade = easeOutQuad(u) * (p.flicker ? 0.55 + 0.45 * Math.sin(p.life * 40) : 1);
      pa[n * 3] = p.pos.x;
      pa[n * 3 + 1] = p.pos.y;
      pa[n * 3 + 2] = p.pos.z;
      ca[n * 3] = p.col.r * fade;
      ca[n * 3 + 1] = p.col.g * fade;
      ca[n * 3 + 2] = p.col.b * fade;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    this.points.geometry.setDrawRange(0, n);
  }
}

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.sparks = new PointField(scene, SPARK_MAX, 0.085, glowSprite(), 0.95);
    this.paint = new PointField(scene, PAINT_MAX, 0.34, paintSprite(), 0.8);

    // Pool of camera-facing additive quads for flashes and expanding rings.
    this.quads = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < QUAD_POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: glowSprite(), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 6;
      scene.add(m);
      this.quads.push({ mesh: m, life: 0, maxLife: 1, from: 1, to: 3, spin: 0, mode: 'flash' });
    }
    this._v = new THREE.Vector3();
    this._camera = null;
  }

  setCamera(cam) {
    this._camera = cam;
  }

  _takeQuad() {
    for (const q of this.quads) {
      if (q.life <= 0) return q;
    }
    return null;
  }

  /** Camera-facing flash sprite. */
  flash(pos, color, size = 2.2, life = 0.3, map = null) {
    const q = this._takeQuad();
    if (!q) return;
    q.mesh.position.copy(pos);
    q.mesh.material.color.set(color);
    q.mesh.material.map = map || glowSprite();
    q.mesh.material.needsUpdate = true;
    q.mesh.visible = true;
    q.life = life;
    q.maxLife = life;
    q.from = size * 0.4;
    q.to = size;
    q.spin = 0;
    q.mode = 'flash';
  }

  /** A four-pointed star burst, used for crits and weak-point hits. */
  star(pos, color, size = 3, life = 0.42) {
    this.flash(pos, color, size, life, starSprite());
  }

  /**
   * Expanding ground ring laid flat on the arena floor. Uses the ornamented
   * magic-circle decal so slams and deaths leave a painterly mark rather than a
   * plain blob.
   */
  shockwave(pos, color, size = 5, life = 0.55) {
    const q = this._takeQuad();
    if (!q) return;
    q.mesh.position.set(pos.x, 0.07, pos.z);
    q.mesh.material.color.set(color);
    q.mesh.material.map = decalTexture('rgba(255,255,255,0.85)', 'rgba(255,255,255,0.18)');
    q.mesh.material.needsUpdate = true;
    q.mesh.visible = true;
    q.life = life;
    q.maxLife = life;
    q.from = 0.6;
    q.to = size;
    q.spin = 0;
    q.mode = 'ground';
  }

  // -------------------------------------------------------------------------
  // Emitters
  // -------------------------------------------------------------------------

  burst(pos, opts = {}) {
    const {
      count = 26, color = '#f0d060', speed = 5.5, spread = 1, life = 0.6,
      gravity = 7, drag = 0.9, field = 'sparks', dir = null, flicker = 0,
    } = opts;
    const f = field === 'paint' ? this.paint : this.sparks;
    for (let i = 0; i < count; i++) {
      const v = this._v.set(
        (Math.random() * 2 - 1),
        (Math.random() * 2 - 1),
        (Math.random() * 2 - 1),
      ).normalize().multiplyScalar(speed * (0.35 + Math.random() * 0.9));
      if (dir) v.lerp(dir.clone().multiplyScalar(speed), 0.55).multiplyScalar(spread);
      f.spawn(pos, v, color, life * (0.6 + Math.random() * 0.8), gravity, drag, flicker);
    }
  }

  /** Flat expanding disc of sparks — the parry clash. */
  ring(pos, opts = {}) {
    const {
      count = 34, color = '#8fd4e8', speed = 7, life = 0.5, axis = 'y',
    } = opts;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.2;
      const s = speed * (0.75 + Math.random() * 0.5);
      const v = axis === 'y'
        ? this._v.set(Math.cos(a) * s, Math.random() * 1.2, Math.sin(a) * s)
        : this._v.set(Math.cos(a) * s, Math.sin(a) * s, (Math.random() - 0.5) * 2);
      this.sparks.spawn(pos, v, color, life * (0.7 + Math.random() * 0.6), 2.5, 0.86, 0);
    }
  }

  /** Paint flecks streaming along a line, used for swings and shots. */
  streak(from, to, color, count = 18) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    dir.normalize();
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const p = from.clone().addScaledVector(dir, len * t);
      p.x += (Math.random() - 0.5) * 0.3;
      p.y += (Math.random() - 0.5) * 0.3;
      p.z += (Math.random() - 0.5) * 0.3;
      const v = dir.clone().multiplyScalar(2 + Math.random() * 5);
      v.y += Math.random() * 1.5;
      this.paint.spawn(p, v, color, 0.32 + Math.random() * 0.3, 1.5, 0.88, 0);
    }
  }

  /** The death effect: the body sheds into drifting paint. */
  dissolve(entity, color) {
    const base = entity.root.position;
    const h = entity.height || 2;
    for (let i = 0; i < 90; i++) {
      const p = this._v.set(
        base.x + (Math.random() - 0.5) * 1.5,
        base.y + Math.random() * h,
        base.z + (Math.random() - 0.5) * 1.5,
      );
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 1.2,
        0.7 + Math.random() * 2.2,
        (Math.random() - 0.5) * 1.2,
      );
      this.paint.spawn(p, v, color, 1.4 + Math.random() * 1.4, -0.4, 0.95, 0);
    }
    for (let i = 0; i < 40; i++) {
      const p = this._v.set(
        base.x + (Math.random() - 0.5) * 1.2,
        base.y + Math.random() * h,
        base.z + (Math.random() - 0.5) * 1.2,
      );
      this.sparks.spawn(
        p,
        new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 3, (Math.random() - 0.5) * 2),
        '#f5dda2', 1.1 + Math.random(), -0.2, 0.94, 1,
      );
    }
  }

  /** Rising motes around a combatant, for buffs and charge-ups. */
  aura(pos, color, count = 20, radius = 0.8) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.5 + Math.random() * 0.7);
      const p = this._v.set(pos.x + Math.cos(a) * r, pos.y - 0.9 + Math.random() * 0.4, pos.z + Math.sin(a) * r);
      this.sparks.spawn(p, new THREE.Vector3(0, 1.6 + Math.random() * 1.8, 0), color, 0.9 + Math.random() * 0.6, -0.6, 0.96, 0);
    }
  }

  update(dt) {
    this.sparks.update(dt);
    this.paint.update(dt);

    for (const q of this.quads) {
      if (q.life <= 0) continue;
      q.life -= dt;
      if (q.life <= 0) {
        q.mesh.visible = false;
        q.mesh.material.opacity = 0;
        continue;
      }
      const u = 1 - q.life / q.maxLife;
      const s = q.from + (q.to - q.from) * easeOutCubic(u);
      q.mesh.scale.set(s, s, s);
      q.mesh.material.opacity = (1 - u) * (1 - u) * 0.95;
      if (q.mode === 'ground') {
        q.mesh.rotation.set(-Math.PI / 2, 0, 0);
      } else if (this._camera) {
        q.mesh.quaternion.copy(this._camera.quaternion);
      }
    }
  }
}
