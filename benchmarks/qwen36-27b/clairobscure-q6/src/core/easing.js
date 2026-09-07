/**
 * Easing functions + timing-window helpers.
 * Pure functions, no THREE deps.
 */

import { clamp, lerp, smoothstep } from './rng.js';

export const Ease = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => 1 - (1 - t) * (1 - t),
  inOutQuad: t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  inCubic: t => t * t * t,
  outCubic: t => 1 - (1 - t) ** 3,
  inOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
  inQuart: t => t * t * t * t,
  outQuart: t => 1 - (1 - t) ** 4,
  inBack: t => { const c1 = 1.70158; return (c1 + 1) * t ** 3 + c1 * t ** 2; },
  outBack: t => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  outElastic: t => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
  },
};

/**
 * Check if a reaction time falls within a timing window.
 * @param {number} reactionTime  - seconds from telegraph start when player reacted
 * @param {number} hitTime       - seconds from telegraph start when hit lands
 * @param {number} parryWindow   - half-width in seconds for parry (tight)
 * @param {number} dodgeWindow   - half-width in seconds for dodge (wider)
 * @returns 'parry' | 'dodge' | 'miss'
 */
export function checkTimingWindow(reactionTime, hitTime, parryWindow = 0.12, dodgeWindow = 0.3) {
  const diff = Math.abs(reactionTime - hitTime);
  if (diff <= parryWindow) return 'parry';
  if (diff <= dodgeWindow) return 'dodge';
  return 'miss';
}

/**
 * Evaluate an easing function by name over a duration.
 */
export function evaluateEase(easeName, progress, duration) {
  const fn = Ease[easeName] || Ease.linear;
  return fn(clamp(progress / duration, 0, 1));
}

/**
 * Lerp between two values with easing.
 */
export function easeLerp(from, to, progress, duration, easeName = 'linear') {
  return lerp(from, to, evaluateEase(easeName, progress, duration));
}
