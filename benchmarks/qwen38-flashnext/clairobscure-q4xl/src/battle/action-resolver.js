import { clamp } from '../core/easing.js';

// ---------------------------------------------------------------------------
// Pure damage / AP / status math. State is never mutated here (except by
// explicitly calling helpers that do, noted per-function) so the formulas can
// be read — and the seedability audited — from one file.
// ---------------------------------------------------------------------------

export const ELEMENTS = ['physical', 'fire', 'ice', 'light', 'shadow'];

// Elemental multiplier: weakness > resist > neutral.
export function elementMult(targetDef, element) {
  if (!element || element === 'physical') {
    return targetDef.weak && targetDef.weak.physical ? targetDef.weak.physical : 1;
  }
  if (targetDef.weak && targetDef.weak[element] != null) return targetDef.weak[element];
  if (targetDef.resist && targetDef.resist[element] != null) return targetDef.resist[element];
  return 1;
}

export function weaknessLabel(targetDef, element) {
  const m = elementMult(targetDef, element);
  return m >= 1.2 ? 'weakness' : m <= 0.8 ? 'resist' : 'neutral';
}

/**
 * @param ctx {attacker, target, power, element, rng, critBonus, variance,
 *             isCounter, isAim, aimPower, aimHit, bonusMult, noCrit}
 * Returns {amount, crit, elemMult, weakState, breakdown}
 */
export function computeDamage(ctx) {
  const { attacker, target, rng } = ctx;
  const power = ctx.power ?? 1;
  const atk = attacker.stats.atk * attacker.attackMult();
  let raw = (atk * power + attacker.level * 2 + 5) * (0.92 + rng.next() * 0.16);

  // Row positioning: back-row attackers take a small penalty on melee power.
  if (ctx.type === 'melee' && attacker.row === 'back') raw *= 0.85;
  // Front-row tankiness: front targets are hit harder by follow-up? Classic: back row takes less melee damage.
  if (ctx.type === 'melee' && target.row === 'back') raw *= 0.8;

  const eMult = elementMult(target.def, ctx.element);
  raw *= eMult;

  // Defence subtractive then multiplicative, floored to stay sane.
  raw = Math.max(raw * 0.35, raw - target.stats.def * (target.side === 'enemy' ? 0.9 : 0.6));
  raw /= target.defenceMult();

  // 'Marked' targets take +15%.
  if (target.hasStatus && target.hasStatus('mark')) raw *= 1.15;
  // Broken targets take +35%.
  if (target.isBroken) raw *= 1.35;
  if (ctx.bonusMult) raw *= ctx.bonusMult;

  // Crit.
  const critChance = (ctx.noCrit ? 0 : (attacker.stats.crit ?? 0.05)) + (ctx.critBonus || 0);
  const crit = !ctx.noCrit && rng.chance(critChance);
  if (crit) raw *= 1.75;

  // Free-aim bonus / penalty.
  if (ctx.isAim) {
    raw *= clamp(0.6 + ctx.aimPower * 0.8, 0.6, 1.4);          // hold-charge power
    if (ctx.aimHit === 'weak') raw *= 2.0;                      // bullseye doubles
    else if (ctx.aimHit === 'miss') raw *= 0.25;                // airball
  }

  // Defensive statuses on the defender (guard from perfect-timing, etc).
  if (ctx.guardMult) raw *= ctx.guardMult;

  const amount = Math.max(1, Math.round(raw));
  return {
    amount,
    crit,
    elemMult: eMult,
    weakState: eMult >= 1.2 ? 'weakness' : eMult <= 0.8 ? 'resist' : 'neutral'
  };
}

// Stagger generation from an attack.
export function computeStagger(ctx) {
  let s = (ctx.stagger || 0);
  if (ctx.isAim && ctx.aimHit === 'weak') s *= 1.6;
  if (ctx.weakState === 'weakness') s *= 1.25;
  if (ctx.hitIndex != null) s *= 0.8 + 0.1 * ctx.hitIndex; // later combo hits stagger more
  return Math.max(1, Math.round(s));
}

export function computeHeal(caster, ratio, rng) {
  const base = caster.stats.atk * ratio + 18;
  return Math.max(6, Math.round(base * (0.95 + rng.next() * 0.1)));
}

// AP economy: basic attacks build, skills spend. Parries build.
export const AP = {
  gainAttack: 2,
  gainAim: 2,
  gainHitTaken: 1,
  gainParry: 3,
  gainPerfect: 5,
  gainCounter: 2,
  gainBreak: 4,
  maxFromParriesPerTurn: 12
};

// Charge (gradient meter) gains.
export const CHARGE = {
  perfect: 7,
  parry: 4,
  dodge: 2,
  weakHit: 7,
  crit: 3,
  weaknessHit: 4,
  enemyDeath: 0, // per-enemy value stored on the enemy def
  streakBonus: 2
};

export const FLOW = {
  // flow/streak meter: +1 per perfect parry; each level grants +5% outgoing damage
  // until broken by taking a hit you failed to mitigate.
  perLevelDamage: 0.05,
  max: 10
};
