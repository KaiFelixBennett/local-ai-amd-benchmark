/**
 * Procedural art generator. Draws cartoon birds, environment props and UI
 * assets onto Phaser Graphics objects and converts them to textures.
 * All art is generated at runtime — no external image files.
 */

import Phaser from 'phaser';
import { PALETTES, type BirdPalette } from './palettes';

/** Draw a rounded blob. */
type Color = number;

function c(h: string): number {
  return Number('0x' + h.replace('#', ''));
}

function blob(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: Color): void {
  g.fillStyle(color, 1);
  g.fillEllipse(x, y, w, h);
}

function line(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, color: Color, w: number): void {
  g.lineStyle(w, color, 1);
  g.lineBetween(x0, y0, x1, y1);
}

function poly(g: Phaser.GameObjects.Graphics, pts: [number, number][], color: Color, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fillPath();
}

/**
 * Paint a cartoon bird body (facing right) centered at (cx,cy) with the given
 * scale. Returns nothing; draws directly to the Graphics.
 */
export function paintBird(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  s: number,
  p: BirdPalette,
  opts: { wingUp?: number; hurt?: boolean; dead?: boolean; armor?: number } = {}
): void {
  const wingUp = opts.wingUp ?? 0; // -1..1
  const n = {
    body: c(p.body),
    body2: c(p.body2),
    belly: c(p.belly),
    wing: c(p.wing),
    beak: c(p.beak),
    tail: c(p.tail),
    eye: c(p.eye),
    accent: c(p.accent)
  };
  // Tail
  poly(g, [[cx - 20 * s, cy - 2 * s], [cx - 34 * s, cy - 10 * s], [cx - 32 * s, cy + 6 * s]], n.tail);
  // Body
  blob(g, cx, cy, 44 * s, 40 * s, n.body);
  blob(g, cx + 2 * s, cy + 4 * s, 30 * s, 26 * s, n.belly);
  // Head
  blob(g, cx + 18 * s, cy - 10 * s, 26 * s, 24 * s, n.body2);
  // Beak
  poly(g, [[cx + 28 * s, cy - 14 * s], [cx + 44 * s, cy - 9 * s], [cx + 28 * s, cy - 4 * s]], n.beak);
  // Eye
  blob(g, cx + 22 * s, cy - 13 * s, 6 * s, 6 * s, 0xffffff);
  blob(g, cx + 23 * s, cy - 13 * s, 3 * s, 3 * s, n.eye);
  // Wing (flapping) — no transform; position + squash to fake rotation
  const wingX = cx - 4 * s;
  const wingY = cy + wingUp * 10 * s;
  blob(g, wingX, wingY, 30 * s, 18 * s, n.wing);
  blob(g, wingX + 2 * s, wingY - 1 * s, 20 * s, 10 * s, n.accent);
  // Feet (cartoon)
  if (!opts.dead) {
    line(g, cx - 4 * s, cy + 16 * s, cx - 8 * s, cy + 22 * s, n.beak, 2 * s);
    line(g, cx + 4 * s, cy + 16 * s, cx + 8 * s, cy + 22 * s, n.beak, 2 * s);
  }
  // Armor plates for panzerpelz / bosses (armor = 0..1 armor health fraction)
  if (opts.armor !== undefined) {
    const plateAlpha = 0.4 + opts.armor * 0.6;
    g.fillStyle(0x9aa2ad, plateAlpha);
    g.fillEllipse(cx, cy - 6 * s, 34 * s, 22 * s);
    g.lineStyle(3, 0x6b7280, plateAlpha);
    g.strokeEllipse(cx, cy - 6 * s, 34 * s, 22 * s);
    // rivets
    for (const dx of [-10, 0, 10]) {
      g.fillStyle(0xc0c8d2, plateAlpha);
      g.fillCircle(cx + dx * s, cy - 12 * s, 2 * s);
    }
    // cracks when damaged
    if (opts.armor < 0.66) line(g, cx - 6 * s, cy - 16 * s, cx + 2 * s, cy - 4 * s, 0x2a2e34, 2);
    if (opts.armor < 0.33) line(g, cx + 6 * s, cy - 14 * s, cx - 2 * s, cy, 0x2a2e34, 2);
  }
  // Hurt flash
  if (opts.hurt) {
    g.fillStyle(0xffffff, 0.5);
    g.fillEllipse(cx, cy, 46 * s, 42 * s);
  }
}

/**
 * Build the set of textures for all targets. Called once in the preload/
 * create of the main scene.
 */
export function generateTargetTextures(scene: Phaser.Scene): void {
  const kinds = Object.keys(PALETTES);
  for (const kind of kinds) {
    makeBirdTexture(scene, kind, PALETTES[kind]);
  }
}

function makeBirdTexture(scene: Phaser.Scene, key: string, p: BirdPalette): void {
  const size = 128;
  const g = scene.add.graphics();
  g.clear();
  paintBird(g, size / 2, size / 2, 2.4, p);
  g.generateTexture(key, size, size);
  g.destroy();
}

/** A feather particle texture. */
export function makeFeatherTexture(scene: Phaser.Scene, key: string, color: number): void {
  const w = 32;
  const h = 48;
  const g = scene.add.graphics();
  g.fillStyle(color, 1);
  g.fillEllipse(w / 2, h / 2, 14, 44);
  g.lineStyle(2, 0x00000022, 1);
  g.lineBetween(w / 2, 6, w / 2, h - 6);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** A soft round glow sprite (used for hit flashes, glows). */
export function makeGlowTexture(scene: Phaser.Scene, key: string, color: number, size = 64): void {
  const g = scene.add.graphics();
  for (let i = 10; i > 0; i--) {
    const r = (size / 2) * (i / 10);
    g.fillStyle(color, 0.08);
    g.fillCircle(size / 2, size / 2, r);
  }
  g.fillStyle(color, 0.5);
  g.fillCircle(size / 2, size / 2, size * 0.12);
  g.generateTexture(key, size, size);
  g.destroy();
}

/** Muzzle flash star. */
export function makeMuzzleTexture(scene: Phaser.Scene, key: string): void {
  const size = 64;
  const g = scene.add.graphics();
  const cx = size / 2;
  const cy = size / 2;
  g.fillStyle(0xfff2a0, 0.9);
  poly(g, starPoints(cx, cy, 8, 26, 5), 0xfff2a0);
  g.fillStyle(0xffffff, 0.9);
  poly(g, starPoints(cx, cy, 6, 12, 3), 0xffffff);
  g.generateTexture(key, size, size);
  g.destroy();
}

function starPoints(cx: number, cy: number, spikes: number, outer: number, inner: number): [number, number][] {
  const pts: [number, number][] = [];
  const step = Math.PI / spikes;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = i * step - Math.PI / 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** A simple crosshair (ring + ticks) drawn at a given color/size. */
export function drawCrosshair(g: Phaser.GameObjects.Graphics, cx: number, cy: number, size: number, color: number, perfect: boolean): void {
  const c = perfect ? 0xffffff : color;
  g.lineStyle(2, c, 1);
  g.strokeCircle(cx, cy, size);
  line(g, cx, cy - size - 6, cx, cy - size + 6, c, 2);
  line(g, cx, cy + size - 6, cx, cy + size + 6, c, 2);
  line(g, cx - size - 6, cy, cx - size + 6, cy, c, 2);
  line(g, cx + size - 6, cy, cx + size + 6, cy, c, 2);
  g.fillStyle(c, 0.9);
  g.fillCircle(cx, cy, 1.5);
}

/** Balloon texture. */
export function makeBalloonTexture(scene: Phaser.Scene, key: string, color: number): void {
  const w = 48;
  const h = 72;
  const g = scene.add.graphics();
  g.fillStyle(color, 1);
  g.fillEllipse(w / 2, h / 2 - 6, 40, 48);
  g.fillStyle(color, 0.4);
  g.fillEllipse(w / 2 - 8, h / 2 - 14, 10, 14);
  poly(g, [[w / 2 - 4, h - 14], [w / 2 + 4, h - 14], [w / 2, h - 8]], color);
  g.lineStyle(2, 0x00000033, 1);
  g.lineBetween(w / 2, h - 8, w / 2, h);
  g.generateTexture(key, w, h);
  g.destroy();
}
