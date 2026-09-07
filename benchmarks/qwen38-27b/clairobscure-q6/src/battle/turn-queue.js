/**
 * battle/turn-queue.js — Speed-ordered initiative queue.
 *
 * All combatants (party + enemies) share one queue ordered by Speed, like
 * Expedition 33: whenever an ENEMY reaches the top, the battle system runs
 * its reactive attack; when a PARTY member reaches the top, the menu opens.
 *
 * Ordering: at the start of each "round" the queue is sorted by
 * `actor.speed` (desc); ties favor the party, then list order. Stunned
 * actors still occupy the queue but their turn is skipped (consumed) when
 * it arrives. The queue is rebuilt every round so speed-affecting changes
 * take effect.
 */

export class TurnQueue {
  constructor() {
    this._round = [];      // actors in order, index 0 = current
    this._index = 0;
    this.roundNumber = 1;
  }

  /** (Re)build the queue from a flat combatant list. */
  build(combatants) {
    const alive = combatants.filter((c) => c && c.hp > 0 && !c.dead);
    alive.sort((a, b) => {
      if (b.speed !== a.speed) return b.speed - a.speed;
      // Party before enemies on ties, then stable index
      const pa = a.isParty ? 0 : 1;
      const pb = b.isParty ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (a.queueIndex ?? 0) - (b.queueIndex ?? 0);
    });
    this._round = alive;
    this._index = 0;
    return this.current;
  }

  get current() {
    return this._index < this._round.length ? this._round[this._index] : null;
  }

  /** Next n actors after the current one (wraps within the round). */
  upcoming(n = 4) {
    const out = [];
    for (let i = 1; i <= n && this._round.length > 0; i++) {
      out.push(this._round[(this._index + i) % this._round.length]);
    }
    return out;
  }

  /** Advance to the next actor. Returns the new current, or null when the
   *  round is exhausted (caller rebuilds via build()). */
  advance() {
    this._index += 1;
    if (this._index >= this._round.length) {
      this._roundNumber += 1;
      return null; // round over
    }
    return this._round[this._index];
  }

  /** Skip the current actor (stunned / dead mid-turn). */
  skip() {
    return this.advance();
  }

  /** Remove an actor that just died; keep the current stable. */
  remove(actor) {
    const i = this._round.indexOf(actor);
    if (i < 0) return;
    if (i < this._index) this._index -= 1;
    this._round.splice(i, 1);
  }

  get size() {
    return this._round.length;
  }

  get empty() {
    return this._round.length === 0;
  }
}
