/**
 * Pure trajectory evaluation. Given a TrajectoryDef and a normalized time t in
 * [0,1], returns position + a velocity estimate (px/s) + facing angle.
 * No Phaser. Unit-testable.
 */

import type { TrajectoryDef, Vec2 } from './types';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerpV(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function quadBezier(p0: Vec2, p1: Vec2, p2: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  const a = mt * mt;
  const b = 2 * mt * t;
  const c = t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x, y: a * p0.y + b * p1.y + c * p2.y };
}

export function cubicBezier(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
  };
}

export interface SampleResult {
  pos: Vec2;
  /** estimated speed px/s (always positive) */
  speed: number;
  /** facing angle in radians */
  angle: number;
  /** 0..1 depth (back..front) */
  depth: number;
  /** finished (t>=1) */
  done: boolean;
}

/** Pure position at normalized time t. */
export function positionAt(def: TrajectoryDef, t: number): Vec2 {
  const tt = Math.max(0, Math.min(1, t));
  const amp = def.amplitude ?? 0;
  const waves = def.waves ?? 1;
  let pos: Vec2 = def.start;

  switch (def.kind) {
    case 'linear':
      pos = lerpV(def.start, def.end, tt);
      break;
    case 'bezier': {
      const p1 = def.control1 ?? { x: (def.start.x + def.end.x) / 2, y: def.start.y - amp - 40 };
      pos = quadBezier(def.start, p1, def.end, tt);
      break;
    }
    case 'sine': {
      const base = lerpV(def.start, def.end, tt);
      const dx = def.end.x - def.start.x;
      const dy = def.end.y - def.start.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const off = Math.sin(tt * Math.PI * waves * 2) * amp;
      pos = { x: base.x + nx * off, y: base.y + ny * off };
      break;
    }
    case 'spiral': {
      const cx = (def.start.x + def.end.x) / 2;
      const cy = (def.start.y + def.end.y) / 2;
      const angle = tt * Math.PI * waves * 2;
      const r = amp * (1 - tt * 0.5);
      pos = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
      break;
    }
    case 'dive': {
      // ease-in then ease-out vertical dive
      const base = lerpV(def.start, def.end, tt);
      const s = smooth(tt);
      pos = { x: base.x, y: base.y + Math.sin(s * Math.PI) * -amp };
      break;
    }
    case 'zigzag': {
      const base = lerpV(def.start, def.end, tt);
      const dx = def.end.x - def.start.x;
      const dy = def.end.y - def.start.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const z = (Math.sin(tt * Math.PI * waves * 2) >= 0 ? 1 : -1) * amp;
      pos = { x: base.x + nx * z, y: base.y + ny * z };
      break;
    }
    case 'hover': {
      // mostly still, gentle bob
      const cx = (def.start.x + def.end.x) / 2;
      const cy = (def.start.y + def.end.y) / 2;
      pos = {
        x: cx + Math.sin(tt * Math.PI * 2) * amp * 0.3,
        y: cy + Math.sin(tt * Math.PI * 4) * amp * 0.4
      };
      break;
    }
    case 'flee': {
      // sharp turn mid-way
      const p1 = def.control1 ?? def.end;
      pos = tt < 0.5 ? quadBezier(def.start, p1, { x: p1.x, y: p1.y }, tt * 2) : quadBezier(p1, p1, def.end, (tt - 0.5) * 2);
      break;
    }
    case 'formation':
      pos = lerpV(def.start, def.end, tt);
      break;
    case 'depth': {
      // travels along path while oscillating in depth (handled via returned depth)
      pos = lerpV(def.start, def.end, tt);
      break;
    }
  }
  return pos;
}

/** Depth (0 back .. 1 front) at time t. */
export function depthAt(def: TrajectoryDef, t: number): number {
  const tt = Math.max(0, Math.min(1, t));
  const baseDepth = def.depth ?? 1;
  if (def.kind === 'depth') return Math.sin(tt * Math.PI * 2) * 0.5 + 0.5;
  return baseDepth;
}

/** Evaluate position/velocity/depth at normalized time t. */
export function evaluate(def: TrajectoryDef, t: number): SampleResult {
  const tt = Math.max(0, Math.min(1, t));
  const pos = positionAt(def, tt);
  const dt = 0.002;
  const ahead = positionAt(def, Math.min(1, tt + dt));
  const dtSec = (dt * def.duration) / 1000;
  const velX = (ahead.x - pos.x) / dtSec;
  const velY = (ahead.y - pos.y) / dtSec;
  const speed = Math.hypot(velX, velY);
  const angle = Math.atan2(velY, velX);
  return { pos, speed, angle, depth: depthAt(def, tt), done: tt >= 1 };
}
