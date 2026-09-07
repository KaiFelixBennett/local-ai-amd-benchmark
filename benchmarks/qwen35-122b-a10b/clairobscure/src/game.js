import * as THREE from 'three';
import { events, Events } from './core/events.js';
import { getCombatRNG } from './core/rng.js';
import { initRenderer, render, updateCombatCamera, setCameraTarget, getScene, getCamera, getClock } from './engine/renderer.js';
import { initPostProcessing, renderWithPostProcessing, resizeOverlay, drawOverlay, initOverlay } from './engine/postfx.js';
import { initAudio, playMenuSound, playMenuSelectSound, playTelegraphSound, playParrySound as audioPlayParry, playDodgeSound as audioPlayDodge, playVictorySound, playDefeatSound } from './engine/audio.js';
import { battleSystem, BattleState } from './battle/battle-system.js';
import { turnQueue } from './battle/turn-queue.js';
import { reactionSystem } from './battle/reaction-system.js';
import { CombatAnimations } from './battle/combat-animations.js';
import { targetingSystem } from './battle/targeting.js';
import { Character, createDefaultParty } from './entities/character.js';
import { Enemy, createDefaultEnemies, createBossEnemy } from './entities/enemy.js';
import { hud } from './ui/hud.js';
import { battleMenu } from './ui/battle-menu.js';
import { prompts } from './ui/prompts.js';
import { particleSystem } from './fx/particles.js';
import { damageNumbers } from './fx/damage-numbers.js';

// Main game orchestrator
export class Game {
  constructor() {
    this.container = null;
    this.isRunning = false;
    this.lastTime = 0;
    
    // Game state
    this.party = [];
    this.enemies = [];
    this.battleState = BattleState.IDLE;
    
    // Input state
    this.mouseX = 0;
    this.mouseY = 0;
    this.isMouseDown = false;
    
    // Systems (set on init)
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.clock = null;
  }

  async init(container) {
    this.container = container;
    
    try {
      // Initialize renderer
      const { scene, camera, renderer, clock } = initRenderer(container);
      this.scene = scene;
      this.camera = camera;
      this.clock = clock;
      this.renderer = renderer;

      // Set global references for other systems
      window.__game = this;
      window.__reactionSystem = reactionSystem;
      window.__battleMenu = battleMenu;
      window.__playParrySound = audioPlayParry;
      window.__playDodgeSound = audioPlayDodge;

      // Initialize post-processing
      await initPostProcessing(renderer, scene, camera);

      // Initialize overlay canvas for HUD
      initOverlay();

      // Initialize audio
      await initAudio();

      // Initialize targeting system
      targetingSystem.init(this.scene, this.camera);

      // Create battle stage elements
      this.setupBattleStage();

      // Setup event listeners
      this.setupEventListeners();

      console.log('Game initialized successfully');
    } catch (error) {
      console.error('Failed to initialize game:', error);
      this.showError(error.message);
      throw error;
    }
  }

  setupBattleStage() {
    // Create party members on the left side
    const party = createDefaultParty();
    const startPosX = -6;
    
    if (Array.isArray(party)) {
      for (let index = 0; index < party.length; index++) {
        const character = party[index];
        character.init(new THREE.Vector3(startPosX + index * 2.5, 0, 0));
        this.scene.add(character.mesh);
      }
    }
    this.party = party;

    // Create enemies on the right side
    const enemies = createDefaultEnemies();
    const enemyStartX = 6;
    
    if (Array.isArray(enemies)) {
      for (let index = 0; index < enemies.length; index++) {
        const enemy = enemies[index];
        enemy.init(new THREE.Vector3(enemyStartX + (index % 2) * 3, 0, (index >= 2 ? -2 : 2)));
        this.scene.add(enemy.mesh);
      }
    }
    this.enemies = enemies;

    // Initialize combat animations with scene
    window.__combatAnimations = new CombatAnimations(this.scene);

    // Store global references for HUD
    window.__party = party;
    window.__enemies = enemies;
  }

  setupEventListeners() {
    // Mouse tracking for targeting
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    window.addEventListener('mousedown', () => {
      this.isMouseDown = true;
    });

    window.addEventListener('mouseup', () => {
      if (this.isMouseDown && battleMenu.isOpen) {
        // Handled by battleMenu
      }
      this.isMouseDown = false;
    });

    // Event bus listeners
    events.on(Events.TURN_STARTED, (data) => {
      this.onTurnStarted(data);
    });

    events.on(Events.ACTION_SELECTED, (data) => {
      this.onActionSelected(data);
    });

    events.on(Events.DAMAGE_DEALT, (data) => {
      this.onDamageDealt(data);
    });

    events.on(Events.VICTORY, () => {
      this.onVictory();
    });

    events.on(Events.DEFEAT, () => {
      this.onDefeat();
    });
  }

  onTurnStarted(data) {
    const { entity, side } = data;
    
    // Update camera to focus on acting entity
    if (entity.mesh) {
      setCameraTarget(entity);
    }

    // Play sound
    playMenuSound();
  }

  onActionSelected(data) {
    const { action, skill, character } = data;
    
    if (action === 'attack') {
      battleSystem.selectAction('attack');
    } else if (action === 'skill' && skill) {
      battleSystem.selectAction('skill', skill);
    } else if (action === 'dodge') {
      battleSystem.selectAction('dodge');
    }

    // Play select sound
    playMenuSelectSound();
  }

  onDamageDealt(data) {
    const { attacker, defender, damage, isCrit, weaknessResist } = data;
    
    // Show damage number
    if (defender.mesh) {
      const pos = defender.mesh.position.clone();
      
      if (isCrit) {
        damageNumbers.crit(pos.x, pos.y, pos.z, damage);
      } else if (weaknessResist === 'weakness') {
        damageNumbers.weakness(pos.x, pos.y, pos.z, damage);
      } else {
        damageNumbers.damage(pos.x, pos.y, pos.z, damage, isCrit, weaknessResist === 'weakness');
      }

      // Hit flash
      if (defender.side === 'player') {
        triggerHitFlash(0.3);
      }
    }

    // Particle burst
    particleSystem.createImpactBurst(
      defender.mesh?.position || new THREE.Vector3(),
      0xff5555,
      10
    );
  }

  onVictory() {
    console.log('VICTORY!');
    hud.showVictoryMessage();
    
    // Victory particles
    if (this.party && this.party.forEach) {
      this.party.forEach(character => {
        if (character.mesh) {
          particleSystem.createPaintMotes(character.mesh.position, [0xffd700, 0xffff00, 0xffa500]);
        }
      });
    }

    playVictorySound();
  }

  onDefeat() {
    console.log('DEFEAT!');
    hud.showDefeatMessage();
    playDefeatSound();
  }

  startBattle() {
    // Reset all characters
    this.party.forEach(c => c.reset());
    this.enemies.forEach(e => e.reset());

    // Initialize battle system
    battleSystem.init(this.party, this.enemies);
    
    this.battleState = BattleState.PLAYER_TURN;
    this.isRunning = true;

    // Start game loop
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  restartBattle() {
    // Clear existing meshes
    this.party.forEach(c => {
      if (c.mesh) {
        this.scene.remove(c.mesh);
        c.mesh = null;
      }
    });
    this.enemies.forEach(e => {
      if (e.mesh) {
        this.scene.remove(e.mesh);
        e.mesh = null;
      }
    });

    // Reset systems
    reactionSystem.reset();
    battleMenu.close();
    particleSystem.clear();
    damageNumbers.clear();

    // Re-setup stage
    this.party = [];
    this.enemies = [];
    this.setupBattleStage();

    // Start new battle
    this.startBattle();
  }

  gameLoop(currentTime) {
    if (!this.isRunning) return;

    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Apply slow-mo if active
    let actualDeltaTime = deltaTime;
    if (window.__slowMoFactor && window.__slowMoDuration > 0) {
      actualDeltaTime *= window.__slowMoFactor;
    }

    try {
      this.update(actualDeltaTime);
      this.render();
    } catch (error) {
      console.error('Game loop error:', error);
    }

    requestAnimationFrame((t) => this.gameLoop(t));
  }

  update(deltaTime) {
    // Update battle system
    battleSystem.update(deltaTime);
    
    // Update reaction system
    reactionSystem.update(deltaTime);

    // Update HUD
    if (hud) {
      hud.update({ party: this.party, enemies: this.enemies });
      hud.render(deltaTime, battleSystem.state);
    }

    // Update party members
    this.party.forEach(character => {
      if (!character.isDead) {
        character.update(deltaTime);
        character.isActive = character === battleSystem.getActiveEntity();
      }
    });

    // Update enemies
    this.enemies.forEach(enemy => {
      if (!enemy.isDead) {
        enemy.update(deltaTime);
        enemy.isActive = enemy === battleSystem.getActiveEntity();
      }
    });

    // Update targeting
    if (targetingSystem.isTargeting) {
      targetingSystem.update(this.mouseX, this.mouseY);
    }

    // Update FX systems
    particleSystem.update(deltaTime);
    damageNumbers.update(deltaTime);
    prompts.update(deltaTime);

    // Update combat animations
    if (window.__combatAnimations) {
      const anims = window.__combatAnimations;
      if (window.__hitSparks) {
        window.__hitSparks = anims.updateSparks(deltaTime, window.__hitSparks);
      }
      if (window.__damageNumbers) {
        window.__damageNumbers = anims.updateDamageNumbers(deltaTime, window.__damageNumbers);
      }
      anims.update(deltaTime);
      anims.updateCameraShake(deltaTime);
    }

    // Update HUD
    hud.update({
      party: this.party,
      enemies: this.enemies,
      turnQueue: turnQueue.getUpcomingTurns()
    });

    // Update camera
    updateCombatCamera();
  }

  render() {
    const deltaTime = this.clock.getDelta();

    // Render 3D scene
    if (hasComposer?.()) {
      renderWithPostProcessing();
    } else {
      render();
    }

    // Render 2D overlay - order matters! HUD and menu first, then FX on top
    hud.render(deltaTime, battleSystem.getState());
    battleMenu.render();
    prompts.render();
    damageNumbers.render();
    // Finally draw overlay FX (vignette, flashes) on top without clearing
    drawOverlay(deltaTime);
  }

  showError(message) {
    const errorOverlay = document.getElementById('error-overlay');
    const errorMessage = document.getElementById('error-message');
    
    if (errorOverlay && errorMessage) {
      errorMessage.textContent = message;
      errorOverlay.style.display = 'block';
    }
  }

  stop() {
    this.isRunning = false;
    battleMenu.close();
  }

  // Getters for external access
  getParty() { return this.party; }
  getEnemies() { return this.enemies; }
  getState() { return this.battleState; }
}

// Export singleton
export const game = new Game();

// Import helper used in onDamageDealt
import { triggerHitFlash, hasComposer } from './engine/postfx.js';
