import { EV } from '../core/events.js';

// ---------------------------------------------------------------------------
// Initiative-based round system. Each round, every living unit is queued in
// descending speed order; `Slow` makes a unit act twice (classic CO:33 twist).
// The queue is snapshotted so the HUD can preview upcoming turns.
// ---------------------------------------------------------------------------

export class TurnQueue {
  constructor(bus) {
    this.bus = bus;
    this.round = 0;
    this.queue = [];      // upcoming units this round (objects, not ids)
    this.preview = [];    // snapshot list for HUD: [{side,name,color}]
  }

  buildRound(party, enemies) {
    this.round += 1;
    const units = [];
    for (const u of [...party, ...enemies]) {
      if (!u.alive) continue;
      units.push(u);
      // Slow does not change order here; its effect (enemy damage cut) is
      // applied when the enemy resolves its attack, keeping this file pure.
    }
    units.sort((a, b) => (b.stats.spd + (b.enragedBonus || 0)) - (a.stats.spd + (a.enragedBonus || 0)));
    this.queue = units;
    this._refreshPreview();
    this.bus.emit(EV.TURN_START, { round: this.round });
    return this.queue;
  }

  _refreshPreview() {
    this.preview = this.queue.map((u) => ({
      side: u.side,
      name: u.name,
      color: u.side === 'party' ? '#8fbcb6' : '#a12d33'
    }));
  }

  // Remove a unit that died mid-round.
  remove(unit) {
    const i = this.queue.indexOf(unit);
    if (i >= 0) {
      this.queue.splice(i, 1);
      this._refreshPreview();
    }
  }

  get next() { return this.queue[0] || null; }

  shift() {
    const u = this.queue.shift();
    this._refreshPreview();
    return u || null;
  }

  get roundOver() { return this.queue.length === 0; }

  clear() { this.queue = []; this.preview = []; }
}
