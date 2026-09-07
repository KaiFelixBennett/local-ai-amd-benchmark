/**
 * Boot-Szene: erzeugt alle prozeduralen Texturen, versteckt den Splash
 * und startet die Menüszene.
 */
import Phaser from 'phaser';
import { initAllTextures } from '../textures';
import { audio } from '../state';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    initAllTextures(this);
    const splash = document.getElementById('boot-splash');
    if (splash) splash.classList.add('hidden');

    // Audio erst nach Benutzergeste; hier nur vorbereiten.
    this.input.once('pointerdown', () => audio.ensure(), { once: true });

    this.scene.start('menu');
  }
}
