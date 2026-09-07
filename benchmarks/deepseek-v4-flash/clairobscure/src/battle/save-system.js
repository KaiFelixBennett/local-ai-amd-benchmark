// save-system.js — in-memory save/load + XP/level-up + metadata (no persistence to disk).
let _save = null;

// save a snapshot of party state (stats/values only, no meshes/materials).
export function savePartyState(party) {
    _save = party.map(c => ({
        name: c.name,
        id: c.id,
        maxHp: c.maxHp,
        hp: c.hp,
        atk: c.atk,
        def: c.def,
        spd: c.spd,
        level: c.level,
        xp: c.xp,
        apMax: c.apMax,
    }));
    return _save;
}

export function loadPartyState() {
    return _save ? JSON.parse(JSON.stringify(_save)) : null;
}

export function hasSave() { return _save !== null; }

export function clearSave() { _save = null; }

// Level curve: xp needed to reach next level.
export function xpForLevel(level) {
    return Math.round(120 + (level - 1) * 70 + Math.pow(level - 1, 2) * 18);
}

// Apply granted XP across the party; returns array of level-up events.
export function grantXp(party, amount) {
    const events = [];
    for (const c of party) {
        const before = c.level;
        c.xp += amount;
        while (c.xp >= xpForLevel(c.level)) {
            c.xp -= xpForLevel(c.level);
            c.level += 1;
            c.maxHp += 8;
            c.hp = c.maxHp;
            c.atk += 2;
            c.def += 1;
            events.push({ name: c.name, level: c.level });
        }
        if (c.level > before) {
            // nothing else; heal a bit too
            c.hp = Math.min(c.hp + 30, c.maxHp);
        }
    }
    return events;
}
