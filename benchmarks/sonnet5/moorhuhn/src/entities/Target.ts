import Phaser from 'phaser';
import type { TargetConfig, TrajectoryKind, Vector2 } from '../core/types';
import { sampleTrajectory, type TrajectoryParams } from '../systems/TrajectorySystem';

export type TargetState = 'inactive' | 'flying' | 'fleeing' | 'hit' | 'despawning';

let instanceCounter = 0;

/**
 * A pooled, data-driven flying target. One class handles every species —
 * behavior differences come entirely from the TargetConfig + TrajectoryParams
 * it is spawned with, not from subclassing.
 */
export class Target extends Phaser.GameObjects.Container {
  instanceId = '';
  config!: TargetConfig;
  state: TargetState = 'inactive';
  hp = 1;
  maxHp = 1;
  armorLayersRemaining = 0;
  spawnedAt = 0;
  private trajectoryParams!: TrajectoryParams;
  private sprite: Phaser.GameObjects.Sprite;
  private armorOverlay: Phaser.GameObjects.Graphics;
  private flapTimer = 0;
  private flapFrame = 0;
  private wobble = 0;
  onDespawn: ((target: Target, reason: 'killed' | 'escaped' | 'expired') => void) | null = null;
  onFleeTriggered: (() => void) | null = null;
  private fleeing = false;
  private baseScale = 1;

  constructor(scene: Phaser.Scene) {
    super(scene, -1000, -1000);
    this.sprite = scene.add.sprite(0, 0, 'bird_moorflatterer_0');
    this.armorOverlay = scene.add.graphics();
    this.add([this.sprite, this.armorOverlay]);
    this.setSize(60, 60);
    scene.add.existing(this);
    this.setVisible(false);
    this.setActive(false);
  }

  spawn(config: TargetConfig, params: TrajectoryParams, now: number): void {
    this.instanceId = `t${instanceCounter++}`;
    this.config = config;
    this.trajectoryParams = params;
    this.spawnedAt = now;
    this.hp = config.behavior.health;
    this.maxHp = config.behavior.health;
    this.armorLayersRemaining = config.behavior.armorLayers;
    this.state = 'flying';
    this.fleeing = false;
    this.flapTimer = 0;
    this.flapFrame = 0;
    this.wobble = Phaser.Math.FloatBetween(0, Math.PI * 2);
    this.baseScale = config.bodyRadius / 34;
    this.setVisible(true);
    this.setActive(true);
    this.setAlpha(1);
    this.sprite.setTexture(`bird_${config.id}_0`);
    this.sprite.setTint(0xffffff);
    this.sprite.setScale(this.baseScale);
    this.armorOverlay.clear();
    this.setPosition(params.start.x, params.start.y);
  }

  /** Advances flight along the trajectory; returns false once it should be despawned (flew off/expired). */
  tick(now: number, dtMs: number, boundsPad: number, screenW: number, screenH: number): boolean {
    if (this.state !== 'flying' && this.state !== 'fleeing') return true;

    const elapsed = now - this.spawnedAt;
    const sample = sampleTrajectory(this.trajectoryParams, elapsed);
    this.setPosition(sample.position.x, sample.position.y);

    const depthScale = 0.6 + sample.depth01 * 0.8;
    const idleBob = Math.sin(now / 260 + this.wobble) * 2;
    this.sprite.y = idleBob;
    this.sprite.setScale(this.baseScale * depthScale);
    this.sprite.setRotation(Phaser.Math.Clamp(sample.heading * 0.15, -0.4, 0.4));
    this.setDepth(Math.round(sample.depth01 * 1000) + (this.config.behavior.depthLayer === 'foreground' ? 200 : 0));

    this.flapTimer += dtMs;
    const flapRate = Math.max(60, 160 - this.config.behavior.baseSpeed * 0.25);
    if (this.flapTimer > flapRate) {
      this.flapTimer = 0;
      this.flapFrame = this.flapFrame === 0 ? 1 : 0;
      if (this.state === 'flying' || this.state === 'fleeing') {
        this.sprite.setTexture(`bird_${this.config.id}_${this.flapFrame}`);
      }
    }

    const offscreen =
      sample.position.x < -boundsPad ||
      sample.position.x > screenW + boundsPad ||
      sample.position.y < -boundsPad ||
      sample.position.y > screenH + boundsPad;

    if (sample.finished || offscreen) {
      this.despawn('escaped');
      return false;
    }
    return true;
  }

  /** Triggers the flee response after a nearby miss (if this species flees). Rebuilds trajectory toward nearest edge. */
  triggerFlee(now: number, screenW: number, screenH: number): void {
    if (!this.config.behavior.fleeOnMiss || this.fleeing || this.state !== 'flying') return;
    this.fleeing = true;
    this.state = 'fleeing';
    const current = { x: this.x, y: this.y };
    const target = this.nearestEdgePoint(current, screenW, screenH);
    this.trajectoryParams = {
      ...this.trajectoryParams,
      kind: 'flee' as TrajectoryKind,
      start: current,
      end: target,
      durationMs: 420,
    };
    this.spawnedAt = now;
    this.onFleeTriggered?.();
  }

  private nearestEdgePoint(from: Vector2, screenW: number, screenH: number): Vector2 {
    const distances: [number, Vector2][] = [
      [from.x, { x: -80, y: from.y }],
      [screenW - from.x, { x: screenW + 80, y: from.y }],
      [from.y, { x: from.x, y: -80 }],
      [screenH - from.y, { x: from.x, y: screenH + 80 }],
    ];
    distances.sort((a, b) => a[0] - b[0]);
    return distances[0]?.[1] ?? { x: from.x, y: -80 };
  }

  /** Applies a hit; returns whether the target died from this hit and whether armor broke this hit. */
  applyHit(): { killed: boolean; armorBroke: boolean } {
    let armorBroke = false;
    if (this.armorLayersRemaining > 0) {
      this.armorLayersRemaining -= 1;
      armorBroke = true;
      this.hp -= 1;
      this.flashArmorBreak();
    } else {
      this.hp -= 1;
    }
    const killed = this.hp <= 0;
    if (killed) {
      this.state = 'hit';
    }
    return { killed, armorBroke };
  }

  private flashArmorBreak(): void {
    this.armorOverlay.clear();
    if (this.armorLayersRemaining > 0) {
      this.armorOverlay.lineStyle(3, 0xffffff, 0.8);
      this.armorOverlay.strokeCircle(0, 0, this.config.bodyRadius * 1.3);
    }
  }

  getHitRadiusPx(): number {
    return this.config.bodyRadius * this.sprite.scaleX * 1.6 * this.config.hitZone.hitRadius;
  }

  getPerfectRadiusPx(): number {
    return this.config.bodyRadius * this.sprite.scaleX * 1.6 * this.config.hitZone.perfectRadius;
  }

  getCurrentSpeed(): number {
    return this.config.behavior.baseSpeed;
  }

  getCurrentDepth01(): number {
    const elapsed = this.scene.time.now - this.spawnedAt;
    return sampleTrajectory(this.trajectoryParams, elapsed).depth01;
  }

  despawn(reason: 'killed' | 'escaped' | 'expired'): void {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.setVisible(false);
    this.setActive(false);
    this.setPosition(-1000, -1000);
    this.onDespawn?.(this, reason);
  }
}
