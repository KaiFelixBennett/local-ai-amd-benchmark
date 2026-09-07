/**
 * entities/skill.js — Skill definitions (data) + apply-effect logic.
 *
 * A skill is a plain data object; `executeSkill` expands it against real
 * combatants into an ordered list of ATOMIC steps (one hit, one heal, one
 * status application...) with all numbers already computed. The battle
 * system plays the steps back with animations; nothing here touches time,
 * THREE, or the DOM.
 *
 * Step shapes:
 *   { kind:'hit',    target, damage, crit, weakness, resisted, hpAfter,
 *                     staggered }
 *   { kind:'heal',   target, amount, hpAfter }
 *   { kind:'status', target, id, stacks }
 *   { kind:'shield', target, amount }
 *   { kind:'note',   text }                       // cosmetic log line
 */
import {
  computeHit,
  computeHeal,
  applyStatus,
  addStagger,
  STATUS_DEFS,
} from '../battle/action-resolver.js';

// ---------------------------------------------------------------------------
// Party skill table (also referenced by loadout/passives)
// ---------------------------------------------------------------------------

export const SKILLS = {
  // ---- Mae (ranger, front row) ------------------------------------------
  mae_precision_shot: {
    id: 'mae_precision_shot',
    name: 'Precision Shot',
    desc: 'A single clean bolt. Deals 160% attack, arcane. Marks the target (+dmg taken, 3 turns).',
    apCost: 2,
    type: 'damage',
    element: 'arcane',
    mult: 1.6,
    targets: 'enemy-single',
    statuses: [{ id: 'marked', applyTo: 'target', chance: 1, duration: 3 }],
    stagger: 26,
    icon: 'bolt',
  },
  mae_triple_salvo: {
    id: 'mae_triple_salvo',
    name: 'Triple Salvo',
    desc: 'Three quick bolts at 80% attack each. Arcane.',
    apCost: 3,
    type: 'multi',
    element: 'arcane',
    mult: 0.8,
    hits: 3,
    targets: 'enemy-single',
    stagger: 14,
    icon: 'triple',
  },
  mae_barrage: {
    id: 'mae_barrage',
    name: 'Barrage',
    desc: 'Fans bolts across ALL enemies at 95% attack. Arcane. Marks everyone hit.',
    apCost: 4,
    type: 'damage',
    element: 'arcane',
    mult: 0.95,
    targets: 'enemies',
    statuses: [{ id: 'marked', applyTo: 'target', chance: 0.6, duration: 2 }],
    stagger: 16,
    icon: 'barrage',
  },

  // ---- Lune (mage, back row) ---------------------------------------------
  lune_cinder: {
    id: 'lune_cinder',
    name: 'Cinder',
    desc: 'A lance of fire at 180% attack. Fire. Ignites (burn, 3 turns).',
    apCost: 2,
    type: 'damage',
    element: 'fire',
    mult: 1.8,
    targets: 'enemy-single',
    statuses: [{ id: 'burn', applyTo: 'target', chance: 0.8, duration: 3 }],
    stagger: 30,
    icon: 'fire',
  },
  lune_frost_veil: {
    id: 'lune_frost_veil',
    name: 'Frost Veil',
    desc: 'Ice barrier over the whole party: +50% def (3 turns) and a shield.',
    apCost: 3,
    type: 'buff',
    element: 'ice',
    targets: 'party',
    statuses: [{ id: 'defUp', applyTo: 'self', chance: 1, duration: 3 }],
    shield: 0.12,
    icon: 'frost',
  },
  lune_glacial_lance: {
    id: 'lune_glacial_lance',
    name: 'Glacial Lance',
    desc: 'A piercing lance at 130% attack per hit, twice. Ice. Slows: atk down (2 turns).',
    apCost: 3,
    type: 'multi',
    element: 'ice',
    mult: 1.3,
    hits: 2,
    targets: 'enemy-single',
    statuses: [{ id: 'atkDown', applyTo: 'target', chance: 0.7, duration: 2 }],
    stagger: 24,
    icon: 'lance',
  },

  // ---- Gustave (knight, front row) ----------------------------------------
  gustave_ward: {
    id: 'gustave_ward',
    name: 'Aegis Ward',
    desc: 'Gustave raises his guard: +50% def for the party (3 turns) and shields them.',
    apCost: 2,
    type: 'buff',
    element: 'none',
    targets: 'party',
    statuses: [{ id: 'defUp', applyTo: 'self', chance: 1, duration: 3 }],
    shield: 0.15,
    icon: 'shield',
  },
  gustave_rend: {
    id: 'gustave_rend',
    name: 'Rend',
    desc: 'A greatsword arc at 200% attack. Gold. Heavy stagger, and it cuts (def down, 2 turns).',
    apCost: 3,
    type: 'damage',
    element: 'gold',
    mult: 2.0,
    targets: 'enemy-single',
    statuses: [{ id: 'defDown', applyTo: 'target', chance: 1, duration: 2 }],
    stagger: 42,
    icon: 'sword',
  },
  gustave_judgement: {
    id: 'gustave_judgement',
    name: 'Judgement',
    desc: 'An overhead blow at 150% attack to ALL enemies. Gold. Can stagger all it hits.',
    apCost: 5,
    type: 'damage',
    element: 'gold',
    mult: 1.5,
    targets: 'enemies',
    stagger: 34,
    icon: 'judgement',
  },
};

/** Basic (AP-free) attack per combatant — defined per combatant in their
 *  data file, but all basics share this shape helper. */
export function makeBasicAttack(id, name, desc, element, mult = 1.0, opts = {}) {
  return {
    id,
    name,
    desc,
    apCost: 0,
    type: 'damage',
    element,
    mult,
    targets: 'enemy-single',
    ...opts,
  };
}

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

function resolveTargets(skill, candidates, rng) {
  switch (skill.targets) {
    case 'enemies':
      return candidates.filter((c) => c.hp > 0);
    case 'party':
      return candidates.filter((c) => c.hp > 0);
    case 'enemy-single':
    case 'party-single':
    default:
      return candidates.length ? [candidates[0]] : [];
  }
}

function applyStatusesTo(steps, target, skill, rng) {
  for (const s of skill.statuses || []) {
    if (rng.chance(s.chance ?? 1)) {
      applyStatus(target, s.id, { stacks: s.stacks ?? 1, duration: s.duration });
      steps.push({ kind: 'status', target, id: s.id, stacks: s.stacks ?? 1 });
    }
  }
}

/**
 * Execute a skill, mutating combatants and returning the presentation steps.
 *
 * @param {object} caster  acting combatant
 * @param {object} skill   SKILLS entry
 * @param {object[]} candidates  already-filtered targets (for single-target
 *        skills this is [chosen target])
 * @param {object} ctx { rng }
 */
export function executeSkill(caster, skill, candidates, ctx) {
  const { rng } = ctx;
  const steps = [];
  caster.ap = Math.max(0, caster.ap - skill.apCost);

  const targets = resolveTargets(skill, candidates, rng);

  switch (skill.type) {
    case 'damage': {
      for (const t of targets) {
        const res = computeHit(caster, t, { mult: skill.mult, rng });
        let dmg = res.damage;
        if (t.shield > 0) {
          const absorbed = Math.min(t.shield, dmg);
          t.shield -= absorbed;
          dmg -= absorbed;
        }
        t.hp = Math.max(0, t.hp - dmg);
        let staggered = false;
        if (skill.stagger && t.hp > 0) staggered = addStagger(t, skill.stagger, { weakness: res.weakness });
        applyStatusesTo(steps, t, skill, rng);
        steps.push({
          kind: 'hit', target: t, damage: dmg,
          crit: res.crit, weakness: res.weakness, resisted: res.resisted,
          hpAfter: t.hp, staggered,
        });
        if (t.hp <= 0 && !t.dead) {
          t.dead = true;
          steps.push({ kind: 'death', target: t });
        }
      }
      break;
    }

    case 'multi': {
      const t = targets[0];
      if (!t) break;
      for (let h = 0; h < (skill.hits || 1); h++) {
        if (t.hp <= 0) break;
        const res = computeHit(caster, t, { mult: skill.mult, rng });
        t.hp = Math.max(0, t.hp - res.damage);
        let staggered = false;
        if (skill.stagger && t.hp > 0) staggered = addStagger(t, skill.stagger, { weakness: res.weakness });
        steps.push({
          kind: 'hit', target: t, damage: res.damage, hitIndex: h,
          crit: res.crit, weakness: res.weakness, resisted: res.resisted,
          hpAfter: t.hp, staggered,
        });
        if (h === 0) applyStatusesTo(steps, t, skill, rng);
        if (t.hp <= 0 && !t.dead) {
          t.dead = true;
          steps.push({ kind: 'death', target: t });
          break;
        }
      }
      break;
    }

    case 'heal': {
      for (const t of targets) {
        const amount = computeHeal(caster, t, skill.healPower);
        t.hp = Math.min(t.maxHp, t.hp + amount);
        steps.push({ kind: 'heal', target: t, amount, hpAfter: t.hp });
      }
      break;
    }

    case 'buff':
    case 'debuff': {
      for (const t of targets) {
        if (skill.shield) {
          const amount = Math.round(t.maxHp * skill.shield);
          t.shield = (t.shield || 0) + amount;
          steps.push({ kind: 'shield', target: t, amount });
        }
        applyStatusesTo(steps, t, skill, rng);
      }
      break;
    }

    default:
      break;
  }

  return steps;
}
