import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, clamp } from '../types';
import { CROSSHAIRS } from '../config/cosmetics';

/**
 * Visual FX toolbox for the round: weapon rig (barrel + muzzle flash + recoil),
 * crosshair, particle bursts and floating score popups. All counts respect the
 * particleDensity / reduceMotion / screenshake settings.
 */

export interface FxSettings {
  particleDensity: number;
  screenshake: number;
  reduceMotion: boolean;
  reduceFlash: boolean;
}

const BASE = { maxParticles: 90 };

export class Fx {
  private cfg: FxSettings = { particleDensity: 1, screenshake: 0.7, reduceMotion: false, reduceFlash: false };
  private feathers: Phaser.GameObjects.Particles.ParticleEmitter;
  private goldFeathers: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private splashes: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti: Phaser.GameObjects.Particles.ParticleEmitter;
  private rings: Phaser.GameObjects.Particles.ParticleEmitter;
  private popupPool: Phaser.GameObjects.Text[] = [];
  private popupQueue: { text: Phaser.GameObjects.Text; timer: Phaser.Tweens.Tween }[] = [];

  constructor(private scene: Phaser.Scene) {
    const mk = (tex: string, tint: number[] | null, max: number): Phaser.GameObjects.Particles.ParticleEmitter => {
      const e = scene.add.particles(0, 0, tex, {
        speed: { min: 60, max: 240 },
        scale: { start: 1, end: 0.2 },
        lifespan: { min: 0.5, max: 1.1 },
        gravityY: 320,
        emitting: false,
      });
      e.setDepth(40);
      if (tint) e.setParticleTint(tint);
      // hard cap for perf; actual burst sizes are density-scaled
      e.maxParticles = max;
      e.setBlendMode(Phaser.BlendModes.NORMAL);
      return e;
    };

    this.feathers = mk('feather', null, BASE.maxParticles);
    this.goldFeathers = mk('feather_gold', null, 60);
    this.smoke = mk('smoke', [0xdddddd], 40);
    this.sparks = mk('spark', [0xffe08a], 40);
    this.splashes = mk('splash', null, 30);
    this.confetti = mk('confetti', null, 90);
    this.rings = scene.add.particles(0, 0, 'ring', {
      speed: 0,
      scale: { start: 0.2, end: 1.2 },
      alpha: { start: 0.9, end: 0 },
      lifespan: 0.35,
      emitting: false,
    });
    this.rings.setDepth(39);
    this.rings.maxParticles = 12;
  }

  private n(base: number, density: number): number {
    return Math.max(1, Math.round(base * density));
  }

  /** Live-update accessibility/density settings mid-round. */
  configure(settings: FxSettings): void {
    this.cfg = settings;
  }

  get settings(): FxSettings {
    return this.cfg;
  }

  feathersBurst(x: number, y: number, density: number, gold = false): void {
    if (density <= 0) return;
    const em = gold ? this.goldFeathers : this.feathers;
    em.emitParticleAt(x, y, this.n(10, density));
  }

  smokePuff(x: number, y: number, density: number): void {
    if (density <= 0) return;
    this.smoke.emitParticleAt(x, y, this.n(5, density));
  }

  armorSpark(x: number, y: number, density: number): void {
    if (density <= 0) return;
    this.sparks.emitParticleAt(x, y, this.n(6, density));
  }

  splashAt(x: number, y: number, density: number): void {
    if (density <= 0) return;
    this.splashes.emitParticleAt(x, y, this.n(6, density));
  }

  hitRing(x: number, y: number): void {
    this.rings.emitParticleAt(x, y, 1);
  }

  celebrate(density: number): void {
    if (density <= 0) return;
    for (let i = 0; i < 6; i++) {
      const x = (GAME_WIDTH * (i + 0.5)) / 6;
      this.confetti.emitParticleAt(x, -20, this.n(14, density));
    }
  }

  popup(
    x: number,
    y: number,
    text: string,
    opts?: { color?: string; size?: number; small?: boolean; delay?: number },
  ): void {
    const t = this.popupPool.pop() ?? this.createPopup();
    t.setText(text);
    t.setPosition(clamp(x, 60, GAME_WIDTH - 60), clamp(y, 40, GAME_HEIGHT - 60));
    t.setColor(opts?.color ?? '#ffffff');
    t.setFontSize(opts?.small ? 26 : (opts?.size ?? 44));
    t.setAlpha(1);
    t.setScale(1);
    t.setVisible(true);
    t.setDepth(45);
    const rise = opts?.small ? 60 : 110;
    const dur = 900 + (opts?.delay ?? 0);
    const tween = this.scene.tweens.add({
      targets: t,
      y: t.y - rise,
      alpha: 0,
      duration: dur,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        t.setVisible(false);
        this.popupQueue = this.popupQueue.filter((q) => q.timer !== tween);
        this.popupPool.push(t);
      },
    });
    this.popupQueue.push({ text: t, timer: tween });
  }

  private createPopup(): Phaser.GameObjects.Text {
    const t = this.scene.add.text(0, 0, '', {
      fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#1c1408',
      strokeThickness: 6,
    });
    t.setOrigin(0.5, 0.5);
    return t;
  }

  destroy(): void {
    this.feathers.destroy();
    this.goldFeathers.destroy();
    this.smoke.destroy();
    this.sparks.destroy();
    this.splashes.destroy();
    this.confetti.destroy();
    this.rings.destroy();
    for (const q of this.popupQueue) q.timer.remove();
    for (const t of this.popupPool) t.destroy();
  }
}

/** Crosshair drawn with Graphics, restyled live from settings. */
export class Crosshair {
  private gfx: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(60);
    this.gfx.setScrollFactor(0);
  }

  setStyle(styleId: string, color: string, scale: number, reduceMotion: boolean): void {
    this.currentStyle = styleId;
    this.color = color;
    this.scale = scale;
    this.reduceMotion = reduceMotion;
    this.redraw();
  }

  private currentStyle = 'classic';
  private color = '#ffd54a';
  private scale = 1;
  private reduceMotion = false;

  setPosition(x: number, y: number): void {
    this.gfx.x = x;
    this.gfx.y = y;
  }

  redraw(): void {
    const g = this.gfx;
    g.clear();
    const col = Phaser.Display.Color.HexStringToColor(this.color).color;
    const s = clamp(this.scale, 0.6, 1.8);
    const style = CROSSHAIRS.find((c) => c.id === this.currentStyle)?.style ?? 'cross';
    g.lineStyle(3 * s, col, 1);
    switch (style) {
      case 'cross': {
        const L = 16 * s;
        const gap = 6 * s;
        g.lineBetween(-L, 0, -gap, 0);
        g.lineBetween(gap, 0, L, 0);
        g.lineBetween(0, -L, 0, -gap);
        g.lineBetween(0, gap, 0, L);
        break;
      }
      case 'ring': {
        g.strokeCircle(0, 0, 16 * s);
        g.fillStyle(col, 1);
        g.fillCircle(0, 0, 2 * s);
        break;
      }
      case 'dot': {
        g.fillStyle(col, 1);
        g.fillCircle(0, 0, 5 * s);
        break;
      }
      case 'reticle': {
        g.strokeCircle(0, 0, 18 * s);
        g.strokeCircle(0, 0, 4 * s);
        const L = 26 * s;
        const gap = 10 * s;
        g.lineBetween(-L, 0, -gap, 0);
        g.lineBetween(gap, 0, L, 0);
        g.lineBetween(0, -L, 0, -gap);
        g.lineBetween(0, gap, 0, L);
        break;
      }
      case 'feather': {
        // feather-shaped crosshair: curved strokes
        g.beginPath();
        const r = 18 * s;
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          const x0 = Math.cos(a) * r;
          const y0 = Math.sin(a) * r;
          const x1 = Math.cos(a + 0.9) * r * 0.35;
          const y1 = Math.sin(a + 0.9) * r * 0.35;
          g.moveTo(x0, y0);
          g.lineTo(x0 * 0.55, y0 * 0.55);
          g.moveTo(x1, y1);
          g.lineTo(0, 0);
        }
        g.strokePath();
        g.fillStyle(col, 1);
        g.fillCircle(0, 0, 2.4 * s);
        break;
      }
      case 'scope': {
        g.strokeCircle(0, 0, 34 * s);
        g.strokeCircle(0, 0, 30 * s);
        const L = 44 * s;
        const gap = 8 * s;
        g.lineBetween(-L, 0, -gap, 0);
        g.lineBetween(gap, 0, L, 0);
        g.lineBetween(0, -L, 0, -gap);
        g.lineBetween(0, gap, 0, L);
        // mil dots
        for (let i = 1; i <= 3; i++) {
          const d = i * 9 * s;
          g.fillStyle(col, 0.85);
          g.fillCircle(d, 0, 1.6 * s);
          g.fillCircle(-d, 0, 1.6 * s);
          g.fillCircle(0, d, 1.6 * s);
          g.fillCircle(0, -d, 1.6 * s);
        }
        break;
      }
    }
    if (!this.reduceMotion) {
      // subtle accent glow ring on the crosshair center
      g.lineStyle(1.5 * s, col, 0.35);
      g.strokeCircle(0, 0, 9 * s);
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}

/**
 * First-person gun barrel at the bottom of the screen: aims toward the pointer,
 * kicks on fire, dips during reloads. Muzzle flash + smoke come from the Fx pool.
 */
export class WeaponRig {
  private barrel: Phaser.GameObjects.Image;
  private flash: Phaser.GameObjects.Image;
  private baseY = GAME_HEIGHT + 10;
  private aim = 0;
  private recoil = 0;
  private flashFrames = 0;
  private flashTimer = 0;
  private flashPlaying = false;

  constructor(
    private scene: Phaser.Scene,
    private fx: Fx,
    private reduceMotion: boolean,
  ) {
    const key = scene.textures.exists('gun_barrel') ? 'gun_barrel' : '__MISSING';
    this.barrel = scene.add.image(GAME_WIDTH / 2, this.baseY, key);
    this.barrel.setOrigin(0.18, 0.5);
    this.barrel.setDisplaySize(300, 82);
    this.barrel.setDepth(55);
    this.flash = scene.add.image(GAME_WIDTH / 2, this.baseY, 'muzzle_flash_f0');
    this.flash.setDepth(56);
    this.flash.setVisible(false);
    this.raise(350);
  }

  setSkin(skinId: string): void {
    const key = skinId === 'default' ? 'gun_barrel' : `gun_barrel_${skinId}`;
    if (this.scene.textures.exists(key)) this.barrel.setTexture(key);
  }

  private raise(durationMs: number): void {
    if (this.reduceMotion) {
      this.barrel.y = GAME_HEIGHT - 44;
      return;
    }
    this.scene.tweens.add({
      targets: this.barrel,
      y: GAME_HEIGHT - 44,
      duration: durationMs,
      ease: 'Back.easeOut',
    });
  }

  /** Dip the barrel while reloading, bring it back on finish. */
  reloadDip(): void {
    this.scene.tweens.add({
      targets: this.barrel,
      y: GAME_HEIGHT + 46,
      angle: this.aim * 0.5 - 8,
      duration: 260,
      ease: 'Quad.easeIn',
    });
  }

  reloadFinish(): void {
    this.scene.tweens.add({
      targets: this.barrel,
      y: GAME_HEIGHT - 44,
      angle: this.aim,
      duration: 320,
      ease: 'Back.easeOut',
    });
  }

  fire(pointerX: number): void {
    this.aim = this.computeAim(pointerX);
    this.recoil = 1;
    this.flashFrames = 4;
    this.flashPlaying = true;
    this.flashTimer = 0;
    this.fx.smokePuff(this.muzzleX(), this.muzzleY(), 0.35);
  }

  private muzzleX(): number {
    const rad = (this.barrel.angle * Math.PI) / 180;
    return this.barrel.x + Math.cos(rad) * 176;
  }

  private muzzleY(): number {
    const rad = (this.barrel.angle * Math.PI) / 180;
    return this.barrel.y + Math.sin(rad) * 176;
  }

  private computeAim(px: number): number {
    const dx = clamp(px, 80, GAME_WIDTH - 80) - GAME_WIDTH / 2;
    return clamp(dx / (GAME_WIDTH / 2), -1, 1) * 9;
  }

  update(dtMs: number, pointerX: number): void {
    const target = this.computeAim(pointerX);
    this.aim += (target - this.aim) * Math.min(1, dtMs / 90);
    this.recoil = Math.max(0, this.recoil - dtMs / 120);
    const kickY = this.recoil * 26;
    const kickA = -this.recoil * 4;
    if (this.barrel.y > GAME_HEIGHT - 200) {
      // still raising — tween owns the position
      this.barrel.rotation = (this.aim * Math.PI) / 180;
    } else {
      this.barrel.x = GAME_WIDTH / 2;
      this.barrel.y = GAME_HEIGHT - 44 + kickY;
      this.barrel.rotation = ((this.aim + kickA) * Math.PI) / 180;
    }

    if (this.flashPlaying) {
      this.flashTimer += dtMs;
      if (this.flashTimer >= 28) {
        this.flashTimer = 0;
        this.flashFrames -= 1;
        if (this.flashFrames <= 0) {
          this.flashPlaying = false;
          this.flash.setVisible(false);
        } else {
          this.flash.setTexture(`muzzle_flash_f${4 - this.flashFrames}`);
          this.flash.setPosition(this.muzzleX(), this.muzzleY());
          this.flash.setVisible(true);
          this.flash.setAngle(Math.random() * 40 - 20);
        }
      }
    }
  }

  destroy(): void {
    this.barrel.destroy();
    this.flash.destroy();
  }
}
