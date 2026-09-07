import Phaser from 'phaser';
import type { PathSpec, TargetKind } from '../../core/types';
import { TARGETS } from '../../config/targets';
import { birdKey, flapAnim, ANIMATED_BIRDS } from '../tex';
import { evalPath, evalVelocity, escapeSpec, type PathCtx } from '../../game/paths';

function stageFor(hp: number, max: number): 0 | 1 | 2 {
  const u = hp / Math.max(1, max);
  if (u > 0.66) return 0;
  if (u > 0.33) return 1;
  return 2;
}

/** A single flying target: owns its sprite and flight state. */
export class Bird {
  kind: TargetKind;
  spec: PathSpec;
  groupId: number;
  spawnTime: number;
  visibleAt: number;
  firstSeen = false;
  hp: number;
  x = -400;
  y = -400;
  depth = 0.5;
  speed = 0;
  scaleV = 0.2;
  alive = true;
  fleeing = false;
  damageStaged: boolean;
  /** shot is waiting for this bird to fly into it (slow targets) */
  pendingKill = false;
  private flashT = 0;

  constructor(
    readonly sprite: Phaser.GameObjects.Sprite,
    kind: TargetKind,
    spec: PathSpec,
    groupId: number,
    now: number,
  ) {
    this.kind = kind;
    this.spec = spec;
    this.groupId = groupId;
    this.spawnTime = now;
    this.visibleAt = now;
    this.hp = TARGETS[kind].health;
    this.damageStaged = kind === 'armored' || kind === 'bossArmored';
    this.show(kind);
  }

  get cfg() {
    return TARGETS[this.kind];
  }

  get boss(): boolean {
    return this.kind === 'bossArmored' || this.kind === 'bossAcrobat' || this.kind === 'bossNight';
  }

  /** Reset sprite visuals for a (possibly pooled) kind. */
  show(kind: TargetKind): void {
    this.kind = kind;
    this.hp = TARGETS[kind].health;
    const sp = this.sprite;
    sp.setVisible(true);
    sp.setTexture(birdKey(kind, 0));
    sp.clearTint();
    sp.setAlpha(1);
    sp.setFlipX(false);
    sp.setAngle(0);
    sp.setScale(0.2);
    if (ANIMATED_BIRDS.includes(kind)) sp.play(flapAnim(kind));
    else sp.anims.stop();
  }

  /** advance along the flight path; returns true when the path reports done */
  advance(now: number, ctx: PathCtx, speedScale: number): boolean {
    const localT = Math.max(0, now - this.spawnTime);
    const spec =
      speedScale === 1 ? this.spec : { ...this.spec, speed: (this.spec.speed ?? 220) * speedScale };
    const full: PathCtx = { ...ctx, startClock: this.spawnTime };
    const p = evalPath(spec, localT, full);
    const vel = evalVelocity(spec, localT, full);
    this.x = p.x;
    this.y = p.y;
    this.depth = p.depth;
    this.speed = Math.hypot(vel[0], vel[1]);
    const sp = this.sprite;
    sp.setPosition(this.x, this.y);
    const want = 0.5 + this.depth * 0.9;
    this.scaleV = Phaser.Math.Linear(sp.scaleX, want, Math.min(1, 0.2));
    sp.setScale(this.scaleV);
    if (Math.abs(vel[0]) > 5) sp.setFlipX(vel[0] < 0);
    if (!ANIMATED_BIRDS.includes(this.kind)) {
      sp.setAngle(Phaser.Math.RadToDeg(Phaser.Math.Clamp(vel[1] / 1000, -0.42, 0.42)));
    }
    if (this.kind === 'mist') sp.setAlpha(0.5 + Math.sin(now * 3.1) * 0.28);
    else if (this.kind === 'bossNight') sp.setAlpha(0.85 + Math.sin(now * 2) * 0.1);
    if (this.damageStaged) {
      const key = birdKey(this.kind, stageFor(Math.max(0, this.hp), this.cfg.health));
      if (sp.texture.key !== key) sp.setTexture(key);
    }
    if (!this.firstSeen && this.x > 24 && this.x < ctx.width - 24 && this.y > 8) {
      this.firstSeen = true;
      this.visibleAt = now;
    }
    if (this.flashT > 0) {
      this.flashT -= 1 / 60;
      if (this.flashT <= 0) sp.clearTint();
    }
    return p.done;
  }

  /** Register a pellet hit; returns true when killed. */
  hurt(dmg: number): boolean {
    if (this.flashT <= 0) {
      this.sprite.setTintFill(0xffffff);
      this.flashT = 0.07;
    }
    this.hp -= dmg;
    if (this.damageStaged && this.hp > 0) {
      this.sprite.setTexture(birdKey(this.kind, stageFor(this.hp, this.cfg.health)));
    }
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  /** Re-route onto an evasive escape curve starting now. */
  flee(now: number, dirSign: 1 | -1): void {
    const localNow = Math.max(0, now - this.spawnTime);
    const esc = escapeSpec(this.spec, dirSign);
    const escSpeed = esc.speed ?? 240;
    const travelled = this.speed > 1 ? this.speed * localNow : escSpeed * 0.2;
    this.spec = esc;
    this.spawnTime = now - travelled / escSpeed;
    this.fleeing = true;
  }

  get radiusPx(): number {
    return this.cfg.hitRadius * this.scaleV;
  }

  distanceTo(x: number, y: number): number {
    return Phaser.Math.Distance.Between(x, y, this.x, this.y);
  }

  /** Return visuals to a parked state. */
  release(): void {
    this.alive = false;
    this.fleeing = false;
    this.sprite.setVisible(false);
    this.sprite.anims.stop();
    this.sprite.setScale(0.2);
    this.sprite.setPosition(-400, -400);
  }
}

/**
 * Pooled flock manager. Sprite reuse via a pool; positions come from the pure
 * path evaluator, so gameplay stays deterministic for a given spawn plan.
 */
export class Flock {
  private birds: Bird[] = [];
  private pool: Bird[] = [];

  constructor(private scene: Phaser.Scene) {}

  get list(): readonly Bird[] {
    return this.birds;
  }

  get liveCount(): number {
    return this.birds.length;
  }

  get pooled(): number {
    return this.pool.length;
  }

  /** Debug helper: current on-screen positions of live targets. */
  livePositions(): { x: number; y: number; kind: string }[] {
    return this.birds
      .filter((b) => b.alive && b.firstSeen)
      .map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), kind: b.kind }));
  }

  spawn(kind: TargetKind, spec: PathSpec, groupId: number, now: number): Bird {
    let bird = this.pool.pop();
    if (bird) {
      bird.show(kind);
      bird.spec = spec;
      bird.groupId = groupId;
      bird.spawnTime = now;
      bird.visibleAt = now;
      bird.firstSeen = false;
      bird.speed = 0;
      bird.alive = true;
      bird.fleeing = false;
    } else {
      const sprite = this.scene.add.sprite(-400, -400, birdKey(kind, 0));
      sprite.setDepth(30);
      bird = new Bird(sprite, kind, spec, groupId, now);
    }
    this.birds.push(bird);
    return bird;
  }

  /** Advance everything; invoke onEscape for each target that left the field. */
  update(now: number, ctx: PathCtx, speedScale: number, onEscape: (b: Bird) => void): void {
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      const done = b.advance(now, ctx, speedScale);
      const out = b.x < -170 || b.x > ctx.width + 170 || b.y < -170 || b.y > ctx.height + 170;
      if (done && out) {
        onEscape(b);
        this.recycleAt(i);
      }
    }
  }

  kill(b: Bird): void {
    const i = this.birds.indexOf(b);
    if (i >= 0) {
      b.alive = false;
      this.recycleAt(i);
    }
  }

  clear(): void {
    while (this.birds.length) this.recycleAt(this.birds.length - 1);
  }

  forEachGroupId(groupId: number): Bird[] {
    if (groupId <= 0) return [];
    return this.birds.filter((b) => b.groupId === groupId);
  }

  /** Every live bird overlapping an aiming radius at (x,y), nearest first; excludes bosses. */
  overlappingAny(x: number, y: number, grace: number): Bird[] {
    const found: Bird[] = [];
    for (const b of this.birds) {
      if (!b.alive || b.boss || b.pendingKill) continue;
      if (b.distanceTo(x, y) <= b.radiusPx + grace) found.push(b);
    }
    found.sort((a, b) => a.distanceTo(x, y) - b.distanceTo(x, y));
    return found;
  }

  /** remove two birds at once (multikill pair) */
  killAll(list: Bird[]): void {
    for (const b of list) this.kill(b);
  }

  private recycleAt(i: number): void {
    const b = this.birds.splice(i, 1)[0];
    b.release();
    if (this.pool.length < 64) this.pool.push(b);
    else b.sprite.destroy();
  }

  destroy(): void {
    this.clear();
    for (const b of this.pool) b.sprite.destroy();
    this.pool = [];
  }
}
