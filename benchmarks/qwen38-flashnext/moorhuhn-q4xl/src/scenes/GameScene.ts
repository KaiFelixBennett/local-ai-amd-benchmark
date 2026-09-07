import Phaser from 'phaser';
import { bus } from '../core/EventBus';
import { getSettings, loadSave } from '../core/Save';
import { MODES } from '../config/modes';
import { MAPS } from '../config/maps';
import type { AudioManager } from '../audio/AudioManager';
import { takeRunConfig } from '../app/RunConfig';
import type { RunConfig } from '../app/RunConfig';
import { Backdrop } from './Backdrop';
import { EnvView } from './game/EnvView';
import { Flock } from './game/Flock';
import { Fx } from './game/Fx';
import { RoundController } from './game/RoundController';
import { CROSSHAIR_KEYS, DESIGN_H, DESIGN_W, TEX } from './tex';

/**
 * The gameplay scene: owns the view objects and forwards player input to the
 * (Phaser-free) RoundController. Deliberately thin — all round logic lives in
 * RoundController and the pure systems behind it.
 */
export class GameScene extends Phaser.Scene {
  private controller!: RoundController;
  private flock!: Flock;
  private env!: EnvView;
  private fx!: Fx;
  private backdrop!: Backdrop;
  private gun!: Phaser.GameObjects.Image;
  private crosshair!: Phaser.GameObjects.Image;

  private aimX = DESIGN_W / 2;
  private aimY = DESIGN_H * 0.4;
  private aimAngle = 0;
  private reloadTilt = 0;
  private recoilKick = 0;
  private prevAmmo = -1;
  private prevStatus = '';
  private disposers: Array<() => void> = [];

  constructor() {
    super('Game');
  }

  private get audio(): AudioManager {
    return this.registry.get('audio') as AudioManager;
  }

  init(): void {
    // a run must be configured via startRun(); fall back to classic for the
    // rare case the scene is started directly (e.g. hot-reload).
    this.runCfg = takeRunConfig() ?? {
      mode: 'classic',
      map: 'nebelmoor',
      seed: (Date.now() % 2147483647) | 0,
    };
  }

  private runCfg: RunConfig = { mode: 'classic', map: 'nebelmoor', seed: 1 };

  create(): void {
    const cfg = this.runCfg;
    const mode = MODES[cfg.mode];
    const map = MAPS[cfg.map];
    const settings = getSettings();

    this.backdrop = new Backdrop(this, map, DESIGN_W, DESIGN_H);
    this.env = new EnvView(this, map, DESIGN_W, DESIGN_H, loadSave().progress.hiddenFound[cfg.map] ?? []);
    this.flock = new Flock(this);
    this.fx = new Fx(this, settings);

    const progress = loadSave().progress;
    const xhKey =
      CROSSHAIR_KEYS[progress.activeCrosshair as keyof typeof CROSSHAIR_KEYS] ?? CROSSHAIR_KEYS.ring;
    this.crosshair = this.add
      .image(DESIGN_W / 2, DESIGN_H / 2, xhKey)
      .setDepth(200)
      .setScale(settings.crosshairSize)
      .setTint(hexToNumber(settings.crosshairColor));

    this.gun = this.add
      .image(DESIGN_W / 2, DESIGN_H + 78, TEX.gun)
      .setOrigin(0.5, 1)
      .setDepth(40)
      .setTint(WEAPON_TINTS[progress.activeWeapon] ?? 0xffffff);

    this.input.mouse?.disableContextMenu();
    if (this.game.canvas) this.game.canvas.style.cursor = 'none';

    // ---- input ----
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.aimX = p.x;
      this.aimY = p.y;
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      bus.emit('audio:unlock', undefined);
      this.aimX = p.x;
      this.aimY = p.y;
      if (this.controller.isOver) return;
      if (p.rightButtonDown()) {
        this.controller.reload();
        return;
      }
      if (p.leftButtonDown()) {
        if (getSettings().leftCanFire) this.controller.fire(p.x, p.y);
        else this.controller.reload();
      }
    });
    this.input.on('wheel', () => this.controller.reload());

    const onKey = (e: KeyboardEvent): void => {
      const s = getSettings();
      if (e.code === s.keyReload) this.controller.reload();
      else if (e.code === s.keyPause) this.controller.setPaused(!this.controller.isPaused);
    };
    window.addEventListener('keydown', onKey);
    this.disposers.push(() => window.removeEventListener('keydown', onKey));

    // ---- controller ----
    this.controller = new RoundController({
      scene: this,
      w: DESIGN_W,
      h: DESIGN_H,
      mode,
      map,
      seed: cfg.seed,
      audio: this.audio,
      settings,
      flock: this.flock,
      env: this.env,
      fx: this.fx,
      backdrop: this.backdrop,
      tutorial: cfg.tutorial,
    });

    this.audio.setAmbient(map.ambientKey);
    this.audio.setMood(map.palette.night ? 'calm' : 'normal');

    // ---- bus wiring (pause menu lives in the DOM layer) ----
    this.disposers.push(
      bus.on('round:resume', () => this.controller.setPaused(false)),
      bus.on('round:quit', () => this.controller.quit()),
      bus.on('settings:changed', () => {
        const s = getSettings();
        this.controller.onSettingsChanged(s);
        const key =
          CROSSHAIR_KEYS[loadSave().progress.activeCrosshair as keyof typeof CROSSHAIR_KEYS] ??
          CROSSHAIR_KEYS.ring;
        this.crosshair.setTexture(key);
        this.crosshair.setTint(hexToNumber(s.crosshairColor));
        this.crosshair.setScale(s.crosshairSize);
      }),
      bus.on('hud:ammo', ({ ammo, status }) => {
        if (this.prevAmmo >= 0 && ammo < this.prevAmmo) this.kickRecoil();
        const reloading = status === 'reloading' || status === 'empty';
        if (reloading && this.prevStatus !== 'reloading' && this.prevStatus !== 'empty') this.startReloadAnim();
        if (!reloading && (this.prevStatus === 'reloading' || this.prevStatus === 'empty')) this.endReloadAnim();
        this.prevAmmo = ammo;
        this.prevStatus = status;
      }),
    );
  }

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.controller.update(dt);
    this.drawAim(dt);

    if (import.meta.env.DEV) {
      (window as unknown as { __mmDebug?: unknown }).__mmDebug = this.controller.debugInfo();
    }
  }

  // ---------- gun / crosshair feel ----------

  private drawAim(dt: number): void {
    this.crosshair.setPosition(this.aimX, this.aimY);
    const pivotX = DESIGN_W / 2 + (this.aimX - DESIGN_W / 2) * 0.35;
    const pivotY = DESIGN_H + 78;
    this.aimAngle = Math.atan2(this.aimX - pivotX, -(this.aimY - pivotY));
    this.gun.x = pivotX;
    this.gun.rotation = this.aimAngle + this.reloadTilt;
    this.gun.y = pivotY + this.recoilKick + this.reloadDip;
    // decay recoil
    this.recoilKick = Math.max(0, this.recoilKick - dt * 400);
  }

  private reloadDip = 0;

  private kickRecoil(): void {
    this.recoilKick = 16;
  }

  private startReloadAnim(): void {
    this.tweens.add({ targets: this, reloadTilt: -0.62, reloadDip: 34, duration: 260, yoyo: false });
  }

  private endReloadAnim(): void {
    this.tweens.add({ targets: this, reloadTilt: 0, reloadDip: 0, duration: 200 });
  }

  shutdown(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    if (this.game.canvas) this.game.canvas.style.cursor = '';
    this.controller?.destroy();
    this.fx?.destroy();
    this.env?.destroy();
    this.flock?.destroy();
  }
}

function hexToNumber(css: string): number {
  const n = parseInt(css.replace('#', ''), 16);
  return Number.isFinite(n) ? n : 0xffe66d;
}

/** cosmetic weapon skins = tints on the procedural gun sprite */
const WEAPON_TINTS: Record<string, number> = {
  oak: 0xffffff,
  brass: 0xd9a441,
  moon: 0xbfd4ff,
  storm: 0x8a97ab,
};
