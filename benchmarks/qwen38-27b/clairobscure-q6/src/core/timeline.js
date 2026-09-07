/**
 * core/timeline.js — The playback clock for the whole encounter.
 *
 * Every combat timestamp (telegraph starts, hit landings, parry/dodge window
 * centers) is expressed in LOGICAL timeline milliseconds. The timeline maps
 * real wall-clock time (performance.now()) into logical time, applying a
 * `timeScale` so the game can drop into slow motion on a perfect parry
 * without ever desyncing input from the events it must react to.
 *
 * Key property: player inputs are ALSO recorded through `now()`, so a key
 * pressed during slow-mo is stamped in the same domain as the window it is
 * judged against. This keeps timing windows wall-clock fair at any frame
 * rate and any timeScale.
 *
 * The game calls `update()` once per frame. It is delta-based (not a
 * frame counter) and clamps large deltas (tab was backgrounded) so the
 * encounter never jumps a full second on focus return.
 */
import { clamp } from './rng.js';

export class Timeline {
  constructor() {
    this._origin = 0;       // logical time at the last reset
    this._t = 0;            // current logical time (ms)
    this._lastRaw = 0;      // last performance.now() we integrated from
    this.timeScale = 1;
    this._reset();
  }

  _reset() {
    this._t = 0;
    this._origin = 0;
    this._lastRaw = performance.now();
  }

  /** Call once per frame. */
  update() {
    const raw = performance.now();
    let delta = raw - this._lastRaw;
    this._lastRaw = raw;
    // Clamp so a backgrounded tab doesn't fast-forward the battle.
    delta = clamp(delta, 0, 100);
    this._t += delta * this.timeScale;
    return this._t;
  }

  /** Current logical time in ms since the encounter (re)started. */
  now() {
    return this._t;
  }

  /**
   * Absolute logical time at which an offset-from-now occurs.
   * e.g. `const hitAt = tl.absIn(420);` means "420ms from now."
   */
  absIn(offsetMs) {
    return this._t + offsetMs;
  }

  /** Set the playback scale. 1 = real time, 0.3 = dramatic slow-mo. */
  setTimescale(s) {
    this.timeScale = clamp(s, 0.05, 2.5);
  }

  get isSlowed() {
    return this.timeScale < 0.9;
  }

  /** Convert a raw performance.now() timestamp (e.g. captured at the moment of
   * a keydown event, between frames) into logical time. Accurate as long as
   * timeScale doesn't change mid-frame — which is fine for input judging.
   */
  rawToLogical(rawNow) {
    return this._t + Math.max(0, rawNow - this._lastRaw) * this.timeScale;
  }

  /** Hard reset the clock (new encounter / restart). */
  reset() {
    this._reset();
  }
}
