/**
 * Ziel-Entität: verpackt ein Phaser-Sprite mit Flugbahn, Hitbox, HP,
 * Humor-Reaktion und Pooling-freundlichem Verhalten.
 */
import Phaser from 'phaser';
import type { TargetConfig } from '../config/gameConfig';
import { isOffscreen, samplePath, type PathInstance } from './paths';
import { Rng } from '../core/rng';
import { FEATHER_NAMES } from './textures';

export class TargetEntity extends Phaser.GameObjects.Sprite {
  readonly cfg: TargetConfig;
  readonly path: PathInstance;
  /** Spawn-Zeitstempel (ms, Phaser-Clock) – wird von außen gesetzt. */
  spawnAt: number;
  /** Flug-Tiefe 0.5..1.5 — bewusst KEIN Phaser-Accessor (`depth`),
   *  damit die Z-Render-Tiefe und die Welt-Tiefe nicht kollidieren. */
  flightDepth: number;
  hp: number;
  alive = true;
  /** Für Schwarm: Gruppen-ID. */
  groupId: number | null = null;
  /** Boss-Flag + Phase. */
  isBoss: boolean;
  bossPhase = 0;
  /** Nebelflüsterer: Sichtbarkeit. */
  visibleAlpha = 1;
  /** Illusion (Nachtgeflüster). */
  isIllusion = false;
  /** War das Ziel via Umgebung/Event gespawnt (Trickshot-Bonus)? */
  trick = false;
  /** Flucht-Modus nach Fehlschuss? */
  fleeing = false;
  private fleeUntil = 0;
  private rng: Rng;
  private vw: number;
  private vh: number;
  private windX = 0;
  /** Letzter Frame, für Reaktions-Animation. */
  private reactTween: Phaser.Tweens.Tween | null = null;

  constructor(
    scene: Phaser.Scene,
    cfg: TargetConfig,
    x: number,
    y: number,
    depth: number,
    path: PathInstance,
    rng: Rng,
    w: number,
    h: number,
  ) {
    super(scene, x, y, cfg.sprite);
    this.cfg = cfg;
    this.path = path;
    this.flightDepth = depth;
    this.hp = cfg.hp;
    this.isBoss = cfg.boss === true;
    this.rng = rng;
    this.vw = w;
    this.vh = h;
    this.spawnAt = performance.now();
    this.setScale(depth * (cfg.size[0] / 72));
    this.setSceneDepthByDepth();
    const initialAnim = this.flapAnimKey();
    this.play(this.scene.anims.get(initialAnim) ? initialAnim : `${cfg.sprite}_flap`, true);
    scene.add.existing(this);
  }

  /** Sprite-Tiefe aus Zieldtiefe: 0.5 (weit) = 10, 1.5 (nah) = 90. */
  setSceneDepthByDepth(): void {
    this.setDepth(Math.round(20 + this.flightDepth * 40));
  }

  setWind(x: number): void {
    this.windX = x;
  }

  /** Update pro Frame. @returns true, wenn beendet (aus dem Feld / getötet). */
  override update(nowMs: number, dt: number): { done: boolean; escaped: boolean } {
    if (!this.alive) return { done: true, escaped: false };

    const t = (nowMs - this.spawnAt) / 1000;
    const sample = samplePath(this.path, t, this.flightDepth, this.vw, this.vh, this.windX);
    const nextSample = samplePath(this.path, t + 0.05, this.flightDepth, this.vw, this.vh, this.windX);

    this.flightDepth = sample.depth;
    const s = sample.depth * (this.cfg.size[0] / 72) * (this.fleeing ? 0.92 : 1);
    this.setScale(s);
    this.x = sample.pos.x;
    this.y = sample.pos.y;

    // Orientierung: Richtung der Bewegung; linksfliegend spiegeln
    const vx = nextSample.pos.x - sample.pos.x;
    const vy = nextSample.pos.y - sample.pos.y;
    if (vx * vx + vy * vy > 0.0001) {
      if (vx < 0) {
        this.setFlipX(true);
        this.setRotation(Math.atan2(vy, -vx));
      } else {
        this.setFlipX(false);
        this.setRotation(Math.atan2(vy, vx));
      }
    }

    this.setSceneDepthByDepth();

    // Flucht beenden
    if (this.fleeing && nowMs > this.fleeUntil) this.fleeing = false;

    // Nebelflüsterer: pulsierende Sichtbarkeit
    if (this.cfg.id === 'nebelfluesterer') {
      const vis = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.8 + this.path.phase));
      this.visibleAlpha = vis;
      this.setAlpha(vis);
    }

    // Boss: Phasen-Animation bei 2/3 und 1/3 HP
    if (this.isBoss) {
      const frac = this.hp / this.cfg.hp;
      const phase = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
      if (phase !== this.bossPhase) {
        this.bossPhase = phase;
        this.react('hit');
      }
    }

    // Ende: außerhalb des Felds (bei hoher Geschwindigkeit großzügigere Marge)
    const margin = 180 + Math.min(240, this.path.speed * 0.4);
    if (isOffscreen({ x: this.x, y: this.y }, this.vw, this.vh, margin)) {
      return { done: true, escaped: true };
    }
    void dt;
    return { done: false, escaped: false };
  }

  /** Treffer. @returns true, wenn getötet. */
  damage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.alive = false;
      this.die();
      return true;
    }
    this.react('hit');
    return false;
  }

  /** Flucht auslösen (Tempo hoch, aber ohne Bahn-Schädigung). */
  flee(nowMs: number): void {
    if (this.isBoss || this.fleeing) return;
    this.fleeing = true;
    this.fleeUntil = nowMs + 1200;
    this.path.speed *= 1.8;
  }

  private die(): void {
    this.react('death');
    // Rotation nach unten
    this.scene.tweens.add({
      targets: this,
      angle: this.rotation + 380,
      y: this.y + 260,
      alpha: 0,
      duration: 650,
      ease: 'Cubic.In',
      onComplete: () => {
        this.destroy();
      },
    });
  }

  /** Humorvolle Reaktion. */
  react(kind: 'hit' | 'death'): void {
    if (this.reactTween) this.reactTween.remove();
    if (kind === 'hit') {
      // kurzer Scale-Punch
      this.reactTween = this.scene.tweens.add({
        targets: this,
        scale: this.scale * 1.18,
        duration: 90,
        yoyo: true,
        ease: 'Quad.Out',
      });
    }
    // Panzerpelz/Bosse: Rüstungsstufe/Phase wechseln
    if (this.cfg.id === 'panzerpelz' || this.isBoss) {
      const animKey = this.flapAnimKey();
      if (this.scene.anims.get(animKey)) {
        this.play(animKey, true);
      }
    }
    void kind;
  }

  /** Passender Anim-Key: normale Vögel flap, Rüstungsvögel/Bosse mit Stufe. */
  private flapAnimKey(): string {
    if (this.cfg.id !== 'panzerpelz' && !this.isBoss) return `${this.cfg.sprite}_flap`;
    const stage = this.cfg.id === 'panzerpelz' ? this.armorStage() : this.bossPhase;
    return `${this.cfg.sprite}_flap_s${Math.min(2, Math.max(0, stage))}`;
  }

  /** Rüstungsstufe aus verbliebenen HP. */
  private armorStage(): number {
    const frac = this.hp / Math.max(1, this.cfg.hp);
    return frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
  }

  /** Getroffene Präzision: 0 (Kante) .. 1 (Mitte). */
  precisionAt(px: number, py: number): number {
    const dx = (px - this.x) / (this.width / 2);
    const dy = (py - this.y) / (this.height / 2);
    const d = Math.hypot(dx, dy);
    return Math.max(0, 1 - d / 1.4);
  }

  /** Trefferprüfung. */
  containsPoint(px: number, py: number): boolean {
    const r = Math.max(this.width, this.height) * 0.5 * this.cfg.hitbox * 1.35;
    return Math.hypot(px - this.x, py - this.y) <= r;
  }

  get featherColorName(): string {
    const idx = this.cfg.featherColors.length > 0 ? 0 : 0;
    void idx;
    // Farbe aus Konfig -> nächster Name
    const c = this.cfg.featherColors[0];
    if (c === 0xe8933a) return 'orange';
    if (c === 0x9adcf0) return 'teal';
    if (c === 0xb07ae0) return 'purple';
    if (c === 0x9aa2ad || c === 0x8a8f98) return 'gray';
    if (c === 0xffd23e || c === 0xf5b70a || c === 0xd9b44a) return 'gold';
    if (c === 0xef5350) return 'red';
    if (c === 0x66bb6a) return 'green';
    if (c === 0xff8a65) return 'salmon';
    if (c === 0x78909c) return 'steel';
    if (c === 0xec407a) return 'pink';
    if (c === 0x7c4dff) return 'violet';
    if (c === 0xcfd8dc) return 'white';
    return FEATHER_NAMES[this.rng.int(0, FEATHER_NAMES.length - 1)];
  }

  /** Debug-Info. */
  debugInfo(): string {
    return `${this.cfg.id} hp=${this.hp} d=${this.flightDepth.toFixed(2)}`;
  }
}
