import Phaser from 'phaser';
import type { EnvironmentId, TargetTypeId } from '../types';
import { SeededRng } from '../core/SeededRng';

// ==================== Interactive Environment Objects ====================

export type EnvironmentObjectTypeId =
  | 'windmill'
  | 'lantern'
  | 'cans'
  | 'sign'
  | 'bell'
  | 'scarecrow'
  | 'pumpkin'
  | 'mushroom'
  | 'water'
  | 'bucket'
  | 'tree_hollow'
  | 'reed'
  | 'cart'
  | 'weather_vane'
  | 'bottle'
  | 'firefly'
  | 'ghost_light'
  | 'lighthouse'
  | 'waves'
  | 'buoy'
  | 'net'
  | 'moon_pool'
  | 'glowing_mushroom';

export interface EnvObjectConfig {
  id: EnvironmentObjectTypeId;
  nameKey: string;
  score: number;
  color: number;
  size: number;
  canTriggerChain: boolean;
  chainNext?: EnvironmentObjectTypeId[];
  canSpawnTarget?: TargetTypeId;
  canSlowTime?: boolean;
  canBonusTime?: number;
  canMultiplier?: boolean;
  humorText?: string[];
  environment: EnvironmentId[];
}

export const ENV_OBJECTS: EnvObjectConfig[] = [
  {
    id: 'windmill',
    nameKey: 'obj_windmill',
    score: 50,
    color: 0x8B7355,
    size: 40,
    canTriggerChain: true,
    chainNext: ['bucket', 'bell'],
    humorText: ['Klapper! Klapper!', 'Windkraft!', 'Summsummsum!'],
    environment: ['nebelmoor', 'sturmklippen'],
  },
  {
    id: 'lantern',
    nameKey: 'obj_lantern',
    score: 75,
    color: 0xFFD700,
    size: 24,
    canTriggerChain: true,
    chainNext: ['scarecrow'],
    humorText: ['Leuchtet!', 'Aha!', 'Licht an!'],
    environment: ['nebelmoor', 'mondbruch'],
  },
  {
    id: 'cans',
    nameKey: 'obj_cans',
    score: 25,
    color: 0xCC0000,
    size: 16,
    canTriggerChain: true,
    chainNext: ['cart'],
    humorText: ['Klank!', 'Plink!', 'Clink!'],
    environment: ['nebelmoor', 'sturmklippen'],
  },
  {
    id: 'sign',
    nameKey: 'obj_sign',
    score: 40,
    color: 0x8B4513,
    size: 32,
    canTriggerChain: false,
    humorText: ['Wegweiser!', 'Achtung!', 'Hinweis!'],
    environment: ['nebelmoor', 'sturmklippen', 'mondbruch'],
  },
  {
    id: 'bell',
    nameKey: 'obj_bell',
    score: 100,
    color: 0xFFD700,
    size: 28,
    canTriggerChain: true,
    chainNext: [],
    canSpawnTarget: 'schwarmvogel',
    humorText: ['Gling-glang!', 'Läuten!', 'Kling!'],
    environment: ['nebelmoor', 'sturmklippen'],
  },
  {
    id: 'scarecrow',
    nameKey: 'obj_scarecrow',
    score: 150,
    color: 0x8B6914,
    size: 48,
    canTriggerChain: false,
    humorText: ['Boo!', 'Schaurig!', 'Hallo!'],
    environment: ['nebelmoor'],
  },
  {
    id: 'pumpkin',
    nameKey: 'obj_pumpkin',
    score: 60,
    color: 0xFF8C00,
    size: 28,
    canTriggerChain: true,
    chainNext: ['lantern'],
    humorText: ['Pump!', 'Knack!', 'Orange!'],
    environment: ['nebelmoor', 'mondbruch'],
  },
  {
    id: 'mushroom',
    nameKey: 'obj_mushroom',
    score: 45,
    color: 0x8B0000,
    size: 20,
    canTriggerChain: true,
    chainNext: ['firefly'],
    canSlowTime: true,
    humorText: ['Puff!', 'Sporen!', 'Hust!'],
    environment: ['nebelmoor', 'mondbruch'],
  },
  {
    id: 'water',
    nameKey: 'obj_water',
    score: 10,
    color: 0x4488CC,
    size: 60,
    canTriggerChain: false,
    humorText: ['Platsch!', 'Splash!', 'Schluck!'],
    environment: ['nebelmoor', 'sturmklippen'],
  },
  {
    id: 'bucket',
    nameKey: 'obj_bucket',
    score: 35,
    color: 0x666666,
    size: 24,
    canTriggerChain: true,
    chainNext: ['bell', 'water'],
    humorText: ['Klop!', 'Schwap!', 'Dumpf!'],
    environment: ['nebelmoor', 'sturmklippen'],
  },
  {
    id: 'tree_hollow',
    nameKey: 'obj_tree_hollow',
    score: 80,
    color: 0x3a2a1a,
    size: 36,
    canTriggerChain: true,
    chainNext: ['firefly', 'ghost_light'],
    canSpawnTarget: 'nebelfluesterer',
    humorText: ['Kratz!', 'Wusss!', 'Hohlll!'],
    environment: ['nebelmoor', 'mondbruch'],
  },
  {
    id: 'reed',
    nameKey: 'obj_reed',
    score: 15,
    color: 0x5a7a3a,
    size: 18,
    canTriggerChain: false,
    humorText: ['Raschel!', 'Saus!', 'Wusch!'],
    environment: ['nebelmoor'],
  },
  {
    id: 'cart',
    nameKey: 'obj_cart',
    score: 90,
    color: 0x5a3a1a,
    size: 52,
    canTriggerChain: true,
    chainNext: ['cans', 'bucket'],
    humorText: ['Wackel!', 'Knarrr!', 'Rumpel!'],
    environment: ['nebelmoor', 'sturmklippen'],
  },
  {
    id: 'weather_vane',
    nameKey: 'obj_weather_vane',
    score: 55,
    color: 0x888888,
    size: 22,
    canTriggerChain: true,
    chainNext: ['windmill'],
    humorText: ['Dreh!', 'Wind!', 'Klick!'],
    environment: ['sturmklippen'],
  },
  {
    id: 'bottle',
    nameKey: 'obj_bottle',
    score: 120,
    color: 0x44aa44,
    size: 18,
    canTriggerChain: false,
    canBonusTime: 5,
    humorText: ['Gluck!', 'Pling!', 'Found it!'],
    environment: ['nebelmoor', 'sturmklippen', 'mondbruch'],
  },
  {
    id: 'firefly',
    nameKey: 'obj_firefly',
    score: 30,
    color: 0xFFFF44,
    size: 8,
    canTriggerChain: false,
    humorText: ['Glitz!', 'Blink!', 'Leise!'],
    environment: ['mondbruch'],
  },
  {
    id: 'ghost_light',
    nameKey: 'obj_ghost_light',
    score: 200,
    color: 0x88aaff,
    size: 24,
    canTriggerChain: true,
    chainNext: ['firefly'],
    canSlowTime: true,
    humorText: ['Wooo!', 'Spooky!', 'Geister!'],
    environment: ['mondbruch'],
  },
  {
    id: 'lighthouse',
    nameKey: 'obj_lighthouse',
    score: 250,
    color: 0xffffff,
    size: 64,
    canTriggerChain: true,
    chainNext: ['buoy', 'waves'],
    humorText: ['Leucht!', 'Strahl!', 'Hinweis!'],
    environment: ['sturmklippen'],
  },
  {
    id: 'waves',
    nameKey: 'obj_waves',
    score: 20,
    color: 0x2266aa,
    size: 48,
    canTriggerChain: false,
    humorText: ['Brach!', 'Wusch!', 'Spritz!'],
    environment: ['sturmklippen'],
  },
  {
    id: 'buoy',
    nameKey: 'obj_buoy',
    score: 65,
    color: 0xff4444,
    size: 20,
    canTriggerChain: true,
    chainNext: ['lighthouse'],
    humorText: ['Bong!', 'Klack!', 'Float!'],
    environment: ['sturmklippen'],
  },
  {
    id: 'net',
    nameKey: 'obj_net',
    score: 70,
    color: 0x888844,
    size: 36,
    canTriggerChain: true,
    chainNext: ['buoy'],
    humorText: ['Zapp!', 'Fang!', 'Drag!'],
    environment: ['sturmklippen'],
  },
  {
    id: 'moon_pool',
    nameKey: 'obj_moon_pool',
    score: 180,
    color: 0x4466aa,
    size: 56,
    canTriggerChain: true,
    chainNext: ['ghost_light', 'firefly'],
    canSlowTime: true,
    humorText: ['Spiegel!', 'Mond!', 'Glänzzz!'],
    environment: ['mondbruch'],
  },
  {
    id: 'glowing_mushroom',
    nameKey: 'obj_glowing_mushroom',
    score: 110,
    color: 0x44ff44,
    size: 22,
    canTriggerChain: true,
    chainNext: ['moon_pool'],
    canSlowTime: true,
    humorText: ['Glow!', 'Puls!', 'Mystisch!'],
    environment: ['mondbruch'],
  },
];

// ==================== Chain Reaction System ====================

export interface ChainReaction {
  steps: EnvironmentObjectTypeId[];
  bonusScore: number;
  bonusType: 'score' | 'time' | 'multiplier' | 'spawn';
  bonusValue: number;
}

export const CHAIN_REACTIONS: ChainReaction[] = [
  {
    steps: ['windmill', 'bucket', 'bell'],
    bonusScore: 500,
    bonusType: 'score',
    bonusValue: 500,
  },
  {
    steps: ['lantern', 'scarecrow'],
    bonusScore: 300,
    bonusType: 'score',
    bonusValue: 300,
  },
  {
    steps: ['cans', 'cart', 'bucket', 'water'],
    bonusScore: 800,
    bonusType: 'score',
    bonusValue: 800,
  },
  {
    steps: ['mushroom', 'firefly', 'ghost_light'],
    bonusScore: 600,
    bonusType: 'multiplier',
    bonusValue: 2,
  },
  {
    steps: ['tree_hollow', 'firefly', 'ghost_light', 'moon_pool'],
    bonusScore: 1000,
    bonusType: 'score',
    bonusValue: 1000,
  },
  {
    steps: ['weather_vane', 'windmill', 'bucket', 'bell'],
    bonusScore: 700,
    bonusType: 'score',
    bonusValue: 700,
  },
  {
    steps: ['lighthouse', 'buoy', 'net'],
    bonusScore: 450,
    bonusType: 'time',
    bonusValue: 10,
  },
  {
    steps: ['pumpkin', 'lantern', 'scarecrow'],
    bonusScore: 400,
    bonusType: 'score',
    bonusValue: 400,
  },
];

// ==================== Environment Object Entity ====================

export class EnvObjectEntity extends Phaser.GameObjects.Container {
  public objectId: EnvironmentObjectTypeId;
  public config: EnvObjectConfig;
  public hit: boolean = false;
  public chainStep: number = 0;

  private sprite!: Phaser.GameObjects.Sprite;
  private glowTween: Phaser.Tweens.Tween | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    objectId: EnvironmentObjectTypeId,
    rng: SeededRng
  ) {
    super(scene, x, y);
    this.objectId = objectId;
    this.config = ENV_OBJECTS.find(o => o.id === objectId)!;

    // Draw the object procedurally
    this.drawObject(scene, rng);

    scene.add.existing(this);
  }

  private drawObject(scene: Phaser.Scene, rng: SeededRng): void {
    const g = scene.add.graphics();
    const s = this.config.size;
    const c = this.config.color;

    switch (this.objectId) {
      case 'windmill':
        g.fillStyle(c, 1);
        g.fillRect(-4, -s, 8, s);
        g.fillStyle(0xaaaaaa, 1);
        g.lineStyle(3, c);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          g.lineBetween(0, -s, Math.cos(a) * s * 0.6, -s + Math.sin(a) * s * 0.6);
        }
        g.generateTexture(`env_${this.objectId}`, s * 2, s * 2);
        g.destroy();
        break;

      case 'lantern':
        g.fillStyle(0x444444, 1);
        g.fillRect(-3, -s, 6, s);
        g.fillStyle(0xFFD700, 0.8);
        g.fillCircle(0, -s * 0.3, s * 0.35);
        g.generateTexture(`env_${this.objectId}`, s, s * 2);
        g.destroy();
        break;

      case 'cans':
        for (let i = 0; i < 3; i++) {
          g.fillStyle(i % 2 === 0 ? 0xCC0000 : 0x4444ff, 1);
          g.fillRect(-s * 0.4 + i * s * 0.3, -s * 0.5, s * 0.25, s * 0.5);
        }
        g.generateTexture(`env_${this.objectId}`, s, s);
        g.destroy();
        break;

      case 'bell':
        g.fillStyle(c, 1);
        g.fillCircle(0, -s * 0.3, s * 0.4);
        g.fillStyle(0x444444, 1);
        g.fillRect(-2, -s * 0.8, 4, s * 0.5);
        g.generateTexture(`env_${this.objectId}`, s, s);
        g.destroy();
        break;

      case 'scarecrow':
        g.fillStyle(0x8B6914, 1);
        g.fillRect(-3, -s, 6, s * 1.5);
        g.fillRect(-s * 0.4, -s * 0.6, s * 0.8, s * 0.5);
        g.fillStyle(0x8B4513, 1);
        g.fillCircle(0, -s * 1.1, s * 0.25);
        g.generateTexture(`env_${this.objectId}`, s, s * 2.5);
        g.destroy();
        break;

      case 'pumpkin':
        g.fillStyle(0xFF8C00, 1);
        g.fillEllipse(0, -s * 0.3, s * 0.8, s * 0.6);
        g.fillStyle(0x228B22, 1);
        g.fillRect(-2, -s * 0.6, 4, s * 0.2);
        g.generateTexture(`env_${this.objectId}`, s, s);
        g.destroy();
        break;

      case 'mushroom':
      case 'glowing_mushroom':
        g.fillStyle(0xffffff, 1);
        g.fillRect(-4, -s * 0.3, 8, s * 0.6);
        g.fillStyle(c, 1);
        g.fillCircle(0, -s * 0.5, s * 0.45);
        g.fillStyle(0xffffff, 0.8);
        g.fillCircle(-s * 0.15, -s * 0.6, 3);
        g.fillCircle(s * 0.1, -s * 0.45, 2);
        g.generateTexture(`env_${this.objectId}`, s, s);
        g.destroy();
        break;

      case 'water':
        g.fillStyle(0x4488CC, 0.6);
        g.fillEllipse(0, 0, s, s * 0.3);
        g.generateTexture(`env_${this.objectId}`, s * 2, s * 0.6);
        g.destroy();
        break;

      case 'bucket':
        g.fillStyle(0x666666, 1);
        g.fillTriangle(-s * 0.3, -s * 0.5, s * 0.3, -s * 0.5, s * 0.2, s * 0.2);
        g.fillStyle(0x444444, 1);
        g.fillTriangle(-s * 0.35, -s * 0.55, s * 0.35, -s * 0.55, s * 0.25, -s * 0.35);
        g.generateTexture(`env_${this.objectId}`, s, s);
        g.destroy();
        break;

      case 'tree_hollow':
        g.fillStyle(0x3a2a1a, 1);
        g.fillRect(-s * 0.2, -s, s * 0.4, s);
        g.fillStyle(0x1a0a0a, 1);
        g.fillCircle(0, -s * 0.5, s * 0.2);
        g.generateTexture(`env_${this.objectId}`, s * 0.6, s);
        g.destroy();
        break;

      case 'reed':
        g.fillStyle(0x5a7a3a, 1);
        for (let i = 0; i < 3; i++) {
          g.fillRect(-s * 0.3 + i * s * 0.3, -s, 3, s);
        }
        g.generateTexture(`env_${this.objectId}`, s, s);
        g.destroy();
        break;

      case 'cart':
        g.fillStyle(0x5a3a1a, 1);
        g.fillRect(-s * 0.5, -s * 0.3, s, s * 0.4);
        g.fillStyle(0x333333, 1);
        g.fillCircle(-s * 0.35, s * 0.15, s * 0.12);
        g.fillCircle(s * 0.35, s * 0.15, s * 0.12);
        g.generateTexture(`env_${this.objectId}`, s, s * 0.8);
        g.destroy();
        break;

      case 'weather_vane':
        g.fillStyle(0x888888, 1);
        g.fillRect(-2, -s, 4, s);
        g.fillStyle(0xaaaaaa, 1);
        g.fillTriangle(0, -s, s * 0.3, -s * 0.7, 0, -s * 0.4);
        g.generateTexture(`env_${this.objectId}`, s * 0.6, s);
        g.destroy();
        break;

      case 'bottle':
        g.fillStyle(0x44aa44, 0.8);
        g.fillRect(-s * 0.15, -s * 0.3, s * 0.3, s * 0.5);
        g.fillRect(-s * 0.08, -s * 0.5, s * 0.16, s * 0.3);
        g.generateTexture(`env_${this.objectId}`, s * 0.5, s);
        g.destroy();
        break;

      case 'firefly':
        g.fillStyle(0xFFFF44, 1);
        g.fillCircle(0, 0, s * 0.4);
        g.fillStyle(0xFFFF88, 0.5);
        g.fillCircle(0, 0, s * 0.7);
        g.generateTexture(`env_${this.objectId}`, s, s);
        g.destroy();
        break;

      case 'ghost_light':
        g.fillStyle(0x88aaff, 0.8);
        g.fillCircle(0, -s * 0.2, s * 0.35);
        g.fillStyle(0x88aaff, 0.3);
        g.fillCircle(0, -s * 0.2, s * 0.6);
        g.fillStyle(0xffffff, 0.6);
        g.fillCircle(0, -s * 0.2, s * 0.15);
        g.generateTexture(`env_${this.objectId}`, s, s);
        g.destroy();
        break;

      case 'lighthouse':
        g.fillStyle(0xffffff, 1);
        g.fillRect(-s * 0.15, -s, s * 0.3, s);
        g.fillStyle(0xff0000, 1);
        g.fillRect(-s * 0.15, -s * 0.8, s * 0.3, s * 0.15);
        g.fillRect(-s * 0.15, -s * 0.4, s * 0.3, s * 0.15);
        g.fillStyle(0xFFD700, 0.8);
        g.fillCircle(0, -s * 1.05, s * 0.12);
        g.generateTexture(`env_${this.objectId}`, s * 0.5, s * 2);
        g.destroy();
        break;

      case 'waves':
        g.fillStyle(0x2266aa, 0.7);
        for (let i = 0; i < 3; i++) {
          g.fillEllipse(-s * 0.3 + i * s * 0.3, i * 4, s * 0.5, s * 0.15);
        }
        g.generateTexture(`env_${this.objectId}`, s, s * 0.4);
        g.destroy();
        break;

      case 'buoy':
        g.fillStyle(0xff4444, 1);
        g.fillCircle(0, 0, s * 0.4);
        g.fillStyle(0xffffff, 1);
        g.fillRect(-s * 0.4, -s * 0.1, s * 0.8, s * 0.2);
        g.fillStyle(0x444444, 1);
        g.fillRect(-2, -s * 0.5, 4, s * 0.2);
        g.generateTexture(`env_${this.objectId}`, s, s);
        g.destroy();
        break;

      case 'net':
        g.lineStyle(1, 0x888844);
        for (let i = 0; i < 4; i++) {
          g.lineBetween(-s * 0.4, -s * 0.3 + i * s * 0.2, s * 0.4, -s * 0.3 + i * s * 0.2);
          g.lineBetween(-s * 0.3 + i * s * 0.2, -s * 0.4, -s * 0.3 + i * s * 0.2, s * 0.4);
        }
        g.generateTexture(`env_${this.objectId}`, s, s);
        g.destroy();
        break;

      case 'moon_pool':
        g.fillStyle(0x4466aa, 0.8);
        g.fillEllipse(0, 0, s * 0.6, s * 0.25);
        g.fillStyle(0x8899cc, 0.4);
        g.fillCircle(s * 0.1, -s * 0.05, s * 0.15);
        g.generateTexture(`env_${this.objectId}`, s, s * 0.6);
        g.destroy();
        break;

      default:
        g.fillStyle(c, 1);
        g.fillCircle(0, 0, s * 0.5);
        g.generateTexture(`env_${this.objectId}`, s, s);
        g.destroy();
    }

    this.sprite = scene.add.sprite(0, 0, `env_${this.objectId}`);
    this.add(this.sprite);
  }

  onHit(scene: Phaser.Scene, rng: SeededRng): { score: number; humorText: string } {
    if (this.hit) return { score: 0, humorText: '' };
    this.hit = true;

    const humorText = this.config.humorText
      ? rng.pick(this.config.humorText)
      : 'Treffer!';

    // Animate hit
    scene.tweens.add({
      targets: this,
      scale: 1.3,
      duration: 100,
      yoyo: true,
      onComplete: () => {
        scene.tweens.add({
          targets: this,
          alpha: 0.3,
          scale: 0.8,
          duration: 400,
          ease: 'Power2',
        });
      },
    });

    return { score: this.config.score, humorText };
  }

  destroy(fromScene?: boolean): void {
    if (this.glowTween) {
      this.glowTween.stop();
      this.glowTween = null;
    }
    super.destroy(fromScene);
  }
}

// ==================== Spawner ====================

export function spawnEnvironmentObjects(
  scene: Phaser.Scene,
  environmentId: EnvironmentId,
  rng: SeededRng,
  width: number,
  height: number
): EnvObjectEntity[] {
  const available = ENV_OBJECTS.filter(o => o.environment.includes(environmentId));
  const objects: EnvObjectEntity[] = [];

  const count = rng.int(6, 12);
  const picked = rng.shuffle([...available]).slice(0, count);

  for (const config of picked) {
    const x = rng.range(width * 0.05, width * 0.95);
    const y = rng.range(height * 0.55, height * 0.85);
    const obj = new EnvObjectEntity(scene, x, y, config.id, rng);
    obj.setDepth(30);
    objects.push(obj);
  }

  return objects;
}

// ==================== Chain Check ====================

export function checkChainReaction(
  hitObject: EnvironmentObjectTypeId,
  activeObjects: EnvObjectEntity[]
): ChainReaction | null {
  for (const chain of CHAIN_REACTIONS) {
    const lastStep = chain.steps[chain.steps.length - 1];
    if (hitObject !== lastStep) continue;

    // Check if all previous steps have been hit
    let allHit = true;
    for (let i = 0; i < chain.steps.length - 1; i++) {
      const stepObj = activeObjects.find(o => o.objectId === chain.steps[i] && o.hit);
      if (!stepObj) {
        allHit = false;
        break;
      }
    }

    if (allHit) {
      return chain;
    }
  }
  return null;
}
