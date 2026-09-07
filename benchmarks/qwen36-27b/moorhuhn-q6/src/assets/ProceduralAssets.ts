import Phaser from 'phaser';
import type { TargetTypeConfig, MiniBossConfig, EnvironmentObjectConfig } from '../types';

/**
 * Generates all game assets procedurally using Phaser's Graphics and Texture systems.
 * No external image files needed.
 */
export class ProceduralAssets {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  generateAll(): void {
    this.generateCrosshair();
    this.generateTargets();
    this.generateBosses();
    this.generateEnvironmentObjects();
    this.generateParticles();
    this.generateHitmarker();
    this.generateScorePopup();
    this.generateMuzzleFlash();
    this.generateBackgrounds();
  }

  private generateCrosshair(): void {
    const g = this.scene.add.graphics();
    // Default crosshair
    g.lineStyle(2, 0xff4444);
    g.strokeCircle(0, 0, 16);
    g.lineStyle(2, 0xff4444);
    g.lineBetween(-24, 0, -8, 0);
    g.lineBetween(8, 0, 24, 0);
    g.lineBetween(0, -24, 0, -8);
    g.lineBetween(0, 8, 0, 24);
    g.fillStyle(0xff4444, 1);
    g.fillCircle(0, 0, 2);
    g.generateTexture('crosshair_default', 48, 48);
    g.destroy();

    // Circle crosshair
    const gc = this.scene.add.graphics();
    gc.lineStyle(2, 0x44ff44);
    gc.strokeCircle(0, 0, 14);
    gc.fillStyle(0x44ff44, 1);
    gc.fillCircle(0, 0, 2);
    gc.generateTexture('crosshair_circle', 32, 32);
    gc.destroy();

    // Dot crosshair
    const gd = this.scene.add.graphics();
    gd.fillStyle(0x4444ff, 1);
    gd.fillCircle(0, 0, 5);
    gd.lineStyle(1, 0x4444ff);
    gd.strokeCircle(0, 0, 5);
    gd.generateTexture('crosshair_dot', 16, 16);
    gd.destroy();
  }

  private generateTargets(): void {
    const targets = [
      { id: 'moorflatterer', body: 0x8B4513, wing: 0xA0522D, beak: 0xFF8C00, eye: 0x000000, belly: 0xD2B48C },
      { id: 'schnellfeder', body: 0xD0D0D0, wing: 0xE0E0E0, beak: 0x333333, eye: 0x111111, belly: 0xF0F0F0 },
      { id: 'korkenzieher', body: 0x228B22, wing: 0x2E8B57, beak: 0xFFD700, eye: 0x000000, belly: 0x90EE90 },
      { id: 'panzerpelz', body: 0x556B2F, wing: 0x6B8E23, beak: 0x708090, eye: 0xFF4500, belly: 0x696969, armor: true },
      { id: 'goldschnabel', body: 0xDAA520, wing: 0xFFD700, beak: 0xFF8C00, eye: 0x8B0000, belly: 0xF0E68C, glow: true },
      { id: 'nebelfluesterer', body: 0x778899, wing: 0x8899AA, beak: 0x99AABB, eye: 0x00FF7F, belly: 0xB0C4DE },
      { id: 'taeuscher', body: 0xFF6347, wing: 0xFF7F50, beak: 0xFFD700, eye: 0x000000, belly: 0xFFA07A },
      { id: 'schwarmvogel', body: 0x4169E1, wing: 0x4682B4, beak: 0xFFFF00, eye: 0x000000, belly: 0x87CEEB },
      { id: 'kurvensegler', body: 0x9370DB, wing: 0x8A2BE2, beak: 0xFF69B4, eye: 0xFFD700, belly: 0xDDA0DD },
      { id: 'sturmvogel', body: 0x4682B4, wing: 0x5F9EA0, beak: 0xFF6347, eye: 0xFFFFFF, belly: 0x87CEEB },
    ];

    for (const t of targets) {
      this.generateBirdSprite(t.id, t as any);
    }
  }

  private generateBirdSprite(
    key: string,
    params: {
      body: number;
      wing: number;
      beak: number;
      eye: number;
      belly: number;
      armor?: boolean;
      glow?: boolean;
    }
  ): void {
    const g = this.scene.add.graphics();
    const cx = 32;
    const cy = 24;

    // Body (ellipse-ish)
    g.fillStyle(params.body, 1);
    g.fillEllipse(cx, cy, 36, 22);

    // Belly
    g.fillStyle(params.belly, 1);
    g.fillEllipse(cx + 4, cy + 4, 22, 12);

    // Wing (up position - frame 0)
    g.fillStyle(params.wing, 1);
    g.fillEllipse(cx - 4, cy - 14, 20, 10);

    // Head
    g.fillStyle(params.body, 1);
    g.fillCircle(cx + 18, cy - 6, 10);

    // Eye
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx + 22, cy - 8, 4);
    g.fillStyle(params.eye, 1);
    g.fillCircle(cx + 23, cy - 8, 2);

    // Beak
    g.fillStyle(params.beak, 1);
    g.fillTriangle(cx + 26, cy - 5, cx + 36, cy - 2, cx + 26, cy + 1);

    // Feet
    g.lineStyle(2, params.beak);
    g.lineBetween(cx - 2, cy + 10, cx - 6, cy + 18);
    g.lineBetween(cx + 4, cy + 10, cx + 8, cy + 18);

    // Armor plates for panzerpelz
    if (params.armor) {
      g.fillStyle(0x696969, 0.8);
      g.fillRect(cx - 10, cy - 8, 20, 16);
      g.lineStyle(1, 0x808080);
      g.strokeRect(cx - 10, cy - 8, 20, 16);
      // Rivets
      g.fillStyle(0x808080, 1);
      g.fillCircle(cx - 8, cy - 6, 1.5);
      g.fillCircle(cx + 8, cy - 6, 1.5);
      g.fillCircle(cx - 8, cy + 6, 1.5);
      g.fillCircle(cx + 8, cy + 6, 1.5);
    }

    // Glow for goldschnabel
    if (params.glow) {
      g.fillStyle(0xFFD700, 0.3);
      g.fillCircle(cx, cy, 30);
    }

    g.generateTexture(key, 64, 48);
    g.destroy();

    // Generate wing-down frame for animation
    const g2 = this.scene.add.graphics();
    g2.fillStyle(params.body, 1);
    g2.fillEllipse(cx, cy, 36, 22);
    g2.fillStyle(params.belly, 1);
    g2.fillEllipse(cx + 4, cy + 4, 22, 12);
    g2.fillStyle(params.wing, 1);
    g2.fillEllipse(cx - 4, cy + 6, 20, 10);
    g2.fillStyle(params.body, 1);
    g2.fillCircle(cx + 18, cy - 6, 10);
    g2.fillStyle(0xffffff, 1);
    g2.fillCircle(cx + 22, cy - 8, 4);
    g2.fillStyle(params.eye, 1);
    g2.fillCircle(cx + 23, cy - 8, 2);
    g2.fillStyle(params.beak, 1);
    g2.fillTriangle(cx + 26, cy - 5, cx + 36, cy - 2, cx + 26, cy + 1);
    g2.lineStyle(2, params.beak);
    g2.lineBetween(cx - 2, cy + 10, cx - 6, cy + 18);
    g2.lineBetween(cx + 4, cy + 10, cx + 8, cy + 18);
    if (params.armor) {
      g2.fillStyle(0x696969, 0.8);
      g2.fillRect(cx - 10, cy - 8, 20, 16);
      g2.lineStyle(1, 0x808080);
      g2.strokeRect(cx - 10, cy - 8, 20, 16);
    }
    if (params.glow) {
      g2.fillStyle(0xFFD700, 0.3);
      g2.fillCircle(cx, cy, 30);
    }
    const key2 = `${key}_wingdown`;
    g2.generateTexture(key2, 64, 48);
    g2.destroy();
  }

  private generateBosses(): void {
    const bosses = [
      { id: 'boss_armored_moor', body: 0x556B2F, wing: 0x6B8E23, beak: 0x708090, eye: 0xFF4500, size: [120, 100] },
      { id: 'boss_acrobat', body: 0xFF6347, wing: 0xFF7F50, beak: 0xFF4500, eye: 0x000000, size: [80, 60] },
      { id: 'boss_night', body: 0x1a1a4e, wing: 0x2a2a6e, beak: 0x9370DB, eye: 0x00FF7F, size: [100, 80] },
    ];

    for (const b of bosses) {
      const g = this.scene.add.graphics();
      const [w, h] = b.size;
      const cx = w / 2;
      const cy = h / 2;

      // Large body
      g.fillStyle(b.body, 1);
      g.fillEllipse(cx, cy, w * 0.7, h * 0.5);

      // Wings
      g.fillStyle(b.wing, 1);
      g.fillEllipse(cx - w * 0.2, cy - h * 0.3, w * 0.35, h * 0.2);
      g.fillEllipse(cx + w * 0.2, cy - h * 0.3, w * 0.35, h * 0.2);

      // Head
      g.fillStyle(b.body, 1);
      g.fillCircle(cx + w * 0.3, cy - h * 0.15, w * 0.15);

      // Eyes (big and menacing)
      g.fillStyle(0xffffff, 1);
      g.fillCircle(cx + w * 0.35, cy - h * 0.2, w * 0.06);
      g.fillStyle(b.eye, 1);
      g.fillCircle(cx + w * 0.36, cy - h * 0.2, w * 0.03);

      // Beak
      g.fillStyle(b.beak, 1);
      g.fillTriangle(
        cx + w * 0.4, cy - h * 0.1,
        cx + w * 0.6, cy - h * 0.05,
        cx + w * 0.4, cy + h * 0.05
      );

      // Armor for armored boss
      if (b.id === 'boss_armored_moor') {
        g.fillStyle(0x4a4a4a, 0.85);
        g.fillRect(cx - w * 0.25, cy - h * 0.2, w * 0.5, h * 0.4);
        g.lineStyle(2, 0x666666);
        g.strokeRect(cx - w * 0.25, cy - h * 0.2, w * 0.5, h * 0.4);
      }

      // Glow for night bird
      if (b.id === 'boss_night') {
        g.fillStyle(0x9370DB, 0.2);
        g.fillCircle(cx, cy, w * 0.45);
      }

      g.generateTexture(b.id, w, h);
      g.destroy();
    }
  }

  private generateEnvironmentObjects(): void {
    // Windmill
    const gw = this.scene.add.graphics();
    gw.fillStyle(0x8B7355, 1);
    gw.fillRect(10, 30, 20, 50);
    gw.fillStyle(0xA0522D, 1);
    gw.fillTriangle(5, 30, 20, 5, 35, 30);
    // Blades
    gw.lineStyle(3, 0x654321);
    gw.lineBetween(20, 30, 20, 0);
    gw.lineBetween(20, 30, 40, 30);
    gw.lineBetween(20, 30, 20, 60);
    gw.lineBetween(20, 30, 0, 30);
    gw.generateTexture('env_windmill', 40, 60);
    gw.destroy();

    // Lantern
    const gl = this.scene.add.graphics();
    gl.fillStyle(0x2F4F2F, 1);
    gl.fillRect(8, 0, 4, 15);
    gl.fillStyle(0xDAA520, 1);
    gl.fillRect(2, 15, 16, 14);
    gl.fillStyle(0xFFFF99, 0.6);
    gl.fillRect(4, 17, 12, 10);
    gl.generateTexture('env_lantern', 20, 30);
    gl.destroy();

    // Pumpkin
    const gp = this.scene.add.graphics();
    gp.fillStyle(0xFF6600, 1);
    gp.fillEllipse(15, 18, 24, 20);
    gp.fillStyle(0x228B22, 1);
    gp.fillRect(13, 4, 4, 8);
    gp.lineStyle(1, 0xCC5500);
    gp.lineBetween(8, 10, 8, 26);
    gp.lineBetween(15, 8, 15, 28);
    gp.lineBetween(22, 10, 22, 26);
    // Face
    gp.fillStyle(0x000000, 1);
    gp.fillTriangle(9, 14, 12, 14, 10.5, 18);
    gp.fillTriangle(18, 14, 21, 14, 19.5, 18);
    gp.fillRect(10, 22, 10, 3);
    gp.generateTexture('env_pumpkin', 30, 30);
    gp.destroy();

    // Scarecrow
    const gs = this.scene.add.graphics();
    gs.lineStyle(3, 0x8B7355);
    gs.lineBetween(15, 0, 15, 50);
    gs.lineBetween(5, 15, 25, 15);
    gs.fillStyle(0x8B4513, 1);
    gs.fillCircle(15, 8, 6);
    gs.fillStyle(0xFF0000, 1);
    gs.fillTriangle(12, 2, 15, 0, 18, 2);
    gs.lineStyle(2, 0x654321);
    gs.lineBetween(15, 22, 8, 35);
    gs.lineBetween(15, 22, 22, 35);
    gs.generateTexture('env_scarecrow', 30, 50);
    gs.destroy();

    // Bell
    const gb = this.scene.add.graphics();
    gb.fillStyle(0xDAA520, 1);
    gb.fillEllipse(10, 14, 14, 16);
    gb.fillStyle(0xFFD700, 1);
    gb.fillCircle(10, 20, 3);
    gb.lineStyle(2, 0x8B7355);
    gb.lineBetween(10, 0, 10, 4);
    gb.generateTexture('env_bell', 20, 24);
    gb.destroy();

    // Mushroom
    const gm = this.scene.add.graphics();
    gm.fillStyle(0xF5F5DC, 1);
    gm.fillRect(6, 14, 8, 12);
    gm.fillStyle(0xFF0000, 1);
    gm.fillEllipse(10, 12, 20, 10);
    gm.fillStyle(0xFFFFFF, 1);
    gm.fillCircle(5, 10, 2);
    gm.fillCircle(15, 9, 2);
    gm.fillCircle(10, 6, 1.5);
    gm.generateTexture('env_mushroom', 24, 28);
    gm.destroy();

    // Barrel / Can
    const gc = this.scene.add.graphics();
    gc.fillStyle(0x4682B4, 1);
    gc.fillRect(2, 2, 16, 20);
    gc.lineStyle(1, 0x2F4F4F);
    gc.strokeRect(2, 2, 16, 20);
    gc.lineBetween(2, 10, 18, 10);
    gc.lineBetween(2, 16, 18, 16);
    gc.generateTexture('env_can', 20, 24);
    gc.destroy();

    // Lighthouse
    const gh = this.scene.add.graphics();
    gh.fillStyle(0xFFFFFF, 1);
    gh.fillRect(10, 10, 20, 50);
    gh.fillStyle(0xFF0000, 1);
    gh.fillRect(10, 20, 20, 8);
    gh.fillRect(10, 38, 20, 8);
    gh.fillStyle(0x333333, 1);
    gh.fillRect(8, 4, 24, 8);
    gh.fillStyle(0xFFFF00, 0.6);
    gh.fillCircle(20, 7, 4);
    gh.generateTexture('env_lighthouse', 40, 60);
    gh.destroy();

    // Firefly
    const gf = this.scene.add.graphics();
    gf.fillStyle(0xFFFF00, 0.8);
    gf.fillCircle(5, 5, 4);
    gf.fillStyle(0xFFFF00, 0.3);
    gf.fillCircle(5, 5, 8);
    gf.generateTexture('env_firefly', 10, 10);
    gf.destroy();

    // Ghost light
    const ggh = this.scene.add.graphics();
    ggh.fillStyle(0x00FF7F, 0.5);
    ggh.fillCircle(8, 8, 6);
    ggh.fillStyle(0x00FF7F, 0.2);
    ggh.fillCircle(8, 8, 12);
    ggh.generateTexture('env_ghost_light', 16, 16);
    ggh.destroy();

    // Water splash
    const gws = this.scene.add.graphics();
    gws.fillStyle(0x4488CC, 0.6);
    gws.fillEllipse(15, 12, 30, 8);
    gws.fillStyle(0x66AAEE, 0.4);
    gws.fillEllipse(15, 10, 20, 5);
    gws.generateTexture('env_water', 30, 20);
    gws.destroy();
  }

  private generateParticles(): void {
    // Feather particle
    const gf = this.scene.add.graphics();
    gf.fillStyle(0xFFFFFF, 1);
    gf.fillEllipse(4, 4, 8, 3);
    gf.lineStyle(1, 0xCCCCCC);
    gf.lineBetween(4, 1, 4, 7);
    gf.generateTexture('particle_feather', 8, 8);
    gf.destroy();

    // Dust particle
    const gd = this.scene.add.graphics();
    gd.fillStyle(0xCCCCCC, 0.8);
    gd.fillCircle(3, 3, 3);
    gd.generateTexture('particle_dust', 6, 6);
    gd.destroy();

    // Spark particle
    const gs = this.scene.add.graphics();
    gs.fillStyle(0xFFD700, 1);
    gs.fillCircle(2, 2, 2);
    gs.generateTexture('particle_spark', 4, 4);
    gs.destroy();

    // Smoke particle
    const gsm = this.scene.add.graphics();
    gsm.fillStyle(0x888888, 0.4);
    gsm.fillCircle(5, 5, 5);
    gsm.generateTexture('particle_smoke', 10, 10);
    gsm.destroy();

    // Water drop
    const gwd = this.scene.add.graphics();
    gwd.fillStyle(0x4488CC, 0.7);
    gwd.fillCircle(2, 2, 2);
    gwd.generateTexture('particle_water', 4, 4);
    gwd.destroy();

    // Gold sparkle
    const ggs = this.scene.add.graphics();
    ggs.fillStyle(0xFFD700, 1);
    ggs.fillCircle(3, 3, 3);
    ggs.fillStyle(0xFFFF00, 0.5);
    ggs.fillCircle(3, 3, 5);
    ggs.generateTexture('particle_gold', 10, 10);
    ggs.destroy();
  }

  private generateHitmarker(): void {
    const g = this.scene.add.graphics();
    g.lineStyle(2, 0xffffff);
    g.lineBetween(-6, -6, -2, -2);
    g.lineBetween(6, -6, 2, -2);
    g.lineBetween(-6, 6, -2, 2);
    g.lineBetween(6, 6, 2, 2);
    g.generateTexture('hitmarker', 16, 16);
    g.destroy();

    // Perfect hitmarker
    const gp = this.scene.add.graphics();
    gp.lineStyle(2, 0xFFD700);
    gp.lineBetween(-8, -8, -3, -3);
    gp.lineBetween(8, -8, 3, -3);
    gp.lineBetween(-8, 8, -3, 3);
    gp.lineBetween(8, 8, 3, 3);
    gp.fillStyle(0xFFD700, 1);
    gp.fillCircle(0, 0, 2);
    gp.generateTexture('hitmarker_perfect', 20, 20);
    gp.destroy();
  }

  private generateScorePopup(): void {
    // We'll create score popups as text at runtime, but generate a background
    const g = this.scene.add.graphics();
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(0, 0, 80, 24, 4);
    g.generateTexture('score_bg', 80, 24);
    g.destroy();
  }

  private generateMuzzleFlash(): void {
    const g = this.scene.add.graphics();
    g.fillStyle(0xFFFF00, 1);
    g.fillCircle(8, 8, 6);
    g.fillStyle(0xFF8800, 0.7);
    g.fillCircle(8, 8, 10);
    g.fillStyle(0xFF4400, 0.3);
    g.fillCircle(8, 8, 14);
    g.generateTexture('muzzle_flash', 16, 16);
    g.destroy();
  }

  private generateBackgrounds(): void {
    // Nebelmoor sky gradient
    const gn = this.scene.add.graphics();
    const colors_n = [0x4a6741, 0x6b8f5e, 0x8fbc8f, 0xd4a574];
    const h = 100;
    for (let i = 0; i < colors_n.length; i++) {
      gn.fillStyle(colors_n[i], 1);
      const y = (i / colors_n.length) * h;
      gn.fillRect(0, y, 1920, h / colors_n.length + 1);
    }
    gn.generateTexture('bg_nebelmoor_sky', 1920, h);
    gn.destroy();

    // Sturmklippen sky gradient
    const gs = this.scene.add.graphics();
    const colors_s = [0x2c3e50, 0x3d566e, 0x5d7a8c, 0x8eafc2];
    for (let i = 0; i < colors_s.length; i++) {
      gs.fillStyle(colors_s[i], 1);
      const y = (i / colors_s.length) * h;
      gs.fillRect(0, y, 1920, h / colors_s.length + 1);
    }
    gs.generateTexture('bg_sturmklippen_sky', 1920, h);
    gs.destroy();

    // Mondbruch sky gradient
    const gm = this.scene.add.graphics();
    const colors_m = [0x0a0a2e, 0x121248, 0x1a1a4e, 0x2a2a6e];
    for (let i = 0; i < colors_m.length; i++) {
      gm.fillStyle(colors_m[i], 1);
      const y = (i / colors_m.length) * h;
      gm.fillRect(0, y, 1920, h / colors_m.length + 1);
    }
    gm.generateTexture('bg_mondbruch_sky', 1920, h);
    gm.destroy();

    // Moon
    const gmo = this.scene.add.graphics();
    gmo.fillStyle(0xFFFFEE, 1);
    gmo.fillCircle(40, 40, 36);
    gmo.fillStyle(0x0a0a2e, 1);
    gmo.fillCircle(48, 32, 30);
    gmo.generateTexture('moon', 80, 80);
    gmo.destroy();

    // Stars
    const gst = this.scene.add.graphics();
    gst.fillStyle(0xFFFFFF, 1);
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * 1920;
      const y = Math.random() * 400;
      const r = Math.random() * 1.5 + 0.5;
      gst.fillCircle(x, y, r);
    }
    gst.generateTexture('stars', 1920, 400);
    gst.destroy();
  }
}
