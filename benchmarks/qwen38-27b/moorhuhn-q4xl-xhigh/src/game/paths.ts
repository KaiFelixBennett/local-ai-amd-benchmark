/**
 * Datengetriebenes Flugbahn-System.
 * Alle Bahnen liefern Position+Orientierung als Funktion der Zeit (s).
 * Einseedet über Rng → Daily Challenge reproduzierbar.
 */
import { Rng } from '../core/rng';
import type { Vec2 } from '../core/types';

export type PathKind =
  | 'line'
  | 'bezier'
  | 'sine'
  | 'spiral'
  | 'dive'
  | 'zigzag'
  | 'hover'
  | 'formation'
  | 'depth';

export interface PathInstance {
  kind: PathKind;
  /** Startposition (Screen-Koordinaten, Tiefe 1.0). */
  start: Vec2;
  /** Geschwindigkeit px/s. */
  speed: number;
  /** Richtungsvektor (normiert). */
  dir: Vec2;
  /** Amplitude. */
  amp: number;
  /** Frequenz (Rad/s). */
  freq: number;
  /** Phase-Offset. */
  phase: number;
  /** Dauer in s (ab dann gilt "aus dem Bildschirm" als beendet). */
  duration: number;
  /** Hover: Wartezeit am Ziel. */
  hoverTime: number;
  /** Zigzag: Wechseldauer. */
  zigTime: number;
  /** Depth: Tiefenwechsel-Ziel. */
  depthTarget: number;
  /** Depth: Wechseldauer. */
  depthTime: number;
  /** Spiralen-Radius. */
  radius: number;
  /** Bezier-Kontrollpunkte. */
  cp1: Vec2;
  cp2: Vec2;
  end: Vec2;
}

export interface PathSample {
  pos: Vec2;
  angle: number;
  depth: number;
  speed: number;
}

/** Erzeugt eine neue Flugbahn für die Zielart. */
export function createPath(
  rng: Rng,
  kind: PathKind,
  w: number,
  h: number,
  depth: number,
  speed: number,
): PathInstance {
  const margin = 120;
  const side = rng.int(0, 3); // 0=links, 1=rechts, 2=oben, 3=unten
  let start: Vec2;
  let dir: Vec2;
  switch (side) {
    case 0:
      start = { x: -margin, y: rng.range(h * 0.1, h * 0.75) };
      dir = { x: 1, y: rng.range(-0.25, 0.25) };
      break;
    case 1:
      start = { x: w + margin, y: rng.range(h * 0.1, h * 0.75) };
      dir = { x: -1, y: rng.range(-0.25, 0.25) };
      break;
    case 2:
      start = { x: rng.range(w * 0.1, w * 0.9), y: -margin };
      dir = { x: rng.range(-0.2, 0.2), y: 1 };
      break;
    default:
      start = { x: rng.range(w * 0.1, w * 0.9), y: h + margin };
      dir = { x: rng.range(-0.2, 0.2), y: -1 };
  }
  const len = Math.hypot(dir.x, dir.y) || 1;
  dir = { x: dir.x / len, y: dir.y / len };

  const end: Vec2 = {
    x: start.x + dir.x * (w + 400),
    y: start.y + dir.y * (h + 400),
  };

  const inst: PathInstance = {
    kind,
    start,
    speed,
    dir,
    amp: rng.range(30, 90) / depth,
    freq: rng.range(1.2, 3.2),
    phase: rng.range(0, Math.PI * 2),
    duration: (w + 800) / speed + 4,
    hoverTime: 0,
    zigTime: rng.range(0.35, 0.8),
    depthTarget: depth,
    depthTime: 1.5,
    radius: rng.range(60, 140),
    cp1: { x: 0, y: 0 },
    cp2: { x: 0, y: 0 },
    end,
  };

  if (kind === 'bezier') {
    const perp = { x: -dir.y, y: dir.x };
    const off1 = rng.range(-0.35, 0.35) * (w + 400);
    const off2 = rng.range(-0.35, 0.35) * (w + 400);
    inst.cp1 = { x: start.x + dir.x * (w + 400) * 0.33 + perp.x * off1, y: start.y + dir.y * (w + 400) * 0.33 + perp.y * off1 };
    inst.cp2 = { x: start.x + dir.x * (w + 400) * 0.66 + perp.x * off2, y: start.y + dir.y * (w + 400) * 0.66 + perp.y * off2 };
  }
  if (kind === 'dive') {
    inst.dir = { x: dir.x, y: 0.85 };
    inst.amp = 10;
  }
  if (kind === 'hover') {
    inst.hoverTime = 1.5;
  }
  if (kind === 'depth') {
    inst.depthTarget = rng.range(0.55, 1.45);
    inst.depthTime = rng.range(1.2, 2.5);
  }
  return inst;
}

/** Bilineare Interpolation für Bezier (cubisch). */
function cubicBezier(t: number, p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Sample der Position zur Zeit t (s) auf der Bahn.
 * depth wird intern mitgeführt (Tiefenwechsel).
 */
export function samplePath(
  inst: PathInstance,
  t: number,
  currentDepth: number,
  w: number,
  _h: number,
  windX = 0,
): PathSample {
  let depth = currentDepth;
  const dt = Math.min(t, inst.duration);

  // Tiefe-Übergang
  if (inst.kind === 'depth') {
    const cycle = (dt % (inst.depthTime * 2)) / inst.depthTime;
    const blend = cycle < 1 ? cycle : 2 - cycle;
    depth = currentDepth + (inst.depthTarget - currentDepth) * blend * 0.5;
  }

  const travel = inst.speed * dt;
  let pos: Vec2;
  let angle: number;
  let velScale = 1;

  switch (inst.kind) {
    case 'line': {
      pos = { x: inst.start.x + inst.dir.x * travel, y: inst.start.y + inst.dir.y * travel };
      angle = Math.atan2(inst.dir.y, inst.dir.x);
      break;
    }
    case 'bezier': {
      const total = Math.hypot(inst.end.x - inst.start.x, inst.end.y - inst.start.y);
      const tt = Math.min(1, travel / total);
      pos = cubicBezier(tt, inst.start, inst.cp1, inst.cp2, inst.end);
      const next = cubicBezier(Math.min(1, tt + 0.01), inst.start, inst.cp1, inst.cp2, inst.end);
      angle = Math.atan2(next.y - pos.y, next.x - pos.x);
      break;
    }
    case 'sine': {
      const off = Math.sin(inst.freq * dt + inst.phase) * inst.amp;
      const perp = { x: -inst.dir.y, y: inst.dir.x };
      pos = {
        x: inst.start.x + inst.dir.x * travel + perp.x * off,
        y: inst.start.y + inst.dir.y * travel + perp.y * off,
      };
      angle = Math.atan2(inst.dir.y + perp.y * Math.cos(inst.freq * dt + inst.phase) * inst.freq * inst.amp, inst.dir.x + perp.x * Math.cos(inst.freq * dt + inst.phase) * inst.freq * inst.amp);
      break;
    }
    case 'spiral': {
      const r = inst.radius * (1 + 0.3 * Math.sin(inst.freq * dt + inst.phase));
      const theta = inst.freq * dt * 1.6 + inst.phase;
      pos = {
        x: inst.start.x + inst.dir.x * travel + Math.cos(theta) * r,
        y: inst.start.y + inst.dir.y * travel + Math.sin(theta) * r,
      };
      angle = Math.atan2(
        inst.dir.y * inst.speed + Math.cos(theta) * r * inst.freq * 1.6,
        inst.dir.x * inst.speed - Math.sin(theta) * r * inst.freq * 1.6,
      );
      break;
    }
    case 'dive': {
      // zunächst gerade, dann Sturzflug nach unten
      const diveStart = w * 0.5;
      if (travel < diveStart) {
        pos = { x: inst.start.x + inst.dir.x * travel, y: inst.start.y + inst.dir.y * travel };
        angle = Math.atan2(inst.dir.y, inst.dir.x);
      } else {
        const over = travel - diveStart;
        const px = inst.start.x + inst.dir.x * diveStart;
        const py = inst.start.y + inst.dir.y * diveStart;
        pos = { x: px + over * 0.4, y: py + over * 1.2 };
        angle = Math.atan2(1.2, 0.4);
        velScale = 1.6;
      }
      break;
    }
    case 'zigzag': {
      const n = Math.floor(dt / inst.zigTime);
      const frac = (dt % inst.zigTime) / inst.zigTime;
      const segTravel = travel - n * inst.speed * inst.zigTime + inst.speed * inst.zigTime;
      const perp = { x: -inst.dir.y, y: inst.dir.x };
      const off = (n % 2 === 0 ? 1 : -1) * frac * inst.amp * 1.4;
      pos = {
        x: inst.start.x + inst.dir.x * segTravel + perp.x * off,
        y: inst.start.y + inst.dir.y * segTravel + perp.y * off,
      };
      angle = Math.atan2(inst.dir.y + perp.y * (n % 2 === 0 ? 1 : -1) * 0.8, inst.dir.x + perp.x * (n % 2 === 0 ? 1 : -1) * 0.8);
      break;
    }
    case 'hover': {
      // fliegt heran, dann hält kurz in der Luft
      if (dt < inst.hoverTime) {
        pos = { x: inst.start.x + inst.dir.x * travel, y: inst.start.y + inst.dir.y * travel };
        angle = Math.atan2(inst.dir.y, inst.dir.x);
      } else {
        const px = inst.start.x + inst.dir.x * inst.hoverTime * inst.speed;
        const py = inst.start.y + inst.dir.y * inst.hoverTime * inst.speed;
        pos = {
          x: px + Math.sin(dt * 2 + inst.phase) * 6,
          y: py + Math.cos(dt * 1.7 + inst.phase) * 5,
        };
        angle = Math.sin(dt * 2) * 0.15;
      }
      break;
    }
    case 'formation': {
      // Formation wird extern gesteuert — hier lineare Basis
      pos = { x: inst.start.x + inst.dir.x * travel, y: inst.start.y + inst.dir.y * travel };
      angle = Math.atan2(inst.dir.y, inst.dir.x);
      break;
    }
    case 'depth': {
      const off = Math.sin(inst.freq * dt + inst.phase) * inst.amp * 0.5;
      const perp = { x: -inst.dir.y, y: inst.dir.x };
      pos = {
        x: inst.start.x + inst.dir.x * travel + perp.x * off,
        y: inst.start.y + inst.dir.y * travel + perp.y * off,
      };
      angle = Math.atan2(inst.dir.y, inst.dir.x);
      break;
    }
    default: {
      pos = { x: inst.start.x + inst.dir.x * travel, y: inst.start.y + inst.dir.y * travel };
      angle = Math.atan2(inst.dir.y, inst.dir.x);
    }
  }

  // Wind beeinflusst Position und Geschwindigkeit
  if (windX !== 0) {
    pos.x += windX * dt;
    velScale += windX / 400;
  }

  return { pos, angle, depth, speed: inst.speed * velScale };
}

/** Prüft, ob die Position außerhalb des Spielfelds (mit Rand) liegt. */
export function isOffscreen(pos: Vec2, w: number, h: number, margin = 160): boolean {
  return pos.x < -margin || pos.x > w + margin || pos.y < -margin || pos.y > h + margin;
}
