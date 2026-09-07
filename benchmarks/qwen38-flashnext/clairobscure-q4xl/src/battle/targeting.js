import * as THREE from 'three';
import { clamp, clamp01 } from '../core/easing.js';
import { EV } from '../core/events.js';

// ---------------------------------------------------------------------------
// Free-aim ranged attack. The player moves a reticle (mouse or arrow keys)
// over the enemy line, holds to charge power, releases to fire. Hit detection
// projects each enemy's weak point + body ellipsoid into screen space:
//   inside weak radius   -> 'weak' (x2 damage, +charge, +stagger)
//   inside body radius   -> 'body' (normal)
//   elsewhere            -> 'miss'  (quarter damage)
// Charge time (0..1) scales damage 0.6x..1.4x so there is a trade-off between
// power and precision, matching the resolver's `aimPower` term.
// ---------------------------------------------------------------------------

const _v = new THREE.Vector3();

export class AimController {
  constructor(bus) {
    this.bus = bus;
    this.active = false;
    this.enemies = [];
    this.camera = null;
    this.x = 0; this.y = 0;
    this.w = 1; this.h = 1;
    this.charge = 0;
    this.charging = false;
    this.chargeRate = 1.15;   // full charge in ~0.87s
    this.hover = null;        // {enemy, weak:boolean}
    this.locked = false;
    this.keyboard = { x: 0, y: 0, up: false, down: false, left: false, right: false };
    this.weakScale = 1;       // HUD may widen for accessibility
  }

  start(enemies, camera, w, h) {
    this.active = true;
    this.enemies = enemies.filter((e) => e.alive);
    this.camera = camera;
    this.w = w; this.h = h;
    this.charge = 0;
    this.charging = false;
    this.locked = false;
    this.x = w * 0.5;
    this.y = h * 0.45;
    this.bus.emit(EV.AIM_START, {});
  }

  moveTo(x, y) {
    if (!this.active) return;
    this.x = clamp(x, 0, this.w);
    this.y = clamp(y, 0, this.h);
  }

  setKey(dir, pressed) {
    if (dir in this.keyboard) this.keyboard[dir] = pressed;
  }

  beginCharge() { if (this.active) this.charging = true; }

  update(dt) {
    if (!this.active) return;
    const spd = 620 * dt;
    if (this.keyboard.left) this.x -= spd;
    if (this.keyboard.right) this.x += spd;
    if (this.keyboard.up) this.y -= spd;
    if (this.keyboard.down) this.y += spd;
    this.x = clamp(this.x, 0, this.w);
    this.y = clamp(this.y, 0, this.h);
    if (this.charging) this.charge = clamp01(this.charge + dt * this.chargeRate);

    // Hover highlight for the reticle ring + weak-point ping.
    let best = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      const body = this._project(e.center, 1.35);
      if (!body) continue;
      const d = Math.hypot(body.sx - this.x, body.sy - this.y);
      if (d < body.r && d < bestD) {
        const weak = this._project(e.weakWorld || e.center, e.weakPointLocal ? e.weakPointLocal.r : 0.32);
        const weakHit = weak && Math.hypot(weak.sx - this.x, weak.sy - this.y)
          < Math.max(16, weak.r * this.weakScale);
        best = { enemy: e, weak: !!weakHit, body };
        bestD = d;
      }
    }
    if (best && !this.hover) { this.bus.emit(EV.LOG, { text: best.weak ? 'WEAK POINT LOCK — ' + best.enemy.weakPointLabel : best.enemy.name }); }
    this.hover = best;
  }

  // Project a world point to screen px. `pad` converts to a screen radius
  // using the point's distance from camera (world-units -> px factor).
  _project(worldPos, worldRadius) {
    if (!worldPos || !this.camera) return null;
    _v.copy(worldPos).project(this.camera);
    if (_v.z > 1) return null; // behind camera
    const sx = (_v.x * 0.5 + 0.5) * this.w;
    const sy = (-_v.y * 0.5 + 0.5) * this.h;
    const dist = this.camera.position.distanceTo(worldPos);
    const pxPerUnit = (this.h * 0.5) / (Math.tan((this.camera.fov * Math.PI / 180) / 2) * Math.max(dist, 0.5));
    return { sx, sy, r: Math.max(18, worldRadius * pxPerUnit), dist };
  }

  // Resolve the shot. Returns {hit, enemy, power, aimX, aimY}.
  resolve() {
    if (!this.active) return null;
    const power = this.charge;
    const hover = this.hover;
    let hit = 'miss';
    let enemy = null;
    if (hover) {
      enemy = hover.enemy;
      hit = hover.weak ? 'weak' : 'body';
    }
    const out = {
      hit, enemy, power,
      aimX: this.x, aimY: this.y,
      weakLabel: enemy ? enemy.weakPointLabel : null
    };
    this.active = false;
    this.charging = false;
    this.hover = null;
    this.bus.emit(EV.AIM_RESULT, out);
    return out;
  }

  cancel() {
    if (!this.active) return;
    this.active = false;
    this.charging = false;
    this.hover = null;
  }

  // For the HUD: projected weak-point markers so the reticle can show pings.
  weakMarkers() {
    const out = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const w = this._project(e.weakWorld || e.center, 0);
      const b = this._project(e.center, 1.3);
      if (w && b) out.push({ enemy: e, weak: w, body: b, label: e.weakPointLabel });
    }
    return out;
  }
}
