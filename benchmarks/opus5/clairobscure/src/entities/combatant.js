/**
 * Shared behaviour for anything that takes a turn: combat state, the animator
 * bridge, hit flashes, root motion tweens, death dissolve and the world anchors
 * the HUD projects from.
 *
 * Character and Enemy both extend this; the battle systems only ever talk to
 * this interface plus a handful of subclass extras.
 */

import * as THREE from 'three';
import { Animator, proceduralLayer } from './rig.js';
import { shadowSprite } from '../engine/textures.js';
import { clamp01, damp, dampAngle, easeOutCubic, lerp } from '../core/easing.js';

const _v = new THREE.Vector3();

export class Combatant {
  constructor(opts) {
    this.id = opts.id;
    this.name = opts.name;
    this.side = opts.side;
    this.level = opts.level || 1;

    this.maxHp = opts.maxHp;
    this.hp = opts.maxHp;
    this.maxAp = opts.maxAp || 0;
    this.ap = opts.startAp || 0;
    this.stats = opts.stats;
    this.weak = opts.weak || [];
    this.resist = opts.resist || [];
    this.immune = opts.immune || [];
    this.statuses = [];
    this.alive = true;
    this.row = opts.row || 'front';

    this.breakMax = opts.breakMax || 0;
    this.breakVal = 0;
    this.staggered = false;
    this.staggerTurns = 0;

    this.tint = opts.tint || '#d9b262';

    // Presentation state
    this.flash = 0;
    this.flashColor = new THREE.Color('#ffffff');
    this.dissolve = 0;
    this.dissolving = false;
    this.spotlight = 0;

    this.rig = null;
    this.animator = null;
    this.root = new THREE.Group();
    this.home = new THREE.Vector3();
    this.facing = 0;
    this.targetFacing = 0;

    this.motion = null;
    this._materials = [];
    this._procedural = proceduralLayer;
  }

  /** Called by subclasses once their rig exists. */
  _attachRig(rig, clips, rest, procedural) {
    this.rig = rig;
    this.root.add(rig.root);
    this.animator = new Animator(rig, clips, rest);
    if (procedural) this._procedural = procedural;
    this._collectMaterials();
    this._addShadowBlob();
  }

  _collectMaterials() {
    const seen = new Set();
    this.root.traverse((o) => {
      if (!o.isMesh || !o.material || seen.has(o.material)) return;
      seen.add(o.material);
      const m = o.material;
      const rec = {
        mat: m,
        baseOpacity: m.opacity === undefined ? 1 : m.opacity,
        baseTransparent: !!m.transparent,
      };
      if (m.emissive) {
        rec.baseEmissive = m.emissive.clone();
        rec.baseIntensity = m.emissiveIntensity === undefined ? 1 : m.emissiveIntensity;
      }
      this._materials.push(rec);
    });
  }

  _addShadowBlob() {
    const geo = new THREE.PlaneGeometry(1.9, 1.9);
    const mat = new THREE.MeshBasicMaterial({
      map: shadowSprite(), transparent: true, depthWrite: false, opacity: 0.75,
    });
    this.shadowBlob = new THREE.Mesh(geo, mat);
    this.shadowBlob.rotation.x = -Math.PI / 2;
    this.shadowBlob.position.y = 0.035;
    this.shadowBlob.renderOrder = -1;
    this.root.add(this.shadowBlob);
  }

  placeAt(x, z, facing) {
    this.home.set(x, 0, z);
    this.root.position.copy(this.home);
    this.facing = facing;
    this.targetFacing = facing;
    this.root.rotation.y = facing;
  }

  // -------------------------------------------------------------------------
  // Animation
  // -------------------------------------------------------------------------

  play(name, opts) {
    if (!this.animator) return false;
    if (!this.animator.has(name)) return false;
    return this.animator.play(name, opts);
  }

  get currentAnim() {
    return this.animator ? this.animator.currentName : '';
  }

  /** Play the flinch clip unless something more important is running. */
  flinch() {
    if (!this.alive) return;
    const busy = ['death', 'counter', 'ultimate'];
    if (busy.includes(this.currentAnim)) return;
    this.play('hurt', { restart: true, fade: 0.06 });
  }

  hitFlash(colorHex = '#ffffff', strength = 1) {
    this.flash = Math.max(this.flash, strength);
    this.flashColor.set(colorHex);
  }

  /** Begin the painterly dissolve; the entity stays in the scene while fading. */
  beginDeath() {
    this.alive = false;
    this.dissolving = true;
    this.dissolve = 0;
    this.play('death', { restart: true, fade: 0.1 });
  }

  // -------------------------------------------------------------------------
  // Root motion
  // -------------------------------------------------------------------------

  /**
   * Tween the root toward a world position and back.
   * @param {THREE.Vector3|null} to null returns to the home stance
   */
  moveTo(to, dur = 0.5) {
    this.motion = {
      from: this.root.position.clone(),
      to: to ? to.clone() : this.home.clone(),
      t: 0,
      dur: Math.max(0.05, dur),
    };
  }

  faceToward(x, z) {
    this.targetFacing = Math.atan2(x - this.root.position.x, z - this.root.position.z);
  }

  faceHome(facing) {
    this.targetFacing = facing;
  }

  // -------------------------------------------------------------------------
  // Anchors
  // -------------------------------------------------------------------------

  /** Chest-height world position — where damage numbers and FX originate. */
  anchor(out = _v) {
    const j = this.rig && (this.rig.joints.chest || this.rig.joints.torso);
    if (j) return j.getWorldPosition(out);
    return out.copy(this.root.position).add(new THREE.Vector3(0, 1.2, 0));
  }

  /** Above the head — used for status icons and the enemy nameplate. */
  headAnchor(out = _v) {
    const j = this.rig && this.rig.joints.head;
    if (j) {
      j.getWorldPosition(out);
      out.y += 0.45;
      return out;
    }
    return out.copy(this.root.position).add(new THREE.Vector3(0, 2.2, 0));
  }

  /** Weapon tip (or forward hand) for trails and impact spawns. */
  weaponTip(out = _v) {
    const rig = this.rig;
    if (rig && rig.weapon && rig.weapon.tipLocal) {
      out.copy(rig.weapon.tipLocal);
      return rig.weapon.group.localToWorld(out);
    }
    const j = rig && (rig.joints.foreR || rig.joints.wristR);
    if (j) return j.getWorldPosition(out);
    return this.anchor(out);
  }

  get hpFrac() {
    return clamp01(this.hp / this.maxHp);
  }

  get apFrac() {
    return this.maxAp > 0 ? clamp01(this.ap / this.maxAp) : 0;
  }

  get breakFrac() {
    return this.breakMax > 0 ? clamp01(this.breakVal / this.breakMax) : 0;
  }

  // -------------------------------------------------------------------------
  // Per-frame
  // -------------------------------------------------------------------------

  update(dt, elapsed) {
    if (this.animator) this.animator.update(dt);
    if (this.rig) this._procedural(this.rig, elapsed + this.id.length, this.alive ? 1 : 0.15);

    if (this.motion) {
      const m = this.motion;
      m.t += dt;
      const u = easeOutCubic(clamp01(m.t / m.dur));
      this.root.position.lerpVectors(m.from, m.to, u);
      if (m.t >= m.dur) this.motion = null;
    }

    this.facing = dampAngle(this.facing, this.targetFacing, 9, dt);
    this.root.rotation.y = this.facing;

    this.flash = Math.max(0, this.flash - dt * 4.2);
    this.spotlight = damp(this.spotlight, 0, 3, dt);
    if (this.dissolving) this.dissolve = Math.min(1, this.dissolve + dt * 0.55);

    this._applyMaterialState();
    this._updateShadow();
  }

  _applyMaterialState() {
    const flash = this.flash;
    const fade = this.dissolving ? 1 - clamp01(this.dissolve * 1.05) : 1;
    for (const rec of this._materials) {
      const m = rec.mat;
      if (rec.baseEmissive) {
        if (flash > 0.001) {
          m.emissive.copy(rec.baseEmissive).lerp(this.flashColor, Math.min(1, flash));
          m.emissiveIntensity = rec.baseIntensity + flash * 3.2;
        } else if (m.emissiveIntensity !== rec.baseIntensity) {
          m.emissive.copy(rec.baseEmissive);
          m.emissiveIntensity = rec.baseIntensity;
        }
      }
      if (this.dissolving) {
        m.transparent = true;
        m.opacity = rec.baseOpacity * fade;
      } else if (m.opacity !== rec.baseOpacity) {
        m.opacity = rec.baseOpacity;
        m.transparent = rec.baseTransparent;
      }
    }
  }

  _updateShadow() {
    if (!this.shadowBlob) return;
    const lift = this.rig && this.rig.offsetNode ? this.rig.offsetNode.position.y : 0;
    const s = lerp(1, 0.7, clamp01(lift / 1.2));
    this.shadowBlob.scale.setScalar(s * (this.shadowScale || 1));
    this.shadowBlob.material.opacity = 0.75 * s * (this.dissolving ? 1 - this.dissolve : 1);
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
}
