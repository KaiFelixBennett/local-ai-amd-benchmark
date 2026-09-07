/**
 * Skill definitions and plan construction.
 *
 * A skill never mutates the battle itself. `buildPlan()` turns a skill plus a
 * chosen target into an ordered list of timed steps; the battle system walks
 * that list, calling into action-resolver at execution time so later hits see
 * the state produced by earlier ones.
 *
 * Step shapes:
 *   { kind:'hit',     target, move, delay, hitIndex, hitCount, anim }
 *   { kind:'heal',    target, power, delay }
 *   { kind:'status',  target, id, turns, chance, power, shield, delay }
 *   { kind:'cleanse', target, delay }
 *   { kind:'revive',  target, fraction, delay }
 *   { kind:'ap',      target, amount, delay }
 *   { kind:'gradient', amount, delay }
 */

export const TARGETING = {
  ENEMY: 'enemy',
  ALL_ENEMIES: 'all-enemies',
  ALLY: 'ally',
  ALL_ALLIES: 'all-allies',
  SELF: 'self',
  DEAD_ALLY: 'dead-ally',
};

export const SKILLS = {
  // ---- Aurel Lumière — Duelist -------------------------------------------
  'riposte-eclat': {
    id: 'riposte-eclat', name: 'Éclat Riposte', owner: 'aurel', cost: 3,
    element: 'lightning', targeting: TARGETING.ENEMY, anim: 'thrust',
    hits: 1, power: 2.35, breakPower: 1.8, critBonus: 0.18, unlockLevel: 1,
    desc: 'A single gilded thrust that arcs with stored lightning. High critical odds and heavy break damage.',
  },
  'overcharge': {
    id: 'overcharge', name: 'Overcharge', owner: 'aurel', cost: 5,
    element: 'lightning', targeting: TARGETING.ENEMY, anim: 'flurry',
    hits: 4, power: 0.86, breakPower: 0.85, critBonus: 0.04, unlockLevel: 1,
    selfStatus: { id: 'rage', turns: 2, chance: 1 },
    desc: 'Four accelerating strikes, each discharging the prosthetic. Leaves Aurel in Fervour.',
  },
  'gilded-stance': {
    id: 'gilded-stance', name: 'Gilded Stance', owner: 'aurel', cost: 2,
    element: null, targeting: TARGETING.SELF, anim: 'cast',
    hits: 0, unlockLevel: 1,
    selfStatus: { id: 'guard', turns: 3, chance: 1 },
    extraSelfStatus: { id: 'rage', turns: 3, chance: 1 },
    apGain: 1,
    desc: 'Settle into the duellist guard: Aegis and Fervour for three turns, and a point of AP back.',
  },
  'tempest-crown': {
    id: 'tempest-crown', name: 'Tempest Crown', owner: 'aurel', cost: 7,
    element: 'lightning', targeting: TARGETING.ALL_ENEMIES, anim: 'slam',
    hits: 1, power: 1.75, breakPower: 1.5, critBonus: 0.08, unlockLevel: 3,
    status: { id: 'stun', turns: 1, chance: 0.4 },
    desc: 'Calls a crown of storm over the whole field. May stun.',
  },

  // ---- Sœur Vionne — Mystic ----------------------------------------------
  'verdant-balm': {
    id: 'verdant-balm', name: 'Verdant Balm', owner: 'vionne', cost: 3,
    element: null, targeting: TARGETING.ALL_ALLIES, anim: 'cast',
    hits: 0, healPower: 0.62, unlockLevel: 1,
    status: { id: 'regen', turns: 3, chance: 1 },
    desc: 'Green light over the whole expedition: restores health and leaves Verdure behind.',
  },
  'frostbind': {
    id: 'frostbind', name: 'Frostbind', owner: 'vionne', cost: 4,
    element: 'ice', targeting: TARGETING.ENEMY, anim: 'cast',
    hits: 1, power: 1.85, breakPower: 1.3, unlockLevel: 1,
    status: { id: 'slow', turns: 3, chance: 1 },
    extraStatus: { id: 'sunder', turns: 3, chance: 0.7 },
    desc: 'Locks a foe in painted frost. Always Slows, usually Sunders their guard.',
  },
  'hexmark': {
    id: 'hexmark', name: 'Hexmark', owner: 'vionne', cost: 2,
    element: 'void', targeting: TARGETING.ENEMY, anim: 'cast',
    hits: 1, power: 0.7, breakPower: 0.6, unlockLevel: 1,
    status: { id: 'mark', turns: 4, chance: 1 },
    extraStatus: { id: 'weaken', turns: 3, chance: 1 },
    desc: 'Brands a target: they take more damage and deal less.',
  },
  'requiem-veil': {
    id: 'requiem-veil', name: 'Requiem Veil', owner: 'vionne', cost: 5,
    element: null, targeting: TARGETING.ALL_ALLIES, anim: 'cast',
    hits: 0, unlockLevel: 3, cleanse: true,
    status: { id: 'shell', turns: 3, chance: 1, shield: 180 },
    desc: 'A gilded shell over every ally, absorbing damage, and every affliction lifted.',
  },

  // ---- Corvin Roux — Marksman --------------------------------------------
  'fan-of-shards': {
    id: 'fan-of-shards', name: 'Fan of Shards', owner: 'corvin', cost: 3,
    element: 'physical', targeting: TARGETING.ENEMY, anim: 'flurry',
    hits: 5, power: 0.6, breakPower: 0.7, critBonus: 0.14, unlockLevel: 1,
    desc: 'Five painted shards thrown in a fan. Each can crit independently.',
  },
  'ember-volley': {
    id: 'ember-volley', name: 'Ember Volley', owner: 'corvin', cost: 4,
    element: 'fire', targeting: TARGETING.ALL_ENEMIES, anim: 'shot',
    hits: 1, power: 1.3, breakPower: 0.9, unlockLevel: 1,
    status: { id: 'burn', turns: 3, chance: 0.85 },
    desc: 'A spray of ember rounds across the enemy line. Usually ignites.',
  },
  'hunters-mark': {
    id: 'hunters-mark', name: "Hunter's Mark", owner: 'corvin', cost: 2,
    element: null, targeting: TARGETING.ENEMY, anim: 'aim',
    hits: 0, unlockLevel: 1,
    status: { id: 'mark', turns: 3, chance: 1 },
    selfStatus: { id: 'haste', turns: 3, chance: 1 },
    desc: 'Ranges a target and quickens Corvin. The marked take heavier hits.',
  },
  'crimson-fusillade': {
    id: 'crimson-fusillade', name: 'Crimson Fusillade', owner: 'corvin', cost: 6,
    element: 'fire', targeting: TARGETING.ENEMY, anim: 'flurry',
    hits: 8, power: 0.52, breakPower: 0.55, critBonus: 0.1, unlockLevel: 3,
    status: { id: 'bleed', turns: 3, chance: 0.6 },
    desc: 'Eight rounds emptied into one target without pause.',
  },
};

/** The shared gradient ultimate, unlocked by filling the party meter. */
export const ULTIMATE = {
  id: 'requiem-dawn', name: 'Requiem of the Gilded Dawn',
  element: 'light', targeting: TARGETING.ALL_ENEMIES, anim: 'ultimate',
  hits: 3, power: 2.3, breakPower: 2.4, critBonus: 0.2,
  healPower: 0.55, cleanse: true,
  desc: 'The whole expedition strikes as one. Three passes of light, then the party is mended.',
};

export const ITEMS = {
  'chroma-vial': {
    id: 'chroma-vial', name: 'Chroma Vial', targeting: TARGETING.ALLY,
    uses: 3, healFlat: 320, anim: 'item',
    desc: 'Restores 320 health to one ally.',
  },
  'lumina-tonic': {
    id: 'lumina-tonic', name: 'Lumina Tonic', targeting: TARGETING.ALLY,
    uses: 2, apGain: 4, anim: 'item',
    desc: 'Grants 4 Action Points to one ally.',
  },
  'reliquary': {
    id: 'reliquary', name: 'Reliquary', targeting: TARGETING.DEAD_ALLY,
    uses: 1, reviveFraction: 0.5, anim: 'item',
    desc: 'Returns a fallen ally at half health.',
  },
};

// ---------------------------------------------------------------------------
// Plan construction
// ---------------------------------------------------------------------------

function move(skill, powerScale = 1) {
  return {
    power: (skill.power || 1) * powerScale,
    element: skill.element || 'physical',
    critBonus: skill.critBonus || 0,
    breakPower: skill.breakPower || 1,
    ignoreDef: !!skill.ignoreDef,
  };
}

function pushStatus(steps, target, spec, delay) {
  if (!spec || !target) return;
  steps.push({
    kind: 'status', target, id: spec.id, turns: spec.turns || 3,
    chance: spec.chance === undefined ? 1 : spec.chance,
    power: spec.power || 1, shield: spec.shield || 0, delay,
  });
}

/**
 * Turn a skill and its chosen targets into an ordered, timed step list.
 * @param {object} skill
 * @param {object} caster
 * @param {object[]} targets already resolved by the targeting rules
 * @returns {{steps:Array, duration:number, anim:string}}
 */
export function buildPlan(skill, caster, targets) {
  const steps = [];
  const hitCount = skill.hits || 0;
  const isMulti = hitCount > 1;
  const stride = isMulti ? (hitCount > 5 ? 0.11 : 0.16) : 0;
  let t = 0.28;

  if (hitCount > 0) {
    for (let h = 0; h < hitCount; h++) {
      // Multi-hit skills ramp: the last strike lands harder than the first.
      const scale = isMulti ? 0.86 + (h / Math.max(1, hitCount - 1)) * 0.34 : 1;
      // The swing is authored ahead of the impact so the animation's strike
      // frame coincides with the damage rather than trailing it.
      steps.push({
        kind: 'swing', target: targets[0], delay: Math.max(0, t - 0.18),
        anim: skill.anim || 'slash', hitIndex: h, hitCount,
      });
      for (let ti = 0; ti < targets.length; ti++) {
        steps.push({
          kind: 'hit',
          target: targets[ti],
          move: move(skill, scale),
          delay: t + ti * 0.05,
          hitIndex: h,
          hitCount,
          anim: skill.anim || 'slash',
          last: h === hitCount - 1,
        });
      }
      t += stride;
    }
    t += 0.2;
  }

  if (skill.healPower) {
    for (const tg of targets) {
      steps.push({ kind: 'heal', target: tg, power: skill.healPower, delay: t });
      t += 0.08;
    }
    t += 0.1;
  }

  if (skill.healFlat) {
    for (const tg of targets) {
      steps.push({ kind: 'heal', target: tg, flat: skill.healFlat, delay: t });
      t += 0.08;
    }
  }

  if (skill.cleanse) {
    for (const tg of targets) steps.push({ kind: 'cleanse', target: tg, delay: t });
    t += 0.12;
  }

  if (skill.reviveFraction) {
    for (const tg of targets) {
      steps.push({ kind: 'revive', target: tg, fraction: skill.reviveFraction, delay: t });
    }
    t += 0.3;
  }

  if (skill.apGain) {
    for (const tg of targets) {
      steps.push({ kind: 'ap', target: tg, amount: skill.apGain, delay: t });
    }
  }

  const statusDelay = t;
  for (const tg of targets) {
    pushStatus(steps, tg, skill.status, statusDelay);
    pushStatus(steps, tg, skill.extraStatus, statusDelay + 0.05);
  }
  pushStatus(steps, caster, skill.selfStatus, statusDelay);
  pushStatus(steps, caster, skill.extraSelfStatus, statusDelay + 0.05);

  const duration = Math.max(0.9, statusDelay + 0.55);
  return { steps, duration, anim: skill.anim || 'slash' };
}

/** Skills a character currently has access to, given their level. */
export function skillsFor(charId, level) {
  return Object.values(SKILLS)
    .filter((s) => s.owner === charId && (s.unlockLevel || 1) <= level)
    .sort((a, b) => (a.unlockLevel || 1) - (b.unlockLevel || 1) || a.cost - b.cost);
}

/** Skills that become available exactly at `level`, for the level-up screen. */
export function skillsUnlockedAt(charId, level) {
  return Object.values(SKILLS).filter((s) => s.owner === charId && s.unlockLevel === level);
}
