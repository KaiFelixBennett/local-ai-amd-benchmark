/**
 * Damage/heal/AP/crit/weakness/status math. Pure and testable.
 */

import { clamp } from '../core/rng.js';

export class ActionResolver {
    constructor(rng) {
        this.rng = rng;
    }

    /** Resolve a basic attack */
    resolveBasicAttack(actor, target) {
        const baseDmg = actor.atk;
        const def = target.def || 0;
        const variance = this.rng.nextFloat(0.9, 1.1);

        const isCrit = this.rng.chance(actor.critRate || 0.08);
        const critMult = isCrit ? 1.8 : 1.0;

        const damage = Math.max(1, Math.floor((baseDmg - def * 0.3) * variance * critMult));

        return {
            damage: damage,
            isCrit: isCrit,
            element: null,
            stagger: isCrit ? 12 : 5,
            message: isCrit ? 'Critical hit!' : 'Basic attack'
        };
    }

    /** Resolve a skill attack */
    resolveSkill(actor, target, skill) {
        if (!skill) return { damage: 0, message: 'No skill selected' };

        const baseDmg = skill.damage || actor.atk;
        const def = target.def || 0;
        const variance = this.rng.nextFloat(0.88, 1.12);

        // Elemental weakness check
        let weaknessMult = 1.0;
        if (skill.element && target.weaknesses && target.weaknesses.includes(skill.element)) {
            weaknessMult = 1.6;
        }
        if (skill.element && target.resistances && target.resistances.includes(skill.element)) {
            weaknessMult = 0.5;
        }

        const isCrit = this.rng.chance(actor.critRate || 0.08);
        const critMult = isCrit ? 1.8 : 1.0;

        // Buff/debuff modifiers
        let atkMult = 1.0;
        if (actor.buffs) {
            for (const b of actor.buffs) {
                if (b.type === 'atk_up') atkMult += b.value || 0.2;
            }
        }
        let defMult = 1.0;
        if (target.debuffs) {
            for (const d of target.debuffs) {
                if (d.type === 'def_down') defMult -= d.value || 0.2;
            }
        }

        const effectiveDef = def * defMult;
        const damage = Math.max(1, Math.floor(
            (baseDmg * atkMult - effectiveDef * 0.3) * variance * critMult * weaknessMult
        ));

        const result = {
            damage: damage,
            isCrit: isCrit,
            element: skill.element || null,
            stagger: Math.floor((skill.stagger || 8) * weaknessMult),
            message: skill.name
        };

        // Status effects
        if (skill.statusChance && this.rng.chance(skill.statusChance)) {
            result.status = {
                type: skill.statusType,
                duration: skill.statusDuration || 2,
                value: skill.statusValue || 0,
                name: skill.statusName || 'Status'
            };
        }

        // Buffs/debuffs
        if (skill.applyBuff) {
            result.buff = skill.applyBuff;
        }
        if (skill.applyDebuff) {
            result.debuff = skill.applyDebuff;
        }

        // Multi-hit skills
        if (skill.multiHit) {
            result.multiHit = skill.multiHit;
            result.damagePerHit = Math.floor(damage / skill.multiHit);
        }

        // Healing skills
        if (skill.heal) {
            const healAmount = Math.floor(
                (skill.heal + actor.mat * 0.5) * variance
            );
            result.heal = healAmount;
            result.damage = 0;
        }

        return result;
    }

    /** Resolve a ranged/free-aim attack */
    resolveRangedAttack(actor, target, weakPoint) {
        const baseDmg = Math.floor(actor.atk * 0.8);
        const def = target.def || 0;
        const variance = this.rng.nextFloat(0.9, 1.1);

        // Weak point bonus
        let weaknessMult = 1.0;
        let apBonus = 0;
        if (weakPoint) {
            weaknessMult = 2.0;
            apBonus = 2;
        }

        const isCrit = this.rng.chance((actor.critRate || 0.08) + (weakPoint ? 0.15 : 0));
        const critMult = isCrit ? 1.8 : 1.0;

        const damage = Math.max(1, Math.floor(
            (baseDmg - def * 0.2) * variance * critMult * weaknessMult
        ));

        return {
            damage: damage,
            isCrit: isCrit,
            element: null,
            stagger: weakPoint ? 20 : 8,
            apGain: apBonus,
            message: weakPoint ? 'Weak point hit!' : (isCrit ? 'Critical shot!' : 'Ranged attack')
        };
    }

    /** Resolve an item use */
    resolveItem(actor, target, item) {
        if (!item) return { damage: 0, message: 'No item' };

        switch (item.type) {
            case 'heal':
                return {
                    heal: item.value || 50,
                    message: `Used ${item.name}`
                };
            case 'ap_restore':
                return {
                    apGain: item.value || 3,
                    message: `Used ${item.name}`
                };
            case 'damage':
                const dmg = Math.max(1, Math.floor(item.value - (target.def || 0) * 0.3));
                return {
                    damage: dmg,
                    isCrit: false,
                    element: null,
                    stagger: 5,
                    message: `Used ${item.name}`
                };
            default:
                return { damage: 0, message: 'Unknown item' };
        }
    }

    /** Resolve a counterattack (after a perfect parry) */
    resolveCounterAttack(actor, target) {
        const baseDmg = Math.floor(actor.atk * 0.6);
        const variance = this.rng.nextFloat(0.95, 1.05);

        const damage = Math.max(1, Math.floor(baseDmg * variance));

        return {
            damage: damage,
            isCrit: false,
            element: null,
            stagger: 10,
            message: 'Counterattack!'
        };
    }

    /** Calculate status effect tick damage */
    calculateStatusTick(status, target) {
        if (!status) return 0;

        switch (status.type) {
            case 'burn':
            case 'poison':
                return Math.max(1, Math.floor(status.value || 5));
            case 'stun':
                return 0; // Stun just skips action
            default:
                return 0;
        }
    }

    /** Calculate ultimate damage based on flow meter */
    calculateUltimateDamage(flowMeter, actor, target) {
        const baseDmg = actor.atk * 3;
        const flowMult = 1 + (flowMeter / 100) * 2;
        const def = target.def || 0;

        return Math.max(1, Math.floor((baseDmg - def * 0.2) * flowMult));
    }
}
