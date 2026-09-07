// action-resolver.js — pure damage/AP/crit/weakness/status/stagger math.
// No THREE deps, no side effects on meshes — entity hp mutations happen in battle-system.
import { Element, StatusType, computeDamage, tickStatus, addStagger } from '../entities/skill.js';

// Basic attack: no AP cost, builds AP for the caster.
export function resolveBasicAttack(caster, target, rng) {
    const roll = rng ? rng('crit') : Math.random();
    const dmg = computeDamage(6, caster, target, {
        critRoll: roll,
        element: Element.PHYSICAL,
        weakHits: 0,
    });
    const apGain = dmg.value > 0 ? 2 : 1;
    caster.ap = Math.min(caster.apMax, caster.ap + apGain);
    return {
        type: 'basic',
        damage: dmg.value,
        crit: dmg.crit,
        weak: dmg.weak,
        apGain,
        element: Element.PHYSICAL,
    };
}

// Skill: spends caster AP, applies effects, returns result for HUD + FX.
export function resolveSkill(caster, target, skill, rng, opts = {}) {
    if (caster.ap < (skill.apCost || 0)) {
        return { type: 'skill', insufficient: true, target };
    }
    caster.ap -= skill.apCost || 0;
    const critRoll = rng ? rng('crit') : Math.random();
    const results = {
        type: 'skill',
        skillId: skill.id,
        damage: 0,
        heal: 0,
        crit: false,
        weak: false,
        events: [],
    };
    // iterate skill effects
    for (const effect of skill.effects) {
        if (effect.kind === 'damage') {
            const dmg = computeDamage(effect.base, caster, target, {
                critRoll,
                element: effect.element || Element.PHYSICAL,
                mult: effect.mult || 1,
            });
            target.hp -= dmg.value;
            results.damage += dmg.value;
            results.crit = results.crit || dmg.crit;
            results.weak = results.weak || dmg.weak;
            results.events.push({ type: 'damage', value: dmg.value, crit: dmg.crit, weak: dmg.weak });
        } else if (effect.kind === 'heal') {
            const amt = Math.max(1, Math.floor((effect.base / 100) * caster.maxHp)) + caster.level * 2;
            caster.hp = Math.min(caster.maxHp, caster.hp + amt);
            results.heal += amt;
            results.events.push({ type: 'heal', value: amt });
        } else if (effect.kind === 'buff') {
            target.buffs[effect.stat] = (target.buffs[effect.stat] || 1) * (effect.mult || 1.3);
            results.events.push({ type: 'buff', stat: effect.stat, duration: effect.duration });
        } else if (effect.kind === 'debuff') {
            if (effect.status === StatusType.STUN) {
                target.statuses.push({ type: StatusType.STUN, duration: effect.duration || 1, power: 1 });
            } else if (effect.status === StatusType.POISON) {
                target.statuses.push({ type: StatusType.POISON, duration: effect.duration || 3, power: effect.power || 1 });
            } else if (effect.status === StatusType.BURN) {
                target.statuses.push({ type: StatusType.BURN, duration: effect.duration || 3, power: effect.power || 1 });
            } else if (effect.status === StatusType.MARK) {
                target.statuses.push({ type: StatusType.MARK, duration: effect.duration || 2, power: 1 });
            } else if (effect.status === StatusType.WEAK) {
                target.statuses.push({ type: StatusType.WEAK, duration: effect.duration || 3, power: 1 });
            }
            results.events.push({ type: 'debuff', status: effect.status, duration: effect.duration });
        } else if (effect.kind === 'stagger') {
            const broke = addStagger(target, effect.power || 10);
            if (broke) results.events.push({ type: 'stagger-broken', target });
        }
    }
    return results;
}

// Free-aim ranged attack: weak-point hits add bonus damage + AP.
export function resolveRangedAttack(caster, target, weakSpotHit, rng) {
    const roll = rng ? rng('crit') : Math.random();
    const dmg = computeDamage(4, caster, target, {
        critRoll: roll,
        element: Element.PHYSICAL,
        weakHits: weakSpotHit ? 1 : 0,
    });
    const bonus = weakSpotHit ? Math.floor(dmg.value * 0.35) : 0;
    dmg.value += bonus;
    target.hp -= dmg.value;
    const apGain = (weakSpotHit ? 3 : 2);
    caster.ap = Math.min(caster.apMax, caster.ap + apGain);
    return {
        type: 'ranged',
        damage: dmg.value,
        crit: dmg.crit,
        weak: dmg.weak || weakSpotHit,
        weakSpotHit: !!weakSpotHit,
        apGain,
    };
}

// Counterattack (perfect parry trigger): free, high damage, no AP cost, builds flow.
export function resolveCounter(caster, target) {
    const dmg = computeDamage(10, caster, target, {
        element: Element.PHYSICAL,
        critRoll: 0.3,
        weakHits: 0,
    });
    target.hp -= dmg.value;
    return { type: 'counter', damage: dmg.value, crit: dmg.crit };
}

// Enemy attack application: called when a telegraphed hit lands UNPARRYED (i.e. takes damage).
export function resolveEnemyHit(attacker, target, pattern, opts = {}) {
    const dmg = computeDamage(
        pattern.damageMult ? pattern.damageMult * 4 : 4,
        attacker, target,
        {
            element: pattern.element,
            weakHits: opts.weakHits || 0,
        },
    );
    target.hp -= dmg.value;
    return { type: 'enemyHit', damage: dmg.value, crit: dmg.crit, element: pattern.element };
}

// Damage a party member directly (when parry/dodge fails or no reaction).
export function applyDirectDamage(target, amount) {
    target.hp -= amount;
    return { damage: amount };
}

// End-of-turn status tick (instead of battle-system's own).
export function tickAllStatuses(actor, clock) {
    return tickStatus(actor, clock);
}
