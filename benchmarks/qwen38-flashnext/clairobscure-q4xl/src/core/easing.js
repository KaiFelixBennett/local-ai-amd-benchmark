// Pure math / easing / timing helpers. No THREE dependencies.

export function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
export function clamp01(x) { return clamp(x, 0, 1); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function invLerp(a, b, x) { return b === a ? 0 : clamp01((x - a) / (b - a)); }

// Frame-rate independent exponential smoothing.
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
export function easeInQuad(t) { return t * t; }
export function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
export function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
export function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
export function easeInCubic(t) { return t * t * t; }
export function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
export function easeOutElastic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

// Ping-pong helper for idle wobble: returns 0..1 triangle wave at given period.
export function pingpong(t, period) {
  const p = (t % period) / period;
  return p < 0.5 ? p * 2 : 2 - p * 2;
}
