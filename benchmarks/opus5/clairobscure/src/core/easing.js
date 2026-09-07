/**
 * Pure math: interpolation, easing curves and timing-window evaluation.
 * No THREE, no DOM, no state — everything here is a referentially transparent
 * function so the reaction system's timing can be reasoned about in isolation.
 */

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Inverse lerp: where does v sit between a and b (unclamped). */
export function invLerp(a, b, v) {
  return b === a ? 0 : (v - a) / (b - a);
}

/** Classic 3t²-2t³ ease, clamped. Used across terrain shaping and blending. */
export function smoothstep(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/**
 * Frame-rate independent exponential approach.
 * `rate` is roughly "how many e-foldings per second"; higher is snappier.
 */
export function damp(current, target, rate, dt) {
  return lerp(target, current, Math.exp(-rate * dt));
}

/** Same as damp but for angles, taking the short way around. */
export function dampAngle(current, target, rate, dt) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-rate * dt));
}

export function easeOutQuad(t) { const x = clamp01(t); return 1 - (1 - x) * (1 - x); }
export function easeOutCubic(t) { const x = clamp01(t); return 1 - Math.pow(1 - x, 3); }
export function easeInOutCubic(t) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
export function easeOutBack(t, overshoot = 1.7) {
  const x = clamp01(t);
  const c3 = overshoot + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + overshoot * Math.pow(x - 1, 2);
}

// ---------------------------------------------------------------------------
// Timing windows — the mathematical core of the reactive defence layer.
// ---------------------------------------------------------------------------

/**
 * Is `delta` (seconds; negative = early, positive = late) inside a window of
 * half-width `half`? Windows may be asymmetric via `halfLate`.
 */
export function inWindow(delta, half, halfLate = half) {
  return delta >= -half && delta <= halfLate;
}

/**
 * Quality of a timed input: 1 dead-on, 0 at the window edge.
 * Outside the window returns 0.
 */
export function windowQuality(delta, half, halfLate = half) {
  if (!inWindow(delta, half, halfLate)) return 0;
  const edge = delta < 0 ? half : halfLate;
  return edge <= 0 ? 1 : 1 - Math.abs(delta) / edge;
}

/** Human-readable grade for a timed input, used for on-screen feedback. */
export function gradeFor(quality) {
  if (quality >= 0.72) return 'PERFECT';
  if (quality >= 0.38) return 'GREAT';
  return 'GOOD';
}
