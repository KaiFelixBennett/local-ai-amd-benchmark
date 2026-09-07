/**
 * Initiative/speed-based turn queue with upcoming-turns preview.
 */

export class TurnQueue {
  constructor() {
    this._queue = [];
    this._index = 0;
  }

  clear() {
    this._queue = [];
    this._index = 0;
  }

  /** Add a combatant to the queue. Called at battle start. */
  add(entity) {
    this._queue.push({
      entity,
      speed: entity.speed || 10,
      nextTurn: 0, // tick when next turn occurs
    });
  }

  /** Build the turn order from current tick. Faster entities go first when nextTurn is equal. */
  build(currentTick = 0) {
    this._queue.sort((a, b) => {
      if (a.nextTurn !== b.nextTurn) return a.nextTurn - b.nextTurn;
      return b.speed - a.speed; // Higher speed first
    });
  }

  /** Get the next actor in queue (the one with the lowest nextTurn). */
  getNext() {
    if (this._queue.length === 0) return null;
    this.build();
    return this._queue[0].entity;
  }

  /** Advance to next turn, returns the actor whose turn it is. */
  advance() {
    if (this._queue.length === 0) return null;
    this.build();
    // Always take the entry with the lowest nextTurn (first in sorted queue)
    const entry = this._queue[0];
    // Schedule next turn
    entry.nextTurn += 100 / (entry.speed || 10);
    return entry.entity;
  }

  /** Get upcoming turns (next N actors by nextTurn order). */
  getUpcoming(count = 6) {
    this.build();
    const result = [];
    for (let i = 0; i < count && i < this._queue.length; i++) {
      result.push(this._queue[i].entity);
    }
    return result;
  }

  /** Remove a dead combatant. */
  remove(entity) {
    this._queue = this._queue.filter(e => e.entity !== entity);
  }

  /** Modify speed (buff/debuff). */
  setSpeed(entity, speed) {
    const entry = this._queue.find(e => e.entity === entity);
    if (entry) entry.speed = speed;
  }

  get currentTurnIndex() {
    return this._index;
  }
}
