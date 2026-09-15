import type { Rng } from '../types';
import { GAME_WIDTH, GAME_HEIGHT } from '../types';
import type { TargetDef, TrajectoryKind } from '../config/schema';

/** A live sampled position of a flying target. */
export interface PathSnapshot {
  x: number;
  y: number;
  /** heading in radians */
  angle: number;
  /** apparent scale (from depth) */
  scale: number;
  /** current apparent speed px/s (for scoring) */
  speed: number;
  /** depth factor 0.4..1.6 */
  depth: number;
}

/** Mutable envelope applied to every trajectory: wind and speed multiplier. */
export interface EnvMod {
  wind: number; // -1..1
  speedMult: number;
}

const W = GAME_WIDTH;
const H = GAME_HEIGHT;
const MARGIN = 160; // despawn margin beyond screen edges

export interface Trajectory {
  readonly kind: TrajectoryKind;
  readonly lifetime: number;
  /** advance by dt seconds; returns false when the target is done (escaped) */
  update(dt: number, env: EnvMod): boolean;
  snapshot(): PathSnapshot;
  /** called when a shot missed near this target: trigger flee behavior */
  flee(fromX: number, fromY: number, rng: Rng): void;
  /** force the target to end soon (used by events) */
  killSoon(): void;
}

interface EdgePoint {
  x: number;
  y: number;
  edge: 'left' | 'right' | 'top' | 'bottom';
}

function randomEdge(rng: Rng, avoidCorners = true): EdgePoint {
  const side = rng.int(0, 3);
  const pad = avoidCorners ? 120 : 0;
  switch (side) {
    case 0:
      return { x: -MARGIN, y: rng.range(pad, H - pad), edge: 'left' };
    case 1:
      return { x: W + MARGIN, y: rng.range(pad, H - pad), edge: 'right' };
    case 2:
      return { x: rng.range(pad, W - pad), y: -MARGIN, edge: 'top' };
    default:
      return { x: rng.range(pad, W - pad), y: H + MARGIN, edge: 'bottom' };
  }
}

function pointOnEdge(rng: Rng, from: EdgePoint): EdgePoint {
  // exit roughly opposite of entry with jitter
  const jitter = () => rng.range(0.25, 0.75);
  switch (from.edge) {
    case 'left':
      return { x: W + MARGIN, y: H * jitter(), edge: 'right' };
    case 'right':
      return { x: -MARGIN, y: H * jitter(), edge: 'left' };
    case 'top':
      return { x: W * jitter(), y: H + MARGIN, edge: 'bottom' };
    default:
      return { x: W * jitter(), y: -MARGIN, edge: 'top' };
  }
}

function baseSpeed(def: TargetDef, rng: Rng): number {
  return rng.range(def.speed[0], def.speed[1]);
}

function baseDepth(def: TargetDef, rng: Rng): number {
  return rng.range(def.depthRange[0], def.depthRange[1]);
}

function clampAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/* ------------------------------------------------------------------ *
 * Line
 * ------------------------------------------------------------------ */
class LineTraj implements Trajectory {
  readonly kind: TrajectoryKind = 'line';
  readonly lifetime: number;
  private t = 0;
  private x: number;
  private y: number;
  private vx: number;
  private vy: number;
  private scale: number;
  private fleeing = false;

  constructor(def: TargetDef, rng: Rng, flyUp: boolean) {
    const start = randomEdge(rng);
    const end = pointOnEdge(rng, start);
    this.x = start.x;
    this.y = start.y;
    const sp = baseSpeed(def, rng) * (flyUp ? 1.1 : 1);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.vx = (dx / dist) * sp;
    this.vy = (dy / dist) * sp;
    this.scale = baseDepth(def, rng);
    this.lifetime = dist / sp + 2;
  }

  update(dt: number, env: EnvMod): boolean {
    this.t += dt;
    const s = env.speedMult;
    this.x += (this.vx + env.wind * 90) * s * dt;
    this.y += this.vy * s * dt;
    if (
      this.t > this.lifetime ||
      this.x < -MARGIN - 200 ||
      this.x > W + MARGIN + 200 ||
      this.y < -MARGIN - 200 ||
      this.y > H + MARGIN + 200
    ) {
      return false;
    }
    return true;
  }

  flee(_fx: number, _fy: number, rng: Rng): void {
    if (this.fleeing) return;
    this.fleeing = true;
    // accelerate away upward or across
    const boost = 1.8;
    this.vx *= boost;
    this.vy = this.vy * 0.4 - 140 * (rng.chance(0.5) ? 1 : -1);
  }

  killSoon(): void {
    this.t = Math.max(this.t, this.lifetime);
  }

  snapshot(): PathSnapshot {
    const speed = Math.hypot(this.vx, this.vy);
    return {
      x: this.x,
      y: this.y,
      angle: Math.atan2(this.vy, this.vx),
      scale: this.scale,
      speed,
      depth: this.scale,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Sine wave
 * ------------------------------------------------------------------ */
class SineTraj implements Trajectory {
  readonly kind = 'sine' as const;
  readonly lifetime: number;
  private t = 0;
  private x0: number;
  private y0: number;
  private vx: number;
  private vy: number;
  private amp: number;
  private freq: number;
  private scale: number;
  private fleeing = false;

  constructor(def: TargetDef, rng: Rng) {
    const start = randomEdge(rng);
    const end = pointOnEdge(rng, start);
    this.x0 = start.x;
    this.y0 = start.y;
    const sp = baseSpeed(def, rng);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.vx = (dx / dist) * sp;
    this.vy = (dy / dist) * sp;
    this.amp = rng.range(30, 90);
    this.freq = rng.range(1.2, 2.6);
    this.scale = baseDepth(def, rng);
    this.lifetime = dist / sp + 2;
  }

  update(dt: number, env: EnvMod): boolean {
    this.t += dt;
    const s = env.speedMult;
    const px = Math.sin(this.t * this.freq * Math.PI) * this.amp;
    const nx = -this.vy;
    const ny = this.vx;
    const nl = Math.hypot(nx, ny) || 1;
    const x = this.x0 + this.vx * this.t + (nx / nl) * px;
    const y = this.y0 + this.vy * this.t + (ny / nl) * px;
    this.x0 = x - this.vx * this.t;
    this.y0 = y - this.vy * this.t;
    // simpler: keep base moving
    this.x0 += env.wind * 80 * s * dt;
    const lastX = x;
    const lastY = y;
    this._last = { x: lastX, y: lastY };
    if (
      this.t > this.lifetime ||
      x < -MARGIN - 220 ||
      x > W + MARGIN + 220 ||
      y < -MARGIN - 220 ||
      y > H + MARGIN + 220
    )
      return false;
    return true;
  }

  private _last = { x: 0, y: 0 };

  flee(_fx: number, _fy: number, rng: Rng): void {
    if (this.fleeing) return;
    this.fleeing = true;
    this.vx *= 1.7;
    this.amp *= 1.8;
    this.freq *= 1.4;
    void rng;
  }

  killSoon(): void {
    this.t = this.lifetime;
  }

  snapshot(): PathSnapshot {
    const p = this._last;
    return {
      x: p.x,
      y: p.y,
      angle: Math.atan2(this.vy, this.vx),
      scale: this.scale,
      speed: Math.hypot(this.vx, this.vy),
      depth: this.scale,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Bezier curve
 * ------------------------------------------------------------------ */
class BezierTraj implements Trajectory {
  readonly kind = 'bezier' as const;
  lifetime: number;
  private t = 0;
  private x: number;
  private y: number;
  private p0: { x: number; y: number };
  private c1: { x: number; y: number };
  private c2: { x: number; y: number };
  private p3: { x: number; y: number };
  private scale: number;
  private sp: number;

  constructor(def: TargetDef, rng: Rng) {
    const start = randomEdge(rng);
    const end = pointOnEdge(rng, start);
    this.p0 = { x: start.x, y: start.y };
    this.p3 = { x: end.x, y: end.y };
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const spread = rng.range(120, 380);
    const a = rng.range(0, Math.PI * 2);
    this.c1 = { x: mid.x + Math.cos(a) * spread, y: mid.y + Math.sin(a) * spread * 0.6 };
    this.c2 = {
      x: mid.x + Math.cos(a + rng.range(1.5, 2.5)) * spread * 0.8,
      y: mid.y + Math.sin(a + 1.2) * spread * 0.8,
    };
    this.sp = baseSpeed(def, rng);
    this.scale = baseDepth(def, rng);
    // approximate curve length
    let len = 0;
    let prev = this.pointAt(0);
    for (let i = 1; i <= 12; i++) {
      const p = this.pointAt(i / 12);
      len += Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
    }
    this.lifetime = len / this.sp + 2;
    this.x = start.x;
    this.y = start.y;
  }

  private pointAt(t: number): { x: number; y: number } {
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    return {
      x: a * this.p0.x + b * this.c1.x + c * this.c2.x + d * this.p3.x,
      y: a * this.p0.y + b * this.c1.y + c * this.c2.y + d * this.p3.y,
    };
  }

  update(dt: number, env: EnvMod): boolean {
    this.t += dt;
    const u = Math.min(1, this.t / this.lifetime);
    const p = this.pointAt(u);
    this.x = p.x + env.wind * 70 * this.t * env.speedMult;
    this.y = p.y;
    if (this.t >= this.lifetime) return false;
    return true;
  }

  flee(_fx: number, _fy: number, rng: Rng): void {
    // push the remaining curve steeply upward
    this.lifetime *= 0.55;
    this.p3.y = H * (rng.chance(0.5) ? 0.05 : 0.15);
  }

  killSoon(): void {
    this.t = this.lifetime;
  }

  snapshot(): PathSnapshot {
    const next = this.pointAt(Math.min(1, this.t / this.lifetime + 0.02));
    return {
      x: this.x,
      y: this.y,
      angle: Math.atan2(next.y - this.y, next.x - this.x),
      scale: this.scale,
      speed: Math.hypot(next.x - this.x, next.y - this.y) / 0.02,
      depth: this.scale,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Spiral / corkscrew
 * ------------------------------------------------------------------ */
class SpiralTraj implements Trajectory {
  readonly kind = 'spiral' as const;
  readonly lifetime: number;
  private t = 0;
  private cx: number;
  private cy: number;
  private driftX: number;
  private driftY: number;
  private radius: number;
  private radiusGrow: number;
  private spin: number;
  private scale: number;
  private x = 0;
  private y = 0;

  constructor(def: TargetDef, rng: Rng) {
    const start = randomEdge(rng);
    const end = pointOnEdge(rng, start);
    this.cx = start.x;
    this.cy = start.y;
    const sp = baseSpeed(def, rng);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.driftX = (dx / dist) * sp * 0.75;
    this.driftY = (dy / dist) * sp * 0.75;
    this.radius = rng.range(40, 90);
    this.radiusGrow = rng.range(-8, 14);
    this.spin = rng.range(2.2, 4.2) * (rng.chance(0.5) ? 1 : -1);
    this.scale = baseDepth(def, rng);
    this.lifetime = dist / (sp * 0.8) + 2;
    this.x = start.x;
    this.y = start.y;
  }

  update(dt: number, env: EnvMod): boolean {
    this.t += dt;
    const s = env.speedMult;
    this.cx += this.driftX * s * dt + env.wind * 70 * s * dt;
    this.cy += this.driftY * s * dt;
    const r = Math.max(10, this.radius + this.radiusGrow * this.t);
    this.x = this.cx + Math.cos(this.t * this.spin) * r;
    this.y = this.cy + Math.sin(this.t * this.spin) * r * 0.7;
    if (this.t > this.lifetime) return false;
    if (this.x < -MARGIN - 220 || this.x > W + MARGIN + 220 || this.y < -MARGIN - 220 || this.y > H + MARGIN + 220)
      return false;
    return true;
  }

  flee(_fx: number, _fy: number, rng: Rng): void {
    this.driftY = -Math.abs(this.driftY) * 1.6 - 80;
    this.spin *= 1.4;
    void rng;
  }

  killSoon(): void {
    this.t = this.lifetime;
  }

  snapshot(): PathSnapshot {
    const aheadX = this.cx + Math.cos((this.t + 0.05) * this.spin) * this.radius;
    const aheadY = this.cy + Math.sin((this.t + 0.05) * this.spin) * this.radius * 0.7;
    return {
      x: this.x,
      y: this.y,
      angle: Math.atan2(aheadY - this.y, aheadX - this.x),
      scale: this.scale,
      speed: Math.hypot(this.driftX, this.driftY) * 1.35 + 60,
      depth: this.scale,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Dive (sturzflug)
 * ------------------------------------------------------------------ */
class DiveTraj implements Trajectory {
  readonly kind = 'dive' as const;
  readonly lifetime: number;
  private t = 0;
  private x: number;
  private y: number;
  private vx: number;
  private vy = 0;
  private diveAt: number;
  private diveSpeed: number;
  private scale: number;

  constructor(def: TargetDef, rng: Rng) {
    const horizontal = rng.chance(0.7);
    if (horizontal) {
      const start = rng.chance(0.5)
        ? randomEdge(rng, false)
        : { x: -MARGIN, y: rng.range(80, 380), edge: 'left' as const };
      this.x = start.x;
      this.y = rng.range(80, 380);
      this.vx = (start.edge === 'right' ? -1 : 1) * baseSpeed(def, rng);
    } else {
      const start = { x: rng.range(200, W - 200), y: -MARGIN, edge: 'top' as const };
      this.x = start.x;
      this.y = start.y;
      this.vx = rng.range(-60, 60);
      this.vy = baseSpeed(def, rng) * 0.4;
    }
    this.diveAt = rng.range(0.8, 2.2);
    this.diveSpeed = baseSpeed(def, rng) * 1.9;
    this.scale = baseDepth(def, rng);
    this.lifetime = this.diveAt + H / this.diveSpeed + 1.5;
  }

  update(dt: number, env: EnvMod): boolean {
    this.t += dt;
    const s = env.speedMult;
    if (this.t >= this.diveAt) {
      this.vy += (this.diveSpeed - this.vy) * Math.min(1, dt * 5) * s;
    }
    this.x += (this.vx + env.wind * 60) * s * dt;
    this.y += this.vy * s * dt;
    if (this.t > this.lifetime || this.y > H + MARGIN || this.x < -MARGIN - 200 || this.x > W + MARGIN + 200)
      return false;
    return true;
  }

  flee(_fx: number, _fy: number, rng: Rng): void {
    this.diveSpeed *= 1.3;
    this.vx = (this.vx > 0 ? 1 : -1) * 320;
    void rng;
  }

  killSoon(): void {
    this.t = this.lifetime;
  }

  snapshot(): PathSnapshot {
    return {
      x: this.x,
      y: this.y,
      angle: Math.atan2(this.vy, this.vx),
      scale: this.scale,
      speed: Math.hypot(this.vx, this.vy),
      depth: this.scale,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Zigzag (abrupt direction changes)
 * ------------------------------------------------------------------ */
class ZigzagTraj implements Trajectory {
  readonly kind = 'zigzag' as const;
  readonly lifetime: number;
  private t = 0;
  private x: number;
  private y: number;
  private angle: number;
  private sp: number;
  private nextChange = 0;
  private changeEvery: number;
  private scale: number;

  constructor(
    def: TargetDef,
    private rng: Rng,
  ) {
    const start = randomEdge(rng);
    const end = pointOnEdge(rng, start);
    this.x = start.x;
    this.y = start.y;
    this.angle = Math.atan2(end.y - start.y, end.x - start.x);
    this.sp = baseSpeed(def, rng) * 1.1;
    this.changeEvery = rng.range(0.35, 0.7);
    this.nextChange = this.changeEvery;
    this.scale = baseDepth(def, rng);
    const dist = Math.hypot(end.x - start.x, end.y - start.y);
    this.lifetime = dist / this.sp + 2.5;
  }

  update(dt: number, env: EnvMod): boolean {
    this.t += dt;
    this.nextChange -= dt;
    if (this.nextChange <= 0) {
      this.angle += (this.rng.next() > 0.5 ? 1 : -1) * 0.9;
      this.nextChange = this.changeEvery;
    }
    // bias angle back toward the far side so it crosses the field
    const straight = Math.atan2(H / 2 - this.y, W / 2 - this.x);
    this.angle = clampAngle(this.angle * 0.92 + straight * 0.08);
    const s = env.speedMult;
    this.x += (Math.cos(this.angle) * this.sp + env.wind * 80) * s * dt;
    this.y += Math.sin(this.angle) * this.sp * s * dt;
    if (
      this.t > this.lifetime ||
      this.x < -MARGIN - 200 ||
      this.x > W + MARGIN + 200 ||
      this.y < -MARGIN - 200 ||
      this.y > H + MARGIN + 200
    )
      return false;
    return true;
  }

  flee(_fx: number, _fy: number, rng: Rng): void {
    this.sp *= 1.6;
    this.angle = rng.range(0, Math.PI * 2);
    this.changeEvery = 0.25;
  }

  killSoon(): void {
    this.t = this.lifetime;
  }

  snapshot(): PathSnapshot {
    return {
      x: this.x,
      y: this.y,
      angle: this.angle,
      scale: this.scale,
      speed: this.sp,
      depth: this.scale,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Hover (short stop in the air)
 * ------------------------------------------------------------------ */
class HoverTraj implements Trajectory {
  readonly kind = 'hover' as const;
  readonly lifetime: number;
  private t = 0;
  private x: number;
  private y: number;
  private baseX: number;
  private baseY: number;
  private bob: number;
  private drift: number;
  private scale: number;

  constructor(def: TargetDef, rng: Rng) {
    this.baseX = rng.range(260, W - 260);
    this.baseY = rng.range(140, H * 0.55);
    this.x = this.baseX;
    this.y = this.baseY;
    this.bob = rng.range(18, 44);
    this.drift = rng.range(-30, 30);
    this.scale = baseDepth(def, rng);
    this.lifetime = rng.range(5, 8);
  }

  update(dt: number, env: EnvMod): boolean {
    this.t += dt;
    this.x = this.baseX + Math.sin(this.t * 0.7) * 60 + this.drift * this.t + env.wind * 60 * this.t;
    this.y = this.baseY + Math.sin(this.t * 2.4) * this.bob;
    if (this.t > this.lifetime) return false;
    if (this.x < -MARGIN - 100 || this.x > W + MARGIN + 100) return false;
    return true;
  }

  flee(_fx: number, _fy: number, rng: Rng): void {
    this.drift = (this.x > W / 2 ? 1 : -1) * 300;
    void rng;
  }

  killSoon(): void {
    this.t = this.lifetime;
  }

  snapshot(): PathSnapshot {
    const ax = this.baseX + Math.sin((this.t + 0.05) * 0.7) * 60 + this.drift * (this.t + 0.05);
    const ay = this.baseY + Math.sin((this.t + 0.05) * 2.4) * this.bob;
    return {
      x: this.x,
      y: this.y,
      angle: Math.atan2(ay - this.y, ax - this.x),
      scale: this.scale,
      speed: Math.hypot(ax - this.x, ay - this.y) / 0.05,
      depth: this.scale,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Depth glider (foreground/background oscillation)
 * ------------------------------------------------------------------ */
class DepthTraj implements Trajectory {
  readonly kind = 'depth' as const;
  readonly lifetime: number;
  private t = 0;
  private x: number;
  private y: number;
  private vx: number;
  private vy: number;
  private depthMin: number;
  private depthMax: number;
  private freq: number;

  constructor(_def: TargetDef, rng: Rng) {
    const start = randomEdge(rng);
    const end = pointOnEdge(rng, start);
    this.x = start.x;
    this.y = rng.range(120, H - 260);
    const sp = rng.range(90, 160);
    const dx = end.x - start.x;
    this.vx = (dx >= 0 ? 1 : -1) * sp;
    this.vy = rng.range(-20, 20);
    this.depthMin = 0.4;
    this.depthMax = 1.6;
    this.freq = rng.range(0.18, 0.34);
    const dist = Math.abs(end.x - start.x) || 1600;
    this.lifetime = dist / sp + 2;
  }

  update(dt: number, env: EnvMod): boolean {
    this.t += dt;
    const s = env.speedMult;
    this.x += (this.vx + env.wind * 70) * s * dt;
    this.y += this.vy * s * dt;
    if (this.t > this.lifetime || this.x < -MARGIN - 200 || this.x > W + MARGIN + 200) return false;
    return true;
  }

  flee(_fx: number, _fy: number, rng: Rng): void {
    this.vx *= 1.5;
    void rng;
  }

  killSoon(): void {
    this.t = this.lifetime;
  }

  snapshot(): PathSnapshot {
    const depth =
      this.depthMin + (this.depthMax - this.depthMin) * (0.5 + 0.5 * Math.sin(this.t * this.freq * Math.PI * 2));
    return {
      x: this.x,
      y: this.y,
      angle: Math.atan2(this.vy, this.vx),
      scale: depth,
      speed: Math.hypot(this.vx, this.vy) * (0.6 + depth * 0.5),
      depth,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Formation (group member offset from a shared anchor)
 * ------------------------------------------------------------------ */
class FormationMember implements Trajectory {
  readonly kind = 'formation' as const;
  readonly lifetime: number;
  constructor(
    private anchor: Trajectory,
    offsetX: number,
    offsetY: number,
  ) {
    this.lifetime = anchor.lifetime;
    this.ox = offsetX;
    this.oy = offsetY;
  }
  private ox: number;
  private oy: number;

  update(dt: number, env: EnvMod): boolean {
    return this.anchor.update(dt, env);
  }

  flee(fx: number, fy: number, rng: Rng): void {
    this.anchor.flee(fx, fy, rng);
  }

  killSoon(): void {
    this.anchor.killSoon();
  }

  snapshot(): PathSnapshot {
    const s = this.anchor.snapshot();
    const cos = Math.cos(s.angle);
    const sin = Math.sin(s.angle);
    return {
      ...s,
      x: s.x + this.ox * cos - this.oy * sin,
      y: s.y + this.ox * sin + this.oy * cos,
    };
  }
}

export function createFormation(
  def: TargetDef,
  rng: Rng,
  size: number,
  index: number,
): { member: Trajectory; shared: Trajectory } {
  const anchor = new LineTraj(def, rng, true);
  // V formation offsets
  const row = Math.floor(index / 2) + 1;
  const side = index % 2 === 0 ? 1 : -1;
  const spacingX = 55 + rng.range(0, 16);
  const spacingY = 46 + rng.range(0, 16);
  const member = new FormationMember(anchor, -row * spacingX, side * row * spacingY);
  void size;
  return { member, shared: anchor };
}

/** Attach one member to an existing formation anchor (staggered spawning). */
export function createFormationMemberAt(anchor: Trajectory, index: number, rng: Rng): Trajectory {
  const row = Math.floor(index / 2) + 1;
  const side = index % 2 === 0 ? 1 : -1;
  const spacingX = 55 + rng.range(0, 16);
  const spacingY = 46 + rng.range(0, 16);
  return new FormationMember(anchor as unknown as LineTraj, -row * spacingX, side * row * spacingY);
}

/* ------------------------------------------------------------------ *
 * Factory
 * ------------------------------------------------------------------ */
export function createTrajectory(kind: TrajectoryKind, def: TargetDef, rng: Rng): Trajectory {
  switch (kind) {
    case 'line':
      return new LineTraj(def, rng, false);
    case 'bezier':
      return new BezierTraj(def, rng);
    case 'sine':
      return new SineTraj(def, rng);
    case 'spiral':
      return new SpiralTraj(def, rng);
    case 'dive':
      return new DiveTraj(def, rng);
    case 'zigzag':
      return new ZigzagTraj(def, rng);
    case 'hover':
      return new HoverTraj(def, rng);
    case 'flee':
      return new LineTraj(def, rng, true);
    case 'depth':
      return new DepthTraj(def, rng);
    case 'formation':
      return new LineTraj(def, rng, true);
    default:
      return new LineTraj(def, rng, false);
  }
}
