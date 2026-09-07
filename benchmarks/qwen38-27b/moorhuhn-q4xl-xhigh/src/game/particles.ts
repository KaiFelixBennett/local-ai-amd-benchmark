/**
 * Partikel-Manager: zentraler Zugriff auf Phaser-Particle-Emitter mit
 * Pooling-ähnlichem Verhalten (Emitter werden wiederverwendet),
 * Dichte-Einstellung und Begrenzung.
 */
import Phaser from 'phaser';

/**
 * Verpackt eine Geom-Form als Phaser-RandomZoneSource. Der 3.90er Typ
 * verlangt `getRandomPoint(point: Vector2Like): void` (In-Place-Mutation),
 * die Geom-Shapes liefern aber ein eigenes Point-Objekt zurück.
 */
function randomZoneSource(shape: {
  getRandomPoint(p: Phaser.Geom.Point): Phaser.Geom.Point;
}): Phaser.Types.GameObjects.Particles.RandomZoneSource {
  return {
    getRandomPoint: (p: Phaser.Types.Math.Vector2Like): void => {
      const out = shape.getRandomPoint(new Phaser.Geom.Point());
      p.x = out.x;
      p.y = out.y;
    },
  };
}

export class ParticleManager {
  private scene: Phaser.Scene;
  private density = 0.8;
  private reducedMotion = false;
  private emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private fxGroup: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, fxGroup: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.fxGroup = fxGroup;
    void this.fxGroup; // Partikel fliegen direkt in die Szene (einfacher, schneller)
  }

  setDensity(d: number): void {
    this.density = Math.max(0, Math.min(1, d));
  }

  setReducedMotion(v: boolean): void {
    this.reducedMotion = v;
  }

  private count(base: number): number {
    return Math.round(base * this.density * (this.reducedMotion ? 0.5 : 1));
  }

  /** Federn bei Treffer. */
  feathers(x: number, y: number, color: string, n = 10): void {
    const count = this.count(n);
    if (count <= 0) return;
    const em = this.scene.add.particles(x, y, `feather_${color}`, {
      speed: { min: 40, max: 180 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0.2 },
      rotate: { min: 0, max: 360 },
      gravityY: 160,
      lifespan: { min: 600, max: 1100 },
      alpha: { start: 1, end: 0 },
      quantity: count,
      emitZone: new Phaser.GameObjects.Particles.Zones.RandomZone(
        randomZoneSource(new Phaser.Geom.Circle(x, y, 8)),
      ),
    });
    em.explode(count, x, y);
    this.track(em);
  }

  /** Trefferblitz. */
  hitFlash(x: number, y: number, glow: 'white' | 'gold' | 'red' | 'blue' | 'green' = 'white'): void {
    if (this.reducedMotion) return;
    const em = this.scene.add.particles(x, y, `fx_glow_${glow}`, {
      scale: { start: 1.6, end: 0.2 },
      lifespan: 220,
      alpha: { start: 0.9, end: 0 },
      quantity: 1,
      speed: 0,
    });
    em.explode(1, x, y);
    this.track(em);
  }

  /** Mündungsfeuer. */
  muzzle(x: number, y: number): void {
    if (this.reducedMotion) return;
    const em = this.scene.add.particles(x, y, 'fx_muzzle', {
      scale: { start: 1.4, end: 0.3 },
      lifespan: 110,
      alpha: { start: 1, end: 0 },
      quantity: 1,
      speed: 0,
    });
    em.explode(1, x, y);
    this.track(em);
    const sparks = this.scene.add.particles(x, y, 'fx_spark', {
      speed: { min: 120, max: 320 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.8, end: 0.1 },
      lifespan: { min: 80, max: 180 },
      alpha: { start: 1, end: 0 },
      quantity: this.count(6),
    });
    sparks.explode(this.count(6), x, y);
    this.track(sparks);
  }

  /** Rauch. */
  smoke(x: number, y: number, n = 6): void {
    const count = this.count(n);
    if (count <= 0) return;
    const em = this.scene.add.particles(x, y, 'fx_smoke', {
      speed: { min: 10, max: 40 },
      angle: { min: 220, max: 320 },
      scale: { start: 0.6, end: 1.6 },
      lifespan: { min: 500, max: 900 },
      alpha: { start: 0.35, end: 0 },
      gravityY: -20,
      quantity: count,
    });
    em.explode(count, x, y);
    this.track(em);
  }

  /** Wasser-Spritzer. */
  splash(x: number, y: number): void {
    const em = this.scene.add.particles(x, y, 'fx_drop', {
      speed: { min: 60, max: 200 },
      angle: { min: 250, max: 290 },
      scale: { start: 1.2, end: 0.5 },
      gravityY: 500,
      lifespan: { min: 300, max: 600 },
      alpha: { start: 0.9, end: 0 },
      quantity: this.count(12),
    });
    em.explode(this.count(12), x, y);
    this.track(em);
  }

  /** Sporenwolke. */
  spores(x: number, y: number): void {
    const em = this.scene.add.particles(x, y, 'fx_glow_green', {
      speed: { min: 10, max: 60 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.2, end: 2.2 },
      lifespan: { min: 800, max: 1600 },
      alpha: { start: 0.5, end: 0 },
      quantity: this.count(14),
    });
    em.explode(this.count(14), x, y);
    this.track(em);
  }

  /** Konfetti / Federschauer bei guten Rängen. */
  confetti(x: number, y: number, n = 40): void {
    const count = this.count(n);
    if (count <= 0) return;
    const colors = ['orange', 'teal', 'gold', 'pink', 'green', 'violet'];
    for (let i = 0; i < count / 4; i++) {
      const color = colors[i % colors.length];
      const em = this.scene.add.particles(x, y, `feather_${color}`, {
        speed: { min: 100, max: 420 },
        angle: { min: 200, max: 340 },
        scale: { start: 1.2, end: 0.4 },
        rotate: { min: -540, max: 540 },
        gravityY: 380,
        lifespan: { min: 1400, max: 2600 },
        alpha: { start: 1, end: 0 },
        quantity: Math.max(1, Math.round(count / 4)),
      });
      em.explode(Math.max(1, Math.round(count / 4)), x, y);
      this.track(em);
    }
  }

  /** Goldschimmer für seltene Ziele (kontinuierlich). */
  sparkle(x: number, y: number): void {
    const em = this.scene.add.particles(x, y, 'fx_glow_gold', {
      speed: { min: 4, max: 16 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.5, end: 0.1 },
      lifespan: { min: 400, max: 800 },
      alpha: { start: 0.7, end: 0 },
      frequency: 90,
      maxParticles: this.count(8),
    });
    em.setPosition(x, y);
    this.track(em, 2500);
  }

  /** Regen-Ströme (kontinuierlich, für Sturm/Regenfront). */
  rain(startX: number, w: number, _h: number, intensity: number): void {
    const em = this.scene.add.particles(0, 0, 'fx_drop', {
      speedY: { min: 700, max: 1100 },
      speedX: { min: -120, max: 60 },
      scale: { start: 1, end: 0.6 },
      lifespan: 900,
      alpha: { start: 0.5 * intensity, end: 0.2 * intensity },
      rotate: { min: 80, max: 85 },
      emitZone: new Phaser.GameObjects.Particles.Zones.RandomZone(
        randomZoneSource(new Phaser.Geom.Rectangle(0, -40, w, 40)),
      ),
      frequency: Math.max(12, Math.round(40 / intensity)),
      maxParticles: Math.round(120 * intensity * this.density),
    });
    em.setPosition(startX, 0);
    this.track(em, 60000);
  }

  /** Glühwürmchen (kontinuierlich, Mondbruch). */
  fireflies(w: number, h: number): void {
    const em = this.scene.add.particles(0, 0, 'fx_glow_green', {
      speed: { min: 8, max: 30 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.3, end: 0.55 },
      lifespan: { min: 3000, max: 6000 },
      alpha: { start: 0.8, end: 0 },
      rotate: 0,
      emitZone: new Phaser.GameObjects.Particles.Zones.RandomZone(
        randomZoneSource(new Phaser.Geom.Rectangle(0, h * 0.45, w, h * 0.5)),
      ),
      frequency: 350,
      maxParticles: Math.round(18 * this.density),
    });
    em.setPosition(0, 0);
    this.track(em, 60000);
  }

  private track(em: Phaser.GameObjects.Particles.ParticleEmitter, ttlMs?: number): void {
    this.emitters.push(em);
    if (this.emitters.length > 24) {
      const old = this.emitters.splice(0, this.emitters.length - 24);
      for (const e of old) e.destroy();
    }
    if (ttlMs !== undefined) {
      this.scene.time.delayedCall(ttlMs, () => {
        const i = this.emitters.indexOf(em);
        if (i >= 0) this.emitters.splice(i, 1);
        if (!this.scene.sys.isActive()) return;
        em.destroy();
      });
    } else {
      this.scene.time.delayedCall(3200, () => {
        const i = this.emitters.indexOf(em);
        if (i >= 0) this.emitters.splice(i, 1);
        if (!this.scene.sys.isActive()) return;
        em.destroy();
      });
    }
  }

  /** Aktivierung von Emitter-Bereinigungen am Rundenende. */
  clearAll(): void {
    for (const em of this.emitters) {
      try {
        em.destroy();
      } catch {
        /* ignore */
      }
    }
    this.emitters = [];
  }

  get activeCount(): number {
    return this.emitters.length;
  }
}
