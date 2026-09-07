import Phaser from 'phaser';
import { Target } from './Target';
import type { TargetConfig } from '../core/types';
import type { TrajectoryParams } from '../systems/TrajectorySystem';

/**
 * Object pool for Target instances. Avoids allocating/destroying GameObjects
 * every spawn, which matters at high spawn rates (Blitz/Featherstorm).
 */
export class TargetPool {
  private scene: Phaser.Scene;
  private pool: Target[] = [];
  private active = new Set<Target>();

  constructor(scene: Phaser.Scene, initialSize = 16) {
    this.scene = scene;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createInstance());
    }
  }

  private createInstance(): Target {
    const target = new Target(this.scene);
    target.onDespawn = (t) => {
      this.active.delete(t);
      this.pool.push(t);
    };
    return target;
  }

  spawn(config: TargetConfig, params: TrajectoryParams, now: number): Target {
    const target = this.pool.pop() ?? this.createInstance();
    target.spawn(config, params, now);
    this.active.add(target);
    return target;
  }

  getActive(): Target[] {
    return Array.from(this.active);
  }

  activeCount(): number {
    return this.active.size;
  }

  despawnAll(): void {
    for (const target of Array.from(this.active)) {
      target.despawn('expired');
    }
  }

  destroy(): void {
    this.despawnAll();
    for (const target of this.pool) target.destroy();
    this.pool = [];
  }
}
