import { SeededRng } from '../core/SeededRng';
import { TARGET_TYPES, ENVIRONMENTS } from '../types';
import type {
  TargetTypeId,
  GameMode,
  Environment,
  SpawnEntry,
  FlightPathType,
  WeatherType,
  EventTypeId,
} from '../types';

export class SpawnDirector {
  private rng: SeededRng;
  private mode: GameMode;
  private environment: Environment;
  private difficultyFactor: number = 1.0;
  private activeEvent: EventTypeId | null = null;
  private elapsed: number = 0;
  private nextSpawnTime: number = 0;
  private spawnQueue: SpawnEntry[] = [];
  private width: number;
  private height: number;

  constructor(seed: number, mode: GameMode, environment: Environment, w: number, h: number) {
    this.rng = new SeededRng(seed);
    this.mode = mode;
    this.environment = environment;
    this.width = w;
    this.height = h;
  }

  setDifficulty(factor: number): void {
    this.difficultyFactor = factor;
  }

  setEvent(event: EventTypeId | null): void {
    this.activeEvent = event;
    if (event === 'golden_swarm') {
      this.spawnGoldenSwarm();
    } else if (event === 'mass_reed_spawn') {
      this.spawnMassReed();
    } else if (event === 'featherstorm') {
      this.spawnFeatherstorm();
    }
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (this.elapsed >= this.nextSpawnTime) {
      this.processSpawns();
    }
  }

  private getBaseInterval(): number {
    // Base spawn interval in ms
    const base = 1200;
    const modeMult = this.mode.spawnRateMultiplier;
    const diffMult = 1 / this.difficultyFactor;
    return base * modeMult * diffMult;
  }

  private getAvailableTargets(): TargetTypeId[] {
    const weather = this.environment.weatherType;
    return TARGET_TYPES.filter(t => {
      if (t.isWeatherDependent && t.requiredWeather !== weather) return false;
      return true;
    }).map(t => t.id);
  }

  private pickTargetType(): TargetTypeId {
    const available = this.getAvailableTargets();
    const weights = available.map(id => {
      const cfg = TARGET_TYPES.find(t => t.id === id)!;
      let w = cfg.spawnWeight;
      // Adjust weights based on difficulty
      if (cfg.isRare) w *= 0.5;
      if (cfg.isDecoy) w *= this.difficultyFactor;
      if (cfg.speed > 200) w *= this.difficultyFactor;
      return w;
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = this.rng.range(0, totalWeight);
    for (let i = 0; i < available.length; i++) {
      r -= weights[i];
      if (r <= 0) return available[i];
    }
    return available[0];
  }

  private pickFlightPath(targetType: TargetTypeId): FlightPathType {
    const cfg = TARGET_TYPES.find(t => t.id === targetType)!;
    const paths = cfg.flightPath ? [cfg.flightPath] : ['linear', 'sine', 'bezier'];
    // Add variety based on difficulty
    if (this.difficultyFactor > 1.2) {
      paths.push('zigzag', 'spiral');
    }
    return this.rng.pick(paths) as FlightPathType;
  }

  private pickEdge(): 'left' | 'right' | 'top' | 'bottom' {
    const edges: Array<'left' | 'right' | 'top' | 'bottom'> = ['left', 'right', 'top', 'bottom'];
    return this.rng.pick(edges);
  }

  private processSpawns(): void {
    const count = this.rng.int(1, Math.ceil(2 * this.difficultyFactor));
    const interval = this.getBaseInterval();

    for (let i = 0; i < count; i++) {
      const targetType = this.pickTargetType();
      const cfg = TARGET_TYPES.find(t => t.id === targetType)!;
      const fromEdge = this.pickEdge();

      // Determine opposite edge for direction
      const oppositeEdges: Record<string, Array<'left' | 'right' | 'top' | 'bottom'>> = {
        left: ['right', 'top-right', 'bottom-right'] as any,
        right: ['left', 'top-left', 'bottom-left'] as any,
        top: ['bottom', 'bottom-left', 'bottom-right'] as any,
        bottom: ['top', 'top-left', 'top-right'] as any,
      };

      this.spawnQueue.push({
        targetType,
        count: cfg.isSwarm ? cfg.swarmSize : 1,
        path: this.pickFlightPath(targetType),
        fromEdge,
        toEdge: this.pickEdge(),
        delay: i * interval,
        speed: cfg.speed * (0.8 + this.rng.range(0, 0.4)) * this.difficultyFactor,
        amplitude: this.rng.range(50, 200),
        frequency: this.rng.range(1, 4),
      });
    }

    this.nextSpawnTime = this.elapsed + interval * (0.5 + this.rng.range(0, 1));
  }

  private spawnGoldenSwarm(): void {
    for (let i = 0; i < 5; i++) {
      this.spawnQueue.push({
        targetType: 'goldschnabel',
        count: 1,
        path: 'bezier',
        fromEdge: this.pickEdge(),
        toEdge: this.pickEdge(),
        delay: i * 800,
        speed: 180,
        amplitude: 100,
        frequency: 2,
      });
    }
  }

  private spawnMassReed(): void {
    for (let i = 0; i < 8; i++) {
      this.spawnQueue.push({
        targetType: this.rng.pick(['moorflatterer', 'schnellfeder', 'schwarmvogel']),
        count: 1,
        path: 'dive',
        fromEdge: 'bottom',
        toEdge: 'top',
        delay: i * 200,
        speed: 200 + this.rng.range(0, 100),
        amplitude: 80,
        frequency: 3,
      });
    }
  }

  private spawnFeatherstorm(): void {
    for (let i = 0; i < 15; i++) {
      const types: TargetTypeId[] = ['moorflatterer', 'schnellfeder', 'korkenzieher', 'kurvensegler'];
      this.spawnQueue.push({
        targetType: this.rng.pick(types),
        count: 1,
        path: this.rng.pick(['sine', 'spiral', 'zigzag', 'linear']),
        fromEdge: this.pickEdge(),
        toEdge: this.pickEdge(),
        delay: i * 150,
        speed: 250 + this.rng.range(0, 150),
        amplitude: 150,
        frequency: 3,
      });
    }
  }

  getPendingSpawns(): SpawnEntry[] {
    const now = this.elapsed;
    const pending = this.spawnQueue.filter(s => s.delay <= now);
    this.spawnQueue = this.spawnQueue.filter(s => s.delay > now);
    return pending;
  }

  getElapsed(): number {
    return this.elapsed;
  }

  reset(): void {
    this.elapsed = 0;
    this.nextSpawnTime = 0;
    this.spawnQueue = [];
  }
}
