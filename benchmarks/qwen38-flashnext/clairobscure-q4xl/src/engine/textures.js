import * as THREE from 'three';
import { RNG } from '../core/rng.js';

// ---------------------------------------------------------------------------
// Procedural texture factory. Everything here returns a canvas or CanvasTexture;
// nothing is loaded from disk. Oil-paint look = value noise + brush streaks
// + canvas weave + baked vignette, in that order.
// ---------------------------------------------------------------------------

// -- Small value-noise on the CPU (deterministic, seeded) -------------------

function makeNoiseGrid(size, seed) {
  const r = new RNG(seed);
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = r.next();
  return g;
}

function sampleGrid(g, size, x, y) {
  const fx = ((x % size) + size) % size;
  const fy = ((y % size) + size) % size;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const x1 = (x0 + 1) % size, y1 = (y0 + 1) % size;
  const a = g[y0 * size + x0], b = g[y0 * size + x1];
  const c = g[y1 * size + x0], d = g[y1 * size + x1];
  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}

// Fractal value noise sampler over [0,1]-ish domain coords.
function fbmFactory(seed, grid = 64) {
  const g = makeNoiseGrid(grid, seed);
  return function fbm(x, y, oct = 4) {
    let amp = 0.55, sum = 0, norm = 0, f = 1;
    for (let i = 0; i < oct; i++) {
      sum += amp * sampleGrid(g, grid, x * f * grid, y * f * grid);
      norm += amp; amp *= 0.5; f *= 2.1;
    }
    return sum / norm;
  };
}

// -- Canvas helpers ----------------------------------------------------------

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function hsl(h, s, l, a = 1) { return `hsla(${h},${s}%,${l}%,${a})`; }

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// Base fill with fractal-noise colour jitter between two hsl anchors.
function noiseFill(ctx, w, h, seed, h0, s0, l0, h1, s1, l1, scale = 2) {
  const fbm = fbmFactory(seed);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm((x / w) * scale, (y / h) * scale, 4);
      const t = Math.min(1, Math.max(0, n));
      const hh = h0 + (h1 - h0) * t;
      const ss = s0 + (s1 - s0) * t;
      const ll = l0 + (l1 - l0) * t;
      const [r, g, b] = hslToRgb(hh, ss, ll);
      const i = (y * w + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Painterly brush streaks: many short curved strokes with jittered hue/lightness.
function brushStrokes(ctx, w, h, count, seed, hue, sat, light, lenMin, lenMax, alpha) {
  const r = new RNG(seed);
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = r.next() * w, y = r.next() * h;
    const ang = (r.next() - 0.5) * 1.4 + Math.sin(y * 0.02) * 0.5;
    const len = r.range(lenMin, lenMax);
    const lw = r.range(1.5, 5.5);
    const dh = r.range(-10, 10), dl = r.range(-9, 9);
    ctx.strokeStyle = hsl(hue + dh, sat, Math.min(92, Math.max(8, light + dl)), alpha * r.range(0.5, 1));
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(ang) * len * 0.5 + r.range(-4, 4),
      y + Math.sin(ang) * len * 0.5 + r.range(-4, 4),
      x + Math.cos(ang) * len, y + Math.sin(ang) * len
    );
    ctx.stroke();
  }
  ctx.restore();
}

// Linen canvas weave overlay — sells the "oil on canvas" feel.
function canvasWeave(ctx, w, h, strength = 0.05) {
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 3) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
  }
  ctx.strokeStyle = '#fff';
  for (let y = 0; y < h; y += 3) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
  }
  ctx.restore();
}

// Soft baked vignette / AO.
function bakeVignette(ctx, w, h, alpha = 0.4, cx = 0.5, cy = 0.5, r0 = 0.25) {
  const grad = ctx.createRadialGradient(cx * w, cy * h, r0 * Math.min(w, h), cx * w, cy * h, 0.75 * Math.max(w, h));
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(5,8,10,${alpha})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function toTexture(canvas, aniso = 4) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  return tex;
}

// ---------------------------------------------------------------------------
// Stage textures
// ---------------------------------------------------------------------------

export function stageFloorTexture() {
  const w = 1024, h = 1024;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  noiseFill(ctx, w, h, 101, 187, 16, 24, 172, 24, 40, 2.5);      // teal marble base
  brushStrokes(ctx, w, h, 2600, 202, 183, 18, 32, 30, 120, 0.10); // painterly streaks
  // marble veins
  const r = new RNG(303);
  ctx.lineCap = 'round';
  for (let v = 0; v < 26; v++) {
    ctx.strokeStyle = hsl(44, 30, r.range(55, 78), r.range(0.04, 0.13));
    ctx.lineWidth = r.range(0.6, 2.6);
    let x = r.next() * w, y = r.next() * h;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let seg = 0; seg < 24; seg++) {
      x += r.range(-60, 60); y += r.range(-40, 70);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // gold inlay rings (expedition stage motif)
  const cx = w / 2, cy = h / 2;
  for (const rr of [0.42, 0.30, 0.16]) {
    ctx.strokeStyle = hsl(43, 62, 52, 0.34);
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx, cy, rr * w * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = hsl(45, 70, 66, 0.20);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, rr * w * 0.5 + 6, 0, Math.PI * 2); ctx.stroke();
  }
  // radial sunburst
  ctx.strokeStyle = hsl(43, 50, 60, 0.08);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * w * 0.16, cy + Math.sin(a) * w * 0.16);
    ctx.lineTo(cx + Math.cos(a) * w * 0.42, cy + Math.sin(a) * w * 0.42);
    ctx.stroke();
  }
  canvasWeave(ctx, w, h, 0.05);
  bakeVignette(ctx, w, h, 0.45);
  return toTexture(c, 8);
}

export function backdropTexture() {
  const w = 1024, h = 512;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#173138');
  grad.addColorStop(0.55, '#3f6b6d');
  grad.addColorStop(0.78, '#c98f4a');
  grad.addColorStop(1, '#5a4630');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  brushStrokes(ctx, w, h, 2200, 404, 30, 40, 48, 40, 160, 0.08);
  // low sun
  const sx = w * 0.66, sy = h * 0.66;
  const sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 150);
  sg.addColorStop(0, 'rgba(255,236,190,0.95)');
  sg.addColorStop(0.2, 'rgba(244,212,137,0.75)');
  sg.addColorStop(1, 'rgba(244,212,137,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w, h);
  // cloud bands
  const r = new RNG(505);
  for (let i = 0; i < 34; i++) {
    const y = h * (0.15 + r.next() * 0.5);
    const cw = r.range(120, 420), ch2 = r.range(6, 22);
    const x = r.next() * w;
    ctx.fillStyle = hsl(r.range(30, 45), r.range(30, 55), r.range(55, 80), r.range(0.05, 0.16));
    ctx.beginPath();
    ctx.ellipse(x, y, cw, ch2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // distant silhouette ridge + tower
  ctx.fillStyle = 'rgba(13,19,21,0.85)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.82);
  const rf = new RNG(606);
  const pts = 18;
  for (let i = 0; i <= pts; i++) {
    const x = (i / pts) * w;
    const bump = (i > 5 && i < 8) ? 0.08 : 0;
    const y = h * (0.74 + rf.next() * 0.10 - bump);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(10,14,16,0.92)';
  const tx = w * 0.22, tBase = h * 0.80, tTop = h * 0.38;
  ctx.beginPath();
  ctx.moveTo(tx - 16, tBase);
  ctx.lineTo(tx - 8, tTop + 26);
  ctx.quadraticCurveTo(tx, tTop - 14, tx + 8, tTop + 26);
  ctx.lineTo(tx + 16, tBase);
  ctx.closePath(); ctx.fill();
  bakeVignette(ctx, w, h, 0.35);
  return toTexture(c, 4);
}

// ---------------------------------------------------------------------------
// Character / enemy surface textures
// ---------------------------------------------------------------------------

// Painted cloth with vertical fold shading + pigment jitter (for coats/capes).
export function clothTexture(seed, hue, sat = 34, light = 42) {
  const w = 256, h = 256;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  noiseFill(ctx, w, h, seed, hue, sat, light - 6, hue + 8, sat + 8, light + 8, 3);
  // vertical folds
  const r = new RNG(seed + 1);
  for (let i = 0; i < 14; i++) {
    const x = r.next() * w;
    const foldw = r.range(6, 26);
    const g = ctx.createLinearGradient(x - foldw, 0, x + foldw, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, `rgba(0,0,0,${r.range(0.10, 0.28)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - foldw, 0, foldw * 2, h);
  }
  brushStrokes(ctx, w, h, 500, seed + 2, hue, sat, light, 8, 34, 0.07);
  canvasWeave(ctx, w, h, 0.05);
  return toTexture(c, 4);
}

// Gilded metal for weapons / ornaments.
export function gildTexture(seed = 77) {
  const w = 128, h = 128;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  noiseFill(ctx, w, h, seed, 42, 55, 40, 46, 70, 62, 4);
  brushStrokes(ctx, w, h, 700, seed + 1, 44, 60, 55, 10, 46, 0.10);
  // streak highlights
  const r = new RNG(seed + 2);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = hsl(48, 80, r.range(70, 90), r.range(0.1, 0.3));
    ctx.lineWidth = r.range(0.5, 1.6);
    const x = r.next() * w, y = r.next() * h, len = r.range(10, 60), a = r.range(-0.4, 0.4);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
  return toTexture(c, 4);
}

// Skin-like painterly tone.
export function skinTexture(seed, warm = 28) {
  const w = 128, h = 128;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  noiseFill(ctx, w, h, seed, warm, 32, 58, warm + 6, 40, 70, 3);
  brushStrokes(ctx, w, h, 260, seed + 1, warm, 34, 62, 5, 16, 0.06);
  return toTexture(c, 2);
}

// Dark painted plates for enemy armour.
export function plateTexture(seed, hue = 200, sat = 12, light = 22) {
  const w = 128, h = 128;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  noiseFill(ctx, w, h, seed, hue, sat, light - 5, hue + 10, sat + 6, light + 10, 4);
  // scratches
  const r = new RNG(seed + 3);
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = hsl(hue, sat + 10, light + r.range(10, 30), r.range(0.05, 0.2));
    ctx.lineWidth = r.range(0.5, 1.4);
    const x = r.next() * w, y = r.next() * h, a = r.next() * Math.PI, len = r.range(4, 26);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
  brushStrokes(ctx, w, h, 300, seed + 4, hue, sat, light, 6, 22, 0.08);
  return toTexture(c, 2);
}

// ---------------------------------------------------------------------------
// Sprites (additive particles / glows)
// ---------------------------------------------------------------------------

export function softDotTexture(size = 64) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A fleck of oil paint for the dissolve / drift effects.
export function paintFleckTexture(size = 48) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const r = new RNG(size * 13 + 7);
  ctx.translate(size / 2, size / 2);
  ctx.rotate(r.range(0, Math.PI));
  const g = ctx.createLinearGradient(-size / 2, 0, size / 2, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.46, size * 0.18 * r.range(0.7, 1.3), 0, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// UI ornament — reused by the 2D HUD canvas for art-nouveau panels
// ---------------------------------------------------------------------------

export function drawPanelOrnament(ctx2d, x, y, w, h, opts = {}) {
  const gold = opts.gold || '#d8a94a';
  const r = Math.min(14, w * 0.08);
  ctx2d.save();
  const g = ctx2d.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, 'rgba(20,26,29,0.88)');
  g.addColorStop(1, 'rgba(10,14,16,0.92)');
  ctx2d.fillStyle = g;
  ctx2d.beginPath();
  ctx2d.roundRect(x, y, w, h, r);
  ctx2d.fill();
  ctx2d.strokeStyle = gold;
  ctx2d.globalAlpha = 0.85;
  ctx2d.lineWidth = 1.6;
  ctx2d.beginPath(); ctx2d.roundRect(x + 0.8, y + 0.8, w - 1.6, h - 1.6, r); ctx2d.stroke();
  ctx2d.globalAlpha = 0.35;
  ctx2d.lineWidth = 1;
  ctx2d.beginPath(); ctx2d.roundRect(x + 4, y + 4, w - 8, h - 8, Math.max(2, r - 3)); ctx2d.stroke();
  ctx2d.globalAlpha = 1;
  const s = Math.min(22, w * 0.12, h * 0.3);
  drawCornerTendril(ctx2d, x + 8, y + 8, s, 0, gold);
  drawCornerTendril(ctx2d, x + w - 8, y + 8, s, Math.PI / 2, gold);
  drawCornerTendril(ctx2d, x + w - 8, y + h - 8, s, Math.PI, gold);
  drawCornerTendril(ctx2d, x + 8, y + h - 8, s, -Math.PI / 2, gold);
  ctx2d.restore();
}

export function drawCornerTendril(ctx2d, x, y, s, rot, gold = '#d8a94a') {
  ctx2d.save();
  ctx2d.translate(x, y);
  ctx2d.rotate(rot);
  ctx2d.strokeStyle = gold;
  ctx2d.globalAlpha = 0.7;
  ctx2d.lineWidth = 1.4;
  ctx2d.beginPath();
  ctx2d.moveTo(-s * 0.1, s * 0.9);
  ctx2d.bezierCurveTo(-s * 0.0, s * 0.3, s * 0.3, s * 0.0, s * 0.9, -s * 0.05);
  ctx2d.stroke();
  ctx2d.beginPath();
  for (let t = 0; t < Math.PI * 2.2; t += 0.18) {
    const rr = s * 0.05 + s * 0.05 * (t / (Math.PI * 2.2));
    const px = s * 0.32 + Math.cos(t + Math.PI) * rr * 2.2;
    const py = s * 0.30 + Math.sin(t + Math.PI) * rr * 2.2;
    if (t === 0) ctx2d.moveTo(px, py); else ctx2d.lineTo(px, py);
  }
  ctx2d.stroke();
  ctx2d.fillStyle = gold;
  ctx2d.beginPath();
  ctx2d.arc(s * 0.30, s * 0.28, s * 0.05, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.restore();
}

// Portrait texture for a party member (stylised painted face sigil).
export function portraitTexture(seed, coatHue, accentHue) {
  const w = 128, h = 128;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  noiseFill(ctx, w, h, seed, 190, 12, 18, 175, 16, 30, 2);
  const r = new RNG(seed + 1);
  // shoulder mass in coat colour
  ctx.fillStyle = hsl(coatHue, 30, 34, 0.95);
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 1.12, w * 0.55, h * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // head
  ctx.fillStyle = hsl(28, 34, 64, 1);
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.44, w * 0.2, h * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  // wide-brim hat
  ctx.fillStyle = hsl(coatHue, 26, 22, 1);
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.30, w * 0.30, h * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(w * 0.34, h * 0.16, w * 0.32, h * 0.15);
  // accent feather
  ctx.strokeStyle = hsl(accentHue, 70, 62, 0.9);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.64, h * 0.26);
  ctx.quadraticCurveTo(w * 0.82, h * 0.12 + r.range(-6, 6), w * 0.86, h * 0.30);
  ctx.stroke();
  // eyes: two confident dashes
  ctx.strokeStyle = 'rgba(20,22,24,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(w * 0.44, h * 0.44); ctx.lineTo(w * 0.49, h * 0.44); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w * 0.55, h * 0.44); ctx.lineTo(w * 0.60, h * 0.44); ctx.stroke();
  brushStrokes(ctx, w, h, 240, seed + 2, coatHue, 30, 40, 6, 20, 0.08);
  bakeVignette(ctx, w, h, 0.5);
  return toTexture(c, 2);
}
