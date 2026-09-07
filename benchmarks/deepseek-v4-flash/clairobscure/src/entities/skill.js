// skill.js — skill definitions (data) + apply-effect logic. Pure, no THREE deps.

// Elemental affinities
export const Element = Object.freeze({
    PHYSICAL: 'physical',
    FIRE: 'fire',
    ICE: 'ice',
    LIGHT: 'light',
    VOID: 'void',
});

export const SkillType = Object.freeze({
    DAMAGE: 'damage',
    MULTI: 'multi',
    HEAL: 'heal',
    BUFF: 'buff',
    DEBUFF: 'debuff',
    ULT: 'ult',
});

export const StatusType = Object.freeze({
    BURN: 'burn',
    POISON: 'poison',
    STUN: 'stun',
    MARK: 'mark',
    WEAK: 'weak',       // increased damage taken
    GRIEF: 'grief',     // AP drain over time (fits the melancholy theme)
});

// Damage multipliers for attacker element vs defender affinity.
export const WEAKNESS_MULT = 1.5;
export const RESIST_MULT = 0.5;

// ---- Status effect tick logic (per-turn, in battle-system tick) ----
export function tickStatus(combatant, clockMs) {
    const out = { damage: 0, removed: [] };
    for (const st of combatant.statuses) {
        st.duration -= 1;
        if (st.duration <= 0) {
            // lose the status at 0 (0 means expired after this tick)
            out.removed.push(st.type);
            continue;
        }
        switch (st.type) {
            case StatusType.POISON:
                out.damage += Math.max(1, Math.floor(st.power * 0.01 * combatant.maxHp));
                break;
            case StatusType.BURN:
                out.damage += Math.max(1, Math.floor(st.power * 0.012 * combatant.maxHp));
                break;
            case StatusType.GRIEF:
                // drain 1 AP per tick
                combatant.ap = Math.max(0, combatant.ap - 1);
                break;
            default:
                break;
        }
    }
    // stale cleanup
    if (out.removed.length) {
        combatant.statuses = combatant.statuses.filter(s => s.duration > 0);
    }
    // STUN prevents acting while present
    out.stunned = combatant.statuses.some(s => s.type === StatusType.STUN);
    return out;
}

// ---- Stagger (break) meter ----
export function addStagger(combatant, amount) {
    combatant.stagger += amount;
    if (combatant.stagger >= combatant.maxStagger) {
        combatant.stagger = 0;
        combatant.breakWindow = 3; // turns of bonus damage window
        combatant.staggerBreak = true;
        return true; // broke
    }
    return false;
}

// ---- Effect application ----
export function applySkillEffect(skill, caster, target, opts = {}) {
    // opts: {critRoll, weakHits, isMulti, rngBoost}
    const results = { damage: 0, heal: 0, crit: false, weak: false, statuses: [], events: [] };
    const basePower = skill.power || 0;

    for (const effect of skill.effects) {
        switch (effect.kind) {
            case 'damage': {
                const dmg = computeDamage(effect.base, caster, target, {
                    critRoll: opts.critRoll,
                    weakHits: opts.weakHits,
                    multiHits: opts.multiHits,
                    mult: effect.mult,
                    element: effect.element,
                });
                results.damage += dmg.value;
                results.crit = results.crit || dmg.crit;
                results.weak = results.weak || dmg.weak;
                results.events.push({ type: 'damage', value: dmg.value, crit: dmg.crit, weak: dmg.weak });
                break;
            }
            case 'heal': {
                const amt = Math.floor((effect.base / 100) * caster.maxHp) + caster.level * 2;
                results.heal += amt;
                results.events.push({ type: 'heal', value: amt });
                break;
            }
            case 'buff': {
                target.buffs = target.buffs || {};
                target.buffs[effect.stat] = (target.buffs[effect.stat] || 1) + (effect.mult || 1.3);
                results.events.push({ type: 'buff', stat: effect.stat, duration: effect.duration, power: effect.mult });
                break;
            }
            case 'debuff': {
                addStatus(target, { type: effect.status, duration: effect.duration, power: effect.power || 1 });
                results.statuses.push(effect.status);
                results.events.push({ type: 'debuff', status: effect.status, duration: effect.duration });
                break;
            }
            case 'stagger': {
                const broke = addStagger(target, effect.power || 10);
                if (broke) results.events.push({ type: 'stagger-broken', target });
                break;
            }
            default:
                break;
        }
    }
    if (results.damage > 0) target.hp -= results.damage;
    if (results.heal > 0) caster.hp = Math.min(caster.maxHp, caster.hp + results.heal);
    return results;
}

// ---- Core damage math ----
export function computeDamage(base, attacker, defender, opts = {}) {
    const mult = opts.mult || 1;
    const element = opts.element || Element.PHYSICAL;
    const atk = attacker.atk || 10;
    const def = defender.def || 10;
    const variance = 0.92 + (opts.critRoll ? opts.critRoll : 0.5) * 0.16;

    const critChance = (attacker.crit || 0.08) + (opts.weakHits ? 0.2 : 0) + (opts.multiHits ? 0.04 : 0);
    const crit = (opts.critRoll != null ? opts.critRoll : Math.random()) < critChance;
    const critMult = attacker.critMult || 1.6;

    let base100 = base + atk * 1.6 - def * 0.8;
    base100 = Math.max(1, base100);

    // elemental affinity
    let elec = 1;
    const aff = defender.affinity || {};
    if (aff[element] === 'weak') elec *= WEAKNESS_MULT;
    else if (aff[element] === 'resist') elec *= RESIST_MULT;

    // buffs/debuffs
    let buff = 1;
    if (defender.buffs) {
        buff *= defender.buffs['def-up'] || 1;
    }
    if (attacker.buffs && attacker.buffs['atk-up']) {
        buff *= attacker.buffs['atk-up'];
    }

    // broken (stagger) window bonus
    let broken = 1;
    if (defender.breakWindow > 0) broken = 1.4;

    const shown = base100 * variance * elec * buff * broken;
    const total = Math.max(1, Math.floor(crit ? shown * critMult : shown));

    // after-hit AP gain (for basic attacks)
    if (opts.apGain) {
        // caller side decides
    }

    // consume break window if it was used (once per hit is fine)
    if (defender.breakWindow > 0) defender.breakWindow -= 1;

    return {
        value: total,
        crit,
        weak: elec > 1,
        resisted: elec < 1,
    };
}

// ---- Status helper ----
export function addStatus(target, spec) {
    const existing = target.statuses.find(s => s.type === spec.type);
    if (existing) {
        existing.duration = Math.max(existing.duration, spec.duration || 3);
        existing.power = Math.max(existing.power || 1, spec.power || 1);
    } else {
        target.statuses.push({ type: spec.type, duration: spec.duration || 3, power: spec.power || 1 });
    }
}
