import Phaser from 'phaser';
import { TextureFactory } from '../gfx/TextureFactory';

/** Generates every procedural texture once, then hands off to the ambient menu background. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    TextureFactory.generateAll(this);
    this.scene.start('MenuBackgroundScene');
  }
}
