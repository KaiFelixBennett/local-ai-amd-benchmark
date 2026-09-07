// reaction-system.js — THE signature: real-time parry/dodge windows, telegraph timing,
// multi-hit combo sequencing, feints, grab (unblockable), perfect-parry counter, flow streak.
// Wall-clock based throughout (uses `now` seconds), never frame-count.
import { WindowTiming } from '../core/easing.js';
import { Evt, EventBus } from '../core/events.js';

export const ReactionResult = Object.freeze({
    PARRY_PERFECT: 'parry-perfect',
    PARRY_OK: 'parry-ok',
    DODGE: 'dodge',
    FAIL: 'fail',
    UNBLOCKABLE_MISSED: 'unblockable-missed',
});

export class ReactionSystem {
    constructor(bus = new EventBus(), clock = () => performance.now() / 1000) {
        this.bus = bus;
        this.clock = clock;
        this.active = false;
        this.sequence = [];            // queued hits (each with its own window)
        this.index = 0;
        this.waiting = null;           // current WindowTiming
        this.streak = 0;               // flow meter
        this.maxStreak = 0;
        this.guard = null;             // the party member reacting right now
        this.onResult = null;          // callback (result, index, sequenceId)
        this._enabled = true;
        this._pendingFinish = null;
        this._inputHeld = false;
        this.lastInput = null;
        this._lastResult = null;
    }

    // Begin a reaction sequence for guard vs the given hits.
    // hits: array of {pattern, target, attacker, window} — window is a WindowTiming.
    beginSequence(guard, hits) {
        this.guard = guard;
        this.sequence = hits;
        this.index = 0;
        this.active = true;
        this._prepareNext();
    }

    _prepareNext() {
        if (this.index >= this.sequence.length) {
            this.active = false;
            if (this.onResult) this.onResult(null, this.index, 'done');
            return;
        }
        const hit = this.sequence[this.index];
        this.waiting = new WindowTiming({
            start: hit.t_start || 0,
            end: hit.t_end,
            duration: hit.t_end - (hit.t_start || 0),
            kind: hit.pattern && hit.pattern.unblockable ? 'dodge' : 'parry',
        });
        this.waiting.pattern = hit.pattern;
        this.waiting.attacker = hit.attacker;
        this.waiting.target = hit.target;
        this.bus.emit(Evt.ATTACK_TELEGRAPH, {
            attacker: hit.attacker, target: hit.target,
            pattern: hit.pattern, window: this.waiting,
        });
    }

    // Update during the reaction phase. `now` is wall clock (seconds).
    update(now, dt) {
        if (!this.active || !this.waiting) return;
        const w = this.waiting;
        const pattern = w.pattern || {};

        // Feint handling: if the pattern feints, an early input is a FAIL.
        const feintUntil = pattern.feintDelay || 0;
        const feintWindowOpen = now < w.end - feintUntil - 0.001;

        // Allowed input check
        if (this._inputHeld && !w.hitResolved) {
            this._inputHeld = false;
            this._handleInput(now, w, pattern, feintWindowOpen);
        }

        // Window result resolution:
        //   - dodge/parry window closes shortly after end
        if (w.isOver(now)) {
            // missed — resolve as fail
            const res = this._resolveMiss(w, pattern);
            this._advance(res, now);
        }

        // if the window was resolved by input, advance to the next hit (or finish)
        if (w.hitResolved && this.waiting === w) {
            this._advance(this._lastResult, now);
        }
    }

    _handleInput(now, w, pattern, feintWas) {
        // inputs: 'parry' (default) or 'dodge'
        const input = this.lastInput || 'parry';
        this.lastInput = null;

        if (pattern.unblockable) {
            // Grab: only dodge works. Parry input = fail (mistimed block).
            if (input === 'parry') {
                this._resolve(w, ReactionResult.FAIL, now);
                return;
            }
            if (w.dodgeOpen(now, 0.08, 0.3)) {
                this._resolve(w, ReactionResult.DODGE, now);
                this.bus.emit(Evt.DODGE_SUCCESS, { guarder: this.guard });
            } else {
                this._resolve(w, ReactionResult.FAIL, now);
            }
            return;
        }

        if (feintWas) {
            this._resolve(w, ReactionResult.FAIL, now);
            this.bus.emit(Evt.PARRY_MISS, { guarder: this.guard, kind: 'feint' });
            return;
        }

        if (input === 'parry') {
            if (w.parryOpen(now, 0.15)) {
                this.streak += 1;
                this.maxStreak = Math.max(this.maxStreak, this.streak);
                this._resolve(w, ReactionResult.PARRY_PERFECT, now);
                this.bus.emit(Evt.PARRY_SUCCESS, { guarder: this.guard, frame: 'perfect', streak: this.streak });
            } else if (w.dodgeOpen(now, 0.1, 0.22)) {
                // slightly early parry reads as dodge instead
                this.streak = 0;
                this._resolve(w, ReactionResult.DODGE, now);
                this.bus.emit(Evt.DODGE_SUCCESS, { guarder: this.guard });
            } else {
                this.streak = 0;
                this._resolve(w, ReactionResult.FAIL, now);
                this.bus.emit(Evt.PARRY_MISS, { guarder: this.guard, kind: 'early' });
            }
        } else if (input === 'dodge') {
            if (w.dodgeOpen(now, 0.1, 0.24)) {
                this.streak = 0;
                this._resolve(w, ReactionResult.DODGE, now);
                this.bus.emit(Evt.DODGE_SUCCESS, { guarder: this.guard });
            } else {
                this.streak = 0;
                this._resolve(w, ReactionResult.FAIL, now);
                this.bus.emit(Evt.PARRY_MISS, { guarder: this.guard, kind: 'late' });
            }
        }
    }

    _resolve(w, result, now) {
        w.mark(result !== ReactionResult.FAIL && result !== ReactionResult.UNBLOCKABLE_MISSED, now);
        this._lastResult = result;
        this.bus.emit(Evt.HIT_LANDED, {
            attacker: w.attacker, target: w.target,
            result,
        });
        if (this.onResult) this.onResult(result, this.index, w.pattern && w.pattern.id);
    }

    _resolveMiss(w, pattern) {
        const res = (pattern && pattern.unblockable) ? ReactionResult.UNBLOCKABLE_MISSED : ReactionResult.FAIL;
        this.streak = 0;
        this._lastResult = res;
        this.bus.emit(Evt.PARRY_MISS, { guarder: this.guard, kind: 'none' });
        if (this.onResult) this.onResult(res, this.index, pattern && pattern.id);
        return res;
    }

    _advance(res, now) {
        const wasIndex = this.index;
        this.waiting = null;
        this.index += 1;
        if (this.index < this.sequence.length) {
            this._prepareNext();
        } else {
            this.active = false;
            if (this.onResult) this.onResult(null, wasIndex, 'done');
        }
    }

    // Input API called from game.js:
    inputParry() {
        if (!this.active || !this.waiting) return;
        this.lastInput = 'parry';
        this._inputHeld = true;
    }
    inputDodge() {
        if (!this.active || !this.waiting) return;
        this.lastInput = 'dodge';
        this._inputHeld = true;
    }

    // Progress of the CURRENT window (for telegraph HUD).
    currentProgress(now) {
        return this.waiting ? this.waiting.progress(now) : 0;
    }

    get activeHit() { return this.waiting; }
    get hitsLeft() { return Math.max(0, this.sequence.length - this.index); }

    // Rich snapshot for the prompt HUD.
    snapshot(now) {
        return {
            active: this.active,
            index: this.index,
            total: this.sequence.length || 0,
            waiting: this.waiting,
            progress: this.waiting ? this.waiting.progress(now) : 0,
            enemyPos: this.waiting && this.waiting.attacker && this.waiting.attacker.pos
                ? this.waiting.attacker.pos
                : null,
            kind: this.waiting ? this.waiting.kind : null,
        };
    }

    reset() {
        this.active = false;
        this.sequence = [];
        this.index = 0;
        this.waiting = null;
        this.streak = 0;
        this._inputHeld = false;
        this.lastInput = null;
    }
}
