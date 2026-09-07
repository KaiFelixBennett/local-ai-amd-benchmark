/**
 * THE signature reactive defense system.
 * Real-time parry/dodge timing windows, telegraph timing, multi-hit combo sequencing.
 * Wall-clock based timing for fairness.
 */

import { checkTimingWindow } from '../core/easing.js';

export const ReactionResult = {
  PARRY: 'parry',
  DODGE: 'dodge',
  MISS: 'miss',
  BLOCKED: 'blocked', // for unblockable attacks that must be dodged
};

export class ReactionSystem {
  constructor() {
    this._active = false;
    this._telegraphStartTime = 0;
    this._hitTimes = [];       // array of hit times (from telegraph start) for multi-hit
    this._currentHitIndex = 0;
    this._reactionTimes = [];  // when player reacted
    this._results = [];        // parry/dodge/miss per hit
    this._attackType = 'normal'; // 'normal', 'grab', 'feint'
    this._comboCount = 0;      // consecutive parries for streak
    this._totalParries = 0;
    this._onResult = null;     // callback when all hits resolved
    this._onHitResult = null;  // callback per-hit result
    this._onTelegraphStart = null;
    this._onComboUpdate = null;
    this._resolved = false;
  }

  /**
   * Start a telegraphed attack sequence.
   * @param {number} telegraphDuration - seconds from telegraph start to first hit
   * @param {number[]} hitDelays - delays between hits (empty = single hit)
   * @param {string} attackType - 'normal', 'grab' (unblockable), 'feint' (delayed)
   */
  startTelegraph(telegraphDuration, hitDelays = [], attackType = 'normal') {
    this._active = true;
    this._telegraphStartTime = performance.now();
    this._currentHitIndex = 0;
    this._reactionTimes = [];
    this._results = [];
    this._attackType = attackType;
    this._resolved = false;

    // Build absolute hit times
    this._hitTimes = [telegraphDuration];
    let t = telegraphDuration;
    for (const delay of hitDelays) {
      t += delay;
      this._hitTimes.push(t);
    }

    if (this._onTelegraphStart) this._onTelegraphStart(this._hitTimes.length, attackType);
  }

  /** Record a player reaction (parry or dodge input). */
  react(inputType) {
    if (!this._active || this._resolved) return null;

    const now = performance.now();
    const elapsed = (now - this._telegraphStartTime) / 1000;

    // Find the nearest upcoming hit
    const hitIdx = this._findNearestHit(elapsed);
    if (hitIdx < 0 || hitIdx < this._currentHitIndex) return null; // too early or already processed

    const hitTime = this._hitTimes[hitIdx];

    // For grab attacks, parry is blocked — only dodge works
    if (this._attackType === 'grab' && inputType === 'parry') {
      this._results.push(ReactionResult.BLOCKED);
      this._reactionTimes.push(elapsed);
      this._currentHitIndex = hitIdx + 1;
      if (this._onHitResult) this._onHitResult(ReactionResult.BLOCKED, hitIdx);
      this._checkComplete();
      return ReactionResult.BLOCKED;
    }

    // For feint attacks, early input is punished
    if (this._attackType === 'feint') {
      const feintThreshold = hitTime - 0.35;
      if (elapsed < feintThreshold) {
        // Too early — feint punished
        this._results.push(ReactionResult.MISS);
        this._reactionTimes.push(elapsed);
        this._comboCount = 0;
        if (this._onHitResult) this._onHitResult(ReactionResult.MISS, hitIdx);
        if (this._onComboUpdate) this._onComboUpdate(this._comboCount);
        return ReactionResult.MISS;
      }
    }

    const result = checkTimingWindow(elapsed, hitTime);
    this._results.push(result);
    this._reactionTimes.push(elapsed);
    this._currentHitIndex = hitIdx + 1;

    if (result === ReactionResult.PARRY) {
      this._comboCount++;
      this._totalParries++;
    } else if (result === ReactionResult.DODGE) {
      // Dodge doesn't break combo, just doesn't add
    } else {
      this._comboCount = 0;
    }

    if (this._onHitResult) this._onHitResult(result, hitIdx);
    if (this._onComboUpdate) this._onComboUpdate(this._comboCount);

    this._checkComplete();
    return result;
  }

  /** Check if time has passed for an unresolved hit (auto-miss). */
  update(deltaTime) {
    if (!this._active || this._resolved) return;

    const now = performance.now();
    const elapsed = (now - this._telegraphStartTime) / 1000;

    // Check if any upcoming hit has been missed (time passed without reaction)
    for (let i = this._currentHitIndex; i < this._hitTimes.length; i++) {
      const hitTime = this._hitTimes[i];
      // If more than dodge window has passed since the hit time, auto-miss
      if (elapsed > hitTime + 0.35) {
        this._results.push(ReactionResult.MISS);
        this._reactionTimes.push(null);
        this._comboCount = 0;
        this._currentHitIndex = i + 1;
        if (this._onHitResult) this._onHitResult(ReactionResult.MISS, i);
        if (this._onComboUpdate) this._onComboUpdate(0);
      }
    }

    // If all hits have passed
    if (this._currentHitIndex >= this._hitTimes.length) {
      this._checkComplete();
    }
  }

  _checkComplete() {
    if (this._currentHitIndex >= this._hitTimes.length) {
      this._resolved = true;
      this._active = false;
      if (this._onResult) this._onResult(this._results);
    }
  }

  _findNearestHit(elapsed) {
    let best = -1;
    let bestDist = Infinity;
    for (let i = this._currentHitIndex; i < this._hitTimes.length; i++) {
      const dist = Math.abs(elapsed - this._hitTimes[i]);
      if (dist < bestDist && dist < 0.5) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  /** Get current telegraph progress (0..1) for UI. */
  getTelegraphProgress() {
    if (!this._active) return 0;
    const now = performance.now();
    const elapsed = (now - this._telegraphStartTime) / 1000;
    const totalDuration = this._hitTimes[this._hitTimes.length - 1] + 0.35;
    return Math.min(elapsed / totalDuration, 1);
  }

  /** Get time until next hit (for UI countdown). */
  getTimeToNextHit() {
    if (!this._active || this._currentHitIndex >= this._hitTimes.length) return -1;
    const now = performance.now();
    const elapsed = (now - this._telegraphStartTime) / 1000;
    return this._hitTimes[this._currentHitIndex] - elapsed;
  }

  get comboCount() { return this._comboCount; }
  get totalParries() { return this._totalParries; }
  get isActive() { return this._active; }
  get isResolved() { return this._resolved; }
  get results() { return [...this._results]; }
  get hitCount() { return this._hitTimes.length; }
  get currentHitIndex() { return this._currentHitIndex; }
  get attackType() { return this._attackType; }

  /** Reset for next encounter. */
  reset() {
    this._active = false;
    this._resolved = false;
    this._comboCount = 0;
    this._totalParries = 0;
    this._results = [];
  }
}
