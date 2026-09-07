/**
 * Skill definitions (data) + apply-effect logic.
 */

/**
 * All available skills in the game.
 */
export const SKILLS = {
    // === WARDEN (Tank) Skills ===
    shield_bash: {
        id: 'shield_bash',
        name: 'Shield Bash',
        cost: 2,
        damage: 1.2, // multiplier of atk
        element: null,
        stagger: 15,
        statusType: 'stun',
        statusChance: 0.3,
        statusDuration: 1,
        statusName: 'Stun',
        target: 'single',
        description: 'Bash with shield. May stun.',
        character: 'warden'
    },
    fortify: {
        id: 'fortify',
        name: 'Fortify',
        cost: 3,
        damage: 0,
        applyBuff: { type: 'def_up', value: 0.4, duration: 3, name: 'Fortified' },
        target: 'self',
        description: 'Raise defense for 3 turns.',
        character: 'warden'
    },
    rallying_cry: {
        id: 'rallying_cry',
        name: 'Rallying Cry',
        cost: 4,
        damage: 0,
        applyBuff: { type: 'atk_up', value: 0.3, duration: 2, name: 'Rallied' },
        target: 'party',
        description: 'Boost all allies\' ATK for 2 turns.',
        character: 'warden'
    },

    // === ARCANIST (Mage) Skills ===
    arc_bolt: {
        id: 'arc_bolt',
        name: 'Arc Bolt',
        cost: 2,
        damage: 1.8,
        element: 'lightning',
        stagger: 10,
        target: 'single',
        description: 'Lightning bolt. Strong vs weak.',
        character: 'arcanist'
    },
    frost_lance: {
        id: 'frost_lance',
        name: 'Frost Lance',
        cost: 3,
        damage: 1.5,
        element: 'ice',
        stagger: 8,
        statusType: 'stun',
        statusChance: 0.25,
        statusDuration: 1,
        statusName: 'Frozen',
        target: 'single',
        description: 'Ice lance. May freeze.',
        character: 'arcanist'
    },
    void_rift: {
        id: 'void_rift',
        name: 'Void Rift',
        cost: 5,
        damage: 2.5,
        element: 'dark',
        stagger: 20,
        target: 'all_enemies',
        description: 'Dark energy hits all foes.',
        character: 'arcanist'
    },

    // === CHRONOS (Healer) Skills ===
    mending_light: {
        id: 'mending_light',
        name: 'Mending Light',
        cost: 2,
        heal: 60,
        target: 'single',
        description: 'Heal a party member.',
        character: 'chronos'
    },
    radiant_wave: {
        id: 'radiant_wave',
        name: 'Radiant Wave',
        cost: 4,
        heal: 35,
        target: 'party',
        description: 'Heal all party members.',
        character: 'chronos'
    },
    holy_smite: {
        id: 'holy_smite',
        name: 'Holy Smite',
        cost: 3,
        damage: 1.6,
        element: 'light',
        stagger: 12,
        statusType: 'burn',
        statusChance: 0.4,
        statusDuration: 2,
        statusValue: 8,
        statusName: 'Purified',
        target: 'single',
        description: 'Holy damage. May burn.',
        character: 'chronos'
    },

    // === PHANTOM (DPS) Skills ===
    shadow_strike: {
        id: 'shadow_strike',
        name: 'Shadow Strike',
        cost: 2,
        damage: 2.0,
        element: 'dark',
        stagger: 8,
        target: 'single',
        description: 'Swift dark attack.',
        character: 'phantom'
    },
    twin_blades: {
        id: 'twin_blades',
        name: 'Twin Blades',
        cost: 3,
        damage: 1.2,
        element: null,
        multiHit: 3,
        stagger: 6,
        target: 'single',
        description: '3 rapid strikes.',
        character: 'phantom'
    },
    mark_shade: {
        id: 'mark_shade',
        name: 'Mark of Shade',
        cost: 3,
        damage: 0.5,
        element: 'dark',
        statusType: 'mark',
        statusChance: 1.0,
        statusDuration: 3,
        statusValue: 0,
        statusName: 'Shade Mark',
        applyDebuff: { type: 'def_down', value: 0.3, duration: 3, name: 'Shadowed' },
        target: 'single',
        description: 'Mark and weaken target.',
        character: 'phantom'
    }
};

/** Get skills for a character class */
export function getSkillsForCharacter(characterClass) {
    return Object.values(SKILLS).filter(s => s.character === characterClass);
}

/** Get a skill by ID */
export function getSkillById(id) {
    return SKILLS[id] || null;
}

/** Get damage multiplier for a skill (applied to actor.atk) */
export function getSkillDamageMultiplier(skill, actor) {
    if (skill.heal) return 0;
    return (skill.damage || 1.0) * actor.atk;
}
