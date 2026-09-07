import { events, Events } from '../core/events.js';
import { evaluateTimingWindow, easeOutBack } from '../core/easing.js';
import { getCombatRNG } from '../core/rng.js';

// THE SIGNATURE MECHANIC: Real-time parry/dodge timing system

export class ReactionSystem {
  constructor() {
    this.activeTelegraph = null;
    this.reactionState = 'IDLE'; // IDLE, WAITING, RESOLVING
    this.currentHitIndex = 0;
    this.totalHits = 1;
    this.comboSequence = [];
    
    // Timing windows (in seconds)
    this.parryWindow = 0.15;   // Tight window for perfect parry
    this.dodgeWindow = 0.25;   // Slightly forgiving dodge window
    
    // State tracking
    this.lastTelegraphTime = 0;
    this.reactionDeadline = 0;
    this.parryThreshold = 0.04; // Within 40ms for perfect
    
    // Streak tracking
    this.parryStreak = 0;
    this.flowMeter = 0; // Rewards consecutive clean parries
    
    // Slow-mo effect on perfect parry
    this.slowMoFactor = 1.0;
    this.slowMoDuration = 0;
  }

  // Start a telegraphed attack sequence
  startTelegraph(attacker, attackData) {
    if (this.reactionState !== 'IDLE') {
      console.warn('Reaction system busy, cannot start new telegraph');
      return false;
    }

    this.activeTelegraph = {
      attacker,
      attackData,
      startTime: performance.now() / 1000,
      telegraphDuration: attackData.telegraphTime || 1.0,
      hits: attackData.hits || [{ damage: attackData.damage, delay: 0 }],
      canParry: attackData.canParry !== false,
      mustDodge: attackData.mustDodge || false, // Unblockable grab attacks
      element: attackData.element
    };

    this.currentHitIndex = 0;
    this.totalHits = this.activeTelegraph.hits.length;
    this.reactionState = 'WAITING';

    // Calculate when first hit will land
    this.reactionDeadline = this.activeTelegraph.startTime + this.activeTelegraph.telegraphDuration;

    // Emit event for UI/FX
    events.emit(Events.ATTACK_TELEGRAPHED, {
      attacker,
      attackData: this.activeTelegraph.attackData,
      hits: this.totalHits
    });

    return true;
  }

  // Update reaction state (called every frame)
  update(deltaTime) {
    if (this.reactionState === 'IDLE') return;

    const currentTime = performance.now() / 1000;

    // Handle slow-mo decay
    if (this.slowMoDuration > 0) {
      this.slowMoDuration -= deltaTime;
      if (this.slowMoDuration <= 0) {
        this.slowMoFactor = 1.0;
      }
    }

    // Check if we missed the reaction window entirely
    const timeUntilHit = this.reactionDeadline - currentTime;
    
    if (timeUntilHit < -0.2 && this.activeTelegraph) {
      // Hit window has passed without reaction
      this.resolveMiss();
    }
  }

  // Player attempts to parry
  attemptParry() {
    if (this.reactionState !== 'WAITING' || !this.activeTelegraph) return null;
    
    if (this.activeTelegraph.mustDodge) {
      // This attack cannot be parried
      return { success: false, reason: 'unblockable' };
    }

    const currentTime = performance.now() / 1000;
    const timeUntilHit = this.reactionDeadline - currentTime;
    
    // Check if we're in the parry window
    const result = evaluateTimingWindow(
      currentTime,
      this.reactionDeadline - 0.05, // Slight offset for feel
      this.parryWindow
    );

    if (result.hit) {
      if (result.perfect) {
        return this.resolvePerfectParry(result.score);
      } else {
        return this.resolveBlock(result.score);
      }
    }

    return { success: false, reason: 'early' };
  }

  // Player attempts to dodge
  attemptDodge() {
    if (this.reactionState !== 'WAITING' || !this.activeTelegraph) return null;

    const currentTime = performance.now() / 1000;
    
    // Dodge window is more forgiving
    const result = evaluateTimingWindow(
      currentTime,
      this.reactionDeadline - 0.05,
      this.dodgeWindow
    );

    if (result.hit) {
      return this.resolveDodge(result.score);
    }

    return { success: false, reason: 'early' };
  }

  resolvePerfectParry(score) {
    const defender = this.activeTelegraph.attacker.side === 'enemy' 
      ? getCurrentActiveCharacter() 
      : getCurrentActiveEnemy();

    if (!defender) return { success: false, reason: 'no_target' };

    // Perfect parry: negate damage, build AP, trigger counter
    this.parryStreak++;
    this.flowMeter = Math.min(100, this.flowMeter + 20);
    this.slowMoFactor = 0.3; // Slow-mo effect
    this.slowMoDuration = 0.4;

    // Grant AP bonus
    const apGain = 2 + Math.floor(this.parryStreak * 0.5);
    if (defender.side === 'player') {
      defender.ap = Math.min(defender.stats.maxAP, defender.ap + apGain);
    }

    // Emit success event
    events.emit(Events.PARRY_SUCCESS, {
      defender,
      attacker: this.activeTelegraph.attacker,
      score,
      streak: this.parryStreak,
      apGain
    });

    // Trigger counterattack opportunity
    setTimeout(() => {
      events.emit(Events.COUNTER_TRIGGERED, {
        defender,
        target: this.activeTelegraph.attacker
      });
    }, 200);

    // Move to next hit or complete
    this.currentHitIndex++;
    if (this.currentHitIndex >= this.totalHits) {
      this.reactionState = 'IDLE';
      this.activeTelegraph = null;
    } else {
      // Schedule next hit in combo
      const nextHitDelay = this.activeTelegraph.hits[this.currentHitIndex].delay;
      this.reactionDeadline = performance.now() / 1000 + nextHitDelay;
    }

    return { 
      success: true, 
      perfect: true, 
      score, 
      apGain,
      counter: true 
    };
  }

  resolveBlock(score) {
    // Regular block: negate damage but no AP or counter
    events.emit(Events.PARRY_MISSED, {
      score,
      blocked: true
    });

    this.parryStreak = 0; // Break streak on imperfect parry
    
    // Move to next hit
    this.currentHitIndex++;
    if (this.currentHitIndex >= this.totalHits) {
      this.reactionState = 'IDLE';
      this.activeTelegraph = null;
    } else {
      const nextHitDelay = this.activeTelegraph.hits[this.currentHitIndex].delay;
      this.reactionDeadline = performance.now() / 1000 + nextHitDelay;
    }

    return { success: true, perfect: false, blocked: true };
  }

  resolveDodge(score) {
    // Dodge: negate damage, no AP or counter
    this.parryStreak = 0; // Break streak on dodge

    events.emit(Events.DODGE_SUCCESS, {
      score,
      attacker: this.activeTelegraph.attacker
    });

    // Move to next hit
    this.currentHitIndex++;
    if (this.currentHitIndex >= this.totalHits) {
      this.reactionState = 'IDLE';
      this.activeTelegraph = null;
    } else {
      const nextHitDelay = this.activeTelegraph.hits[this.currentHitIndex].delay;
      this.reactionDeadline = performance.now() / 1000 + nextHitDelay;
    }

    return { success: true, dodged: true };
  }

  resolveMiss() {
    // Player failed to react in time - apply damage
    if (!this.activeTelegraph) return;

    const defender = this.activeTelegraph.attacker.side === 'enemy' 
      ? getCurrentActiveCharacter() 
      : getCurrentActiveEnemy();

    if (!defender) return;

    const hitData = this.activeTelegraph.hits[this.currentHitIndex];
    
    events.emit(Events.DAMAGE_DEALT, {
      attacker: this.activeTelegraph.attacker,
      defender,
      damage: hitData.damage,
      isCrit: false,
      element: this.activeTelegraph.element
    });

    // Reset streak on being hit
    this.parryStreak = 0;
    this.flowMeter = Math.max(0, this.flowMeter - 10);

    // Move to next hit or complete
    this.currentHitIndex++;
    if (this.currentHitIndex >= this.totalHits) {
      this.reactionState = 'IDLE';
      this.activeTelegraph = null;
    } else {
      const nextHitDelay = this.activeTelegraph.hits[this.currentHitIndex].delay;
      this.reactionDeadline = performance.now() / 1000 + nextHitDelay;
    }
  }

  // Get current telegraph info for UI
  getActiveTelegraphInfo() {
    if (!this.activeTelegraph) return null;

    const currentTime = performance.now() / 1000;
    const timeUntilHit = this.reactionDeadline - currentTime;
    
    return {
      attacker: this.activeTelegraph.attacker,
      attackName: this.activeTelegraph.attackData.name,
      hitsRemaining: this.totalHits - this.currentHitIndex,
      totalHits: this.totalHits,
      timeUntilHit: Math.max(0, timeUntilHit),
      telegraphDuration: this.activeTelegraph.telegraphDuration,
      canParry: this.activeTelegraph.canParry && !this.activeTelegraph.mustDodge,
      mustDodge: this.activeTelegraph.mustDodge,
      parryWindow: this.parryWindow,
      dodgeWindow: this.dodgeWindow
    };
  }

  // Get player statistics
  getStats() {
    return {
      parryStreak: this.parryStreak,
      flowMeter: this.flowMeter
    };
  }

  reset() {
    this.activeTelegraph = null;
    this.reactionState = 'IDLE';
    this.currentHitIndex = 0;
    this.totalHits = 1;
    this.parryStreak = 0;
    this.flowMeter = 0;
    this.slowMoFactor = 1.0;
  }
}

// Helper to get currently acting character
function getCurrentActiveCharacter() {
  // This will be set by the battle system
  return window.__activeCharacter || null;
}

function getCurrentActiveEnemy() {
  return window.__activeEnemy || null;
}

export const reactionSystem = new ReactionSystem();
