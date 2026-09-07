/**
 * Enemy: stats, telegraphed attack patterns, detailed procedural mesh, animations.
 */

import * as THREE from 'three';
import { Elements, StatusEffects } from '../battle/action-resolver.js';

export const EnemyDefs = {
  iron_golem: {
    id: 'iron_golem', name: 'Iron Golem', title: 'The Unyielding',
    hp: 150, maxHp: 150, atk: 28, def: 16, mat: 3, speed: 5,
    weakness: 'lightning', resist: 'physical',
    color: 0x5a5a6a, accentColor: 0x888899,
    position: { x: -3, z: -4 },
    attacks: [
      { name: 'Iron Slam', damage: 30, telegraphTime: 1.4, hitDelays: [], attackType: 'normal', statusEffect: null, weight: 40 },
      { name: 'Crushing Grab', damage: 35, telegraphTime: 1.6, hitDelays: [], attackType: 'grab', statusEffect: StatusEffects.STUN, statusDuration: 1, weight: 20 },
      { name: 'Ground Pound', damage: 25, telegraphTime: 1.8, hitDelays: [0.5, 0.5], attackType: 'normal', statusEffect: null, weight: 25 },
      { name: 'Shield Bash', damage: 20, telegraphTime: 1.0, hitDelays: [], attackType: 'normal', statusEffect: StatusEffects.WEAK, statusDuration: 2, statusValue: 0, weight: 15 },
    ],
  },
  shadow_weaver: {
    id: 'shadow_weaver', name: 'Shadow Weaver', title: 'The Phantom',
    hp: 100, maxHp: 100, atk: 22, def: 8, mat: 14, speed: 12,
    weakness: 'holy', resist: 'dark',
    color: 0x2a1a3a, accentColor: 0x9b59b6,
    position: { x: 3, z: -4 },
    attacks: [
      { name: 'Shadow Bolt', damage: 22, telegraphTime: 1.0, hitDelays: [], attackType: 'normal', statusEffect: StatusEffects.POISON, statusDuration: 2, statusValue: 5, weight: 30 },
      { name: 'Triple Slash', damage: 16, telegraphTime: 0.9, hitDelays: [0.35, 0.35], attackType: 'normal', statusEffect: null, weight: 30 },
      { name: 'Feint Strike', damage: 28, telegraphTime: 1.5, hitDelays: [], attackType: 'feint', statusEffect: StatusEffects.VULN, statusDuration: 2, statusValue: 0, weight: 20 },
      { name: 'Dark Drain', damage: 18, telegraphTime: 1.2, hitDelays: [], attackType: 'normal', statusEffect: StatusEffects.WEAK, statusDuration: 2, statusValue: 0, weight: 20 },
    ],
  },
  // New enemies for open world encounters
  dark_wolf: {
    id: 'dark_wolf', name: 'Dark Wolf', title: 'Forest Predator',
    hp: 80, maxHp: 80, atk: 18, def: 6, mat: 8, speed: 14,
    weakness: 'fire', resist: 'physical',
    color: 0x2a2a3a, accentColor: 0x6644aa,
    position: { x: -3, z: -4 },
    attacks: [
      { name: 'Bite', damage: 18, telegraphTime: 0.8, hitDelays: [], attackType: 'normal', statusEffect: null, weight: 40 },
      { name: 'Pounce', damage: 22, telegraphTime: 1.0, hitDelays: [], attackType: 'normal', statusEffect: StatusEffects.WEAK, statusDuration: 1, weight: 30 },
      { name: 'Howl', damage: 10, telegraphTime: 1.2, hitDelays: [], attackType: 'normal', statusEffect: StatusEffects.POISON, statusDuration: 2, statusValue: 3, weight: 30 },
    ],
  },
  shadow_stalker: {
    id: 'shadow_stalker', name: 'Shadow Stalker', title: 'Silent Hunter',
    hp: 70, maxHp: 70, atk: 20, def: 5, mat: 12, speed: 16,
    weakness: 'holy', resist: 'dark',
    color: 0x1a0a2a, accentColor: 0x8844cc,
    position: { x: 3, z: -4 },
    attacks: [
      { name: 'Shadow Strike', damage: 20, telegraphTime: 0.9, hitDelays: [], attackType: 'normal', statusEffect: null, weight: 40 },
      { name: 'Vanish', damage: 15, telegraphTime: 1.1, hitDelays: [], attackType: 'feint', statusEffect: StatusEffects.VULN, statusDuration: 2, statusValue: 0, weight: 30 },
      { name: 'Dark Claw', damage: 25, telegraphTime: 1.3, hitDelays: [], attackType: 'normal', statusEffect: StatusEffects.POISON, statusDuration: 2, statusValue: 4, weight: 30 },
    ],
  },
  skeleton_warrior: {
    id: 'skeleton_warrior', name: 'Skeleton Warrior', title: 'Undead Fighter',
    hp: 90, maxHp: 90, atk: 22, def: 10, mat: 5, speed: 8,
    weakness: 'holy', resist: 'dark',
    color: 0x8a8a7a, accentColor: 0xaabbcc,
    position: { x: -3, z: -4 },
    attacks: [
      { name: 'Sword Slash', damage: 22, telegraphTime: 1.0, hitDelays: [], attackType: 'normal', statusEffect: null, weight: 40 },
      { name: 'Shield Bash', damage: 18, telegraphTime: 1.2, hitDelays: [], attackType: 'normal', statusEffect: StatusEffects.WEAK, statusDuration: 2, statusValue: 0, weight: 30 },
      { name: 'Bone Throw', damage: 15, telegraphTime: 1.4, hitDelays: [], attackType: 'normal', statusEffect: StatusEffects.POISON, statusDuration: 2, statusValue: 3, weight: 30 },
    ],
  },
  dark_mage: {
    id: 'dark_mage', name: 'Dark Mage', title: 'Corrupted Scholar',
    hp: 60, maxHp: 60, atk: 15, def: 4, mat: 18, speed: 10,
    weakness: 'physical', resist: 'dark',
    color: 0x3a1a4a, accentColor: 0xaa44ff,
    position: { x: 3, z: -4 },
    attacks: [
      { name: 'Dark Bolt', damage: 25, telegraphTime: 1.0, hitDelays: [], attackType: 'normal', statusEffect: null, weight: 40 },
      { name: 'Curse', damage: 12, telegraphTime: 1.3, hitDelays: [], attackType: 'normal', statusEffect: StatusEffects.VULN, statusDuration: 3, statusValue: 0, weight: 30 },
      { name: 'Shadow Shield', damage: 18, telegraphTime: 1.5, hitDelays: [], attackType: 'normal', statusEffect: StatusEffects.POISON, statusDuration: 2, statusValue: 5, weight: 30 },
    ],
  },
  cave_spider: {
    id: 'cave_spider', name: 'Cave Spider', title: 'Web Weaver',
    hp: 50, maxHp: 50, atk: 16, def: 4, mat: 10, speed: 15,
    weakness: 'fire', resist: 'physical',
    color: 0x2a1a1a, accentColor: 0x664422,
    position: { x: -3, z: -4 },
    attacks: [
      { name: 'Bite', damage: 16, telegraphTime: 0.7, hitDelays: [], attackType: 'normal', statusEffect: StatusEffects.POISON, statusDuration: 2, statusValue: 4, weight: 40 },
      { name: 'Web Shot', damage: 12, telegraphTime: 1.0, hitDelays: [], attackType: 'normal', statusEffect: StatusEffects.STUN, statusDuration: 1, weight: 30 },
      { name: 'Pounce', damage: 20, telegraphTime: 1.2, hitDelays: [], attackType: 'normal', statusEffect: null, weight: 30 },
    ],
  },
  goblin_shaman: {
    id: 'goblin_shaman', name: 'Goblin Shaman', title: 'Cave Healer',
    hp: 70, maxHp: 70, atk: 14, def: 6, mat: 16, speed: 9,
    weakness: 'fire', resist: 'physical',
    color: 0x2a4a1a, accentColor: 0x44aa22,
    position: { x: 3, z: -4 },
    attacks: [
      { name: 'Staff Strike', damage: 14, telegraphTime: 1.0, hitDelays: [], attackType: 'normal', statusEffect: null, weight: 40 },
      { name: 'Heal', damage: -15, telegraphTime: 1.2, hitDelays: [], attackType: 'normal', statusEffect: null, weight: 20 },
      { name: 'Poison Dart', damage: 18, telegraphTime: 1.3, hitDelays: [], attackType: 'normal', statusEffect: StatusEffects.POISON, statusDuration: 3, statusValue: 5, weight: 40 },
    ],
  },
};

export class Enemy {
  constructor(def) {
    this.id = def.id;
    this.name = def.name;
    this.title = def.title;
    this.hp = def.hp;
    this.maxHp = def.maxHp;
    this.atk = def.atk;
    this.def = def.def;
    this.mat = def.mat;
    this.speed = def.speed;
    this.weakness = def.weakness;
    this.resist = def.resist;
    this._attacks = def.attacks;
    this.statusEffects = [];
    this.stagger = 0;
    this.isDeadHandled = false;

    this._color = def.color;
    this._accentColor = def.accentColor;
    this._position = { ...def.position };

    this.mesh = null;
    this._buildMesh();

    this._animState = 'idle';
    this._animTime = 0;
    this._hitEmissiveBoost = 0;
  }

  _buildMesh() {
    this.mesh = new THREE.Group();

    if (this.id === 'iron_golem') {
      this._buildGolem();
    } else if (this.id === 'shadow_weaver') {
      this._buildWeaver();
    } else if (this.id === 'dark_wolf') {
      this._buildWolf();
    } else if (this.id === 'shadow_stalker') {
      this._buildStalker();
    } else if (this.id === 'skeleton_warrior') {
      this._buildSkeleton();
    } else if (this.id === 'dark_mage') {
      this._buildMage();
    } else if (this.id === 'cave_spider') {
      this._buildSpider();
    } else if (this.id === 'goblin_shaman') {
      this._buildGoblin();
    } else {
      this._buildWeaver(); // fallback
    }

    this.mesh.position.set(this._position.x, 0, this._position.z);

    // === RIM LIGHT ===
    const rimLight = new THREE.SpotLight(this._accentColor, 1.2, 8, Math.PI / 6, 0.6, 1.5);
    rimLight.position.set(0, 3, -1.5);
    rimLight.target.position.set(0, 1.5, 0);
    this.mesh.add(rimLight);
    this.mesh.add(rimLight.target);
    this._rimLight = rimLight;

    // === HP BAR (small, no black background) ===
    const hpBarY = this._getHpBarY();
    this._hpBar = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff4444, depthTest: false, transparent: true, opacity: 0.8 }));
    this._hpBar.scale.set(1.0, 0.08, 1);
    this._hpBar.position.y = hpBarY;
    this.mesh.add(this._hpBar);
  }

  _getHpBarY() {
    return this.id === 'iron_golem' ? 3.5 : 3.0;
  }

  _buildGolem() {
    const metalMat = new THREE.MeshPhysicalMaterial({
      color: this._color, roughness: 0.3, metalness: 0.4,
      clearcoat: 0.6, clearcoatRoughness: 0.15,
    });

    const darkMetalMat = new THREE.MeshPhysicalMaterial({
      color: 0x3a3a4a, roughness: 0.4, metalness: 0.35,
      clearcoat: 0.5, clearcoatRoughness: 0.2,
    });

    // === MAIN BODY ===
    const bodyGeo = new THREE.BoxGeometry(1.4, 1.8, 0.9);
    const body = new THREE.Mesh(bodyGeo, metalMat);
    body.position.y = 2.0;
    body.castShadow = true;
    this.mesh.add(body);
    this._body = body;

    // Chest plate
    const chestGeo = new THREE.BoxGeometry(1.0, 1.0, 0.1);
    const chest = new THREE.Mesh(chestGeo, darkMetalMat);
    chest.position.set(0, 2.1, 0.48);
    chest.castShadow = true;
    this.mesh.add(chest);

    // === HEAD ===
    const headGeo = new THREE.BoxGeometry(0.7, 0.6, 0.6);
    const headMat = new THREE.MeshPhysicalMaterial({
      color: 0x4a4a5a, roughness: 0.25, metalness: 0.4,
      clearcoat: 0.7, clearcoatRoughness: 0.1,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 3.2;
    head.castShadow = true;
    this.mesh.add(head);
    this._head = head;

    // Visor
    const visorGeo = new THREE.BoxGeometry(0.5, 0.15, 0.1);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0xff4444, emissive: 0xff4444, emissiveIntensity: 3.0,
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 3.2, 0.32);
    this.mesh.add(visor);

    // Eyes
    const eyeGeo = new THREE.BoxGeometry(0.14, 0.08, 0.06);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xff4444, emissive: 0xff4444, emissiveIntensity: 4.0,
    });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * 0.18, 3.25, 0.33);
      this.mesh.add(eye);
    }

    // === SHOULDERS ===
    for (const side of [-1, 1]) {
      const shoulderGeo = new THREE.SphereGeometry(0.35, 8, 8);
      const shoulder = new THREE.Mesh(shoulderGeo, darkMetalMat);
      shoulder.position.set(side * 0.9, 2.8, 0);
      shoulder.castShadow = true;
      this.mesh.add(shoulder);
    }

    // === ARMS ===
    const armGeo = new THREE.BoxGeometry(0.4, 1.4, 0.4);
    this._leftArm = new THREE.Mesh(armGeo, metalMat);
    this._leftArm.position.set(-0.95, 1.9, 0);
    this._leftArm.castShadow = true;
    this.mesh.add(this._leftArm);

    this._rightArm = new THREE.Mesh(armGeo, metalMat);
    this._rightArm.position.set(0.95, 1.9, 0);
    this._rightArm.castShadow = true;
    this.mesh.add(this._rightArm);

    // Fists
    const fistGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    for (const side of [-1, 1]) {
      const fist = new THREE.Mesh(fistGeo, darkMetalMat);
      fist.position.set(side * 0.95, 1.1, 0);
      fist.castShadow = true;
      this.mesh.add(fist);
    }

    // === LEGS ===
    const legGeo = new THREE.BoxGeometry(0.45, 1.2, 0.45);
    this._leftLeg = new THREE.Mesh(legGeo, darkMetalMat);
    this._leftLeg.position.set(-0.35, 0.6, 0);
    this._leftLeg.castShadow = true;
    this.mesh.add(this._leftLeg);

    this._rightLeg = new THREE.Mesh(legGeo, darkMetalMat);
    this._rightLeg.position.set(0.35, 0.6, 0);
    this._rightLeg.castShadow = true;
    this.mesh.add(this._rightLeg);

    // Feet
    const footGeo = new THREE.BoxGeometry(0.5, 0.2, 0.6);
    for (const side of [-1, 1]) {
      const foot = new THREE.Mesh(footGeo, metalMat);
      foot.position.set(side * 0.35, 0.1, 0.08);
      foot.castShadow = true;
      this.mesh.add(foot);
    }

    // === RUNE MARKINGS ===
    const runeCanvas = document.createElement('canvas');
    runeCanvas.width = 128;
    runeCanvas.height = 128;
    const rctx = runeCanvas.getContext('2d');
    rctx.fillStyle = 'rgba(0,0,0,0)';
    rctx.fillRect(0, 0, 128, 128);
    rctx.strokeStyle = '#ff4444';
    rctx.lineWidth = 4;
    rctx.beginPath();
    rctx.moveTo(64, 10); rctx.lineTo(110, 110); rctx.lineTo(18, 110); rctx.closePath();
    rctx.stroke();
    rctx.beginPath();
    rctx.moveTo(64, 30); rctx.lineTo(90, 90); rctx.lineTo(38, 90); rctx.closePath();
    rctx.stroke();
    const runeTex = new THREE.CanvasTexture(runeCanvas);
    const runeMat = new THREE.MeshBasicMaterial({
      map: runeTex, transparent: true, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const runePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), runeMat);
    runePlane.position.set(0, 2.2, 0.5);
    this.mesh.add(runePlane);
    this._rune = runePlane;
  }

  _buildWeaver() {
    const clothMat = new THREE.MeshPhysicalMaterial({
      color: this._color, roughness: 0.6, metalness: 0.05,
      sheen: 1.0, sheenRoughness: 0.3,
      sheenColor: new THREE.Color(0x9b59b6),
    });

    const darkClothMat = new THREE.MeshPhysicalMaterial({
      color: 0x1a0a2a, roughness: 0.7, metalness: 0.0,
      sheen: 0.8, sheenRoughness: 0.4,
      sheenColor: new THREE.Color(0x6b2fa0),
    });

    // === BODY (flowing robe) ===
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.5, 1.6, 10);
    const body = new THREE.Mesh(bodyGeo, clothMat);
    body.position.y = 1.5;
    body.castShadow = true;
    this.mesh.add(body);
    this._body = body;

    // Robe skirt
    const skirtGeo = new THREE.CylinderGeometry(0.5, 0.7, 0.8, 10);
    const skirt = new THREE.Mesh(skirtGeo, darkClothMat);
    skirt.position.y = 0.6;
    skirt.castShadow = true;
    this.mesh.add(skirt);

    // === HOODED HEAD ===
    const headGeo = new THREE.SphereGeometry(0.3, 12, 10);
    const head = new THREE.Mesh(headGeo, darkClothMat);
    head.position.y = 2.5;
    head.castShadow = true;
    this.mesh.add(head);
    this._head = head;

    // Hood
    const hoodGeo = new THREE.SphereGeometry(0.35, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.7);
    const hood = new THREE.Mesh(hoodGeo, darkClothMat);
    hood.position.y = 2.55;
    hood.castShadow = true;
    this.mesh.add(hood);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.05, 8, 6);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x9b59b6, emissive: 0x9b59b6, emissiveIntensity: 4.0,
    });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * 0.1, 2.52, 0.25);
      this.mesh.add(eye);
    }

    // === ARMS (flowing sleeves) ===
    const armGeo = new THREE.CylinderGeometry(0.08, 0.12, 1.0, 8);
    this._leftArm = new THREE.Mesh(armGeo, clothMat);
    this._leftArm.position.set(-0.5, 1.6, 0);
    this._leftArm.rotation.z = 0.2;
    this._leftArm.castShadow = true;
    this.mesh.add(this._leftArm);

    this._rightArm = new THREE.Mesh(armGeo, clothMat);
    this._rightArm.position.set(0.5, 1.6, 0);
    this._rightArm.rotation.z = -0.2;
    this._rightArm.castShadow = true;
    this.mesh.add(this._rightArm);

    // Claws
    const clawMat = new THREE.MeshPhysicalMaterial({
      color: 0x4a2a5a, roughness: 0.3, metalness: 0.6,
    });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const clawGeo = new THREE.ConeGeometry(0.02, 0.15, 4);
        const claw = new THREE.Mesh(clawGeo, clawMat);
        claw.position.set(side * (0.5 + i * 0.03), 1.1, 0.05);
        claw.rotation.z = side * (0.3 + i * 0.15);
        this.mesh.add(claw);
      }
    }

    // === LEGS (hidden under robe, subtle) ===
    const legGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.6, 6);
    this._leftLeg = new THREE.Mesh(legGeo, darkClothMat);
    this._leftLeg.position.set(-0.15, 0.2, 0);
    this._leftLeg.castShadow = true;
    this.mesh.add(this._leftLeg);

    this._rightLeg = new THREE.Mesh(legGeo, darkClothMat);
    this._rightLeg.position.set(0.15, 0.2, 0);
    this._rightLeg.castShadow = true;
    this.mesh.add(this._rightLeg);

    // === FLOATING SHADOW PARTICLES ===
    this._shadows = [];
    for (let i = 0; i < 8; i++) {
      const sGeo = new THREE.SphereGeometry(0.05 + Math.random() * 0.03, 6, 6);
      const sMat = new THREE.MeshStandardMaterial({
        color: 0x6a3d7d, emissive: 0x6a3d7d, emissiveIntensity: 1.0,
        transparent: true, opacity: 0.5,
      });
      const s = new THREE.Mesh(sGeo, sMat);
      s.userData = {
        angle: (i / 8) * Math.PI * 2,
        radius: 0.7 + Math.random() * 0.4,
        speed: 0.4 + Math.random() * 0.6,
        yBase: 1.0 + Math.random() * 1.5,
      };
      this.mesh.add(s);
      this._shadows.push(s);
    }

    // === STAFF ===
    const staffGeo = new THREE.CylinderGeometry(0.03, 0.025, 2.0, 6);
    const staffMat = new THREE.MeshPhysicalMaterial({
      color: 0x2a1a3a, roughness: 0.4, metalness: 0.3,
    });
    const staff = new THREE.Mesh(staffGeo, staffMat);
    staff.position.set(-0.7, 1.8, 0.2);
    staff.rotation.x = 0.1;
    staff.castShadow = true;
    this.mesh.add(staff);

    // Staff crystal
    const crystalGeo = new THREE.OctahedronGeometry(0.1, 1);
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0x9b59b6, emissive: 0x9b59b6, emissiveIntensity: 2.5,
      iridescence: 1.0, iridescenceIOR: 1.8,
      iridescenceThicknessRange: [200, 600],
      transmission: 0.5, thickness: 0.3,
    });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.set(-0.7, 2.85, 0.2);
    this.mesh.add(crystal);
    this._crystal = crystal;
  }

  chooseAttack(rng, target) {
    const totalWeight = this._attacks.reduce((sum, a) => sum + a.weight, 0);
    let r = rng.next() * totalWeight;
    for (const attack of this._attacks) {
      r -= attack.weight;
      if (r <= 0) return { ...attack };
    }
    return { ...this._attacks[0] };
  }

  updateHpBar() {
    const ratio = Math.max(0, this.hp / this.maxHp);
    const maxFillW = 1.3;
    const fillW = maxFillW * ratio;
    this._hpBar.scale.x = fillW;
    this._hpBar.position.x = -(maxFillW - fillW) / 2;
    if (ratio < 0.3) {
      this._hpBar.material.color.setRGB(1, 0.2, 0.2);
    } else {
      this._hpBar.material.color.setRGB(1, 0.27, 0.27);
    }
  }

  animate(deltaTime) {
    this._animTime += deltaTime;
    const t = this._animTime;

    if (this._animState === 'idle') {
      this.mesh.position.y = Math.sin(t * 1.5) * 0.05;
      if (this._body) this._body.rotation.y = Math.sin(t * 0.8) * 0.05;
      if (this._leftArm) this._leftArm.rotation.x = Math.sin(t * 1.2) * 0.08;
      if (this._rightArm) this._rightArm.rotation.x = Math.sin(t * 1.2 + 1) * 0.08;

      // Shadow particles orbit
      if (this._shadows) {
        for (const s of this._shadows) {
          s.userData.angle += s.userData.speed * deltaTime;
          s.position.x = Math.cos(s.userData.angle) * s.userData.radius;
          s.position.z = Math.sin(s.userData.angle) * s.userData.radius;
          s.position.y = s.userData.yBase + Math.sin(s.userData.angle * 2) * 0.3;
        }
      }

      // Rune pulse
      if (this._rune) {
        this._rune.material.opacity = 0.5 + Math.sin(t * 3) * 0.3;
      }

      // Crystal pulse
      if (this._crystal) {
        this._crystal.material.emissiveIntensity = 2.0 + Math.sin(t * 2) * 1.0;
        this._crystal.rotation.y = t * 0.5;
      }
    } else if (this._animState === 'attack') {
      const progress = Math.min(t / 0.5, 1);
      const swing = Math.sin(progress * Math.PI);
      if (this._rightArm) this._rightArm.rotation.x = -swing * 1.5;
      if (this._body) this._body.position.z = swing * 0.3;
      if (progress >= 1) {
        this._animState = 'idle';
        if (this._body) this._body.position.z = 0;
      }
    } else if (this._animState === 'hit') {
      const progress = Math.min(t / 0.3, 1);
      const recoil = Math.sin(progress * Math.PI);
      if (this._body) this._body.position.x = -recoil * 0.2;

      // Emissive flash on hit
      if (progress < 0.3 && this._hitEmissiveBoost <= 0) {
        this._hitEmissiveBoost = 1.0;
      }
      if (this._hitEmissiveBoost > 0) {
        this._hitEmissiveBoost -= deltaTime * 4;
        const boost = Math.max(0, this._hitEmissiveBoost);
        this.mesh.traverse(child => {
          if (child.isMesh && child.material && child.material.emissive) {
            const baseIntensity = child.material.emissiveIntensity || 0;
            child.material.emissiveIntensity = baseIntensity + boost * 2;
          }
        });
      }

      if (progress >= 1) {
        this._animState = 'idle';
        if (this._body) this._body.position.x = 0;
      }
    } else if (this._animState === 'telegraph') {
      const progress = Math.min(t / 0.8, 1);
      const windup = Math.sin(progress * Math.PI * 0.5);
      if (this._rightArm) this._rightArm.rotation.x = -windup * 1.0;
      if (this._leftArm) this._leftArm.rotation.x = -windup * 0.5;
      if (this._body) this._body.position.y = windup * 0.2;
    } else if (this._animState === 'death') {
      const progress = Math.min(t / 1.2, 1);
      this.mesh.rotation.x = progress * Math.PI / 2;
      this.mesh.position.y = -progress * 0.5;
      this.mesh.children.forEach(c => {
        if (c.material) {
          c.material.opacity = 1 - progress;
          c.material.transparent = true;
        }
      });
    }
  }

  setAnim(state) {
    this._animState = state;
    this._animTime = 0;
  }

  faceTarget(targetPos) {
    const dx = targetPos.x - this.mesh.position.x;
    const dz = targetPos.z - this.mesh.position.z;
    this.mesh.rotation.y = Math.atan2(dx, dz);
  }

  get isDead() {
    return this.hp <= 0;
  }

  /** Dispose all WebGL resources owned by this enemy mesh. */
  dispose() {
    if (!this.mesh) return;
    this.mesh.traverse(child => {
      if (child.isMesh || child.isSprite) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            for (const m of child.material) m.dispose();
          } else {
            for (const key of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'envMap']) {
              if (child.material[key]) child.material[key].dispose();
            }
            child.material.dispose();
          }
        }
      }
      if (child.isLight) {
        if (child.target) child.target.dispose?.();
      }
    });
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }

  // ─── New enemy builders ───

  _buildWolf() {
    const mat = new THREE.MeshStandardMaterial({ color: this._color, roughness: 0.8, emissive: this._accentColor, emissiveIntensity: 0.1 });
    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.8, 8), mat);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.6;
    body.castShadow = true;
    this.mesh.add(body);
    this._body = body;
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat);
    head.position.set(0.5, 0.8, 0);
    head.castShadow = true;
    this.mesh.add(head);
    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), eyeMat);
      eye.position.set(0.6, 0.85, side * 0.1);
      this.mesh.add(eye);
    }
    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.9 });
    for (const x of [-0.25, 0.25]) {
      for (const z of [-0.15, 0.15]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.4, 4), legMat);
        leg.position.set(x, 0.2, z);
        leg.castShadow = true;
        this.mesh.add(leg);
      }
    }
    this._addHpBar();
  }

  _buildStalker() {
    const mat = new THREE.MeshStandardMaterial({ color: this._color, roughness: 0.7, emissive: this._accentColor, emissiveIntensity: 0.15, transparent: true, opacity: 0.85 });
    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 8), mat);
    body.position.y = 1.0;
    body.castShadow = true;
    this.mesh.add(body);
    this._body = body;
    // Hood
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), mat);
    hood.position.y = 1.7;
    hood.castShadow = true;
    this.mesh.add(hood);
    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff22ff });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), eyeMat);
      eye.position.set(0, 1.7, side * 0.12);
      this.mesh.add(eye);
    }
    // Arms
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.7, 6), mat);
      arm.position.set(side * 0.25, 0.8, 0);
      arm.castShadow = true;
      this.mesh.add(arm);
    }
    this._leftArm = this.mesh.children[3];
    this._rightArm = this.mesh.children[4];
    this._addHpBar();
  }

  _buildSkeleton() {
    const mat = new THREE.MeshStandardMaterial({ color: this._color, roughness: 0.6, emissive: 0x222222, emissiveIntensity: 0.1 });
    // Torso (ribcage)
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.7, 8), mat);
    torso.position.y = 1.1;
    torso.castShadow = true;
    this.mesh.add(torso);
    this._body = torso;
    // Head (skull)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat);
    head.position.y = 1.6;
    head.castShadow = true;
    this.mesh.add(head);
    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), eyeMat);
      eye.position.set(0, 1.65, side * 0.1);
      this.mesh.add(eye);
    }
    // Arms
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.6, 6), mat);
      arm.position.set(side * 0.3, 1.0, 0);
      arm.castShadow = true;
      this.mesh.add(arm);
    }
    this._leftArm = this.mesh.children[3];
    this._rightArm = this.mesh.children[4];
    // Legs
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 6), mat);
      leg.position.set(side * 0.15, 0.35, 0);
      leg.castShadow = true;
      this.mesh.add(leg);
    }
    this._addHpBar();
  }

  _buildMage() {
    const mat = new THREE.MeshStandardMaterial({ color: this._color, roughness: 0.7, emissive: this._accentColor, emissiveIntensity: 0.1 });
    // Robe
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.35, 1.4, 8), mat);
    robe.position.y = 0.9;
    robe.castShadow = true;
    this.mesh.add(robe);
    this._body = robe;
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat);
    head.position.y = 1.8;
    head.castShadow = true;
    this.mesh.add(head);
    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff44ff });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), eyeMat);
      eye.position.set(0, 1.85, side * 0.1);
      this.mesh.add(eye);
    }
    // Staff
    const staffMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.8 });
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.0, 6), staffMat);
    staff.position.set(0.4, 1.2, 0);
    staff.castShadow = true;
    this.mesh.add(staff);
    // Orb
    const orbMat = new THREE.MeshBasicMaterial({ color: this._accentColor });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), orbMat);
    orb.position.set(0.4, 2.2, 0);
    this.mesh.add(orb);
    this._crystal = orb;
    this._addHpBar();
  }

  _buildSpider() {
    const mat = new THREE.MeshStandardMaterial({ color: this._color, roughness: 0.8, emissive: this._accentColor, emissiveIntensity: 0.1 });
    // Body
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), mat);
    body.position.y = 0.4;
    body.castShadow = true;
    this.mesh.add(body);
    this._body = body;
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat);
    head.position.set(0.3, 0.5, 0);
    head.castShadow = true;
    this.mesh.add(head);
    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    for (let i = 0; i < 4; i++) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), eyeMat);
      eye.position.set(0.4, 0.5 + (i % 2) * 0.08, (i < 2 ? -1 : 1) * 0.08);
      this.mesh.add(eye);
    }
    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1a0a0a, roughness: 0.9 });
    for (let i = 0; i < 8; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.6, 4), legMat);
      const angle = (i / 8) * Math.PI * 2;
      leg.position.set(Math.cos(angle) * 0.4, 0.2, Math.sin(angle) * 0.4);
      leg.rotation.z = Math.cos(angle) * 0.5;
      leg.rotation.x = Math.sin(angle) * 0.5;
      leg.castShadow = true;
      this.mesh.add(leg);
    }
    this._addHpBar();
  }

  _buildGoblin() {
    const mat = new THREE.MeshStandardMaterial({ color: this._color, roughness: 0.8, emissive: this._accentColor, emissiveIntensity: 0.1 });
    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 8), mat);
    body.position.y = 0.8;
    body.castShadow = true;
    this.mesh.add(body);
    this._body = body;
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat);
    head.position.y = 1.4;
    head.castShadow = true;
    this.mesh.add(head);
    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), eyeMat);
      eye.position.set(0, 1.45, side * 0.12);
      this.mesh.add(eye);
    }
    // Ears
    const earMat = new THREE.MeshStandardMaterial({ color: 0x2a4a1a, roughness: 0.8 });
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 4), earMat);
      ear.position.set(side * 0.22, 1.5, 0);
      ear.rotation.z = side * 0.5;
      this.mesh.add(ear);
    }
    // Arms
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.5, 6), mat);
      arm.position.set(side * 0.25, 0.7, 0);
      arm.castShadow = true;
      this.mesh.add(arm);
    }
    this._leftArm = this.mesh.children[4];
    this._rightArm = this.mesh.children[5];
    // Staff
    const staffMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.8 });
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.5, 6), staffMat);
    staff.position.set(0.35, 1.0, 0);
    staff.castShadow = true;
    this.mesh.add(staff);
    this._addHpBar();
  }

  _addHpBar() {
    const hpCanvas = document.createElement('canvas');
    hpCanvas.width = 256; hpCanvas.height = 32;
    const hctx = hpCanvas.getContext('2d');
    hctx.fillStyle = '#222';
    hctx.fillRect(0, 0, 256, 32);
    hctx.fillStyle = '#ff4444';
    hctx.fillRect(4, 4, 248, 24);
    const hpTex = new THREE.CanvasTexture(hpCanvas);
    const hpMat = new THREE.SpriteMaterial({ map: hpTex, transparent: true, depthWrite: false });
    this._hpBar = new THREE.Sprite(hpMat);
    this._hpBar.scale.set(2, 0.25, 1);
    this._hpBar.position.y = 2.5;
    this.mesh.add(this._hpBar);
  }
}
