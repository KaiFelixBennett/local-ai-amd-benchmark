import { getCombatRNG } from '../core/rng.js';

// Initiative-based turn ordering system

export class TurnQueue {
  constructor() {
    this.queue = [];
    this.upcomingTurns = [];
    this.currentEntityId = null;
    this.rng = getCombatRNG();
  }

  // Initialize turn queue with all combatants
  initialize(party, enemies) {
    const allCombatants = [...party, ...enemies];
    
    // Calculate initiative for each combatant
    this.queue = allCombatants.map(entity => ({
      id: entity.id,
      entity: entity,
      initiative: this.calculateInitiative(entity),
      nextTurnTime: 0
    }));

    // Sort by initiative (higher goes first)
    this.queue.sort((a, b) => b.initiative - a.initiative);

    this.updateUpcomingTurns();
  }

  calculateInitiative(entity) {
    // Initiative based on speed stat + random variance
    const rng = getCombatRNG();
    const base = entity.stats.speed * 2;
    const variance = rng.float(-5, 10);
    return Math.max(1, base + variance);
  }

  // Get the next entity to take a turn
  getNextEntity() {
    if (this.queue.length === 0) return null;

    const current = this.queue[0];
    this.currentEntityId = current.id;

    // Move current to end and recalculate their next turn time
    this.queue.shift();
    
    // Add variance to next turn time based on speed
    const rng = getCombatRNG();
    current.nextTurnTime = 100 + (200 / current.entity.stats.speed) * rng.float(0.8, 1.2);

    // Re-insert into queue at appropriate position
    this.insertByInitiative(current);
    
    this.updateUpcomingTurns();
    
    return current.entity;
  }

  insertByInitiative(entityEntry) {
    // Simple insertion based on nextTurnTime
    let insertIndex = 0;
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].nextTurnTime > entityEntry.nextTurnTime) {
        break;
      }
      insertIndex++;
    }
    this.queue.splice(insertIndex, 0, entityEntry);
  }

  // Get upcoming turns for UI preview
  getUpcomingTurns(limit = 5) {
    return this.upcomingTurns.slice(0, limit).map(entry => ({
      id: entry.id,
      entity: entry.entity,
      isPlayer: entry.entity.side === 'player',
      initiative: entry.initiative,
      timeUntilTurn: entry.timeUntilTurn || 0
    }));
  }

  updateUpcomingTurns() {
    // Preview next few turns from the queue
    this.upcomingTurns = this.queue.slice(0, 5).map(entry => ({
      id: entry.id,
      entity: entry.entity,
      isPlayer: entry.entity.side === 'player',
      timeUntilTurn: entry.nextTurnTime
    }));
  }

  // Get current active entity
  getCurrentEntity() {
    return this.queue.find(e => e.id === this.currentEntityId)?.entity || null;
  }

  // Skip current turn (used when player skips or action resolves instantly)
  skipTurn() {
    const current = this.getNextEntity();
    if (current) {
      // Immediately get next entity
      return this.getNextEntity();
    }
    return null;
  }

  // Check if queue is empty
  isEmpty() {
    return this.queue.length === 0;
  }

  // Reset queue (for new wave or restart)
  reset(party, enemies) {
    this.queue = [];
    this.upcomingTurns = [];
    this.currentEntityId = null;
    this.initialize(party, enemies);
  }
}

// Export singleton instance
export const turnQueue = new TurnQueue();
