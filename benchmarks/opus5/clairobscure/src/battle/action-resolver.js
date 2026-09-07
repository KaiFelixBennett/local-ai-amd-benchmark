/**
 * All damage, healing, resource and status arithmetic.
 *
 * Pure-ish by design: every function takes explicit combatant objects and an
 * RNG, mutates only what it is handed, and returns a plain result record. No
 * rendering, no events, no globals — which makes the balance readable and the
 * outcomes reproducible from a seed.
 *
 * A "combatant" is any object shaped like:
 *   { id, name, side, alive, hp, maxHp, ap, maxAp, level,
 *     stats:{atk,def,spd,crit,critDmg}, weak:[], resist:[], immune:[],
 *     statuses:[], breakVal, breakMax, staggered, row }
 */

import { clamp, clamp01 } from '../core/easing.js';

export const ELEMENTS = {
  physical: { name: 'Physical', color: '#d8cfb4', glyph: '✦' },
  fire: { name: 'Fire', color: '#e2803a', glyph: '✸' },
  ice: { name: 'Ice', color: '#8fd4e8', glyph: '❉' },
  lightning: { name: 'Lightning', color: '#f0d060', glyph: '⚡' },
  void: { name: 'Void', color: '#7b5ea7', glyph: '◈' },
  light: { name: 'Light', color: '#fff0c8', glyph: '✷' },
};

export const EFF = {
  WEAK: 1.55,
  NORMAL: 1.0,
  RESIST: 0.62,
  IMMUNE: 0,
};

/** Resource gains, kept in one table so the AP economy is tunable at a glance. */
export const ECONOMY = {
  AP_BASIC_ATTACK: 3,
  AP_PARRY: 2,
  AP_DODGE: 1,
  AP_WEAKPOINT: 3,
  AP_BODYSHOT: 1,
  AP_COUNTER: 1,
  AP_TOOK_HIT: 1,
  AP_TURN_TICK: 1,
  GRADIENT_PARRY: 9,
  GRADIENT_DODGE: 3,
  GRADIENT_WEAKPOINT: 7,
  GRADIENT_COUNTER: 6,
  GRADIENT_CRIT: 4,
  GRADIENT_HURT: 4,
  GRADIENT_BREAK: 14,
  GRADIENT_MAX: 100,
};

export const STATUS_DEFS = {
  burn: {
    id: 'burn', name: 'Burn', kind: 'dot', color: '#e2803a', glyph: '🜂',
    element: 'fire', tickPower: 0.34, defaultTurns: 3,
  },
  poison: {
    id: 'poison', name: 'Poison', kind: 'dot', color: '#8fbf5a', glyph: '☠',
    element: 'void', tickPower: 0.22, escalates: true, defaultTurns: 4,
  },
  bleed: {
    id: 'bleed', name: 'Bleed', kind: 'dot', color: '#a5372c', glyph: '⚚',
    element: 'physical', tickPower: 0.28, defaultTurns: 3,
  },
  stun: {
    id: 'stun', name: 'Stun', kind: 'control', color: '#f0d060', glyph: '✹',
    skipsTurn: true, defaultTurns: 1,
  },
  mark: {
    id: 'mark', name: 'Marked', kind: 'debuff', color: '#e05c8a', glyph: '◎',
    damageTaken: 1.28, defaultTurns: 3,
  },
  slow: {
    id: 'slow', name: 'Slowed', kind: 'debuff', color: '#7b8fa7', glyph: '⏷',
    spdMod: 0.6, defaultTurns: 3,
  },
  weaken: {
    id: 'weaken', name: 'Weakened', kind: 'debuff', color: '#9a7fbd', glyph: '▽',
    atkMod: 0.7, defaultTurns: 3,
  },
  sunder: {
    id: 'sunder', name: 'Sundered', kind: 'debuff', color: '#c76a4a', glyph: '◺',
    defMod: 0.66, defaultTurns: 3,
  },
  rage: {
    id: 'rage', name: 'Fervour', kind: 'buff', color: '#e8b04a', glyph: '△',
    atkMod: 1.35, defaultTurns: 3,
  },
  guard: {
    id: 'guard', name: 'Aegis', kind: 'buff', color: '#8fd4e8', glyph: '⬡',
    defMod: 1.5, defaultTurns: 3,
  },
  haste: {
    id: 'haste', name: 'Quickened', kind: 'buff', color: '#9ee8b0', glyph: '⏶',
    spdMod: 1.45, defaultTurns: 3,
  },
  regen: {
    id: 'regen', name: 'Verdure', kind: 'heal', color: '#a8e07a', glyph: '❦',
    tickPower: 0.09, defaultTurns: 3,
  },
  shell: {
    id: 'shell', name: 'Gilded Shell', kind: 'buff', color: '#d9b262', glyph: '❖',
    absorb: true, defaultTurns: 2,
  },
};

// ---------------------------------------------------------------------------
// Status queries
// ---------------------------------------------------------------------------

export function getStatus(c, id) {
  return c.statuses.find((s) => s.id === id) || null;
}

/** Product of every active modifier of the given kind (atkMod, defMod, spdMod). */
export function statusMultiplier(c, key) {
  let m = 1;
  for (const s of c.statuses) {
    const def = STATUS_DEFS[s.id];
    if (def && def[key]) m *= def[key];
  }
  return m;
}

export function effectiveAtk(c) {
  return c.stats.atk * statusMultiplier(c, 'atkMod');
}

export function effectiveDef(c) {
  const staggerPenalty = c.staggered ? 0.55 : 1;
  return c.stats.def * statusMultiplier(c, 'defMod') * staggerPenalty;
}

export function effectiveSpd(c) {
  return c.stats.spd * statusMultiplier(c, 'spdMod');
}

/** Extra damage a target takes from marks and similar debuffs. */
export function incomingMultiplier(c) {
  let m = 1;
  for (const s of c.statuses) {
    const def = STATUS_DEFS[s.id];
    if (def && def.damageTaken) m *= def.damageTaken;
  }
  if (c.staggered) m *= 1.6;
  if (c.row === 'back') m *= 0.9;
  return m;
}

export function effectivenessOf(target, element) {
  if (!element || element === 'true') return EFF.NORMAL;
  if (target.immune && target.immune.includes(element)) return EFF.IMMUNE;
  if (target.weak && target.weak.includes(element)) return EFF.WEAK;
  if (target.resist && target.resist.includes(element)) return EFF.RESIST;
  return EFF.NORMAL;
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

/**
 * @param {object} move { power, element, critBonus, breakPower, ignoreDef, flat }
 * @param {object} opts { multiplier, guaranteedCrit, noCrit, precision }
 * @returns {{amount:number, crit:boolean, eff:number, element:string, breakDamage:number}}
 */
export function computeDamage(attacker, target, move, rng, opts = {}) {
  const element = move.element || 'physical';
  const eff = effectivenessOf(target, element);
  if (eff === EFF.IMMUNE) {
    return { amount: 0, crit: false, eff, element, breakDamage: 0, immune: true };
  }

  const atk = effectiveAtk(attacker);
  const def = move.ignoreDef ? effectiveDef(target) * 0.4 : effectiveDef(target);
  const mitigation = 110 / (110 + def);

  let raw = (move.power || 1) * atk * 2.05 * mitigation;
  if (move.flat) raw += move.flat;

  const critChance = clamp01((attacker.stats.crit || 0.06) + (move.critBonus || 0) + (opts.precision || 0));
  const crit = opts.guaranteedCrit === true
    || (!opts.noCrit && rng.chance(critChance));
  if (crit) raw *= attacker.stats.critDmg || 1.75;

  raw *= eff;
  raw *= incomingMultiplier(target);
  raw *= opts.multiplier || 1;
  raw *= 0.93 + rng.next() * 0.14; // small variance keeps numbers alive

  const breakDamage = (move.breakPower || 1) * (crit ? 1.4 : 1) * (eff > 1 ? 1.6 : 1) * 9;

  return {
    amount: Math.max(1, Math.round(raw)),
    crit, eff, element,
    breakDamage: Math.round(breakDamage),
    immune: false,
  };
}

/**
 * Apply damage, honouring absorb shields. Mutates `target`.
 * @returns {{dealt:number, absorbed:number, killed:boolean}}
 */
export function applyDamage(target, amount) {
  if (!target.alive || amount <= 0) return { dealt: 0, absorbed: 0, killed: false };

  let remaining = Math.round(amount);
  let absorbed = 0;
  const shell = getStatus(target, 'shell');
  if (shell && shell.shield > 0) {
    absorbed = Math.min(shell.shield, remaining);
    shell.shield -= absorbed;
    remaining -= absorbed;
    if (shell.shield <= 0) removeStatus(target, 'shell');
  }

  const before = target.hp;
  target.hp = clamp(target.hp - remaining, 0, target.maxHp);
  const dealt = before - target.hp;
  const killed = target.hp <= 0 && target.alive;
  if (killed) target.alive = false;
  return { dealt, absorbed, killed };
}

export function applyHeal(target, amount) {
  if (!target.alive) return { healed: 0 };
  const before = target.hp;
  target.hp = clamp(target.hp + Math.round(amount), 0, target.maxHp);
  return { healed: target.hp - before };
}

/** Revive a fallen combatant at a fraction of max HP. */
export function revive(target, fraction = 0.4) {
  if (target.alive) return { healed: 0, revived: false };
  target.alive = true;
  target.hp = Math.max(1, Math.round(target.maxHp * fraction));
  target.statuses.length = 0;
  return { healed: target.hp, revived: true };
}

export function healPower(caster, move) {
  return Math.round((move.power || 1) * (effectiveAtk(caster) * 1.5 + 40));
}

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

/**
 * Apply or refresh a status. Returns the status instance, or null if the target
 * is immune / already at max stacks.
 */
export function addStatus(target, id, opts = {}) {
  const def = STATUS_DEFS[id];
  if (!def || !target.alive) return null;
  if (target.statusImmune && target.statusImmune.includes(id)) return null;

  const turns = opts.turns || def.defaultTurns || 3;
  const existing = getStatus(target, id);
  if (existing) {
    existing.turns = Math.max(existing.turns, turns);
    existing.stacks = Math.min((existing.stacks || 1) + 1, def.escalates ? 5 : 1);
    if (def.absorb) existing.shield = Math.max(existing.shield || 0, opts.shield || 0);
    existing.power = Math.max(existing.power || 1, opts.power || 1);
    return existing;
  }

  const inst = {
    id, turns, stacks: 1,
    power: opts.power || 1,
    source: opts.source || null,
    shield: def.absorb ? (opts.shield || 0) : 0,
  };
  target.statuses.push(inst);
  return inst;
}

export function removeStatus(target, id) {
  const i = target.statuses.findIndex((s) => s.id === id);
  if (i >= 0) target.statuses.splice(i, 1);
}

export function clearDebuffs(target) {
  const removed = [];
  for (let i = target.statuses.length - 1; i >= 0; i--) {
    const def = STATUS_DEFS[target.statuses[i].id];
    if (def && (def.kind === 'debuff' || def.kind === 'dot' || def.kind === 'control')) {
      removed.push(target.statuses[i].id);
      target.statuses.splice(i, 1);
    }
  }
  return removed;
}

/**
 * Advance every status on a combatant by one turn, applying damage-over-time
 * and regeneration. Returns a list of {type, id, amount, killed} records for
 * the presentation layer to animate.
 */
export function tickStatuses(target) {
  const events = [];
  if (!target.alive) {
    target.statuses.length = 0;
    return events;
  }

  for (let i = target.statuses.length - 1; i >= 0; i--) {
    const s = target.statuses[i];
    const def = STATUS_DEFS[s.id];
    if (!def) { target.statuses.splice(i, 1); continue; }

    if (def.kind === 'dot') {
      const scale = def.escalates ? s.stacks : 1;
      const amount = Math.max(1, Math.round(target.maxHp * def.tickPower * 0.14 * scale * s.power));
      const res = applyDamage(target, amount);
      events.push({ type: 'dot', id: s.id, amount: res.dealt, killed: res.killed, color: def.color });
      if (res.killed) break;
    } else if (def.kind === 'heal') {
      const amount = Math.max(1, Math.round(target.maxHp * def.tickPower * s.power));
      const res = applyHeal(target, amount);
      events.push({ type: 'regen', id: s.id, amount: res.healed, color: def.color });
    }

    s.turns--;
    if (s.turns <= 0) {
      target.statuses.splice(i, 1);
      events.push({ type: 'expired', id: s.id, color: def.color });
    }
  }
  return events;
}

export function isStunned(c) {
  return c.statuses.some((s) => {
    const d = STATUS_DEFS[s.id];
    return d && d.skipsTurn;
  });
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export function addAP(c, amount) {
  const before = c.ap;
  c.ap = clamp(c.ap + amount, 0, c.maxAp);
  return c.ap - before;
}

export function spendAP(c, amount) {
  if (c.ap < amount) return false;
  c.ap -= amount;
  return true;
}

/**
 * Add to a combatant's break meter. When it fills, they are staggered for a
 * turn: heavy incoming-damage bonus, reduced defence, turn skipped.
 * @returns {{broke:boolean, value:number}}
 */
export function addBreak(target, amount) {
  if (!target.alive || target.breakMax <= 0) return { broke: false, value: 0 };
  if (target.staggered) return { broke: false, value: target.breakVal };
  target.breakVal += amount;
  if (target.breakVal >= target.breakMax) {
    target.breakVal = 0;
    target.staggered = true;
    target.staggerTurns = 1;
    // Each break gets harder to reach, so stagger-locking is impossible.
    target.breakMax = Math.round(target.breakMax * 1.35);
    return { broke: true, value: 0 };
  }
  return { broke: false, value: target.breakVal };
}

/** Break meters decay slowly so chip damage alone cannot stagger a boss. */
export function decayBreak(target, amount = 6) {
  if (!target.staggered && target.breakVal > 0) {
    target.breakVal = Math.max(0, target.breakVal - amount);
  }
}

// ---------------------------------------------------------------------------
// Level scaling
// ---------------------------------------------------------------------------

/** Stat growth applied on level-up; roughly +7% compounding per level. */
export function scaleStatsForLevel(base, level) {
  const f = Math.pow(1.075, level - 1);
  return {
    atk: Math.round(base.atk * f),
    def: Math.round(base.def * f),
    spd: Math.round(base.spd * (1 + (level - 1) * 0.018)),
    crit: base.crit,
    critDmg: base.critDmg,
  };
}

export function maxHpForLevel(baseHp, level) {
  return Math.round(baseHp * Math.pow(1.085, level - 1));
}

export function xpForLevel(level) {
  return Math.round(90 * Math.pow(level, 1.45));
}
