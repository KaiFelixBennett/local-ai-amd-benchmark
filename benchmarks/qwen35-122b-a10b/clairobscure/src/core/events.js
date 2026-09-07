// Minimal pub/sub event bus for game systems

export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) callbacks.splice(index, 1);
    }
  }

  emit(event, data = {}) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Event handler error for ${event}:`, err);
        }
      });
    }
  }

  clear() {
    this.listeners.clear();
  }
}

// Global event bus instance
export const events = new EventBus();

// Event types used throughout the game
export const Events = {
  // Battle flow
  TURN_STARTED: 'turn-started',
  TURN_ENDED: 'turn-ended',
  ACTION_SELECTED: 'action-selected',
  ACTION_RESOLVED: 'action-resolved',
  
  // Combat events
  ATTACK_TELEGRAPHED: 'attack-telegraphed',
  ATTACK_LAUNCHED: 'attack-launched',
  HIT_REGISTERED: 'hit-registered',
  DAMAGE_DEALT: 'damage-dealed',
  HEAL_APPLIED: 'heal-applied',
  
  // Reaction events
  PARRY_SUCCESS: 'parry-success',
  PARRY_MISSED: 'parry-missed',
  DODGE_SUCCESS: 'dodge-success',
  DODGE_MISSED: 'dodge-missed',
  COUNTER_TRIGGERED: 'counter-triggered',
  
  // Status effects
  STATUS_APPLIED: 'status-applied',
  STATUS_EXPIRED: 'status-expired',
  STAGGER_BREAK: 'stagger-break',
  
  // Game state
  VICTORY: 'victory',
  DEFEAT: 'defeat',
  GAME_RESTARTED: 'game-restarted',
  
  // UI updates
  HUD_UPDATE: 'hud-update',
  MENU_OPENED: 'menu-opened',
  MENU_CLOSED: 'menu-closed',
  
  // FX
  PARTICLE_EMIT: 'particle-emit',
  DAMAGE_NUMBER: 'damage-number',
  CAMERA_SHAKE: 'camera-shake',
};
