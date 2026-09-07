/**
 * Game orchestrator: owns all systems, per-frame update(), routes input.
 */

import * as THREE from 'three';
import { Renderer } from './engine/renderer.js';
import { PostProcessing } from './engine/postfx.js';
import { AudioEngine } from './engine/audio.js';
import { BattleSystem, BattleState } from './battle/battle-system.js';
import { ReactionResult } from './battle/reaction-system.js';
import { Character, CharacterDefs } from './entities/character.js';
import { Enemy, EnemyDefs } from './entities/enemy.js';
import { HUD } from './ui/hud.js';
import { BattleMenu } from './ui/battle-menu.js';
import { ReactionPrompts } from './ui/prompts.js';
import { ParticleSystem } from './fx/particles.js';
import { DamageNumbers } from './fx/damage-numbers.js';
import { Atmosphere } from './fx/atmosphere.js';
import { TargetingSystem } from './battle/targeting.js';
import { addStatusEffect, StatusEffects } from './battle/action-resolver.js';
import { clamp } from './core/rng.js';
import { OpenWorld } from './world/open-world.js';
import { IntroSequence, defaultStoryLines } from './ui/intro.js';

export class Game {
  constructor(container) {
    this.container = container;
    this.running = false;
    this._lastTime = 0;
    this._cameraTarget = new THREE.Vector3();
    this._cameraLookAt = new THREE.Vector3();
    this._cameraCurrentPos = new THREE.Vector3();
    this._cameraCurrentLook = new THREE.Vector3();
    this._cameraTransition = 0;
    this._cameraFromPos = new THREE.Vector3();
    this._cameraFromLook = new THREE.Vector3();
    this._cameraToPos = new THREE.Vector3();
    this._cameraToLook = new THREE.Vector3();
    this._cameraTransitionDuration = 0.8;
    this._cameraTransitionProgress = 0;

    // Camera shake
    this._shakeIntensity = 0;
    this._shakeDuration = 0;
    this._shakeElapsed = 0;
    this._shakeOffset = new THREE.Vector3();

    // Game mode
    this._gameMode = 'battle'; // 'battle' | 'openworld'
    this._cameraDistance = 10; // open world camera distance

    // Victory/defeat overlay
    this._endOverlay = null;
    this._buildEndOverlay();
  }

  async init() {
    // Renderer
    this.renderer = new Renderer(this.container);

    // HDRI — load Zavelstein for PBR environment + reflections
    try {
      await this.renderer.loadHDRI('assets/hdri_zavelstein.hdr');
      console.log('[Game] HDRI loaded as environment');
    } catch (e) {
      console.warn('[Game] HDRI failed to load, continuing without:', e.message);
    }

    // Post-processing
    this.postfx = await PostProcessing.create(
      this.renderer.renderer,
      this.renderer.scene,
      this.renderer.camera
    );

    // Audio
    this.audio = new AudioEngine();

    // Battle system
    this.battle = new BattleSystem();

    // UI
    this.hud = new HUD(this.container);
    this.menu = new BattleMenu(this.container);
    this.prompts = new ReactionPrompts(this.container);
    this.intro = new IntroSequence(this.container);

    // FX
    this.atmosphere = new Atmosphere(this.renderer.scene);
    this.particles = new ParticleSystem(this.renderer.scene, this.renderer.camera);
    this.damageNumbers = new DamageNumbers(this.hud, this.renderer.camera);

    // Targeting
    this.targeting = new TargetingSystem(
      this.renderer.scene, this.renderer.camera,
      this.renderer.renderer, this.container
    );

    // Open World — async init (loads GLTF models)
    this.openWorld = new OpenWorld(this.renderer.scene, this.renderer.camera);
    this.openWorld.setOnEncounter((zone) => this._startEncounter(zone));
    this.openWorld.setOnInteract((item) => this._handleInteraction(item));
    await this.openWorld.init((loaded, total, type) => {
      console.log(`[Game] OpenWorld asset loaded: ${type} (${loaded}/${total})`);
    });
    this._inOpenWorld = false;

    // Build entities
    this.party = CharacterDefs.map(d => new Character(d));
    this.enemies = [new Enemy(EnemyDefs.iron_golem), new Enemy(EnemyDefs.shadow_weaver)];

    // Add meshes to scene
    for (const c of this.party) this.renderer.scene.add(c.mesh);
    for (const e of this.enemies) this.renderer.scene.add(e.mesh);

    // Ambient particles
    this.particles.spawnAmbientMotes(25);

    // Setup event handlers
    this._setupEvents();

    // Setup input
    this._setupInput();

    // Setup menu callbacks
    this._setupMenu();

    // Camera defaults for open world
    this.renderer.camera.position.set(0, 8, 12);
    this._cameraCurrentPos.copy(this.renderer.camera.position);
    this._cameraCurrentLook.set(0, 1.5, 0);
    this._cameraToPos.copy(this._cameraCurrentPos);
    this._cameraToLook.copy(this._cameraCurrentLook);

    // Start in Open World!
    this._enterOpenWorld();
  }

  _buildEndOverlay() {
    this._endOverlay = document.createElement('div');
    this._endOverlay.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      display: none; flex-direction: column; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.7); z-index: 200; pointer-events: auto;
    `;

    this._endTitle = document.createElement('h1');
    this._endTitle.style.cssText = 'color: #ffd700; font: bold 48px serif; text-shadow: 0 0 20px rgba(255,215,0,0.5);';
    this._endOverlay.appendChild(this._endTitle);

    this._endSub = document.createElement('p');
    this._endSub.style.cssText = 'color: #c8b888; font: 18px serif; margin: 10px 0 30px;';
    this._endOverlay.appendChild(this._endSub);

    const restartBtn = document.createElement('button');
    restartBtn.textContent = 'FIGHT AGAIN';
    restartBtn.style.cssText = `
      padding: 12px 30px; font: bold 16px serif; cursor: pointer;
      background: linear-gradient(135deg, #2a2a4e, #3a3a5e);
      color: #ffd700; border: 2px solid #c8a84e; border-radius: 6px;
      transition: all 0.2s;
    `;
    restartBtn.addEventListener('mouseenter', () => {
      restartBtn.style.background = 'linear-gradient(135deg, #3a3a5e, #4a4a6e)';
      restartBtn.style.boxShadow = '0 0 15px rgba(200,170,100,0.3)';
    });
    restartBtn.addEventListener('mouseleave', () => {
      restartBtn.style.background = 'linear-gradient(135deg, #2a2a4e, #3a3a5e)';
      restartBtn.style.boxShadow = 'none';
    });
    restartBtn.addEventListener('click', () => this._restart());
    this._endOverlay.appendChild(restartBtn);

    this.container.appendChild(this._endOverlay);
  }

  _startBattle() {
    // Reset entities
    for (const def of CharacterDefs) {
      const c = this.party.find(ch => ch.id === def.id);
      if (c) {
        c.hp = def.hp; c.maxHp = def.maxHp; c.ap = def.ap; c.maxAp = def.maxAp;
        c.stagger = 0; c.statusEffects = [];
        c.mesh.visible = true; c.mesh.rotation.x = 0; c.mesh.position.y = 0;
        c.mesh.children.forEach(ch => { if (ch.material) { ch.material.opacity = 1; ch.material.transparent = false; } });
        c.setAnim('idle');
      }
    }
    for (const def of Object.values(EnemyDefs)) {
      const e = this.enemies.find(en => en.id === def.id);
      if (e) {
        e.hp = def.hp; e.maxHp = def.maxHp; e.stagger = 0; e.statusEffects = [];
        e.mesh.visible = true; e.mesh.rotation.x = 0; e.mesh.position.y = 0;
        e.mesh.children.forEach(ch => { if (ch.material) { ch.material.opacity = 1; ch.material.transparent = false; } });
        e.setAnim('idle');
      }
    }

    this.battle.init(this.party, this.enemies);
    this.hud.setParty(this.party);
    this.hud.setEnemies(this.enemies);
    this.audio.init();
    this.audio.startBattleBed();
    this._endOverlay.style.display = 'none';
  }

  _restart() {
    this.particles.clear();
    this._startBattle();
  }

  _enterOpenWorld() {
    this._gameMode = 'openworld';
    this._inOpenWorld = true;
    // Hide battle entities and entire battle stage
    for (const c of this.party) c.mesh.visible = false;
    for (const e of this.enemies) e.mesh.visible = false;
    // Hide battle stage group
    if (this.renderer._battleStage) {
      this.renderer._battleStage.visible = false;
      this.renderer._battleStage.traverse(c => { c.visible = false; });
    }
    // Hide ALL non-open-world meshes in scene (battle stage elements)
    // Open World has its own group — keep it and ALL its children visible
    const openWorldGroup = this.openWorld._group;
    this.renderer.scene.traverse(child => {
      // Skip open world group and ALL its descendants
      if (openWorldGroup) {
        // Check if this child is inside the open world group
        let parent = child.parent;
        let isInsideOpenWorld = false;
        while (parent) {
          if (parent === openWorldGroup) { isInsideOpenWorld = true; break; }
          parent = parent.parent;
        }
        if (isInsideOpenWorld) return;
      }
      // Skip lights, cameras, and helpers
      if (child.isLight || child.isCamera || child.isSprite) return;
      // Hide everything else (battle stage elements)
      if (child.isMesh || child.isGroup) {
        child.visible = false;
      }
    });
    this.menu.hide();
    this.prompts.hide();
    // Hide battle HUD elements (turn queue, ultimate meter, prompts)
    this.hud.hideBattleUI();
    // Hide atmosphere particles in open world (battle effect)
    this.atmosphere._active = false;
    // Update controls hint for exploration
    this._setControlsHint('openworld');
    // Show open world
    this.openWorld.show();
    // Face player toward encounter zones (negative Z)
    this.openWorld._playerAngle = Math.PI;
    // Start player closer to action
    this.openWorld._playerPos.set(0, 0, -2);
    // Position camera behind player, looking toward zones
    this.renderer.camera.position.set(0, 6, 6);
    this.renderer.camera.lookAt(0, 1.5, -12);
    this._cameraCurrentPos.copy(this.renderer.camera.position);
    this._cameraCurrentLook.set(0, 1.5, -12);
    // Reset fog for open world — denser, atmospheric forest fog
    this.renderer.scene.fog = new THREE.FogExp2(0x0a0a18, 0.012);
    this.hud.addStatusMessage('Exploriere die Welt — Gehe zu roten Markierungen f\u00fcr K\u00e4mpfe!');
    // Start forest ambience
    this.audio.stopBattleBed();
    this.audio.startAmbience();
  }

  _setControlsHint(mode) {
    const hint = document.getElementById('controls-hint');
    if (!hint) return;
    if (mode === 'openworld') {
      hint.innerHTML = `
        <div><span class="key-icon">WASD</span> Bewegen</div>
        <div><span class="key-icon">R</span> Interagieren</div>
        <div><span class="key-icon">Maus</span> Kamera drehen</div>
      `;
    } else {
      hint.innerHTML = `
        <div><span class="key-icon">\u2191\u2193</span> Navigieren</div>
        <div><span class="key-icon">Enter</span> Best\u00e4tigen</div>
        <div><span class="key-icon">Space</span> Parry</div>
        <div><span class="key-icon">Shift</span> Dodge</div>
        <div><span class="key-icon">U</span> Ultimate</div>
      `;
    }
  }

  _enterBattle() {
    this._gameMode = 'battle';
    this._inOpenWorld = false;
    // Hide open world
    this.openWorld.hide();
    // Show battle entities and entire battle stage
    for (const c of this.party) c.mesh.visible = true;
    for (const e of this.enemies) e.mesh.visible = true;
    if (this.renderer._battleStage) {
      this.renderer._battleStage.visible = true;
      this.renderer._battleStage.traverse(c => { c.visible = true; });
    }
    // Show all battle stage meshes (restore visibility) — but NOT open world
    const owGroup = this.openWorld._group;
    this.renderer.scene.traverse(child => {
      if (child === owGroup) return; // skip open world
      if (child.isMesh || child.isGroup) {
        child.visible = true;
      }
    });
    // Reset fog for battle — lighter, less dense
    this.renderer.scene.fog = new THREE.FogExp2(0x0e0e1a, 0.015);
    // Show battle HUD
    this.hud.showBattleUI();
    this.prompts.show();
    // Restore battle controls hint
    this._setControlsHint('battle');
    // Re-enable atmosphere for battle
    this.atmosphere._active = true;
    // Stop ambience, start battle music
    this.audio.stopAmbience();
    // Camera to battle position
    this.renderer.camera.position.set(0, 5, 14);
    this._cameraCurrentPos.copy(this.renderer.camera.position);
    this._cameraCurrentLook.set(0, 1.5, 0);
    this._cameraToPos.copy(this.renderer.camera.position);
    this._cameraFromPos.copy(this.renderer.camera.position);
    this._cameraTransitionProgress = 1; // No transition, snap to position
    // Start battle
    this._startBattle();
  }

  _startEncounter(zone) {
    this.hud.addStatusMessage(`Kampf: ${zone.label}!`);
    // Remove old enemy meshes from scene
    for (const e of this.enemies) {
      if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
    }
    // Spawn new enemies based on zone
    this.enemies = [];

    // Handle roaming enemy attacks
    if (zone.roamingEnemy) {
      const re = zone.roamingEnemy;
      this.enemies.push(new Enemy(EnemyDefs[re.type] || EnemyDefs.dark_wolf));
      // Add a second enemy for variety
      const secondTypes = ['dark_wolf', 'shadow_stalker', 'skeleton_warrior', 'cave_spider'];
      const second = secondTypes[Math.floor(Math.random() * secondTypes.length)];
      this.enemies.push(new Enemy(EnemyDefs[second]));
    }
    // Zone-based encounters
    else if (zone.label === 'Dunkler Wald') {
      this.enemies.push(new Enemy(EnemyDefs.dark_wolf));
      this.enemies.push(new Enemy(EnemyDefs.shadow_stalker));
    } else if (zone.label === 'Verfallene Ruinen') {
      this.enemies.push(new Enemy(EnemyDefs.skeleton_warrior));
      this.enemies.push(new Enemy(EnemyDefs.dark_mage));
    } else if (zone.label === 'Schattenhöhle') {
      this.enemies.push(new Enemy(EnemyDefs.cave_spider));
      this.enemies.push(new Enemy(EnemyDefs.goblin_shaman));
    } else {
      this.enemies.push(new Enemy(EnemyDefs.iron_golem));
      this.enemies.push(new Enemy(EnemyDefs.shadow_weaver));
    }

    // Position + add new enemy meshes to scene
    for (const e of this.enemies) {
      e.mesh.position.set((Math.random() - 0.5) * 4, 0, -4 - Math.random() * 2);
      e.mesh.rotation.y = Math.PI;
      this.renderer.scene.add(e.mesh);
    }
    setTimeout(() => this._enterBattle(), 600);
  }

  _handleInteraction(item) {
    if (item.type === 'campfire') {
      this.hud.addStatusMessage('Lagerfeuer — HP & AP wiederhergestellt!');
      for (const c of this.party) {
        c.hp = c.maxHp;
        c.ap = c.maxAp;
      }
      this.audio.playHeal();
    } else if (item.type === 'well') {
      this.hud.addStatusMessage('Brunnen — Status-Effekte geheilt!');
      for (const c of this.party) {
        c.statusEffects = [];
        c.stagger = 0;
      }
      this.audio.playHeal();
    } else if (item.type === 'chest') {
      this.hud.addStatusMessage('Schatztruhe — Gold und Items gefunden!');
      this.audio.playStatus();
      // Give bonus HP/AP to all party members
      for (const c of this.party) {
        c.hp = Math.min(c.maxHp, c.hp + 20);
        c.ap = Math.min(c.maxAp, c.ap + 2);
      }
    } else if (item.type === 'crate') {
      this.hud.addStatusMessage('Vorratskiste — Heiltränke gefunden!');
      this.audio.playStatus();
      for (const c of this.party) {
        c.hp = Math.min(c.maxHp, c.hp + 15);
      }
    } else if (item.type === 'book') {
      this.hud.addStatusMessage('Altes Buch — +10 Ultimate Meter!');
      this.audio.playStatus();
      this.battle.ultimateMeter = Math.min(100, this.battle.ultimateMeter + 10);
    }
  }

  _setupEvents() {
    const b = this.battle;

    b.events.on('state-change', ({ state }) => {
      this._onStateChange(state);
    });

    b.events.on('player-turn-start', ({ character }) => {
      this.hud.setCurrentActor(character);
      this.hud.setTurnQueue(b.turnQueue.getUpcoming(6));
      // Menu is shown by _onStateChange(ACTION_SELECT) - no need to show here
      this._moveCameraTo(character, false);
    });

    b.events.on('enemy-telegraph', ({ attacker, target, attack, hitCount, attackType }) => {
      this.hud.setCurrentActor(attacker);
      this.prompts.startTelegraph(hitCount, attackType);
      this.audio.playTelegraph();
      attacker.setAnim('telegraph');
      attacker.faceTarget(target.mesh.position);
      this._moveCameraTo(attacker, true);
    });

    b.events.on('reaction-hit', ({ result, hitIndex }) => {
      this.prompts.onHit(result, hitIndex);
      if (result === ReactionResult.PARRY) {
        this.audio.playParry();
        this.renderer.flashMagic(0xffd700, 0.3);
        this.hud.screenFlash('#ffd700', 0.15);
        this.particles.spawnParryFlash(this.battle._enemyAttackData?.target.mesh.position || new THREE.Vector3());
      } else if (result === ReactionResult.DODGE) {
        this.audio.playDodge();
        this.hud.screenFlash('#66ccff', 0.1);
      } else if (result === ReactionResult.BLOCKED) {
        this.audio.playHit();
        this.hud.screenFlash('#ff6644', 0.15);
      }
    });

    b.events.on('reaction-complete', () => {
      this.prompts.end();
    });

    b.events.on('enemy-turn-resolved', ({ totalDamage, parryCount, attacker, target }) => {
      if (totalDamage > 0) {
        target.setAnim('hit');
        this.audio.playHit();
        this.hud.screenFlash('#ff4444', 0.1);
        this.damageNumbers.show(target.mesh.position.clone().add(new THREE.Vector3(0, 2, 0)), totalDamage, { color: '#ff4444' });
        this.particles.spawnImpact(target.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff4444, 8);
        this._shakeIntensity = 0.08;
        this._shakeDuration = 0.2;
        this._shakeElapsed = 0;
      }
      if (parryCount > 0) {
        this.audio.playCounter();
        this.damageNumbers.show(attacker.mesh.position.clone().add(new THREE.Vector3(0, 2, 0)),
          Math.round(target.atk * 0.6 * parryCount), { color: '#ffd700', isCrit: true });
        this.particles.spawnImpact(attacker.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xffd700, 15);
      }
    });

    b.events.on('action-resolved', ({ actor, target, result, skill }) => {
      if (result.damage > 0) {
        target.setAnim('hit');
        const pos = target.mesh.position.clone().add(new THREE.Vector3(0, 2, 0));
        this.damageNumbers.show(pos, result.damage, {
          color: result.isWeakness ? '#ff8800' : (result.isCrit ? '#ffdd00' : '#ff4444'),
          isCrit: result.isCrit,
        });
        this.particles.spawnImpact(
          target.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)),
          result.isWeakness ? 0xff8800 : 0xff4444,
          result.isCrit ? 20 : 10
        );
        // Camera shake on hit
        this._shakeIntensity = result.isCrit ? 0.15 : (result.isWeakness ? 0.1 : 0.06);
        this._shakeDuration = result.isCrit ? 0.3 : 0.2;
        this._shakeElapsed = 0;
        if (result.isCrit) {
          this.audio.playCrit();
          this.hud.screenFlash('#ffdd00', 0.12);
        } else if (result.isWeakness) {
          this.audio.playWeakness();
        } else {
          this.audio.playHit();
        }
        actor.setAnim('attack');
      }
      if (result.heal > 0) {
        const pos = target.mesh.position.clone().add(new THREE.Vector3(0, 2, 0));
        this.damageNumbers.show(pos, `+${result.heal}`, { color: '#44ff44', isHeal: true });
        this.particles.spawnHealParticles(target.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)));
        this.audio.playHeal();
        actor.setAnim('heal');
      }
      if (result.statusEffects.length > 0) {
        this.audio.playStatus();
        for (const se of result.statusEffects) {
          this.hud.addStatusMessage(`${target.name} is ${se.type}!`);
        }
      }
      this.hud.setUltimateMeter(b.ultimateMeter);
    });

    b.events.on('stagger-break', ({ entity }) => {
      this.hud.addStatusMessage(`${entity.name} is STAGGERED!`);
      this.hud.screenFlash('#ffaa44', 0.2);
      this.particles.spawnImpact(entity.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xffaa44, 25);
    });

    b.events.on('ultimate-executed', () => {
      this.audio.playUltimateRelease();
      this.hud.screenFlash('#ffd700', 0.4);
      this.renderer.flashMagic(0xffd700, 0.8);
      if (this.postfx.active) this.postfx.setBloomStrength(1.0);
      setTimeout(() => { if (this.postfx.active) this.postfx.setBloomStrength(0.35); }, 1000);
    });

    b.events.on('parry-success', () => {
      this.hud.setComboCount(this.battle.reactionSystem.comboCount);
    });

    b.events.on('battle-victory', () => {
      this.audio.stopBattleBed();
      this.audio.playVictory();
      this.hud.addStatusMessage('Sieg! Die Expedition geht weiter...');
      // Transition to open world after short delay
      setTimeout(() => this._enterOpenWorld(), 1500);
    });

    b.events.on('battle-defeat', () => {
      this.audio.stopBattleBed();
      this.audio.playDefeat();
      this._endTitle.textContent = 'NIEDERLAGE';
      this._endTitle.style.color = '#cc4444';
      this._endSub.textContent = 'Die Expedition ist gescheitert...';
      this._endOverlay.style.display = 'flex';
    });

    // Death handling
    b.events.on('damage-dealt', ({ target }) => {
      if (target.hp <= 0 && !target.isDeadHandled) {
        target.isDeadHandled = true;
        target.setAnim('death');
        this.particles.spawnDeathDissolve(
          target.mesh.position.clone(),
          target.id === 'iron_golem' ? 0x5a5a6a : 0x2a1a3a,
          50
        );
        this.hud.addStatusMessage(`${target.name} has fallen!`);
        this.hud.screenFlash('#ff0000', 0.3);
      }
    });
  }

  _setupInput() {
    this._keyState = {};
    this._mouseAngleX = 0; // horizontal camera rotation (yaw)
    this._mouseAngleY = 0; // vertical camera rotation (pitch)
    this._pointerLocked = false;

    // Pointer lock for open world camera - click anywhere to activate
    this.container.addEventListener('click', (e) => {
      if (this._gameMode === 'openworld' && !this._pointerLocked) {
        this.container.requestPointerLock();
      }
    });

    // Also allow escape to exit pointer lock
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this._pointerLocked && this._gameMode === 'openworld') {
        document.exitPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this._pointerLocked = !!document.pointerLockElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (this._pointerLocked && this._gameMode === 'openworld') {
        this._mouseAngleX -= e.movementX * 0.002;
        this._mouseAngleY = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this._mouseAngleY - e.movementY * 0.002));
      }
    });

    // Mouse wheel for zoom in open world
    document.addEventListener('wheel', (e) => {
      if (this._gameMode === 'openworld') {
        this._cameraDistance = Math.max(5, Math.min(20, this._cameraDistance + e.deltaY * 0.01));
      }
    });

    window.addEventListener('keydown', (e) => {
      // Init audio on first interaction
      this.audio.init();
      this.audio.resume();

      if (this.battle.state === BattleState.REACTION) {
        if (e.code === 'Space') {
          e.preventDefault();
          const result = this.battle.reactionSystem.react('parry');
          if (result) this.audio.playParry();
        }
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          e.preventDefault();
          const result = this.battle.reactionSystem.react('dodge');
          if (result) this.audio.playDodge();
        }
        return;
      }

      if (this.battle.state === BattleState.AIM_MODE) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          const aimData = this.targeting.confirm();
          if (aimData) {
            this.targeting.stop();
            this.battle.executeAimedAttack(aimData);
          }
        }
        if (e.code === 'Escape') {
          e.preventDefault();
          this.targeting.stop();
          this._showActionMenu(this.battle.currentActor);
        }
        return;
      }

      if (this.menu.visible) {
        if (e.code === 'ArrowUp' || e.code === 'KeyW') {
          e.preventDefault();
          this.menu.moveUp();
          this.audio.playBlip();
        }
        if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          e.preventDefault();
          this.menu.moveDown();
          this.audio.playBlip();
        }
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          this.menu.select();
          this.audio.playConfirm();
        }
        if (e.code === 'Escape') {
          e.preventDefault();
          this.menu.cancel();
        }
      }

      // Ultimate
      if (e.code === 'KeyU' && this.battle.ultimateMeter >= 100 && this.battle.state === BattleState.ACTION_SELECT) {
        this.battle.executeUltimate();
        this.audio.playUltimateRelease();
      }

      this._keyState[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
      this._keyState[e.code] = false;
    });
  }

  _handleMenuSelect(item) {
    const actor = this.battle.currentActor;
    if (!actor) return;

    if (item.action === 'attack') {
      const target = this.battle.getLivingEnemies()[0];
      if (target) {
        const skill = { name: 'Basic Attack', type: 'damage', damage: actor.atk, apCost: 0, apGain: 1, hits: 1, element: 'physical' };
        this.battle.executePlayerAttack(skill, target);
        this.audio.playAttack();
      }
    } else if (item.action === 'skill') {
      const target = this.battle.getLivingEnemies()[0];
      if (target) {
        this.battle.executePlayerAttack(item.skill, target);
        this.audio.playAttack();
      }
    } else if (item.action === 'heal') {
      const target = [...this.battle.getLivingParty()].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (target) {
        this.battle.executePlayerAttack(item.skill, target);
      }
    } else if (item.action === 'buff_self') {
      // Apply buff directly, spend AP, advance turn
      actor.ap = Math.max(0, actor.ap - (item.skill.apCost || 0));
      if (item.skill.buffStat === 'def') {
        actor.def += item.skill.buffValue;
        setTimeout(() => { actor.def = Math.max(0, actor.def - item.skill.buffValue); }, 5000);
      } else if (item.skill.buffStat === 'atk' && item.skill.buffAllies) {
        for (const c of this.party) c.atk += item.skill.buffValue;
        setTimeout(() => { for (const c of this.party) c.atk = Math.max(5, c.atk - item.skill.buffValue); }, 5000);
      } else if (item.skill.buffStat === 'atk') {
        actor.atk += item.skill.buffValue;
        setTimeout(() => { actor.atk = Math.max(5, actor.atk - item.skill.buffValue); }, 5000);
      }
      this.hud.addStatusMessage(`${actor.name} uses ${item.skill.name}!`);
      this.audio.playStatus();
      actor.setAnim('attack');
      // Advance turn after buff
      this.battle._nextTurn();
    } else if (item.action === 'ultimate') {
      this.battle.executeUltimate();
      this.audio.playUltimateRelease();
    } else if (item.action === 'aim') {
      this.menu.hide();
      this.battle._transitionTo(BattleState.AIM_MODE);
      this.targeting.start(this.battle.getLivingEnemies());
    }
  }

  _setupMenu() {
    // Override menu's select to use our handler
    const origSelect = this.menu.select.bind(this.menu);
    this.menu.select = () => {
      if (!this.menu._visible || this.menu._items.length === 0) return;
      const item = this.menu._items[this.menu._selectedIndex];
      if (item.disabled) return;
      if (item.submenu) {
        this.menu._subMenu = item.submenu;
        this.menu._items = item.submenu;
        this.menu._selectedIndex = 0;
        this.menu._render();
        return;
      }
      this._handleMenuSelect(item);
      // Only hide menu if we're NOT going back to ACTION_SELECT (where _onStateChange will show it)
      if (this.battle.state !== BattleState.ACTION_SELECT) {
        this.menu.hide();
      }
    };
  }

  _showActionMenu(character) {
    console.log('[Game] _showActionMenu for', character.name, 'AP:', character.ap);
    const items = [
      { name: '⚔ Attack', description: 'Basic attack (builds AP)', action: 'attack' },
    ];

    for (const skill of character.skills) {
      const canAfford = character.ap >= (skill.apCost || 0);
      items.push({
        name: `✦ ${skill.name}`,
        description: skill.description,
        apCost: skill.apCost,
        action: skill.type === 'heal' ? 'heal' : (skill.type === 'buff' ? 'buff_self' : 'skill'),
        skill,
        disabled: !canAfford,
      });
    }

    items.push({ name: '◎ Aim Shot', description: 'Free-aim ranged attack', action: 'aim' });

    if (this.battle.ultimateMeter >= 100) {
      items.unshift({ name: '★ ULTIMATE [U]', description: 'Unleash full power!', action: 'ultimate', apCost: 0 });
    }

    console.log('[Game] Showing menu with', items.length, 'items');
    this.menu.show(items);
    console.log('[Game] menu.show() called, menu._visible=', this.menu._visible, 'menu.el.style.display=', this.menu.el.style.display);
  }

  _onStateChange(state) {
    console.log('[Game] _onStateChange:', state, '| currentActor:', this.battle.currentActor?.name, '| inParty:', this.party.includes(this.battle.currentActor));
    if (state === BattleState.AIM_MODE) {
      // handled in input
    } else if (state === BattleState.ACTION_SELECT) {
      // Show menu for action selection
      const actor = this.battle.currentActor;
      console.log('[Game] ACTION_SELECT: actor=', actor?.name, 'in party=', this.party.includes(actor));
      if (actor && this.party.includes(actor)) {
        console.log('[Game] Calling _showActionMenu for', actor.name);
        this._showActionMenu(actor);
        console.log('[Game] After _showActionMenu, menu.visible=', this.menu.visible);
      }
    } else if (state === BattleState.REACTION || state === BattleState.TELEGRAPH) {
      // Hide menu during enemy attacks
      this.menu.hide();
      // Reset safety counter when entering REACTION/TELEGRAPH
      this._reactionFrameCount = 0;
    } else {
      // Hide menu for all other states (PLAYER_ACTION, ENEMY_TURN, etc.)
      console.log('[Game] Hiding menu for state:', state);
      this.menu.hide();
    }
  }

  _moveCameraTo(entity, isEnemy) {
    const pos = entity.mesh.position;
    
    if (isEnemy) {
      // Enemy attacking: camera behind enemy, looking at party
      // Enemy is at z=-4, so offset +Z puts camera behind enemy
      this._cameraToPos.set(pos.x, pos.y + 3, pos.z + 7);
      this._cameraToLook.set(0, 1.5, 4); // Look at party
    } else {
      // Player attacking: camera behind player, looking at enemies
      // Player is at z=4, so offset +Z puts camera behind player (further from enemies)
      this._cameraToPos.set(pos.x, pos.y + 3, pos.z + 8);
      this._cameraToLook.set(0, 1.5, -4); // Look at enemies
    }

    this._cameraFromPos.copy(this.renderer.camera.position);
    this._cameraFromLook.copy(this._cameraCurrentLook);
    this._cameraTransitionProgress = 0;
  }

  update(deltaTime) {
    if (!this.running) return;

    const dt = Math.min(deltaTime, 0.05); // cap delta

    // Update battle reaction system
    if (this.battle.state === BattleState.REACTION) {
      this.battle.reactionSystem.update(dt);
      this.prompts.setProgress(this.battle.reactionSystem.getTelegraphProgress());
      
      // Safety: if stuck in REACTION for too many frames, force resolve
      this._reactionFrameCount = (this._reactionFrameCount || 0) + 1;
      if (this._reactionFrameCount > 240) { // ~4 seconds at 60fps
        const rs = this.battle.reactionSystem;
        if (rs._active && !rs._resolved) {
          while (rs._currentHitIndex < rs._hitTimes.length) {
            rs._results.push('miss');
            rs._currentHitIndex++;
          }
          rs._checkComplete();
        }
      }
    }

    // Update targeting
    if (this.battle.state === BattleState.AIM_MODE) {
      this.targeting.update(dt);
    }

    // Camera shake
    if (this._shakeDuration > 0) {
      this._shakeElapsed += dt;
      const shakeProgress = this._shakeElapsed / this._shakeDuration;
      if (shakeProgress < 1) {
        const decay = 1 - shakeProgress;
        const intensity = this._shakeIntensity * decay;
        this._shakeOffset.set(
          (Math.random() - 0.5) * 2 * intensity,
          (Math.random() - 0.5) * 2 * intensity * 0.5,
          (Math.random() - 0.5) * intensity * 0.3
        );
      } else {
        this._shakeDuration = 0;
        this._shakeOffset.set(0, 0, 0);
      }
    }

    // Camera transition
    if (this._cameraTransitionProgress < 1) {
      this._cameraTransitionProgress += dt / this._cameraTransitionDuration;
      const t = Math.min(this._cameraTransitionProgress, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // inOutQuad

      this.renderer.camera.position.lerpVectors(this._cameraFromPos, this._cameraToPos, ease);
      this._cameraCurrentLook.lerpVectors(this._cameraFromLook, this._cameraToLook, ease);
      this.renderer.camera.lookAt(this._cameraCurrentLook);
    }

    // Apply shake offset
    if (this._shakeDuration > 0) {
      this.renderer.camera.position.add(this._shakeOffset);
    }

    // Animate entities
    for (const c of this.party) {
      if (!c.isDead) {
        c.animate(dt);
        c.updateHpBar();
      }
    }
    for (const e of this.enemies) {
      if (!e.isDead) {
        e.animate(dt);
        e.updateHpBar();
      }
    }

    // Face targets
    for (const c of this.party) {
      const enemies = this.battle.getLivingEnemies();
      if (enemies.length > 0) c.faceTarget(enemies[0].mesh.position);
    }
    for (const e of this.enemies) {
      const party = this.battle.getLivingParty();
      if (party.length > 0) e.faceTarget(party[0].mesh.position);
    }

    // Update FX
    this.atmosphere.update(dt);
    this.particles.update(dt);

    // Update HUD
    this.hud.setTurnQueue(this.battle.turnQueue.getUpcoming(6));
    this.hud.setUltimateMeter(this.battle.ultimateMeter);
    this.hud.update(dt);
    this.prompts.update(dt);

    // Battle intensity (lighting)
    const avgHp = this.party.reduce((s, c) => s + c.hp / c.maxHp, 0) / this.party.length;
    this.renderer.setIntensity(clamp(1 - avgHp, 0, 1));

    // Open world update
    if (this._gameMode === 'openworld') {
      this.openWorld.update(dt, this._keyState, this._mouseAngleX, this._mouseAngleY, this._cameraDistance);
    }
  }

  render() {
    // Update post-fx (film grain time)
    if (this.postfx.active) {
      this.postfx.update(performance.now() / 1000);
    }

    const composer = this.postfx.active ? this.postfx.composer : null;
    this.renderer.render(composer);

    // Render HUD on top
    this.hud.render();
    this.prompts.render();
  }

  start() {
    // Play intro sequence first, then start the game loop
    this.intro.play(defaultStoryLines, () => {
      this.running = true;
      this._lastTime = performance.now();
      this._loop();
    });
  }

  _loop() {
    if (!this.running) return;
    const now = performance.now();
    const dt = (now - this._lastTime) / 1000;
    this._lastTime = now;

    this.update(dt);
    this.render();

    requestAnimationFrame(() => this._loop());
  }
}
