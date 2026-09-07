/**
 * fx/damage-numbers.js — Floating damage / heal / status numbers.
 *
 * Numbers are spawned in 3D world space (at a combatant) and projected to
 * screen each frame with the camera, so they track the target as the
 * camera moves. Drawn on the shared HUD canvas (game.js passes the 2D ctx +
 * camera). Crits are larger, gold, and shake; weakness hits show a "WEAK!"
 * tag; heals are green; status applications show the status name.
 *
 * Pure presentation: no combat state. Delta-time integrated.
 */
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _proj = new THREE.Vector3();

export class DamageNumbers {
  constructor(camera) {
    this.camera = camera;
    this.items = [];
    this._w = 0;
    this._h = 0;
  }

  setViewport(w, h) {
    this._w = w;
    this._h = h;
  }

  /**
   * Spawn a number.
   * @param {THREE.Vector3|number[]} pos world position
   * @param {string} text
   * @param {object} o { kind: 'dmg'|'heal'|'crit'|'weak'|'status'|'ap',
   *   color, size, delay (ms before rising) }
   */
  spawn(pos, text, o = {}) {
    const p = pos.x !== undefined ? pos.clone() : new THREE.Vector3(...pos);
    this.items.push({
      pos: p,
      text,
      kind: o.kind || 'dmg',
      color: o.color || (o.kind === 'heal' ? '#8fe3a8' : o.kind === 'status' ? '#c9a24b' : '#e9e2cf'),
      size: o.size || (o.kind === 'crit' ? 30 : 20),
      t: 0,
      life: o.life || (o.kind === 'status' ? 1.1 : 0.9),
      delay: o.delay || 0,
      vy: o.vy ?? -1.1,   // world units/sec rise
      drift: (Math.random() - 0.5) * 0.4,
      shake: o.kind === 'crit' ? 1 : 0,
      tag: o.tag || null,
    });
  }

  /** Spawn at a combatant's head. */
  spawnAt(combatant, text, o = {}) {
    const root = combatant.root;
    const y = combatant.data.id === 'nameless' ? 2.2 : combatant.headG ? 1.25 : 1.15;
    const p = root.position.clone();
    p.y += y;
    this.spawn(p, text, o);
  }

  update(dt) {
    const items = this.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.t += dt;
      if (it.delay > 0) {
        it.delay -= dt;
        continue;
      }
      it.pos.y += it.vy * dt;
      it.pos.x += it.drift * dt;
      if (it.t >= it.life) items.splice(i, 1);
    }
  }

  /**
   * Draw all numbers into a 2D ctx (HUD canvas).
   * @returns the list of visible {x,y,text,...} for the HUD to layer.
   */
  draw(ctx) {
    const { _w: w, _h: h } = this;
    const visible = [];
    for (const it of this.items) {
      if (it.delay > 0) continue;
      _proj.copy(it.pos).project(this.camera);
      if (_proj.z > 1 || _proj.z < -1) continue; // behind camera / out of frustum
      let x = (_proj.x * 0.5 + 0.5) * w;
      let y = (-_proj.y * 0.5 + 0.5) * h;
      const lr = it.t / it.life;
      if (lr >= 1) continue;
      // pop-in scale
      const pop = Math.min(1, it.t / 0.12);
      const scale = pop * (it.shake ? 1 + Math.sin(it.t * 40) * 0.08 : 1);
      const size = it.size * scale;
      const alpha = lr < 0.7 ? 1 : 1 - (lr - 0.7) / 0.3;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${size}px Georgia, 'Times New Roman', serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // outline
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,12,16,0.85)';
      ctx.strokeText(it.text, x, y);
      ctx.fillStyle = it.color;
      ctx.fillText(it.text, x, y);
      if (it.tag) {
        ctx.font = `700 ${size * 0.5}px Georgia, serif`;
        ctx.fillStyle = '#e8c979';
        ctx.lineWidth = 2;
        ctx.strokeText(it.tag, x, y - size * 0.8);
        ctx.fillText(it.tag, x, y - size * 0.8);
      }
      ctx.restore();
      visible.push({ x, y, text: it.text, kind: it.kind });
    }
    return visible;
  }
}
