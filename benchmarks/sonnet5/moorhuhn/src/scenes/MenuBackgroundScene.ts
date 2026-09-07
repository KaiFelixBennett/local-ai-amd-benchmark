import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/screen';
import { MAP_LIST } from '../config/maps';
import { TARGET_LIST } from '../config/targets';

interface DriftingBird {
  sprite: Phaser.GameObjects.Sprite;
  speed: number;
  wobblePhase: number;
  wobbleAmp: number;
  flapTimer: number;
  flapFrame: 0 | 1;
  textureBase: string;
}

/** Ambient animated backdrop shown behind the HTML menus: slow parallax + a few drifting birds. */
export class MenuBackgroundScene extends Phaser.Scene {
  private birds: DriftingBird[] = [];

  constructor() {
    super('MenuBackgroundScene');
  }

  create(): void {
    const map = MAP_LIST[Math.floor(Math.random() * MAP_LIST.length)] ?? MAP_LIST[0]!;
    this.cameras.main.setBackgroundColor(map.skyColorTop);

    for (const layer of map.parallaxLayers) {
      const y = layer.yAnchor * GAME_HEIGHT;
      const img = this.add.tileSprite(0, y, GAME_WIDTH, GAME_HEIGHT - y, `layer_${layer.key}`);
      img.setOrigin(0, 0);
      img.setTint(layer.tint);
      img.setDepth(layer.depth);
      img.setAlpha(0.9);
      img.setData('scrollFactor', Math.max(0.02, layer.scrollFactor * 0.5));
    }

    const flyableTargets = TARGET_LIST.filter((t) => !t.onlyDuringEvent).slice(0, 6);
    for (let i = 0; i < 5; i++) {
      const cfg = flyableTargets[i % flyableTargets.length]!;
      const sprite = this.add.sprite(
        Phaser.Math.Between(0, GAME_WIDTH),
        Phaser.Math.Between(200, GAME_HEIGHT * 0.6),
        `bird_${cfg.id}_0`,
      );
      sprite.setScale(0.6 + Math.random() * 0.3);
      sprite.setAlpha(0.85);
      sprite.setDepth(100);
      this.birds.push({
        sprite,
        speed: 30 + Math.random() * 40,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleAmp: 20 + Math.random() * 20,
        flapTimer: 0,
        flapFrame: 0,
        textureBase: `bird_${cfg.id}`,
      });
    }
  }

  update(_time: number, delta: number): void {
    for (const child of this.children.list) {
      if (child instanceof Phaser.GameObjects.TileSprite) {
        const factor = (child.getData('scrollFactor') as number) ?? 0;
        child.tilePositionX += factor * delta * 0.02;
      }
    }

    for (const bird of this.birds) {
      bird.sprite.x += (bird.speed * delta) / 1000;
      bird.sprite.y += Math.sin((bird.sprite.x + bird.wobblePhase * 100) / 120) * 0.3;
      if (bird.sprite.x > GAME_WIDTH + 80) bird.sprite.x = -80;

      bird.flapTimer += delta;
      if (bird.flapTimer > 180) {
        bird.flapTimer = 0;
        bird.flapFrame = bird.flapFrame === 0 ? 1 : 0;
        bird.sprite.setTexture(`${bird.textureBase}_${bird.flapFrame}`);
      }
    }
  }
}
