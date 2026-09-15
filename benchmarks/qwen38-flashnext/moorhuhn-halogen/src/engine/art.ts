/**
 * Moorland Mayhem – Featherstorm
 * Procedural texture factory. Every pixel is drawn with Canvas 2D — no external
 * assets. All keys generated here are tracked in a module-level Set so that
 * `disposeTextures` can clean the texture cache after a round.
 *
 * Deterministic: a local mulberry32 PRNG seeded from the texture key. Never
 * Math.random, so re-generating the same key yields identical art.
 */

import type Phaser from 'phaser';
import type { MapDef } from '../config/schema';
import type { QualityLevel } from '../types';
import { TARGET_IDS, BOSSES } from '../config/targets';
import { WEAPON_SKINS } from '../config/cosmetics';

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

const createdKeys = new Set<string>();

const INK = '#1c1712';
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Deterministic RNG                                                   */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface R {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
}

function rngFor(seed: string): R {
  const n = mulberry32(hashString(seed));
  return {
    next: n,
    range: (min, max) => min + (max - min) * n(),
    int: (min, max) => Math.floor(min + (max - min + 1) * n()),
    chance: (p) => n() < p,
  };
}

/* ------------------------------------------------------------------ */
/* Color helpers                                                       */
/* ------------------------------------------------------------------ */

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`;
}

function rgbStr(r: number, g: number, b: number): string {
  return `rgb(${clamp(Math.round(r), 0, 255)},${clamp(Math.round(g), 0, 255)},${clamp(Math.round(b), 0, 255)})`;
}

/** amt in [-1..1]: positive lightens toward white, negative darkens toward black. */
function shade(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex);
  if (amt >= 0) {
    return rgbStr(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  }
  const k = 1 + amt;
  return rgbStr(r * k, g * k, b * k);
}

/* ------------------------------------------------------------------ */
/* Canvas plumbing                                                     */
/* ------------------------------------------------------------------ */

type DrawFn = (ctx: CanvasRenderingContext2D, rng: R) => void;

function addCanvas(
  scene: Phaser.Scene,
  key: string,
  baseW: number,
  baseH: number,
  quality: QualityLevel,
  draw: DrawFn,
): void {
  if (scene.textures.exists(key)) return;
  const factor = quality === 'low' ? 0.5 : 1;
  const w = Math.max(2, Math.round(baseW * factor));
  const h = Math.max(2, Math.round(baseH * factor));
  try {
    const tex = scene.textures.createCanvas(key, w, h) as Phaser.Textures.CanvasTexture | null;
    if (!tex) return;
    createdKeys.add(key);
    const ctx = tex.getContext();
    ctx.save();
    ctx.scale(factor, factor);
    try {
      draw(ctx, rngFor(key));
    } finally {
      ctx.restore();
    }
    tex.refresh();
  } catch {
    // A failure on one texture must never crash the round; the key stays tracked
    // so disposeTextures() still removes whatever was created.
  }
}

/* ------------------------------------------------------------------ */
/* Drawing primitives                                                  */
/* ------------------------------------------------------------------ */

type Pt = readonly [number, number];

/** Closed, smooth curve through the given points (midpoint quadratic technique). */
function smoothClosedPath(ctx: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  const n = pts.length;
  ctx.beginPath();
  const last = pts[n - 1];
  const first = pts[0];
  ctx.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const nx = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + nx[0]) / 2, (p[1] + nx[1]) / 2);
  }
  ctx.closePath();
}

/** Rounded layered blob with deterministic wobble. */
function blobPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  wobble: number,
  rng: R,
  count = 12,
): void {
  const pts: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const j = 1 + (rng.next() * 2 - 1) * wobble;
    pts.push([cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j]);
  }
  smoothClosedPath(ctx, pts);
}

function ink(ctx: CanvasRenderingContext2D, width = 3): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

function vGrad(
  ctx: CanvasRenderingContext2D,
  y0: number,
  y1: number,
  stops: readonly (readonly [number, string])[],
): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function lGrad(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: readonly (readonly [number, string])[],
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** Big glossy cartoon eye: white sclera, dark pupil offset, dual highlights. */
function drawEye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pupilDx = 0.18, pupilDy = 0.15): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = '#f8f5ec';
  ctx.fill();
  ink(ctx, Math.max(1.6, r * 0.3));
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x + r * pupilDx * 1.6, y + r * pupilDy, r * 0.55, 0, TAU);
  ctx.fillStyle = '#231b12';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x - r * 0.32, y - r * 0.42, r * 0.26, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.34, y + r * 0.3, r * 0.12, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();
}

/** Emissive eye for ghosts / owls — colored pupil with a bloom halo. */
function glowEye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = '#101018';
  ctx.fill();
  ink(ctx, Math.max(1.4, r * 0.25));
  ctx.stroke();
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 2.2;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(x - r * 0.28, y - r * 0.32, r * 0.18, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

/** Leaf-shaped feather along +x, base at origin. */
function featherShape(ctx: CanvasRenderingContext2D, len: number, wid: number): void {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.45, -wid, len, 0);
  ctx.quadraticCurveTo(len * 0.45, wid, 0, 0);
  ctx.closePath();
}

function featherRib(ctx: CanvasRenderingContext2D, len: number): void {
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.lineTo(len * 0.92, 0);
  ctx.strokeStyle = rgba(INK, 0.35);
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

function fourPointStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.28;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Rounded rect built from beziers (no dependency on ctx.roundRect). */
function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function teardrop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - h * 0.5);
  ctx.bezierCurveTo(x + w * 0.55, y - h * 0.1, x + w * 0.5, y + h * 0.5, x, y + h * 0.5);
  ctx.bezierCurveTo(x - w * 0.5, y + h * 0.5, x - w * 0.55, y - h * 0.1, x, y - h * 0.5);
  ctx.closePath();
}

function softPuff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
  g.addColorStop(0, rgba(color, 0.85));
  g.addColorStop(0.6, rgba(color, 0.4));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/* ------------------------------------------------------------------ */
/* Metal / armor helpers                                               */
/* ------------------------------------------------------------------ */

function drawPlate(
  ctx: CanvasRenderingContext2D,
  pts: readonly Pt[],
  steelTop: string,
  steelBottom: string,
  rivets: readonly Pt[],
): void {
  smoothClosedPath(ctx, pts);
  const ys = pts.map((p) => p[1]);
  ctx.fillStyle = vGrad(ctx, Math.min(...ys), Math.max(...ys) + 1, [
    [0, steelTop],
    [1, steelBottom],
  ]);
  ctx.fill();
  ink(ctx, 2.4);
  ctx.stroke();
  // specular streak
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  const x0 = Math.min(...pts.map((p) => p[0]));
  ctx.beginPath();
  ctx.moveTo(x0 - 4, Math.min(...ys) - 2);
  ctx.lineTo(x0 + 10, Math.min(...ys) - 2);
  ctx.lineTo(x0 + 2, Math.max(...ys) + 2);
  ctx.lineTo(x0 - 12, Math.max(...ys) + 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // rivets
  for (const [rx, ry] of rivets) {
    ctx.beginPath();
    ctx.arc(rx, ry, 2, 0, TAU);
    ctx.fillStyle = shade(steelTop, -0.35);
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.8);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rx - 0.6, ry - 0.7, 0.8, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
  }
}

/** Jagged crack polyline across a region, for damaged armor levels. */
function crackLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, rng: R): void {
  const steps = 5;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const mx = x0 + (x1 - x0) * t + (rng.next() * 2 - 1) * 5;
    const my = y0 + (y1 - y0) * t + (rng.next() * 2 - 1) * 4;
    ctx.lineTo(mx, my);
  }
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = 'rgba(20,14,8,0.9)';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/* ------------------------------------------------------------------ */
/* Bird specs + generic bird renderer                                  */
/* ------------------------------------------------------------------ */

type WingStyle = 'flappy' | 'dart' | 'glider' | 'moth' | 'wispy';

interface BirdSpec {
  body: string;
  belly: string;
  wing: string;
  wingDark: string;
  beak: string;
  style: WingStyle;
  scale: number;
  alpha: number;
  ghost: boolean;
  armor: boolean;
  skull: boolean;
  streaks: boolean;
  corkscrew: boolean;
  sparkle: boolean;
  goofy: boolean;
  moonSpots: boolean;
  crest: 'none' | 'wave';
  glowEyes: string;
}

function spec(
  body: string,
  belly: string,
  wing: string,
  wingDark: string,
  beak: string,
  style: WingStyle,
  over: Partial<BirdSpec> = {},
): BirdSpec {
  return {
    body,
    belly,
    wing,
    wingDark,
    beak,
    style,
    scale: 1,
    alpha: 1,
    ghost: false,
    armor: false,
    skull: false,
    streaks: false,
    corkscrew: false,
    sparkle: false,
    goofy: false,
    moonSpots: false,
    crest: 'none',
    glowEyes: '',
    ...over,
  };
}

const BIRD_SPECS: Record<string, BirdSpec> = {
  moorflatterer: spec('#8a6a42', '#d9b87e', '#6f7d3c', '#55602e', '#f2b13c', 'flappy', {
    goofy: true,
  }),
  schnellfeder: spec('#2f9c96', '#bfe8df', '#1f7f88', '#155e66', '#ffd166', 'dart', {
    scale: 0.66,
  }),
  korkenzieher: spec('#2aa0a8', '#c8f0ea', '#1d8090', '#125f6c', '#f2b13c', 'flappy', {
    corkscrew: true,
  }),
  panzerpelz: spec('#7a6a52', '#b09a72', '#5f5340', '#463c2e', '#c9c2b4', 'flappy', {
    armor: true,
    scale: 1.08,
  }),
  goldschnabel: spec('#e8b53a', '#ffe9a8', '#c9962e', '#a3761f', '#ffdf7a', 'flappy', {
    sparkle: true,
  }),
  nebelfluesterer: spec('#a8b8c8', '#dde8f0', '#8898ac', '#6a7a8c', '#cfd8e0', 'flappy', {
    ghost: true,
    alpha: 0.62,
    glowEyes: '#7fe8ff',
  }),
  taeuscher: spec('#b8b04a', '#ece4a4', '#96903a', '#6f6a2c', '#e8c86a', 'flappy', {
    skull: true,
  }),
  schwarmvogel: spec('#6a7c96', '#c6d4e0', '#556782', '#3d4c64', '#e8b054', 'flappy', {
    scale: 0.7,
  }),
  kurvensegler: spec('#8c6a5a', '#e4ccb8', '#6f5244', '#4f3a30', '#d89858', 'glider'),
  sturmvogel: spec('#4a4f5a', '#bcc0c8', '#3a3f4a', '#282c34', '#d0d4da', 'flappy', {
    streaks: true,
  }),
  schilfgeist: spec('#7ac88a', '#d4f0dc', '#5aa86e', '#3f7a50', '#c8e8c8', 'wispy', {
    ghost: true,
    alpha: 0.55,
    glowEyes: '#b8ffc8',
  }),
  wellenreiter: spec('#3ac0d8', '#d2f4fa', '#2a9ab4', '#1d7890', '#ffd166', 'dart', {
    crest: 'wave',
    scale: 0.85,
  }),
  mondglider: spec('#b8a8d8', '#efe6fa', '#9a8ac0', '#77699c', '#d8c8e8', 'moth', {
    moonSpots: true,
  }),
};

const WING_ANGLES = [-1.25, -0.45, 0.5, -0.05];
const BODY_TILTS = [-0.07, 0, 0.08, 0.03];

/** Single smooth body+head path (bird faces +x, origin at body center). */
function birdBodyPath(ctx: CanvasRenderingContext2D, rng: R): void {
  const j = (v: number): number => v + (rng.next() * 2 - 1) * 1.4;
  const pts: Pt[] = [
    [j(20), j(-32)], // head top
    [j(40), j(-22)], // head right
    [j(34), j(-10)], // jaw
    [j(16), j(12)], // chest
    [j(-4), j(18)], // belly
    [j(-22), j(14)], // rear belly
    [j(-30), j(4)], // tail base
    [j(-28), j(-6)], // back rear
    [j(-12), j(-16)], // back mid
    [j(8), j(-24)], // neck
  ];
  smoothClosedPath(ctx, pts);
}

function paintBody(ctx: CanvasRenderingContext2D, spec_: BirdSpec, rng: R): void {
  birdBodyPath(ctx, rng);
  const fillTop = shade(spec_.body, 0.22);
  const fillBot = shade(spec_.body, -0.22);
  ctx.fillStyle = spec_.ghost
    ? vGrad(ctx, -34, 20, [
        [0, rgba(fillTop, 0.55)],
        [1, rgba(fillBot, 0.4)],
      ])
    : vGrad(ctx, -34, 20, [
        [0, fillTop],
        [0.55, spec_.body],
        [1, fillBot],
      ]);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();

  // belly patch
  ctx.beginPath();
  ctx.ellipse(2, 9, 17, 10, -0.12, 0, TAU);
  ctx.fillStyle = spec_.ghost ? rgba(spec_.belly, 0.5) : spec_.belly;
  ctx.fill();

  // soft top-light
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.ellipse(-2, -22, 26, 8, -0.15, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawBeak(ctx: CanvasRenderingContext2D, spec_: BirdSpec): void {
  ctx.beginPath();
  ctx.moveTo(33, -26);
  ctx.lineTo(59, -18);
  ctx.lineTo(31, -8);
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, 33, -18, 59, -14, [
    [0, shade(spec_.beak, 0.2)],
    [1, shade(spec_.beak, -0.25)],
  ]);
  ctx.fill();
  ink(ctx, 2.6);
  ctx.stroke();
}

function drawHeadDecor(ctx: CanvasRenderingContext2D, spec_: BirdSpec, rng: R): void {
  if (spec_.goofy) {
    // a second, smaller googly eye peeking above
    drawEye(ctx, 21, -27, 4.5, -0.1, -0.3);
    // wispy hair tuft
    ctx.strokeStyle = shade(spec_.body, -0.3);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, -32);
    ctx.quadraticCurveTo(16, -42, 22, -46);
    ctx.moveTo(23, -33);
    ctx.quadraticCurveTo(26, -42, 21, -47);
    ctx.stroke();
  }
  if (spec_.crest === 'wave') {
    // wave-curl crest: a curling cyan plume off the head
    ctx.save();
    ctx.strokeStyle = shade(spec_.body, 0.35);
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(22, -32);
    ctx.bezierCurveTo(28, -44, 40, -42, 38, -32);
    ctx.stroke();
    ctx.strokeStyle = shade(spec_.belly, 0.2);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(25, -33);
    ctx.bezierCurveTo(30, -40, 36, -39, 35, -33);
    ctx.stroke();
    ctx.restore();
  }
  if (spec_.corkscrew) {
    // spiral shading across the body
    ctx.save();
    ctx.strokeStyle = rgba(shade(spec_.body, -0.35), 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const a = t * TAU * 1.6;
      const rr = 3 + t * 14;
      const px = -2 + Math.cos(a) * rr * 1.2;
      const py = 2 + Math.sin(a) * rr * 0.7;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }
  if (spec_.streaks) {
    ctx.strokeStyle = 'rgba(240,244,248,0.75)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-18, -8);
    ctx.quadraticCurveTo(-4, -6, 10, -12);
    ctx.moveTo(-14, -2);
    ctx.quadraticCurveTo(0, 0, 12, -6);
    ctx.stroke();
  }
  if (spec_.skull) {
    // tiny dark skull belly mark
    const sx = 2;
    const sy = 9;
    ctx.save();
    ctx.fillStyle = 'rgba(28,22,14,0.85)';
    ctx.beginPath();
    ctx.arc(sx, sy - 1.5, 3.4, 0, TAU);
    ctx.fill();
    ctx.fillRect(sx - 2.4, sy + 1, 4.8, 2.4);
    ctx.fillStyle = 'rgba(240,230,200,0.9)';
    ctx.beginPath();
    ctx.arc(sx - 1.3, sy - 1.8, 0.9, 0, TAU);
    ctx.arc(sx + 1.3, sy - 1.8, 0.9, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  void rng;
}

function drawEyes(ctx: CanvasRenderingContext2D, spec_: BirdSpec): void {
  if (spec_.glowEyes) {
    glowEye(ctx, 31, -22, 6.2, spec_.glowEyes);
  } else if (spec_.goofy) {
    drawEye(ctx, 32, -21, 7.4, -0.22, 0.25);
  } else {
    drawEye(ctx, 31, -22, 6.4, 0.16, 0.12);
  }
}

function wingFillGrad(ctx: CanvasRenderingContext2D, base: string): CanvasGradient {
  return lGrad(ctx, 0, -14, 0, 52, [
    [0, shade(base, 0.2)],
    [1, shade(base, -0.22)],
  ]);
}

function featherFan(
  ctx: CanvasRenderingContext2D,
  len: number,
  wid: number,
  offsets: readonly number[],
  grad: CanvasGradient,
  ribbed: boolean,
): void {
  for (const da of offsets) {
    ctx.save();
    ctx.rotate(da);
    featherShape(ctx, len, wid);
    ctx.fillStyle = grad;
    ctx.fill();
    ink(ctx, 2.4);
    ctx.stroke();
    if (ribbed) featherRib(ctx, len);
    ctx.restore();
  }
}

function drawWing(ctx: CanvasRenderingContext2D, spec_: BirdSpec, phase: number, far: boolean, rng: R): void {
  const ang = WING_ANGLES[phase] * (far ? 0.85 : 1) + (far ? -0.2 : 0);
  const base = far ? spec_.wingDark : spec_.wing;
  const grad = wingFillGrad(ctx, base);

  ctx.save();
  ctx.translate(2, -5);
  ctx.rotate(ang);

  if (spec_.style === 'flappy') {
    featherFan(ctx, 50, 12, [-0.36, 0, 0.36], grad, true);
  } else if (spec_.style === 'dart') {
    ctx.rotate(-0.25);
    featherFan(ctx, 52, 7, [-0.18, 0.14], grad, false);
    // sharp wing-tip accent
    ctx.beginPath();
    ctx.moveTo(8, -2);
    ctx.lineTo(56, 2);
    ctx.strokeStyle = rgba(shade(base, 0.4), 0.7);
    ctx.lineWidth = 1.6;
    ctx.stroke();
  } else if (spec_.style === 'glider') {
    featherFan(ctx, 66, 7, [-0.14, 0.02, 0.16], grad, true);
    // long finger feathers splayed at the tip
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(52, -2 + i * 3);
      ctx.rotate(0.12 + i * 0.14);
      featherShape(ctx, 18, 2.4);
      ctx.fillStyle = shade(base, -0.1);
      ctx.fill();
      ink(ctx, 1.4);
      ctx.stroke();
      ctx.restore();
    }
  } else if (spec_.style === 'moth') {
    // broad rounded upper wing
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(20, -40, 56, -34, 52, -6);
    ctx.bezierCurveTo(48, 6, 22, 10, 0, 4);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ink(ctx, 2.8);
    ctx.stroke();
    // lower wing
    ctx.save();
    ctx.rotate(0.75);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(14, -22, 38, -18, 34, -2);
    ctx.bezierCurveTo(30, 8, 14, 8, 0, 4);
    ctx.closePath();
    ctx.fillStyle = shade(base, -0.12);
    ctx.fill();
    ink(ctx, 2.4);
    ctx.stroke();
    ctx.restore();
    if (spec_.moonSpots) {
      for (const [sx, sy, sr] of [
        [34, -16, 7],
        [22, 2, 4.5],
      ] as const) {
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, TAU);
        ctx.fillStyle = shade(spec_.body, -0.35);
        ctx.fill();
        ctx.strokeStyle = rgba(spec_.belly, 0.9);
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sx - sr * 0.25, sy - sr * 0.25, sr * 0.4, 0, TAU);
        ctx.fillStyle = rgba(spec_.belly, 0.75);
        ctx.fill();
      }
    }
  } else {
    // wispy — glowing translucent streaks
    ctx.save();
    ctx.shadowColor = rgba(base, 0.9);
    ctx.shadowBlur = 8;
    ctx.strokeStyle = rgba(base, 0.65);
    for (let i = 0; i < 3; i++) {
      const w = 0.28 + i * 0.24 + rng.next() * 0.08;
      ctx.lineWidth = 3.4 - i * 0.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(20, -26 * w * 2, 40, -18 * w, 58, 4 * w);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawTail(ctx: CanvasRenderingContext2D, spec_: BirdSpec, rng: R): void {
  ctx.save();
  ctx.translate(-28, 2);
  ctx.rotate(0.12);
  const base = shade(spec_.wing, -0.08);
  if (spec_.style === 'dart') {
    for (const da of [-0.32, 0.32]) {
      ctx.save();
      ctx.rotate(da);
      featherShape(ctx, 34, 3);
      ctx.fillStyle = base;
      ctx.fill();
      ink(ctx, 1.8);
      ctx.stroke();
      ctx.restore();
    }
  } else if (spec_.style === 'glider') {
    for (const da of [-0.16, 0.16]) {
      ctx.save();
      ctx.rotate(da);
      featherShape(ctx, 30, 2.6);
      ctx.fillStyle = base;
      ctx.fill();
      ink(ctx, 1.6);
      ctx.stroke();
      ctx.restore();
    }
  } else if (spec_.style === 'wispy') {
    ctx.save();
    ctx.shadowColor = rgba(base, 0.8);
    ctx.shadowBlur = 6;
    ctx.strokeStyle = rgba(base, 0.55);
    for (let i = 0; i < 3; i++) {
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-16, -8 + i * 8 + rng.next() * 3, -28, -10 + i * 10);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    const grad = wingFillGrad(ctx, base);
    featherFan(ctx, 26, 8, [-0.35, 0, 0.35], grad, true);
  }
  ctx.restore();
}

function drawPanzerPlates(ctx: CanvasRenderingContext2D, level: number, rng: R): void {
  const steelTop = '#c6ccd2';
  const steelBot = '#6a7178';
  const plates: readonly (readonly Pt[])[] = [
    [
      [-22, -22],
      [2, -26],
      [7, -9],
      [-19, -7],
    ],
    [
      [2, -26],
      [23, -19],
      [21, -5],
      [7, -9],
    ],
    [
      [-19, -7],
      [7, -9],
      [13, 8],
      [-16, 9],
    ],
    [
      [21, -5],
      [30, -10],
      [30, 2],
      [20, 6],
    ],
    [
      [-30, -8],
      [-22, -22],
      [-19, -7],
      [-28, 0],
    ],
  ];
  const present: readonly number[] = level <= 1 ? [0, 1, 2, 3, 4] : level === 2 ? [0, 1, 3] : [1];
  for (const idx of present) {
    const p = plates[idx];
    const cxs = p.reduce((s, q) => s + q[0], 0) / p.length;
    const cys = p.reduce((s, q) => s + q[1], 0) / p.length;
    const rivets: Pt[] = [
      [cxs - 5, cys - 4],
      [cxs + 5, cys - 4],
      [cxs, cys + 5],
    ];
    drawPlate(ctx, p, steelTop, steelBot, rivets);
  }
  if (level >= 2) {
    // scorch where plates blew off
    ctx.save();
    softPuff(ctx, -16, 2, 12, '#241a10');
    softPuff(ctx, 10, 12, 9, '#2a1e12');
    ctx.restore();
  }
  if (level >= 1) {
    crackLine(ctx, -18, -24, -6, -4, rng);
    crackLine(ctx, 8, -22, 18, -8, rng);
    if (level >= 2) {
      crackLine(ctx, -26, -6, 14, 10, rng);
      crackLine(ctx, 24, -2, 30, 4, rng);
    }
  }
}

function drawBird(ctx: CanvasRenderingContext2D, w: number, h: number, phase: number, spec_: BirdSpec, rng: R): void {
  ctx.save();
  ctx.globalAlpha = spec_.alpha;
  ctx.translate(w / 2, h / 2 + 2);
  ctx.rotate(BODY_TILTS[phase]);
  ctx.scale(spec_.scale, spec_.scale);

  if (spec_.sparkle) {
    // golden aura
    const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 54);
    g.addColorStop(0, 'rgba(255,220,120,0.5)');
    g.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 54, 0, TAU);
    ctx.fill();
  }

  drawWing(ctx, spec_, phase, true, rng);
  drawTail(ctx, spec_, rng);
  drawBeak(ctx, spec_);
  paintBody(ctx, spec_, rng);
  drawHeadDecor(ctx, spec_, rng);
  if (spec_.armor) drawPanzerPlates(ctx, 0, rng);
  drawWing(ctx, spec_, phase, false, rng);
  drawEyes(ctx, spec_);

  if (spec_.sparkle) {
    ctx.save();
    ctx.shadowColor = 'rgba(255,215,80,0.95)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#fff2b8';
    for (let i = 0; i < 7; i++) {
      const a = rng.next() * TAU;
      const r = 30 + rng.next() * 22;
      fourPointStar(ctx, Math.cos(a) * r, Math.sin(a) * r * 0.7, 3 + rng.next() * 2.5);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Boss renderers                                                      */
/* ------------------------------------------------------------------ */

function drawEisenmoor(ctx: CanvasRenderingContext2D, phase: number, rng: R): void {
  const breathe = [-0.015, 0.005, 0.02, 0][phase];
  const wing = [-1.0, -0.35, 0.55, 0][phase];
  ctx.save();
  ctx.translate(128, 132);
  ctx.rotate(0.05 + breathe * 0.6);
  ctx.scale(1 + breathe, 1 + breathe);

  const feather = '#5c4a32';
  const featherDark = '#3e3122';
  const steelTop = '#cdd3d9';
  const steelBot = '#666d74';

  // tail fan
  ctx.save();
  ctx.translate(-56, -6);
  ctx.rotate(0.2);
  for (let i = -2; i <= 2; i++) {
    ctx.save();
    ctx.rotate(i * 0.3);
    featherShape(ctx, 66, 13);
    ctx.fillStyle = lGrad(ctx, 0, 0, 66, 0, [
      [0, featherDark],
      [1, feather],
    ]);
    ctx.fill();
    ink(ctx, 2.6);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // far wing
  ctx.save();
  ctx.translate(-8, -22);
  ctx.rotate(wing * 0.8 - 0.15);
  featherFan(ctx, 62, 18, [-0.28, 0.05], wingFillGrad(ctx, featherDark), true);
  ctx.restore();

  // body
  blobPath(ctx, 0, 16, 66, 52, 0.05, rng);
  ctx.fillStyle = vGrad(ctx, -40, 70, [
    [0, shade(feather, 0.25)],
    [1, shade(feather, -0.3)],
  ]);
  ctx.fill();
  ink(ctx, 3.6);
  ctx.stroke();

  // bolted armor plates
  const plates: readonly (readonly Pt[])[] = [
    [
      [-52, -8],
      [-16, -34],
      [-8, -6],
      [-46, 12],
    ],
    [
      [-16, -34],
      [26, -38],
      [22, -8],
      [-8, -6],
    ],
    [
      [26, -38],
      [52, -22],
      [44, -2],
      [22, -8],
    ],
    [
      [-46, 12],
      [-8, -6],
      [22, -8],
      [16, 30],
      [-38, 30],
    ],
    [
      [22, -8],
      [44, -2],
      [46, 24],
      [16, 30],
    ],
  ];
  for (const p of plates) {
    const cxs = p.reduce((s, q) => s + q[0], 0) / p.length;
    const cys = p.reduce((s, q) => s + q[1], 0) / p.length;
    drawPlate(ctx, p, steelTop, steelBot, [
      [cxs - 10, cys - 6],
      [cxs + 10, cys - 6],
      [cxs, cys + 10],
    ]);
  }
  // big rivet band across the chest
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(-30 + i * 16, 22, 3.2, 0, TAU);
    ctx.fillStyle = shade(steelBot, -0.2);
    ctx.fill();
    ink(ctx, 1.4);
    ctx.stroke();
  }

  // head
  const hx = 56;
  const hy = -52;
  ctx.beginPath();
  ctx.arc(hx, hy, 30, 0, TAU);
  ctx.fillStyle = vGrad(ctx, hy - 30, hy + 30, [
    [0, shade(feather, 0.3)],
    [1, shade(feather, -0.2)],
  ]);
  ctx.fill();
  ink(ctx, 3.4);
  ctx.stroke();

  // metal half-mask over the skull
  ctx.beginPath();
  ctx.moveTo(hx - 26, hy - 8);
  ctx.quadraticCurveTo(hx, hy - 40, hx + 26, hy - 8);
  ctx.quadraticCurveTo(hx, hy - 18, hx - 26, hy - 8);
  ctx.closePath();
  ctx.fillStyle = vGrad(ctx, hy - 40, hy, [
    [0, steelTop],
    [1, steelBot],
  ]);
  ctx.fill();
  ink(ctx, 2.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hx - 12, hy - 22, 2.4, 0, TAU);
  ctx.arc(hx + 12, hy - 22, 2.4, 0, TAU);
  ctx.fillStyle = shade(steelBot, -0.3);
  ctx.fill();

  // comb + wattle
  ctx.beginPath();
  ctx.fillStyle = '#c0392b';
  for (let i = 0; i < 4; i++) {
    ctx.moveTo(hx - 14 + i * 9, hy - 26);
    ctx.quadraticCurveTo(hx - 10 + i * 9, hy - 44 - (i % 2) * 4, hx - 2 + i * 9, hy - 28);
  }
  ctx.fill();
  ink(ctx, 2.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(hx + 18, hy + 8);
  ctx.quadraticCurveTo(hx + 26, hy + 22, hx + 14, hy + 24);
  ctx.quadraticCurveTo(hx + 10, hy + 16, hx + 18, hy + 8);
  ctx.fillStyle = '#d34a3a';
  ctx.fill();
  ink(ctx, 2.2);
  ctx.stroke();

  // beak
  ctx.beginPath();
  ctx.moveTo(hx + 22, hy - 8);
  ctx.lineTo(hx + 56, hy - 2);
  ctx.lineTo(hx + 22, hy + 8);
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, hx + 22, 0, hx + 56, 0, [
    [0, '#f2c14e'],
    [1, '#b97f24'],
  ]);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();

  // angry eye + brow
  drawEye(ctx, hx + 6, hy - 2, 8, 0.3, 0.05);
  ctx.beginPath();
  ctx.moveTo(hx - 6, hy - 12);
  ctx.lineTo(hx + 18, hy - 6);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.6;
  ctx.stroke();

  // near wing
  ctx.save();
  ctx.translate(6, -18);
  ctx.rotate(wing);
  featherFan(ctx, 70, 20, [-0.3, 0.05, 0.36], wingFillGrad(ctx, feather), true);
  ctx.restore();

  // legs + talons
  for (const lx of [-14, 16]) {
    ctx.beginPath();
    ctx.moveTo(lx, 56);
    ctx.lineTo(lx - 2, 88);
    ctx.strokeStyle = '#a2701f';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.stroke();
    ink(ctx, 2.4);
    ctx.stroke();
    for (const da of [-0.7, 0, 0.7]) {
      ctx.save();
      ctx.translate(lx - 2, 88);
      ctx.rotate(da + Math.PI / 2);
      featherShape(ctx, 16, 4);
      ctx.fillStyle = '#e8b53a';
      ctx.fill();
      ink(ctx, 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
  void rng;
}

function drawBlitzschnabel(ctx: CanvasRenderingContext2D, phase: number, rng: R): void {
  const tilt = [-0.12, -0.04, 0.06, 0][phase];
  const wing = [-1.35, -0.5, 0.65, -0.1][phase];
  ctx.save();
  ctx.translate(128, 132);
  ctx.rotate(tilt);

  const body = '#2f83b8';
  const bodyDark = '#1c5a86';

  // trailing tail streamers
  ctx.strokeStyle = bodyDark;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(-48, 4 + i * 6);
    ctx.bezierCurveTo(-70, 4 + i * 12, -86, 10 + i * 16, -96, 6 + i * 22);
    ctx.stroke();
  }

  // far wing
  ctx.save();
  ctx.translate(-6, -12);
  ctx.rotate(wing * 0.8 - 0.18);
  featherFan(ctx, 78, 11, [-0.16, 0.12], wingFillGrad(ctx, bodyDark), false);
  ctx.restore();

  // streamlined body
  ctx.beginPath();
  ctx.moveTo(-52, 6);
  ctx.bezierCurveTo(-36, -26, 18, -30, 52, -12);
  ctx.bezierCurveTo(64, -6, 62, 12, 44, 20);
  ctx.bezierCurveTo(10, 32, -34, 28, -52, 6);
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, 0, -28, 0, 30, [
    [0, shade(body, 0.3)],
    [0.6, body],
    [1, shade(body, -0.3)],
  ]);
  ctx.fill();
  ink(ctx, 3.4);
  ctx.stroke();

  // speed chevron markings
  ctx.strokeStyle = 'rgba(210,240,255,0.7)';
  ctx.lineWidth = 2.6;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-26 + i * 14, 14);
    ctx.lineTo(-18 + i * 14, 2);
    ctx.lineTo(-26 + i * 14, -6);
    ctx.stroke();
  }

  // head
  ctx.beginPath();
  ctx.arc(58, -12, 20, 0, TAU);
  ctx.fillStyle = vGrad(ctx, -32, 8, [
    [0, shade(body, 0.28)],
    [1, shade(body, -0.18)],
  ]);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();

  // lightning-bolt crest
  ctx.beginPath();
  ctx.moveTo(44, -26);
  ctx.lineTo(52, -46);
  ctx.lineTo(56, -34);
  ctx.lineTo(66, -52);
  ctx.lineTo(64, -30);
  ctx.lineTo(58, -24);
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, 0, -52, 0, -24, [
    [0, '#fff3a8'],
    [1, '#f2b13c'],
  ]);
  ctx.fill();
  ink(ctx, 2.6);
  ctx.stroke();

  // sharp beak
  ctx.beginPath();
  ctx.moveTo(68, -18);
  ctx.lineTo(94, -12);
  ctx.lineTo(68, -4);
  ctx.closePath();
  ctx.fillStyle = '#e8b53a';
  ctx.fill();
  ink(ctx, 2.6);
  ctx.stroke();

  drawEye(ctx, 62, -16, 7, 0.32, 0);

  // near wing (big swept acrobat wing)
  ctx.save();
  ctx.translate(4, -8);
  ctx.rotate(wing);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(24, -20, 78, -22, 96, 4);
  ctx.bezierCurveTo(72, 14, 28, 14, 0, 8);
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, 0, -14, 0, 12, [
    [0, shade(body, 0.22)],
    [1, shade(body, -0.25)],
  ]);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();
  ctx.strokeStyle = rgba(INK, 0.35);
  ctx.lineWidth = 1.6;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 22, 10 - i * 2);
    ctx.lineTo(i * 24 + 6, -10 + i);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
  void rng;
}

function drawNachtschatten(ctx: CanvasRenderingContext2D, phase: number, rng: R): void {
  const bob = [0, 4, 8, 4][phase];
  const wing = [-0.7, -0.25, 0.4, 0.05][phase];
  const ghostA = [0.92, 0.84, 0.9, 0.8][phase];
  ctx.save();
  ctx.globalAlpha = ghostA;
  ctx.translate(128, 128 + bob);

  const body = '#3c2a56';
  const bodyDark = '#26183c';
  const cyan = '#66e8ff';

  // illusion wisps — frame-varying translucent streaks
  ctx.save();
  ctx.shadowColor = rgba(cyan, 0.5);
  ctx.shadowBlur = 10;
  ctx.strokeStyle = rgba('#9a8ac0', 0.4);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + phase * 0.35;
    const r0 = 74 + rng.next() * 8;
    const r1 = 96 + rng.next() * 16;
    ctx.lineWidth = 3 + rng.next() * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.9);
    ctx.quadraticCurveTo(
      Math.cos(a + 0.5) * r1,
      Math.sin(a + 0.5) * r1 * 0.9,
      Math.cos(a + 0.9) * (r1 * 0.7),
      Math.sin(a + 0.9) * (r1 * 0.7),
    );
    ctx.stroke();
  }
  ctx.restore();

  // far wings
  for (const side of [1, -1] as const) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.translate(20, -10);
    ctx.rotate(wing * 0.7);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(40, -30, 104, -18, 110, 22);
    ctx.bezierCurveTo(80, 38, 30, 30, 0, 12);
    ctx.closePath();
    ctx.fillStyle = wingFillGrad(ctx, bodyDark);
    ctx.fill();
    ink(ctx, 3);
    ctx.stroke();
    ctx.restore();
  }

  // body
  blobPath(ctx, 0, 22, 58, 62, 0.05, rng);
  ctx.fillStyle = vGrad(ctx, -40, 86, [
    [0, shade(body, 0.22)],
    [1, shade(body, -0.35)],
  ]);
  ctx.fill();
  ink(ctx, 3.6);
  ctx.stroke();

  // feather chest scallops
  ctx.strokeStyle = rgba(shade(body, 0.4), 0.5);
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(0, 8 + i * 14, 26 - i * 3, 0.35, Math.PI - 0.35);
    ctx.stroke();
  }

  // ear tufts
  for (const side of [1, -1] as const) {
    ctx.beginPath();
    ctx.moveTo(side * 22, -52);
    ctx.lineTo(side * 40, -84);
    ctx.lineTo(side * 40, -52);
    ctx.closePath();
    ctx.fillStyle = bodyDark;
    ctx.fill();
    ink(ctx, 2.8);
    ctx.stroke();
  }

  // face disc (forward facing)
  ctx.beginPath();
  ctx.arc(0, -34, 40, 0, TAU);
  ctx.fillStyle = vGrad(ctx, -74, 6, [
    [0, shade(body, 0.35)],
    [1, shade(body, -0.1)],
  ]);
  ctx.fill();
  ink(ctx, 3.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -34, 30, 0, TAU);
  ctx.strokeStyle = rgba(shade(body, -0.3), 0.55);
  ctx.lineWidth = 2.4;
  ctx.stroke();

  // glowing cyan eyes
  glowEye(ctx, -16, -38, 11, cyan);
  glowEye(ctx, 16, -38, 11, cyan);

  // small beak
  ctx.beginPath();
  ctx.moveTo(-6, -22);
  ctx.lineTo(0, -6);
  ctx.lineTo(6, -22);
  ctx.closePath();
  ctx.fillStyle = '#c9a05a';
  ctx.fill();
  ink(ctx, 2.2);
  ctx.stroke();

  // near wings overlaying shoulders
  for (const side of [1, -1] as const) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.translate(26, 2);
    ctx.rotate(wing);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(30, -16, 84, -6, 92, 26);
    ctx.bezierCurveTo(60, 36, 24, 26, 0, 12);
    ctx.closePath();
    ctx.fillStyle = wingFillGrad(ctx, body);
    ctx.fill();
    ink(ctx, 2.8);
    ctx.stroke();
    ctx.restore();
  }

  // talons
  for (const lx of [-18, 18] as const) {
    ctx.beginPath();
    ctx.moveTo(lx, 76);
    ctx.lineTo(lx - 3, 92);
    ctx.strokeStyle = '#8a6a3a';
    ctx.lineWidth = 7;
    ctx.stroke();
    ink(ctx, 2);
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Environment props                                                   */
/* ------------------------------------------------------------------ */

type Pal = Record<string, string>;

function drawWindmillTower(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  const w = 300;
  const capY = 96;
  // tower
  ctx.beginPath();
  ctx.moveTo(w / 2 - 78, 340);
  ctx.bezierCurveTo(w / 2 - 66, 240, w / 2 - 44, 160, w / 2 - 34, capY);
  ctx.lineTo(w / 2 + 34, capY);
  ctx.bezierCurveTo(w / 2 + 44, 160, w / 2 + 66, 240, w / 2 + 78, 340);
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, w / 2 - 80, 0, w / 2 + 80, 0, [
    [0, shade(pal.woodDark, 0.1)],
    [0.5, pal.wood],
    [1, shade(pal.woodDark, -0.1)],
  ]);
  ctx.fill();
  ink(ctx, 3.4);
  ctx.stroke();
  // plank lines
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = rgba(pal.woodDark, 0.5);
  ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + i * 30, capY);
    ctx.lineTo(w / 2 + i * 46, 340);
    ctx.stroke();
  }
  ctx.restore();
  // door
  ctx.beginPath();
  ctx.moveTo(w / 2 - 22, 340);
  ctx.lineTo(w / 2 - 22, 288);
  ctx.quadraticCurveTo(w / 2, 258, w / 2 + 22, 288);
  ctx.lineTo(w / 2 + 22, 340);
  ctx.closePath();
  ctx.fillStyle = shade(pal.woodDark, -0.2);
  ctx.fill();
  ink(ctx, 2.8);
  ctx.stroke();
  // window
  ctx.beginPath();
  ctx.arc(w / 2, 190, 13, 0, TAU);
  ctx.fillStyle = rgba(pal.accent, 0.85);
  ctx.fill();
  ink(ctx, 2.4);
  ctx.stroke();
  // cap
  ctx.beginPath();
  ctx.moveTo(w / 2 - 44, capY + 4);
  ctx.quadraticCurveTo(w / 2, capY - 52, w / 2 + 44, capY + 4);
  ctx.closePath();
  ctx.fillStyle = vGrad(ctx, capY - 52, capY, [
    [0, shade(pal.wood, 0.25)],
    [1, shade(pal.woodDark, 0)],
  ]);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();
  // hub
  ctx.beginPath();
  ctx.arc(w / 2, capY, 12, 0, TAU);
  ctx.fillStyle = shade(pal.woodDark, 0.15);
  ctx.fill();
  ink(ctx, 2.6);
  ctx.stroke();
  // ground shadow
  ctx.save();
  softPuff(ctx, w / 2, 336, 70, 'rgba(0,0,0,0.25)');
  ctx.restore();
  void rng;
}

function drawWindmillBlades(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  const c = 150;
  for (let s = 0; s < 4; s++) {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate((s / 4) * TAU + Math.PI / 4);
    // spoke
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -128);
    ctx.strokeStyle = shade(pal.woodDark, 0.1);
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();
    ink(ctx, 2);
    ctx.stroke();
    // sail
    ctx.beginPath();
    ctx.moveTo(2, -124);
    ctx.lineTo(38, -124);
    ctx.lineTo(38, -30);
    ctx.lineTo(2, -30);
    ctx.closePath();
    ctx.fillStyle = rgba(shade(pal.fog, 0.1), 0.9);
    ctx.fill();
    ink(ctx, 2.6);
    ctx.stroke();
    // slats
    ctx.strokeStyle = rgba(pal.wood, 0.8);
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const y = -120 + i * 20;
      ctx.beginPath();
      ctx.moveTo(5, y);
      ctx.lineTo(35, y);
      ctx.stroke();
    }
    ctx.restore();
  }
  // hub cap
  ctx.beginPath();
  ctx.arc(c, c, 16, 0, TAU);
  ctx.fillStyle = vGrad(ctx, c - 16, c + 16, [
    [0, shade(pal.wood, 0.3)],
    [1, pal.woodDark],
  ]);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c, 5, 0, TAU);
  ctx.fillStyle = pal.accent;
  ctx.fill();
  void rng;
}

function drawLantern(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  // glow behind
  const g = ctx.createRadialGradient(64, 46, 4, 64, 46, 52);
  g.addColorStop(0, rgba(pal.accent, 0.55));
  g.addColorStop(1, rgba(pal.accent, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(64, 46, 52, 0, TAU);
  ctx.fill();
  // post
  ctx.fillStyle = pal.wood;
  roundedRectPath(ctx, 58, 62, 12, 62, 4);
  ctx.fill();
  ink(ctx, 2.6);
  ctx.stroke();
  // glass box
  roundedRectPath(ctx, 46, 26, 36, 38, 7);
  ctx.fillStyle = rgba(shade(pal.fog, 0.2), 0.4);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();
  // flame
  ctx.save();
  ctx.shadowColor = rgba(pal.sun, 0.9);
  ctx.shadowBlur = 14;
  teardrop(ctx, 64, 46, 14, 22);
  ctx.fillStyle = lGrad(ctx, 0, 34, 0, 58, [
    [0, '#fff2b0'],
    [1, shade(pal.accent, -0.05)],
  ]);
  ctx.fill();
  ctx.restore();
  // cap + ring
  ctx.beginPath();
  ctx.moveTo(42, 26);
  ctx.quadraticCurveTo(64, 6, 86, 26);
  ctx.closePath();
  ctx.fillStyle = shade(pal.woodDark, 0.12);
  ctx.fill();
  ink(ctx, 2.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(64, 12, 6, 0, TAU);
  ctx.strokeStyle = shade(pal.woodDark, -0.1);
  ctx.lineWidth = 3;
  ctx.stroke();
  void rng;
}

function drawCans(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  // fence post + rail
  ctx.fillStyle = pal.wood;
  roundedRectPath(ctx, 56, 52, 16, 72, 4);
  ctx.fill();
  ink(ctx, 2.8);
  ctx.stroke();
  ctx.fillStyle = shade(pal.wood, -0.12);
  roundedRectPath(ctx, 20, 92, 88, 10, 4);
  ctx.fill();
  ink(ctx, 2.4);
  ctx.stroke();
  // three cans
  const can = (x: number, y: number, tilt: number): void => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    roundedRectPath(ctx, -11, -20, 22, 36, 5);
    const g = lGrad(ctx, -11, 0, 11, 0, [
      [0, '#9aa2a8'],
      [0.45, '#d8dde2'],
      [1, '#7e868c'],
    ]);
    ctx.fillStyle = g;
    ctx.fill();
    ink(ctx, 2.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -20, 11, 4, 0, 0, TAU);
    ctx.fillStyle = '#b8bfc4';
    ctx.fill();
    ink(ctx, 1.8);
    ctx.stroke();
    ctx.fillStyle = rgba(pal.accent, 0.75);
    roundedRectPath(ctx, -11, -6, 22, 9, 2);
    ctx.fill();
    ctx.restore();
  };
  can(52, 40, -0.12);
  can(76, 38, 0.1);
  can(64, 14, 0.02);
  void rng;
}

function drawSign(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  ctx.fillStyle = pal.wood;
  roundedRectPath(ctx, 58, 58, 12, 66, 4);
  ctx.fill();
  ink(ctx, 2.8);
  ctx.stroke();
  ctx.save();
  ctx.translate(64, 44);
  ctx.rotate(-0.08);
  roundedRectPath(ctx, -42, -24, 84, 46, 8);
  ctx.fillStyle = lGrad(ctx, 0, -24, 0, 22, [
    [0, shade(pal.wood, 0.28)],
    [1, shade(pal.wood, -0.15)],
  ]);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();
  // painted arrow
  ctx.fillStyle = rgba(pal.accent, 0.85);
  ctx.beginPath();
  ctx.moveTo(-26, -2);
  ctx.lineTo(12, -2);
  ctx.lineTo(12, -9);
  ctx.lineTo(28, 2);
  ctx.lineTo(12, 12);
  ctx.lineTo(12, 5);
  ctx.lineTo(-26, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // nails
  for (const [nx, ny] of [
    [30, -16],
    [58, 22],
  ] as const) {
    ctx.beginPath();
    ctx.arc(nx + 34, ny, 1.8, 0, TAU);
    ctx.fillStyle = rgba(INK, 0.8);
    ctx.fill();
  }
  void rng;
}

function drawBell(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  // hanger
  ctx.strokeStyle = shade(pal.woodDark, 0.1);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(64, 4);
  ctx.lineTo(64, 24);
  ctx.stroke();
  // bell body
  ctx.beginPath();
  ctx.moveTo(64, 24);
  ctx.bezierCurveTo(44, 26, 40, 58, 34, 78);
  ctx.lineTo(94, 78);
  ctx.bezierCurveTo(88, 58, 84, 26, 64, 24);
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, 34, 0, 94, 0, [
    [0, '#b8862e'],
    [0.45, '#f2cf7a'],
    [1, '#8a5f1f'],
  ]);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();
  // rim
  roundedRectPath(ctx, 30, 76, 68, 10, 4);
  ctx.fillStyle = '#c99a3a';
  ctx.fill();
  ink(ctx, 2.6);
  ctx.stroke();
  // clapper
  ctx.beginPath();
  ctx.arc(64, 90, 5, 0, TAU);
  ctx.fillStyle = shade(pal.woodDark, 0.2);
  ctx.fill();
  ink(ctx, 2);
  ctx.stroke();
  // shine
  ctx.strokeStyle = 'rgba(255,244,200,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(52, 34);
  ctx.quadraticCurveTo(46, 54, 44, 70);
  ctx.stroke();
  // ring on top
  ctx.beginPath();
  ctx.arc(64, 22, 6, 0, TAU);
  ctx.strokeStyle = '#b8862e';
  ctx.lineWidth = 3;
  ctx.stroke();
  void rng;
}

function drawRope(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  const col = shade(pal.wood, 0.35);
  for (let r = 0; r < 2; r++) {
    const x0 = 44 + r * 40;
    ctx.strokeStyle = r === 0 ? col : shade(col, -0.15);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, 4);
    ctx.bezierCurveTo(x0 - 8, 40, x0 + 10, 78, x0 + (r === 0 ? 6 : -6), 118);
    ctx.stroke();
    ink(ctx, 1.8);
    ctx.stroke();
    // braid ticks
    ctx.strokeStyle = rgba(INK, 0.35);
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const t = 0.12 + i * 0.15;
      const y = 4 + 114 * t;
      const dx = Math.sin(t * 7 + r) * 6;
      ctx.beginPath();
      ctx.moveTo(x0 + dx - 4, y - 3);
      ctx.lineTo(x0 + dx + 4, y + 3);
      ctx.stroke();
    }
  }
  // knot
  ctx.beginPath();
  ctx.arc(50, 62, 8, 0, TAU);
  ctx.fillStyle = shade(col, -0.2);
  ctx.fill();
  ink(ctx, 2.4);
  ctx.stroke();
  void rng;
}

function drawScarecrow(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  // cross posts
  ctx.strokeStyle = pal.woodDark;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(64, 124);
  ctx.lineTo(64, 30);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(22, 54);
  ctx.lineTo(106, 48);
  ctx.stroke();
  // coat
  ctx.beginPath();
  ctx.moveTo(38, 50);
  ctx.lineTo(90, 46);
  ctx.lineTo(96, 96);
  ctx.lineTo(32, 100);
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, 0, 46, 0, 100, [
    [0, shade(pal.hillMid, 0.28)],
    [1, shade(pal.hillMid, -0.05)],
  ]);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();
  // straw at neck + sleeves
  const straw = shade(pal.accent, -0.1);
  ctx.strokeStyle = straw;
  ctx.lineWidth = 2.2;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo(52 + i * 4, 48);
    ctx.lineTo(48 + i * 5 + rng.next() * 4, 38 + rng.next() * 6);
    ctx.stroke();
  }
  for (const sx of [24, 104] as const) {
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(sx, 50);
      ctx.lineTo(sx + (sx < 64 ? -10 : 10) + rng.next() * 4, 44 + i * 5);
      ctx.stroke();
    }
  }
  // sack head
  blobPath(ctx, 64, 28, 20, 17, 0.1, rng);
  ctx.fillStyle = lGrad(ctx, 0, 10, 0, 46, [
    [0, shade(pal.wood, 0.5)],
    [1, shade(pal.wood, 0.15)],
  ]);
  ctx.fill();
  ink(ctx, 2.8);
  ctx.stroke();
  // stitched seam
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = rgba(INK, 0.6);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(50, 16);
  ctx.quadraticCurveTo(64, 12, 78, 16);
  ctx.stroke();
  ctx.setLineDash([]);
  // button eyes + stitched grin
  ctx.beginPath();
  ctx.arc(57, 26, 3.4, 0, TAU);
  ctx.arc(72, 26, 3.4, 0, TAU);
  ctx.fillStyle = pal.accent;
  ctx.fill();
  ink(ctx, 1.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(55, 34);
  ctx.quadraticCurveTo(64, 40, 74, 33);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  // floppy hat
  ctx.beginPath();
  ctx.ellipse(64, 14, 28, 7, 0.04, 0, TAU);
  ctx.fillStyle = shade(pal.woodDark, 0.1);
  ctx.fill();
  ink(ctx, 2.6);
  ctx.stroke();
  roundedRectPath(ctx, 50, -2, 28, 16, 6);
  ctx.fill();
  ink(ctx, 2.6);
  ctx.stroke();
}

function drawReeds(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  for (let i = 0; i < 7; i++) {
    const x = 18 + i * 15 + rng.range(-3, 3);
    const top = 18 + rng.range(0, 26);
    const bend = rng.range(-8, 8);
    const col = i % 2 === 0 ? pal.reed : shade(pal.reed, -0.15);
    ctx.beginPath();
    ctx.moveTo(x, 124);
    ctx.quadraticCurveTo(x + bend * 0.4, (top + 124) / 2, x + bend, top);
    ctx.strokeStyle = col;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.stroke();
    ink(ctx, 1.2);
    ctx.stroke();
    if (i % 3 === 0) {
      // cattail head
      ctx.beginPath();
      ctx.ellipse(x + bend, top - 1, 4.5, 12, (bend / 60) | 0, 0, TAU);
      ctx.fillStyle = shade(pal.reedDark, -0.2);
      ctx.fill();
      ink(ctx, 2);
      ctx.stroke();
    }
  }
}

function drawPumpkin(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  const g = vGrad(ctx, 30, 120, [
    [0, '#ff9c3c'],
    [1, '#c85a14'],
  ]);
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.ellipse(64 + i * 16, 78, 22 - Math.abs(i) * 4, 40 - Math.abs(i) * 4, 0, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();
    ink(ctx, 2.4);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(52, 60, 8, 14, -0.3, 0, TAU);
  ctx.fillStyle = 'rgba(255,220,150,0.35)';
  ctx.fill();
  // stem
  ctx.beginPath();
  ctx.moveTo(60, 40);
  ctx.quadraticCurveTo(58, 24, 68, 20);
  ctx.quadraticCurveTo(72, 30, 68, 42);
  ctx.closePath();
  ctx.fillStyle = shade(pal.reedDark, 0.1);
  ctx.fill();
  ink(ctx, 2.6);
  ctx.stroke();
  void rng;
}

function drawMushroom(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  // stalk
  ctx.beginPath();
  ctx.moveTo(56, 120);
  ctx.quadraticCurveTo(52, 84, 58, 62);
  ctx.lineTo(72, 62);
  ctx.quadraticCurveTo(76, 90, 74, 120);
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, 52, 0, 80, 0, [
    [0, '#f2e6cc'],
    [1, '#c8b492'],
  ]);
  ctx.fill();
  ink(ctx, 2.8);
  ctx.stroke();
  // cap
  ctx.beginPath();
  ctx.moveTo(28, 64);
  ctx.bezierCurveTo(30, 22, 98, 22, 100, 64);
  ctx.quadraticCurveTo(64, 76, 28, 64);
  ctx.closePath();
  ctx.fillStyle = vGrad(ctx, 22, 72, [
    [0, '#e8523a'],
    [1, '#a8281c'],
  ]);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();
  // spots
  for (let i = 0; i < 5; i++) {
    const a = rng.range(0.15, 0.85) * Math.PI;
    const rr = rng.range(8, 26);
    ctx.beginPath();
    ctx.arc(64 + Math.cos(a) * rr, 52 - Math.abs(Math.sin(a)) * 14 + 8, rng.range(3, 6), 0, TAU);
    ctx.fillStyle = '#f8f0dc';
    ctx.fill();
  }
  // tiny grass at base
  ctx.strokeStyle = pal.reedDark;
  ctx.lineWidth = 2;
  for (const gx of [50, 80] as const) {
    ctx.beginPath();
    ctx.moveTo(gx, 122);
    ctx.quadraticCurveTo(gx + 3, 112, gx + 7, 108);
    ctx.stroke();
  }
}

function drawWater(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  ctx.beginPath();
  ctx.moveTo(6, 20);
  ctx.quadraticCurveTo(64, 8, 122, 20);
  ctx.quadraticCurveTo(126, 52, 100, 58);
  ctx.quadraticCurveTo(64, 66, 26, 58);
  ctx.quadraticCurveTo(2, 50, 6, 20);
  ctx.closePath();
  ctx.fillStyle = vGrad(ctx, 8, 62, [
    [0, shade(pal.water, 0.25)],
    [1, shade(pal.water, -0.15)],
  ]);
  ctx.fill();
  ink(ctx, 2.6);
  ctx.stroke();
  // ripples
  ctx.strokeStyle = rgba(pal.waterLight, 0.9);
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const y = 26 + i * 11;
    ctx.beginPath();
    ctx.moveTo(20 + i * 10, y);
    ctx.quadraticCurveTo(64, y + (i % 2 === 0 ? 6 : -4), 108 - i * 8, y);
    ctx.stroke();
  }
  // glints
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(rng.range(24, 104), rng.range(20, 50), 1.6, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
  }
}

function drawHollow(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  // trunk chunk
  blobPath(ctx, 64, 68, 44, 52, 0.07, rng);
  ctx.fillStyle = lGrad(ctx, 20, 0, 110, 0, [
    [0, shade(pal.woodDark, 0.18)],
    [0.5, shade(pal.wood, -0.05)],
    [1, shade(pal.woodDark, 0)],
  ]);
  ctx.fill();
  ink(ctx, 3.2);
  ctx.stroke();
  // bark texture
  ctx.strokeStyle = rgba(pal.woodDark, 0.55);
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(22 + i * 26, 22);
    ctx.quadraticCurveTo(18 + i * 28, 68, 26 + i * 24, 114);
    ctx.stroke();
  }
  // dark opening
  ctx.beginPath();
  ctx.ellipse(64, 74, 24, 30, 0.05, 0, TAU);
  ctx.fillStyle = '#0e0a06';
  ctx.fill();
  ctx.strokeStyle = shade(pal.woodDark, -0.25);
  ctx.lineWidth = 5;
  ctx.stroke();
  // inner rim glow
  ctx.beginPath();
  ctx.ellipse(64, 74, 20, 26, 0.05, 0, TAU);
  ctx.strokeStyle = rgba(pal.accent, 0.25);
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawWagon(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  // shafts
  ctx.strokeStyle = pal.woodDark;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(20, 62);
  ctx.lineTo(64, 70);
  ctx.moveTo(20, 84);
  ctx.lineTo(64, 84);
  ctx.stroke();
  // bed
  roundedRectPath(ctx, 54, 44, 128, 52, 10);
  ctx.fillStyle = lGrad(ctx, 0, 44, 0, 96, [
    [0, shade(pal.wood, 0.25)],
    [1, shade(pal.wood, -0.2)],
  ]);
  ctx.fill();
  ink(ctx, 3.2);
  ctx.stroke();
  // planks
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = rgba(pal.woodDark, 0.5);
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(54 + i * 32, 44);
    ctx.lineTo(54 + i * 32, 96);
    ctx.stroke();
  }
  ctx.restore();
  // side rail
  roundedRectPath(ctx, 50, 34, 136, 12, 5);
  ctx.fillStyle = shade(pal.woodDark, 0.12);
  ctx.fill();
  ink(ctx, 2.6);
  ctx.stroke();
  // wheels
  for (const wx of [86, 152] as const) {
    ctx.beginPath();
    ctx.arc(wx, 104, 24, 0, TAU);
    ctx.fillStyle = shade(pal.woodDark, 0.05);
    ctx.fill();
    ink(ctx, 3);
    ctx.stroke();
    ctx.strokeStyle = pal.wood;
    ctx.lineWidth = 4;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      ctx.beginPath();
      ctx.moveTo(wx, 104);
      ctx.lineTo(wx + Math.cos(a) * 20, 104 + Math.sin(a) * 20);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(wx, 104, 6, 0, TAU);
    ctx.fillStyle = pal.accent;
    ctx.fill();
    ink(ctx, 2);
    ctx.stroke();
  }
  // scattered hay in the bed
  ctx.strokeStyle = rgba(shade(pal.accent, -0.1), 0.8);
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const hx = 64 + i * 15 + rng.range(-3, 3);
    ctx.beginPath();
    ctx.moveTo(hx, 44);
    ctx.lineTo(hx + rng.range(-6, 6), 32 + rng.range(-4, 4));
    ctx.stroke();
  }
}

function drawBottle(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  ctx.beginPath();
  ctx.moveTo(56, 118);
  ctx.lineTo(56, 66);
  ctx.quadraticCurveTo(56, 52, 60, 44);
  ctx.lineTo(60, 22);
  ctx.lineTo(72, 22);
  ctx.lineTo(72, 44);
  ctx.quadraticCurveTo(76, 52, 76, 66);
  ctx.lineTo(76, 118);
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, 56, 0, 76, 0, [
    [0, rgba('#3f7a4a', 0.9)],
    [0.45, rgba('#78b878', 0.9)],
    [1, rgba('#2a5432', 0.9)],
  ]);
  ctx.fill();
  ink(ctx, 2.8);
  ctx.stroke();
  // cork
  roundedRectPath(ctx, 59, 12, 14, 12, 3);
  ctx.fillStyle = shade(pal.wood, 0.35);
  ctx.fill();
  ink(ctx, 2.2);
  ctx.stroke();
  // label
  roundedRectPath(ctx, 57, 76, 18, 26, 4);
  ctx.fillStyle = 'rgba(240,228,190,0.92)';
  ctx.fill();
  ink(ctx, 1.8);
  ctx.stroke();
  ctx.fillStyle = rgba(pal.accent, 0.8);
  roundedRectPath(ctx, 60, 84, 12, 8, 2);
  ctx.fill();
  // shine
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(61, 58);
  ctx.lineTo(61, 108);
  ctx.stroke();
  void rng;
}

function drawLighthouse(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  const cx = 100;
  // base rocks
  blobPath(ctx, cx, 350, 86, 26, 0.12, rng);
  ctx.fillStyle = shade(pal.hillNear, 0.12);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();
  // tower
  ctx.beginPath();
  ctx.moveTo(cx - 52, 336);
  ctx.bezierCurveTo(cx - 44, 250, cx - 32, 170, cx - 28, 120);
  ctx.lineTo(cx + 28, 120);
  ctx.bezierCurveTo(cx + 32, 170, cx + 44, 250, cx + 52, 336);
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, cx - 52, 0, cx + 52, 0, [
    [0, shade(pal.fog, -0.2)],
    [0.45, pal.fog],
    [1, shade(pal.fog, -0.35)],
  ]);
  ctx.fill();
  ink(ctx, 3.2);
  ctx.stroke();
  // stripes
  ctx.save();
  ctx.clip();
  ctx.fillStyle = rgba(shade(pal.accent, -0.45), 0.85);
  for (let i = 0; i < 5; i++) {
    const y = 140 + i * 42;
    ctx.beginPath();
    ctx.moveTo(cx - 60, y);
    ctx.lineTo(cx + 60, y - 16);
    ctx.lineTo(cx + 60, y + 12);
    ctx.lineTo(cx - 60, y + 28);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // gallery
  roundedRectPath(ctx, cx - 42, 108, 84, 14, 6);
  ctx.fillStyle = shade(pal.woodDark, 0.15);
  ctx.fill();
  ink(ctx, 2.8);
  ctx.stroke();
  // lamp room
  roundedRectPath(ctx, cx - 26, 66, 52, 44, 8);
  ctx.fillStyle = rgba(pal.sun, 0.9);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = rgba(pal.accent, 0.9);
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.arc(cx, 88, 14, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  // mullions
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 26, 88);
  ctx.lineTo(cx + 26, 88);
  ctx.moveTo(cx, 66);
  ctx.lineTo(cx, 110);
  ctx.stroke();
  // roof
  ctx.beginPath();
  ctx.moveTo(cx - 30, 66);
  ctx.quadraticCurveTo(cx, 24, cx + 30, 66);
  ctx.closePath();
  ctx.fillStyle = vGrad(ctx, 24, 66, [
    [0, shade(pal.accent, -0.3)],
    [1, shade(pal.accent, -0.6)],
  ]);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, 26, 4, 0, TAU);
  ctx.fillStyle = pal.accent;
  ctx.fill();
  // door
  ctx.beginPath();
  ctx.moveTo(cx - 14, 336);
  ctx.lineTo(cx - 14, 306);
  ctx.quadraticCurveTo(cx, 288, cx + 14, 306);
  ctx.lineTo(cx + 14, 336);
  ctx.closePath();
  ctx.fillStyle = shade(pal.woodDark, -0.15);
  ctx.fill();
  ink(ctx, 2.6);
  ctx.stroke();
}

function drawWeathervane(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  const cx = 64;
  // post
  ctx.strokeStyle = pal.woodDark;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, 124);
  ctx.lineTo(cx, 46);
  ctx.stroke();
  // cardinal cross
  ctx.strokeStyle = shade(pal.fog, -0.3);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 34, 66);
  ctx.lineTo(cx + 34, 66);
  ctx.moveTo(cx, 40);
  ctx.lineTo(cx, 80);
  ctx.stroke();
  ink(ctx, 1.4);
  ctx.stroke();
  // cardinal arrow (points right = wind)
  ctx.save();
  ctx.translate(cx, 52);
  ctx.rotate(-0.12);
  ctx.beginPath();
  ctx.moveTo(-30, 0);
  ctx.lineTo(26, 0);
  ctx.strokeStyle = shade(pal.fog, -0.1);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(40, 0);
  ctx.lineTo(20, -8);
  ctx.lineTo(20, 8);
  ctx.closePath();
  ctx.fillStyle = pal.accent;
  ctx.fill();
  ink(ctx, 2.2);
  ctx.stroke();
  // tail fletching
  ctx.beginPath();
  ctx.moveTo(-30, -8);
  ctx.lineTo(-18, 0);
  ctx.lineTo(-30, 8);
  ctx.closePath();
  ctx.fillStyle = shade(pal.accent, -0.25);
  ctx.fill();
  ink(ctx, 2);
  ctx.stroke();
  ctx.restore();
  // rooster silhouette on top
  ctx.save();
  ctx.translate(cx, 26);
  ctx.scale(0.9, 0.9);
  ctx.beginPath();
  ctx.moveTo(-10, 8);
  ctx.quadraticCurveTo(-14, -4, -4, -6);
  ctx.quadraticCurveTo(2, -12, 6, -8);
  ctx.quadraticCurveTo(14, -12, 12, -4);
  ctx.quadraticCurveTo(18, -2, 12, 2);
  ctx.quadraticCurveTo(4, 10, -10, 8);
  ctx.closePath();
  ctx.fillStyle = INK;
  ctx.fill();
  // comb
  ctx.beginPath();
  ctx.moveTo(4, -8);
  ctx.quadraticCurveTo(6, -16, 10, -12);
  ctx.quadraticCurveTo(12, -16, 14, -10);
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  void rng;
}

function drawBuoy(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  // body — bell-shaped float
  ctx.beginPath();
  ctx.moveTo(40, 108);
  ctx.bezierCurveTo(34, 76, 46, 46, 64, 42);
  ctx.bezierCurveTo(82, 46, 94, 76, 88, 108);
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, 34, 0, 94, 0, [
    [0, shade(pal.accent, -0.35)],
    [0.45, shade(pal.accent, 0.25)],
    [1, shade(pal.accent, -0.5)],
  ]);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();
  // stripes
  ctx.save();
  ctx.clip();
  ctx.fillStyle = rgba(pal.fog, 0.85);
  ctx.fillRect(30, 62, 70, 10);
  ctx.fillRect(30, 86, 70, 10);
  ctx.restore();
  // top ring
  ctx.beginPath();
  ctx.arc(64, 40, 8, 0, TAU);
  ctx.strokeStyle = shade(pal.woodDark, 0.2);
  ctx.lineWidth = 4;
  ctx.stroke();
  // waterline drips
  ctx.strokeStyle = rgba(pal.waterLight, 0.8);
  ctx.lineWidth = 2;
  for (const dx of [44, 64, 84] as const) {
    ctx.beginPath();
    ctx.moveTo(dx, 108);
    ctx.quadraticCurveTo(dx + 2, 116, dx, 122);
    ctx.stroke();
  }
  void rng;
}

function drawBarrel(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  ctx.beginPath();
  ctx.moveTo(42, 116);
  ctx.bezierCurveTo(34, 86, 34, 52, 42, 26);
  ctx.lineTo(86, 26);
  ctx.bezierCurveTo(94, 52, 94, 86, 86, 116);
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, 34, 0, 94, 0, [
    [0, shade(pal.woodDark, 0.15)],
    [0.5, shade(pal.wood, 0.1)],
    [1, shade(pal.woodDark, 0)],
  ]);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();
  // staves
  ctx.strokeStyle = rgba(pal.woodDark, 0.5);
  ctx.lineWidth = 2;
  for (const x of [56, 64, 72] as const) {
    ctx.beginPath();
    ctx.moveTo(x, 26);
    ctx.quadraticCurveTo(x + (x < 64 ? -4 : 4), 71, x, 116);
    ctx.stroke();
  }
  // hoops
  ctx.fillStyle = shade('#8a8f96', -0.15);
  for (const y of [40, 96] as const) {
    roundedRectPath(ctx, 33, y, 62, 9, 4);
    ctx.fill();
    ink(ctx, 2.2);
    ctx.stroke();
  }
  // top ellipse
  ctx.beginPath();
  ctx.ellipse(64, 26, 22, 7, 0, 0, TAU);
  ctx.fillStyle = shade(pal.wood, 0.28);
  ctx.fill();
  ink(ctx, 2.6);
  ctx.stroke();
  void rng;
}

function drawCrate(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  roundedRectPath(ctx, 22, 24, 84, 84, 8);
  ctx.fillStyle = lGrad(ctx, 0, 24, 0, 108, [
    [0, shade(pal.wood, 0.25)],
    [1, shade(pal.wood, -0.2)],
  ]);
  ctx.fill();
  ink(ctx, 3.2);
  ctx.stroke();
  // planks
  ctx.strokeStyle = rgba(pal.woodDark, 0.5);
  ctx.lineWidth = 2;
  for (const y of [45, 66, 87] as const) {
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(104, y);
    ctx.stroke();
  }
  // X brace
  ctx.strokeStyle = shade(pal.wood, -0.1);
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(28, 30);
  ctx.lineTo(100, 102);
  ctx.moveTo(100, 30);
  ctx.lineTo(28, 102);
  ctx.stroke();
  ink(ctx, 1.6);
  ctx.stroke();
  // nails
  for (const [nx, ny] of [
    [30, 32],
    [98, 32],
    [30, 100],
    [98, 100],
  ] as const) {
    ctx.beginPath();
    ctx.arc(nx, ny, 1.8, 0, TAU);
    ctx.fillStyle = rgba(INK, 0.8);
    ctx.fill();
  }
  void rng;
}

function drawWisp(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  ctx.save();
  ctx.shadowColor = rgba(pal.accent, 0.9);
  ctx.shadowBlur = 26;
  const g = ctx.createRadialGradient(64, 60, 2, 64, 60, 30);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.4, rgba(pal.accent, 0.9));
  g.addColorStop(1, rgba(pal.accent, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(64, 60, 30, 0, TAU);
  ctx.fill();
  ctx.restore();
  // orbiting motes
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, TAU);
    const r = rng.range(28, 42);
    ctx.beginPath();
    ctx.arc(64 + Math.cos(a) * r, 60 + Math.sin(a) * r * 0.8, rng.range(1.6, 3.2), 0, TAU);
    ctx.fillStyle = rgba(pal.accent, 0.85);
    ctx.fill();
  }
  // tail wisp
  ctx.strokeStyle = rgba(pal.accent, 0.35);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(64, 84);
  ctx.quadraticCurveTo(56, 102, 66, 116);
  ctx.stroke();
}

function drawStone(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  blobPath(ctx, 64, 68, 34, 46, 0.09, rng);
  ctx.fillStyle = lGrad(ctx, 28, 0, 100, 0, [
    [0, shade(pal.hillFar, 0.3)],
    [0.55, shade(pal.hillFar, 0.05)],
    [1, shade(pal.hillNear, 0.05)],
  ]);
  ctx.fill();
  ink(ctx, 3.2);
  ctx.stroke();
  // glowing runes
  ctx.save();
  ctx.shadowColor = rgba(pal.accent, 0.9);
  ctx.shadowBlur = 12;
  ctx.strokeStyle = rgba(pal.accent, 0.95);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(56, 44);
  ctx.lineTo(72, 44);
  ctx.moveTo(64, 44);
  ctx.lineTo(64, 62);
  ctx.moveTo(54, 70);
  ctx.lineTo(74, 84);
  ctx.moveTo(74, 70);
  ctx.lineTo(54, 84);
  ctx.stroke();
  ctx.restore();
  // moss
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(rng.range(38, 90), rng.range(96, 110), rng.range(2, 4), 0, TAU);
    ctx.fillStyle = rgba(pal.reed, 0.5);
    ctx.fill();
  }
}

function drawFlowers(ctx: CanvasRenderingContext2D, rng: R, pal: Pal): void {
  const flower = (x: number, y: number, r: number, hue: string): void => {
    ctx.save();
    ctx.shadowColor = rgba(hue, 0.8);
    ctx.shadowBlur = 12;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.55, r * 0.32, a, 0, TAU);
      ctx.fillStyle = rgba(hue, 0.85);
      ctx.fill();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.4, 0, TAU);
    ctx.fillStyle = '#fff6d0';
    ctx.fill();
  };
  // stems
  ctx.strokeStyle = shade(pal.reed, -0.1);
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  for (const [x, y, top] of [
    [40, 118, 52],
    [66, 122, 38],
    [92, 118, 58],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 4, (y + top) / 2, x, top);
    ctx.stroke();
  }
  flower(40, 52, 11, pal.accent);
  flower(66, 38, 13, '#c89ae8');
  flower(92, 58, 10, rgba(pal.sun, 1));
  // leaves
  ctx.fillStyle = shade(pal.reedDark, 0.15);
  for (const [lx, ly, a] of [
    [48, 92, -0.6],
    [58, 84, 2.4],
  ] as const) {
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(a);
    featherShape(ctx, 16, 5);
    ctx.fill();
    ink(ctx, 1.6);
    ctx.stroke();
    ctx.restore();
  }
  void rng;
}

/* ------------------------------------------------------------------ */
/* Particles                                                           */
/* ------------------------------------------------------------------ */

function drawFeather(ctx: CanvasRenderingContext2D, gold: boolean): void {
  ctx.save();
  ctx.translate(2, 6);
  ctx.rotate(-0.2);
  featherShape(ctx, 16, 4.6);
  ctx.fillStyle = gold
    ? lGrad(ctx, 0, 0, 16, 0, [
        [0, '#fff0b8'],
        [1, '#e8b53a'],
      ])
    : lGrad(ctx, 0, 0, 16, 0, [
        [0, '#f2efe6'],
        [1, '#b8b2a4'],
      ]);
  ctx.fill();
  ink(ctx, 1.4);
  ctx.stroke();
  featherRib(ctx, 16);
  ctx.restore();
  if (gold) {
    ctx.save();
    ctx.shadowColor = 'rgba(255,215,80,0.8)';
    ctx.shadowBlur = 6;
    fourPointStar(ctx, 15, 3, 2.2);
    ctx.fillStyle = '#fff2b8';
    ctx.fill();
    ctx.restore();
  }
}

function drawSmoke(ctx: CanvasRenderingContext2D, rng: R): void {
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + rng.next();
    const r = 6 + rng.next() * 5;
    softPuff(ctx, 14 + Math.cos(a) * r, 14 + Math.sin(a) * r, 8 + rng.next() * 4, '#c9c4ba');
  }
  softPuff(ctx, 14, 14, 10, '#a8a29a');
}

function drawSpark(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(5, 5, 0.5, 5, 5, 5);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.4, '#ffd97a');
  g.addColorStop(1, 'rgba(255,180,60,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(5, 5, 5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,240,180,0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(1, 5);
  ctx.lineTo(9, 5);
  ctx.moveTo(5, 1);
  ctx.lineTo(5, 9);
  ctx.stroke();
}

function drawSplash(ctx: CanvasRenderingContext2D, pal: Pal): void {
  ctx.fillStyle = rgba(pal.waterLight, 0.95);
  teardrop(ctx, 8, 12, 8, 14);
  ctx.fill();
  ink(ctx, 1.2);
  ctx.stroke();
  ctx.fillStyle = rgba(pal.water, 0.8);
  teardrop(ctx, 12, 16, 4, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(6, 8, 1.4, 0, TAU);
  ctx.fill();
}

function drawRing(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(32, 32, 20, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.25)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
}

function drawHitmarker(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  const seg = (x0: number, y0: number, x1: number, y1: number): void => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };
  seg(7, 7, 15, 15);
  seg(33, 7, 25, 15);
  seg(7, 33, 15, 25);
  seg(33, 33, 25, 25);
}

function drawStar(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const r = i % 2 === 0 ? 11 : 5;
    const x = 12 + Math.cos(a) * r;
    const y = 12 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, 0, 0, 24, 24, [
    [0, '#fff2b8'],
    [1, '#ffb83c'],
  ]);
  ctx.fill();
  ink(ctx, 1.8);
  ctx.stroke();
}

function drawConfetti(ctx: CanvasRenderingContext2D, rng: R): void {
  const cols = ['#ff7a5c', '#ffd54a', '#7fd0e8', '#8ce8d0', '#c89ae8'];
  const c = cols[rng.int(0, cols.length - 1)];
  ctx.save();
  ctx.translate(6, 6);
  ctx.rotate(rng.range(-0.8, 0.8));
  ctx.fillStyle = c;
  ctx.fillRect(-5, -4, 10, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(-5, -4, 10, 3);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Weapon art                                                          */
/* ------------------------------------------------------------------ */

function drawMuzzleFlash(ctx: CanvasRenderingContext2D, phase: number, rng: R): void {
  const scales = [1, 0.86, 0.66, 0.44];
  const alphas = [1, 0.85, 0.6, 0.34];
  ctx.save();
  ctx.translate(48, 48);
  ctx.globalAlpha = alphas[phase];
  ctx.scale(scales[phase], scales[phase]);
  // glow
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 46);
  g.addColorStop(0, 'rgba(255,255,220,0.95)');
  g.addColorStop(0.4, 'rgba(255,190,80,0.7)');
  g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, TAU);
  ctx.fill();
  // starburst
  ctx.beginPath();
  const spikes = 10;
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * TAU + rng.next() * 0.06;
    const r = i % 2 === 0 ? 40 + rng.next() * 6 : 15 + rng.next() * 4;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, -40, -40, 40, 40, [
    [0, '#ffffff'],
    [0.5, '#ffd97a'],
    [1, '#ff8a3c'],
  ]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(180,70,20,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // hot core
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill();
  ctx.restore();
  // late smoke wisps
  if (phase >= 2) {
    ctx.save();
    ctx.globalAlpha = phase === 2 ? 0.35 : 0.5;
    softPuff(ctx, 48, 20, 9, '#a8a29a');
    softPuff(ctx, 70, 76, 11, '#8f8a82');
    ctx.restore();
  }
}

function drawGunBarrel(ctx: CanvasRenderingContext2D, rng: R, wood: string, accent: string): void {
  const steel = lGrad(ctx, 0, 14, 0, 46, [
    [0, '#dfe4e8'],
    [0.45, '#9aa2aa'],
    [1, '#5c646c'],
  ]);
  // barrels (double) — muzzle at the right
  for (const by of [16, 32] as const) {
    roundedRectPath(ctx, 64, by, 148, 13, 6);
    ctx.fillStyle = steel;
    ctx.fill();
    ink(ctx, 3);
    ctx.stroke();
  }
  // top rib
  ctx.fillStyle = '#6a727a';
  roundedRectPath(ctx, 70, 12, 140, 5, 2.5);
  ctx.fill();
  ink(ctx, 1.8);
  ctx.stroke();
  // muzzle openings
  for (const by of [22.5, 38.5] as const) {
    ctx.beginPath();
    ctx.ellipse(210, by, 3, 5.5, 0, 0, TAU);
    ctx.fillStyle = '#17191b';
    ctx.fill();
    ink(ctx, 1.6);
    ctx.stroke();
  }
  // barrel band (accent)
  roundedRectPath(ctx, 88, 13, 12, 36, 4);
  ctx.fillStyle = lGrad(ctx, 0, 13, 0, 49, [
    [0, shade(accent, 0.3)],
    [1, shade(accent, -0.25)],
  ]);
  ctx.fill();
  ink(ctx, 2.4);
  ctx.stroke();
  // wood stock along the bottom-left
  ctx.beginPath();
  ctx.moveTo(6, 48);
  ctx.quadraticCurveTo(4, 26, 22, 24);
  ctx.lineTo(76, 22);
  ctx.lineTo(80, 48);
  ctx.quadraticCurveTo(40, 56, 6, 48);
  ctx.closePath();
  ctx.fillStyle = lGrad(ctx, 0, 20, 0, 56, [
    [0, shade(wood, 0.3)],
    [0.6, wood],
    [1, shade(wood, -0.25)],
  ]);
  ctx.fill();
  ink(ctx, 3);
  ctx.stroke();
  // grain lines
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = rgba(shade(wood, -0.3), 0.5);
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(8, 28 + i * 6);
    ctx.quadraticCurveTo(44, 26 + i * 6, 78, 30 + i * 5);
    ctx.stroke();
  }
  ctx.restore();
  // trigger guard + trigger
  ctx.strokeStyle = shade(accent, -0.35);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(74, 50, 9, 0.15, Math.PI - 0.15);
  ctx.stroke();
  ctx.strokeStyle = '#3a3f45';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(74, 46);
  ctx.quadraticCurveTo(72, 54, 76, 56);
  ctx.stroke();
  // accent rivets on the stock
  for (const [rx, ry] of [
    [20, 36],
    [52, 34],
  ] as const) {
    ctx.beginPath();
    ctx.arc(rx, ry, 2.2, 0, TAU);
    ctx.fillStyle = shade(accent, 0.1);
    ctx.fill();
    ink(ctx, 1.2);
    ctx.stroke();
  }
  void rng;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

const PROP_KEYS: readonly string[] = [
  'lantern',
  'cans',
  'sign',
  'bell',
  'rope',
  'scarecrow',
  'reeds',
  'pumpkin',
  'mushroom',
  'hollow',
  'bottle',
  'weathervane',
  'buoy',
  'barrel',
  'crate',
  'wisp',
  'stone',
  'flowers',
];

function generateProp(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  quality: QualityLevel,
  fn: (ctx: CanvasRenderingContext2D, rng: R, pal: Pal) => void,
  pal: Pal,
): void {
  addCanvas(scene, key, w, h, quality, (ctx, rng) => {
    fn(ctx, rng, pal);
  });
}

export function generateTextures(scene: Phaser.Scene, map: MapDef, quality: QualityLevel): void {
  const pal = map.palette;

  // 1 — bird targets: 4 wing-flap frames each
  for (const id of TARGET_IDS) {
    const birdSpec = BIRD_SPECS[id];
    if (!birdSpec) continue;
    for (let f = 0; f < 4; f++) {
      addCanvas(scene, `bird_${id}_f${f}`, 128, 96, quality, (ctx, rng) => {
        drawBird(ctx, 128, 96, f, birdSpec, rng);
      });
    }
  }

  // 2 — panzerpelz armor overlays
  for (let lvl = 1; lvl <= 3; lvl++) {
    addCanvas(scene, `armor_${lvl}`, 128, 96, quality, (ctx, rng) => {
      ctx.translate(64, 50);
      drawPanzerPlates(ctx, lvl - 1, rng);
    });
  }

  // 3 — bosses
  for (const boss of BOSSES) {
    for (let f = 0; f < 4; f++) {
      addCanvas(scene, `boss_${boss.id}_f${f}`, 256, 256, quality, (ctx, rng) => {
        if (boss.behavior === 'armored') drawEisenmoor(ctx, f, rng);
        else if (boss.behavior === 'acrobat') drawBlitzschnabel(ctx, f, rng);
        else drawNachtschatten(ctx, f, rng);
      });
    }
  }

  // 4 — environment props
  generateProp(scene, 'windmill', 300, 340, quality, drawWindmillTower, pal);
  generateProp(scene, 'windmill_blades', 300, 300, quality, drawWindmillBlades, pal);
  generateProp(scene, 'water', 128, 64, quality, drawWater, pal);
  generateProp(scene, 'wagon', 200, 140, quality, drawWagon, pal);
  generateProp(scene, 'lighthouse', 200, 380, quality, drawLighthouse, pal);
  for (const key of PROP_KEYS) {
    const fn = propFns[key];
    if (fn) generateProp(scene, key, 128, 128, quality, fn, pal);
  }

  // 5 — particles
  addCanvas(scene, 'feather', 20, 12, quality, (ctx) => drawFeather(ctx, false));
  addCanvas(scene, 'feather_gold', 20, 12, quality, (ctx) => drawFeather(ctx, true));
  addCanvas(scene, 'smoke', 28, 28, quality, (ctx, rng) => drawSmoke(ctx, rng));
  addCanvas(scene, 'spark', 10, 10, quality, (ctx) => drawSpark(ctx));
  addCanvas(scene, 'splash', 16, 20, quality, (ctx) => drawSplash(ctx, pal));
  addCanvas(scene, 'ring', 64, 64, quality, (ctx) => drawRing(ctx));
  addCanvas(scene, 'hitmarker', 40, 40, quality, (ctx) => drawHitmarker(ctx));
  addCanvas(scene, 'star', 24, 24, quality, (ctx) => drawStar(ctx));
  addCanvas(scene, 'confetti', 12, 12, quality, (ctx, rng) => drawConfetti(ctx, rng));

  // 6 — weapon art
  for (let f = 0; f < 4; f++) {
    addCanvas(scene, `muzzle_flash_f${f}`, 96, 96, quality, (ctx, rng) => {
      drawMuzzleFlash(ctx, f, rng);
    });
  }
  for (const skin of WEAPON_SKINS) {
    const key = skin.id === 'default' ? 'gun_barrel' : `gun_barrel_${skin.id}`;
    addCanvas(scene, key, 220, 60, quality, (ctx, rng) => {
      drawGunBarrel(ctx, rng, skin.bodyColor, skin.accentColor);
    });
  }

  // 7 — wing-flap animations (birds + bosses), registered once per scene
  for (const id of TARGET_IDS) {
    const key = `fly_${id}`;
    if (!scene.anims.exists(key)) {
      scene.anims.create({
        key,
        frames: [0, 1, 2, 3].map((f) => ({ key: `bird_${id}_f${f}` })),
        frameRate: 12,
        repeat: -1,
      });
    }
  }
  for (const boss of BOSSES) {
    const key = `fly_${boss.id}`;
    if (!scene.anims.exists(key)) {
      scene.anims.create({
        key,
        frames: [0, 1, 2, 3].map((f) => ({ key: `boss_${boss.id}_f${f}` })),
        frameRate: 10,
        repeat: -1,
      });
    }
  }
}

// Map prop keys to drawing functions (all take the map palette).
const propFns: Record<string, (ctx: CanvasRenderingContext2D, rng: R, pal: Pal) => void> = {
  lantern: drawLantern,
  cans: drawCans,
  sign: drawSign,
  bell: drawBell,
  rope: drawRope,
  scarecrow: drawScarecrow,
  reeds: drawReeds,
  pumpkin: drawPumpkin,
  mushroom: drawMushroom,
  hollow: drawHollow,
  bottle: drawBottle,
  weathervane: drawWeathervane,
  buoy: drawBuoy,
  barrel: drawBarrel,
  crate: drawCrate,
  wisp: drawWisp,
  stone: drawStone,
  flowers: drawFlowers,
};

export function disposeTextures(scene: Phaser.Scene): void {
  for (const key of createdKeys) {
    try {
      if (scene.textures.exists(key)) scene.textures.remove(key);
    } catch {
      // Texture manager may already be gone — nothing to clean.
    }
  }
  createdKeys.clear();
}
