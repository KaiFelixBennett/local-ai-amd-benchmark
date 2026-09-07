import * as THREE from 'three';
import { getCombatRNG } from '../core/rng.js';
import { createCharacterTexture, createPortraitTexture } from '../engine/textures.js';
import { getSkillsForClass } from './skill.js';

// Party member class with procedural mesh and animations

export class Character {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.side = 'player';
    this.characterClass = config.class;
    
    // Stats
    this.stats = {
      maxHP: config.maxHP || 100,
      hp: config.hp || config.maxHP || 100,
      maxAP: config.maxAP || 5,
      ap: config.ap || 0,
      attack: config.attack || 20,
      defense: config.defense || 10,
      magic: config.magic || 15,
      speed: config.speed || 12,
      crit: config.crit || 5
    };

    // Skills
    this.skills = getSkillsForClass(this.characterClass);
    
    // Status effects
    this.statusEffects = [];
    this.buffs = [];
    
    // Visuals
    this.mesh = null;
    this.portraitTexture = null;
    this.color = config.color || 0x888888;
    this.accentColor = config.accentColor || 0xffffff;
    
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
  }

  init(position) {
    this.position.copy(position);
    this.createMesh();
    this.portraitTexture = createPortraitTexture(
      new THREE.Color(this.color),
      new THREE.Color(this.accentColor)
    );
  }

  createMesh() {
    const group = new THREE.Group();

    // Body based on class
    if (this.characterClass === 'warrior') {
      this.createWarriorMesh(group);
    } else if (this.characterClass === 'mage') {
      this.createMageMesh(group);
    } else if (this.characterClass === 'healer') {
      this.createHealerMesh(group);
    } else if (this.characterClass === 'ranger') {
      this.createRangerMesh(group);
    }

    // Add weapon glow effect
    const weaponGlow = new THREE.PointLight(this.accentColor, 0.5, 5);
    weaponGlow.position.set(0, 1.5, 0.5);
    group.add(weaponGlow);

    group.position.copy(this.position);
    group.userData.entity = this;
    
    this.mesh = group;
  }

  createWarriorMesh(group) {
    const material = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.7,
      metalness: 0.3
    });

    // Torso (plate armor)
    const torsoGeom = new THREE.BoxGeometry(0.8, 1.0, 0.5);
    const torso = new THREE.Mesh(torsoGeom, material);
    torso.position.y = 1.2;
    torso.castShadow = true;
    group.add(torso);

    // Head (helmet)
    const headGeom = new THREE.SphereGeometry(0.35, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8 });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 2.0;
    group.add(head);

    // Arms
    const armGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.9);
    const leftArm = new THREE.Mesh(armGeom, material);
    leftArm.position.set(-0.55, 1.2, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeom, material);
    rightArm.position.set(0.55, 1.2, 0);
    group.add(rightArm);

    // Legs
    const legGeom = new THREE.CylinderGeometry(0.15, 0.12, 1.2);
    const leftLeg = new THREE.Mesh(legGeom, material);
    leftLeg.position.set(-0.3, 0.4, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeom, material);
    rightLeg.position.set(0.3, 0.4, 0);
    group.add(rightLeg);

    // Shield
    const shieldGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 8);
    const shieldMat = new THREE.MeshStandardMaterial({ color: 0x3a5, metalness: 0.5 });
    const shield = new THREE.Mesh(shieldGeom, shieldMat);
    shield.rotation.x = Math.PI / 2;
    shield.position.set(-0.6, 1.3, 0.4);
    group.add(shield);

    // Sword
    const swordGeom = new THREE.BoxGeometry(0.1, 1.2, 0.05);
    const swordMat = new THREE.MeshStandardMaterial({ color: 0xccc, metalness: 0.9 });
    const sword = new THREE.Mesh(swordGeom, swordMat);
    sword.position.set(0.7, 1.3, 0.4);
    group.add(sword);

    // Sword hilt
    const hiltGeom = new THREE.BoxGeometry(0.25, 0.05, 0.05);
    const hilt = new THREE.Mesh(hiltGeom, new THREE.MeshStandardMaterial({ color: 0x642 }));
    hilt.position.set(0.7, 1.8, 0.4);
    group.add(hilt);
  }

  createMageMesh(group) {
    const robeMat = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.9,
      emissive: this.accentColor,
      emissiveIntensity: 0.1
    });

    // Robe body
    const robeGeom = new THREE.ConeGeometry(0.7, 2.0, 8);
    const robe = new THREE.Mesh(robeGeom, robeMat);
    robe.position.y = 0.8;
    robe.castShadow = true;
    group.add(robe);

    // Head (with pointed hat)
    const headGeom = new THREE.SphereGeometry(0.3, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffd9b3 });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 1.9;
    group.add(head);

    // Hat
    const hatGeom = new THREE.ConeGeometry(0.4, 0.8, 8);
    const hatMat = new THREE.MeshStandardMaterial({ color: this.accentColor });
    const hat = new THREE.Mesh(hatGeom, hatMat);
    hat.position.y = 2.4;
    group.add(hat);

    // Staff
    const staffGeom = new THREE.CylinderGeometry(0.05, 0.05, 2.5);
    const staffMat = new THREE.MeshStandardMaterial({ color: 0x642 });
    const staff = new THREE.Mesh(staffGeom, staffMat);
    staff.position.set(0.6, 1.5, 0.3);
    staff.rotation.z = -0.2;
    group.add(staff);

    // Staff gem (emissive)
    const gemGeom = new THREE.OctahedronGeometry(0.15);
    const gemMat = new THREE.MeshStandardMaterial({ 
      color: this.accentColor,
      emissive: this.accentColor,
      emissiveIntensity: 0.8
    });
    const gem = new THREE.Mesh(gemGeom, gemMat);
    gem.position.set(0.6, 2.7, 0.3);
    group.add(gem);

    // Floating orbs around mage
    this.createFloatingOrbs(group);
  }

  createFloatingOrbs(group) {
    const orbMat = new THREE.MeshBasicMaterial({
      color: this.accentColor,
      transparent: true,
      opacity: 0.7
    });

    for (let i = 0; i < 3; i++) {
      const orbGeom = new THREE.SphereGeometry(0.12);
      const orb = new THREE.Mesh(orbGeom, orbMat.clone());
      orb.userData.orbOffset = i * (Math.PI * 2 / 3);
      orb.userData.orbTime = Math.random() * Math.PI * 2;
      group.add(orb);
    }
  }

  createHealerMesh(group) {
    const dressMat = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.85
    });

    // Dress
    const dressGeom = new THREE.CylinderGeometry(0.3, 0.7, 1.8, 8);
    const dress = new THREE.Mesh(dressGeom, dressMat);
    dress.position.y = 0.7;
    dress.castShadow = true;
    group.add(dress);

    // Upper body
    const upperGeom = new THREE.CylinderGeometry(0.35, 0.45, 0.8);
    const upper = new THREE.Mesh(upperGeom, dressMat);
    upper.position.y = 1.6;
    group.add(upper);

    // Head
    const headGeom = new THREE.SphereGeometry(0.32, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffd9b3 });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 2.15;
    group.add(head);

    // Halo (emissive ring)
    const haloGeom = new THREE.TorusGeometry(0.4, 0.03, 8, 16);
    const haloMat = new THREE.MeshBasicMaterial({ 
      color: 0xffd700,
      emissive: 0xffd700
    });
    const halo = new THREE.Mesh(haloGeom, haloMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 2.6;
    group.add(halo);

    // Wings
    const wingGeom = new THREE.BufferGeometry();
    const wingVertices = new Float32Array([
      -0.5, 1.8, 0,  -0.3, 2.2, 0.3,  0, 2.4, 0,
      0, 2.4, 0,  -0.3, 2.2, 0.3,  -0.5, 2.0, 0.3
    ]);
    wingGeom.setAttribute('position', new THREE.BufferAttribute(wingVertices, 3));
    const wingMat = new THREE.MeshStandardMaterial({ 
      color: 0xffffff, 
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    const leftWing = new THREE.Mesh(wingGeom, wingMat);
    leftWing.position.set(-0.4, 1.8, 0);
    group.add(leftWing);

    const rightWing = leftWing.clone();
    rightWing.scale.x = -1;
    rightWing.position.set(0.4, 1.8, 0);
    group.add(rightWing);

    // Wand
    const wandGeom = new THREE.CylinderGeometry(0.03, 0.05, 0.8);
    const wandMat = new THREE.MeshStandardMaterial({ color: 0x864 });
    const wand = new THREE.Mesh(wandGeom, wandMat);
    wand.position.set(0.5, 1.7, 0.2);
    group.add(wand);

    // Wand star tip
    const starGeom = new THREE.OctahedronGeometry(0.1);
    const starMat = new THREE.MeshStandardMaterial({ 
      color: 0xffd700,
      emissive: 0xffd700,
      emissiveIntensity: 0.5
    });
    const star = new THREE.Mesh(starGeom, starMat);
    star.position.set(0.5, 2.15, 0.2);
    group.add(star);
  }

  createRangerMesh(group) {
    const leatherMat = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.75
    });

    // Torso (leather armor)
    const torsoGeom = new THREE.BoxGeometry(0.6, 0.9, 0.4);
    const torso = new THREE.Mesh(torsoGeom, leatherMat);
    torso.position.y = 1.2;
    torso.castShadow = true;
    group.add(torso);

    // Head (with hood)
    const headGeom = new THREE.SphereGeometry(0.3, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffd9b3 });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 1.9;
    group.add(head);

    // Hood
    const hoodGeom = new THREE.SphereGeometry(0.35, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const hoodMat = new THREE.MeshStandardMaterial({ color: 0x453 });
    const hood = new THREE.Mesh(hoodGeom, hoodMat);
    hood.position.y = 2.0;
    group.add(hood);

    // Arms
    const armGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.8);
    const leftArm = new THREE.Mesh(armGeom, leatherMat);
    leftArm.position.set(-0.4, 1.2, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeom, leatherMat);
    rightArm.position.set(0.4, 1.2, 0);
    group.add(rightArm);

    // Legs
    const legGeom = new THREE.CylinderGeometry(0.12, 0.1, 1.1);
    const leftLeg = new THREE.Mesh(legGeom, leatherMat);
    leftLeg.position.set(-0.25, 0.4, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeom, leatherMat);
    rightLeg.position.set(0.25, 0.4, 0);
    group.add(rightLeg);

    // Bow
    const bowCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.4, 1.3, 0.4),
      new THREE.Vector3(-0.6, 1.8, 0.5),
      new THREE.Vector3(-0.4, 2.3, 0.4)
    ]);
    const bowGeom = new THREE.TubeGeometry(bowCurve, 20, 0.03, 8, false);
    const bowMat = new THREE.MeshStandardMaterial({ color: 0x654 });
    const bow = new THREE.Mesh(bowGeom, bowMat);
    group.add(bow);

    // Quiver (on back)
    const quiverGeom = new THREE.CylinderGeometry(0.08, 0.12, 0.7);
    const quiver = new THREE.Mesh(quiverGeom, new THREE.MeshStandardMaterial({ color: 0x543 }));
    quiver.position.set(0, 1.2, -0.3);
    group.add(quiver);
  }

  // Update animation each frame
  update(deltaTime) {
    this.animTime += deltaTime;

    if (this.mesh) {
      // Idle breathing animation
      const breathHeight = Math.sin(this.animTime * 2) * 0.02;
      this.mesh.position.y = this.position.y + breathHeight;

      // Update floating orbs for mage
      if (this.mesh.children && Array.isArray(this.mesh.children) && this.mesh.children.length > 0) {
        for (let idx = 0; idx < this.mesh.children.length; idx++) {
          const child = this.mesh.children[idx];
          if (child.userData.orbOffset !== undefined) {
            const t = this.animTime + child.userData.orbTime;
            const offset = child.userData.orbOffset;
            child.position.x = Math.cos(t * 0.5 + offset) * 1.0;
            child.position.y = 1.5 + Math.sin(t * 0.7) * 0.3;
            child.position.z = Math.sin(t * 0.5 + offset) * 1.0;
          }
        }
      }
    }

    // Update status effects
    this.updateStatusEffects(deltaTime);
  }

  updateStatusEffects(deltaTime) {
    this.statusEffects = this.statusEffects.filter(effect => {
      effect.duration -= deltaTime;
      
      // Apply periodic effects
      if (effect.type === 'burn' || effect.type === 'poison') {
        const tickDamage = Math.round(this.stats.maxHP * 0.03);
        this.hp = Math.max(0, this.hp - tickDamage);
      } else if (effect.type === 'regen') {
        const tickHeal = Math.round(this.stats.maxHP * 0.02);
        this.hp = Math.min(this.stats.maxHP, this.hp + tickHeal);
      }

      return effect.duration > 0;
    });

    // Check death
    if (this.hp <= 0 && !this.isDead) {
      this.isDead = true;
      this.onDeath();
    }
  }

  onDeath() {
    // Death animation - scale down and fade
    const fadeInterval = setInterval(() => {
      if (this.mesh) {
        this.mesh.scale.multiplyScalar(0.9);
        if (this.mesh.scale.x < 0.1) {
          this.mesh.visible = false;
          clearInterval(fadeInterval);
        }
      }
    }, 50);
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.isDead = true;
    }
  }

  heal(amount) {
    this.hp = Math.min(this.stats.maxHP, this.hp + amount);
  }

  gainAP(amount) {
    this.ap = Math.min(this.stats.maxAP, this.ap + amount);
  }

  useAP(amount) {
    if (this.ap >= amount) {
      this.ap -= amount;
      return true;
    }
    return false;
  }

  reset() {
    this.hp = this.stats.maxHP;
    this.ap = 0;
    this.statusEffects = [];
    this.buffs = [];
    this.isStunned = false;
    this.isDead = false;
    this.isStaggered = false;
    
    if (this.mesh) {
      this.mesh.visible = true;
      this.mesh.scale.set(1, 1, 1);
    }
  }

  getHPPercent() {
    return this.hp / this.stats.maxHP;
  }

  getAPPercent() {
    return this.ap / this.stats.maxAP;
  }
}

// Create default party
export function createDefaultParty() {
  const rng = getCombatRNG();
  
  return [
    new Character({
      id: 'warrior_1',
      name: 'Valeria',
      class: 'warrior',
      maxHP: 120,
      maxAP: 5,
      attack: 25,
      defense: 18,
      magic: 10,
      speed: 10,
      crit: 8,
      color: 0x8b4513,
      accentColor: 0xcd853f
    }),

    new Character({
      id: 'mage_1',
      name: 'Elyndra',
      class: 'mage',
      maxHP: 80,
      maxAP: 6,
      attack: 12,
      defense: 8,
      magic: 30,
      speed: 14,
      crit: 12,
      color: 0x4b0082,
      accentColor: 0x9370db
    }),

    new Character({
      id: 'healer_1',
      name: 'Seraphine',
      class: 'healer',
      maxHP: 95,
      maxAP: 5,
      attack: 10,
      defense: 12,
      magic: 28,
      speed: 11,
      crit: 5,
      color: 0xffd700,
      accentColor: 0xffffe0
    }),

    new Character({
      id: 'ranger_1',
      name: 'Kaelen',
      class: 'ranger',
      maxHP: 90,
      maxAP: 5,
      attack: 22,
      defense: 14,
      magic: 12,
      speed: 16,
      crit: 20,
      color: 0x228b22,
      accentColor: 0x32cd32
    })
  ];
}
