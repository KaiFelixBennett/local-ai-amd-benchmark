/**
 * battle/action-resolver.js — Pure combat math. No THREE, no DOM, no time.
 *
 * Everything that decides "how much did that do" lives here and is a plain
 * function of (stats, rng, modifiers). Battle system and skill definitions
 * call these and apply the returned results to combatants — which keeps the
 * math unit-testable and free of engine coupling.
 *
 * Damage model (Clair Obscur-flavored):
 *   base   = atk * mult
 *   eleMul = ELEMENT_CHART[atkEle][defEle]          (0.5 .. 2.0)
 *   crit   = rng < critChance  ->  x1.75 (1.25x if crit-resist)
 *   back   = target in back row?  -> 0.85
 *   buff   = product of attacker multipliers (atk buff/debuff)
 *   weak   = target has 'marked' or is staggered -> 1.4
 *   break  = target stagger meter full -> 2.0 (bonus-damage window)
 *   final  = max(1, base * eleMul * critMul * backMul * buffMul * weakMul * breakMul)
 *
 * Status effects: burn, poison (DoT), stun (skip turn), marked (+dmg taken),
 * atkUp/atkDown/defUp/defDown (flat multipliers), shield (flat absorb).
 * Each has a duration in turns, ticked at the owner's turn start.
 */
import { clamp } from '../core/rng.js';

export const ELEMENTS = ['none', 'fire', 'ice', 'gold', 'arcane'];

/** attacker row -> defender element multiplier. */
export const ELEMENT_CHART = {
  none:   { none: 1, fire: 1, ice: 1, gold: 1, arcane: 1 },
  fire:   { none: 1, fire: 0.5, ice: 2, gold: 1, arcane: 0.75 },
  ice:    { none: 1, fire: 2, ice: 0.5, gold: 1, arcane: 0.75 },
  gold:   { none: 1, fire: 0.75, ice: 0.75, gold: 0.5, arcane: 2 },
  arcane: { none: 1, fire: 1.25, ice: 1.25, gold: 2, arcane: 0.5 },
};

export function elementMultiplier(atkEle, defEle) {
  const row = ELEMENT_CHART[atkEle] || ELEMENT_CHART.none;
  return row[defEle] ?? 1;
}

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

/**
 * Status definition table. `stackable` statuses cap at maxStacks.
 * DoT damage scales with the target's maxHp so it stays meaningful.
 */
export const STATUS_DEFS = {
  burn:   { label: 'Burn',   icon: 'fire',  dot: 0.045, duration: 3, stackable: true, maxStacks: 3 },
  poison: { label: 'Poison', icon: 'drop',  dot: 0.03,  duration: 4, stackable: true, maxStacks: 3 },
  stun:   { label: 'Stun',   icon: 'star',  duration: 1 },
  marked: { label: 'Marked', icon: 'mark',  duration: 3, dmgTakenMul: 1.4, stackable: false },
  atkUp:  { label: 'Atk Up', icon: 'up',    duration: 3, atkMul: 1.35 },
  atkDown:{ label: 'Atk Down', icon: 'down', duration: 3, atkMul: 0.7 },
  defUp:  { label: 'Def Up', icon: 'shield', duration: 3, defMul: 1.5 },
  defDown:{ label: 'Def Down', icon: 'crack', duration: 3, defMul: 0.65 },
  shield: { label: 'Shield', icon: 'barrier', duration: 2, shield: 0.18 },
  focus:  { label: 'Focus',  icon: 'eye',   duration: 3, critBonus: 0.2 },
};

/**
 * Apply a status to a combatant's status map. Returns the (possibly new)
 * status object. Pure: mutates only `target.statuses`.
 */
export function applyStatus(target, id, { stacks = 1, duration } = {}) {
  const def = STATUS_DEFS[id];
  if (!def) return null;
  const existing = target.statuses.get(id);
  if (existing && def.stackable) {
    existing.stacks = Math.min(def.maxStacks, existing.stacks + stacks);
    existing.turnsLeft = Math.max(existing.turnsLeft, duration ?? def.duration);
    return existing;
  }
  if (existing && !def.stackable) {
    existing.turnsLeft = Math.max(existing.turnsLeft, duration ?? def.duration);
    return existing;
  }
  const status = { id, stacks, turnsLeft: duration ?? def.duration };
  target.statuses.set(id, status);
  return status;
}

export function hasStatus(target, id) {
  return target.statuses.has(id);
}

/**
 * Turn-start ticking for the combatant: DoT damage, duration countdown.
 * Returns [{ id, damage }] for DoT ticks that occurred (0 damage for
 * non-DoT expiries). Mutates target.hp and target.statuses.
 */
export function tickStatuses(target) {
  const ticks = [];
  for (const [id, st] of target.statuses) {
    const def = STATUS_DEFS[id];
    let dmg = 0;
    if (def.dot) dmg = Math.max(1, Math.round(target.maxHp * def.dot * st.stacks));
    if (dmg > 0) {
      target.hp = Math.max(0, target.hp - dmg);
    }
    ticks.push({ id, damage: dmg, stacks: st.stacks });
    st.turnsLeft -= 1;
    if (st.turnsLeft <= 0) target.statuses.delete(id);
  }
  return ticks;
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

/**
 * Compute a single hit's damage + flags.
 *
 * @param {object} a attacker-like { atk, critChance, element, statuses, focus }
 * @param {object} d defender-like { def, element, row: 'front'|'back', statuses,
 *   staggered, maxHp }
 * @param {object} o options { mult=1, rng, canCrit=true, ignoreDef=false }
 * @returns {{ damage, crit, weakness, resisted, finalDef, atkBase }}
 */
export function computeHit(a, d, o = {}) {
  const { mult = 1, rng, canCrit = true, ignoreDef = false } = o;

  // Attacker modifiers
  let atkMul = 1;
  let critBonus = 0;
  for (const [id, st] of a.statuses) {
    const def = STATUS_DEFS[id];
    if (def.atkMul) atkMul *= Math.pow(def.atkMul, st.stacks);
    if (def.critBonus) critBonus += def.critBonus * st.stacks;
  }

  // Defender modifiers
  let defMul = 1;
  for (const [id, st] of d.statuses) {
    const def = STATUS_DEFS[id];
    if (def.defMul) defMul *= Math.pow(def.defMul, st.stacks);
  }

  const eleMul = elementMultiplier(a.element, d.element);
  const crit = canCrit && rng ? rng.chance(clamp(a.critChance + critBonus, 0, 0.95)) : false;
  const critMul = crit ? 1.75 : 1;
  const backMul = d.row === 'back' ? 0.85 : 1;
  const weakMul = (d.staggered ? 2.0 : 1) * (hasStatus(d, 'marked') ? 1.2 : 1);
  const backBonus = a.row === 'back' && a.backAttackBonus ? a.backAttackBonus : 1;

  const atkBase = a.atk * atkMul * backBonus;
  const defVal = ignoreDef ? 0 : d.def * defMul;

  // Classic: atk * mult - def/2, floored at 10% of atk*mult
  let raw = atkBase * mult;
  raw -= defVal * 0.5;
  raw = Math.max(raw, atkBase * mult * 0.1);

  let damage = Math.round(raw * eleMul * critMul * backMul * weakMul);
  damage = Math.max(1, damage);

  return {
    damage,
    crit,
    weakness: eleMul >= 1.25,
    resisted: eleMul <= 0.75,
    eleMul,
    atkBase,
    finalDef: defVal,
  };
}

/**
 * Heal amount: healPower * maxHp, buffed by any heal-up status (none today,
 * kept for extensibility).
 */
export function computeHeal(caster, target, healPower) {
  let mul = 1;
  for (const [id] of caster.statuses) {
    const def = STATUS_DEFS[id];
    if (def && def.atkMul > 1) mul *= Math.pow(def.atkMul, 0.5);
  }
  return Math.max(1, Math.round(target.maxHp * healPower * mul));
}

/**
 * Stagger: each hit adds `amount` (scaled by weakness) to the target's
 * stagger meter. Returns true if the meter just filled (bonus window opens).
 * Mutates target.stagger.
 */
export function addStagger(target, amount, { weakness = false } = {}) {
  if (!target.staggerMax || target.staggered) return false;
  target.stagger = Math.min(target.staggerMax, target.stagger + amount * (weakness ? 1.5 : 1));
  if (target.stagger >= target.staggerMax) {
    target.staggered = true;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// AP + Ultimate (Lumina)
// ---------------------------------------------------------------------------

/** Basic attacks build AP; returns the amount gained. */
export const AP_BUILD_ON_BASIC = 1;
export const AP_BUILD_ON_PARRY = 1;
export const AP_BUILD_ON_PERFECT_PARRY = 2;
export const AP_BUILD_ON_WEAKPOINT = 1;

/** Ultimate (Lumina) charge: 0..100. Parries + weak points + crits feed it. */
export const ULT_MAX = 100;
export const ULT_ON_PERFECT_PARRY = 14;
export const ULT_ON_PARRY = 7;
export const ULT_ON_WEAKPOINT = 10;
export const ULT_ON_CRIT = 4;
