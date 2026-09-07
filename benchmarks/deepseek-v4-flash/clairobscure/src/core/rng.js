// rng.js — seedable RNG + shared math helpers. Zero dependencies, pure functions.

// mulberry32: tiny, fast, well-distributed seeded PRNG.
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Hash a string into a 32-bit unsigned seed.
export function hashSeed(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

// Deterministic pseudo-random builder: each key returns a stable function of (seed, key).
export function makeRng(seedStr) {
    const base = hashSeed(seedStr);
    const tables = new Map();
    function fn(key) {
        if (!tables.has(key)) {
            tables.set(key, mulberry32((base + hashSeed(String(key))) >>> 0));
        }
        return tables.get(key);
    }
    return {
        // Float in [0,1)
        next(key) { return fn(key)(); },
        // Float in [min,max)
        range(key, min, max) { return min + fn(key)() * (max - min); },
        // Integer in [min,max] inclusive
        int(key, min, max) {
            min = Math.ceil(min); max = Math.floor(max);
            return min + Math.floor(fn(key)() * (max - min + 1));
        },
        // Pick an element with uniform probability
        pick(key, arr) { return arr[Math.floor(fn(key)() * arr.length)]; },
        // Weighted pick: arr of {value, weight}
        weighted(key, arr) {
            let total = 0;
            for (const item of arr) total += item.weight;
            let roll = fn(key)() * total;
            for (const item of arr) {
                roll -= item.weight;
                if (roll <= 0) return item.value;
            }
            return arr[arr.length - 1].value;
        },
        // Knuth shuffle (in place), returns same array
        shuffle(key, arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(fn(key + ':' + i)() * (i + 1));
                const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
            }
            return arr;
        },
        // Box-Muller gaussian, mean 0 std 1
        gaussian(key) {
            let u = 0, v = 0;
            while (u === 0) u = fn(key)();
            while (v === 0) v = fn(key + ':v')();
            return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        },
    };
}

// Clamp helper (kept here so non-UI modules don't need easing imports).
export function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

// Piecewise devant-smoothstep (used in place of a missing easing import where only
// clamping is needed).
export function smoothstep01(t) {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
}
