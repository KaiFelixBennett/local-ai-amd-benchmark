/**
 * Prozedurale Texturen: alle Vogel-, Boss- und Umgebungssprites werden
 * per Offscreen-Canvas gezeichnet (kein externes Asset nötig).
 * Stil: handgemalt wirkendes 2D-Cartoon mit klaren Konturen.
 *
 * Animationen: pro Frame eine kleine CanvasTexture (<key>_f0..f3).
 * Die Animationen referenzieren die Frames mit eigener Key-Referenz —
 * Phaser schaltet dann die Texture automatisch beim Abspielen.
 */
import Phaser from 'phaser';

type Ctx = CanvasRenderingContext2D;

interface BirdOpts {
  body: number;
  belly: number;
  wing: number;
  head: number;
  beak: number;
  eye?: number;
  tail?: number;
  w: number;
  h: number;
  wingAngle: number; // -1 (hoch) .. 1 (runter)
  wingStretch?: number;
  outline?: number;
  ghost?: number; // 0..1 Transparenz
  shimmer?: boolean;
  spiralTail?: boolean;
  ribbonTail?: number;
  plume?: number;
  noLegs?: boolean;
}

function shade(c: number, f: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * f)));
  return (r << 16) | (g << 8) | b;
}

function hex(c: number, a = 1): string {
  const s = c.toString(16).padStart(6, '0');
  return a >= 1 ? `#${s}` : `#${s}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
}

function drawBird(ctx: Ctx, o: BirdOpts): void {
  const { w, h } = o;
  const cx = w * 0.46;
  const cy = h * 0.52;
  const bodyW = w * 0.52;
  const bodyH = h * 0.52;
  const outline = o.outline ?? 0x26160c;
  const lw = Math.max(2, w * 0.035);

  ctx.save();
  if (o.ghost) ctx.globalAlpha = 1 - o.ghost * 0.45;

  // Schwanz
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.fillStyle = hex(o.tail ?? shade(o.body, 0.75));
  ctx.strokeStyle = hex(outline);
  if (o.spiralTail) {
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.3, cy);
    ctx.bezierCurveTo(cx - bodyW * 0.9, cy - bodyH * 0.7, cx - bodyW * 1.25, cy - bodyH * 0.1, cx - bodyW * 0.85, cy + bodyH * 0.45);
    ctx.bezierCurveTo(cx - bodyW * 0.6, cy + bodyH * 0.2, cx - bodyW * 0.5, cy + bodyH * 0.3, cx - bodyW * 0.35, cy + bodyH * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (o.ribbonTail !== undefined) {
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.25, cy - bodyH * 0.1);
    ctx.bezierCurveTo(cx - bodyW * 0.8, cy - bodyH * 0.55, cx - bodyW * 1.15, cy + bodyH * 0.1, cx - bodyW * 0.7, cy + bodyH * 0.5);
    ctx.lineWidth = bodyH * 0.3;
    ctx.strokeStyle = hex(o.ribbonTail);
    ctx.stroke();
    ctx.lineWidth = lw;
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.25, cy - bodyH * 0.18);
    ctx.lineTo(cx - bodyW * 0.75, cy - bodyH * 0.42);
    ctx.lineTo(cx - bodyW * 0.62, cy);
    ctx.lineTo(cx - bodyW * 0.82, cy + bodyH * 0.3);
    ctx.lineTo(cx - bodyW * 0.2, cy + bodyH * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Beine
  if (!o.noLegs) {
    ctx.strokeStyle = hex(shade(o.beak, 0.7));
    ctx.lineWidth = lw * 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.08, cy + bodyH * 0.78);
    ctx.lineTo(cx - bodyW * 0.1, cy + bodyH * 1.02);
    ctx.moveTo(cx + bodyW * 0.22, cy + bodyH * 0.8);
    ctx.lineTo(cx + bodyW * 0.24, cy + bodyH * 1.04);
    ctx.stroke();
  }

  // Körper
  ctx.fillStyle = hex(o.body);
  ctx.strokeStyle = hex(outline);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.ellipse(cx, cy, bodyW * 0.62, bodyH * 0.58, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Bauch
  ctx.fillStyle = hex(o.belly);
  ctx.beginPath();
  ctx.ellipse(cx - bodyW * 0.02, cy + bodyH * 0.22, bodyW * 0.42, bodyH * 0.32, -0.08, 0, Math.PI * 2);
  ctx.fill();

  // Kopf
  const hx = cx + bodyW * 0.52;
  const hy = cy - bodyH * 0.42;
  const hr = bodyH * 0.46;
  ctx.fillStyle = hex(o.head);
  ctx.strokeStyle = hex(outline);
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Federkamm / Plume
  if (o.plume !== undefined) {
    ctx.strokeStyle = hex(o.plume);
    ctx.lineWidth = hr * 0.32;
    ctx.beginPath();
    ctx.moveTo(hx - hr * 0.2, hy - hr * 0.9);
    ctx.quadraticCurveTo(hx + hr * 0.1, hy - hr * 1.5, hx + hr * 0.6, hy - hr * 1.15);
    ctx.stroke();
    ctx.lineWidth = lw;
  }

  // Schnabel
  ctx.fillStyle = hex(o.beak);
  ctx.strokeStyle = hex(outline);
  ctx.beginPath();
  ctx.moveTo(hx + hr * 0.55, hy - hr * 0.28);
  ctx.lineTo(hx + hr * 1.45, hy + hr * 0.05);
  ctx.lineTo(hx + hr * 0.5, hy + hr * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Auge
  const ex = hx + hr * 0.18;
  const ey = hy - hr * 0.18;
  const er = hr * 0.3;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hex(outline);
  ctx.lineWidth = lw * 0.6;
  ctx.stroke();
  ctx.fillStyle = hex(o.eye ?? 0x1a1a1a);
  ctx.beginPath();
  ctx.arc(ex + er * 0.25, ey, er * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(ex + er * 0.1, ey - er * 0.25, er * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Flügel (rotiert um Schulter)
  ctx.save();
  ctx.translate(cx - bodyW * 0.02, cy - bodyH * 0.08);
  ctx.rotate(o.wingAngle * 0.85);
  const ww = bodyW * 0.62 * (o.wingStretch ?? 1);
  const wh = bodyH * 0.42;
  ctx.fillStyle = hex(o.wing);
  ctx.strokeStyle = hex(outline);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.ellipse(-ww * 0.1, -wh * 0.4, ww * 0.62, wh * 0.5, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = hex(shade(o.wing, 0.7));
  ctx.lineWidth = lw * 0.5;
  ctx.beginPath();
  ctx.arc(-ww * 0.05, -wh * 0.35, ww * 0.3, Math.PI * 0.9, Math.PI * 1.8);
  ctx.stroke();
  ctx.restore();

  // Goldschimmer
  if (o.shimmer) {
    const g = ctx.createRadialGradient(hx, hy, hr * 0.2, cx, cy, bodyW * 0.9);
    g.addColorStop(0, 'rgba(255,244,180,0.55)');
    g.addColorStop(0.5, 'rgba(255,210,62,0.12)');
    g.addColorStop(1, 'rgba(255,210,62,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, bodyW * 0.95, bodyH * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** Zeichnet Rüstung (Panzerpelz / Boss) in Stufe 0..2. */
function drawArmor(ctx: Ctx, w: number, h: number, stage: number, base = 0x9aa2ad): void {
  const cx = w * 0.42;
  const cy = h * 0.5;
  const plateW = w * 0.4;
  const plateH = h * 0.5;
  const outline = 0x3a4048;

  ctx.save();
  ctx.lineWidth = Math.max(2, w * 0.03);
  ctx.strokeStyle = hex(outline);
  ctx.fillStyle = hex(base);
  ctx.beginPath();
  ctx.roundRect(cx - plateW * 0.5, cy - plateH * 0.55, plateW, plateH * 0.95, plateW * 0.2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = hex(shade(base, 1.25));
  ctx.lineWidth = Math.max(1.5, w * 0.018);
  ctx.beginPath();
  ctx.moveTo(cx - plateW * 0.3, cy - plateH * 0.35);
  ctx.lineTo(cx + plateW * 0.3, cy - plateH * 0.35);
  ctx.stroke();
  ctx.fillStyle = hex(shade(base, 0.6));
  for (const [nx, ny] of [
    [-0.35, -0.42],
    [0.35, -0.42],
    [-0.35, 0.3],
    [0.35, 0.3],
  ]) {
    ctx.beginPath();
    ctx.arc(cx + plateW * nx, cy + plateH * ny, w * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = hex(0x22262c);
  ctx.lineWidth = Math.max(2, w * 0.02);
  if (stage >= 1) {
    ctx.beginPath();
    ctx.moveTo(cx + plateW * 0.1, cy - plateH * 0.5);
    ctx.lineTo(cx + plateW * 0.22, cy - plateH * 0.1);
    ctx.lineTo(cx + plateW * 0.05, cy + plateH * 0.2);
    ctx.stroke();
  }
  if (stage >= 2) {
    ctx.fillStyle = hex(0x1c2026);
    ctx.beginPath();
    ctx.moveTo(cx + plateW * 0.15, cy - plateH * 0.4);
    ctx.lineTo(cx + plateW * 0.48, cy - plateH * 0.2);
    ctx.lineTo(cx + plateW * 0.3, cy + plateH * 0.1);
    ctx.lineTo(cx + plateW * 0.45, cy + plateH * 0.3);
    ctx.lineTo(cx - plateW * 0.05, cy + plateH * 0.35);
    ctx.lineTo(cx + plateW * 0.05, cy - plateH * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hex(0x22262c);
    ctx.beginPath();
    ctx.moveTo(cx - plateW * 0.45, cy + plateH * 0.1);
    ctx.lineTo(cx - plateW * 0.15, cy + plateH * 0.4);
    ctx.stroke();
  }
  ctx.restore();
}

const FLAP_ANGLES = [-0.85, -0.15, 0.5, 0.95];

function frameKey(base: string, i: string): string {
  return `${base}_f${i}`;
}

/** Zeichnet einen Vogel-Frame in eine CanvasTexture. */
function drawFrame(scene: Phaser.Scene, key: string, w: number, h: number, opts: BirdOpts): void {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  drawBird(ctx, opts);
  const img = scene.textures.createCanvas(key, w, h) as Phaser.Textures.CanvasTexture;
  const cctx = img.getContext();
  cctx.clearRect(0, 0, w, h);
  cctx.drawImage(cv, 0, 0);
  img.refresh();
}

/** Erzeugt 4 Frames + Flügelschlag-Animation. */
function makeBirdFrames(scene: Phaser.Scene, key: string, opts: Omit<BirdOpts, 'wingAngle'>): void {
  for (let i = 0; i < 4; i++) {
    drawFrame(scene, frameKey(key, String(i)), opts.w, opts.h, { ...opts, wingAngle: FLAP_ANGLES[i] });
  }
  scene.anims.create({
    key: `${key}_flap`,
    frames: [0, 1, 2, 1].map((i) => ({ key: frameKey(key, String(i)), frame: 0 })),
    frameRate: 11,
    repeat: -1,
  });
}

/** Rüstungsvogel: 3 Stufen × 4 Frames. */
function makeArmoredBirdFrames(
  scene: Phaser.Scene,
  key: string,
  opts: Omit<BirdOpts, 'wingAngle'>,
  armorBase?: number,
): void {
  for (let stage = 0; stage < 3; stage++) {
    for (let f = 0; f < 4; f++) {
      const srcKey = frameKey(`${key}_s${stage}`, String(f));
      const w = opts.w;
      const h = opts.h;
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d')!;
      drawBird(ctx, { ...opts, wingAngle: FLAP_ANGLES[f] });
      drawArmor(ctx, w, h, stage, armorBase);
      const img = scene.textures.createCanvas(srcKey, w, h) as Phaser.Textures.CanvasTexture;
      const cctx = img.getContext();
      cctx.clearRect(0, 0, w, h);
      cctx.drawImage(cv, 0, 0);
      img.refresh();
    }
    scene.anims.create({
      key: `${key}_flap_s${stage}`,
      frames: [0, 1, 2, 1].map((f) => ({ key: frameKey(`${key}_s${stage}`, String(f)), frame: 0 })),
      frameRate: 11,
      repeat: -1,
    });
  }
}

// ── Umgebungsojekte ────────────────────────────────────────────────

function envCanvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void): void {
  const img = scene.textures.createCanvas(key, w, h) as Phaser.Textures.CanvasTexture;
  const ctx = img.getContext();
  ctx.clearRect(0, 0, w, h);
  draw(ctx);
  img.refresh();
}

const OUT = 0x2a2018;

function drawLantern(ctx: Ctx, w: number, h: number): void {
  ctx.strokeStyle = hex(OUT);
  ctx.lineWidth = 5;
  ctx.fillStyle = hex(0x5d4037);
  ctx.fillRect(w * 0.44, h * 0.18, w * 0.12, h * 0.75);
  ctx.strokeRect(w * 0.44, h * 0.18, w * 0.12, h * 0.75);
  ctx.fillStyle = hex(0x6d4c41);
  ctx.fillRect(w * 0.2, h * 0.16, w * 0.6, h * 0.06);
  ctx.strokeRect(w * 0.2, h * 0.16, w * 0.6, h * 0.06);
  const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 4, w * 0.5, h * 0.42, w * 0.3);
  g.addColorStop(0, 'rgba(255,214,120,0.9)');
  g.addColorStop(1, 'rgba(255,214,120,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.42, w * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hex(0xffd54f);
  ctx.strokeStyle = hex(OUT);
  ctx.lineWidth = 3;
  ctx.fillRect(w * 0.4, h * 0.3, w * 0.2, h * 0.22);
  ctx.strokeRect(w * 0.4, h * 0.3, w * 0.2, h * 0.22);
  ctx.fillStyle = hex(0x455a64);
  ctx.beginPath();
  ctx.moveTo(w * 0.36, h * 0.3);
  ctx.lineTo(w * 0.64, h * 0.3);
  ctx.lineTo(w * 0.5, h * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawTincans(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 4;
  ctx.strokeStyle = hex(OUT);
  ctx.fillStyle = hex(0x8d6e63);
  ctx.fillRect(0, h * 0.75, w, h * 0.06);
  ctx.strokeRect(0, h * 0.75, w, h * 0.06);
  for (let i = 0; i < 4; i++) {
    const cx = w * (0.15 + i * 0.24);
    ctx.fillStyle = i % 2 ? hex(0x90a4ae) : hex(0xb0bec5);
    ctx.beginPath();
    ctx.roundRect(cx - w * 0.07, h * 0.45, w * 0.14, h * 0.3, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hex(0x78909c);
    ctx.fillRect(cx - w * 0.07, h * 0.55, w * 0.14, h * 0.04);
  }
}

function drawScarecrow(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 5;
  ctx.strokeStyle = hex(OUT);
  ctx.fillStyle = hex(0x8d6e63);
  ctx.fillRect(w * 0.46, h * 0.15, w * 0.08, h * 0.8);
  ctx.strokeRect(w * 0.46, h * 0.15, w * 0.08, h * 0.8);
  ctx.fillRect(w * 0.2, h * 0.3, w * 0.6, h * 0.07);
  ctx.strokeRect(w * 0.2, h * 0.3, w * 0.6, h * 0.07);
  ctx.fillStyle = hex(0xd7ccc8);
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.22, w * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hex(0x3e2723);
  ctx.beginPath();
  ctx.arc(w * 0.46, h * 0.2, w * 0.02, 0, Math.PI * 2);
  ctx.arc(w * 0.54, h * 0.2, w * 0.02, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hex(0xc9a227);
  ctx.strokeStyle = hex(OUT);
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.13, w * 0.19, h * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(w * 0.4, h * 0.05, w * 0.2, h * 0.09);
  ctx.strokeRect(w * 0.4, h * 0.05, w * 0.2, h * 0.09);
  ctx.fillStyle = hex(0x7e57c2);
  ctx.beginPath();
  ctx.roundRect(w * 0.34, h * 0.36, w * 0.32, h * 0.3, 8);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = hex(0xd7ccc8);
  ctx.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(w * 0.34, h * 0.42 + i * h * 0.08);
    ctx.lineTo(w * 0.24, h * 0.4 + i * h * 0.08);
    ctx.moveTo(w * 0.66, h * 0.42 + i * h * 0.08);
    ctx.lineTo(w * 0.76, h * 0.4 + i * h * 0.08);
    ctx.stroke();
  }
}

function drawBell(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 4;
  ctx.strokeStyle = hex(0x8d6e63);
  ctx.beginPath();
  ctx.moveTo(w * 0.5, 0);
  ctx.lineTo(w * 0.5, h * 0.3);
  ctx.stroke();
  ctx.fillStyle = hex(0xffc107);
  ctx.strokeStyle = hex(OUT);
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.25);
  ctx.bezierCurveTo(w * 0.2, h * 0.3, w * 0.18, h * 0.75, w * 0.15, h * 0.85);
  ctx.lineTo(w * 0.85, h * 0.85);
  ctx.bezierCurveTo(w * 0.82, h * 0.75, w * 0.8, h * 0.3, w * 0.5, h * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hex(0xffa000);
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.9, w * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawBucket(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 4;
  ctx.strokeStyle = hex(0x8d6e63);
  ctx.beginPath();
  ctx.moveTo(w * 0.5, 0);
  ctx.lineTo(w * 0.5, h * 0.25);
  ctx.stroke();
  ctx.fillStyle = hex(0x90a4ae);
  ctx.strokeStyle = hex(OUT);
  ctx.beginPath();
  ctx.moveTo(w * 0.25, h * 0.3);
  ctx.lineTo(w * 0.75, h * 0.3);
  ctx.lineTo(w * 0.68, h * 0.95);
  ctx.lineTo(w * 0.32, h * 0.95);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hex(0xb0bec5);
  ctx.fillRect(w * 0.25, h * 0.45, w * 0.5, h * 0.06);
  ctx.strokeRect(w * 0.25, h * 0.45, w * 0.5, h * 0.06);
}

function drawPumpkin(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 4;
  ctx.strokeStyle = hex(OUT);
  const g = ctx.createRadialGradient(w * 0.42, h * 0.4, 4, w * 0.5, h * 0.55, w * 0.5);
  g.addColorStop(0, hex(0xff9800));
  g.addColorStop(1, hex(0xe65100));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.58, w * 0.4, h * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = hex(shade(0xe65100, 0.75));
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.58, w * 0.2, h * 0.4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = hex(0x558b2f);
  ctx.strokeStyle = hex(OUT);
  ctx.beginPath();
  ctx.roundRect(w * 0.46, h * 0.08, w * 0.08, h * 0.14, 4);
  ctx.fill();
  ctx.stroke();
}

function drawFungus(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 4;
  ctx.strokeStyle = hex(OUT);
  ctx.fillStyle = hex(0xeceff1);
  ctx.beginPath();
  ctx.roundRect(w * 0.38, h * 0.4, w * 0.24, h * 0.55, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hex(0xe53935);
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.32, w * 0.42, h * 0.28, 0, Math.PI, 0);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  for (const [px, py] of [
    [0.3, 0.24],
    [0.5, 0.16],
    [0.7, 0.26],
  ]) {
    ctx.beginPath();
    ctx.arc(w * px, h * py, w * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWheel(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 5;
  ctx.strokeStyle = hex(OUT);
  ctx.fillStyle = hex(0x8d6e63);
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.55, w * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hex(0x5d4037);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.save();
    ctx.translate(w * 0.5, h * 0.55);
    ctx.rotate(a);
    ctx.fillRect(-w * 0.035, -w * 0.4, w * 0.07, w * 0.4);
    ctx.strokeRect(-w * 0.035, -w * 0.4, w * 0.07, w * 0.4);
    ctx.restore();
  }
  ctx.fillStyle = hex(0x4e342e);
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.55, w * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawReed(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const x = w * (0.12 + i * 0.09);
    const lean = (i - 4) * 0.05;
    ctx.strokeStyle = i % 2 ? hex(0x7c9a4e) : hex(0x5d8040);
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.quadraticCurveTo(x + lean * h, h * 0.5, x + lean * h * 1.6, h * (0.1 + (i % 3) * 0.08));
    ctx.stroke();
    ctx.fillStyle = hex(0x6d4c41);
    ctx.beginPath();
    ctx.ellipse(x + lean * h * 1.6, h * (0.1 + (i % 3) * 0.08), w * 0.03, h * 0.07, lean, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSign(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 4;
  ctx.strokeStyle = hex(OUT);
  ctx.fillStyle = hex(0x8d6e63);
  ctx.fillRect(w * 0.46, h * 0.3, w * 0.08, h * 0.7);
  ctx.strokeRect(w * 0.46, h * 0.3, w * 0.08, h * 0.7);
  ctx.fillStyle = hex(0xa1887f);
  ctx.beginPath();
  ctx.roundRect(w * 0.12, h * 0.12, w * 0.76, h * 0.26, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.arc(w * 0.2, h * 0.2, w * 0.03, 0, Math.PI * 2);
  ctx.arc(w * 0.78, h * 0.32, w * 0.025, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hex(0x4e342e);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.12);
  ctx.lineTo(w * 0.55, h * 0.25);
  ctx.stroke();
}

function drawHollow(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 5;
  ctx.strokeStyle = hex(OUT);
  ctx.fillStyle = hex(0x5d4037);
  ctx.beginPath();
  ctx.moveTo(0, h * 0.15);
  ctx.bezierCurveTo(w * 0.3, h * 0.1, w * 0.7, h * 0.3, w, h * 0.22);
  ctx.lineTo(w, h * 0.42);
  ctx.bezierCurveTo(w * 0.7, h * 0.5, w * 0.3, h * 0.3, 0, h * 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hex(0x1a120c);
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.3, w * 0.14, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,200,90,0.5)';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.32, w * 0.08, h * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hex(0x66bb6a);
  for (const [lx, ly] of [
    [0.15, 0.1],
    [0.4, 0.06],
    [0.65, 0.12],
    [0.85, 0.08],
  ]) {
    ctx.beginPath();
    ctx.ellipse(w * lx, h * ly, w * 0.09, h * 0.06, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWater(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(90,140,170,0.85)');
  g.addColorStop(1, 'rgba(40,80,110,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const y = h * (0.15 + i * 0.15);
    ctx.beginPath();
    ctx.moveTo(w * 0.1, y);
    ctx.lineTo(w * 0.35, y + 4);
    ctx.moveTo(w * 0.55, y);
    ctx.lineTo(w * 0.85, y + 3);
    ctx.stroke();
  }
}

function drawWeathervane(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 4;
  ctx.strokeStyle = hex(OUT);
  ctx.fillStyle = hex(0x607d8b);
  ctx.fillRect(w * 0.47, h * 0.2, w * 0.06, h * 0.75);
  ctx.strokeRect(w * 0.47, h * 0.2, w * 0.06, h * 0.75);
  ctx.fillStyle = hex(0x90a4ae);
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.2);
  ctx.lineTo(w * 0.5, h * 0.05);
  ctx.lineTo(w * 0.8, h * 0.12);
  ctx.lineTo(w * 0.5, h * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = hex(0x546e7a);
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.2);
    ctx.lineTo(w * 0.5 + Math.cos(a) * w * 0.3, h * 0.2 + Math.sin(a) * w * 0.3);
    ctx.stroke();
  }
}

function drawGhostlight(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.5, 2, w * 0.5, h * 0.5, w * 0.5);
  g.addColorStop(0, 'rgba(190,225,255,0.95)');
  g.addColorStop(0.4, 'rgba(140,190,255,0.5)');
  g.addColorStop(1, 'rgba(120,170,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawGlowplant(ctx: Ctx, w: number, h: number): void {
  for (let i = 0; i < 5; i++) {
    const x = w * (0.2 + i * 0.15);
    const g = ctx.createRadialGradient(x, h * 0.75, 1, x, h * 0.75, w * 0.12);
    g.addColorStop(0, 'rgba(150,255,170,0.9)');
    g.addColorStop(1, 'rgba(120,255,150,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, h * 0.75, w * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hex(0x4a7a4e);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.quadraticCurveTo(x + 4, h * 0.85, x, h * 0.72);
    ctx.stroke();
  }
}

function drawJar(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 4;
  ctx.strokeStyle = hex(0x37474f);
  ctx.fillStyle = 'rgba(200,230,255,0.4)';
  ctx.beginPath();
  ctx.roundRect(w * 0.25, h * 0.15, w * 0.5, h * 0.8, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hex(0x8d6e63);
  ctx.fillRect(w * 0.28, h * 0.08, w * 0.44, h * 0.1);
  ctx.strokeRect(w * 0.28, h * 0.08, w * 0.44, h * 0.1);
  for (const [fx, fy] of [
    [0.4, 0.45],
    [0.6, 0.6],
    [0.48, 0.72],
  ]) {
    const g = ctx.createRadialGradient(w * fx, h * fy, 1, w * fx, h * fy, w * 0.08);
    g.addColorStop(0, 'rgba(190,255,120,1)');
    g.addColorStop(1, 'rgba(160,255,100,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w * fx, h * fy, w * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCart(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 4;
  ctx.strokeStyle = hex(OUT);
  ctx.fillStyle = hex(0x795548);
  ctx.beginPath();
  ctx.roundRect(w * 0.15, h * 0.25, w * 0.7, h * 0.4, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hex(0x5d4037);
  ctx.fillRect(w * 0.1, h * 0.2, w * 0.1, h * 0.5);
  ctx.strokeRect(w * 0.1, h * 0.2, w * 0.1, h * 0.5);
  for (const wx of [0.32, 0.68]) {
    ctx.fillStyle = hex(0x4e342e);
    ctx.beginPath();
    ctx.arc(w * wx, h * 0.75, h * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hex(0x8d6e63);
    ctx.beginPath();
    ctx.arc(w * wx, h * 0.75, h * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCairn(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 4;
  ctx.strokeStyle = hex(OUT);
  const stones = [
    [0.5, 0.85, 0.32],
    [0.5, 0.55, 0.24],
    [0.5, 0.3, 0.16],
    [0.5, 0.12, 0.1],
  ] as const;
  stones.forEach(([sx, sy, sr], i) => {
    ctx.fillStyle = i % 2 ? hex(0x78909c) : hex(0x90a4ae);
    ctx.beginPath();
    ctx.ellipse(w * sx, h * sy, w * sr * 0.6, h * sr * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

function drawAnchor(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 6;
  ctx.strokeStyle = hex(0x455a64);
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.2, w * 0.09, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.3);
  ctx.lineTo(w * 0.5, h * 0.85);
  ctx.moveTo(w * 0.35, h * 0.45);
  ctx.lineTo(w * 0.65, h * 0.45);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.7, w * 0.3, 0.25, Math.PI - 0.25);
  ctx.stroke();
}

function drawCrate(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 4;
  ctx.strokeStyle = hex(OUT);
  ctx.fillStyle = hex(0xa1887f);
  ctx.beginPath();
  ctx.roundRect(w * 0.1, h * 0.35, w * 0.5, h * 0.6, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hex(0x8d6e63);
  ctx.beginPath();
  ctx.roundRect(w * 0.4, h * 0.1, w * 0.5, h * 0.45, 4);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = hex(0x6d4c41);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.1, h * 0.65);
  ctx.lineTo(w * 0.6, h * 0.65);
  ctx.moveTo(w * 0.4, h * 0.32);
  ctx.lineTo(w * 0.9, h * 0.32);
  ctx.stroke();
}

function drawBuoy(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 4;
  ctx.strokeStyle = hex(OUT);
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, hex(0xef5350));
  g.addColorStop(0.5, hex(0xffffff));
  g.addColorStop(1, hex(0xef5350));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, 0);
  ctx.bezierCurveTo(w * 0.95, h * 0.2, w * 0.9, h * 0.8, w * 0.5, h);
  ctx.bezierCurveTo(w * 0.1, h * 0.8, w * 0.05, h * 0.2, w * 0.5, 0);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hex(0x455a64);
  ctx.fillRect(w * 0.44, 0, w * 0.12, h * 0.08);
}

function drawNet(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(120,144,156,0.9)';
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(0, h * (i / 7));
    ctx.lineTo(w, h * (i / 7) + h * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * (i / 7), 0);
    ctx.lineTo(w * (i / 7), h);
    ctx.stroke();
  }
  ctx.strokeStyle = hex(OUT);
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, w, h);
}

function drawRock(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 4;
  ctx.strokeStyle = hex(OUT);
  ctx.fillStyle = hex(0x607d8b);
  ctx.beginPath();
  ctx.moveTo(w * 0.1, h * 0.9);
  ctx.lineTo(w * 0.05, h * 0.5);
  ctx.lineTo(w * 0.3, h * 0.2);
  ctx.lineTo(w * 0.65, h * 0.1);
  ctx.lineTo(w * 0.95, h * 0.4);
  ctx.lineTo(w * 0.9, h * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hex(0x78909c);
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h * 0.2);
  ctx.lineTo(w * 0.65, h * 0.1);
  ctx.lineTo(w * 0.7, h * 0.35);
  ctx.lineTo(w * 0.35, h * 0.42);
  ctx.closePath();
  ctx.fill();
}

function drawLighthouseLamp(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.5, 4, w * 0.5, h * 0.5, w * 0.5);
  g.addColorStop(0, 'rgba(255,240,180,0.95)');
  g.addColorStop(0.5, 'rgba(255,230,140,0.4)');
  g.addColorStop(1, 'rgba(255,230,140,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = hex(0xfff3c4);
  ctx.fillRect(w * 0.35, h * 0.3, w * 0.3, h * 0.4);
}

function drawRope(ctx: Ctx, w: number, h: number): void {
  ctx.lineWidth = 5;
  ctx.strokeStyle = hex(0xa1887f);
  ctx.beginPath();
  ctx.moveTo(w * 0.2, 0);
  ctx.quadraticCurveTo(w * 0.5, h * 0.6, w * 0.7, h);
  ctx.stroke();
  ctx.fillStyle = hex(0x8d6e63);
  ctx.beginPath();
  ctx.arc(w * 0.7, h, w * 0.09, 0, Math.PI * 2);
  ctx.fill();
}

// ── Partikel-Texturen ─────────────────────────────────────────────

function drawFeather(ctx: Ctx, w: number, h: number, color: number): void {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.5);
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, hex(shade(color, 0.8)));
  g.addColorStop(1, hex(shade(color, 1.15)));
  ctx.fillStyle = g;
  ctx.strokeStyle = hex(shade(color, 0.55));
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.42, h * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = hex(shade(color, 0.6));
  ctx.beginPath();
  ctx.moveTo(-w * 0.4, h * 0.05);
  ctx.quadraticCurveTo(0, -h * 0.05, w * 0.42, -h * 0.02);
  ctx.stroke();
  ctx.restore();
}

function drawGlow(ctx: Ctx, w: number, h: number, rgb: [number, number, number]): void {
  const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
  g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.9)`);
  g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawSpark(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export const FEATHER_NAMES = [
  'orange',
  'teal',
  'purple',
  'gray',
  'gold',
  'red',
  'green',
  'salmon',
  'steel',
  'pink',
  'violet',
  'white',
] as const;

export const FEATHER_COLORS: Record<string, number> = {
  orange: 0xe8933a,
  teal: 0x9adcf0,
  purple: 0xb07ae0,
  gray: 0x9aa2ad,
  gold: 0xffd23e,
  red: 0xef5350,
  green: 0x66bb6a,
  salmon: 0xff8a65,
  steel: 0x78909c,
  pink: 0xec407a,
  violet: 0x7c4dff,
  white: 0xeceff1,
};

// ── Parallax-Layer ─────────────────────────────────────────────────

interface LayerOpts {
  color: number;
  kind: 'hills' | 'trees' | 'reeds' | 'cliff' | 'moon' | 'stars';
  seed: number;
}

function drawParallaxLayer(scene: Phaser.Scene, key: string, w: number, h: number, o: LayerOpts): void {
  const img = scene.textures.createCanvas(key, w, h) as Phaser.Textures.CanvasTexture;
  const ctx = img.getContext();
  ctx.clearRect(0, 0, w, h);

  let s = o.seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };

  if (o.kind === 'stars') {
    for (let i = 0; i < 90; i++) {
      const x = rnd() * w;
      const y = rnd() * h * 0.8;
      const r = 0.5 + rnd() * 1.5;
      ctx.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    img.refresh();
    return;
  }

  if (o.kind === 'moon') {
    const cx = w * 0.75;
    const cy = h * 0.3;
    const r = h * 0.18;
    const g = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 2.2);
    g.addColorStop(0, 'rgba(230,235,255,0.9)');
    g.addColorStop(0.35, 'rgba(200,210,255,0.25)');
    g.addColorStop(1, 'rgba(200,210,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = hex(0xe8ecff);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,170,210,0.35)';
    for (const [mx, my, mr] of [
      [0.88, 0.25, 0.05],
      [0.78, 0.38, 0.04],
      [0.72, 0.3, 0.03],
    ]) {
      ctx.beginPath();
      ctx.arc(w * mx, h * my, h * mr, 0, Math.PI * 2);
      ctx.fill();
    }
    img.refresh();
    return;
  }

  ctx.fillStyle = hex(o.color);
  ctx.beginPath();
  ctx.moveTo(0, h);
  const baseY = h * (o.kind === 'reeds' ? 0.45 : 0.55);
  ctx.lineTo(0, baseY + rnd() * h * 0.1);
  const segs = 24;
  for (let i = 0; i <= segs; i++) {
    const x = (i / segs) * w;
    let y = baseY;
    if (o.kind === 'hills') y = baseY + Math.sin(i * 0.7 + o.seed) * h * 0.12 + (rnd() - 0.5) * h * 0.05;
    if (o.kind === 'cliff') y = baseY + (rnd() - 0.5) * h * 0.2;
    if (o.kind === 'trees') {
      y = baseY + Math.sin(i * 1.3 + o.seed) * h * 0.08;
      if (i % 4 === 0) {
        ctx.lineTo(x, y);
        const th = h * (0.12 + rnd() * 0.1);
        ctx.lineTo(x - w * 0.012, y);
        ctx.lineTo(x, y - th);
        ctx.lineTo(x + w * 0.012, y);
        ctx.lineTo(x + w * 0.02, y);
      }
    }
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  if (o.kind === 'reeds') {
    ctx.strokeStyle = hex(o.color);
    ctx.lineWidth = 4;
    for (let i = 0; i < 60; i++) {
      const x = rnd() * w;
      const rh = h * (0.2 + rnd() * 0.35);
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.quadraticCurveTo(x + 6, h - rh * 0.6, x + (rnd() - 0.5) * 14, h - rh);
      ctx.stroke();
    }
  }
  img.refresh();
}

function makeSkyGradient(scene: Phaser.Scene, key: string, top: number, bottom: number): void {
  const img = scene.textures.createCanvas(key, 64, 256) as Phaser.Textures.CanvasTexture;
  const ctx = img.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, hex(top));
  g.addColorStop(1, hex(bottom));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  img.refresh();
}

/** Erzeugt ALLE Texturen und Animationen. Wird exakt einmal aufgerufen. */
export function initAllTextures(scene: Phaser.Scene): void {
  makeBirdFrames(scene, 'bird_moorflatterer', {
    body: 0xe8933a, belly: 0xf6d7ab, wing: 0xc9721f, head: 0xf2a952, beak: 0xffb300, tail: 0xb56418, w: 72, h: 64,
  });
  makeBirdFrames(scene, 'bird_schnellfeder', {
    body: 0x9adcf0, belly: 0xe8f7fc, wing: 0x5fb8dd, head: 0xb8e8f7, beak: 0x4dabf7, tail: 0x7fc4e8, w: 48, h: 40,
  });
  makeBirdFrames(scene, 'bird_korkenzieher', {
    body: 0xb07ae0, belly: 0xe2cdf5, wing: 0x8a5cc0, head: 0xc496e8, beak: 0xff8a80, tail: 0x7a4cb0, w: 72, h: 64, spiralTail: true,
  });
  makeArmoredBirdFrames(scene, 'bird_panzerpelz', {
    body: 0x8d6e63, belly: 0xcbb59c, wing: 0x6d4c41, head: 0x9b7b6a, beak: 0xffa726, tail: 0x5d4037, w: 96, h: 80,
  }, 0x9aa2ad);
  makeBirdFrames(scene, 'bird_goldschnabel', {
    body: 0xf5b70a, belly: 0xffe98a, wing: 0xd99a06, head: 0xffca28, beak: 0xff8f00, tail: 0xc68a05, w: 64, h: 56, shimmer: true,
  });
  makeBirdFrames(scene, 'bird_taeuscher', {
    body: 0xd9b44a, belly: 0xf0e0a8, wing: 0xb5952f, head: 0xe0c05a, beak: 0xe69500, tail: 0xa08425, w: 64, h: 56, shimmer: true,
  });
  makeBirdFrames(scene, 'bird_nebelfluesterer', {
    body: 0xcfd8dc, belly: 0xf5f7f8, wing: 0x90a4ae, head: 0xdde3e6, beak: 0x78909c, tail: 0x8fa3ad, w: 72, h: 64, ghost: 0.5, noLegs: true,
  });
  makeBirdFrames(scene, 'bird_schwarmvogel', {
    body: 0x66bb6a, belly: 0xc8e6c9, wing: 0x43a047, head: 0x81c784, beak: 0xffb300, tail: 0x388e3c, w: 40, h: 36,
  });
  makeBirdFrames(scene, 'bird_kurvensegler', {
    body: 0xff8a65, belly: 0xffe0b2, wing: 0xe64a19, head: 0xffa270, beak: 0x4e342e, tail: 0xbf360c, w: 84, h: 60, wingStretch: 1.4,
  });
  makeBirdFrames(scene, 'bird_sturmvogel', {
    body: 0x78909c, belly: 0xcfd8dc, wing: 0x546e7a, head: 0x90a4ae, beak: 0xff7043, tail: 0x455a64, w: 64, h: 52,
  });

  makeArmoredBirdFrames(scene, 'boss_moorkoloss', {
    body: 0x6d4c41, belly: 0x8d6e63, wing: 0x4e342e, head: 0x7b5548, beak: 0xffa726, tail: 0x3e2723, w: 260, h: 200,
    plume: 0xd84315, wingStretch: 1.2,
  }, 0x78909c);
  makeBirdFrames(scene, 'boss_federakrobat', {
    body: 0xec407a, belly: 0xf8bbd0, wing: 0xc2185b, head: 0xf06292, beak: 0xffd54f, tail: 0xad1457, w: 180, h: 140,
    ribbonTail: 0xf48fb1, wingStretch: 1.35,
  });
  makeBirdFrames(scene, 'boss_nachtgeflister', {
    body: 0x4a3b8f, belly: 0x6a5acd, wing: 0x33266e, head: 0x5c4db3, beak: 0xb388ff, tail: 0x2a1f5e, w: 200, h: 160,
    ghost: 0.35, noLegs: true, eye: 0xe1bee7,
  });

  const env: Record<string, [number, number, (c: Ctx, w: number, h: number) => void]> = {
    env_lantern: [96, 160, drawLantern],
    env_tincans: [160, 96, drawTincans],
    env_scarecrow: [128, 160, drawScarecrow],
    env_bell: [80, 120, drawBell],
    env_bucket: [72, 110, drawBucket],
    env_pumpkin: [96, 80, drawPumpkin],
    env_fungus: [88, 88, drawFungus],
    env_wheel: [110, 110, drawWheel],
    env_reed: [120, 130, drawReed],
    env_sign: [110, 120, drawSign],
    env_hollow: [160, 80, drawHollow],
    env_water: [220, 64, drawWater],
    env_weathervane: [100, 120, drawWeathervane],
    env_ghostlight: [64, 64, drawGhostlight],
    env_glowplant: [120, 90, drawGlowplant],
    env_jar: [72, 96, drawJar],
    env_cart: [160, 110, drawCart],
    env_cairn: [90, 100, drawCairn],
    env_anchor: [80, 110, drawAnchor],
    env_crate: [120, 110, drawCrate],
    env_buoy: [80, 120, drawBuoy],
    env_net: [120, 90, drawNet],
    env_rock: [140, 110, drawRock],
    env_lighthouse_lamp: [80, 80, drawLighthouseLamp],
    env_rope: [64, 96, drawRope],
  };
  for (const [key, [w, h, draw]] of Object.entries(env)) {
    envCanvas(scene, key, w, h, (c) => draw(c, w, h));
  }

  for (const name of FEATHER_NAMES) {
    envCanvas(scene, `feather_${name}`, 24, 12, (c) => drawFeather(c, 24, 12, FEATHER_COLORS[name]));
  }
  envCanvas(scene, 'fx_glow_white', 32, 32, (c) => drawGlow(c, 32, 32, [255, 255, 255]));
  envCanvas(scene, 'fx_glow_gold', 32, 32, (c) => drawGlow(c, 32, 32, [255, 214, 90]));
  envCanvas(scene, 'fx_glow_red', 32, 32, (c) => drawGlow(c, 32, 32, [255, 82, 82]));
  envCanvas(scene, 'fx_glow_blue', 32, 32, (c) => drawGlow(c, 32, 32, [120, 190, 255]));
  envCanvas(scene, 'fx_glow_green', 32, 32, (c) => drawGlow(c, 32, 32, [150, 255, 150]));
  envCanvas(scene, 'fx_spark', 16, 16, (c) => drawSpark(c, 16, 16));
  envCanvas(scene, 'fx_smoke', 32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 2, 16, 16, 16);
    g.addColorStop(0, 'rgba(230,230,230,0.8)');
    g.addColorStop(1, 'rgba(200,200,200,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
  });
  envCanvas(scene, 'fx_muzzle', 48, 48, (c) => {
    const g = c.createRadialGradient(24, 24, 2, 24, 24, 24);
    g.addColorStop(0, 'rgba(255,255,220,1)');
    g.addColorStop(0.3, 'rgba(255,200,80,0.9)');
    g.addColorStop(0.7, 'rgba(255,120,30,0.4)');
    g.addColorStop(1, 'rgba(255,100,20,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 48, 48);
  });
  envCanvas(scene, 'fx_drop', 4, 14, (c) => {
    c.strokeStyle = 'rgba(180,210,240,0.9)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(2, 0);
    c.lineTo(2, 14);
    c.stroke();
  });
  envCanvas(scene, 'fx_confetti', 10, 10, (c) => {
    c.fillStyle = '#ffd23e';
    c.fillRect(0, 0, 10, 10);
  });

  makeSkyGradient(scene, 'sky_nebelmoor', 0x2c3e50, 0xf5a25d);
  makeSkyGradient(scene, 'sky_sturmklippen', 0x263445, 0x7d9bb8);
  makeSkyGradient(scene, 'sky_mondbruch', 0x0d1030, 0x28306b);

  drawParallaxLayer(scene, 'layer_nebelmoor_far', 1920, 320, { color: 0x4a5d4f, kind: 'hills', seed: 7 });
  drawParallaxLayer(scene, 'layer_nebelmoor_trees', 1920, 320, { color: 0x3a4a3c, kind: 'trees', seed: 13 });
  drawParallaxLayer(scene, 'layer_nebelmoor_reeds', 1920, 260, { color: 0x26332a, kind: 'reeds', seed: 29 });
  drawParallaxLayer(scene, 'layer_sturmklippen_far', 1920, 320, { color: 0x3c4f5e, kind: 'cliff', seed: 21 });
  drawParallaxLayer(scene, 'layer_sturmklippen_mid', 1920, 320, { color: 0x2f4150, kind: 'cliff', seed: 33 });
  drawParallaxLayer(scene, 'layer_sturmklippen_reeds', 1920, 240, { color: 0x1e2c38, kind: 'reeds', seed: 41 });
  drawParallaxLayer(scene, 'layer_mondbruch_stars', 1920, 400, { color: 0xffffff, kind: 'stars', seed: 55 });
  drawParallaxLayer(scene, 'layer_mondbruch_moon', 1920, 400, { color: 0xffffff, kind: 'moon', seed: 56 });
  drawParallaxLayer(scene, 'layer_mondbruch_far', 1920, 300, { color: 0x232a52, kind: 'hills', seed: 61 });
  drawParallaxLayer(scene, 'layer_mondbruch_reeds', 1920, 260, { color: 0x10152c, kind: 'reeds', seed: 67 });
}
