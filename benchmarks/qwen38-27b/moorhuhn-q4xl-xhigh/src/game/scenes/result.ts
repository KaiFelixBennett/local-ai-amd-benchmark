/**
 * Result-Szene: Rundenabrechnung mit animiertem Punkte-Count-up,
 * Rang-Enthüllung (D–SSS), Statistiken, Freischaltungen und Highscores.
 */
import Phaser from 'phaser';
import { formatScore } from '../../core/scoring';
import { t, tRaw } from '../../core/i18n';
import { audio } from '../state';
import type { RoundResultData } from '../roundTypes';

const RANK_COLORS: Record<string, string> = {
  D: '#9aa2ad',
  C: '#66bb6a',
  B: '#4dd0e1',
  A: '#ffd23e',
  S: '#ff8a65',
  SS: '#ec407a',
  SSS: '#b388ff',
};

export class ResultScene extends Phaser.Scene {
  private resultData!: RoundResultData;
  private displayScore = 0;
  private targetScore = 0;
  private rankText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('result');
  }

  init(data: { data: RoundResultData }): void {
    this.resultData = data.data;
  }

  create(): void {
    const d = this.resultData;
    this.targetScore = d.score;
    this.displayScore = 0;

    const p = this.add.rectangle(0, 0, 1920, 1080, 0x0a0e14, 0.82).setOrigin(0);
    void p;

    // Titel
    this.add
      .text(960, 90, t('result.title'), {
        fontFamily: '"Baloo 2"',
        fontSize: '54px',
        color: '#ffd23e',
      })
      .setOrigin(0.5);

    const modeName = tRaw(`mode.${d.mode}`);
    const mapName = tRaw(`map.${d.mapId}`);
    this.add.text(960, 150, `${modeName} · ${mapName}`, {
      fontFamily: 'Nunito',
      fontSize: '26px',
      color: '#cfd8dc',
    }).setOrigin(0.5);

    if (d.isRecord) {
      const rec = this.add
        .text(960, 205, t('result.newRecord'), {
          fontFamily: '"Baloo 2"',
          fontSize: '30px',
          color: '#69f0ae',
        })
        .setOrigin(0.5)
        .setAlpha(0);
      this.tweens.add({ targets: rec, alpha: 1, duration: 600, delay: 400, yoyo: true, repeat: 3 });
    }

    // Score (Count-up)
    const scoreText = this.add
      .text(960, 300, '0', {
        fontFamily: '"Baloo 2"',
        fontSize: '84px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: this,
      displayScore: this.targetScore,
      duration: 1600,
      ease: 'Cubic.Out',
      onUpdate: () => {
        scoreText.setText(formatScore(Math.round(this.displayScore)));
      },
      onComplete: () => {
        this.revealRank();
      },
    });

    // Statistiken
    const s = d.stats;
    const acc = s.shots > 0 ? Math.round((s.hits / s.shots) * 100) : 0;
    const rows: [string, string][] = [
      [t('result.shots'), `${s.shots}`],
      [t('result.hits'), `${s.hits}`],
      [t('result.accuracy'), `${acc} %`],
      [t('result.perfect'), `${s.perfectHits}`],
      [t('result.maxCombo'), `${s.maxCombo}`],
      [t('result.reaction'), s.avgReactionMs > 0 ? `${s.avgReactionMs} ms` : '–'],
      [t('result.targets'), `${Object.values(s.targetsHit).reduce((a, b) => a + (b ?? 0), 0)}`],
      [t('result.eventBonuses'), `+${s.eventBonuses}`],
    ];
    let y = 420;
    for (const [label, value] of rows) {
      this.add
        .text(620, y, label, { fontFamily: 'Nunito', fontSize: '24px', color: '#9aa2ad' })
        .setOrigin(0, 0.5);
      this.add.text(1010, y, value, { fontFamily: 'Nunito', fontSize: '24px', color: '#ffffff' }).setOrigin(0, 0.5);
      y += 40;
    }

    // XP & Federn
    this.add
      .text(960, y + 16, `+${d.xpGained} XP · +${d.feathersGained} 🪶`, {
        fontFamily: 'Nunito',
        fontSize: '26px',
        color: '#4dd0e1',
      })
      .setOrigin(0.5);

    // Neu freigeschaltet
    if (d.newUnlocks.length > 0) {
      const names = d.newUnlocks.map((u) => tRaw(u)).join(' · ');
      this.add
        .text(960, y + 60, `🔓 ${names}`, { fontFamily: 'Nunito', fontSize: '22px', color: '#69f0ae' })
        .setOrigin(0.5);
    }
    if (d.newAchievements.length > 0) {
      const names = d.newAchievements.map((a) => tRaw(`ach.${a}`)).join(' · ');
      this.add
        .text(960, y + 94, `🏆 ${names}`, { fontFamily: 'Nunito', fontSize: '22px', color: '#ffd23e' })
        .setOrigin(0.5);
    }
    if (d.dailyRecord != null) {
      this.add
        .text(960, y + 128, `${t('daily.record')}: ${formatScore(d.dailyRecord)}`, {
          fontFamily: 'Nunito',
          fontSize: '22px',
          color: '#b388ff',
        })
        .setOrigin(0.5);
    }

    // Buttons (im Canvas, damit sie immer zum Scaled-Layout passen)
    this.createCanvasButton(760, 950, t('result.again'), () => {
      this.scene.start('game', { cfg: { mode: this.resultData.mode, mapId: this.resultData.mapId, seed: this.resultData.seed } });
    });
    this.createCanvasButton(1160, 950, t('result.next'), () => {
      this.scene.start('menu');
    });

    // Rang-Platzhalter (wird beim Reveal gefüllt)
    const rankText = this.add.text(1560, 420, '?', {
      fontFamily: '"Baloo 2"',
      fontSize: '170px',
      color: '#37474f',
    }).setOrigin(0.5).setAlpha(0);
    this.rankText = rankText;

    // Konfetti bei S/SS/SSS
    if (['S', 'SS', 'SSS'].includes(d.rank.grade)) {
      this.time.delayedCall(2000, () => this.confettiBurst());
    }
  }

  /** Kleine Konfetti-Explosion per Graphics-Partikel (ohne Phaser-Particles nötig). */
  private confettiBurst(): void {
    const colors = [0xffd23e, 0xec407a, 0x4dd0e1, 0x69f0ae, 0xb388ff];
    for (let i = 0; i < 50; i++) {
      const g = this.add.graphics().setDepth(200);
      const x = Phaser.Math.Between(300, 1600);
      const y = Phaser.Math.Between(200, 500);
      const size = Phaser.Math.Between(4, 10);
      g.fillStyle(colors[i % colors.length], 1);
      g.fillRect(0, 0, size, size);
      g.setPosition(x, y);
      this.tweens.add({
        targets: g,
        x: x + Phaser.Math.Between(-120, 120),
        y: y + Phaser.Math.Between(200, 420),
        angle: Phaser.Math.Between(180, 720),
        alpha: 0,
        duration: Phaser.Math.Between(1200, 2200),
        ease: 'Cubic.Out',
        onComplete: () => g.destroy(),
      });
    }
  }

  private revealRank(): void {
    const rankText = this.rankText;
    if (!rankText) return;
    const grade = this.resultData.rank.grade;
    rankText.setText(grade);
    rankText.setColor(RANK_COLORS[grade] ?? '#ffffff');
    this.tweens.add({
      targets: rankText,
      alpha: 1,
      scale: 1.15,
      duration: 500,
      ease: 'Back.Out',
    });
    if (['S', 'SS', 'SSS'].includes(grade)) {
      audio.roundEnd();
    }
  }

  /** Canvas-Button mit Hover-Feedback. */
  private createCanvasButton(x: number, y: number, label: string, onClick: () => void): void {
    const g = this.add.graphics().setDepth(300);
    const text = this.add.text(x, y, label, {
      fontFamily: '"Baloo 2"',
      fontSize: '30px',
      color: '#141b22',
    }).setOrigin(0.5).setDepth(301);
    const w = text.width + 64;
    const h = 64;
    const draw = (hover: boolean): void => {
      g.clear();
      g.fillStyle(hover ? 0xffe082 : 0xffd23e, 1);
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 14);
      g.lineStyle(3, hover ? 0xffffff : 0xc9a227, 1);
      g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 14);
    };
    draw(false);
    const zone = this.add.zone(x, y, w, h).setDepth(302).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      draw(true);
      audio.uiHover();
    });
    zone.on('pointerout', () => draw(false));
    zone.on('pointerdown', () => {
      audio.uiClick();
      onClick();
    });
  }

  override update(): void {
    // Kein Update nötig (Abrechnung läuft per Tweens).
  }

  shutdown(): void {
    // Canvas-Buttons werden zusammen mit der Szene zerstört — nichts extra nötig.
  }
}