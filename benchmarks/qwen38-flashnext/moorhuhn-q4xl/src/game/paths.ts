import type { PathSpec } from '../core/types';

export interface PathPoint {
  x: number;
  y: number;
  depth: number; // 0 far .. 1 near
  vx: number; // world velocity (for speed-based scoring & tilt)
  vy: number;
  done: boolean; // travel complete / despawn
}

export interface PathCtx {
  width: number;
  height: number;
  wind: number; // px/s applied horizontally by weather
  startClock: number; // absolute time at spawn
}

function edgeStart(edge: PathSpec['edge'], p: PathSpec, c: PathCtx): [number, number, number, number] {
  // returns x, y, dirX, dirY
  const t = p.y0 ?? 0.5;
  switch (edge) {
    case 'left':
      return [-80, c.height * (0.12 + 0.66 * t), 1, 0];
    case 'right':
      return [c.width + 80, c.height * (0.12 + 0.66 * t), -1, 0];
    case 'top':
      return [c.width * (0.1 + 0.8 * t), -80, 0, 1];
    case 'bottom':
      return [c.width * (0.1 + 0.8 * t), c.height + 80, 0, -1];
  }
}

/**
 * Evaluate a flight path at local time t (seconds since spawn). Pure and
 * deterministic given (spec, ctx). Movement kinds: line, bezier, sine, spiral,
 * dive, zigzag, hover, formation, depth.
 */
export function evalPath(spec: PathSpec, t: number, c: PathCtx): PathPoint {
  const speed = spec.speed ?? 220;
  const length = spec.length ?? Math.max(c.width, c.height) + 240;
  const [x0, y0, dx0, dy0] = edgeStart(spec.edge, spec, c);
  const dir = spec.dir ?? 1;
  const wind = c.wind * t;

  // progress along the dominant heading
  let px = x0;
  let py = y0;
  const pd = speed * t; // distance travelled
  let depth = 0.5;
  let done = false;

  switch (spec.kind) {
    case 'line': {
      px = x0 + dx0 * dir * pd;
      py = y0 + dy0 * dir * pd;
      // slight natural drift so lines aren't sterile
      py += Math.sin(t * 2.1 + x0) * 6;
      break;
    }
    case 'bezier': {
      const ctrl = spec.ctrl ?? [[0.25, -0.25], [0.75, 0.25]];
      const ex = x0 + dx0 * dir * length;
      const ey = y0 + dy0 * dir * length;
      const u = clamp01(pd / length);
      const pts: [number, number][] = [
        [x0, y0],
        ...ctrl.map(([cx, cy]): [number, number] => [
          x0 + (ex - x0) * cx + (ey - y0) * cy,
          y0 + (ey - y0) * cx - (ex - x0) * cy,
        ]),
        [ex, ey],
      ];
      const b = cubicBezier(pts, u);
      px = b[0];
      py = b[1];
      break;
    }
    case 'sine': {
      const amp = spec.amp ?? 60;
      const freq = spec.freq ?? 1.4;
      px = x0 + dx0 * dir * pd;
      py = y0 + dy0 * dir * pd;
      if (dx0 !== 0) py += Math.sin((pd / 100) * freq * Math.PI) * amp;
      else px += Math.sin((pd / 100) * freq * Math.PI) * amp;
      break;
    }
    case 'spiral': {
      const curl = spec.curl ?? 2.2;
      const amp = spec.amp ?? 46;
      px = x0 + dx0 * dir * pd;
      py = y0 + dy0 * dir * pd;
      const r = amp * (1 - clamp01(pd / length) * 0.4);
      px += Math.cos((pd / 60) * curl) * r * (dy0 !== 0 ? 1 : 0.2);
      py += Math.sin((pd / 60) * curl) * r * (dx0 !== 0 ? 1 : 0.6);
      break;
    }
    case 'dive': {
      // level off then plunge diagonally
      const split = 0.55;
      const u = clamp01(pd / length);
      if (u < split) {
        px = x0 + dx0 * dir * pd;
        py = y0;
      } else {
        const remain = pd - length * split;
        px = x0 + dx0 * dir * (length * split + remain * 0.55);
        py = y0 + dy0 * dir * 0 + Math.sign(dy0 || -1) * remain * 0.95 + (dy0 === 0 ? remain : 0);
      }
      break;
    }
    case 'zigzag': {
      const amp = spec.amp ?? 90;
      const seg = spec.freq ? 110 * (1.4 / spec.freq) : 150;
      const u = pd / seg;
      const segIdx = Math.floor(u);
      const within = u - segIdx;
      px = x0 + dx0 * dir * pd;
      const base = y0 + dy0 * dir * pd;
      const zig = (segIdx % 2 === 0 ? 1 : -1) * (within * 2 - 1);
      py = base + (dx0 !== 0 ? zig * amp : 0);
      if (dy0 !== 0) px += zig * amp * 0.6;
      break;
    }
    case 'hover': {
      const holdAt = spec.holdAt ?? 0.45;
      const holdTime = spec.holdTime ?? 1.1;
      const stopDist = length * holdAt;
      const holdEnd = (stopDist / speed) + holdTime;
      if (t <= holdEnd) {
        px = x0 + dx0 * dir * Math.min(pd, stopDist);
        py = y0 + dy0 * dir * Math.min(pd, stopDist);
        // hovering bob
        if (pd >= stopDist) {
          py += Math.sin((t - holdEnd + holdTime) * 5) * 8;
        }
      } else {
        px = x0 + dx0 * dir * (stopDist + (t - holdEnd) * speed * 2.1);
        py = y0 + dy0 * dir * stopDist - (t - holdEnd) * speed * 1.25;
      }
      break;
    }
    case 'formation': {
      const idx = spec.formationIndex ?? 0;
      px = x0 + dx0 * dir * pd - idx * 46 - (idx % 2) * 18;
      py = y0 + dy0 * dir * pd - idx * 30 + (idx % 2) * 58;
      py += Math.sin(t * 3 + idx) * 5;
      break;
    }
    case 'depth': {
      // cross-depth glide: far/small -> near/big (or reverse)
      const d0 = spec.depthStart ?? 0.15;
      const d1 = spec.depthEnd ?? 0.95;
      const u = clamp01(t / (length / speed));
      depth = d0 + (d1 - d0) * u;
      const yb = spec.y0 ?? 0.5;
      const driftx = yb < 0.5 ? 0.62 : 0.38;
      px = c.width * driftx + dx0 * dir * (pd * 0.55) + Math.sin(t * 1.3) * 40;
      py = c.height * (0.3 + 0.4 * yb) + Math.sin(t * 0.9 + y0) * 26 - u * 60;
      if (u >= 1) done = true;
      break;
    }
  }

  px += wind;

  const margin = 220;
  if (spec.kind !== 'depth' && (px < -margin || px > c.width + margin)) done = true;
  if (py < -margin || py > c.height + margin) done = true;

  return { x: px, y: py, depth, vx: 0, vy: 0, done };
}

/** velocity estimate via finite differences (used for bank/tilt + speed score) */
export function evalVelocity(spec: PathSpec, t: number, c: PathCtx): [number, number] {
  const a = evalPath(spec, Math.max(0, t - 0.03), c);
  const b = evalPath(spec, t + 0.03, c);
  return [(b.x - a.x) / 0.06, (b.y - a.y) / 0.06];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

type Pt = [number, number];
function cubicBezier(pts: Pt[], u: number): Pt {
  const p = pts.length >= 4 ? pts.slice(0, 4) : [...pts, pts[pts.length - 1], pts[pts.length - 1]].slice(0, 4);
  const inv = 1 - u;
  const a = inv * inv * inv;
  const b = 3 * inv * inv * u;
  const c2 = 3 * inv * u * u;
  const d = u * u * u;
  return [
    a * p[0][0] + b * p[1][0] + c2 * p[2][0] + d * p[3][0],
    a * p[0][1] + b * p[1][1] + c2 * p[2][1] + d * p[3][1],
  ];
}

/** Escape path after a missed shot near a target: sharp evasive curve. */
export function escapeSpec(base: PathSpec, dirSign: 1 | -1): PathSpec {
  return {
    ...base,
    kind: 'bezier',
    dir: dirSign,
    ctrl: [
      [0.2, dirSign * -0.4],
      [0.6, dirSign * -0.55],
    ],
    speed: (base.speed ?? 240) * 1.7,
  };
}
