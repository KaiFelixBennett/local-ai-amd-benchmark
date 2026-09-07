import * as THREE from 'three';
import { softDotTexture, paintFleckTexture } from '../engine/textures.js';
import { EV } from '../core/events.js';
import { clamp01 } from '../core/easing.js';

// ---------------------------------------------------------------------------
// World-space particle FX: paint-splatter impacts, gilded tracers, heal sparks,
// buff motes and expanding telegraph rings. Everything is pooled — fixed
// buffer allocations, zero per-event garbage, so combat stays GC-flat at 60fps.
// Subscribes directly to bus EV.FX payloads emitted by the battle layer.
// ---------------------------------------------------------------------------

const MAX_PARTICLES = 420;
const MAX_RINGS = 10;
const MAX_TRACERS = 8;

export class FX {
  constructor(scene, bus) {
    this.scene = scene;

    // --- particle pool (one Points object, additive) -------------------------
    this._pos = new Float32Array(MAX_PARTICLES * 3);
    this._col = new Float32Array(MAX_PARTICLES * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this._pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this._col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.34, map: softDotTexture(64), vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // Paint flecks (non-additive, thicker splats) — second smaller pool.
    this._fpos = new Float32Array(120 * 3);
    this._fcol = new Float32Array(120 * 3);
    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.BufferAttribute(this._fpos, 3));
    fgeo.setAttribute('color', new THREE.BufferAttribute(this._fcol, 3));
    this.flecks = new THREE.Points(fgeo, new THREE.PointsMaterial({
      size: 0.5, map: paintFleckTexture(48), vertexColors: true,
      transparent: true, depthWrite: false, sizeAttenuation: true
    }));
    this.flecks.frustumCulled = false;
    scene.add(this.flecks);

    this._parts = []; // {live, p:Vector3, v:Vector3, life, max, size, color:Color, fleck:bool, grav}

    // --- ring pool -------------------------------------------------------------
    this._rings = [];
    const ringGeo = new THREE.RingGeometry(0.86, 1, 40);
    for (let i = 0; i < MAX_RINGS; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: '#f4d489', transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      }));
      m.visible = false;
      scene.add(m);
      this._rings.push({ mesh: m, live: false, t: 0, dur: 0.6, from: 0.4, to: 3, flat: true });
    }

    // --- tracer pool -------------------------------------------------------------
    this._tracers = [];
    const cyl = new THREE.CylinderGeometry(0.045, 0.045, 1, 6, 1, true);
    cyl.translate(0, 0.5, 0);
    for (let i = 0; i < MAX_TRACERS; i++) {
      const m = new THREE.Mesh(cyl, new THREE.MeshBasicMaterial({
        color: '#f4d489', transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      m.visible = false;
      scene.add(m);
      this._tracers.push({ mesh: m, live: false, t: 0, dur: 0.22 });
    }

    this._bind(bus);
  }

  _bind(bus) {
    bus.on(EV.FX, (p) => this._onFx(p));
    bus.on(EV.BREAK, (p) => {
      if (p && p.target) {
        this.ring(p.target.center, '#f4d489', { to: 4.6, dur: 0.8 });
        this.burst(p.target.center, '#f4d489', 26, 4.2, 0.5);
      }
    });
    bus.on(EV.PERFECT, (p) => {
      if (p && p.defender) {
        this.ring(p.defender.center.clone().setY(0.05), '#cfe8ff', { to: 3.4, dur: 0.5 });
        this.burst(p.defender.center, '#eaf6ff', 18, 5.5, 0.3);
      }
    });
    bus.on(EV.DEATH, (p) => {
      const u = p && p.unit;
      if (!u) return;
      const c = u.side === 'enemy' ? '#8fbcb6' : '#a12d33';
      for (let i = 0; i < 3; i++) this.splat(u.center, c, 6 + i * 3);
      this.ring(u.center.clone().setY(0.05), c, { to: 4, dur: 0.9 });
    });
    bus.on(EV.STATUS, (p) => {
      if (p && (p.kind === 'buff' || p.kind === 'guard') && p.target) {
        this.buff(p.target.center);
      }
    });
  }

  _onFx(p) {
    if (!p || !p.kind) return;
    switch (p.kind) {
      case 'impact':
        this.burst(p.at, p.color || '#e2793a', p.big ? 22 : 11, p.big ? 4.6 : 3, 0.34);
        if (p.big) this.ring(p.at, p.color || '#f4d489', { to: 2.6, dur: 0.45, flat: false });
        this.splat(p.at, p.color || '#e2793a', p.big ? 5 : 2);
        break;
      case 'heal':
        this._motes(p.at, '#7fe0a8', 14, 1.2);
        this.ring(p.at.clone().setY(0.05), '#7fe0a8', { to: 2, dur: 0.7 });
        break;
      case 'buff':
        this.buff(p.at);
        break;
      case 'shot':
        if (p.to) this.tracer(p.from, p.to, p.color || '#f4d489');
        break;
      case 'feint':
        if (p.attacker) this.ring(p.attacker.center, '#a12d33', { to: 3.2, dur: 0.5 });
        break;
      case 'whiff':
        if (p.defender) this.burst(p.defender.center, '#5c6a6d', 6, 2, 0.25);
        break;
      default: break;
    }
  }

  // -- spawn helpers -----------------------------------------------------------

  _pool(color) { return new THREE.Color(color); }

  burst(pos, color, count = 12, speed = 3.4, life = 0.4) {
    if (!pos) return;
    const c = this._pool(color);
    for (let i = 0; i < count; i++) {
      if (this._parts.length >= MAX_PARTICLES) break;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize();
      this._parts.push({
        live: true, p: pos.clone().addScaledVector(dir, 0.12), v: dir.multiplyScalar(speed * (0.5 + Math.random())),
        life: life * (0.7 + Math.random() * 0.6), max: life * 1.3, color: c, size: 0.2 + Math.random() * 0.16,
        grav: -4.5, fleck: false
      });
    }
  }

  splat(pos, color, count = 3) {
    if (!pos) return;
    const c = this._pool(color);
    for (let i = 0; i < count; i++) {
      if (this._parts.length >= MAX_PARTICLES + 120) break;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6 + 0.2, Math.random() - 0.5).normalize();
      this._parts.push({
        live: true, p: pos.clone(), v: dir.multiplyScalar(1.6 + Math.random() * 1.4),
        life: 0.9 + Math.random() * 0.5, max: 1.4, color: c, size: 0.36 + Math.random() * 0.2,
        grav: -6, fleck: true
      });
    }
  }

  _motes(pos, color, count, rise = 1.6) {
    const c = this._pool(color);
    for (let i = 0; i < count; i++) {
      const d = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.5;
      this._parts.push({
        live: true, p: pos.clone().setY(0.1 + Math.random() * 0.4).add(new THREE.Vector3(Math.cos(d) * r, 0, Math.sin(d) * r)),
        v: new THREE.Vector3(0, rise * (0.7 + Math.random() * 0.6), 0),
        life: 1 + Math.random() * 0.5, max: 1.5, color: c, size: 0.14 + Math.random() * 0.1, grav: 0.6, fleck: false
      });
    }
  }

  buff(pos) {
    if (!pos) return;
    this._motes(pos, '#f4d489', 10, 1.4);
    this.ring(pos.clone().setY(0.05), '#f4d489', { to: 1.8, dur: 0.6 });
  }

  ring(pos, color, opts = {}) {
    const r = this._rings.find((x) => !x.live);
    if (!r || !pos) return;
    r.live = true; r.t = 0;
    r.dur = opts.dur || 0.6;
    r.from = opts.from || 0.3;
    r.to = opts.to || 3;
    r.flat = opts.flat !== false;
    r.mesh.visible = true;
    r.mesh.material.color.set(color);
    r.mesh.position.copy(pos);
    if (r.flat) { r.mesh.rotation.set(-Math.PI / 2, 0, 0); r.mesh.position.y = pos.y < 0.2 ? 0.03 : pos.y; }
    else r.mesh.rotation.set(0, 0, 0);
  }

  // Gold tracer beam between two world points (aimed shot).
  tracer(from, to, color) {
    const t = this._tracers.find((x) => !x.live);
    if (!t || !from || !to) return;
    const a = from.clone ? from.clone().setY(1.4) : from;
    const b = to.clone ? to.clone() : new THREE.Vector3(to.x, 1.2, to.z);
    const dir = b.clone().sub(a);
    const len = dir.length() || 1;
    t.mesh.position.copy(a);
    t.mesh.scale.set(1, len, 1);
    t.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    t.mesh.material.color.set(color);
    t.mesh.visible = true;
    t.live = true; t.t = 0;
  }

  // -- per-frame update ----------------------------------------------------------

  update(dt) {
    // particles
    let n = 0, nf = 0;
    for (let i = this._parts.length - 1; i >= 0; i--) {
      const p = this._parts[i];
      p.life -= dt;
      if (p.life <= 0) { this._parts.splice(i, 1); continue; }
      p.v.y += p.grav * dt;
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.04 && p.grav < 0) { p.p.y = 0.04; p.v.y *= -0.28; p.v.x *= 0.6; p.v.z *= 0.6; }
      const a = clamp01(p.life / p.max);
      if (p.fleck) {
        if (nf < 120) {
          this._fpos[nf * 3] = p.p.x; this._fpos[nf * 3 + 1] = p.p.y; this._fpos[nf * 3 + 2] = p.p.z;
          this._fcol[nf * 3] = p.color.r * a; this._fcol[nf * 3 + 1] = p.color.g * a; this._fcol[nf * 3 + 2] = p.color.b * a;
          nf++;
        }
      } else if (n < MAX_PARTICLES) {
        this._pos[n * 3] = p.p.x; this._pos[n * 3 + 1] = p.p.y; this._pos[n * 3 + 2] = p.p.z;
        this._col[n * 3] = p.color.r * a; this._col[n * 3 + 1] = p.color.g * a; this._col[n * 3 + 2] = p.color.b * a;
        n++;
      }
    }
    for (let i = n; i < MAX_PARTICLES; i++) { this._pos[i * 3 + 1] = -999; }
    for (let i = nf; i < 120; i++) { this._fpos[i * 3 + 1] = -999; }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.flecks.geometry.attributes.position.needsUpdate = true;
    this.flecks.geometry.attributes.color.needsUpdate = true;

    // rings
    for (const r of this._rings) {
      if (!r.live) continue;
      r.t += dt;
      const k = clamp01(r.t / r.dur);
      const s = r.from + (r.to - r.from) * (1 - Math.pow(1 - k, 2));
      r.mesh.scale.setScalar(s);
      r.mesh.material.opacity = 0.85 * (1 - k);
      if (k >= 1) { r.live = false; r.mesh.visible = false; }
    }
    // tracers
    for (const t of this._tracers) {
      if (!t.live) continue;
      t.t += dt;
      const k = clamp01(t.t / t.dur);
      t.mesh.material.opacity = (1 - k) * 0.85;
      if (k >= 1) { t.live = false; t.mesh.visible = false; }
    }
  }
}
