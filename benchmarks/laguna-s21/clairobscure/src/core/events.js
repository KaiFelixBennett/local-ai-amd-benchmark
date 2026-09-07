/**
 * Tiny pub/sub event bus.
 * Events: attack-telegraphed, parry-success, dodge-success, hit-landed,
 *         turn-started, turn-ended, action-selected, victory, defeat,
 *         character-died, skill-used, status-applied, counter-triggered
 */

export class EventBus {
    constructor() {
        this._handlers = {};
    }

    on(event, callback) {
        if (!this._handlers[event]) this._handlers[event] = [];
        this._handlers[event].push(callback);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        if (!this._handlers[event]) return;
        this._handlers[event] = this._handlers[event].filter(h => h !== callback);
    }

    emit(event, data = {}) {
        if (!this._handlers[event]) return;
        for (const cb of this._handlers[event]) {
            try { cb(data); } catch (e) { console.error(`Event ${event} handler error:`, e); }
        }
    }

    clear() {
        this._handlers = {};
    }
}

export const events = new EventBus();
