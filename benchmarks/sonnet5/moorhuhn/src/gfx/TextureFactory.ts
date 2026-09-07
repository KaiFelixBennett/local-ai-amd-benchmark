import Phaser from 'phaser';
import { TARGET_LIST } from '../config/targets';
import type { TargetConfig } from '../core/types';

/**
 * Draws every sprite texture the game needs procedurally with Phaser's
 * Graphics API, then bakes them into the global texture manager once at
 * boot. This keeps the game fully self-contained (no binary image assets)
 * while giving every species/object a distinct, consistent silhouette.
 */
export class TextureFactory {
  static generateAll(scene: Phaser.Scene): void {
    this.generateTargets(scene);
    this.generateEnvironmentObjects(scene);
    this.generateParticles(scene);
    this.generateWeaponAndUi(scene);
    this.generateBosses(scene);
    this.generateParallaxLayers(scene);
  }

  // ---------------------------------------------------------------------
  // Targets (birds)
  // ---------------------------------------------------------------------
  private static generateTargets(scene: Phaser.Scene): void {
    for (const cfg of TARGET_LIST) {
      this.drawBird(scene, `bird_${cfg.id}_0`, cfg, 0);
      this.drawBird(scene, `bird_${cfg.id}_1`, cfg, 1);
      this.drawBird(scene, `bird_${cfg.id}_hit`, cfg, 2);
    }
  }

  private static drawBird(scene: Phaser.Scene, key: string, cfg: TargetConfig, frame: number): void {
    const r = cfg.bodyRadius;
    const size = r * 3.2;
    const g = scene.add.graphics();
    const cx = size / 2;
    const cy = size / 2;

    // tail
    g.fillStyle(cfg.colorSecondary, 1);
    g.fillTriangle(cx - r * 0.9, cy, cx - r * 1.7, cy - r * 0.35, cx - r * 1.7, cy + r * 0.35);

    // wings (flap between frames 0/1)
    const wingLift = frame === 0 ? -r * 0.9 : r * 0.55;
    g.fillStyle(cfg.colorSecondary, 1);
    g.fillEllipse(cx - r * 0.1, cy + wingLift * 0.4, r * 1.6, r * 0.8);

    // body
    g.fillStyle(frame === 2 ? 0xffffff : cfg.colorPrimary, 1);
    g.fillEllipse(cx + r * 0.1, cy, r * 1.5, r * 1.15);

    // belly accent
    g.fillStyle(cfg.colorAccent, 0.85);
    g.fillEllipse(cx + r * 0.25, cy + r * 0.25, r * 0.9, r * 0.55);

    // head
    g.fillStyle(cfg.colorPrimary, 1);
    g.fillCircle(cx + r * 1.05, cy - r * 0.35, r * 0.62);

    // crest feather
    g.fillStyle(cfg.colorAccent, 1);
    g.fillTriangle(
      cx + r * 0.95,
      cy - r * 0.85,
      cx + r * 1.15,
      cy - r * 1.35,
      cx + r * 1.35,
      cy - r * 0.8,
    );

    // beak
    g.fillStyle(0xe8942e, 1);
    g.fillTriangle(cx + r * 1.55, cy - r * 0.4, cx + r * 2.05, cy - r * 0.3, cx + r * 1.55, cy - r * 0.15);

    // eye
    g.fillStyle(0x24160a, 1);
    g.fillCircle(cx + r * 1.15, cy - r * 0.45, r * 0.12);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx + r * 1.18, cy - r * 0.49, r * 0.045);

    // legs
    g.lineStyle(Math.max(1, r * 0.08), 0xe8942e, 1);
    g.lineBetween(cx, cy + r * 1.0, cx - r * 0.15, cy + r * 1.35);
    g.lineBetween(cx + r * 0.3, cy + r * 1.0, cx + r * 0.2, cy + r * 1.35);

    if (cfg.id === 'panzerpelz') {
      g.fillStyle(0x707070, 1);
      g.fillRoundedRect(cx - r * 0.5, cy - r * 0.55, r * 1.4, r * 1.1, r * 0.25);
      g.lineStyle(Math.max(1, r * 0.06), 0x4a4a4a, 1);
      g.strokeRoundedRect(cx - r * 0.5, cy - r * 0.55, r * 1.4, r * 1.1, r * 0.25);
      g.fillStyle(0xb8b08a, 1);
      g.fillCircle(cx - r * 0.15, cy - r * 0.1, r * 0.15);
    }
    if (cfg.id === 'goldschnabel' || cfg.id === 'taeuscher') {
      g.fillStyle(0xfff6d0, 0.55);
      g.fillCircle(cx + r * 0.1, cy, r * 1.9);
    }

    g.generateTexture(key, size, size);
    g.destroy();
  }

  // ---------------------------------------------------------------------
  // Environment objects
  // ---------------------------------------------------------------------
  private static generateEnvironmentObjects(scene: Phaser.Scene): void {
    const draw = (key: string, w: number, h: number, fn: (g: Phaser.GameObjects.Graphics) => void) => {
      const g = scene.add.graphics();
      fn(g);
      g.generateTexture(key, w, h);
      g.destroy();
    };

    draw('env_windmill', 140, 200, (g) => {
      g.fillStyle(0x5a4632, 1);
      g.fillRect(60, 80, 20, 120);
      g.fillStyle(0x8a6a44, 1);
      g.lineStyle(8, 0xd9a05b, 1);
      g.lineBetween(70, 90, 70, 90);
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        const x2 = 70 + Math.cos(angle) * 55;
        const y2 = 60 + Math.sin(angle) * 55;
        g.lineStyle(10, 0xe0d9c8, 1);
        g.lineBetween(70, 60, x2, y2);
        g.fillStyle(0xe0d9c8, 1);
        g.fillCircle(x2, y2, 12);
      }
      g.fillStyle(0x3a2c1e, 1);
      g.fillCircle(70, 60, 8);
    });

    draw('env_lantern', 50, 90, (g) => {
      g.fillStyle(0x3a3a3a, 1);
      g.fillRect(22, 40, 6, 45);
      g.fillStyle(0x5a4632, 1);
      g.fillTriangle(10, 40, 40, 40, 25, 15);
      g.fillStyle(0xffd98a, 0.9);
      g.fillRect(15, 18, 20, 20);
      g.lineStyle(2, 0x3a3a3a, 1);
      g.strokeRect(15, 18, 20, 20);
    });

    draw('env_fenceCans', 160, 70, (g) => {
      g.fillStyle(0x6b4a30, 1);
      g.fillRect(0, 30, 160, 8);
      g.fillRect(0, 50, 160, 8);
      for (let i = 0; i < 5; i++) {
        g.fillStyle(0x8f9296, 1);
        g.fillRect(10 + i * 30, 10, 16, 30);
        g.fillStyle(0xb5b8bc, 1);
        g.fillRect(10 + i * 30, 10, 16, 4);
      }
    });

    draw('env_signpost', 90, 130, (g) => {
      g.fillStyle(0x5a4632, 1);
      g.fillRect(40, 30, 10, 100);
      g.fillStyle(0x8a6a44, 1);
      g.fillRect(10, 15, 70, 22);
      g.lineStyle(2, 0x3a2c1e, 1);
      g.strokeRect(10, 15, 70, 22);
    });

    draw('env_bell', 70, 90, (g) => {
      g.fillStyle(0x5a4632, 1);
      g.fillRect(30, 0, 10, 20);
      g.fillStyle(0xc9a24a, 1);
      g.fillTriangle(10, 70, 60, 70, 35, 20);
      g.fillEllipse(35, 70, 50, 16);
      g.fillStyle(0x8f7530, 1);
      g.fillCircle(35, 78, 6);
    });

    draw('env_scarecrow', 110, 190, (g) => {
      g.fillStyle(0x5a4632, 1);
      g.fillRect(50, 40, 10, 130);
      g.fillRect(15, 70, 80, 10);
      g.fillStyle(0x8a6a44, 1);
      g.fillCircle(55, 35, 22);
      g.fillStyle(0xc9a24a, 1);
      g.fillTriangle(15, 100, 55, 130, 15, 160);
      g.fillTriangle(95, 100, 55, 130, 95, 160);
      g.fillStyle(0x3a2c1e, 1);
      g.fillCircle(47, 30, 3);
      g.fillCircle(63, 30, 3);
      g.lineStyle(3, 0x3a2c1e, 1);
      g.beginPath();
      g.arc(55, 40, 8, 0, Math.PI, false);
      g.strokePath();
    });

    draw('env_pumpkin', 80, 70, (g) => {
      g.fillStyle(0xd9720f, 1);
      g.fillEllipse(40, 40, 60, 45);
      g.lineStyle(3, 0xa8560a, 1);
      g.lineBetween(20, 25, 20, 55);
      g.lineBetween(40, 20, 40, 58);
      g.lineBetween(60, 25, 60, 55);
      g.fillStyle(0x4a7a3c, 1);
      g.fillRect(36, 5, 8, 14);
    });

    draw('env_mushroom', 60, 60, (g) => {
      g.fillStyle(0xe8e0cf, 1);
      g.fillRect(24, 30, 12, 25);
      g.fillStyle(0xc9384a, 1);
      g.fillEllipse(30, 24, 50, 26);
      g.fillStyle(0xf2e8d8, 1);
      g.fillCircle(18, 18, 5);
      g.fillCircle(38, 15, 4);
      g.fillCircle(30, 26, 4);
    });

    draw('env_waterSplash', 100, 50, (g) => {
      g.fillStyle(0x9fd0e0, 0.7);
      g.fillEllipse(50, 40, 90, 18);
      g.fillStyle(0xcdeef5, 0.8);
      g.fillEllipse(50, 35, 60, 12);
    });

    draw('env_bucket', 46, 55, (g) => {
      g.fillStyle(0x5a5a5a, 1);
      g.fillTriangle(6, 15, 40, 15, 34, 50);
      g.fillTriangle(6, 15, 34, 50, 12, 50);
      g.lineStyle(3, 0x3a3a3a, 1);
      g.beginPath();
      g.arc(23, 15, 18, Math.PI, Math.PI * 2, false);
      g.strokePath();
    });

    draw('env_treeHollow', 150, 220, (g) => {
      g.fillStyle(0x4a3624, 1);
      g.fillEllipse(75, 150, 110, 160);
      g.fillStyle(0x2a1c12, 1);
      g.fillEllipse(75, 160, 40, 60);
      g.fillStyle(0x6f5238, 1);
      g.fillEllipse(75, 60, 130, 40);
    });

    draw('env_reedBundle', 90, 160, (g) => {
      g.fillStyle(0x8a7a3f, 1);
      for (let i = 0; i < 7; i++) {
        const x = 8 + i * 12;
        g.lineStyle(4, 0x8a7a3f, 1);
        g.lineBetween(x, 160, x - 6 + (i % 3) * 6, 20);
      }
      g.fillStyle(0x5c4a2a, 1);
      for (let i = 0; i < 7; i++) {
        g.fillEllipse(8 + i * 12 - 6 + (i % 3) * 6, 18, 8, 20);
      }
    });

    draw('env_abandonedCart', 170, 120, (g) => {
      g.fillStyle(0x5a4632, 1);
      g.fillRect(20, 40, 120, 40);
      g.lineStyle(4, 0x3a2c1e, 1);
      g.strokeRect(20, 40, 120, 40);
      g.fillStyle(0x3a3a3a, 1);
      g.fillCircle(45, 95, 22);
      g.fillCircle(125, 95, 22);
      g.fillStyle(0x5a5a5a, 1);
      g.fillCircle(45, 95, 8);
      g.fillCircle(125, 95, 8);
    });

    draw('env_weathervane', 90, 150, (g) => {
      g.fillStyle(0x5a5a5a, 1);
      g.fillRect(42, 20, 6, 130);
      g.lineStyle(4, 0xc9a24a, 1);
      g.lineBetween(15, 20, 75, 20);
      g.fillStyle(0xc9a24a, 1);
      g.fillTriangle(15, 20, 30, 12, 30, 28);
      g.fillTriangle(75, 20, 60, 14, 60, 26);
    });

    draw('env_hiddenBottle', 26, 46, (g) => {
      g.fillStyle(0x2f6b4f, 0.85);
      g.fillRoundedRect(6, 14, 14, 30, 4);
      g.fillRect(11, 2, 4, 14);
      g.fillStyle(0xcdeef5, 0.4);
      g.fillRoundedRect(8, 18, 4, 20, 2);
    });

    draw('env_firefly', 16, 16, (g) => {
      g.fillStyle(0xfff2a8, 1);
      g.fillCircle(8, 8, 4);
      g.fillStyle(0xfff2a8, 0.35);
      g.fillCircle(8, 8, 8);
    });

    draw('env_ghostLight', 30, 30, (g) => {
      g.fillStyle(0xbfe0ff, 0.9);
      g.fillCircle(15, 15, 7);
      g.fillStyle(0xbfe0ff, 0.3);
      g.fillCircle(15, 15, 15);
    });
  }

  // ---------------------------------------------------------------------
  // Particles
  // ---------------------------------------------------------------------
  private static generateParticles(scene: Phaser.Scene): void {
    const draw = (key: string, size: number, fn: (g: Phaser.GameObjects.Graphics) => void) => {
      const g = scene.add.graphics();
      fn(g);
      g.generateTexture(key, size, size);
      g.destroy();
    };

    draw('particle_feather', 20, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(10, 10, 14, 7);
      g.lineStyle(1, 0xd9d9d9, 1);
      g.lineBetween(4, 10, 16, 10);
    });
    draw('particle_dust', 10, (g) => {
      g.fillStyle(0xcbb994, 0.8);
      g.fillCircle(5, 5, 5);
    });
    draw('particle_spark', 12, (g) => {
      g.fillStyle(0xfff2a8, 1);
      g.fillCircle(6, 6, 4);
    });
    draw('particle_smoke', 26, (g) => {
      g.fillStyle(0xaaaaaa, 0.5);
      g.fillCircle(13, 13, 13);
    });
    draw('particle_water', 10, (g) => {
      g.fillStyle(0x9fd0e0, 0.85);
      g.fillCircle(5, 5, 5);
    });
    draw('particle_leaf', 16, (g) => {
      g.fillStyle(0x6a8f3f, 1);
      g.fillEllipse(8, 8, 12, 7);
    });
    draw('particle_rain', 6, (g) => {
      g.fillStyle(0xbcd8e8, 0.85);
      g.fillRect(2, 0, 2, 14);
    });
    draw('particle_confetti', 12, (g) => {
      g.fillStyle(0xf2c14e, 1);
      g.fillRect(0, 0, 12, 5);
    });
    draw('particle_glow', 40, (g) => {
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(20, 20, 20);
    });
    draw('particle_ring', 40, (g) => {
      g.lineStyle(4, 0xffffff, 1);
      g.strokeCircle(20, 20, 16);
    });
  }

  // ---------------------------------------------------------------------
  // Weapon / crosshair / UI
  // ---------------------------------------------------------------------
  private static generateWeaponAndUi(scene: Phaser.Scene): void {
    const skins: { id: string; barrel: number; body: number; trim: number }[] = [
      { id: 'field', barrel: 0x3a3a3a, body: 0x5a4632, trim: 0xd9a05b },
      { id: 'coastal', barrel: 0x30414d, body: 0x475b68, trim: 0xcfe8ff },
      { id: 'moonlit', barrel: 0x241c40, body: 0x352a5c, trim: 0xa06fff },
    ];
    for (const skin of skins) {
      const g = scene.add.graphics();
      g.fillStyle(skin.barrel, 1);
      g.fillRoundedRect(40, 30, 140, 18, 6);
      g.fillStyle(skin.body, 1);
      g.fillRoundedRect(10, 20, 60, 40, 8);
      g.fillStyle(skin.trim, 1);
      g.fillRect(15, 25, 50, 6);
      g.generateTexture(`weapon_${skin.id}`, 190, 70);
      g.destroy();
    }

    const muzzle = scene.add.graphics();
    muzzle.fillStyle(0xfff2a8, 1);
    muzzle.fillTriangle(0, 20, 60, 0, 60, 40);
    muzzle.fillStyle(0xffe08a, 0.7);
    muzzle.fillCircle(0, 20, 22);
    muzzle.generateTexture('muzzle_flash', 60, 40);
    muzzle.destroy();

    const hit = scene.add.graphics();
    hit.lineStyle(4, 0xffffff, 1);
    hit.lineBetween(0, 20, 16, 20);
    hit.lineBetween(24, 20, 40, 20);
    hit.lineBetween(20, 0, 20, 16);
    hit.lineBetween(20, 24, 20, 40);
    hit.generateTexture('hitmarker', 40, 40);
    hit.destroy();
  }

  // ---------------------------------------------------------------------
  // Mini-bosses
  // ---------------------------------------------------------------------
  private static generateBosses(scene: Phaser.Scene): void {
    const draw = (key: string, w: number, h: number, fn: (g: Phaser.GameObjects.Graphics) => void) => {
      const g = scene.add.graphics();
      fn(g);
      g.generateTexture(key, w, h);
      g.destroy();
    };

    draw('boss_armored', 260, 220, (g) => {
      g.fillStyle(0x8b5a3c, 1);
      g.fillEllipse(130, 120, 190, 140);
      g.fillStyle(0x707070, 1);
      g.fillRoundedRect(50, 60, 160, 90, 30);
      g.lineStyle(6, 0x4a4a4a, 1);
      g.strokeRoundedRect(50, 60, 160, 90, 30);
      g.fillStyle(0xd0c98f, 1);
      g.fillCircle(90, 95, 14);
      g.fillCircle(170, 95, 14);
      g.fillStyle(0xf2c14e, 1);
      g.fillCircle(205, 60, 26);
      g.fillStyle(0x24160a, 1);
      g.fillCircle(215, 55, 5);
      g.fillStyle(0xe8942e, 1);
      g.fillTriangle(228, 60, 250, 50, 250, 70);
    });

    draw('boss_acrobat', 200, 160, (g) => {
      g.fillStyle(0x2f8f6b, 1);
      g.fillEllipse(100, 90, 150, 90);
      g.fillStyle(0x59c48f, 1);
      g.fillTriangle(40, 90, 0, 40, 10, 100);
      g.fillTriangle(160, 90, 200, 40, 190, 100);
      g.fillStyle(0xf2c14e, 1);
      g.fillCircle(165, 55, 22);
      g.fillStyle(0x24160a, 1);
      g.fillCircle(175, 50, 4);
      g.fillStyle(0xe8942e, 1);
      g.fillTriangle(186, 55, 205, 48, 205, 62);
    });

    draw('boss_night', 220, 190, (g) => {
      g.fillStyle(0x241c40, 0.95);
      g.fillEllipse(110, 100, 170, 120);
      g.fillStyle(0x352a5c, 1);
      g.fillTriangle(40, 100, 0, 40, 20, 120);
      g.fillTriangle(180, 100, 220, 40, 200, 120);
      g.fillStyle(0xa06fff, 1);
      g.fillCircle(180, 65, 24);
      g.fillStyle(0xd8c2ff, 1);
      g.fillCircle(190, 60, 5);
      g.fillStyle(0xe8942e, 1);
      g.fillTriangle(202, 65, 224, 58, 224, 72);
      g.fillStyle(0xbfa6ff, 0.5);
      g.fillCircle(110, 100, 90);
    });
  }

  // ---------------------------------------------------------------------
  // Parallax background layers (stylized painterly silhouettes)
  // ---------------------------------------------------------------------
  private static generateParallaxLayers(scene: Phaser.Scene): void {
    const W = 1920;
    const draw = (key: string, h: number, fn: (g: Phaser.GameObjects.Graphics) => void) => {
      const g = scene.add.graphics();
      fn(g);
      g.generateTexture(key, W, h);
      g.destroy();
    };

    draw('layer_farHills', 260, (g) => {
      g.fillStyle(0xffffff, 1);
      g.beginPath();
      g.moveTo(0, 260);
      for (let x = 0; x <= W; x += 80) {
        g.lineTo(x, 140 + Math.sin(x * 0.004) * 40);
      }
      g.lineTo(W, 260);
      g.closePath();
      g.fillPath();
    });

    draw('layer_reedsFar', 180, (g) => {
      g.fillStyle(0xffffff, 1);
      for (let x = 0; x < W; x += 14) {
        const h = 60 + Math.sin(x * 0.05) * 30;
        g.fillTriangle(x, 180, x + 4, 180 - h, x + 8, 180);
      }
    });

    draw('layer_waterPlane', 200, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 40, W, 160);
      g.fillStyle(0xffffff, 0.3);
      for (let x = 0; x < W; x += 60) {
        g.fillEllipse(x, 90 + (x % 120 === 0 ? 10 : 0), 40, 6);
      }
    });

    draw('layer_reedsNear', 260, (g) => {
      g.fillStyle(0xffffff, 1);
      for (let x = 0; x < W; x += 22) {
        const h = 120 + Math.sin(x * 0.03) * 60;
        g.fillTriangle(x, 260, x + 6, 260 - h, x + 12, 260);
      }
    });

    draw('layer_clouds', 160, (g) => {
      g.fillStyle(0xffffff, 0.85);
      for (let x = 0; x < W; x += 220) {
        g.fillEllipse(x, 60, 160, 45);
        g.fillEllipse(x + 60, 45, 100, 35);
      }
    });

    draw('layer_cliffsFar', 300, (g) => {
      g.fillStyle(0xffffff, 1);
      g.beginPath();
      g.moveTo(0, 300);
      for (let x = 0; x <= W; x += 100) {
        g.lineTo(x, 100 + Math.abs(Math.sin(x * 0.006)) * 120);
      }
      g.lineTo(W, 300);
      g.closePath();
      g.fillPath();
    });

    draw('layer_sea', 220, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 30, W, 190);
      g.fillStyle(0xffffff, 0.35);
      for (let x = 0; x < W; x += 50) {
        g.fillEllipse(x, 80 + (x % 100 === 0 ? 14 : 0), 34, 5);
      }
    });

    draw('layer_rocksNear', 280, (g) => {
      g.fillStyle(0xffffff, 1);
      for (let x = 0; x < W; x += 160) {
        g.fillEllipse(x + 40, 260, 130, 70);
      }
    });

    draw('layer_stars', 400, (g) => {
      g.fillStyle(0xffffff, 1);
      const rng = new Phaser.Math.RandomDataGenerator(['stars-seed']);
      for (let i = 0; i < 220; i++) {
        g.fillCircle(rng.between(0, W), rng.between(0, 400), rng.between(1, 2));
      }
    });

    draw('layer_farTrees', 260, (g) => {
      g.fillStyle(0xffffff, 1);
      for (let x = 0; x < W; x += 90) {
        g.fillTriangle(x, 260, x + 45, 100, x + 90, 260);
      }
    });

    draw('layer_glowVines', 180, (g) => {
      g.fillStyle(0xffffff, 0.5);
      for (let x = 0; x < W; x += 40) {
        g.fillCircle(x, 90 + Math.sin(x * 0.05) * 40, 4);
      }
    });

    draw('layer_waterPlane2', 200, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 40, W, 160);
    });

    draw('layer_reedsNear2', 260, (g) => {
      g.fillStyle(0xffffff, 1);
      for (let x = 0; x < W; x += 22) {
        const h = 120 + Math.sin(x * 0.03) * 60;
        g.fillTriangle(x, 260, x + 6, 260 - h, x + 12, 260);
      }
    });

    draw('layer_sky', 20, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, W, 20);
    });
  }
}
