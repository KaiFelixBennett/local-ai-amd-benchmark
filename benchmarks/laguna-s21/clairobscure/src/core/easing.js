/**
 * Easing functions and timing-window helpers.
 * Pure functions, no THREE dependencies.
 */

import { clamp, lerp } from './rng.js';

/** Smoothstep: 6t^5 - 15t^4 + 10t^3 */
export function smoothstep(t) {
    const x = clamp(t, 0, 1);
    return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Quadratic ease-in */
export function easeInQuad(t) {
    return t * t;
}

/** Quadratic ease-out */
export function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
}

/** Cubic ease-out */
export function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

/** Cubic ease-in-out */
export function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Elastic ease-out (for bounce effects) */
export function easeOutElastic(t) {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
}

/**
 * Check if a reaction time falls within a timing window.
 * @param {number} reactionTime - seconds from telegraph start to player input
 * @param {number} hitTime - seconds from telegraph start to actual hit
 * @param {number} parryWindow - half-width of parry window in seconds
 * @param {number} dodgeWindow - half-width of dodge window in seconds
 * @returns {{ result: 'parry' | 'dodge' | 'miss', timing: number }}
 */
export function checkReactionWindow(reactionTime, hitTime, parryWindow = 0.12, dodgeWindow = 0.28) {
    const diff = Math.abs(reactionTime - hitTime);
    if (diff <= parryWindow) return { result: 'parry', timing: diff };
    if (diff <= dodgeWindow) return { result: 'dodge', timing: diff };
    return { result: 'miss', timing: diff };
}

/**
 * Progress of an animation from 0→1 over a duration, with optional easing.
 */
export function animProgress(elapsed, duration, easing = easeOutCubic) {
    const raw = clamp(elapsed / duration, 0, 1);
    return easing(raw);
}

/**
 * Ping-pong a value between 0 and 1 (for idle bob).
 */
export function pingPong(t) {
    const x = (t % 2);
    return x < 1 ? x : 2 - x;
}
