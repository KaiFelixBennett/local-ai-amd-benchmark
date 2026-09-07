/**
 * Seedable PRNG (Mulberry32) + shared math helpers.
 */

export class RNG {
    constructor(seed = Date.now()) {
        this.seed = seed;
    }

    // Returns a float in [0, 1)
    next() {
        let t = (this.seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // Random integer in [min, max] (inclusive)
    nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    // Random float in [min, max)
    nextFloat(min, max) {
        return this.next() * (max - min) + min;
    }

    // Pick a random element from an array
    pick(arr) {
        return arr[this.nextInt(0, arr.length - 1)];
    }

    // Returns true with probability p (0..1)
    chance(p) {
        return this.next() < p;
    }
}

/** Clamp x to [lo, hi] */
export function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
}

/** Linear interpolation */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/** Map x from [a1,a2] to [b1,b2] */
export function mapRange(x, a1, a2, b1, b2) {
    return b1 + (b2 - b1) * ((x - a1) / (a2 - a1));
}

/** Absolute difference */
export function dist(a, b) {
    return Math.abs(a - b);
}
