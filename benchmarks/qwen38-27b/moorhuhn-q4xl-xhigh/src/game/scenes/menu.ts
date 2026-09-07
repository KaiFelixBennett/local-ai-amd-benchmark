/**
 * Menü-Szene: ruhiger Moor-Hintergrund (Himmel, Parallax, Vögel) unter
 * den HTML-Overlays. Die eigentlichen Menüs leben in src/ui/ui.ts.
 */
import Phaser from 'phaser';
import { initUi, refreshUi, showMainMenu } from '../../ui/ui';
import { audio, audioVolumes, bootOnce, loadSave, getSettings } from '../state';

export class MenuScene extends Phaser.Scene {
  private birds: Phaser.GameObjects.Sprite[] = [];
  private layers: Phaser.GameObjects.Image[] = [];

  constructor() {
    super('menu');
  }

  create(): void {
    loadSave();
    this.cameras.main.setBackgroundColor(0x141b22);

    const sky = this.add.image(0, 0, 'sky_nebelmoor').setOrigin(0, 0).setDisplaySize(1920, 1080).setDepth(-100);
    void sky;
    this.add.image(960, 780, 'layer_nebelmoor_far').setOrigin(0.5, 1).setDepth(-50);
    const trees = this.add.image(960, 870, 'layer_nebelmoor_trees').setOrigin(0.5, 1).setDepth(-40);
    const reeds = this.add.image(960, 1090, 'layer_nebelmoor_reeds').setOrigin(0.5, 1).setDepth(-30);
    this.layers = [trees, reeds];

    // Deko-Vögel im Hintergrund
    const ids = ['bird_moorflatterer', 'bird_kurvensegler', 'bird_schnellfeder'];
    for (let i = 0; i < 4; i++) {
      const key = ids[i % ids.length];
      const b = this.add
        .sprite(Phaser.Math.Between(200, 1720), Phaser.Math.Between(150, 500), key)
        .setDepth(-20)
        .setAlpha(0.5)
        .setScale(Phaser.Math.FloatBetween(0.5, 0.9));
      b.play(`${key}_flap`, true);
      b.setFlipX(Math.random() > 0.5);
      this.birds.push(b);
    }

    // Vignette für Stimmung
    const vig = this.add.rectangle(960, 540, 1920, 1080, 0x0a0e14, 0.35).setDepth(50);
    this.tweens.add({
      targets: vig,
      alpha: 0.22,
      duration: 3200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    // UI initialisieren
    initUi();
    showMainMenu();

    // Audio nach erster Interaktion
    this.input.once('pointerdown', () => {
      bootOnce();
    });

    // Sprachwechsel → UI neu aufbauen
    window.addEventListener('mm-lang-changed', this.onLangChanged);

    // Debug-Modus (dev-only): F3
    this.input.keyboard?.on('keydown-F3', (e: KeyboardEvent) => {
      e.preventDefault();
      void e;
      this.toggleDebug();
    });
  }

  private onLangChanged = (): void => {
    audio.setVolumes(audioVolumes());
    refreshUi();
  };

  private debugOn = false;
  private debugText: Phaser.GameObjects.Text | null = null;

  private toggleDebug(): void {
    this.debugOn = !this.debugOn;
    if (this.debugOn && !this.debugText) {
      this.debugText = this.add
        .text(12, 12, '', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#00ff88',
          backgroundColor: '#00000088',
          padding: { x: 8, y: 6 },
        })
        .setDepth(900);
    } else if (!this.debugOn) {
      this.debugText?.destroy();
      this.debugText = null;
    }
  }

  override update(time: number, delta: number): void {
    // Vögel schweben sanft
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      const dir = b.flipX ? -1 : 1;
      b.x += dir * delta * 0.03;
      b.y += Math.sin(time / 900 + i) * 0.15;
      if (b.x < -60) {
        b.x = 1980;
        b.setFlipX(true);
      } else if (b.x > 1980) {
        b.x = -60;
        b.setFlipX(false);
      }
    }
    // Parallax driftet langsam
    for (const layer of this.layers) {
      layer.x -= delta * 0.0015;
      if (layer.x < 960 - 1920) layer.x += 1920;
    }
    if (this.debugOn && this.debugText) {
      const s = getSettings();
      this.debugText.setText(
        `menu · lang=${s.lang} · quality=${s.quality} · shake=${s.screenShake}\n` +
          `particles=${s.particleDensity} · hud=${s.hudTheme} · skin=${s.weaponSkin}`,
      );
    }
  }

  shutdown(): void {
    window.removeEventListener('mm-lang-changed', this.onLangChanged);
    this.birds = [];
    this.layers = [];
  }
}
