import { lerp } from './easing.js';

// Wall-clock driven game clock. All combat timing (telegraphs, windows, animations)
// runs on scaled game seconds so it stays fair at any frame rate and can be
// slow-mo'd or briefly frozen for hit-stop without breaking timing honesty.

export class Clock {
  constructor() {
    this.scale = 1;
    this.targetScale = 1;
    this.smoothing = 14;
    this.t = 0;          // accumulated scaled game time
    this.rawT = 0;       // accumulated real time
    this.dt = 0;         // scaled delta for the current frame
    this.realDt = 0;
    this._freezeUntil = 0;
  }
  update(realDt) {
    const r = Math.min(realDt, 0.05); // clamp huge tab-switch steps
    this.realDt = r;
    this.rawT += r;
    this.scale = lerp(this.scale, this.targetScale, 1 - Math.exp(-this.smoothing * r));
    let dt = r * this.scale;
    if (this.rawT < this._freezeUntil) dt = 0;
    this.t += dt;
    this.dt = dt;
    return dt;
  }
  slowTo(scale) { this.targetScale = scale; }
  restore() { this.targetScale = 1; }
  // Freeze real-time (hit-stop). Short values only.
  hitstop(seconds) { this._freezeUntil = Math.max(this._freezeUntil, this.rawT + seconds); }
  reset() {
    this.scale = 1; this.targetScale = 1;
    this.t = 0; this.rawT = 0; this.dt = 0; this.realDt = 0; this._freezeUntil = 0;
  }
}

// Promise-based timers measured in game seconds (so they respect slow-mo / hit-stop).
export class Timers {
  constructor(clock) {
    this.clock = clock;
    this.pending = [];
  }
  wait(seconds, opts = {}) {
    return new Promise((resolve) => {
      if (seconds <= 0) { resolve(); return; }
      this.pending.push({ left: seconds, resolve, real: !!opts.real });
    });
  }
  update() {
    if (this.pending.length === 0) return;
    const c = this.clock;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const item = this.pending[i];
      item.left -= item.real ? c.realDt : c.dt;
      if (item.left <= 0) {
        this.pending.splice(i, 1);
        item.resolve();
      }
    }
  }
  // Resolve everything (used on restart so no await chain is left dangling).
  flush() {
    const list = this.pending.splice(0, this.pending.length);
    for (const item of list) item.resolve();
  }
  get count() { return this.pending.length; }
}
