/**
 * Initiative ordering and the upcoming-turns preview.
 *
 * Uses an "action gauge" model rather than a fixed round order: every
 * combatant accumulates readiness proportional to their speed, and whoever
 * crosses the threshold first acts. Speed buffs and slows therefore visibly
 * re-order the preview mid-battle, which is the point of showing it.
 *
 * The preview is produced by simulating the gauge forward on a cloned state,
 * so it never disturbs the live battle.
 */

import { effectiveSpd } from './action-resolver.js';

const THRESHOLD = 1000;

export class TurnQueue {
  constructor(rng) {
    this.rng = rng;
    this.entries = [];   // { combatant, gauge }
    this.turnNumber = 0;
    this.current = null;
  }

  /** Seed the queue. Small random offsets break ties deterministically. */
  reset(combatants) {
    this.entries = combatants.map((c) => ({
      combatant: c,
      // Faster units start with more of the gauge already filled.
      gauge: this.rng.range(0, 220) + effectiveSpd(c) * 1.4,
    }));
    this.turnNumber = 0;
    this.current = null;
  }

  add(combatant, gaugeFraction = 0) {
    this.entries.push({ combatant, gauge: THRESHOLD * gaugeFraction });
  }

  remove(combatant) {
    const i = this.entries.findIndex((e) => e.combatant === combatant);
    if (i >= 0) this.entries.splice(i, 1);
  }

  get living() {
    return this.entries.filter((e) => e.combatant.alive);
  }

  /**
   * Advance the gauge until somebody is ready, then return them.
   * Returns null if nobody is alive.
   */
  next() {
    const pool = this.living;
    if (pool.length === 0) return null;

    let guard = 0;
    while (guard++ < 10000) {
      let ready = null;
      for (const e of pool) {
        if (e.gauge >= THRESHOLD && (!ready || e.gauge > ready.gauge)) ready = e;
      }
      if (ready) {
        ready.gauge -= THRESHOLD;
        this.turnNumber++;
        this.current = ready.combatant;
        return ready.combatant;
      }
      for (const e of pool) e.gauge += Math.max(1, effectiveSpd(e.combatant));
    }
    return pool[0].combatant;
  }

  /**
   * Peek at the next `count` actors without mutating live state.
   * @returns {Array<{combatant:object, turnsAway:number}>}
   */
  preview(count = 7) {
    const sim = this.living.map((e) => ({ c: e.combatant, gauge: e.gauge }));
    const out = [];
    let guard = 0;
    while (out.length < count && guard++ < 20000) {
      let ready = null;
      for (const s of sim) {
        if (s.gauge >= THRESHOLD && (!ready || s.gauge > ready.gauge)) ready = s;
      }
      if (ready) {
        ready.gauge -= THRESHOLD;
        out.push({ combatant: ready.c, turnsAway: out.length });
      } else {
        for (const s of sim) s.gauge += Math.max(1, effectiveSpd(s.c));
      }
    }
    return out;
  }

  /** Push a combatant's next turn back (used by heavy skills and stagger). */
  delay(combatant, fraction = 0.5) {
    const e = this.entries.find((x) => x.combatant === combatant);
    if (e) e.gauge -= THRESHOLD * fraction;
  }

  /** Pull a combatant's next turn forward (haste effects, counter rewards). */
  hasten(combatant, fraction = 0.35) {
    const e = this.entries.find((x) => x.combatant === combatant);
    if (e) e.gauge += THRESHOLD * fraction;
  }
}
