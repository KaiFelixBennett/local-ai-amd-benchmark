import Phaser from 'phaser';
import { getBossConfig, getPhaseForHealth, type BossConfig, type BossId } from '../config/bosses';
import { sampleTrajectory, type TrajectoryParams } from '../systems/TrajectorySystem';

export interface BossIllusion {
  sprite: Phaser.GameObjects.Sprite;
  offsetPhase: number;
}

/**
 * Mini-boss entity: multi-phase health, a visible health/armor bar, and (for
 * the night boss) illusion decoys that mimic its motion but deal no damage
 * when shot — the player has to track the real one.
 */
export class Boss extends Phaser.GameObjects.Container {
  config: BossConfig;
  hp: number;
  armorLayersRemaining: number;
  private sprite: Phaser.GameObjects.Sprite;
  private healthBarBg: Phaser.GameObjects.Graphics;
  private healthBarFill: Phaser.GameObjects.Graphics;
  private trajectoryParams: TrajectoryParams;
  private segmentStartedAt = 0;
  private illusions: BossIllusion[] = [];
  private screenW: number;
  private screenH: number;
  private rngSeedState: number;
  defeated = false;
  wasHitWithoutMiss = true;

  constructor(scene: Phaser.Scene, id: BossId, screenW: number, screenH: number, seed: number) {
    super(scene, screenW / 2, 160);
    this.config = getBossConfig(id);
    this.hp = this.config.maxHealth;
    this.armorLayersRemaining = this.config.armorLayers;
    this.screenW = screenW;
    this.screenH = screenH;
    this.rngSeedState = seed;

    this.sprite = scene.add.sprite(0, 0, this.config.textureKey);
    this.sprite.setScale(0.001);
    this.healthBarBg = scene.add.graphics();
    this.healthBarFill = scene.add.graphics();
    this.add([this.sprite, this.healthBarBg, this.healthBarFill]);
    this.setDepth(950);
    scene.add.existing(this);

    this.trajectoryParams = this.rollSegment();
    this.segmentStartedAt = scene.time.now;
    this.drawHealthBar();

    scene.tweens.add({ targets: this.sprite, scale: 1, duration: 500, ease: 'Back.easeOut' });
  }

  private nextRandom(): number {
    this.rngSeedState = (this.rngSeedState * 1103515245 + 12345) & 0x7fffffff;
    return this.rngSeedState / 0x7fffffff;
  }

  private rollSegment(): TrajectoryParams {
    const phase = getPhaseForHealth(this.config, this.hp);
    const margin = 120;
    const start = { x: this.x, y: this.y };
    const end = {
      x: margin + this.nextRandom() * (this.screenW - margin * 2),
      y: 100 + this.nextRandom() * (this.screenH * 0.45),
    };
    const kinds: TrajectoryParams['kind'][] = this.config.id === 'acrobat' ? ['zigzag', 'spiral'] : ['sine', 'bezier'];
    const kind = kinds[Math.floor(this.nextRandom() * kinds.length)] as TrajectoryParams['kind'];
    const distance = Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y) || 200;
    const speed = this.config.baseSpeed * phase.speedMultiplier;

    return {
      kind,
      start,
      end,
      control1: { x: start.x + (end.x - start.x) * 0.3, y: start.y - 80 },
      control2: { x: start.x + (end.x - start.x) * 0.7, y: end.y - 80 },
      amplitude: 60,
      frequency: 1.5,
      durationMs: Math.max(700, (distance / speed) * 1000),
      spiralTurns: 2,
      spiralRadius: 50,
      formationOffset: { x: 0, y: 0 },
      windStrength: 0,
    };
  }

  tick(now: number): void {
    const elapsed = now - this.segmentStartedAt;
    const sample = sampleTrajectory(this.trajectoryParams, elapsed);
    this.setPosition(sample.position.x, sample.position.y);
    this.sprite.setRotation(Phaser.Math.Clamp(sample.heading * 0.1, -0.2, 0.2));

    if (sample.finished) {
      this.trajectoryParams = this.rollSegment();
      this.segmentStartedAt = now;
    }

    for (const illusion of this.illusions) {
      const bob = Math.sin(now / 300 + illusion.offsetPhase) * 40;
      illusion.sprite.setPosition(this.x + Math.cos(illusion.offsetPhase) * 160, this.y + bob);
      illusion.sprite.setRotation(this.sprite.rotation);
    }
  }

  getHitRadiusPx(): number {
    return this.config.bodyRadius * this.sprite.scaleX * this.config.hitZone.hitRadius;
  }

  getPerfectRadiusPx(): number {
    return this.config.bodyRadius * this.sprite.scaleX * this.config.hitZone.perfectRadius;
  }

  /** Applies a hit on the real boss; updates phase (speed + illusion count) if crossed a threshold. */
  applyHit(): { killed: boolean; armorBroke: boolean } {
    let armorBroke = false;
    if (this.armorLayersRemaining > 0) {
      this.armorLayersRemaining -= 1;
      armorBroke = true;
    } else {
      this.hp -= 1;
    }
    this.drawHealthBar();
    this.syncIllusionCount();
    const killed = this.hp <= 0;
    if (killed) this.defeated = true;
    return { killed, armorBroke };
  }

  registerMiss(): void {
    this.wasHitWithoutMiss = false;
  }

  private syncIllusionCount(): void {
    const phase = getPhaseForHealth(this.config, this.hp);
    while (this.illusions.length < phase.illusionCount) {
      const sprite = this.scene.add.sprite(this.x, this.y, this.config.textureKey);
      sprite.setScale(this.sprite.scaleX);
      sprite.setAlpha(0.7);
      sprite.setDepth(940);
      this.illusions.push({ sprite, offsetPhase: this.illusions.length * 2.1 + Math.random() });
    }
    while (this.illusions.length > phase.illusionCount) {
      const removed = this.illusions.pop();
      removed?.sprite.destroy();
    }
  }

  getIllusionSprites(): Phaser.GameObjects.Sprite[] {
    return this.illusions.map((i) => i.sprite);
  }

  private drawHealthBar(): void {
    const width = 160;
    const totalUnits = this.config.maxHealth + this.config.armorLayers;
    const remainingUnits = this.hp + this.armorLayersRemaining;
    const fraction = Math.max(0, remainingUnits / totalUnits);
    this.healthBarBg.clear();
    this.healthBarBg.fillStyle(0x1c2b26, 0.85);
    this.healthBarBg.fillRoundedRect(-width / 2, -this.config.bodyRadius - 30, width, 14, 6);
    this.healthBarFill.clear();
    this.healthBarFill.fillStyle(this.armorLayersRemaining > 0 ? 0x9fa6ad : 0xd9455f, 1);
    this.healthBarFill.fillRoundedRect(-width / 2 + 2, -this.config.bodyRadius - 28, (width - 4) * fraction, 10, 4);
  }

  destroy(fromScene?: boolean): void {
    for (const illusion of this.illusions) illusion.sprite.destroy();
    this.illusions = [];
    super.destroy(fromScene);
  }
}
