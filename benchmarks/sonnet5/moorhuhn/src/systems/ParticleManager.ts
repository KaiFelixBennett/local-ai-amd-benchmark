import Phaser from 'phaser';

export interface ParticleBurstConfig {
  speed?: [number, number];
  scale?: [number, number];
  lifespan?: number;
  gravityY?: number;
  angle?: [number, number];
  alpha?: [number, number];
  rotate?: [number, number];
  tint?: number;
}

/**
 * Thin wrapper over Phaser's particle emitters that (a) respects the
 * player's particle-density setting, (b) reuses one emitter per texture
 * instead of creating/destroying GameObjects every burst, and (c) exposes
 * semantic helpers (feathers, dust, sparks, ...) instead of raw configs
 * scattered across scene code.
 */
export class ParticleManager {
  private scene: Phaser.Scene;
  private emitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();
  private density = 1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setDensity(density01: number): void {
    this.density = Math.min(1, Math.max(0, density01));
  }

  private getEmitter(texture: string, cfg: ParticleBurstConfig, depth: number): Phaser.GameObjects.Particles.ParticleEmitter {
    const key = `${texture}_${depth}`;
    let emitter = this.emitters.get(key);
    if (!emitter) {
      emitter = this.scene.add.particles(0, 0, texture, {
        speed: { min: cfg.speed?.[0] ?? 60, max: cfg.speed?.[1] ?? 180 },
        scale: { start: cfg.scale?.[0] ?? 1, end: cfg.scale?.[1] ?? 0.2 },
        alpha: { start: cfg.alpha?.[0] ?? 1, end: cfg.alpha?.[1] ?? 0 },
        lifespan: cfg.lifespan ?? 700,
        gravityY: cfg.gravityY ?? 260,
        angle: cfg.angle ? { min: cfg.angle[0], max: cfg.angle[1] } : { min: 0, max: 360 },
        rotate: cfg.rotate ? { min: cfg.rotate[0], max: cfg.rotate[1] } : undefined,
        tint: cfg.tint,
        emitting: false,
      });
      emitter.setDepth(depth);
      this.emitters.set(key, emitter);
    }
    return emitter;
  }

  private burst(
    texture: string,
    x: number,
    y: number,
    count: number,
    cfg: ParticleBurstConfig = {},
    depth = 500,
  ): void {
    const n = Math.max(0, Math.round(count * this.density));
    if (n <= 0) return;
    const emitter = this.getEmitter(texture, cfg, depth);
    emitter.explode(n, x, y);
  }

  feathers(x: number, y: number, count = 10, tint?: number): void {
    this.burst('particle_feather', x, y, count, {
      speed: [80, 260],
      scale: [1.1, 0.3],
      lifespan: 900,
      gravityY: 200,
      rotate: [0, 360],
      tint,
    });
  }

  dust(x: number, y: number, count = 6): void {
    this.burst('particle_dust', x, y, count, { speed: [30, 90], scale: [1, 0.1], lifespan: 500, gravityY: 60 });
  }

  spark(x: number, y: number, count = 8): void {
    this.burst('particle_spark', x, y, count, {
      speed: [120, 320],
      scale: [1, 0.1],
      lifespan: 350,
      gravityY: 0,
    });
  }

  smoke(x: number, y: number, count = 4): void {
    this.burst('particle_smoke', x, y, count, {
      speed: [10, 40],
      scale: [0.6, 1.6],
      lifespan: 700,
      gravityY: -40,
      alpha: [0.5, 0],
    });
  }

  waterSplash(x: number, y: number, count = 10): void {
    this.burst('particle_water', x, y, count, {
      speed: [60, 200],
      scale: [1, 0.2],
      lifespan: 500,
      gravityY: 400,
      angle: [200, 340],
    });
  }

  leaf(x: number, y: number, count = 3): void {
    this.burst('particle_leaf', x, y, count, {
      speed: [20, 60],
      scale: [1, 0.6],
      lifespan: 1600,
      gravityY: 40,
      rotate: [0, 360],
    });
  }

  confetti(x: number, y: number, count = 40): void {
    this.burst(
      'particle_confetti',
      x,
      y,
      count,
      { speed: [100, 320], scale: [1, 0.6], lifespan: 1800, gravityY: 220, rotate: [0, 360] },
      900,
    );
  }

  glowPop(x: number, y: number, count = 1): void {
    this.burst('particle_glow', x, y, count, { speed: [0, 0], scale: [0.3, 2.2], lifespan: 350, gravityY: 0 });
  }

  ring(x: number, y: number): void {
    this.burst('particle_ring', x, y, 1, { speed: [0, 0], scale: [0.4, 2.6], lifespan: 400, gravityY: 0 });
  }

  destroy(): void {
    for (const emitter of this.emitters.values()) emitter.destroy();
    this.emitters.clear();
  }
}
