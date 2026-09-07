/**
 * A playable expedition member.
 *
 * Owns the humanoid rig, the level/XP progression, the equipped skill list and
 * the small amount of per-character combat state the battle system needs.
 */

import { Combatant } from './combatant.js';
import { buildHumanoid } from './rig.js';
import { HUMANOID_CLIPS } from './clips.js';
import { skillsFor, skillsUnlockedAt } from './skill.js';
import { scaleStatsForLevel, maxHpForLevel, xpForLevel } from '../battle/action-resolver.js';

export class Character extends Combatant {
  /**
   * @param {object} data entry from data/party.js
   * @param {{level:number, luminas:object}} opts
   */
  constructor(data, opts = {}) {
    const level = opts.level || 1;
    const luminas = opts.luminas || {};
    const stats = scaleStatsForLevel(data.base, level);
    stats.def = Math.round(stats.def * (luminas.defMul || 1));
    stats.spd = Math.round(stats.spd * (luminas.spdMul || 1));

    super({
      id: data.id,
      name: data.name,
      side: 'party',
      level,
      maxHp: maxHpForLevel(data.base.hp, level),
      maxAp: data.maxAp,
      startAp: Math.min(data.maxAp, data.startAp + (luminas.startApBonus || 0)),
      stats,
      weak: data.weak,
      resist: data.resist,
      row: data.row,
      breakMax: 0,
      tint: data.appearance.palette.accent,
    });

    this.data = data;
    this.title = data.title;
    this.role = data.role;
    this.element = data.element;
    this.basic = data.basic;
    this.aimShot = data.aimShot;
    this.counterMove = data.counter;
    this.accent = data.appearance.palette.accent;
    this.xp = 0;
    this.xpToNext = xpForLevel(level);
    this.pendingLevels = 0;
    this.newSkills = [];
    this.shadowScale = 1;

    const rig = buildHumanoid(data.appearance);
    this._attachRig(rig, HUMANOID_CLIPS, undefined, undefined);
    this.play('idle');
  }

  get skills() {
    return skillsFor(this.id, this.level);
  }

  /** Skills the character can pay for right now. */
  affordableSkills() {
    return this.skills.filter((s) => s.cost <= this.ap);
  }

  /**
   * Award XP and roll any level-ups. Returns a summary for the results screen.
   * @returns {{levels:number, unlocked:Array, hpGain:number}}
   */
  gainXp(amount) {
    this.xp += amount;
    let levels = 0;
    const unlocked = [];
    const hpBefore = this.maxHp;
    let guard = 0;
    while (this.xp >= this.xpToNext && this.level < 30 && guard++ < 30) {
      this.xp -= this.xpToNext;
      this.level++;
      levels++;
      for (const s of skillsUnlockedAt(this.id, this.level)) unlocked.push(s);
      this.xpToNext = xpForLevel(this.level);
    }
    if (levels > 0) {
      const stats = scaleStatsForLevel(this.data.base, this.level);
      this.stats.atk = stats.atk;
      this.stats.def = stats.def;
      this.stats.spd = stats.spd;
      this.maxHp = maxHpForLevel(this.data.base.hp, this.level);
      this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - hpBefore));
      this.newSkills = unlocked;
    }
    return { levels, unlocked, hpGain: this.maxHp - hpBefore };
  }

  /** Restore between waves without wiping the sense of attrition. */
  restBetweenWaves() {
    if (!this.alive) {
      this.alive = true;
      this.hp = Math.round(this.maxHp * 0.45);
    } else {
      this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * 0.34));
    }
    this.statuses.length = 0;
    this.ap = Math.max(this.ap, this.data.startAp);
    this.dissolving = false;
    this.dissolve = 0;
    this.play('idle', { restart: true });
  }

  /**
   * Between world encounters: afflictions clear and the fallen are dragged back
   * up, but health carries over — attrition across the area is the point.
   */
  prepareForEncounter() {
    if (!this.alive) {
      this.alive = true;
      this.hp = Math.max(1, Math.round(this.maxHp * 0.35));
    }
    this.statuses.length = 0;
    this.ap = Math.max(this.ap, this.data.startAp);
    this.dissolving = false;
    this.dissolve = 0;
    this.flash = 0;
    this.motion = null;
    this.root.position.copy(this.home);
    if (this.animator) this.animator.speed = 1;
    this.play('idle', { restart: true });
  }

  /** Restore a slice of health at a rest point in the world. */
  restAtCheckpoint(fraction = 0.5) {
    if (!this.alive) {
      this.alive = true;
      this.hp = Math.round(this.maxHp * 0.5);
    } else {
      this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * fraction));
    }
    this.statuses.length = 0;
  }

  /** Full reset for a new run. */
  resetForBattle(luminas) {
    this.hp = this.maxHp;
    this.ap = Math.min(this.maxAp, this.data.startAp + (luminas.startApBonus || 0));
    this.alive = true;
    this.statuses.length = 0;
    this.dissolving = false;
    this.dissolve = 0;
    this.flash = 0;
    this.motion = null;
    this.root.position.copy(this.home);
    this.play('idle', { restart: true });
  }
}
