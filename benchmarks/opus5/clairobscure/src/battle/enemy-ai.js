/**
 * Enemy decision making: which attack pattern, against whom, and how the
 * resulting hits are laid out for the reaction system.
 *
 * Choices are drawn from the seeded encounter RNG, so a given seed replays
 * identically. The AI keeps a short memory of its last pattern so it does not
 * spam the same rhythm — variety is what makes the reactive layer interesting.
 */

export class EnemyAI {
  constructor(rng) {
    this.rng = rng;
    this.lastPattern = new Map();   // enemyId -> patternId
    this.repeatCount = new Map();   // enemyId -> consecutive repeats
  }

  /**
   * @returns {{pattern:object, targets:object[]}}
   */
  chooseAction(enemy, party) {
    const living = party.filter((p) => p.alive);
    const pool = enemy.patternsForPhase();
    const last = this.lastPattern.get(enemy.id);
    const repeats = this.repeatCount.get(enemy.id) || 0;

    const pattern = this.rng.weighted(pool, (p) => {
      let w = p.weight || 1;
      if (p.id === last) w *= repeats >= 1 ? 0.15 : 0.45;
      // Grabs are more likely when somebody is low: press the advantage.
      const anyLow = living.some((c) => c.hpFrac < 0.4);
      if (p.hits.some((h) => h.kind === 'grab')) w *= anyLow ? 1.7 : 0.85;
      return w;
    });

    if (pattern.id === last) this.repeatCount.set(enemy.id, repeats + 1);
    else this.repeatCount.set(enemy.id, 0);
    this.lastPattern.set(enemy.id, pattern.id);

    return { pattern, targets: this._pickTargets(pattern, living, enemy) };
  }

  _pickTargets(pattern, living, enemy) {
    if (living.length === 0) return [];
    const n = pattern.hits.length;

    switch (pattern.targeting) {
      case 'lowest': {
        const t = living.slice().sort((a, b) => a.hpFrac - b.hpFrac)[0];
        return new Array(n).fill(t);
      }
      case 'random': {
        return Array.from({ length: n }, () => this.rng.pick(living));
      }
      case 'spread': {
        // Rotate through the party so a combo forces reactions on everyone.
        const order = this.rng.shuffle(living);
        return Array.from({ length: n }, (_, i) => order[i % order.length]);
      }
      case 'single':
      default: {
        const t = this._threatTarget(living, enemy);
        return new Array(n).fill(t);
      }
    }
  }

  /** Prefer front-row, healthy-enough targets; finish off anyone nearly dead. */
  _threatTarget(living, enemy) {
    const finisher = living.find((c) => c.hpFrac < 0.22);
    if (finisher && this.rng.chance(0.65)) return finisher;
    return this.rng.weighted(living, (c) => {
      let w = c.row === 'front' ? 2.2 : 1;
      w *= 1 + (1 - c.hpFrac) * 0.8;
      if (enemy.weak.length && c.resist.some((r) => enemy.weak.includes(r))) w *= 1.25;
      return w;
    });
  }

  /**
   * Turn a chosen pattern into a reaction-system sequence.
   * @returns {{attacker:object, name:string, patternId:string, hits:Array}}
   */
  buildSequence(enemy, pattern, targets) {
    const hits = pattern.hits.map((h, i) => ({
      target: targets[i] || targets[targets.length - 1],
      move: {
        power: h.power,
        element: h.element || 'physical',
        breakPower: 0,
        critBonus: h.critBonus || 0,
      },
      element: h.element || 'physical',
      kind: h.kind || 'parry',
      curve: h.curve || 'linear',
      windup: h.windup,
      gap: h.gap || 0,
      splash: h.splash || 0,
      status: h.status || null,
      drain: h.drain || 0,
    }));
    return { attacker: enemy, name: pattern.name, patternId: pattern.id, hits };
  }

  reset() {
    this.lastPattern.clear();
    this.repeatCount.clear();
  }
}
