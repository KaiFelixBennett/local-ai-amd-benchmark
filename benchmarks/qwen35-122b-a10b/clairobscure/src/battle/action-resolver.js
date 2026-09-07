import { getCombatRNG } from '../core/rng.js';

// Pure, testable damage/heal/AP calculation functions

export function calculateDamage(attacker, defender, baseDamage, options = {}) {
  const {
    isCrit = false,
    isWeakness = false,
    isResisted = false,
    statusModifiers = {}
  } = options;

  const rng = getCombatRNG();

  // Base damage variance (±10%)
  const variance = rng.float(0.9, 1.1);
  let damage = baseDamage * variance;

  // Critical hit multiplier
  if (isCrit) {
    damage *= 2.0;
  }

  // Weakness/resistance
  if (isWeakness) {
    damage *= 1.5;
  } else if (isResisted) {
    damage *= 0.5;
  }

  // Status modifiers (burn, poison, etc.)
  Object.entries(statusModifiers).forEach(([status, multiplier]) => {
    damage *= multiplier;
  });

  // Attacker attack stat vs defender defense
  const statMultiplier = attacker.stats.attack / Math.max(1, defender.stats.defense * 0.5);
  damage *= statMultiplier;

  return Math.max(1, Math.round(damage));
}

export function calculateHeal(caster, baseHeal) {
  const rng = getCombatRNG();
  
  // Healing variance (±15%)
  const variance = rng.float(0.85, 1.15);
  let heal = baseHeal * variance;

  // Scale with magic stat
  const statMultiplier = caster.stats.magic / 20;
  heal *= Math.max(0.8, statMultiplier);

  return Math.max(1, Math.round(heal));
}

export function calculateAPGain(actionType) {
  const gains = {
    basicAttack: 1,
    skill: -1, // Skills cost AP
    parry: 2,  // Perfect parry grants bonus AP
    dodge: 0,
    weakPointHit: 1.5
  };
  return gains[actionType] || 0;
}

export function calculateCritChance(attacker) {
  const baseCrit = 0.05; // 5% base
  const statBonus = attacker.stats.crit / 200; // Up to 25% from stats
  return Math.min(0.5, baseCrit + statBonus);
}

export function checkCriticalHit(attacker) {
  const critChance = calculateCritChance(attacker);
  const rng = getCombatRNG();
  return rng.chance(critChance);
}

export function determineWeaknessResist(element, defender) {
  if (!element || !defender.weaknesses) {
    return 'normal';
  }

  const weaknesses = defender.weaknesses;
  const resistances = defender.resistances || {};

  if (weaknesses.includes(element)) {
    return 'weakness';
  } else if (resistances.includes && resistances.includes(element)) {
    return 'resisted';
  }

  return 'normal';
}

export function applyStatusEffect(target, statusType, duration) {
  const rng = getCombatRNG();
  
  // Check if already has this status
  const existingIndex = target.statusEffects.findIndex(s => s.type === statusType);
  if (existingIndex > -1) {
    // Refresh duration
    target.statusEffects[existingIndex].duration = duration;
    return { applied: false, refreshed: true };
  }

  // Add new status
  target.statusEffects.push({
    type: statusType,
    duration: duration,
    stacks: statusType === 'burn' || statusType === 'poison' ? rng.range(2, 4) : 1
  });

  return { applied: true, refreshed: false };
}

export function processStatusEffects(entity, deltaTime) {
  const results = [];
  
  entity.statusEffects = entity.statusEffects.filter(status => {
    // Tick damage/healing effects
    if (status.type === 'burn' || status.type === 'poison') {
      const tickDamage = Math.round(entity.stats.maxHP * 0.05);
      results.push({
        type: status.type,
        effect: 'damage',
        value: tickDamage,
        target: entity.id
      });
    } else if (status.type === 'regen') {
      const tickHeal = Math.round(entity.stats.maxHP * 0.03);
      results.push({
        type: status.type,
        effect: 'heal',
        value: tickHeal,
        target: entity.id
      });
    }

    // Decrease duration (time-based)
    status.duration -= deltaTime;
    
    return status.duration > 0;
  });

  return results;
}

export function calculateStaggerDamage(attacker, defender) {
  // Staggered enemies take 50% more damage
  if (defender.isStaggered) {
    return 1.5;
  }
  return 1.0;
}

export function applyDamage(entity, amount, source = null) {
  const actualDamage = Math.max(1, amount);
  entity.hp = Math.max(0, entity.hp - actualDamage);
  
  return {
    damage: actualDamage,
    isDead: entity.hp <= 0,
    remainingHP: entity.hp
  };
}

export function applyHeal(entity, amount) {
  const actualHeal = Math.min(amount, entity.stats.maxHP - entity.hp);
  entity.hp += actualHeal;
  
  return {
    heal: actualHeal,
    capped: actualHeal < amount,
    remainingHP: entity.hp
  };
}

export function calculateActionCost(skill) {
  return skill.apCost || 1;
}

export function canUseSkill(entity, skill) {
  const cost = calculateActionCost(skill);
  return entity.ap >= cost && !entity.isStunned;
}

// Execute a complete attack action
export function executeAttack(attacker, defender, options = {}) {
  const {
    isCrit = checkCriticalHit(attacker),
    element = null,
    baseDamage = attacker.stats.attack * 1.2 // Increased base damage for more impact
  } = options;

  const weaknessResist = determineWeaknessResist(element, defender);
  const damage = calculateDamage(attacker, defender, baseDamage, {
    isCrit,
    isWeakness: weaknessResist === 'weakness',
    isResisted: weaknessResist === 'resisted'
  });

  // Apply stagger to enemies on heavy hits
  if (!defender.isStaggered && damage > defender.stats.maxHP * 0.15) {
    defender.staggerMeter += damage * 0.5;
    if (defender.staggerMeter >= defender.maxStagger) {
      defender.isStaggered = true;
      defender.staggerMeter = 0;
    }
  }

  const result = applyDamage(defender, damage);

  return {
    attacker,
    defender,
    damage,
    isCrit,
    weaknessResist,
    isStaggered: defender.isStaggered,
    staggerMeter: defender.staggerMeter,
    ...result
  };
}
