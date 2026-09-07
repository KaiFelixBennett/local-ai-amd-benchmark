// Easing functions and timing window helpers for parry/dodge mechanics

export function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Evaluate timing window: returns { hit: bool, perfect: bool, score: number }
// windowCenter is the ideal moment, windowSize is total width
export function evaluateTimingWindow(currentTime, windowCenter, windowSize) {
  const offset = Math.abs(currentTime - windowCenter);
  const halfWindow = windowSize / 2;
  
  if (offset > halfWindow) {
    return { hit: false, perfect: false, score: 0 };
  }
  
  const perfectThreshold = windowSize * 0.25;
  const perfect = offset < perfectThreshold;
  
  // Score based on precision (1.0 = perfect timing, 0.5 = edge of window)
  const normalizedOffset = offset / halfWindow;
  const score = 1 - normalizedOffset;
  
  return { hit: true, perfect, score };
}

// Ease in out quad for UI animations
export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Ease out back for bounce effects (parry success)
export function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Ease out elastic for shimmer effects
export function easeOutElastic(t) {
  const c4 = (2 * Math.PI) / 3;
  return t === 0 ? 0 : t === 1 ? 1 : 
    Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

// Clamp value to range
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Map value from one range to another
export function mapRange(value, inMin, inMax, outMin, outMax) {
  return outMin + ((value - inMin) * (outMax - outMin)) / (inMax - inMin);
}
