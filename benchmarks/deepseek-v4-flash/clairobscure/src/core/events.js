// events.js — tiny event bus for battle systems (attack-telegraphed, parry-success, turn-ended...).

export class EventBus {
    constructor() {
        this.handlers = new Map();
    }

    on(event, fn) {
        if (!this.handlers.has(event)) this.handlers.set(event, new Set());
        this.handlers.get(event).add(fn);
        return () => this.off(event, fn);
    }

    off(event, fn) {
        const set = this.handlers.get(event);
        if (set) set.delete(fn);
    }

    emit(event, payload) {
        const set = this.handlers.get(event);
        if (!set) return;
        for (const fn of Array.from(set)) {
            try { fn(payload); } catch (e) { console.error('[events] handler error on', event, e); }
        }
    }

    // Await a single emission: returns a promise resolved on next emit.
    waitFor(event, timeoutMs = 8000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.off(event, onFire);
                reject(new Error('timeout waiting for ' + event));
            }, timeoutMs);
            const onFire = (payload) => {
                clearTimeout(timer);
                this.off(event, onFire);
                resolve(payload);
            };
            this.on(event, onFire);
        });
    }

    clear() {
        this.handlers.clear();
    }
}

// Canonical battle events (payloads documented at each emit site).
export const Evt = {
    ATTACK_TELEGRAPH: 'attack-telegraphed',     // {attacker, target, pattern, window}
    PARRY_SUCCESS: 'parry-success',             // {guarder, frame: 'perfect' | 'ok', streak}
    PARRY_MISS: 'parry-miss',                   // {guarder, kind: 'early' | 'late' | 'none'}
    DODGE_SUCCESS: 'dodge-success',             // {guarder}
    COUNTER_TRIGGER: 'counter-trigger',         // {guarder, counter}  — AP refund + counter set up
    HIT_LANDED: 'hit-landed',                   // {attacker, target, amount, crit, weak}
    TURN_ENDED: 'turn-ended',                   // {actor}
    PHASE_CHANGE: 'phase-change',               // {phase}
    ULT_READY: 'ult-ready',                     // {partyUlt}
    ULT_FIRED: 'ult-fired',                     // {counter}
};
