import Phaser from 'phaser';
import { TEX } from '../tex';
import type { Settings } from '../../core/types';

/**
 * Reusable juice layer: floating score texts, banners, particle bursts,
 * screen flashes and camera shake. All intensities respect the player's
 * accessibility / quality settings.
 */

export type PopupKind = 'score' | 'info' | 'gold' | 'bad' | 'ach';

const POPUP_COLOR: Record<PopupKind, number> = {
  score: 0xffffff,
  info: 0xcfd6e6,
  gold: 0xffd166,
  bad: 0xff6b6b,
  ach: 0x7ee0a3,
};

interface Popup {
  text: Phaser.GameObjects.Text;
  life: number;
  total: number;
  rise: number;
}

export class Fx {
  private popups: Popup[] = [];
  private bannerTimer = 0;
  private bannerBox: Phaser.GameObjects.Container;
  private bannerTitle: Phaser.GameObjects.Text;
  private bannerSub: Phaser.GameObjects.Text;
  private flashRect: Phaser.GameObjects.Rectangle;
  private feathers: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private splashes: Phaser.GameObjects.Particles.ParticleEmitter;
  private sporesEm: Phaser.GameObjects.Particles.ParticleEmitter;
  private fireflies: Phaser.GameObjects.Particles.ParticleEmitter;
  private featherStorm: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor(private scene: Phaser.Scene, private settings: Settings) {
    this.bannerBox = scene.add.container(0, 0).setDepth(120).setAlpha(0);
    this.bannerTitle = scene.add
      .text(0, -18, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '44px',
        fontStyle: 'bold',
        color: '#ffe9b8',
        stroke: '#1a1410',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.bannerSub = scene.add
      .text(0, 24, '', { fontFamily: 'Georgia, serif', fontSize: '22px', color: '#cfd6e6', stroke: '#1a1410', strokeThickness: 4 })
      .setOrigin(0.5);
    this.bannerBox.add([this.bannerTitle, this.bannerSub]);

    this.flashRect = scene.add
      .rectangle(0, 0, scene.scale.width, scene.scale.height, 0xffffff, 1)
      .setOrigin(0)
      .setDepth(115)
      .setAlpha(0);
    this.flashRect.setScrollFactor(0);

    this.feathers = this.explosion(TEX.feather, { speed: [60, 260], lifespan: [700, 1400], scale: [0.8, 0.1], rotate: [0, 360] });
    this.sparks = this.explosion(TEX.hitStar, { speed: [120, 340], lifespan: [180, 380], scale: [1.1, 0.2] });
    this.splashes = this.explosion(TEX.splash, { speed: [60, 200], lifespan: [300, 620], scale: [0.9, 0.2] });
    this.sporesEm = this.explosion(TEX.spore, { speed: [20, 90], lifespan: [600, 1100], scale: [0.8, 0.1] });
    this.fireflies = scene.add.particles(0, 0, TEX.glow, {
      x: { min: 0, max: scene.scale.width },
      y: { min: scene.scale.height * 0.45, max: scene.scale.height * 0.95 },
      lifespan: 3600,
      speedX: { min: -14, max: 14 },
      speedY: { min: -20, max: -4 },
      scale: { start: 0.001, end: 0.06 },
      alpha: { start: 0, end: 0.9 },
      quantity: 2,
      frequency: 260,
      tint: 0xfff2a8,
    });
    this.fireflies.setDepth(60).stop();
  }

  private explosion(
    texture: string,
    opts: { speed: [number, number]; lifespan: [number, number]; scale: [number, number]; rotate?: [number, number] },
  ): Phaser.GameObjects.Particles.ParticleEmitter {
    const e = this.scene.add.particles(0, 0, texture, {
      speed: { min: opts.speed[0], max: opts.speed[1] },
      lifespan: { min: opts.lifespan[0], max: opts.lifespan[1] },
      scale: { start: opts.scale[0], end: opts.scale[1] },
      angle: { min: 0, max: 360 },
      emitting: false,
      ...(opts.rotate ? { rotate: { min: opts.rotate[0], max: opts.rotate[1] } } : {}),
    });
    e.setDepth(70);
    return e;
  }

  settingsChanged(s: Settings): void {
    this.settings = s;
  }

  popup(text: string, x: number, y: number, kind: PopupKind = 'score', size = 22): void {
    // recycle a dead slot when possible
    let slot = this.popups.find((p) => p.life >= p.total);
    if (!slot) {
      if (this.popups.length > 42) return;
      const t = this.scene.add
        .text(x, y, '', {
          fontFamily: 'Georgia, serif',
          fontSize: '22px',
          fontStyle: 'bold',
          stroke: '#14100b',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(85);
      slot = { text: t, life: 1, total: 1, rise: 40 };
      this.popups.push(slot);
    }
    slot.text.setText(text).setFontSize(`${size}px`).setColor(`#${POPUP_COLOR[kind].toString(16).padStart(6, '0')}`);
    slot.text.setPosition(x, y).setVisible(true);
    slot.life = 0;
    slot.total = kind === 'gold' || kind === 'ach' ? 1.6 : 1.05;
    slot.rise = size >= 30 ? 64 : 42;
  }

  featherBurst(x: number, y: number, intensity = 1): void {
    if (this.settings.particleDensity <= 0.05) return;
    const q = Math.max(2, Math.round(9 * intensity * this.settings.particleDensity));
    this.feathers.setPosition(x, y).explode(q);
  }

  hitStar(x: number, y: number, perfect: boolean): void {
    const q = Math.max(2, Math.round((perfect ? 10 : 5) * Math.max(0.2, this.settings.particleDensity)));
    this.sparks.setPosition(x, y).explode(q);
  }

  splash(x: number, y: number): void {
    this.splashes.setPosition(x, y).explode(Math.max(3, Math.round(10 * this.settings.particleDensity)));
  }

  spores(x: number, y: number): void {
    this.sporesEm.setPosition(x, y).explode(Math.max(3, Math.round(12 * this.settings.particleDensity)));
  }

  setFireflies(on: boolean): void {
    if (on) this.fireflies.start();
    else this.fireflies.stop();
  }

  setFeatherStorm(on: boolean): void {
    if (on && !this.featherStorm) {
      this.featherStorm = this.scene.add.particles(0, 0, TEX.feather, {
        x: { min: -60, max: this.scene.scale.width + 60 },
        y: -30,
        lifespan: 3200,
        speedX: { min: -120, max: 60 },
        speedY: { min: 90, max: 200 },
        rotate: { min: 0, max: 360 },
        scale: { start: 0.8, end: 0.4 },
        alpha: { start: 0.95, end: 0.5 },
        quantity: 3,
        frequency: 45,
      });
      this.featherStorm.setDepth(80);
    } else if (!on && this.featherStorm) {
      this.featherStorm.destroy();
      this.featherStorm = null;
    }
  }

  flash(strength = 1): void {
    if (this.settings.reduceFlashes) strength *= 0.18;
    this.flashRect.setAlpha(Math.min(0.85, strength));
  }

  shake(intensity: number): void {
    if (this.settings.reduceMotion || this.settings.shakeIntensity <= 0) return;
    const s = intensity * this.settings.shakeIntensity;
    this.scene.cameras.main.shake(90, new Phaser.Math.Vector2(s * 0.004, s * 0.005));
  }

  /** Big centred announcement (events, phases, boss intros). */
  banner(title: string, sub?: string, seconds = 2.5): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    this.bannerBox.setPosition(w / 2, h * 0.3);
    this.bannerTitle.setText(title);
    this.bannerSub.setText(sub ?? '');
    this.bannerTimer = seconds;
    this.bannerBox.setAlpha(1).setScale(0.86);
  }

  update(dt: number): void {
    for (const p of this.popups) {
      if (p.life >= p.total) {
        p.text.setVisible(false);
        continue;
      }
      p.life += dt;
      const u = Math.min(1, p.life / p.total);
      p.text.setPosition(p.text.x, p.text.y - p.rise * dt);
      p.text.setAlpha(u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25);
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      const t = this.bannerTimer;
      this.bannerBox.setScale(Phaser.Math.Linear(this.bannerBox.scale, 1, Math.min(1, dt * 10)));
      this.bannerBox.setAlpha(t < 0.5 ? t / 0.5 : 1);
      if (this.bannerTimer <= 0) this.bannerBox.setAlpha(0);
    }
    if (this.flashRect.alpha > 0) {
      this.flashRect.setAlpha(Math.max(0, this.flashRect.alpha - dt * 3.4));
    }
  }

  destroy(): void {
    for (const p of this.popups) p.text.destroy();
    this.popups = [];
    this.bannerBox.destroy();
    this.flashRect.destroy();
    this.feathers.destroy();
    this.sparks.destroy();
    this.splashes.destroy();
    this.sporesEm.destroy();
    this.fireflies.destroy();
    this.setFeatherStorm(false);
  }
}
