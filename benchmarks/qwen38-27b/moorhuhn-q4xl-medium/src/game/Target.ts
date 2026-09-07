/**
 * A single flying target. Owns its own trajectory progress, flapping/armor
 * redraw (cached by quarter-HP bucket), and reacts to hits. Scoring stays in
 * the scene / pure core so the math remains testable.
 */

import Phaser from 'phaser';
import type { TargetConfig, TrajectoryDef, TargetKind } from '../core/types';
import { evaluate } from '../core/trajectory';
import { PALETTES, type BirdPalette } from '../art/palettes';
import { paintBird } from '../art/generator';

export class Target extends Phaser.GameObjects.Sprite {
  readonly kind: TargetKind;
  readonly config: TargetConfig;
  readonly trajectory: TrajectoryDef;
  private t = 0;
  private hp: number;
  private maxHp: number;
  private flap = 0;
  private deadFlag = false;
  private removed = false;
  speedEst = 200;
  depthCur = 1;
  private faceDir = 1;
  private texKey = '';
  private hpBucket = -1;
  private graphics: Phaser.GameObjects.Graphics | null = null;
  swarmId: number | null = null;

  constructor(scene: Phaser.Scene, kind: TargetKind, config: TargetConfig, trajectory: TrajectoryDef) {
    super(scene, 0, 0, config.palette);
    this.kind = kind;
    this.config = config;
    this.trajectory = trajectory;
    this.hp = config.hits;
    this.maxHp = config.hits;
    scene.add.existing(this);
    this.redraw(1);
    // Pass the hit-area callback explicitly: with a raw Circle shape Phaser does
    // NOT default hitAreaCallback, so pointWithinHitArea throws
    // "hitAreaCallback is not a function" on every pointer event (shooting dies).
    this.setInteractive(new Phaser.Geom.Circle(0, 0, config.radius), Phaser.Geom.Circle.Contains);
  }

  get dead(): boolean {
    return this.deadFlag;
  }
  get alive(): boolean {
    return !this.deadFlag && this.hp > 0;
  }
  get curHp(): number {
    return this.hp;
  }
  get curMaxHp(): number {
    return this.maxHp;
  }
  get radiusAtDepth(): number {
    return this.config.radius * this.scale;
  }

  private redraw(armorFrac: number): void {
    const bucket = Math.max(0, Math.min(4, Math.round(armorFrac * 4)));
    if (bucket === this.hpBucket) return;
    this.hpBucket = bucket;
    if (!this.graphics) this.graphics = this.scene.add.graphics();
    const g = this.graphics;
    g.clear();
    const p: BirdPalette = PALETTES[this.config.palette];
    paintBird(g, 64, 64, 2.4, p, { armor: this.config.hits > 1 ? armorFrac : undefined });
    this.texKey = `${this.config.palette}_b${bucket}`;
    g.generateTexture(this.texKey, 128, 128);
    this.setTexture(this.texKey);
  }

  update(dt: number): void {
    if (this.removed) return;
    this.t += dt / this.trajectory.duration;
    if (this.t >= 1) {
      this.t = 1;
      this.onFinish();
      return;
    }
    const sample = evaluate(this.trajectory, this.t);
    this.x = sample.pos.x;
    this.y = sample.pos.y;
    this.depthCur = sample.depth;
    this.speedEst = sample.speed;
    this.faceDir = sample.angle > Math.PI / 2 || sample.angle < -Math.PI / 2 ? -1 : 1;
    this.setScale((0.5 + this.depthCur * 0.6) * (this.kind.startsWith('boss') ? 1.7 : 1));
    this.setFlipX(this.faceDir === -1);
    this.flap += dt * 0.02;
    if (this.config.hits > 1) {
      this.redraw(this.hp / this.maxHp);
      this.setAngle(0);
    } else {
      this.setAngle(Math.sin(this.flap) * 5 * this.faceDir);
    }
  }

  private onFinish(): void {
    if (this.removed) return;
    this.removed = true;
    this.destroyTarget();
  }

  /** Apply a hit. Returns remaining HP (0 = destroyed). */
  hit(): number {
    if (this.deadFlag || this.removed) return 0;
    this.hp -= 1;
    if (this.config.hits > 1) this.redraw(this.hp / this.maxHp);
    if (this.hp <= 0) {
      this.deadFlag = true;
      this.removed = true;
      this.destroyTarget();
    }
    return this.hp;
  }

  private destroyTarget(): void {
    this.setInteractive(false);
    if (this.graphics) {
      this.graphics.destroy();
      this.graphics = null;
    }
    if (this.active) this.destroy();
  }
}
