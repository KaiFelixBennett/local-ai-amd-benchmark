/**
 * Procedural texture factory.
 *
 * Every surface in the game is painted here with Canvas2D and uploaded as a
 * THREE.CanvasTexture — there are no image files anywhere in the project.
 * The house style is oil-on-canvas Belle Epoque: visible brush streaks, canvas
 * weave, gilded art-nouveau whiplash ornament, muted teal and gold.
 *
 * Textures are memoised by key so repeated requests share GPU memory.
 */

import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { clamp01 } from '../core/easing.js';

const cache = new Map();

/** Shared deterministic stream so textures look identical between reloads. */
const texRNG = new RNG('gilded-requiem-textures');

export const PALETTE = {
  voidDeep: '#050f11',
  teal: '#0f2c30',
  tealLight: '#1d4a4d',
  verdigris: '#3c7d75',
  gold: '#d9b262',
  goldBright: '#f5dda2',
  goldDark: '#7a5a24',
  parchment: '#e6dbc0',
  crimson: '#a5372c',
  violet: '#7b5ea7',
  ice: '#8fd4e8',
  ember: '#e2803a',
  bone: '#cfc3a4',
};

function makeCanvas(size, h) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = h || size;
  return c;
}

function finalize(canvas, { repeat = 1, srgb = true, aniso = 4 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

function memo(key, build) {
  if (cache.has(key)) return cache.get(key);
  const t = build();
  cache.set(key, t);
  return t;
}

// ---------------------------------------------------------------------------
// Painting primitives
// ---------------------------------------------------------------------------

/** Fill with a soft multi-stop vertical gradient. */
function gradientFill(ctx, w, h, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [pos, col] of stops) g.addColorStop(pos, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Scatter short oriented strokes to imitate loaded oil-paint brushwork. */
function brushStrokes(ctx, w, h, rng, {
  count = 220, len = 34, width = 3, colors = ['#ffffff'], alpha = 0.06, angle = -0.35, spread = 0.5,
} = {}) {
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rng.next() * w;
    const y = rng.next() * h;
    const a = angle + rng.jitter(spread);
    const l = len * (0.35 + rng.next() * 1.1);
    ctx.globalAlpha = alpha * (0.4 + rng.next() * 0.9);
    ctx.strokeStyle = colors[Math.floor(rng.next() * colors.length)];
    ctx.lineWidth = width * (0.4 + rng.next() * 1.2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.restore();
}

/** Woven linen grid, faint, to keep flat regions from reading as plastic. */
function canvasWeave(ctx, w, h, alpha = 0.05, step = 3) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  ctx.stroke();
  ctx.globalAlpha = alpha * 0.7;
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  for (let y = 0; y < h; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

/** Per-pixel colour jitter so nothing reads as an obvious tile. */
function grain(ctx, w, h, rng, amount = 12) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * amount;
    d[i] = clamp01((d[i] + n) / 255) * 255;
    d[i + 1] = clamp01((d[i + 1] + n * 0.92) / 255) * 255;
    d[i + 2] = clamp01((d[i + 2] + n * 1.08) / 255) * 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Radial darkening baked into stage surfaces (cheap ambient occlusion). */
function bakedVignette(ctx, w, h, strength = 0.55, inner = 0.28) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * inner, w / 2, h / 2, Math.max(w, h) * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Draw one art-nouveau "whiplash" curve: an S-shaped tendril terminating in a
 * spiral, the signature motif of the period.
 */
function whiplash(ctx, x, y, scale, rot, color, lw) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-1, 0);
  ctx.bezierCurveTo(-0.45, -0.72, 0.35, -0.62, 0.52, -0.05);
  ctx.bezierCurveTo(0.62, 0.34, 0.3, 0.52, 0.12, 0.34);
  ctx.bezierCurveTo(-0.02, 0.2, 0.06, 0.02, 0.24, 0.06);
  ctx.stroke();
  // Leaf pad on the shoulder of the curve.
  ctx.beginPath();
  ctx.ellipse(-0.28, -0.5, 0.24, 0.1, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Stage surfaces
// ---------------------------------------------------------------------------

/** The arena floor: painted stone with concentric gilded inlay rings. */
export function stageFloorTexture() {
  return memo('stage-floor', () => {
    const S = 512;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const rng = texRNG.fork('floor');

    gradientFill(ctx, S, S, [
      [0, '#1c4145'],
      [0.5, '#123033'],
      [1, '#0a1e21'],
    ]);

    // Broad tonal blotches, like scumbled underpainting.
    for (let i = 0; i < 60; i++) {
      const r = 30 + rng.next() * 130;
      ctx.globalAlpha = 0.05 + rng.next() * 0.06;
      ctx.fillStyle = rng.chance(0.5) ? '#2c6a63' : '#071b1d';
      ctx.beginPath();
      ctx.arc(rng.next() * S, rng.next() * S, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    brushStrokes(ctx, S, S, rng, {
      count: 520, len: 46, width: 4, alpha: 0.05,
      colors: ['#3d8079', '#0b2124', '#5aa196'],
    });

    // Gilded inlay rings.
    const cx = S / 2, cy = S / 2;
    const rings = [0.19, 0.235, 0.33, 0.41, 0.455];
    rings.forEach((rr, i) => {
      ctx.beginPath();
      ctx.arc(cx, cy, S * rr, 0, Math.PI * 2);
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(217,178,98,0.5)' : 'rgba(122,90,36,0.42)';
      ctx.lineWidth = i % 2 === 0 ? 3.5 : 1.6;
      ctx.stroke();
    });

    // Radiating spokes between the two inner rings.
    ctx.save();
    ctx.strokeStyle = 'rgba(217,178,98,0.3)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * S * 0.335, cy + Math.sin(a) * S * 0.335);
      ctx.lineTo(cx + Math.cos(a) * S * 0.405, cy + Math.sin(a) * S * 0.405);
      ctx.stroke();
    }
    ctx.restore();

    // Whiplash ornament ring.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      whiplash(ctx, cx + Math.cos(a) * S * 0.28, cy + Math.sin(a) * S * 0.28,
        26, a + Math.PI / 2, 'rgba(217,178,98,0.32)', 0.09);
    }

    canvasWeave(ctx, S, S, 0.045, 4);
    bakedVignette(ctx, S, S, 0.6, 0.2);
    grain(ctx, S, S, rng, 14);
    return finalize(c, { repeat: 1, aniso: 8 });
  });
}

/** Roughness map for the floor so gilding reads as polished against stone. */
export function stageRoughnessTexture() {
  return memo('stage-rough', () => {
    const S = 256;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const rng = texRNG.fork('floor-rough');
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(0, 0, S, S);
    const cx = S / 2, cy = S / 2;
    [0.19, 0.235, 0.33, 0.41, 0.455].forEach((rr, i) => {
      ctx.beginPath();
      ctx.arc(cx, cy, S * rr, 0, Math.PI * 2);
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = i % 2 === 0 ? 4 : 2;
      ctx.stroke();
    });
    brushStrokes(ctx, S, S, rng, {
      count: 300, len: 30, width: 5, alpha: 0.16, colors: ['#ffffff', '#7a7a7a'],
    });
    return finalize(c, { srgb: false, repeat: 1 });
  });
}

/** Distant painted backdrop — a burning sky over a drowned city silhouette. */
export function backdropTexture() {
  return memo('backdrop', () => {
    const W = 1024, H = 512;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    const rng = texRNG.fork('backdrop');

    gradientFill(ctx, W, H, [
      [0, '#08181c'],
      [0.32, '#17454a'],
      [0.52, '#3c7d75'],
      [0.66, '#c79a52'],
      [0.78, '#8d5b34'],
      [1, '#0d1f22'],
    ]);

    // Painterly cloud banks.
    for (let i = 0; i < 140; i++) {
      const y = H * (0.18 + rng.next() * 0.5);
      const w = 60 + rng.next() * 320;
      const h = 8 + rng.next() * 34;
      ctx.globalAlpha = 0.05 + rng.next() * 0.1;
      ctx.fillStyle = rng.chance(0.55) ? '#e8d3a2' : '#0d2a2d';
      ctx.beginPath();
      ctx.ellipse(rng.next() * W, y, w, h, rng.jitter(0.12), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // A pale sun disc low on the horizon.
    const sx = W * 0.63, sy = H * 0.62;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 150);
    sg.addColorStop(0, 'rgba(255,242,206,0.95)');
    sg.addColorStop(0.25, 'rgba(245,221,162,0.5)');
    sg.addColorStop(1, 'rgba(245,221,162,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sx - 160, sy - 160, 320, 320);

    // Drowned skyline: monolith silhouettes with art-nouveau finials.
    ctx.fillStyle = '#07171a';
    for (let i = 0; i < 34; i++) {
      const w = 18 + rng.next() * 66;
      const x = rng.next() * W - w / 2;
      const h = 40 + rng.next() * 190;
      ctx.globalAlpha = 0.55 + rng.next() * 0.4;
      ctx.fillRect(x, H * 0.72 - h, w, h + 40);
      if (rng.chance(0.4)) {
        ctx.beginPath();
        ctx.moveTo(x, H * 0.72 - h);
        ctx.lineTo(x + w / 2, H * 0.72 - h - 30 - rng.next() * 40);
        ctx.lineTo(x + w, H * 0.72 - h);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#050f11';
    ctx.fillRect(0, H * 0.72, W, H * 0.28);

    brushStrokes(ctx, W, H, rng, {
      count: 900, len: 52, width: 5, alpha: 0.045,
      colors: ['#f0d9a8', '#0a2023', '#4e968c', '#d8a05a'],
      angle: 0.02, spread: 0.22,
    });
    grain(ctx, W, H, rng, 10);
    return finalize(c, { repeat: 1, aniso: 2 });
  });
}

/** Vertical gilded ornament strip used on pillars and the arena rim. */
export function ornamentStripTexture(tint = PALETTE.gold) {
  return memo(`ornament-${tint}`, () => {
    const W = 128, H = 512;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    const rng = texRNG.fork('ornament' + tint);

    gradientFill(ctx, W, H, [
      [0, '#12333a'],
      [0.5, '#0c2427'],
      [1, '#081a1d'],
    ]);
    brushStrokes(ctx, W, H, rng, {
      count: 160, len: 40, width: 4, alpha: 0.07,
      colors: ['#2f6d68', '#061618'], angle: Math.PI / 2, spread: 0.2,
    });

    // Repeating vertical band of whiplash motifs.
    const cells = 8;
    for (let i = 0; i < cells; i++) {
      const cy = (i + 0.5) * (H / cells);
      whiplash(ctx, W * 0.5, cy, 40, 0, tint, 0.1);
      whiplash(ctx, W * 0.5, cy, 40, Math.PI, tint, 0.1);
      ctx.beginPath();
      ctx.arc(W * 0.5, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = tint;
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Edge fillets.
    ctx.strokeStyle = tint;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(6, 0); ctx.lineTo(6, H);
    ctx.moveTo(W - 6, 0); ctx.lineTo(W - 6, H);
    ctx.stroke();
    ctx.globalAlpha = 1;

    canvasWeave(ctx, W, H, 0.05, 4);
    grain(ctx, W, H, rng, 12);
    return finalize(c, { repeat: 1 });
  });
}

// ---------------------------------------------------------------------------
// Character / creature surfaces
// ---------------------------------------------------------------------------

/** Cloth: base colour, sheen streaks, embroidered accent threads. */
export function fabricTexture(base, accent, key) {
  return memo(`fabric-${key}`, () => {
    const S = 256;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const rng = texRNG.fork('fabric' + key);

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, S, S);

    for (let i = 0; i < 40; i++) {
      ctx.globalAlpha = 0.06 + rng.next() * 0.08;
      ctx.fillStyle = rng.chance(0.5) ? '#ffffff' : '#000000';
      ctx.beginPath();
      ctx.ellipse(rng.next() * S, rng.next() * S, 20 + rng.next() * 70, 10 + rng.next() * 40,
        rng.jitter(1.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    brushStrokes(ctx, S, S, rng, {
      count: 320, len: 30, width: 3, alpha: 0.07,
      colors: [accent, '#000000', '#ffffff'], angle: -1.1, spread: 0.4,
    });

    // Embroidered chevrons along the vertical axis.
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const y = (i + 0.5) * (S / 10);
      ctx.globalAlpha = 0.32;
      ctx.beginPath();
      ctx.moveTo(S * 0.2, y);
      ctx.lineTo(S * 0.5, y - 9);
      ctx.lineTo(S * 0.8, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    canvasWeave(ctx, S, S, 0.07, 3);
    grain(ctx, S, S, rng, 13);
    return finalize(c, { repeat: 1 });
  });
}

/** Skin / hide: soft mottling with subsurface-ish warm blotches. */
export function skinTexture(base, key) {
  return memo(`skin-${key}`, () => {
    const S = 128;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const rng = texRNG.fork('skin' + key);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) {
      ctx.globalAlpha = 0.05 + rng.next() * 0.07;
      ctx.fillStyle = rng.chance(0.6) ? '#c98a6a' : '#4a2b22';
      ctx.beginPath();
      ctx.arc(rng.next() * S, rng.next() * S, 4 + rng.next() * 22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    brushStrokes(ctx, S, S, rng, { count: 180, len: 14, width: 2, alpha: 0.05, colors: ['#ffffff', '#3a1f18'] });
    grain(ctx, S, S, rng, 10);
    return finalize(c, { repeat: 1 });
  });
}

/** Hammered gold / bronze for weapons, masks and gilded plate. */
export function metalTexture(base, key) {
  return memo(`metal-${key}`, () => {
    const S = 256;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const rng = texRNG.fork('metal' + key);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, S, S);
    // Hammer facets.
    for (let i = 0; i < 260; i++) {
      const x = rng.next() * S, y = rng.next() * S, r = 5 + rng.next() * 16;
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.16)');
      g.addColorStop(1, 'rgba(0,0,0,0.14)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Long specular streaks.
    brushStrokes(ctx, S, S, rng, {
      count: 90, len: 90, width: 2, alpha: 0.16,
      colors: ['#fff3cf', '#2a1c07'], angle: -0.9, spread: 0.12,
    });
    grain(ctx, S, S, rng, 9);
    return finalize(c, { repeat: 1 });
  });
}

/** Emissive rune sheet — glowing sigils for magic, eyes and gradient effects. */
export function runeTexture(color, key) {
  return memo(`rune-${key}`, () => {
    const S = 256;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const rng = texRNG.fork('rune' + key);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const x = rng.next() * S, y = rng.next() * S;
      ctx.lineWidth = 1 + rng.next() * 3;
      ctx.globalAlpha = 0.5 + rng.next() * 0.5;
      ctx.beginPath();
      const segs = 2 + Math.floor(rng.next() * 4);
      let px = x, py = y;
      ctx.moveTo(px, py);
      for (let s = 0; s < segs; s++) {
        px += rng.jitter(30);
        py += rng.jitter(30);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      if (rng.chance(0.5)) {
        ctx.beginPath();
        ctx.arc(x, y, 3 + rng.next() * 9, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    return finalize(c, { repeat: 1 });
  });
}

// ---------------------------------------------------------------------------
// Sprites & effect maps
// ---------------------------------------------------------------------------

/** Soft round paint blob used for motes, impact bursts and dissolve flecks. */
export function paintSprite() {
  return memo('sprite-paint', () => {
    const S = 128;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.32, 'rgba(255,255,255,0.62)');
    g.addColorStop(0.68, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // Slight irregularity so motes read as paint, not perfect circles.
    const rng = texRNG.fork('paint-sprite');
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 14; i++) {
      ctx.globalAlpha = 0.12 + rng.next() * 0.2;
      ctx.beginPath();
      ctx.arc(S / 2 + rng.jitter(30), S / 2 + rng.jitter(30), 6 + rng.next() * 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    return finalize(c, { repeat: 1 });
  });
}

/** Tight hot core with a wide falloff — for sparks and gilded highlights. */
export function glowSprite() {
  return memo('sprite-glow', () => {
    const S = 128;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.12, 'rgba(255,250,235,0.85)');
    g.addColorStop(0.4, 'rgba(255,235,190,0.22)');
    g.addColorStop(1, 'rgba(255,220,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return finalize(c, { repeat: 1 });
  });
}

/** Four-point star flare for critical hits and weak-point pops. */
export function starSprite() {
  return memo('sprite-star', () => {
    const S = 128;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    ctx.translate(S / 2, S / 2);
    for (let arm = 0; arm < 4; arm++) {
      ctx.save();
      ctx.rotate((arm / 4) * Math.PI * 2);
      const g = ctx.createLinearGradient(0, 0, 0, -S / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(0, -S / 2);
      ctx.lineTo(5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
    g2.addColorStop(0, 'rgba(255,255,255,1)');
    g2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    return finalize(c, { repeat: 1 });
  });
}

/** Soft elliptical blob used as a fake contact shadow beneath combatants. */
export function shadowSprite() {
  return memo('sprite-shadow', () => {
    const S = 128;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.72)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return finalize(c, { repeat: 1 });
  });
}

/**
 * The telegraph ring: a bright annulus with tick marks. Drawn on the ground
 * beneath a targeted ally and scaled down over the wind-up so the moment it
 * meets the inner marker is the instant to parry.
 */
export function telegraphRingTexture() {
  return memo('telegraph-ring', () => {
    const S = 256;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    ctx.translate(S / 2, S / 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(0, 0, S * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, S * 0.33, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Four cardinal ticks aid reading the ring's scale at a glance.
    ctx.lineWidth = 7;
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i / 4) * Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(0, -S * 0.44);
      ctx.lineTo(0, -S * 0.35);
      ctx.stroke();
      ctx.restore();
    }
    return finalize(c, { repeat: 1 });
  });
}

/** Static "impact marker" ring the shrinking telegraph ring converges onto. */
export function impactRingTexture() {
  return memo('impact-ring', () => {
    const S = 256;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    ctx.translate(S / 2, S / 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, S * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    for (let i = 0; i < 24; i++) {
      ctx.save();
      ctx.rotate((i / 24) * Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(0, -S * 0.31);
      ctx.lineTo(0, -S * 0.285);
      ctx.stroke();
      ctx.restore();
    }
    return finalize(c, { repeat: 1 });
  });
}

/** Radial gradient disc for magic circles and ground-slam decals. */
export function decalTexture(inner, outer) {
  return memo(`decal-${inner}-${outer}`, () => {
    const S = 256;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.6, outer);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, S * (0.16 + i * 0.11), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      whiplash(ctx, Math.cos((i / 12) * Math.PI * 2) * S * 0.34,
        Math.sin((i / 12) * Math.PI * 2) * S * 0.34,
        16, (i / 12) * Math.PI * 2, 'rgba(255,255,255,0.4)', 0.12);
    }
    return finalize(c, { repeat: 1 });
  });
}

/** Release every cached texture (called on teardown / context loss recovery). */
export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
