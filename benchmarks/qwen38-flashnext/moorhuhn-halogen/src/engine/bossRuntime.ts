import Phaser from 'phaser';
import type { Rng } from '../types';
import { GAME_WIDTH, GAME_HEIGHT, clamp } from '../types';
import type { BossDef } from '../config/targets';
import type { EnvMod } from './trajectories';

/**
 * Boss runtime: three distinct behaviors driven by the BossDef.
 * - armored: slow sweeping crossings, armor plates soak early hits
 * - acrobat: fast figure-eight patterns
 * - phantom: teleporting with fading decoys
 */

export interface BossSnapshot {
  x: number;
  y: number;
  angle: number;
  scale: number;
}

interface Decoy {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  ttl: number;
}

export class BossRuntime {
  private t = 0;
  private x = GAME_WIDTH / 2;
  private y = GAME_HEIGHT * 0.42;
  private dir = 1;
  private armorLeft: number;
  hp: number;
  private decoys: Decoy[] = [];
  private teleportAt = 2.2;
  private frame = 0;
  private frameTimer = 0;
  private entering = true;
  private enterT = 0;

  constructor(
    private scene: Phaser.Scene,
    readonly def: BossDef,
    private rng: Rng,
    private img: Phaser.GameObjects.Image,
    private armorImg: Phaser.GameObjects.Image | null,
  ) {
    this.hp = def.hp;
    this.armorLeft = def.armorPhases;
    this.x = def.behavior === 'armored' ? -200 : GAME_WIDTH / 2;
    this.y = def.behavior === 'armored' ? GAME_HEIGHT * 0.45 : GAME_HEIGHT * 0.5;
    if (this.armorImg) this.armorImg.setAlpha(0.95);
    this.img.setDisplaySize(def.size * 2, def.size * 2);
    this.armorImg?.setDisplaySize(def.size * 2, def.size * 2);
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  get armorActive(): boolean {
    return this.armorLeft > 0;
  }

  /** Live center position (read by the hit resolver). */
  get xPublic(): number {
    return this.x;
  }

  get yPublic(): number {
    return this.y;
  }

  get radius(): number {
    return this.def.size * 0.85;
  }

  /** Returns true when the hit damaged the core (false = absorbed by armor). */
  hit(): { coreDamage: boolean } {
    if (this.entering) return { coreDamage: false };
    if (this.armorLeft > 0) {
      this.armorLeft -= 1;
      if (this.armorImg) {
        this.armorImg.setAlpha(this.armorLeft > 0 ? 0.95 : 0);
        this.scene.tweens.add({
          targets: this.armorImg,
          scaleX: this.armorImg.scaleX * 1.06,
          duration: 60,
          yoyo: true,
        });
      }
      return { coreDamage: false };
    }
    this.hp -= 1;
    return { coreDamage: true };
  }

  update(dt: number, env: EnvMod): void {
    this.t += dt;
    const s = clamp(env.speedMult, 0.4, 2);
    const sp = this.rng.range(this.def.speed[0], this.def.speed[1]) * 0.01 + 1;
    void sp;

    if (this.entering) {
      this.enterT += dt;
      const target = { x: GAME_WIDTH / 2, y: GAME_HEIGHT * 0.4 };
      const k = Math.min(1, dt * 2.2);
      this.x += (target.x - this.x) * k;
      this.y += (target.y - this.y) * k;
      if (this.enterT > 1.6) this.entering = false;
    } else if (this.def.behavior === 'armored') {
      this.updateArmored(dt, s);
    } else if (this.def.behavior === 'acrobat') {
      this.updateAcrobat(dt, s);
    } else {
      this.updatePhantom(dt, s);
    }

    // wing flap animation
    this.frameTimer += dt;
    if (this.frameTimer > 0.11) {
      this.frameTimer = 0;
      this.frame = (this.frame + 1) % 4;
      const key = `boss_${this.def.id}_f${this.frame}`;
      if (this.scene.textures.exists(key)) this.img.setTexture(key);
    }

    this.img.setPosition(this.x, this.y);
    this.img.setFlipX(this.dir < 0);
    if (this.armorImg && this.armorLeft > 0) {
      this.armorImg.setPosition(this.x, this.y);
      this.armorImg.setFlipX(this.dir < 0);
    }

    // decoys drift & fade
    for (const d of this.decoys) {
      d.ttl -= dt;
      d.img.x += d.vx * dt * s;
      d.img.y += d.vy * dt * s;
      d.img.setAlpha(clamp(d.ttl / 1.6, 0, 0.55));
      if (d.ttl <= 0) d.img.destroy();
    }
    this.decoys = this.decoys.filter((d) => d.ttl > 0);
  }

  private updateArmored(dt: number, s: number): void {
    const sp = lerpSpeed(this.def.speed, 1) * s;
    this.x += this.dir * sp * dt;
    this.y = GAME_HEIGHT * 0.42 + Math.sin(this.t * 0.9) * 90;
    if (this.x > GAME_WIDTH + 160) {
      this.dir = -1;
      this.x = GAME_WIDTH + 160;
    }
    if (this.x < -160) {
      this.dir = 1;
      this.x = -160;
    }
  }

  private updateAcrobat(dt: number, s: number): void {
    const omega = 1.15 * s;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT * 0.45;
    const A = GAME_WIDTH * 0.34;
    const B = GAME_HEIGHT * 0.2;
    const px = cx + Math.sin(this.t * omega) * A;
    const py = cy + Math.sin(this.t * omega * 2) * B;
    this.dir = px >= this.x ? 1 : -1;
    this.x = px;
    this.y = py;
    void dt;
  }

  private updatePhantom(dt: number, s: number): void {
    this.teleportAt -= dt;
    // ghostly flicker
    const flicker = 0.55 + Math.sin(this.t * 5.2) * 0.18;
    this.img.setAlpha(this.entering ? 1 : flicker);
    if (this.teleportAt <= 0) {
      this.teleportAt = this.rng.range(1.8, 2.8);
      this.spawnDecoys();
      this.x = this.rng.range(GAME_WIDTH * 0.2, GAME_WIDTH * 0.8);
      this.y = this.rng.range(GAME_HEIGHT * 0.18, GAME_HEIGHT * 0.62);
    }
    // slow drift between teleports
    this.x += Math.sin(this.t * 0.8) * 30 * s * dt;
    this.y += Math.cos(this.t * 1.1) * 22 * s * dt;
  }

  private spawnDecoys(): void {
    const key = `boss_${this.def.id}_f${this.frame}`;
    for (let i = 0; i < 2; i += 1) {
      const img = this.scene.add.image(this.x + this.rng.range(-500, 500), this.y + this.rng.range(-220, 220), key);
      img.setDisplaySize(this.def.size * 2, this.def.size * 2);
      img.setAlpha(0.4);
      this.decoys.push({
        img,
        vx: this.rng.range(-90, 90),
        vy: this.rng.range(-60, 60),
        ttl: this.rng.range(1.4, 1.9),
      });
    }
  }

  /** Shot point vs. a phantom decoy. Returns the decoy image when hit. */
  hitDecoy(x: number, y: number): Phaser.GameObjects.Image | null {
    for (const d of this.decoys) {
      const dx = (x - d.img.x) / (this.radius * 0.9);
      const dy = (y - d.img.y) / (this.radius * 0.7);
      if (dx * dx + dy * dy <= 1) {
        d.img.destroy();
        this.decoys = this.decoys.filter((o) => o.img.active);
        return d.img;
      }
    }
    return null;
  }

  destroy(): void {
    this.img.destroy();
    this.armorImg?.destroy();
    for (const d of this.decoys) d.img.destroy();
    this.decoys = [];
  }
}

function lerpSpeed(range: [number, number], t: number): number {
  return range[0] + (range[1] - range[0]) * t;
}
