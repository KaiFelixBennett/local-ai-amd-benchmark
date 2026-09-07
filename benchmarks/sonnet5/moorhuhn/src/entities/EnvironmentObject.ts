import Phaser from 'phaser';
import type { EnvironmentObjectPlacement } from '../config/maps';
import { getEnvironmentBehavior, type EnvironmentObjectBehavior } from '../config/environmentObjects';

/**
 * A static (or gently idling) interactive prop placed on the map. Unlike
 * Target, these are not pooled — there are only a couple dozen per map and
 * they live for the whole round, so a fixed instance per placement is
 * simpler and cheap enough.
 */
export class EnvironmentObject extends Phaser.GameObjects.Container {
  placement: EnvironmentObjectPlacement;
  behavior: EnvironmentObjectBehavior;
  sprite: Phaser.GameObjects.Sprite;
  private lastTriggeredAt = -Infinity;
  private idleTween: Phaser.Tweens.Tween | null = null;
  isHiddenSecret = false;
  found = false;

  constructor(scene: Phaser.Scene, placement: EnvironmentObjectPlacement, screenW: number, screenH: number) {
    super(scene, placement.x * screenW, placement.y * screenH);
    this.placement = placement;
    this.behavior = getEnvironmentBehavior(placement.type);
    this.isHiddenSecret = ['hiddenBottle', 'treeHollow', 'ghostLight'].includes(placement.type);
    this.sprite = scene.add.sprite(0, 0, this.behavior.textureKey);
    this.sprite.setScale(placement.scale);
    if (this.isHiddenSecret) this.sprite.setAlpha(0.55);
    this.add(this.sprite);
    this.setDepth(this.isHiddenSecret ? 50 : 20);
    scene.add.existing(this);
    this.setSize(this.behavior.width * placement.scale, this.behavior.height * placement.scale);
    this.startIdleAnimation();
  }

  private startIdleAnimation(): void {
    switch (this.behavior.type) {
      case 'windmill':
        this.idleTween = this.scene.tweens.add({
          targets: this.sprite,
          angle: { from: -2, to: 2 },
          duration: 1400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;
      case 'reedBundle':
      case 'signpost':
        this.idleTween = this.scene.tweens.add({
          targets: this.sprite,
          angle: { from: -1.5, to: 1.5 },
          duration: 1800,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;
      case 'firefly':
        this.idleTween = this.scene.tweens.add({
          targets: this.sprite,
          x: { from: this.sprite.x - 10, to: this.sprite.x + 10 },
          y: { from: this.sprite.y - 8, to: this.sprite.y + 8 },
          alpha: { from: 0.5, to: 1 },
          duration: 1600 + Math.random() * 400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;
      case 'ghostLight':
        this.idleTween = this.scene.tweens.add({
          targets: this.sprite,
          alpha: { from: 0.4, to: 0.9 },
          scale: { from: this.placement.scale * 0.85, to: this.placement.scale * 1.15 },
          duration: 1500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;
      default:
        break;
    }
  }

  canTrigger(now: number): boolean {
    return now - this.lastTriggeredAt >= this.behavior.cooldownMs;
  }

  getHitRadiusPx(): number {
    return (Math.max(this.behavior.width, this.behavior.height) / 2) * this.placement.scale * 0.75;
  }

  markTriggered(now: number): void {
    this.lastTriggeredAt = now;
    if (this.isHiddenSecret) this.found = true;
  }

  playHitPunch(): void {
    this.scene.tweens.add({
      targets: this.sprite,
      scale: this.placement.scale * 1.25,
      duration: 90,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  destroy(fromScene?: boolean): void {
    this.idleTween?.stop();
    super.destroy(fromScene);
  }
}
