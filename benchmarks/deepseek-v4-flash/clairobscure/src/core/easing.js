// easing.js — easing + timing-window helpers. Pure functions, no THREE deps.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a, b, t) => a + (b - a) * t;

// Frame-rate-independent smoothing factor: frames 1-exp based equivalent.
export function damp(a, b, lambda, dt) {
    return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

const easeFn = {
    linear: (t) => t,
    quad: (t) => t * t,
    cubic: (t) => t * t * t,
    smoothstep: (t) => t * t * (3 - 2 * t),
    easeInCubic: (t) => t * t * t,
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    easeOutBack: (t) => {
        const c1 = 1.70158, c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    easeOutElastic: (t) => {
        if (t === 0 || t === 1) return t;
        return Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1;
    },
};

// Map a normalized phase [0,1] through an easing name, clamped input.
export function ease(name, t) {
    const fn = easeFn[name] || easeFn.linear;
    return fn(clamp(t, 0, 1));
}

export function easeRange(name, a, b, t, d) {
    const tt = clamp((t - a) / (b - a), 0, 1);
    return ease(name, tt) * d;
}

export function smoothstep(t) {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
}

// Spring-like oscillation for hit reactions: decays toward 0.
export function springBounce(phase, decay) {
    // phase is seconds since impact
    return Math.exp(-phase * decay) * Math.cos(phase * 18);
}

// WindowTiming: central, wall-clock based timing-window helper.
// A window has: telegraphStart (start), telegraphEnd (when the hit lands),
// plus an early/late grace margin on either side of the exact perfect instant.
// All methods take `now` (seconds) — NEVER the frame index.
export class WindowTiming {
    constructor(opts) {
        this.start = opts.start;              // telegraph begin (s)
        this.end = opts.end;                  // hit lands (s) — the perfect instant
        this.duration = opts.duration || 0;    // reaction window total span
        this.kind = opts.kind || 'parry';      // 'parry' | 'dodge' | 'counter'
        this.done = false;
        this.hitResolved = false;
        this.flashAt = -1;
    }

    // Perfect window: centered on end, width w (seconds).
    perfectWindow(now, w = 0.12) {
        return Math.abs(now - this.end) <= w / 2;
    }

    // Loose window (dodge): starts a bit before end and extends after.
    dodgeOpen(now, early = 0.10, late = 0.22) {
        const open = now >= this.end - early && now <= this.end + late;
        return open && !this.done;
    }

    // Parry requires the perfect timing check; early parries are "feint traps".
    parryOpen(now, w = 0.15) {
        const open = Math.abs(now - this.end) <= w / 2;
        return open && !this.done;
    }

    // True if the window is past its end and unresolved (a fail).
    isOver(now) {
        return now >= this.end + 0.35 && !this.hitResolved;
    }

    mark(didSucceed, now) {
        this.done = true;
        this.hitResolved = true;
        this.result = didSucceed;
        this.resultAt = now;
    }

    // Progress for telegraph visualization: 0..1 during wind-up.
    progress(now) {
        return clamp((now - this.start) / Math.max(0.0001, this.end - this.start), 0, 1);
    }
}

export function formatTime(seconds) {
    const s = Math.floor(seconds);
    const ms = Math.floor((seconds - s) * 1000);
    return `${s}.${String(ms).padStart(3, '0')}s`;
}
