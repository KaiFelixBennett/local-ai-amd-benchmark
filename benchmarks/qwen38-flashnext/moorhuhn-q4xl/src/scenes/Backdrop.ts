import Phaser from 'phaser';
import type { MapDef } from '../core/types';
import { TEX } from './tex';

/** Parallax scenery + fog/weather overlay for one map. Pure view. */
export class Backdrop {
  readonly container: Phaser.GameObjects.Container;
  private fogSprites: Phaser.GameObjects.Image[] = [];
  private clouds: Phaser.GameObjects.Image[] = [];
  private rain: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private snowish = false;
  private time = 0;

  constructor(private scene: Phaser.Scene, private map: MapDef, w: number, h: number) {
    this.container = scene.add.container(0, 0);
    this.container.setDepth(-100);
    const pal = map.palette;

    // sky
    const sky = scene.add.image(w / 2, h / 2, `sky_${map.id}`).setDisplaySize(w, h).setOrigin(0.5);
    sky.setY(h / 2 - h * 0.12).setDisplaySize(w, h * 1.25);
    this.container.add(sky);

    if (pal.night) {
      // stars
      const stars = scene.add.graphics();
      stars.fillStyle(0xffffff, 0.9);
      for (let i = 0; i < 90; i++) {
        const sx = Phaser.Math.Between(0, w);
        const sy = Phaser.Math.Between(0, Math.floor(h * 0.5));
        stars.fillPoint(sx, sy, Phaser.Math.FloatBetween(0.6, 1.8));
      }
      this.container.add(stars);
      const moon = scene.add.image(w * 0.78, h * 0.16, TEX.glow).setScale(3.4).setTint(0xf4f0d8);
      this.container.add(moon);
      this.container.add(scene.add.image(w * 0.78, h * 0.16, TEX.px).setDisplaySize(64, 64).setTint(0xfaf6e0));
    } else {
      const sun = scene.add.image(w * 0.72, h * 0.2, TEX.glow).setScale(4.2).setTint(0xffd98a);
      this.container.add(sun);
    }

    // clouds
    for (let i = 0; i < 4; i++) {
      const c = scene.add
        .image(Phaser.Math.Between(0, w), Phaser.Math.Between(30, h * 0.3), TEX.cloud)
        .setAlpha(0.5)
        .setScale(Phaser.Math.FloatBetween(0.8, 1.6));
      this.clouds.push(c);
      this.container.add(c);
    }

    // hills (three bands) + ground
    this.hills(this.map.palette.hillsFar, h * 0.52, 60, 0.55);
    this.hills(this.map.palette.hillsMid, h * 0.62, 46, 0.75);
    const ground = scene.add
      .rectangle(w / 2, h - (h * 0.22) / 2, w, h * 0.22, Phaser.Display.Color.HexStringToColor(pal.ground).color)
      .setOrigin(0.5);
    this.container.add(ground);
    this.hills(pal.reedColor, h * 0.78, 22, 1);

    // reed fringe along ground
    const reeds = scene.add.graphics();
    reeds.lineStyle(4, Phaser.Display.Color.HexStringToColor(pal.reedColor).color, 1);
    for (let x = 0; x < w; x += 26) {
      const hgt = Phaser.Math.Between(14, 44);
      reeds.beginPath();
      reeds.lineBetween(x, h, x + Phaser.Math.Between(-6, 6), h - hgt);
      reeds.strokePath();
    }
    this.container.add(reeds);

    // water strip
    const water = scene.add
      .rectangle(w / 2, h - h * 0.05, w, h * 0.09, Phaser.Display.Color.HexStringToColor(pal.waterTint).color, 0.85)
      .setOrigin(0.5);
    this.container.add(water);
    this.snowish = pal.night;
  }

  private hills(colorHex: string, baseY: number, amp: number, alpha: number): void {
    const { scene, container } = this;
    const w = scene.scale.width;
    const h = scene.scale.height;
    const g = scene.add.graphics();
    const color = Phaser.Display.Color.HexStringToColor(colorHex).color;
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 32) {
      const y = baseY + Math.sin(x * 0.006 + amp) * amp * 0.5 + Math.sin(x * 0.017) * amp * 0.3;
      g.lineTo(x, y);
    }
    g.lineTo(w, h);
    g.closePath();
    g.fillPath();
    container.add(g);
  }

  /** fog overlay 0..1 */
  setFog(amount: number, w: number, h: number): void {
    const col = Phaser.Display.Color.HexStringToColor(this.map.palette.fogColor).color;
    while (this.fogSprites.length < 6 && amount > 0.01) {
      const f = this.scene.add
        .image(Phaser.Math.Between(0, w), Phaser.Math.Between(h / 2, h), TEX.fog)
        .setScale(Phaser.Math.FloatBetween(2.4, 4.5))
        .setTint(col);
      this.fogSprites.push(f);
      this.container.addAt(f, this.container.length);
    }
    for (const f of this.fogSprites) f.setAlpha(amount * 0.55);
  }

  setRain(on: boolean, w: number): void {
    if (on && !this.rain) {
      this.rain = this.scene.add.particles(0, 0, TEX.rain, {
        x: { min: 0, max: w },
        y: -20,
        lifespan: 900,
        speedY: { min: 520, max: 720 },
        speedX: { min: -40, max: 40 },
        quantity: 3,
        frequency: 16,
        alpha: { start: 0.8, end: 0.2 },
      });
      this.container.addAt(this.rain, this.container.length);
    } else if (!on && this.rain) {
      this.rain.destroy();
      this.rain = null;
    }
  }

  update(dt: number, w: number): void {
    this.time += dt;
    for (const c of this.clouds) {
      c.x += dt * (this.snowish ? 6 : 14) * c.scaleX;
      if (c.x > w + 200) c.x = -200;
    }
    for (const f of this.fogSprites) {
      f.x += dt * 18;
      if (f.x > w + 260) f.x = -260;
    }
  }
}
