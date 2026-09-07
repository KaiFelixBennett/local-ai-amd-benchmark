import type { TrajectoryKind, Vector2 } from '../core/types';

export interface TrajectoryParams {
  kind: TrajectoryKind;
  start: Vector2;
  end: Vector2;
  control1: Vector2;
  control2: Vector2;
  amplitude: number;
  frequency: number;
  durationMs: number;
  spiralTurns: number;
  spiralRadius: number;
  formationOffset: Vector2;
  windStrength: number;
}

export interface TrajectorySample {
  position: Vector2;
  /** 0 = fully background/far, 1 = fully foreground/near. Drives scale + draw order. */
  depth01: number;
  /** Heading in radians, for banking/tilt animation. */
  heading: number;
  /** True once the fraction-of-duration has reached 1 (natural despawn point). */
  finished: boolean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec(a: Vector2, b: Vector2, t: number): Vector2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function cubicBezier(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, t: number): Vector2 {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function headingBetween(a: Vector2, b: Vector2): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Pure evaluation of a target's position at a given elapsed time. No Phaser dependency. */
export function sampleTrajectory(params: TrajectoryParams, elapsedMs: number): TrajectorySample {
  const t = Math.min(1, Math.max(0, elapsedMs / Math.max(1, params.durationMs)));
  const finished = elapsedMs >= params.durationMs;
  const dt = 1 / 240;
  let position: Vector2;
  let depth01 = 0.5;

  switch (params.kind) {
    case 'straight': {
      position = lerpVec(params.start, params.end, t);
      break;
    }
    case 'bezier': {
      position = cubicBezier(params.start, params.control1, params.control2, params.end, t);
      break;
    }
    case 'sine': {
      const base = lerpVec(params.start, params.end, t);
      const dx = params.end.x - params.start.x;
      const dy = params.end.y - params.start.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const wave = Math.sin(t * Math.PI * 2 * params.frequency) * params.amplitude;
      position = { x: base.x + nx * wave, y: base.y + ny * wave };
      break;
    }
    case 'spiral': {
      const base = lerpVec(params.start, params.end, t);
      const angle = t * Math.PI * 2 * params.spiralTurns;
      const radius = params.spiralRadius * (1 - t * 0.3);
      position = { x: base.x + Math.cos(angle) * radius, y: base.y + Math.sin(angle) * radius * 0.6 };
      break;
    }
    case 'diveBomb': {
      const easeIn = t < 0.4 ? t / 0.4 : 1;
      const preDive = lerpVec(params.start, { x: params.start.x, y: params.start.y }, easeIn);
      const diveT = t < 0.4 ? 0 : (t - 0.4) / 0.6;
      const eased = diveT * diveT;
      position = {
        x: lerp(preDive.x, params.end.x, t),
        y: t < 0.4 ? params.start.y : lerp(params.start.y, params.end.y, eased),
      };
      depth01 = 0.4 + eased * 0.6;
      break;
    }
    case 'zigzag': {
      const base = lerpVec(params.start, params.end, t);
      const dx = params.end.x - params.start.x;
      const dy = params.end.y - params.start.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const segment = Math.floor(t * params.frequency * 4);
      const zig = segment % 2 === 0 ? 1 : -1;
      const localT = (t * params.frequency * 4) % 1;
      const wave = zig * params.amplitude * (localT < 0.5 ? localT * 2 : (1 - localT) * 2);
      position = { x: base.x + nx * wave, y: base.y + ny * wave };
      break;
    }
    case 'hover': {
      const hoverStart = 0.35;
      const hoverEnd = 0.65;
      if (t < hoverStart) {
        position = lerpVec(params.start, lerpVec(params.start, params.end, hoverStart), t / hoverStart);
      } else if (t < hoverEnd) {
        const hoverT = (t - hoverStart) / (hoverEnd - hoverStart);
        const hoverPos = lerpVec(params.start, params.end, hoverStart);
        position = {
          x: hoverPos.x + Math.sin(hoverT * Math.PI * 4) * params.amplitude * 0.3,
          y: hoverPos.y + Math.cos(hoverT * Math.PI * 3) * params.amplitude * 0.2,
        };
      } else {
        const tailT = (t - hoverEnd) / (1 - hoverEnd);
        position = lerpVec(lerpVec(params.start, params.end, hoverEnd), params.end, tailT);
      }
      break;
    }
    case 'flee': {
      const easeOut = 1 - (1 - t) * (1 - t);
      position = lerpVec(params.start, params.end, easeOut);
      break;
    }
    case 'formation': {
      const base = lerpVec(params.start, params.end, t);
      const wave = Math.sin(t * Math.PI * 2 * params.frequency) * params.amplitude * 0.4;
      position = {
        x: base.x + params.formationOffset.x + params.windStrength * 20 * Math.sin(t * 4),
        y: base.y + params.formationOffset.y + wave,
      };
      break;
    }
    case 'depthDrift': {
      const base = lerpVec(params.start, params.end, t);
      depth01 = 0.5 + Math.sin(t * Math.PI * 2 * params.frequency) * 0.5;
      position = base;
      break;
    }
    default: {
      position = lerpVec(params.start, params.end, t);
    }
  }

  // wind drift applies to every kind for a coherent "weather affects everything" feel
  if (params.windStrength !== 0) {
    position = { x: position.x + params.windStrength * 60 * t, y: position.y };
  }

  const next = elapsedMs + dt * 1000 <= params.durationMs ? elapsedMs + dt * 1000 : elapsedMs - dt * 1000;
  const nextT = Math.min(1, Math.max(0, next / Math.max(1, params.durationMs)));
  const nextPos =
    params.kind === 'straight' || params.kind === 'bezier'
      ? lerpVec(params.start, params.end, nextT)
      : position;
  const heading = headingBetween(position, nextPos) || headingBetween(params.start, params.end);

  return { position, depth01: clamp01(depth01), heading, finished };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
