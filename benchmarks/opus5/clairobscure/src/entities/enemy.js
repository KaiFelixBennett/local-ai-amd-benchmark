/**
 * A Nevron: procedural creature rig, break meter, weak points, telegraphed
 * attack patterns and (for the boss) a second phase with a different move set.
 *
 * The attack animation is *driven* rather than played: `driveAttack()` pins the
 * animator's playhead to the reaction system's wind-up/strike phase so the
 * creature's swing always lands on the exact frame the hit resolves, no matter
 * how long that particular telegraph is.
 */

import * as THREE from 'three';
import { Combatant } from './combatant.js';
import { buildCreature, proceduralCreature } from './creature.js';
import { CREATURE_CLIPS, CREATURE_REST } from './clips.js';
import { scaleStatsForLevel, maxHpForLevel } from '../battle/action-resolver.js';

let uid = 0;

export class Enemy extends Combatant {
  /**
   * @param {object} data entry from data/enemies.js
   * @param {{level:number, scale:number, rng:object, index:number}} opts
   */
  constructor(data, opts = {}) {
    const level = opts.level || 1;
    const rng = opts.rng;
    const stats = scaleStatsForLevel({ ...data.base, crit: 0.06, critDmg: 1.6 }, level);
    // Deterministic per-encounter jitter so a seed reproduces the fight exactly.
    const jitter = rng ? 1 + rng.jitter(0.06) : 1;
    stats.atk = Math.round(stats.atk * jitter);
    stats.spd = Math.round(stats.spd * (rng ? 1 + rng.jitter(0.08) : 1));

    super({
      id: `${data.id}-${uid++}`,
      name: data.name,
      side: 'enemy',
      level,
      maxHp: Math.round(maxHpForLevel(data.base.hp, level) * (opts.scale || 1) * jitter),
      maxAp: 0,
      startAp: 0,
      stats,
      weak: data.weak.slice(),
      resist: data.resist.slice(),
      row: 'front',
      breakMax: Math.round(data.breakMax * (opts.scale || 1)),
      tint: data.tint,
    });

    this.data = data;
    this.typeId = data.id;
    this.isBoss = !!data.boss;
    this.lore = data.lore;
    this.phase = 1;
    this.xpValue = data.xp;
    this.shadowScale = (opts.scale || 1) * (data.kind === 'hulk' ? 1.6 : data.kind === 'curator' ? 1.5 : 1.05);

    const rig = buildCreature(data.kind, data.palette);
    rig.root.scale.setScalar(opts.scale || 1);
    this._attachRig(rig, CREATURE_CLIPS, CREATURE_REST, proceduralCreature);
    this.height = rig.height * (opts.scale || 1);
    this.floats = rig.floats;
    this.weakPoints = rig.parts.weakPoints || [];
    this.play('idle');

    this._drive = null;
    this._driveClip = '';
  }

  /** Attack patterns legal in the current phase. */
  patternsForPhase() {
    return this.data.patterns.filter((p) => !p.phase || p.phase === this.phase);
  }

  /**
   * Boss phase transition check.
   * @returns {object|null} the phase-2 descriptor if it just triggered
   */
  checkPhase() {
    const p2 = this.data.phase2;
    if (!p2 || this.phase !== 1) return null;
    if (this.hpFrac > (this.data.phaseThreshold || 0.5)) return null;
    this.phase = 2;
    this.weak = p2.weak.slice();
    this.stats.atk = Math.round(this.stats.atk * (p2.atkBonus || 1));
    this.stats.spd = Math.round(this.stats.spd * (p2.spdBonus || 1));
    this.breakVal = 0;
    return p2;
  }

  setWeakPointsVisible(v) {
    for (const wp of this.weakPoints) wp.visible = v;
  }

  /** World-space centres of every weak point, for the free-aim raycast. */
  weakPointMeshes() {
    return this.weakPoints;
  }

  /**
   * Pin the swing animation to reaction-system timing.
   * @param {{windup:number, strike:number}|null} swing
   */
  driveAttack(swing) {
    this._drive = swing;
    if (!swing && this.animator) this.animator.unpin();
  }

  update(dt, elapsed) {
    if (this._drive && this.animator) {
      const wantStrike = this._drive.strike > 0;
      const clip = wantStrike ? 'strike' : 'windup';
      if (this._driveClip !== clip) {
        this.play(clip, { restart: true, fade: wantStrike ? 0.03 : 0.14 });
        this._driveClip = clip;
      }
      this.animator.setPhase(wantStrike ? this._drive.strike : this._drive.windup);
    } else if (this._driveClip) {
      this._driveClip = '';
    }
    super.update(dt, elapsed);

    // Staggered creatures sag and stop glowing.
    if (this.rig && this.rig.parts.eyes) {
      const dim = this.staggered ? 0.25 : 1;
      for (const e of this.rig.parts.eyes) {
        if (e.material && e.material.emissiveIntensity !== undefined) {
          e.material.emissiveIntensity = THREE.MathUtils.lerp(
            e.material.emissiveIntensity,
            (this.phase === 2 ? 4.2 : 2.6) * dim,
            Math.min(1, dt * 4),
          );
        }
      }
    }
  }

  /** Enter or leave the staggered state, switching to the sagging idle clip. */
  setStaggered(v) {
    this.staggered = v;
    if (v) this.play('stagger', { restart: true, fade: 0.2 });
    else this.play('idle', { fade: 0.25 });
  }
}
