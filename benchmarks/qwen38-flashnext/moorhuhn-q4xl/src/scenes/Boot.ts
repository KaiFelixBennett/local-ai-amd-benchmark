import Phaser from 'phaser';
import { bus } from '../core/EventBus';
import {
  ANIMATED_BIRDS,
  BLADES_KEY,
  CROSSHAIR_KEYS,
  VANE_KEY,
  TEX,
  birdKey,
  envKey,
  flapAnim,
} from './tex';
import type { MapId, TargetKind } from '../core/types';
import { MAPS } from '../config/maps';

interface BirdStyle {
  body: number;
  belly: number;
  wing: number;
  beak: number;
  size: number;
  alpha?: number;
  crest?: boolean;
  wide?: boolean; // big wingspan glider
  ghost?: boolean;
  mark?: 'decoy' | 'gold' | 'storm' | 'armored' | null;
}

const BIRD_STYLES: Record<TargetKind, BirdStyle> = {
  flatterer: { body: 0x8a5a2b, belly: 0xd9b98a, wing: 0x6b4420, beak: 0xf0a830, size: 26 },
  swift: { body: 0x4f6d7a, belly: 0xcfe8ef, wing: 0x33505c, beak: 0xe8e0c8, size: 19, crest: true },
  corkscrew: { body: 0x7a5c9e, belly: 0xd9c6ef, wing: 0x59407a, beak: 0xf7d86b, size: 21 },
  armored: { body: 0x5c6652, belly: 0x9aa287, wing: 0x464f3f, beak: 0xb8b09a, size: 28, mark: 'armored' },
  gold: { body: 0xe8b423, belly: 0xfbe38a, wing: 0xc8940f, beak: 0xff9d2e, size: 23, mark: 'gold' },
  mist: { body: 0x9fb8cc, belly: 0xd9e6f2, wing: 0x86a2ba, beak: 0xcfd8e2, size: 24, ghost: true, alpha: 0.55 },
  decoy: { body: 0xcf6a4a, belly: 0xf0c8a8, wing: 0xa84e33, beak: 0xe6c07a, size: 27, mark: 'decoy' },
  swarm: { body: 0xa8784a, belly: 0xd9c19a, wing: 0x82593a, beak: 0xe0a83c, size: 13 },
  glider: { body: 0x6a7a5c, belly: 0xc2cca8, wing: 0x525f47, beak: 0xd0b060, size: 27, wide: true },
  storm: { body: 0x444e5c, belly: 0x8e9aad, wing: 0x2f3844, beak: 0xc8d2dc, size: 25, mark: 'storm' },
  balloon: { body: 0xb8543f, belly: 0xe8a08a, wing: 0x90402f, beak: 0x6b4a30, size: 26 },
  bossArmored: { body: 0x4c5548, belly: 0x8b947c, wing: 0x39423b, beak: 0xc2bda6, size: 92, mark: 'armored' },
  bossAcrobat: { body: 0x5f4a86, belly: 0xbfa8e8, wing: 0x473569, beak: 0xf0d060, size: 86, crest: true },
  bossNight: { body: 0x2e3a52, belly: 0x6e82a8, wing: 0x22304a, beak: 0x9fb6d8, size: 90, ghost: true, alpha: 0.92 },
};

/** Generates every game texture procedurally — no image assets shipped. */
export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.makeBirds();
    this.makeEnvProps();
    this.makeParticles();
    this.makeCrosshairs();
    this.makeSky();
    this.makeAnimations();
    // The DOM main menu decides when to start a round via startRun().
    bus.emit('boot:ready', undefined);
  }

  // ------------------------------------------------ birds

  private makeBirds(): void {
    (Object.keys(BIRD_STYLES) as TargetKind[]).forEach((kind) => {
      const st = BIRD_STYLES[kind];
      if (kind === 'balloon') {
        this.drawBalloon(st.size);
        return;
      }
      if (kind === 'armored') {
        for (let dmg = 0; dmg < 3; dmg++) this.drawBird(kind, st, 1, dmg);
        return;
      }
      if (ANIMATED_BIRDS.includes(kind)) {
        for (let f = 0; f < 3; f++) this.drawBird(kind, st, f, 0);
      } else {
        this.drawBird(kind, st, 1, 0);
      }
    });
  }

  private drawBird(kind: TargetKind, st: BirdStyle, frame: number, damage: number): void {
    const s = st.size;
    const span = st.wide ? s * 2.3 : s * 1.9;
    const w = Math.ceil(span * 2.4);
    const h = Math.ceil(s * 3.2);
    const g = this.add.graphics();
    const a = st.alpha ?? 1;
    const cy = h / 2;
    const cx = w / 2 - s * 0.2;

    // tail
    g.fillStyle(st.wing, a);
    g.fillTriangle(cx - s * 1.0, cy, cx - s * 1.9, cy - s * 0.5, cx - s * 1.8, cy + s * 0.35);

    // body
    g.fillStyle(st.body, a);
    g.fillEllipse(cx, cy, s * 2.1, s * 1.42);
    g.fillStyle(st.belly, a * 0.9);
    g.fillEllipse(cx + s * 0.18, cy + s * 0.3, s * 1.45, s * 0.75);

    // head
    g.fillStyle(st.body, a);
    g.fillCircle(cx + s * 1.02, cy - s * 0.48, s * 0.56);
    if (st.crest) {
      g.fillTriangle(cx + s * 0.9, cy - s * 0.95, cx + s * 0.55, cy - s * 1.5, cx + s * 1.2, cy - s * 1.05);
    }
    // beak
    g.fillStyle(st.beak, a);
    g.fillTriangle(cx + s * 1.45, cy - s * 0.6, cx + s * 1.95, cy - s * 0.42, cx + s * 1.45, cy - s * 0.24);
    // eye
    const eyeA = st.ghost ? a * 0.95 : a;
    g.fillStyle(0xffffff, eyeA);
    g.fillCircle(cx + s * 1.14, cy - s * 0.58, s * 0.17);
    g.fillStyle(0x1a1a22, eyeA);
    g.fillCircle(cx + s * 1.18, cy - s * 0.58, s * 0.08);

    // wing (flap frames up / mid / down)
    const ang = [-58, -12, 34][frame];
    this.drawWing(g, cx - s * 0.05, cy - s * 0.28, st.wing, s * (st.wide ? 2.0 : 1.42), s * 0.62, ang, a);

    if (st.mark === 'armored') this.drawArmor(g, cx, cy, s, damage, a);
    if (st.mark === 'decoy') this.drawDecoyMark(g, cx, cy, s);
    if (st.mark === 'gold') this.drawGoldMark(g, cx, cy, s);
    if (st.mark === 'storm') this.drawStormBelly(g, cx, cy, s);

    g.generateTexture(birdKey(kind, st.mark === 'armored' ? damage : frame), w, h);
    g.destroy();
  }

  private drawWing(
    g: Phaser.GameObjects.Graphics,
    bx: number,
    by: number,
    color: number,
    len: number,
    width: number,
    deg: number,
    a: number,
  ): void {
    const rad = Phaser.Math.DegToRad(deg);
    const tipX = bx + Math.cos(rad) * len;
    const tipY = by + Math.sin(rad) * len;
    const px = Math.cos(rad + Math.PI / 2);
    const py = Math.sin(rad + Math.PI / 2);
    g.fillStyle(color, a);
    g.fillTriangle(
      bx - px * width * 0.35,
      by - py * width * 0.35,
      bx + px * width,
      by + py * width,
      tipX + px * width * 0.35,
      tipY + py * width * 0.35,
    );
    g.fillTriangle(bx, by, tipX, tipY, bx + px * width * 0.6 + Math.cos(rad) * width * 0.4, by + py * width * 0.6 + Math.sin(rad) * width * 0.4);
  }

  private drawArmor(g: Phaser.GameObjects.Graphics, cx: number, cy: number, s: number, damage: number, a: number): void {
    // shell plates; later damage stages show cracks (drawn darker)
    g.fillStyle(0x8f9787, a);
    g.fillEllipse(cx - s * 0.1, cy - s * 0.35, s * 1.5, s * 0.85);
    g.lineStyle(Math.max(1, s * 0.06), 0x3a4036, a);
    g.beginPath();
    for (let i = -2; i <= 2; i++) g.lineBetween(cx + i * s * 0.3 - s * 0.1, cy - s * 0.72, cx + i * s * 0.3 - s * 0.1, cy + s * 0.05);
    g.strokePath();
    if (damage >= 1) {
      g.lineStyle(Math.max(1, s * 0.07), 0x1d211b, 0.9);
      g.beginPath();
      g.lineBetween(cx - s * 0.7, cy - s * 0.5, cx - s * 0.2, cy - s * 0.1);
      g.lineBetween(cx - s * 0.2, cy - s * 0.1, cx + s * 0.15, cy - s * 0.45);
      g.strokePath();
    }
    if (damage >= 2) {
      g.lineStyle(Math.max(1, s * 0.08), 0xff6b4a, 0.85);
      g.beginPath();
      g.lineBetween(cx + s * 0.2, cy - s * 0.6, cx + s * 0.55, cy - s * 0.05);
      g.strokePath();
    }
  }

  private drawDecoyMark(g: Phaser.GameObjects.Graphics, cx: number, cy: number, s: number): void {
    g.fillStyle(0xffd23f, 1);
    g.fillTriangle(cx - s * 0.1, cy - s * 0.55, cx - s * 0.5, cy + s * 0.15, cx + s * 0.3, cy + s * 0.15);
    g.fillStyle(0x1a1a22, 1);
    g.fillRect(cx - s * 0.15, cy - s * 0.22, s * 0.12, s * 0.24);
    g.fillCircle(cx - s * 0.09, cy + s * 0.06, s * 0.07);
  }

  private drawGoldMark(g: Phaser.GameObjects.Graphics, cx: number, cy: number, s: number): void {
    g.fillStyle(0xffffff, 0.85);
    const r = s * 0.28;
    g.fillTriangle(cx + s * 0.1, cy - r * 2, cx + s * 0.1 - r * 0.4, cy, cx + s * 0.1 + r * 0.4, cy);
    g.fillTriangle(cx + s * 0.1, cy + r * 0.8, cx + s * 0.1 - r * 0.4, cy - r * 0.6, cx + s * 0.1 + r * 0.4, cy - r * 0.6);
  }

  private drawStormBelly(g: Phaser.GameObjects.Graphics, cx: number, cy: number, s: number): void {
    g.fillStyle(0xffe066, 0.95);
    g.fillTriangle(cx - s * 0.3, cy + s * 0.05, cx - s * 0.05, cy + s * 0.05, cx - s * 0.2, cy + s * 0.4);
    g.fillTriangle(cx - s * 0.2, cy + s * 0.25, cx + s * 0.05, cy + s * 0.25, cx - s * 0.05, cy + s * 0.62);
  }

  private drawBalloon(s: number): void {
    const w = Math.ceil(s * 2.4);
    const h = Math.ceil(s * 3.6);
    const g = this.add.graphics();
    const cx = w / 2;
    const cy = h * 0.42;
    g.fillStyle(0xb8543f, 1);
    g.fillCircle(cx, cy, s);
    g.fillStyle(0xf0d9b8, 0.9);
    g.fillTriangle(cx - s * 0.28, cy - s, cx + s * 0.28, cy - s * 0.7, cx + s * 0.1, cy + s);
    g.fillTriangle(cx - s * 0.28, cy - s * 0.4, cx + s * 0.28, cy - s * 0.1, cx + s * 0.05, cy + s * 0.9);
    g.lineStyle(Math.max(2, s * 0.06), 0x6b4a30, 1);
    g.lineBetween(cx, cy + s, cx, h - s * 0.75);
    g.fillStyle(0x8a6b46, 1);
    g.fillRect(cx - s * 0.4, h - s * 0.78, s * 0.8, s * 0.55);
    g.generateTexture(birdKey('balloon', 0), w, h);
    g.destroy();
  }

  // ------------------------------------------------ env props

  private makeEnvProps(): void {
    const K = envKey;
    // windmill (body) + separate blades
    this.tex(K('windmill'), 150, 190, (g) => {
      g.fillStyle(0xb8a888, 1).fillTriangle(75, 12, 26, 186, 124, 186);
      g.fillStyle(0x7a6a50, 1).fillRect(62, 0, 26, 22);
      g.fillStyle(0x4c3f2e, 1).fillRect(63, 150, 26, 36);
      g.fillStyle(0x3a2f22, 1).fillRect(38, 96, 20, 20);
      g.fillRect(78, 62, 20, 20);
    });
    this.tex(BLADES_KEY, 190, 190, (g) => {
      g.fillStyle(0x5c4a38, 1);
      for (let i = 0; i < 4; i++) {
        g.save();
        g.translateCanvas(95, 95);
        g.rotateCanvas((Math.PI / 2) * i);
        g.fillRect(-6, -90, 12, 80);
        g.fillStyle(0xd8cdb8, 1);
        g.fillRect(4, -88, 16, 46);
        g.fillStyle(0x5c4a38, 1);
        g.restore();
      }
      g.fillStyle(0x2f2618, 1).fillCircle(95, 95, 12);
    });
    this.tex(K('lantern'), 46, 110, (g) => {
      g.fillStyle(0x5a4630, 1).fillRect(20, 40, 7, 68);
      g.fillStyle(0x3a3a44, 1).fillRect(11, 8, 25, 34);
      g.fillStyle(0xffd875, 1).fillRect(16, 13, 15, 24);
      g.fillStyle(0x3a3a44, 1).fillTriangle(23, 0, 8, 9, 38, 9);
    });
    this.tex(K('cans'), 64, 78, (g) => {
      const can = (x: number, y: number): void => {
        g.fillStyle(0xb0b8c2, 1).fillRect(x, y, 24, 30);
        g.fillStyle(0x8a929e, 1).fillEllipse(x + 12, y + 30, 24, 9);
        g.fillStyle(0xcfd6de, 1).fillEllipse(x + 12, y, 24, 9);
        g.fillStyle(0xcf6a4a, 1).fillRect(x + 2, y + 10, 20, 9);
      };
      can(4, 46);
      can(36, 46);
      can(20, 12);
    });
    this.tex(K('sign'), 96, 108, (g) => {
      g.fillStyle(0x6b5236, 1).fillRect(44, 40, 9, 66);
      g.fillStyle(0x8a6b46, 1).fillRect(6, 6, 84, 42);
      g.lineStyle(3, 0x4c3f2e, 1).strokeRect(6, 6, 84, 42);
      g.fillStyle(0x4c3f2e, 0.9).fillRect(14, 18, 60, 5).fillRect(14, 30, 42, 5);
    });
    this.tex(K('bell'), 60, 92, (g) => {
      g.lineStyle(4, 0x6b5236, 1).lineBetween(30, 0, 30, 30);
      g.fillStyle(0xc9a227, 1).fillCircle(30, 52, 30);
      g.fillStyle(0x8f6f14, 1).fillRect(12, 66, 36, 8);
      g.fillStyle(0x6d5410, 1).fillCircle(30, 82, 8);
    });
    this.tex(K('scarecrow'), 110, 140, (g) => {
      g.fillStyle(0x6b5236, 1).fillRect(51, 34, 8, 104).fillRect(18, 58, 74, 7);
      g.fillStyle(0xc9b07a, 1).fillCircle(55, 26, 24);
      g.fillStyle(0x7a5c38, 1).fillEllipse(55, 8, 46, 12).fillRect(37, 0, 36, 10);
      g.fillStyle(0x22222a, 1).fillCircle(47, 24, 3).fillCircle(63, 24, 3);
      g.fillStyle(0x8f4a3a, 1).fillRect(20, 44, 12, 12).fillRect(78, 44, 12, 12);
    });
    this.tex(K('pumpkin'), 78, 66, (g) => {
      g.fillStyle(0xe07a1f, 1).fillEllipse(39, 40, 70, 50);
      g.fillStyle(0xc2650f, 0.7).fillEllipse(25, 40, 20, 48).fillEllipse(53, 40, 20, 48);
      g.fillStyle(0x5c7030, 1).fillRect(35, 8, 8, 16);
      g.fillStyle(0x3a2a10, 0.85).fillTriangle(24, 36, 34, 36, 29, 28).fillTriangle(44, 36, 54, 36, 49, 28);
      g.fillRect(26, 48, 26, 5);
    });
    this.tex(K('mushroom'), 72, 56, (g) => {
      const m = (x: number, y: number, s: number, cap: number): void => {
        g.fillStyle(0xe8dcc0, 1).fillRect(x - s * 0.22, y - s * 0.5, s * 0.44, s * 0.9);
        g.fillStyle(cap, 1).fillEllipse(x, y - s * 0.5, s * 1.3, s * 0.8);
        g.fillStyle(0xf4ecd8, 0.9).fillCircle(x - s * 0.3, y - s * 0.6, s * 0.12).fillCircle(x + s * 0.25, y - s * 0.55, s * 0.1);
      };
      m(18, 50, 26, 0xc44a3a);
      m(46, 52, 32, 0xd86a3a);
      m(64, 54, 16, 0xc44a3a);
    });
    this.tex(K('puddle'), 130, 44, (g) => {
      g.fillStyle(0x8fb6c9, 0.8).fillEllipse(65, 24, 126, 40);
      g.fillStyle(0xc9e2ee, 0.7).fillEllipse(50, 18, 44, 12);
    });
    this.tex(K('bucket'), 52, 56, (g) => {
      g.fillStyle(0x8f97a2, 1).fillEllipse(26, 10, 44, 14);
      g.fillStyle(0x767e8a, 1).fillTriangle(4, 12, 2, 52, 26, 50).fillTriangle(48, 12, 50, 50, 26, 50);
      g.fillStyle(0x5f676f, 1).fillRect(4, 12, 44, 38);
      g.fillStyle(0x8f97a2, 1).fillEllipse(26, 50, 44, 12);
      g.lineStyle(3, 0x4a525a, 1).strokeEllipse(26, 10, 44, 14);
    });
    this.tex(K('hollow'), 92, 96, (g) => {
      g.fillStyle(0x6b4f30, 1).fillEllipse(46, 52, 88, 86);
      g.fillStyle(0x3a2a18, 1).fillEllipse(44, 52, 48, 58);
      g.fillStyle(0x16100a, 1).fillEllipse(42, 54, 34, 44);
      g.fillStyle(0x5c7030, 1).fillEllipse(46, 8, 60, 18);
    });
    this.tex(K('reeds'), 90, 120, (g) => {
      g.lineStyle(5, 0x517038, 1);
      for (const [x, lean] of [[12, 8], [30, -6], [48, 5], [66, -8], [80, 4]] as const) {
        g.beginPath();
        g.lineBetween(x, 120, x + lean, 18);
        g.strokePath();
      }
      g.fillStyle(0x7a5230, 1);
      g.fillEllipse(18, 20, 9, 26).fillEllipse(54, 16, 9, 22);
    });
    this.tex(K('wagon'), 128, 84, (g) => {
      g.fillStyle(0x6b4f30, 1).fillRect(8, 18, 112, 34);
      g.lineStyle(4, 0x4c3a22, 1).strokeRect(8, 18, 112, 34);
      g.fillStyle(0x8a6b46, 1).fillRect(14, 10, 100, 8);
      g.fillStyle(0x3a2f22, 1).fillCircle(34, 62, 30).fillCircle(96, 62, 30);
      g.fillStyle(0x9a8a70, 1).fillCircle(34, 62, 10).fillCircle(96, 62, 10);
    });
    this.tex(K('weathervane'), 30, 130, (g) => {
      g.fillStyle(0x4c4c56, 1).fillRect(12, 20, 6, 110);
      g.fillStyle(0x3a3a44, 1).fillRect(2, 122, 26, 8);
      g.fillStyle(0x8f97a2, 1).fillCircle(15, 20, 8);
    });
    this.tex(VANE_KEY, 96, 40, (g) => {
      g.fillStyle(0x3a3a44, 1).fillRect(14, 17, 62, 6);
      g.fillStyle(0xcf6a4a, 1).fillTriangle(88, 20, 66, 6, 66, 34);
      g.fillTriangle(8, 20, 22, 8, 22, 14).fillTriangle(8, 20, 22, 32, 22, 26);
    });
    this.tex(K('bottle'), 34, 74, (g) => {
      g.fillStyle(0x3f7a4a, 0.92).fillEllipse(17, 52, 28, 42);
      g.fillRect(12, 10, 10, 32);
      g.fillStyle(0xc9a227, 1).fillRect(11, 4, 12, 8);
      g.fillStyle(0xe8dcc0, 0.9).fillRect(8, 42, 18, 14);
    });
    this.tex(K('firefly'), 30, 30, (g) => this.radial(g, 15, 15, 15, 0xffe57a));
    this.tex(K('ghostlight'), 70, 90, (g) => {
      this.radial(g, 35, 32, 30, 0x9fe8c8);
      g.fillStyle(0x9fe8c8, 0.5).fillEllipse(35, 70, 22, 26);
    });
    this.tex(K('lighthouse'), 92, 230, (g) => {
      g.fillStyle(0xd8cdb8, 1).fillTriangle(46, 8, 18, 226, 74, 226);
      g.fillStyle(0xc44a3a, 1).fillRect(28, 60, 36, 22).fillRect(22, 130, 48, 22);
      g.fillStyle(0x3a3a44, 1).fillRect(34, 22, 24, 22);
      g.fillStyle(0xffe57a, 1).fillRect(38, 26, 16, 14);
      g.fillStyle(0x2f2618, 1).fillTriangle(46, 0, 28, 22, 64, 22);
    });
    this.tex(K('crystal'), 64, 88, (g) => {
      this.radial(g, 32, 48, 28, 0x9fd8f0);
      g.fillStyle(0xbfeaff, 0.95).fillTriangle(32, 4, 16, 44, 32, 84).fillTriangle(32, 4, 48, 44, 32, 84);
      g.fillStyle(0x6ab8dc, 0.8).fillTriangle(32, 16, 26, 44, 32, 72);
    });
    this.tex(K('nestbasket'), 86, 62, (g) => {
      g.fillStyle(0x8a6b46, 1).fillEllipse(43, 36, 84, 46);
      g.fillStyle(0x6b5236, 1).fillEllipse(43, 30, 66, 32);
      g.fillStyle(0xe8e2cc, 1).fillEllipse(31, 28, 18, 22).fillEllipse(47, 26, 18, 22).fillEllipse(60, 30, 16, 20);
      g.lineStyle(3, 0x5c4a38, 1).strokeEllipse(43, 38, 84, 46);
    });
  }

  // ------------------------------------------------ particles & fx

  private makeParticles(): void {
    this.tex(TEX.feather, 18, 18, (g) => {
      g.fillStyle(0xffffff, 1).fillEllipse(9, 9, 14, 7);
      g.lineStyle(2, 0xd8d8d8, 1).lineBetween(2, 12, 16, 6);
    });
    this.tex(TEX.hitStar, 32, 32, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(16, 0, 10, 16, 22, 16).fillTriangle(16, 32, 10, 16, 22, 16);
      g.fillTriangle(0, 16, 16, 10, 16, 22).fillTriangle(32, 16, 16, 10, 16, 22);
    });
    this.tex(TEX.splash, 28, 28, (g) => {
      g.fillStyle(0xbfe0ef, 1);
      g.fillEllipse(6, 10, 7, 11).fillEllipse(16, 5, 6, 10).fillEllipse(23, 14, 8, 12).fillEllipse(12, 20, 9, 13);
    });
    this.tex(TEX.spore, 16, 16, (g) => this.radial(g, 8, 8, 8, 0xbfe08a));
    this.tex(TEX.glow, 80, 80, (g) => this.radial(g, 40, 40, 40, 0xffffff));
    this.tex(TEX.rain, 4, 20, (g) => {
      g.fillStyle(0xbfd8e8, 0.8).fillRect(1, 0, 2, 20);
    });
    this.tex(TEX.flash, 260, 260, (g) => this.radial(g, 130, 130, 130, 0xffffff));
    this.tex(TEX.fog, 280, 280, (g) => this.radial(g, 140, 140, 140, 0xe6ecef));
    this.tex(TEX.cloud, 240, 90, (g) => {
      g.fillStyle(0xb8c2cc, 0.75);
      g.fillEllipse(60, 55, 120, 55);
      g.fillEllipse(130, 42, 110, 60);
      g.fillEllipse(190, 58, 90, 44);
    });
    this.tex(TEX.px, 4, 4, (g) => g.fillStyle(0xffffff, 1).fillRect(0, 0, 4, 4));
    this.tex(TEX.star, 28, 28, (g) => {
      g.fillStyle(0xffd875, 1);
      g.fillTriangle(14, 0, 8, 14, 20, 14).fillTriangle(14, 28, 8, 14, 20, 14);
      g.fillTriangle(0, 14, 14, 8, 14, 20).fillTriangle(28, 14, 14, 8, 14, 20);
    });
    this.tex(TEX.ring, 60, 60, (g) => {
      g.lineStyle(5, 0xffffff, 1).strokeCircle(30, 30, 26);
    });
    // shotgun silhouette, muzzle at (37,0), points up
    this.tex(TEX.gun, 74, 240, (g) => {
      g.fillStyle(0x2c2c34, 1).fillRect(30, 0, 14, 150);
      g.fillStyle(0x40404a, 1).fillRect(30, 0, 5, 150);
      g.fillStyle(0x6b4a30, 1).fillRect(26, 148, 22, 62);
      g.fillStyle(0x57391f, 1).fillRect(26, 208, 22, 30);
      g.fillStyle(0x8a6b46, 1).fillEllipse(37, 236, 24, 16);
      g.fillStyle(0x3f3f48, 1).fillRect(22, 150, 8, 34);
    });
  }

  private makeCrosshairs(): void {
    const C = 96;
    const m = C / 2;
    this.tex(CROSSHAIR_KEYS['ring'], C, C, (g) => {
      g.lineStyle(5, 0xffffff, 1).strokeCircle(m, m, 30);
      g.lineStyle(2, 0xdddddd, 1).strokeCircle(m, m, 24);
    });
    this.tex(CROSSHAIR_KEYS['dot'], C, C, (g) => {
      g.fillStyle(0xffffff, 1).fillCircle(m, m, 6);
    });
    this.tex(CROSSHAIR_KEYS['cross'], C, C, (g) => {
      g.lineStyle(5, 0xffffff, 1);
      g.lineBetween(m, m - 34, m, m - 12).lineBetween(m, m + 12, m, m + 34);
      g.lineBetween(m - 34, m, m - 12, m).lineBetween(m + 12, m, m + 34, m);
    });
    this.tex(CROSSHAIR_KEYS['feather'], C, C, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(m, m, 44, 16);
      g.lineStyle(3, 0xcccccc, 1).lineBetween(m - 24, m + 12, m + 24, m - 10);
      g.lineStyle(4, 0xffffff, 1).strokeCircle(m, m, 34);
    });
    this.tex(CROSSHAIR_KEYS['owl'], C, C, (g) => {
      g.lineStyle(4, 0xffffff, 1).strokeCircle(m - 14, m, 14).strokeCircle(m + 14, m, 14);
      g.fillStyle(0xffffff, 1).fillCircle(m - 14, m, 3).fillCircle(m + 14, m, 3);
      g.fillTriangle(m, m + 6, m - 7, m + 18, m + 7, m + 18);
      g.lineStyle(3, 0xffffff, 1).lineBetween(m - 26, m - 18, m - 16, m - 26).lineBetween(m + 26, m - 18, m + 16, m - 26);
    });
  }

  private makeSky(): void {
    (Object.keys(MAPS) as MapId[]).forEach((id) => {
      const pal = MAPS[id].palette;
      const key = `sky_${id}`;
      const t = this.textures.createCanvas(key, 8, 256);
      if (!t) return;
      const ctx = t.getContext();
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, pal.skyTop);
      grad.addColorStop(1, pal.skyBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 8, 256);
      t.refresh();
    });
  }

  private makeAnimations(): void {
    for (const kind of ANIMATED_BIRDS) {
      if (this.anims.exists(flapAnim(kind))) continue;
      this.anims.create({
        key: flapAnim(kind),
        frames: [
          { key: birdKey(kind, 0) },
          { key: birdKey(kind, 1) },
          { key: birdKey(kind, 2) },
          { key: birdKey(kind, 1) },
        ],
        frameRate: kind === 'swift' || kind === 'storm' ? 18 : 11,
        repeat: -1,
      });
    }
  }

  // ------------------------------------------------ helpers

  private tex(
    key: string,
    w: number,
    h: number,
    draw: (g: Phaser.GameObjects.Graphics) => void,
  ): void {
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    draw(g);
    g.generateTexture(key, Math.max(2, w), Math.max(2, h));
    g.destroy();
  }

  private radial(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number): void {
    const steps = 14;
    for (let i = steps; i >= 1; i--) {
      g.fillStyle(color, 0.16 * (i / steps));
      g.fillCircle(x, y, (r * i) / steps);
    }
    g.fillStyle(color, 0.95);
    g.fillCircle(x, y, Math.max(1, r * 0.16));
  }
}
