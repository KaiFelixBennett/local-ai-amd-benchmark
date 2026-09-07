/**
 * core/easing.js — Easing curves + timing-window helpers. Pure functions,
 * no THREE / DOM dependencies. Combat windows are ALWAYS evaluated against
 * wall-clock timestamps (performance.now(), ms) so fairness does not depend
 * on frame rate.
 */

// ---------------------------------------------------------------------------
// Easing curves (t in [0,1])
// ---------------------------------------------------------------------------

export const easeLinear = (t) => t;

export const easeOutQuad = (t) => t * (2 - t);

export const easeInQuad = (t) => t * t;

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export const easeInCubic = (t) => t * t * t;

export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

export const easeInQuart = (t) => t * t * t * t;

/** Punchy overshoot used for hits, parry flashes and UI pops. */
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Anticipate-then-extend: dip below 0 before rising to 1. Wind-up feel. */
export const easeAnticipate = (t) => {
  // smoothstep-ish in, with a small negative dip early on
  const dip = Math.sin(Math.min(t * 3.2, Math.PI)) * -0.12 * (1 - t);
  return easeInOutCubic(t) + dip;
};

/**
 * Smoothstep between edges (classic GLSL). edge0/edge1 must differ.
 * Returns 0..1 regardless of t range (clamped).
 */
export function smoothstep(edge0, edge1, t) {
  const x = Math.min(1, Math.max(0, (t - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

/** Hermite smoothstep on 0..1 input. */
export const smoother = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

// ---------------------------------------------------------------------------
// Timing windows — the heart of the reactive layer
// ---------------------------------------------------------------------------

/**
 * A timing window is an interval [start, end] on a wall-clock ms timeline,
 * centered on `center` (the moment the hit would land).
 *
 * `tolerance` is the HALF-WIDTH of the window in ms. A "perfect" sub-window
 * (for parry) is narrower than the "accept" window (for dodge) so the game
 * has three distinct outcomes around the same instant:
 *
 *   ... |-------- accept (dodge) --------|
 *              |--- perfect (parry) ---|
 */
export function makeWindow(centerMs, toleranceMs) {
  return { start: centerMs - toleranceMs, end: centerMs + toleranceMs, centerMs, toleranceMs };
}

/**
 * Evaluate an input at time `tMs` against a window.
 * Returns one of:
 *   null        — outside the window (too early, too late, or not pressed)
 *   'perfect'   — inside `perfectMs` (half-width) of the window center
 *   'good'      — inside the full window but outside the perfect band
 */
export function evalWindow(tMs, window, perfectMs) {
  if (!window || tMs < window.start || tMs > window.end) return null;
  const off = Math.abs(tMs - window.centerMs);
  return off <= perfectMs ? 'perfect' : 'good';
}

/**
 * Progress of a phase on a wall-clock timeline.
 * Returns clamped 0..1 for `now` between phase start and start+duration.
 */
export function phaseProgress(nowMs, startMs, durationMs) {
  if (durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, (nowMs - startMs) / durationMs));
}

/**
 * "Distance to center as a 0..1 closeness" — 1 exactly on the hit frame,
 * 0 at the window edges. Useful for scaling flash size / slow-mo strength.
 */
export function windowCloseness(tMs, window) {
  if (!window || tMs < window.start || tMs > window.end) return 0;
  return 1 - Math.abs(tMs - window.centerMs) / Math.max(1, window.toleranceMs);
}

/**
 * Feint detection helper: given the player's earliest input time for a
 * combo index and the true window, decide whether the player "baited"
 * (pressed well before the window opened). `baitMs` is how early the
 * press must be to count as a wasted feint reaction.
 */
export function wasBaited(pressMs, window, baitMs = 180) {
  return pressMs !== null && pressMs < window.start - baitMs;
}
