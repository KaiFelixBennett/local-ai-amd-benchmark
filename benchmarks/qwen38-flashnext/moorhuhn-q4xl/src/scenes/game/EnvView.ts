import Phaser from 'phaser';
import type { EnvObjectDef, MapDef } from '../../core/types';
import { envKey, BLADES_KEY, VANE_KEY, TEX } from '../tex';

/** runtime state of one shootable prop */
type PropSprite = Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;

interface Prop {
  def: EnvObjectDef;
  sprite: PropSprite;
  parts: PropSprite[];
  baseX: number;
  baseY: number;
  live: boolean;
  respawnAt: number;
  bobPhase: number;
  spinning: boolean;
}

const RESPAWNABLE = new Set(['cans', 'bottle', 'bucket', 'pumpkin', 'bell']);

/**
 * Shootable environment of the current map: props, hidden secrets and the
 * chain-reaction bookkeeping (steps must follow each other within a window).
 */
export class EnvView {
  private props: Prop[] = [];
  private foundHidden: Set<string>;
  /** chainId -> index of next expected step */
  private chainIdx = new Map<string, number>();
  private chainExpire = new Map<string, number>(
  );
  /** live wind speed px/s (wind events ramp this) */
  wind = 0;

  constructor(private scene: Phaser.Scene, map: MapDef, w: number, h: number, wFound: string[]) {
    this.foundHidden = new Set(wFound);
    for (const def of map.objects) {
      const key = envKey(def.kind);
      const sprite = scene.add
        .sprite(def.x * w, def.y * h, key)
        .setScale(def.scale ?? 1)
        .setDepth(def.y * 10)
        .setFlipX(def.flip ?? false);
      const parts: PropSprite[] = [sprite];
      const cx = def.x * w;
      const cy = def.y * h;
      if (def.kind === 'windmill') {
        const blades = scene.add.image(cx, cy - 58, BLADES_KEY).setScale(0.62).setDepth(def.y * 10 + 1);
        parts.push(blades);
      }
      if (def.kind === 'weathervane') {
        const arrow = scene.add.image(cx, cy - 52, VANE_KEY).setScale(0.9).setDepth(def.y * 10 + 1);
        parts.push(arrow);
      }
      if (def.kind === 'firefly' || def.kind === 'ghostlight' || def.kind === 'crystal' || def.kind === 'lantern') {
        const glow = scene.add
          .image(cx, cy - (def.kind === 'lantern' ? 58 : 6), TEX.glow)
          .setScale(0.9)
          .setAlpha(0.5)
          .setDepth(def.y * 10 - 1)
          .setTint(def.kind === 'ghostlight' ? 0x9fe8ff : 0xffe6a3);
        parts.push(glow);
      }
      const prop: Prop = {
        def,
        sprite,
        parts,
        baseX: cx,
        baseY: cy,
        live: true,
        respawnAt: 0,
        bobPhase: Math.random() * Math.PI * 2,
        spinning: def.kind === 'windmill',
      };
      if (def.hidden && !this.foundHidden.has(def.id)) {
        sprite.setAlpha(0.42);
        for (const p of parts) if (p !== sprite) p.setAlpha(0.3);
      }
      this.props.push(prop);
    }
  }

  /** Hit test. Returns the deepest prop within radius+grace or null. */
  hitTest(x: number, y: number, grace: number): EnvObjectDef | null {
    let best: Prop | null = null;
    let bestD = Infinity;
    for (const p of this.props) {
      if (!p.live) continue;
      const d = Phaser.Math.Distance.Between(x, y, p.baseX, p.baseY);
      const r = p.def.radius * (p.def.scale ?? 1) + grace;
      if (d <= r && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best?.def ?? null;
  }

  isHidden(defId: string): boolean {
    return this.props.find((p) => p.def.id === defId)?.def.hidden === true;
  }

  /** Remove prop (shot): hidden ones fade in fully once discovered. */
  knockOut(def: EnvObjectDef, now: number, respawnSec: number): void {
    const p = this.props.find((q) => q.def.id === def.id);
    if (!p) return;
    p.live = false;
    p.respawnAt = RESPAWNABLE.has(p.def.kind) ? now + respawnSec : Infinity;
    const discovered = p.def.hidden;
    for (const g of p.parts) {
      if (g instanceof Phaser.GameObjects.Sprite || g instanceof Phaser.GameObjects.Image) {
        this.scene.tweens.add({
          targets: g,
          alpha: discovered ? 0.5 : 0,
          scaleX: g.scaleX * 1.25,
          scaleY: g.scaleY * 1.25,
          duration: discovered ? 260 : 120,
          onComplete: () => {
            if (!discovered && p.parts[0] === g) return; // keep sprite, dimmed
          },
        });
      }
    }
    if (!discovered) {
      // breakable prop: hide after puff, restore later if respawnable
      for (const g of p.parts) {
        this.scene.time.delayedCall(130, () => {
          if (!p.live) g.setVisible(false);
        });
      }
    }
  }

  /** Restore respawnable props whose timer elapsed. */
  tickRespawn(now: number): void {
    for (const p of this.props) {
      if (p.live || now < p.respawnAt) continue;
      p.live = true;
      for (const g of p.parts) {
        g.setVisible(true);
        g.setAlpha(p.def.hidden && !this.foundHidden.has(p.def.id) ? 0.42 : 1);
        g.setScale(p.def.scale ?? 1);
      }
    }
  }

  markFound(id: string): void {
    this.foundHidden.add(id);
    const p = this.props.find((q) => q.def.id === id);
    if (!p) return;
    p.live = true;
    for (const g of p.parts) {
      g.setVisible(true);
      g.setAlpha(g === p.sprite ? 1 : 0.6);
      g.setScale(p.def.scale ?? 1);
    }
  }

  /**
   * Chain bookkeeping: `hit(id)` returns the finished chain when this object
   * completed one, else null. Steps of a chain must follow each other within
   * `window` seconds; hitting a wrong intermediate resets it.
   */
  hitChain(id: string, now: number, window: number, chains: MapDef['chains']): string | null {
    const involved = chains.filter((c) => c.steps.includes(id));
    if (!involved.length) return null;
    // advance every chain that expects this id next
    let finishedId: string | null = null;
    for (const chain of involved) {
      const idx = this.chainIdx.get(chain.id) ?? 0;
      const expire = this.chainExpire.get(chain.id) ?? -1;
      const stepIdx = chain.steps.indexOf(id);
      if (expire >= 0 && now > expire) {
        this.chainIdx.set(chain.id, 0); // window lapsed, restart
      }
      if (stepIdx === idx) {
        const next = idx + 1;
        if (next >= chain.steps.length) {
          this.chainIdx.set(chain.id, 0);
          this.chainExpire.set(chain.id, -1);
          finishedId = chain.id;
        } else {
          this.chainIdx.set(chain.id, next);
          this.chainExpire.set(chain.id, now + window);
        }
      } else if (stepIdx > idx) {
        // skipped a step => this object's chain restarts from scratch
        this.chainIdx.set(chain.id, stepIdx === 0 ? 1 : 0);
        this.chainExpire.set(chain.id, now + window);
      }
    }
    return finishedId;
  }

  chainStepsOf(id: string, chains: MapDef['chains']): number {
    const c = chains.find((ch) => ch.steps.includes(id));
    return c ? c.steps.length : 0;
  }

  update(dt: number, now: number): void {
    for (const p of this.props) {
      if (!p.live) continue;
      const d = p.def;
      switch (d.kind) {
        case 'windmill': {
          const blades = p.parts[1];
          if (blades) blades.rotation += dt * (0.6 + Math.abs(this.wind) * 0.02);
          break;
        }
        case 'weathervane': {
          const arrow = p.parts[1];
          if (arrow) {
            const target = this.wind === 0 ? -Math.PI / 2 : Math.atan2(0.15, this.wind >= 0 ? 1 : -1) * 0.5 - Math.PI / 4;
            arrow.rotation = Phaser.Math.Angle.Wrap(Phaser.Math.Linear(arrow.rotation, target, Math.min(1, dt * 3)));
          }
          break;
        }
        case 'lantern':
        case 'ghostlight':
        case 'crystal':
        case 'firefly': {
          const glow = p.parts[1];
          if (glow) {
            const a = 0.35 + Math.abs(Math.sin(now * 1.7 + p.bobPhase)) * 0.45;
            glow.setAlpha(a);
          }
          break;
        }
        case 'reeds':
        case 'puddle':
        case 'mushroom':
        case 'nestbasket': {
          const sway = Math.sin(now * 1.1 + p.bobPhase) * (this.wind === 0 ? 2 : this.wind < 0 ? -4 : 4);
          p.sprite.rotation = sway * 0.01;
          break;
        }
        case 'cans':
        case 'bottle':
        case 'bucket': {
          p.sprite.rotation = Math.sin(p.bobPhase + Math.sin(now * 5) * 0.1) * (Math.abs(this.wind) * 0.0006);
          break;
        }
        case 'bell': {
          const bellA = Math.sin(now * 9 + p.bobPhase) * 0.03 * (this.wind !== 0 ? 1.6 : 1);
          p.sprite.rotation = bellA;
          break;
        }
        default:
          break;
      }
    }
  }

  destroy(): void {
    for (const p of this.props) for (const g of p.parts) g.destroy();
    this.props = [];
  }
}
