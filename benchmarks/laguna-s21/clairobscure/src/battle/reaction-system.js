/**
 * THE signature reactive defense system.
 * Real-time parry/dodge timing windows, telegraph timing, multi-hit combo sequencing.
 * Wall-clock based (not frame-count based).
 */

import { checkReactionWindow } from '../core/easing.js';
import { events } from '../core/events.js';

/** Reaction types */
export const ReactionType = {
    PARRY: 'parry',
    DODGE: 'dodge',
    MISS: 'miss'
};

/** Telegraph states */
export const TelegraphState = {
    IDLE: 'idle',
    WINDUP: 'windup',
    WARNING: 'warning',
    STRIKING: 'striking',
    RECOVERING: 'recovering'
};

/**
 * A single attack hit within a combo.
 */
export class AttackHit {
    constructor(options) {
        this.delay = options.delay || 0;       // seconds after combo start this hit telegraphs
        this.windupTime = options.windupTime || 0.6; // windup phase duration
        this.warningTime = options.warningTime || 0.3; // warning phase duration
        this.hitTime = options.hitTime || 0;    // computed: when the hit lands
        this.damage = options.damage || 10;
        this.stagger = options.stagger || 5;
        this.type = options.type || 'normal';  // 'normal', 'heavy', 'grab', 'feint'
        this.element = options.element || null;
        this.isGrab = options.type === 'grab'; // grab attacks must be dodged, not parried
        this.isFeint = options.type === 'feint'; // feint may cancel
        this.cancelled = false;
    }
}

/**
 * A telegraphed enemy attack (can be a single hit or multi-hit combo).
 */
export class TelegraphedAttack {
    constructor(options) {
        this.enemy = options.enemy;
        this.target = options.target;
        this.hits = options.hits || [];
        this.totalDuration = options.totalDuration || 0;
        this.state = TelegraphState.IDLE;
        this.startTime = 0;         // wall-clock time when telegraph started
        this.currentHitIndex = 0;
        this.results = [];          // parry/dodge/miss per hit
        this.cancelled = false;
        this.feintTriggered = false;
    }

    /** Get the hit time (from combo start) for a given hit index */
    getHitTime(index) {
        if (index >= this.hits.length) return Infinity;
        const hit = this.hits[index];
        return hit.delay + hit.windupTime + hit.warningTime;
    }
}

/**
 * Manages the real-time reactive defense layer.
 */
export class ReactionSystem {
    constructor() {
        this.activeTelegraph = null;
        this.state = TelegraphState.IDLE;
        this.parryPressed = false;
        this.dodgePressed = false;
        this.lastInputTime = 0;
        this.comboCounter = 0;
        this.consecutiveParries = 0;
        this.flowMeter = 0; // 0-100, rewards consecutive clean parries
        this.flashTimer = 0;
        this.flashType = null;
    }

    /**
     * Start a telegraphed attack sequence.
     * @param {TelegraphedAttack} attack
     */
    startTelegraph(attack) {
        this.activeTelegraph = attack;
        this.state = TelegraphState.WINDUP;
        this.currentHitIndex = 0;
        this.results = [];
        this.comboCounter = 0;
        attack.startTime = performance.now();
        attack.state = TelegraphState.WINDUP;
        attack.cancelled = false;
        attack.feintTriggered = false;

        events.emit('attack-telegraphed', {
            enemy: attack.enemy,
            target: attack.target,
            hits: attack.hits.length,
            type: attack.hits[0]?.type || 'normal'
        });
    }

    /**
     * Process a player input (parry or dodge key press).
     * Returns the reaction result or null if no telegraph active.
     */
    processInput(inputType) {
        if (!this.activeTelegraph || this.activeTelegraph.cancelled) return null;
        if (this.state === TelegraphState.RECOVERING) return null;

        const now = performance.now();
        this.lastInputTime = now;
        const elapsed = (now - this.activeTelegraph.startTime) / 1000;

        const hitIndex = this.currentHitIndex;
        if (hitIndex >= this.activeTelegraph.hits.length) return null;

        const hit = this.activeTelegraph.hits[hitIndex];
        if (hit.cancelled) {
            // Feint cancelled this hit
            return null;
        }

        const hitTime = this.activeTelegraph.getHitTime(hitIndex);

        // For grab attacks, parry is invalid - must dodge
        if (hit.isGrab && inputType === 'parry') {
            events.emit('grab-warning', { hit });
            return { result: ReactionType.MISS, hitIndex, hit };
        }

        const reaction = checkReactionWindow(elapsed, hitTime);

        // For grab attacks, only dodge works
        if (hit.isGrab && reaction.result !== 'parry') {
            if (reaction.result === 'dodge') {
                return { result: ReactionType.DODGE, hitIndex, hit, timing: reaction.timing };
            }
            return { result: ReactionType.MISS, hitIndex, hit };
        }

        // Parry converts to miss if too early on feint
        if (hit.isFeint && elapsed < hitTime - 0.35) {
            return { result: ReactionType.MISS, hitIndex, hit, reason: 'early_feint' };
        }

        return { result: reaction.result, hitIndex, hit, timing: reaction.timing };
    }

    /**
     * Update per frame - advance telegraph state.
     * @param {number} dt - delta time in seconds
     */
    update(dt) {
        if (!this.activeTelegraph || this.activeTelegraph.cancelled) return;

        const elapsed = (performance.now() - this.activeTelegraph.startTime) / 1000;
        const hitIndex = this.currentHitIndex;

        if (hitIndex >= this.activeTelegraph.hits.length) {
            this.completeTelegraph();
            return;
        }

        const hit = this.activeTelegraph.hits[hitIndex];

        // Check for feint cancellation
        if (hit.isFeint && !hit.cancelled) {
            const hitTime = this.activeTelegraph.getHitTime(hitIndex);
            // Feint cancels at the last moment if player hasn't reacted
            if (elapsed >= hitTime - 0.15 && this.results.length <= hitIndex) {
                // Feint still proceeds - it's a feint in timing, not in existence
            }
        }

        // Auto-advance state based on elapsed time
        const hitStartTime = hit.delay;
        const windupEnd = hitStartTime + hit.windupTime;
        const hitLandTime = hitStartTime + hit.windupTime + hit.warningTime;

        if (elapsed < windupEnd) {
            this.state = TelegraphState.WINDUP;
            this.activeTelegraph.state = TelegraphState.WINDUP;
        } else if (elapsed < hitLandTime) {
            this.state = TelegraphState.WARNING;
            this.activeTelegraph.state = TelegraphState.WARNING;
        } else if (elapsed < hitLandTime + 0.3) {
            this.state = TelegraphState.STRIKING;
            this.activeTelegraph.state = TelegraphState.STRIKING;

            // Auto-miss if no input received in time
            if (this.results.length <= hitIndex) {
                const reaction = { result: ReactionType.MISS, hitIndex, hit };
                this.results.push(reaction);
                this.onHitResult(reaction);
            }
        }

        // Check if we should advance to next hit
        if (elapsed >= hitLandTime + 0.4 && this.results.length > hitIndex) {
            this.currentHitIndex++;
            if (this.currentHitIndex < this.activeTelegraph.hits.length) {
                this.state = TelegraphState.WINDUP;
                this.activeTelegraph.state = TelegraphState.WINDUP;
            }
        }

        // Update flash timer
        if (this.flashTimer > 0) {
            this.flashTimer -= dt;
            if (this.flashTimer <= 0) {
                this.flashType = null;
            }
        }
    }

    /**
     * Apply the result of a reaction to a hit.
     */
    onHitResult(reaction) {
        const { result, hitIndex, hit } = reaction;
        const telegraph = this.activeTelegraph;

        switch (result) {
            case ReactionType.PARRY:
                this.comboCounter++;
                this.consecutiveParries++;
                this.flowMeter = Math.min(100, this.flowMeter + 15);
                this.flashType = 'parry';
                this.flashTimer = 0.3;
                events.emit('parry-success', {
                    enemy: telegraph.enemy,
                    target: telegraph.target,
                    hitIndex,
                    combo: this.comboCounter,
                    flow: this.flowMeter
                });
                break;

            case ReactionType.DODGE:
                this.comboCounter++;
                this.flowMeter = Math.min(100, this.flowMeter + 5);
                this.flashType = 'dodge';
                this.flashTimer = 0.2;
                events.emit('dodge-success', {
                    enemy: telegraph.enemy,
                    target: telegraph.target,
                    hitIndex
                });
                break;

            case ReactionType.MISS:
                this.consecutiveParries = 0;
                this.flowMeter = Math.max(0, this.flowMeter - 10);
                this.flashType = 'hit';
                this.flashTimer = 0.2;
                events.emit('hit-landed', {
                    enemy: telegraph.enemy,
                    target: telegraph.target,
                    hitIndex,
                    damage: hit.damage,
                    stagger: hit.stagger
                });
                break;
        }
    }

    /**
     * Complete the telegraph sequence and return summary.
     */
    completeTelegraph() {
        this.state = TelegraphState.RECOVERING;
        if (this.activeTelegraph) {
            this.activeTelegraph.state = TelegraphState.RECOVERING;
        }

        const parryCount = this.results.filter(r => r.result === ReactionType.PARRY).length;
        const dodgeCount = this.results.filter(r => r.result === ReactionType.DODGE).length;
        const missCount = this.results.filter(r => r.result === ReactionType.MISS).length;

        const summary = {
            parries: parryCount,
            dodges: dodgeCount,
            misses: missCount,
            totalHits: this.results.length,
            perfect: missCount === 0 && parryCount > 0,
            flow: this.flowMeter
        };

        events.emit('telegraph-complete', summary);

        // Reset after brief recovery
        setTimeout(() => {
            this.activeTelegraph = null;
            this.state = TelegraphState.IDLE;
        }, 300);

        return summary;
    }

    /**
     * Cancel current telegraph (e.g., enemy dies).
     */
    cancelTelegraph() {
        if (this.activeTelegraph) {
            this.activeTelegraph.cancelled = true;
        }
        this.activeTelegraph = null;
        this.state = TelegraphState.IDLE;
    }

    /**
     * Check if the reaction system is currently active.
     */
    get isActive() {
        return this.state !== TelegraphState.IDLE;
    }

    /**
     * Get current telegraph progress for UI display.
     */
    getProgress() {
        if (!this.activeTelegraph) return null;
        const now = performance.now();
        const elapsed = (now - this.activeTelegraph.startTime) / 1000;
        const hitIndex = this.currentHitIndex;
        if (hitIndex >= this.activeTelegraph.hits.length) return null;

        const hit = this.activeTelegraph.hits[hitIndex];
        const hitLandTime = this.activeTelegraph.getHitTime(hitIndex);
        const timeToHit = Math.max(0, hitLandTime - elapsed);

        return {
            elapsed,
            hitIndex,
            totalHits: this.activeTelegraph.hits.length,
            timeToHit,
            state: this.state,
            hitType: hit.type,
            isGrab: hit.isGrab
        };
    }
}
