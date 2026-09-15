import type Phaser from 'phaser';
import type { MapDef } from '../config/schema';
import type { QualityLevel } from '../types';
import { GAME_WIDTH, GAME_HEIGHT } from '../types';

/**
 * Builds parallax background layers for a map as canvas textures, plus animated
 * foreground silhouettes. Deterministic via a local mulberry32.
 *
 * Layer keys: bg_sky, bg_far, bg_mid, bg_near, bg_water, bg_fog, bg_fg
 * Each is wider than the viewport so it can drift.
 */

const created = new Set<string>();

function mulberry32(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(scene: Phaser.Scene, key: string, w: number, h: number): CanvasRenderingContext2D | null {
  if (scene.textures.exists(key)) return null;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return null;
  const ctx = (tex as unknown as { context: CanvasRenderingContext2D }).context;
  created.add(key);
  return ctx;
}

function refresh(scene: Phaser.Scene, key: string): void {
  const tex = scene.textures.get(key) as unknown as { refresh?: () => void } | undefined;
  tex?.refresh?.();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 128, g: 128, b: 128 };
  return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) };
}

function mix(a: string, b: string, t: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  const r = Math.round(ra.r + (rb.r - ra.r) * t);
  const g = Math.round(ra.g + (rb.g - ra.g) * t);
  const bl = Math.round(ra.b + (rb.b - ra.b) * t);
  return `rgb(${r},${g},${bl})`;
}

/**
 * @param scale 1 for high/medium; 0.7 for low to save memory.
 */
export function generateBackground(scene: Phaser.Scene, map: MapDef, quality: QualityLevel): void {
  const s = quality === 'low' ? 0.7 : 1;
  const W = Math.round(GAME_WIDTH * 1.6 * s);
  const H = GAME_HEIGHT;
  const rnd = mulberry32(hashStr(map.id));
  const p = map.palette;

  try {
    // ---- SKY ----
    const sky = makeCanvas(scene, `bg_sky_${map.id}`, W, H);
    if (sky) {
      const grad = sky.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, p.skyTop);
      grad.addColorStop(0.55, p.skyMid);
      grad.addColorStop(1, p.skyLow);
      sky.fillStyle = grad;
      sky.fillRect(0, 0, W, H);
      // sun / moon
      const sunX = W * 0.72;
      const sunY = map.ambientKind === 'night' ? H * 0.22 : H * 0.3;
      const sunR = map.ambientKind === 'night' ? 90 : 130;
      const glow = sky.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 3);
      glow.addColorStop(0, p.sun);
      glow.addColorStop(0.15, mix(p.sun, p.skyMid, 0.4));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      sky.fillStyle = glow;
      sky.fillRect(0, 0, W, H);
      sky.fillStyle = p.sun;
      sky.beginPath();
      sky.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      sky.fill();
      if (map.ambientKind === 'night') {
        // moon craters
        sky.fillStyle = 'rgba(180,190,210,0.35)';
        for (let i = 0; i < 5; i++) {
          const cx = sunX + (rnd() - 0.5) * sunR * 1.3;
          const cy = sunY + (rnd() - 0.5) * sunR * 1.3;
          const cr = rnd() * 16 + 6;
          sky.beginPath();
          sky.arc(cx, cy, cr, 0, Math.PI * 2);
          sky.fill();
        }
        // stars
        sky.fillStyle = 'rgba(255,255,255,0.8)';
        for (let i = 0; i < 160; i++) {
          const x = rnd() * W;
          const y = rnd() * H * 0.6;
          const a = rnd() * 0.6 + 0.2;
          sky.globalAlpha = a;
          sky.fillRect(x, y, 2, 2);
        }
        sky.globalAlpha = 1;
      }
      refresh(scene, `bg_sky_${map.id}`);
    }

    // ---- FAR HILLS ----
    const far = makeCanvas(scene, `bg_far_${map.id}`, W, H);
    if (far) {
      drawRidge(far, rnd, H * 0.5, H * 0.12, p.hillFar, W, 5);
      refresh(scene, `bg_far_${map.id}`);
    }

    // ---- MID HILLS + distant reeds/trees ----
    const mid = makeCanvas(scene, `bg_mid_${map.id}`, W, H);
    if (mid) {
      drawRidge(mid, rnd, H * 0.62, H * 0.14, p.hillMid, W, 4);
      // scattered distant trees / reed clumps on the mid ridge
      for (let i = 0; i < 34; i++) {
        const x = rnd() * W;
        const y = H * 0.62 + rnd() * H * 0.05;
        drawReedClump(mid, x, y, 40 + rnd() * 40, mix(p.reed, p.hillMid, 0.35));
      }
      refresh(scene, `bg_mid_${map.id}`);
    }

    // ---- NEAR SHORE / GROUND ----
    const near = makeCanvas(scene, `bg_near_${map.id}`, W, H);
    if (near) {
      const baseY = H * 0.82;
      near.fillStyle = p.hillNear;
      near.beginPath();
      near.moveTo(0, H);
      near.lineTo(0, baseY);
      for (let x = 0; x <= W; x += 80) {
        near.lineTo(x, baseY + Math.sin(x * 0.004 + 1) * 18 + (rnd() - 0.5) * 8);
      }
      near.lineTo(W, H);
      near.closePath();
      near.fill();
      // near reeds along the shore
      for (let i = 0; i < 90; i++) {
        const x = rnd() * W;
        const y = baseY + rnd() * (H - baseY) * 0.5;
        drawReedClump(near, x, y, 55 + rnd() * 55, mix(p.reed, p.reedDark, rnd() * 0.6));
      }
      refresh(scene, `bg_near_${map.id}`);
    }

    // ---- WATER BAND ----
    const water = makeCanvas(scene, `bg_water_${map.id}`, W, Math.round(H * 0.18 * 1));
    if (water) {
      const ww = W;
      const wh = Math.round(H * 0.18);
      const g = water.createLinearGradient(0, 0, 0, wh);
      g.addColorStop(0, mix(p.water, p.waterLight, 0.4));
      g.addColorStop(1, p.water);
      water.fillStyle = g;
      water.fillRect(0, 0, ww, wh);
      // shimmer lines
      water.strokeStyle = mix(p.waterLight, '#ffffff', 0.3);
      water.lineWidth = 2;
      for (let i = 0; i < 40; i++) {
        const y = rnd() * wh;
        const x0 = rnd() * ww;
        const len = 30 + rnd() * 120;
        water.globalAlpha = 0.1 + rnd() * 0.25;
        water.beginPath();
        water.moveTo(x0, y);
        water.lineTo(x0 + len, y + (rnd() - 0.5) * 4);
        water.stroke();
      }
      water.globalAlpha = 1;
      refresh(scene, `bg_water_${map.id}`);
    }

    // ---- FOG BANDS ----
    const fog = makeCanvas(scene, `bg_fog_${map.id}`, Math.round(W * 0.9), 360);
    if (fog) {
      const fw = Math.round(W * 0.9);
      for (let i = 0; i < 8; i++) {
        const y = rnd() * 360;
        const x = rnd() * fw;
        const rw = 200 + rnd() * 380;
        const rh = 60 + rnd() * 90;
        const g = fog.createRadialGradient(x, y, 4, x, y, rw);
        g.addColorStop(0, hexToRgba(p.fog, 0.32));
        g.addColorStop(1, hexToRgba(p.fog, 0));
        fog.fillStyle = g;
        fog.beginPath();
        fog.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
        fog.fill();
      }
      refresh(scene, `bg_fog_${map.id}`);
    }

    // ---- FOREGROUND SILHOUETTES (drawn last, over birds) ----
    const fg = makeCanvas(scene, `bg_fg_${map.id}`, W, H);
    if (fg) {
      // big out-of-focus reeds/grass blades at the corners
      for (let i = 0; i < 26; i++) {
        const sideLeft = i % 2 === 0;
        const x = sideLeft ? rnd() * W * 0.18 : W * 0.82 + rnd() * W * 0.18;
        const baseY = H;
        drawBlade(fg, x, baseY, 160 + rnd() * 220, mix(p.reedDark, '#000000', 0.35));
      }
      refresh(scene, `bg_fg_${map.id}`);
    }
  } catch (err) {
    console.warn('[background] generation failed', err);
  }
}

function hashStr(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hexToRgba(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function drawRidge(
  ctx: CanvasRenderingContext2D,
  rnd: () => number,
  baseY: number,
  amp: number,
  color: string,
  W: number,
  bumps: number,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, GAME_HEIGHT);
  ctx.lineTo(0, baseY);
  const step = W / (bumps * 6);
  let y = baseY;
  for (let x = 0; x <= W; x += step) {
    const target = baseY + Math.sin(x * 0.002 + bumps) * amp - rnd() * amp * 0.35;
    y += (target - y) * 0.5;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, GAME_HEIGHT);
  ctx.closePath();
  ctx.fill();
}

function drawReedClump(ctx: CanvasRenderingContext2D, x: number, baseY: number, h: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  const blades = 4 + Math.floor((h % 3) + 2);
  for (let i = 0; i < blades; i++) {
    const off = (i - blades / 2) * 5;
    const bend = (i % 2 === 0 ? 1 : -1) * (8 + ((i * 3) % 12));
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x + off, baseY);
    ctx.quadraticCurveTo(x + off + bend * 0.5, baseY - h * 0.6, x + off + bend, baseY - h);
    ctx.stroke();
    // seed head
    if (i % 2 === 0) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x + off + bend, baseY - h, 3, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBlade(ctx: CanvasRenderingContext2D, x: number, baseY: number, h: number, color: string): void {
  const bend = (x % 2 === 0 ? 1 : -1) * (30 + (x % 40));
  const grad = ctx.createLinearGradient(x, baseY, x + bend, baseY - h);
  grad.addColorStop(0, color);
  grad.addColorStop(1, hexToRgba(color.startsWith('#') ? color : '#000000', 0.6));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x - 10, baseY);
  ctx.quadraticCurveTo(x + bend * 0.4, baseY - h * 0.6, x + bend, baseY - h);
  ctx.quadraticCurveTo(x + bend * 0.3, baseY - h * 0.55, x + 10, baseY);
  ctx.closePath();
  ctx.fill();
}

export function disposeBackground(scene: Phaser.Scene): void {
  for (const key of [...created]) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    created.delete(key);
  }
}
