// battle-state.js — explicit combat state machine with guarded transitions.
// No scattered booleans: every meaningful transition is declared here.

export const BattlePhase = Object.freeze({
    INTRO: 'intro',               // arrival / camera sweep
    PLAYER_TURN: 'player-turn',   // action selection menu open
    ACTION_SELECT: 'action-select', // picking target / free-aim
    RESOLVING: 'resolving',       // executing a chosen action
    ENEMY_TURN: 'enemy-turn',     // enemies acting
    REACTION: 'reaction',         // real-time parry/dodge vs telegraphed hit
    COUNTER: 'counter',           // perfect-parry counter window
    ULT: 'ult',                   // cinematic party ultimate
    VICTORY: 'victory',
    DEFEAT: 'defeat',
});

// Allowed transition map: phase -> array of phases it may legally enter.
const TRANSITIONS = {
    [BattlePhase.INTRO]: [BattlePhase.PLAYER_TURN, BattlePhase.ENEMY_TURN],
    [BattlePhase.PLAYER_TURN]: [BattlePhase.ACTION_SELECT, BattlePhase.RESOLVING, BattlePhase.ENEMY_TURN, BattlePhase.VICTORY, BattlePhase.DEFEAT,
        BattlePhase.ULT],
    [BattlePhase.ACTION_SELECT]: [BattlePhase.RESOLVING, BattlePhase.PLAYER_TURN, BattlePhase.ULT],
    [BattlePhase.RESOLVING]: [BattlePhase.PLAYER_TURN, BattlePhase.ENEMY_TURN, BattlePhase.VICTORY, BattlePhase.DEFEAT, BattlePhase.ULT],
    [BattlePhase.ENEMY_TURN]: [BattlePhase.REACTION, BattlePhase.COUNTER, BattlePhase.PLAYER_TURN, BattlePhase.VICTORY, BattlePhase.DEFEAT,
        BattlePhase.REACTION],
    [BattlePhase.REACTION]: [BattlePhase.REACTION, BattlePhase.COUNTER, BattlePhase.PLAYER_TURN, BattlePhase.ENEMY_TURN, BattlePhase.VICTORY,
        BattlePhase.DEFEAT],
    [BattlePhase.COUNTER]: [BattlePhase.PLAYER_TURN, BattlePhase.ENEMY_TURN, BattlePhase.VICTORY, BattlePhase.DEFEAT, BattlePhase.REACTION,
        BattlePhase.COUNTER],
    [BattlePhase.ULT]: [BattlePhase.PLAYER_TURN, BattlePhase.ENEMY_TURN, BattlePhase.REACTION, BattlePhase.COUNTER, BattlePhase.VICTORY,
        BattlePhase.DEFEAT],
    [BattlePhase.VICTORY]: [BattlePhase.INTRO],
    [BattlePhase.DEFEAT]: [BattlePhase.INTRO],
};

export class BattleStateMachine {
    constructor() {
        this.current = BattlePhase.INTRO;
        this.history = [];
    }

    get phase() { return this.current; }

    canTransition(to) {
        return (TRANSITIONS[this.current] || []).includes(to);
    }

    transition(to) {
        if (!this.canTransition(to)) {
            if (this.current === BattlePhase.INTRO && to === BattlePhase.PLAYER_TURN) {
                // intro always may jump to player turn (used on skip)
            } else {
                console.warn(`[battle-state] illegal transition ${this.current} -> ${to} blocked`);
                return this.current;
            }
        }
        const from = this.current;
        this.current = to;
        this.history.push({ from, to, at: performance.now() });
        if (this.history.length > 64) this.history.shift();
        return to;
    }

    // Debug: render current phase at a glance.
    describe() {
        return `[${this.current}] ${this.history.slice(-4).map(h => `${h.from}>${h.to}`).join(' | ')}`;
    }
}

// Serializable projection for save/load (in-memory only — stateless restore).
export function serializeBattleState(maxHpGauges) {
    return {
        version: 1,
        at: Date.now(),
        gauges: maxHpGauges.map(g => ({ max: g.max, cur: g.cur })),
    };
}

export function deserializeBattleState(snapshot) {
    return snapshot || null;
}
