import * as THREE from 'three';
import { getCombatRNG } from '../core/rng.js';
import { createEnemyTexture } from '../engine/textures.js';

// Enemy class with telegraphed attack patterns

export class Enemy {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.side = 'enemy';
    this.enemyType = config.type;
    
    // Stats
    this.stats = {
      maxHP: config.maxHP || 80,
      hp: config.hp || config.maxHP || 80,
      maxAP: config.maxAP || 3,
      ap: config.ap || 0,
      attack: config.attack || 18,
      defense: config.defense || 10,
      magic: config.magic || 12,
      speed: config.speed || 11,
      crit: config.crit || 6
    };

    // Weaknesses and resistances
    this.weaknesses = config.weaknesses || [];
    this.resistances = config.resistances || [];
    
    // Attack patterns (for telegraphed attacks)
    this.attackPatterns = config.attackPatterns || this.getDefaultPatterns();
    
    // Status effects
    this.statusEffects = [];
    
    // Visuals
    this.mesh = null;
    this.color = config.color || 0x666666;
    this.glowColor = config.glowColor || null;
    this.hasWeakPoints = config.hasWeakPoints !== false;
    
    // Animation state
    this.animationState = 'idle';
    this.animTime = 0;
    
    // Position
    this.position = new THREE.Vector3();
    
    // Combat state
    this.isStunned = false;
    this.isDead = false;
    this.isStaggered = false;
    this.staggerMeter = 0;
    this.maxStagger = 100;
    
    // Boss phase (if applicable)
    this.phase = 1;
    this.maxPhases = config.phases || 1;
    
    // Animation state
    this.animTime = 0;
  }

  init(position) {
    this.position.copy(position);
    this.createMesh();
  }

  createMesh() {
    const group = new THREE.Group();

    if (this.enemyType === 'shadow_beast') {
      this.createShadowBeastMesh(group);
    } else if (this.enemyType === 'corrupted_knight') {
      this.createCorruptedKnightMesh(group);
    } else if (this.enemyType === 'elder_wisp') {
      this.createElderWispMesh(group);
    } else if (this.enemyType === 'boss_void_lord') {
      this.createVoidLordMesh(group);
    }

    // Add menacing glow effect
    const auraLight = new THREE.PointLight(this.color, 0.6, 10);
    auraLight.position.set(0, 3, 0);
    group.add(auraLight);

    group.position.copy(this.position);
    group.userData.entity = this;
    
    this.mesh = group;
  }

  createShadowBeastMesh(group) {
    // Dark, jagged creature
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.9,
      metalness: 0.2,
      emissive: 0x330044,
      emissiveIntensity: 0.2
    });

    // Main body (jagged)
    const bodyGeom = new THREE.ConeGeometry(0.6, 1.5, 8);
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.75;
    body.castShadow = true;
    group.add(body);

    // Multiple eyes (glowing)
    const eyeGeom = new THREE.SphereGeometry(0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3366 });
    
    for (let i = 0; i < 5; i++) {
      const eye = new THREE.Mesh(eyeGeom, eyeMat);
      const angle = (i / 5) * Math.PI * 2;
      eye.position.set(
        Math.cos(angle) * 0.3,
        1.0 + Math.sin(angle * 3) * 0.2,
        Math.sin(angle) * 0.3
      );
      group.add(eye);
    }

    // Claw arms
    const clawGeom = new THREE.ConeGeometry(0.15, 1.0, 6);
    const leftClaw = new THREE.Mesh(clawGeom, bodyMat);
    leftClaw.position.set(-0.7, 1.0, 0.2);
    leftClaw.rotation.z = Math.PI / 4;
    group.add(leftClaw);

    const rightClaw = new THREE.Mesh(clawGeom, bodyMat);
    rightClaw.position.set(0.7, 1.0, 0.2);
    rightClaw.rotation.z = -Math.PI / 4;
    group.add(rightClaw);

    // Shadow particles around
    this.createShadowParticles(group);
  }

  createShadowParticles(group) {
    const particleCount = 30;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 1.5;
      positions[i * 3 + 1] = Math.random() * 2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    }
    
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const mat = new THREE.PointsMaterial({
      color: 0x6600cc,
      size: 0.08,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });
    
    const particles = new THREE.Points(geom, mat);
    particles.name = 'shadowParticles';
    group.add(particles);
  }

  createCorruptedKnightMesh(group) {
    // Dark armored warrior
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a3a,
      roughness: 0.4,
      metalness: 0.7
    });

    // Torso (heavy armor)
    const torsoGeom = new THREE.BoxGeometry(1.0, 1.2, 0.6);
    const torso = new THREE.Mesh(torsoGeom, armorMat);
    torso.position.y = 1.3;
    torso.castShadow = true;
    group.add(torso);

    // Spiked shoulder pads
    const spikeGeom = new THREE.ConeGeometry(0.2, 0.5, 8);
    const leftSpike = new THREE.Mesh(spikeGeom, armorMat);
    leftSpike.position.set(-0.6, 1.9, 0);
    leftSpike.rotation.z = Math.PI / 6;
    group.add(leftSpike);

    const rightSpike = new THREE.Mesh(spikeGeom, armorMat);
    rightSpike.position.set(0.6, 1.9, 0);
    rightSpike.rotation.z = -Math.PI / 6;
    group.add(rightSpike);

    // Head (helmet with glowing eyes)
    const headGeom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const head = new THREE.Mesh(headGeom, armorMat);
    head.position.y = 2.1;
    group.add(head);

    // Glowing red eyes
    const eyeGeom = new THREE.SphereGeometry(0.08);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    
    const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
    leftEye.position.set(-0.15, 2.15, 0.28);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
    rightEye.position.set(0.15, 2.15, 0.28);
    group.add(rightEye);

    // Legs
    const legGeom = new THREE.BoxGeometry(0.35, 1.4, 0.4);
    const leftLeg = new THREE.Mesh(legGeom, armorMat);
    leftLeg.position.set(-0.3, 0.5, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeom, armorMat);
    rightLeg.position.set(0.3, 0.5, 0);
    group.add(rightLeg);

    // Greatsword
    const swordGeom = new THREE.BoxGeometry(0.2, 2.0, 0.1);
    const swordMat = new THREE.MeshStandardMaterial({ 
      color: 0x444, 
      metalness: 0.9,
      emissive: 0x300,
      emissiveIntensity: 0.3
    });
    const greatsword = new THREE.Mesh(swordGeom, swordMat);
    greatsword.position.set(0.8, 1.5, 0.4);
    greatsword.rotation.z = -Math.PI / 6;
    group.add(greatsword);

    // Sword hilt
    const hiltGeom = new THREE.BoxGeometry(0.4, 0.1, 0.1);
    const hiltMat = new THREE.MeshStandardMaterial({ color: 0x321 });
    const hilt = new THREE.Mesh(hiltGeom, hiltMat);
    hilt.position.set(0.8, 0.6, 0.4);
    group.add(hilt);
  }

  createElderWispMesh(group) {
    // Floating magical enemy
    const coreMat = new THREE.MeshStandardMaterial({
      color: this.color,
      emissive: this.color,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.9
    });

    // Core
    const coreGeom = new THREE.OctahedronGeometry(0.5);
    const core = new THREE.Mesh(coreGeom, coreMat);
    core.position.y = 1.2;
    core.castShadow = true;
    group.add(core);

    // Rotating rings
    const ringGeom = new THREE.TorusGeometry(0.8, 0.05, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({ 
      color: this.color,
      transparent: true,
      opacity: 0.5
    });

    const ring1 = new THREE.Mesh(ringGeom, ringMat.clone());
    ring1.userData.rotateAxis = 'x';
    group.add(ring1);

    const ring2 = new THREE.Mesh(ringGeom, ringMat.clone());
    ring2.rotation.x = Math.PI / 2;
    ring2.userData.rotateAxis = 'y';
    group.add(ring2);

    // Floating crystals
    const crystalGeom = new THREE.ConeGeometry(0.15, 0.4, 4);
    const crystalMat = new THREE.MeshStandardMaterial({ 
      color: this.color,
      emissive: this.color,
      emissiveIntensity: 0.5
    });

    for (let i = 0; i < 4; i++) {
      const crystal = new THREE.Mesh(crystalGeom, crystalMat.clone());
      const angle = (i / 4) * Math.PI * 2;
      crystal.position.set(
        Math.cos(angle) * 1.2,
        1.2,
        Math.sin(angle) * 1.2
      );
      crystal.userData.angle = angle;
      group.add(crystal);
    }
  }

  createVoidLordMesh(group) {
    // Boss enemy - massive void entity
    const voidMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a1a,
      roughness: 0.3,
      metalness: 0.5,
      emissive: 0x220044,
      emissiveIntensity: 0.4
    });

    // Main body (large sphere)
    const bodyGeom = new THREE.SphereGeometry(2.0, 32, 32);
    const body = new THREE.Mesh(bodyGeom, voidMat);
    body.position.y = 2.5;
    body.castShadow = true;
    group.add(body);

    // Inner glowing core
    const coreGeom = new THREE.SphereGeometry(1.0, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({ 
      color: 0x8800ff,
      transparent: true,
      opacity: 0.8
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    core.position.y = 2.5;
    group.add(core);

    // Multiple eyes
    const eyeGeom = new THREE.SphereGeometry(0.3);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff33ff });
    
    for (let i = 0; i < 8; i++) {
      const eye = new THREE.Mesh(eyeGeom, eyeMat);
      const theta = (i / 8) * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      eye.position.set(
        2.0 * Math.sin(phi) * Math.cos(theta) + Math.cos(theta) * 0.5,
        2.5 + 2.0 * Math.sin(phi) * Math.sin(theta),
        2.0 * Math.cos(phi)
      );
      group.add(eye);
    }

    // Tentacles
    for (let i = 0; i < 6; i++) {
      const tentacle = this.createTentacle(voidMat);
      const angle = (i / 6) * Math.PI * 2;
      tentacle.position.set(
        Math.cos(angle) * 2.5,
        1.0,
        Math.sin(angle) * 2.5
      );
      tentacle.userData.baseAngle = angle;
      group.add(tentacle);
    }

    // Aura particles
    this.createVoidAura(group);
  }

  createTentacle(material) {
    const segments = 8;
    const group = new THREE.Group();
    
    for (let i = 0; i < segments; i++) {
      const segmentGeom = new THREE.CylinderGeometry(
        0.3 - i * 0.03, 
        0.25 - i * 0.025, 
        0.4, 
        8
      );
      const segment = new THREE.Mesh(segmentGeom, material);
      segment.position.y = i * 0.4;
      segment.castShadow = true;
      group.add(segment);
    }
    
    return group;
  }

  createVoidAura(group) {
    const particleCount = 100;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = 2.5 + Math.random() * 1.5;
      
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = 2.5 + r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      colors[i * 3] = 0.4;
      colors[i * 3 + 1] = 0.0;
      colors[i * 3 + 2] = 0.8;
    }
    
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const mat = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });
    
    const aura = new THREE.Points(geom, mat);
    group.add(aura);
  }

  getDefaultPatterns() {
    if (this.enemyType === 'shadow_beast') {
      return [
        {
          name: 'Shadow Slash',
          damage: this.stats.attack * 0.9,
          telegraphTime: 1.0,
          hits: [
            { damage: this.stats.attack * 0.8, delay: 1.5 },
            { damage: this.stats.attack * 0.6, delay: 0.8 }
          ],
          canParry: true
        },
        {
          name: 'Void Leap',
          damage: this.stats.attack * 1.2,
          telegraphTime: 1.5,
          hits: [{ damage: this.stats.attack * 1.0, delay: 2.0 }],
          mustDodge: true // Grab attack
        }
      ];
    } else if (this.enemyType === 'corrupted_knight') {
      return [
        {
          name: 'Heavy Cleave',
          damage: this.stats.attack * 1.3,
          telegraphTime: 1.8,
          hits: [{ damage: this.stats.attack * 1.1, delay: 2.5 }],
          canParry: true
        },
        {
          name: 'Shield Strike',
          damage: this.stats.attack * 0.8,
          telegraphTime: 1.2,
          hits: [
            { damage: this.stats.attack * 0.7, delay: 1.5 },
            { damage: this.stats.attack * 0.5, delay: 0.6 },
            { damage: this.stats.attack * 0.9, delay: 0.8 }
          ],
          canParry: true
        }
      ];
    } else if (this.enemyType === 'elder_wisp') {
      return [
        {
          name: 'Arcane Burst',
          damage: this.stats.magic * 1.5,
          telegraphTime: 1.4,
          hits: [{ damage: this.stats.magic * 1.2, delay: 1.8 }],
          canParry: true,
          element: 'light'
        },
        {
          name: 'Orb Barrage',
          damage: this.stats.magic * 0.6,
          telegraphTime: 1.6,
          hits: [
            { damage: this.stats.magic * 0.5, delay: 1.2 },
            { damage: this.stats.magic * 0.5, delay: 0.7 },
            { damage: this.stats.magic * 0.5, delay: 0.7 },
            { damage: this.stats.magic * 0.7, delay: 0.8 }
          ],
          canParry: true
        }
      ];
    } else if (this.enemyType === 'boss_void_lord') {
      return [
        {
          name: 'Void Devastation',
          damage: this.stats.attack * 2.0,
          telegraphTime: 2.5,
          hits: [{ damage: this.stats.attack * 1.8, delay: 3.0 }],
          canParry: true
        },
        {
          name: 'Tentacle Storm',
          damage: this.stats.attack * 0.7,
          telegraphTime: 1.5,
          hits: Array(5).fill(0).map((_, i) => ({
            damage: this.stats.attack * 0.6,
            delay: 0.6 + i * 0.4
          })),
          canParry: true
        },
        {
          name: 'Void Grasp',
          damage: this.stats.attack * 1.5,
          telegraphTime: 2.0,
          hits: [{ damage: this.stats.attack * 1.3, delay: 2.8 }],
          mustDodge: true
        }
      ];
    }

    // Default pattern
    return [{
      name: 'Attack',
      damage: this.stats.attack,
      telegraphTime: 1.0,
      hits: [{ damage: this.stats.attack * 0.8, delay: 1.5 }]
    }];
  }

  // Update animation each frame
  update(deltaTime) {
    this.animTime += deltaTime;

    if (this.mesh) {
      // Idle animation varies by type
      if (this.enemyType === 'shadow_beast') {
        this.updateShadowBeastAnimation(deltaTime);
      } else if (this.enemyType === 'elder_wisp' || this.enemyType === 'boss_void_lord') {
        this.updateFloatingAnimation(deltaTime);
      }

      // Update stagger effect
      if (this.isStaggered) {
        this.mesh.rotation.z = Math.sin(this.animTime * 10) * 0.2;
      } else {
        this.mesh.rotation.z *= 0.9;
      }
    }

    // Update status effects
    this.updateStatusEffects(deltaTime);

    // Check boss phase transition
    this.checkPhaseTransition();
  }

  updateShadowBeastAnimation(deltaTime) {
    // Pulsing and slight bobbing
    const pulse = Math.sin(this.animTime * 3) * 0.05;
    this.mesh.scale.set(1 + pulse, 1 - pulse, 1 + pulse);
    
    // Shadow particles
    const particles = this.mesh.getObjectByName('shadowParticles');
    if (particles) {
      particles.rotation.y += deltaTime * 0.5;
    }
  }

  updateFloatingAnimation(deltaTime) {
    // Gentle floating motion
    this.mesh.position.y = this.position.y + Math.sin(this.animTime * 1.5) * 0.2;
    
    // Rotate rings and crystals
    if (this.mesh.children && Array.isArray(this.mesh.children) && this.mesh.children.length > 0) {
      for (let idx = 0; idx < this.mesh.children.length; idx++) {
        const child = this.mesh.children[idx];
        if (child.userData.rotateAxis === 'x') {
          child.rotation.x += deltaTime;
        } else if (child.userData.rotateAxis === 'y') {
          child.rotation.y += deltaTime;
        } else if (child.userData.angle !== undefined) {
          // Orbiting crystals
          const t = this.animTime + child.userData.angle;
          child.position.x = Math.cos(t * 0.5) * 1.2;
          child.position.z = Math.sin(t * 0.5) * 1.2;
          child.rotation.y += deltaTime * 2;
        }
      }
    }
  }

  updateStatusEffects(deltaTime) {
    this.statusEffects = this.statusEffects.filter(effect => {
      effect.duration -= deltaTime;
      return effect.duration > 0;
    });

    if (this.hp <= 0 && !this.isDead) {
      this.isDead = true;
      this.onDeath();
    }
  }

  checkPhaseTransition() {
    if (this.maxPhases > 1 && this.phase < this.maxPhases) {
      const phaseThreshold = (this.maxPhases - this.phase + 1) * (100 / this.maxPhases);
      const hpPercent = (this.hp / this.stats.maxHP) * 100;
      
      if (hpPercent < phaseThreshold) {
        this.phase++;
        this.onPhaseChange();
      }
    }
  }

  onPhaseChange() {
    // Boss phases get stronger
    const multiplier = 1.2;
    this.stats.attack *= multiplier;
    this.stats.defense *= multiplier;
    
    // Heal some HP on phase change
    this.hp = Math.min(this.stats.maxHP, this.hp + this.stats.maxHP * 0.3);
  }

  onDeath() {
    // Death animation - fade and scale down
    const fadeInterval = setInterval(() => {
      if (this.mesh) {
        this.mesh.scale.multiplyScalar(0.92);
        this.mesh.material.forEach?.(m => {
          if (m.transparent) m.opacity *= 0.9;
        });
        
        if (this.mesh.scale.x < 0.1) {
          this.mesh.visible = false;
          clearInterval(fadeInterval);
        }
      }
    }, 50);
  }

  takeDamage(amount, isCrit = false) {
    let actualDamage = amount;
    
    // Crit visual
    if (isCrit) {
      actualDamage = Math.round(amount * 1.5);
    }
    
    // Stagger buildup
    this.staggerMeter += actualDamage * 0.5;
    if (this.staggerMeter >= this.maxStagger && !this.isStaggered) {
      this.isStaggered = true;
      this.staggerMeter = 0;
      // Stagger effect: stunned for 1 turn equivalent
    }

    this.hp = Math.max(0, this.hp - actualDamage);
    
    if (this.hp <= 0) {
      this.isDead = true;
    }
    
    return { damage: actualDamage, isStaggered: this.isStaggered };
  }

  reset() {
    this.hp = this.stats.maxHP;
    this.ap = 0;
    this.statusEffects = [];
    this.isStunned = false;
    this.isDead = false;
    this.isStaggered = false;
    this.staggerMeter = 0;
    this.phase = 1;
    
    if (this.mesh) {
      this.mesh.visible = true;
      this.mesh.scale.set(1, 1, 1);
      this.mesh.rotation.set(0, 0, 0);
    }
  }

  getHPPercent() {
    return this.hp / this.stats.maxHP;
  }

  getStaggerPercent() {
    return Math.min(100, (this.staggerMeter / this.maxStagger) * 100);
  }
}

// Create default enemies
export function createDefaultEnemies() {
  return [
    new Enemy({
      id: 'shadow_beast_1',
      name: 'Shadow Beast',
      type: 'shadow_beast',
      maxHP: 70,
      attack: 20,
      defense: 8,
      magic: 15,
      speed: 13,
      color: 0x1a1a2e,
      glowColor: 0xff3366,
      weaknesses: ['light', 'fire'],
      resistances: ['dark']
    }),

    new Enemy({
      id: 'corrupted_knight_1',
      name: 'Corrupted Knight',
      type: 'corrupted_knight',
      maxHP: 100,
      attack: 24,
      defense: 16,
      magic: 8,
      speed: 9,
      color: 0x2a2a3a,
      glowColor: 0xff0000,
      weaknesses: ['light'],
      resistances: ['physical']
    }),

    new Enemy({
      id: 'elder_wisp_1',
      name: 'Elder Wisp',
      type: 'elder_wisp',
      maxHP: 55,
      attack: 12,
      defense: 6,
      magic: 28,
      speed: 15,
      color: 0x8844ff,
      glowColor: 0xaa66ff,
      weaknesses: ['dark', 'physical'],
      resistances: ['light']
    })
  ];
}

// Create boss enemy
export function createBossEnemy() {
  return new Enemy({
    id: 'boss_void_lord',
    name: 'Void Lord Malakor',
    type: 'boss_void_lord',
    maxHP: 250,
    attack: 30,
    defense: 20,
    magic: 25,
    speed: 12,
    color: 0x0a0a1a,
    glowColor: 0x8800ff,
    phases: 3,
    weaknesses: ['light'],
    resistances: ['dark', 'physical']
  });
}
