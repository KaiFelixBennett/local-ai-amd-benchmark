import * as THREE from 'three';
import { clamp, clamp01, damp, lerp } from '../core/easing.js';

// ---------------------------------------------------------------------------
// Fighter: shared combatant base for party members and enemies.
// Owns mutable combat state (HP, AP, statuses, stagger) and a tiny procedural
// animation rig. Damage maths live in battle/action-resolver.js — this class
// only applies results and animates.
// ---------------------------------------------------------------------------

let FIGHTER_ID = 1;

export const POSE = {
  IDLE: 'idle',
  ATTACK: 'attack',
  CAST: 'cast',
  HIT: 'hit',
  GUARD: 'guard',
  DODGE: 'dodge',
  BROKEN: 'broken',
  VICTORY: 'victory',
  DEAD: 'dead'
};

export class Fighter {
  constructor(def, bus) {
    this.id = FIGHTER_ID++;
    this.def = def;
    this.bus = bus;
    this.name = def.name;
    this.side = def.side; // 'party' | 'enemy'
    this.level = def.level || 1;

    this.stats = { ...def.stats };
    if (this.stats.maxHpBase == null) this.stats.maxHpBase = this.stats.hp;
    this.maxHp = this.stats.maxHpBase;
    this.hp = this.maxHp;
    this.maxAp = def.maxAp || 0;
    this.ap = 0;

    // Stagger / break meter.
    this.maxStagger = def.stagger || 60;
    this.stagger = 0;
    this.brokenTurns = 0;

    /** @type {Map<string,{turns:number,potency:number,label:string,kind:string,color:string}>} */
    this.statuses = new Map();

    this.alive = true;
    this.slots = { x: 0, z: 0 };
    this.row = def.row || 'front';
    this.facing = def.side === 'party' ? Math.PI : 0;

    this.group = null;          // scene graph root (positioned at slot)
    this.mesh = null;           // alias used by camera
    this.rig = {};              // animatable parts
    this.pose = POSE.IDLE;
    this._poseT = 0;
    this._bobSeed = (this.id * 0.7713) % 1;
    this._hitFlash = 0;
    this._dying = 0;
    this._healPulse = 0;
    this._guardPulse = 0;
    this.auraRing = null;
    this.auraColor = '#f4d489';
    this.isTargeted = false;

    // Weak point used by free-aim targeting.
    this.weakPointLocal = def.weakPoint || { x: 0, y: 1.75, z: 0.25, r: 0.34 };
    this.weakPointLabel = def.weakPointLabel || 'Coeur';
  }

  // -- positioning -----------------------------------------------------------

  place(x, z) {
    this.slots.x = x;
    this.slots.z = z;
    if (this.group) {
      this.group.position.set(x, 0, z);
      this.group.rotation.y = this.facing;
      this.updateWeakWorld();
    }
  }

  get position() { return this.group ? this.group.position : new THREE.Vector3(this.slots.x, 0, this.slots.z); }
  get center() { return new THREE.Vector3(this.slots.x, 1.2, this.slots.z); }

  updateWeakWorld() {
    const wp = this.weakPointLocal;
    const c = Math.cos(this.facing), s = Math.sin(this.facing);
    this.weakWorld = new THREE.Vector3(
      this.slots.x + wp.x * c + wp.z * s,
      wp.y,
      this.slots.z - wp.x * s + wp.z * c
    );
  }

  // -- resources -------------------------------------------------------------

  get hpFrac() { return clamp01(this.hp / this.maxHp); }
  get apFrac() { return this.maxAp ? clamp01(this.ap / this.maxAp) : 0; }
  get staggerFrac() { return clamp01(this.stagger / this.maxStagger); }
  get isBroken() { return this.brokenTurns > 0; }
  get isDead() { return !this.alive; }

  addAp(n) {
    if (!this.maxAp) return 0;
    const before = this.ap;
    this.ap = clamp(this.ap + n, 0, this.maxAp);
    return this.ap - before;
  }

  canAfford(cost) { return this.ap >= (cost || 0); }

  heal(amount) {
    const before = this.hp;
    this.hp = clamp(this.hp + amount, 0, this.maxHp);
    if (this.hp > before) this._healPulse = 1;
    return this.hp - before;
  }

  // Apply already-computed damage. Returns the amount actually dealt.
  damage(amount) {
    const dealt = Math.min(this.hp, Math.max(0, Math.round(amount)));
    this.hp = Math.max(0, this.hp - dealt);
    this._hitFlash = 1;
    if (this.hp <= 0) this.kill();
    return dealt;
  }

  addStagger(amount) {
    if (!this.alive || this.isBroken) return { broken: false, overflow: 0 };
    this.stagger = Math.min(this.maxStagger, this.stagger + amount);
    if (this.stagger >= this.maxStagger) {
      this.brokenTurns = 2;
      this.stagger = 0;
      this.setPose(POSE.BROKEN, 0.9);
      return { broken: true, overflow: 0 };
    }
    return { broken: false, overflow: 0 };
  }

  kill() {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.stagger = 0;
    this.brokenTurns = 0;
    this.statuses.clear();
    this._dying = 0.0001;
    this.setPose(POSE.DEAD, 0);
    if (this.auraRing) this.auraRing.visible = false;
  }

  // -- statuses ----------------------------------------------------------------

  addStatus(id, data) {
    if (!this.alive) return;
    const existing = this.statuses.get(id);
    if (existing) {
      existing.turns = Math.max(existing.turns, data.turns);
      existing.potency = Math.max(existing.potency, data.potency || 0);
    } else {
      this.statuses.set(id, { ...data });
    }
  }

  hasStatus(id) { return this.statuses.has(id); }

  statusPotency(id) {
    const s = this.statuses.get(id);
    return s ? s.potency : 0;
  }

  // Multiplicative attack modifier from statuses.
  attackMult() {
    let m = 1;
    if (this.hasStatus('atkUp')) m += this.statusPotency('atkUp');
    if (this.hasStatus('atkDown')) m -= this.statusPotency('atkDown');
    if (this.hasStatus('broken')) m -= 0.2;
    return clamp(m, 0.3, 3);
  }

  defenceMult() {
    let m = 1;
    if (this.hasStatus('defUp')) m += this.statusPotency('defUp');
    if (this.hasStatus('defDown')) m -= this.statusPotency('defDown');
    if (this.isBroken) m -= 0.35;
    return clamp(m, 0.35, 3);
  }

  get stunned() { return this.hasStatus('stun'); }

  // Per-turn status ticks. Returns array of {type, amount, id}.
  // `timedOut` collects ids that expired this tick so the caller can animate them.
  tickStatuses(timedOut = []) {
    const out = [];
    if (!this.alive) return out;
    // Burning (fire) and poison tick damage; they can kill.
    for (const id of ['burn', 'poison']) {
      const s = this.statuses.get(id);
      if (!s) continue;
      const dmg = Math.max(2, Math.round(s.potency));
      const dealt = this.damage(dmg);
      if (dealt > 0) out.push({ type: id === 'burn' ? 'burn' : 'poison', amount: dealt, id });
      if (!this.alive) return out;
    }
    for (const [id, s] of this.statuses) {
      s.turns -= 1;
      if (s.turns <= 0) {
        this.statuses.delete(id);
        timedOut.push(id);
        if (id === 'burn' || id === 'iceBrand') { /* cosmetic only */ }
      }
    }
    if (this.brokenTurns > 0) {
      this.brokenTurns -= 1;
      if (this.brokenTurns === 0) this.setPose(POSE.IDLE, 0.6);
    }
    return out;
  }

  consumeStun() {
    const s = this.statuses.get('stun');
    if (!s) return false;
    this.statuses.delete('stun');
    return true;
  }

  // -- pose / animation --------------------------------------------------------

  setPose(pose, duration = 0) {
    if (pose === POSE.DEAD && this._dying > 0.5) return;
    if (this.pose !== pose) this._poseT = 0;
    this.pose = pose;
    this._poseDur = duration;
  }

  flashHit() { this._hitFlash = 1; }
  flashGuard() { this._guardPulse = 1; }

  _materials() {
    const list = [];
    if (!this._matCache) {
      this._matCache = [];
      if (this.group) {
        this.group.traverse((o) => {
          if (o.isMesh && o.material && list.indexOf(o.material) === -1) list.push(o.material);
        });
      }
    }
    return this._matCache;
  }

  invalidateMaterialCache() { this._matCache = null; }

  // Base rig pose. Subclasses may extend for weapon flourishes.
  updateAnim(dt, time) {
    if (!this.group) return;
    const r = this.rig;
    const seed = this._bobSeed * 6.283;
    this._poseT += dt;
    const pt = this._poseT;

    if (!this.alive) {
      this._dying = Math.min(1.6, this._dying + dt);
    }

    // Decay effect pulses.
    this._hitFlash = Math.max(0, this._hitFlash - dt * 3.4);
    this._healPulse = Math.max(0, this._healPulse - dt * 1.8);
    this._guardPulse = Math.max(0, this._guardPulse - dt * 2.6);

    // Idle breathing + sway baseline.
    const breathe = Math.sin(time * 1.7 + seed) * 0.035;
    const sway = Math.sin(time * 0.8 + seed) * 0.05;
    let bodyY = breathe;
    let bodyRotX = 0, bodyRotY = sway * 0.4, bodyRotZ = 0;
    let armR = -0.12 + Math.sin(time * 1.3 + seed) * 0.06;
    let armL = 0.12 - Math.sin(time * 1.3 + seed) * 0.06;
    let legL = 0, legR = 0;
    let headRotX = Math.sin(time * 0.6 + seed) * 0.05;
    let lunge = 0;

    switch (this.pose) {
      case POSE.ATTACK: {
        const k = clamp01(pt / Math.max(0.001, this._attackDur || 0.7));
        // wind up, strike, recover
        const wind = k < 0.35 ? k / 0.35 : 1;
        const strike = k >= 0.35 && k < 0.6 ? (k - 0.35) / 0.25 : 0;
        const rec = k >= 0.6 ? (k - 0.6) / 0.4 : 0;
        armR = lerp(-0.12, -2.2, wind) + lerp(0, 1.9, strike) - lerp(0, 0.6, rec);
        bodyRotY = lerp(0, -0.55, wind) + lerp(0, 1.15, strike) - lerp(0, 0.55, rec);
        lunge = lerp(0, 0.0, wind) + lerp(0, 1, strike) - lerp(0, 1, rec);
        legL = -0.35 * strike;
        bodyRotX = 0.16 * strike;
        break;
      }
      case POSE.CAST: {
        const k = clamp01(pt / Math.max(0.001, this._attackDur || 0.9));
        const rise = clamp01(k / 0.5);
        const fall = clamp01((k - 0.5) / 0.5);
        armR = lerp(-0.12, -2.7, rise) + lerp(0, 1.4, fall);
        armL = lerp(0.12, -2.4, rise * 0.85) + lerp(0, 1.2, fall);
        bodyRotX = lerp(0, -0.16, rise) + lerp(0, 0.22, fall);
        bodyY += Math.sin(k * Math.PI) * 0.16;
        break;
      }
      case POSE.HIT: {
        const k = clamp01(pt / 0.34);
        const recoil = Math.sin(k * Math.PI);
        bodyRotX = -0.35 * recoil;
        bodyRotZ = 0.14 * recoil;
        bodyY = -0.06 * recoil;
        armR += 0.4 * recoil;
        armL += 0.35 * recoil;
        break;
      }
      case POSE.GUARD: {
        const k = clamp01(pt / 0.5);
        const up = Math.sin(clamp01(k) * Math.PI);
        armR = lerp(-0.12, -1.35, up);
        armL = lerp(0.12, -1.1, up);
        bodyRotX = 0.1 * up;
        bodyY = -0.05 * up;
        break;
      }
      case POSE.DODGE: {
        const k = clamp01(pt / 0.45);
        const s2 = Math.sin(k * Math.PI);
        bodyRotZ = 0.55 * s2 * (this._bobSeed > 0.5 ? 1 : -1);
        bodyY = -0.15 * s2;
        break;
      }
      case POSE.BROKEN: {
        bodyRotX = 0.42;
        bodyY = -0.22;
        armR = 0.5; armL = 0.6;
        headRotX = 0.35;
        break;
      }
      case POSE.VICTORY: {
        const k = clamp01(pt / 1.0);
        armR = lerp(-0.12, -2.6, k);
        bodyY += Math.abs(Math.sin(pt * 3.2)) * 0.06 * k;
        bodyRotY = sway;
        break;
      }
      case POSE.DEAD: {
        const k = clamp01(this._dying / 1.1);
        bodyRotX = 1.25 * k;
        bodyY = -0.55 * k;
        armR = 0.9 * k; armL = 1.0 * k;
        break;
      }
      default:
        break;
    }

    if (r.root) {
      // rig.root is local to this.group: idle bob + whole-body lean only.
      r.root.position.y = bodyY;
      r.root.rotation.set(bodyRotX, bodyRotY, bodyRotZ);
      if (r.body) r.body.position.z = lunge * 0.42;
    }
    if (r.armR) r.armR.rotation.x = armR;
    if (r.armL) r.armL.rotation.x = armL;
    if (r.legL) r.legL.rotation.x = legL;
    if (r.legR) r.legR.rotation.x = legR;
    if (r.head) r.head.rotation.x = headRotX;

    // Lunge toward the enemy line along the group's facing local +Z.
    if (this.group && this.alive) {
      const fwd = lunge * 0.55;
      this.group.position.x = damp(this.group.position.x, this.slots.x + Math.sin(this.facing) * fwd, 14, dt);
      this.group.position.z = damp(this.group.position.z, this.slots.z + Math.cos(this.facing) * fwd, 14, dt);
    }

    // Slot-marker aura ring visibility + colour driven by state.
    if (this.auraRing) {
      let col = null;
      if (this.isBroken) col = '#f4d489';
      else if (this.hasStatus('mark')) col = '#a12d33';
      else if (this.hasStatus('burn')) col = '#e2793a';
      else if (this.hasStatus('poison')) col = '#6b7a4a';
      else if (this.isTargeted) col = '#8fbcb6';
      if (col) {
        this.auraRing.visible = true;
        this.auraRing.material.color.set(col);
        this.auraRing.material.opacity = 0.35 + 0.25 * Math.sin(time * 5);
      } else {
        this.auraRing.visible = false;
      }
    }

    // Hit flash / heal glow via emissive on cached materials.
    const mats = this._materials();
    for (const m of mats) {
      if (!m.userData._baseEmissive) {
        m.userData._baseEmissive = m.emissive ? m.emissive.clone() : new THREE.Color(0x000000);
        m.userData._baseEmissiveI = m.emissiveIntensity ?? 1;
      }
      if (!m.emissive) continue;
      const flash = this._hitFlash;
      const heal = this._healPulse;
      if (flash > 0.001) {
        m.emissive.setRGB(flash * 0.9, flash * 0.12, flash * 0.1);
        m.emissiveIntensity = 1 + flash * 2.2;
      } else if (heal > 0.001) {
        m.emissive.set(0x7fe0a8);
        m.emissiveIntensity = heal * 1.8;
      } else {
        m.emissive.copy(m.userData._baseEmissive);
        m.emissiveIntensity = m.userData._baseEmissiveI;
      }
    }

    // Sink + fade the corpse (paint dissolve handled by FX particles).
    if (!this.alive && this.group) {
      const k = clamp01(this._dying / 1.5);
      this.group.position.y = -0.9 * k * k;
      const s = 1 - 0.35 * k;
      this.group.scale.setScalar(Math.max(0.001, s));
      for (const m of mats) {
        m.transparent = true;
        m.opacity = Math.max(0, 1 - k);
      }
    }
    this.updateWeakWorld();
  }
}
