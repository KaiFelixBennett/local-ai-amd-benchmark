/**
 * Menu background scene — an animated, living moorland that sits behind the
 * HTML/CSS menus. The UI layer drives which menu panel is shown; this scene
 * only paints the ambient backdrop.
 */
import Phaser from 'phaser';
import { ensureCommonArt } from '../art/boot';
import type { AppContext } from './context';
import { MAPS } from '../core/maps';
import type { MapConfig } from '../core/maps';
import { createRng } from '../core/rng';

interface Flyer {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  baseY: number;
  amp: number;
  freq: number;
  phase: number;
}

interface FogPuff {
  r: Phaser.GameObjects.Image;
  speed: number;
}

export class MenuScene extends Phaser.Scene {
  private ctx!: AppContext;
  private map: MapConfig = MAPS.nebelmoor;
  private bgGfx!: Phaser.GameObjects.Graphics;
  private flyers: Flyer[] = [];
  private fogs: FogPuff[] = [];
  private menuTime = 0;

  constructor() {
    // Explicit key 'menu' so main.ts / GameScene can reference it via
    // scene.start('menu', …) / scene.stop('menu'). Without this the key
    // defaults to 'default' and those calls become silent no-ops.
    super('menu');
  }

  create(data: { ctx?: AppContext }): void {
    const ctx = data?.ctx;
    this.ctx = ctx as AppContext;
    const W = this.scale.width;
    const H = this.scale.height;
    ensureCommonArt(this);
    this.map = MAPS.nebelmoor;

    // Backdrop
    this.bgGfx = this.add.graphics();
    this.bgGfx.setDepth(0);
    this.paintBackdrop(W, H);

    // Floating mist
    const fog = this.textures.exists('fx-glow') ? 'fx-glow' : '__BASE';
    for (let i = 0; i < 6; i++) {
      const r = this.add
        .image(Phaser.Math.Between(0, W), H * (0.35 + 0.5 * (i / 6)), fog)
        .setAlpha(0.06)
        .setScale(3 + i * 0.6, 1.4)
        .setTint(0xcfd8e6)
        .setDepth(1);
      this.fogs.push({ r, speed: 6 + i * 4 });
    }

    // Ambient birds drifting across
    const rng = createRng(Date.now());
    const kinds = ['moorflatterer', 'schnellfeder', 'kurvensegler', 'goldschnabel'] as const;
    for (let i = 0; i < 8; i++) {
      const kind = rng.pick([...kinds]);
      const s = this.add
        .image(rng.next() * W, rng.range(H * 0.15, H * 0.7), `target-${kind}`)
        .setAlpha(0.9)
        .setDepth(2);
      s.setFlipX(rng.next() > 0.5);
      s.setScale(rng.range(0.55, 0.8));
      this.flyers.push({
        sprite: s,
        vx: (rng.next() > 0.5 ? 1 : -1) * rng.range(25, 60),
        baseY: s.y,
        amp: rng.range(15, 45),
        freq: rng.range(0.6, 1.6),
        phase: rng.next() * Math.PI * 2
      });
    }
  }

  update(time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.menuTime += dt;
    const W = this.scale.width;
    const H = this.scale.height;

    for (const f of this.flyers) {
      f.sprite.x += f.vx * dt;
      f.sprite.y = f.baseY + Math.sin(this.menuTime * f.freq + f.phase) * f.amp;
      if (f.sprite.x > W + 80) {
        f.sprite.x = -80;
        f.baseY = Math.random() * H * 0.7 + H * 0.1;
      } else if (f.sprite.x < -80) {
        f.sprite.x = W + 80;
        f.baseY = Math.random() * H * 0.7 + H * 0.1;
      }
      f.sprite.setFlipX(f.vx < 0);
    }
    for (const f of this.fogs) {
      f.r.x -= f.speed * dt;
      if (f.r.x < -300) f.r.x = W + 300;
    }
  }

  private paintBackdrop(W: number, H: number): void {
    const g = this.bgGfx;
    const m = this.map;
    const topC = Phaser.Display.Color.HexStringToColor(m.skyTop);
    const botC = Phaser.Display.Color.HexStringToColor(m.skyBottom);
    const horizon = H * 0.72;

    // Sky gradient — interpolate R,G,B channels separately (not the packed int).
    const steps = 36;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const r = Math.round(Phaser.Math.Linear(topC.red, botC.red, t));
      const gg = Math.round(Phaser.Math.Linear(topC.green, botC.green, t));
      const b = Math.round(Phaser.Math.Linear(topC.blue, botC.blue, t));
      const col = (r << 16) | (gg << 8) | b;
      const y = horizon * (1 - t);
      g.fillStyle(col, 1);
      g.fillRect(0, y - 4, W, horizon / steps + 4);
    }
    // Distant tree line (reeds layer colour)
    const reeds = m.layers.find((l) => l.kind === 'reeds');
    const fg = m.layers.find((l) => l.kind === 'fg');
    g.fillStyle(Phaser.Display.Color.HexStringToColor(reeds ? reeds.color : '#25313a').color, 1);
    let x = 0;
    while (x < W) {
      const w = 40 + Math.random() * 60;
      const h = 30 + Math.random() * 50;
      g.fillTriangle(x, horizon, x + w, horizon, x + w / 2, horizon - h);
      x += w * 0.6;
    }
    // Ground
    g.fillStyle(Phaser.Display.Color.HexStringToColor(fg ? fg.color : '#161d22').color, 1);
    g.fillRect(0, horizon, W, H - horizon);
    g.fillStyle(Phaser.Display.Color.HexStringToColor(reeds ? reeds.color2 : '#2c3c44').color, 1);
    g.fillRect(0, horizon, W, 14);
    // Water strip
    if (m.water) {
      g.fillStyle(Phaser.Display.Color.HexStringToColor(m.water.color).color, 1);
      g.fillRect(0, H * 0.88, W, H - H * 0.88);
    }
  }
}
