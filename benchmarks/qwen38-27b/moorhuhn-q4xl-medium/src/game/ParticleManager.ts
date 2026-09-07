/**
 * Particle manager. Wraps Phaser particle emitters with named presets and
 * respects a global density factor from settings.
 */

import Phaser from 'phaser';

export class ParticleManager {
  private scene: Phaser.Scene;
  private density: number;
  private emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];

  constructor(scene: Phaser.Scene, density = 1) {
    this.scene = scene;
    this.density = density;
  }

  setDensity(d: number): void {
    this.density = d;
  }
  get count(): number {
    let n = 0;
    for (const e of this.emitters) n += e.getParticleCount?.() ?? 0;
    return n;
  }

  private emit(
    x: number,
    y: number,
    texture: string,
    cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig,
    tint?: number | number[]
  ): Phaser.GameObjects.Particles.ParticleEmitter {
    const scaled: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = { ...cfg };
    if (typeof scaled.quantity === 'number') scaled.quantity = Math.max(1, Math.round(scaled.quantity * this.density));
    if (tint !== undefined) scaled.tint = tint as never;
    const e = this.scene.add.particles(x, y, texture, scaled);
    // auto-clean
    e.once('stop', () => e.destroy());
    this.emitters.push(e);
    return e;
  }

  feathers(x: number, y: number, color: number, count = 6): void {
    this.emit(x, y, 'feather', {
      x: { min: x - 4, max: x + 4 },
      y: { min: y - 4, max: y + 4 },
      speed: { min: 40, max: 140 },
      angle: { min: 0, max: 360 },
      gravityY: 120,
      scale: { start: 0.8, end: 0.3 },
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      lifespan: 700,
      quantity: count,
      emitting: false,
      frequency: 0
    },
    color);
  }

  sparkle(x: number, y: number, color: number, count = 12): void {
    this.emit(x, y, 'spark', {
      x: { min: x - 2, max: x + 2 },
      y: { min: y - 2, max: y + 2 },
      speed: { min: 60, max: 200 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 500,
      quantity: count,
      blendMode: 'ADD',
      emitting: false,
      frequency: 0
    },
    color);
  }

  smoke(x: number, y: number, count = 4): void {
    this.emit(x, y, 'smoke', {
      x: { min: x - 2, max: x + 2 },
      y: { min: y - 2, max: y + 2 },
      speed: { min: 10, max: 40 },
      angle: { min: -90, max: 90 },
      scale: { start: 0.4, end: 1.2 },
      alpha: { start: 0.5, end: 0 },
      lifespan: 800,
      quantity: count,
      emitting: false,
      frequency: 0
    },
    0xb8b8b8);
  }

  hitFlash(x: number, y: number, color: number, count = 10): void {
    this.emit(x, y, 'glow', {
      x: { min: x - 2, max: x + 2 },
      y: { min: y - 2, max: y + 2 },
      speed: { min: 30, max: 120 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.8, end: 0.2 },
      alpha: { start: 1, end: 0 },
      lifespan: 350,
      quantity: count,
      blendMode: 'ADD',
      emitting: false,
      frequency: 0
    },
    color);
  }

  confetti(x: number, y: number, count = 40): void {
    const colors = [0xff5a5a, 0xffd24a, 0x5aff8a, 0x5aaaff, 0xd05aff];
    this.emit(x, y, 'spark', {
      x: { min: x - 20, max: x + 20 },
      y: { min: y - 20, max: y + 20 },
      speed: { min: 100, max: 280 },
      angle: { min: -140, max: -40 },
      gravityY: 300,
      scale: { start: 0.5, end: 0.2 },
      alpha: { start: 1, end: 0.6 },
      lifespan: 1400,
      quantity: count,
      emitting: false,
      frequency: 0
    },
    colors);
  }

  rain(x: number, y: number, W: number, count = 2): void {
    this.emit(x, y, 'spark', {
      x: { min: x - 3, max: x + 3 },
      y: { min: y - 3, max: y + 3 },
      speed: { min: 600, max: 900 },
      angle: { min: 280, max: 290 },
      scale: { start: 0.3, end: 0.1 },
      alpha: { start: 0.6, end: 0 },
      lifespan: 400,
      quantity: count,
      emitting: false,
      frequency: 0
    },
    0x9ab8e0);
  }

  clear(): void {
    for (const e of this.emitters) {
      try {
        e.stop();
        e.destroy();
      } catch {
        /* ignore */
      }
    }
    this.emitters = [];
  }
}
