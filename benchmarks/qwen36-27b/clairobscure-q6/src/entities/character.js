/**
 * Party member: stats, AP, HP, skill list, detailed procedural mesh, animations.
 */

import * as THREE from 'three';
import { getSkillById } from './skill.js';

export const CharacterDefs = [
  {
    id: 'valerius', name: 'Valerius', title: 'The Iron Shield',
    hp: 120, maxHp: 120, atk: 18, def: 14, mat: 5, speed: 8,
    ap: 3, maxAp: 6,
    weakness: 'dark', resist: 'physical',
    skillIds: ['shield_bash', 'defiant_stance', 'war_cry'],
    color: 0x4a6fa5, accentColor: 0xc8a84e,
    position: { x: -4, z: 4 },
  },
  {
    id: 'elara', name: 'Elara', title: 'The Luminary',
    hp: 85, maxHp: 85, atk: 12, def: 8, mat: 18, speed: 11,
    ap: 4, maxAp: 7,
    weakness: 'dark', resist: 'holy',
    skillIds: ['healing_light', 'purify', 'holy_smite'],
    color: 0xe8d5a3, accentColor: 0xffd700,
    position: { x: 0, z: 4 },
  },
  {
    id: 'lucien', name: 'Lucien', title: 'The Arcanist',
    hp: 75, maxHp: 75, atk: 22, def: 6, mat: 15, speed: 13,
    ap: 4, maxAp: 7,
    weakness: 'holy', resist: 'lightning',
    skillIds: ['thunder_strike', 'lightning_storm', 'mark_of_fate'],
    color: 0x6a3d7d, accentColor: 0x9b59b6,
    position: { x: 4, z: 4 },
  },
];

export class Character {
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
    this.ap = def.ap;
    this.maxAp = def.maxAp;
    this.weakness = def.weakness;
    this.resist = def.resist;
    this.skillIds = def.skillIds;
    this.skills = def.skillIds.map(getSkillById);
    this.critChance = 0.1;
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

    // ── MATERIALS ──
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: this._color, roughness: 0.35, metalness: 0.08,
      clearcoat: 0.9, clearcoatRoughness: 0.1,
      sheen: 0.6, sheenRoughness: 0.4,
      sheenColor: new THREE.Color(this._accentColor).multiplyScalar(0.25),
    });

    const skinMat = new THREE.MeshPhysicalMaterial({
      color: 0xf0d0b0, roughness: 0.45, metalness: 0.0,
      sheen: 1.0, sheenRoughness: 0.35,
      sheenColor: new THREE.Color(0xffd0b0),
    });

    const darkMat = new THREE.MeshPhysicalMaterial({
      color: 0x2a2a3e, roughness: 0.65, metalness: 0.1,
    });

    const armorMat = new THREE.MeshPhysicalMaterial({
      color: this._accentColor, roughness: 0.2, metalness: 0.7,
      clearcoat: 1.0, clearcoatRoughness: 0.05,
      iridescence: 0.5, iridescenceIOR: 1.5,
    });

    // ── TORSO (menschliche Proportionen: breitere Schultern, schmalere Hüfte) ──
    // Upper torso (chest) — wider
    const upperTorsoGeo = new THREE.CylinderGeometry(0.42, 0.35, 0.55, 12);
    const upperTorso = new THREE.Mesh(upperTorsoGeo, bodyMat);
    upperTorso.position.y = 1.45;
    upperTorso.castShadow = true;
    this.mesh.add(upperTorso);

    // Lower torso (waist) — narrower
    const lowerTorsoGeo = new THREE.CylinderGeometry(0.35, 0.32, 0.5, 12);
    const lowerTorso = new THREE.Mesh(lowerTorsoGeo, bodyMat);
    lowerTorso.position.y = 0.95;
    lowerTorso.castShadow = true;
    this.mesh.add(lowerTorso);
    this._torso = lowerTorso; // animate this for idle

    // Chest armor plate
    const chestGeo = new THREE.BoxGeometry(0.55, 0.4, 0.12);
    const chest = new THREE.Mesh(chestGeo, armorMat);
    chest.position.set(0, 1.5, 0.32);
    chest.castShadow = true;
    this.mesh.add(chest);

    // Chest emblem (small diamond)
    const emblemGeo = new THREE.OctahedronGeometry(0.06, 0);
    const emblemMat = new THREE.MeshPhysicalMaterial({
      color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.8,
      metalness: 1.0, roughness: 0.1,
    });
    const emblem = new THREE.Mesh(emblemGeo, emblemMat);
    emblem.position.set(0, 1.55, 0.4);
    this.mesh.add(emblem);

    // ── SHOULDERS (panzerartige Schulterpolster) ──
    for (const side of [-1, 1]) {
      // Shoulder pad — curved
      const shoulderGeo = new THREE.SphereGeometry(0.2, 10, 8);
      const shoulder = new THREE.Mesh(shoulderGeo, armorMat);
      shoulder.scale.set(1.1, 0.6, 0.9);
      shoulder.position.set(side * 0.48, 1.75, 0);
      shoulder.castShadow = true;
      this.mesh.add(shoulder);

      // Shoulder spike/ornament
      const spikeGeo = new THREE.ConeGeometry(0.04, 0.15, 6);
      const spike = new THREE.Mesh(spikeGeo, armorMat);
      spike.position.set(side * 0.52, 1.88, 0);
      this.mesh.add(spike);
    }

    // ── NECK ──
    const neckGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.15, 8);
    const neck = new THREE.Mesh(neckGeo, skinMat);
    neck.position.y = 1.8;
    this.mesh.add(neck);

    // ── HEAD (realistischere Form) ──
    const headGeo = new THREE.SphereGeometry(0.26, 14, 12);
    headGeo.scale(1, 1.15, 0.95); // leicht länglicher Kopf
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 2.1;
    head.castShadow = true;
    this.mesh.add(head);
    this._head = head;

    // Jaw line
    const jawGeo = new THREE.SphereGeometry(0.18, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.4);
    const jaw = new THREE.Mesh(jawGeo, skinMat);
    jaw.position.set(0, 2.0, 0.05);
    jaw.rotation.x = -0.2;
    this.mesh.add(jaw);

    // Hair/helmet based on character
    this._buildHeadpiece();

    // Eyes —更大,更有表现力
    const eyeGeo = new THREE.SphereGeometry(0.045, 8, 6);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: this._accentColor, emissive: this._accentColor, emissiveIntensity: 2.5,
    });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * 0.09, 2.13, 0.22);
      this.mesh.add(eye);
    }

    // ── ARMS (obere + untere Arme, realistischer) ──
    // Upper arms
    const upperArmGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.45, 8);
    this._leftUpperArm = new THREE.Mesh(upperArmGeo, bodyMat);
    this._leftUpperArm.position.set(-0.52, 1.55, 0);
    this._leftUpperArm.rotation.z = 0.12;
    this._leftUpperArm.castShadow = true;
    this.mesh.add(this._leftUpperArm);

    this._rightUpperArm = new THREE.Mesh(upperArmGeo, bodyMat);
    this._rightUpperArm.position.set(0.52, 1.55, 0);
    this._rightUpperArm.rotation.z = -0.12;
    this._rightUpperArm.castShadow = true;
    this.mesh.add(this._rightUpperArm);

    // Forearms
    const forearmGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.4, 8);
    this._leftArm = new THREE.Mesh(forearmGeo, bodyMat);
    this._leftArm.position.set(-0.55, 1.15, 0);
    this._leftArm.rotation.z = 0.1;
    this._leftArm.castShadow = true;
    this.mesh.add(this._leftArm);

    this._rightArm = new THREE.Mesh(forearmGeo, bodyMat);
    this._rightArm.position.set(0.55, 1.15, 0);
    this._rightArm.rotation.z = -0.1;
    this._rightArm.castShadow = true;
    this.mesh.add(this._rightArm);

    // Hands
    const handGeo = new THREE.SphereGeometry(0.065, 8, 6);
    handGeo.scale(0.9, 1.2, 0.7);
    this._leftHand = new THREE.Mesh(handGeo, skinMat);
    this._leftHand.position.set(-0.57, 0.92, 0);
    this.mesh.add(this._leftHand);
    this._rightHand = new THREE.Mesh(handGeo, skinMat);
    this._rightHand.position.set(0.57, 0.92, 0);
    this.mesh.add(this._rightHand);

    // ── LEGS (realistischere Proportionen) ──
    // Upper legs (thighs)
    const thighGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.45, 8);
    this._leftThigh = new THREE.Mesh(thighGeo, darkMat);
    this._leftThigh.position.set(-0.16, 0.6, 0);
    this._leftThigh.castShadow = true;
    this.mesh.add(this._leftThigh);

    this._rightThigh = new THREE.Mesh(thighGeo, darkMat);
    this._rightThigh.position.set(0.16, 0.6, 0);
    this._rightThigh.castShadow = true;
    this.mesh.add(this._rightThigh);

    // Lower legs (calves)
    const calfGeo = new THREE.CylinderGeometry(0.095, 0.08, 0.45, 8);
    this._leftLeg = new THREE.Mesh(calfGeo, darkMat);
    this._leftLeg.position.set(-0.16, 0.22, 0);
    this._leftLeg.castShadow = true;
    this.mesh.add(this._leftLeg);

    this._rightLeg = new THREE.Mesh(calfGeo, darkMat);
    this._rightLeg.position.set(0.16, 0.22, 0);
    this._rightLeg.castShadow = true;
    this.mesh.add(this._rightLeg);

    // Boots
    const bootGeo = new THREE.BoxGeometry(0.14, 0.14, 0.24);
    const bootMat = new THREE.MeshPhysicalMaterial({
      color: 0x1a1a2e, roughness: 0.55, metalness: 0.25,
    });
    for (const side of [-1, 1]) {
      const boot = new THREE.Mesh(bootGeo, bootMat);
      boot.position.set(side * 0.16, 0.07, 0.04);
      boot.castShadow = true;
      this.mesh.add(boot);

      // Boot spur
      const spurGeo = new THREE.ConeGeometry(0.02, 0.08, 4);
      const spur = new THREE.Mesh(spurGeo, armorMat);
      spur.position.set(side * 0.16, 0.12, -0.08);
      spur.rotation.x = Math.PI / 2;
      this.mesh.add(spur);
    }

    // ── BELT (detaillierter) ──
    const beltGeo = new THREE.TorusGeometry(0.34, 0.035, 6, 20);
    const beltMat = new THREE.MeshPhysicalMaterial({
      color: 0x3a2a1a, roughness: 0.45, metalness: 0.35,
    });
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.position.set(0, 0.72, 0);
    belt.rotation.x = Math.PI / 2;
    this.mesh.add(belt);

    // Belt buckle
    const buckleGeo = new THREE.BoxGeometry(0.1, 0.08, 0.05);
    const buckle = new THREE.Mesh(buckleGeo, armorMat);
    buckle.position.set(0, 0.72, 0.35);
    this.mesh.add(buckle);

    // Belt pouch
    const pouchGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.12, 8);
    const pouch = new THREE.Mesh(pouchGeo, beltMat);
    pouch.position.set(0.25, 0.65, 0.2);
    this.mesh.add(pouch);

    // ── WEAPON / ACCENT ──
    this._buildAccent();

    // Position
    this.mesh.position.set(this._position.x, 0, this._position.z);

    // ── RIM LIGHT ──
    const rimLight = new THREE.SpotLight(this._accentColor, 1.5, 8, Math.PI / 6, 0.6, 1.5);
    rimLight.position.set(0, 3, -1.5);
    rimLight.target.position.set(0, 1.2, 0);
    this.mesh.add(rimLight);
    this.mesh.add(rimLight.target);
    this._rimLight = rimLight;

    // ── HP BAR (small, no black background) ──
    const hpFillMat = new THREE.SpriteMaterial({ color: 0x44ff44, depthTest: false, transparent: true, opacity: 0.8 });
    this._hpBar = new THREE.Sprite(hpFillMat);
    this._hpBar.scale.set(0.8, 0.06, 1);
    this._hpBar.position.y = 2.6;
    this.mesh.add(this._hpBar);
  }

  _buildHeadpiece() {
    if (this.id === 'valerius') {
      // Helmet with crest
      const helmetGeo = new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6);
      const helmetMat = new THREE.MeshPhysicalMaterial({
        color: 0x5a5a6a, roughness: 0.2, metalness: 0.9,
        clearcoat: 1.0, clearcoatRoughness: 0.05,
      });
      const helmet = new THREE.Mesh(helmetGeo, helmetMat);
      helmet.position.y = 2.18;
      helmet.castShadow = true;
      this.mesh.add(helmet);

      // Crest
      const crestGeo = new THREE.BoxGeometry(0.06, 0.3, 0.25);
      const crest = new THREE.Mesh(crestGeo, helmetMat);
      crest.position.set(0, 2.45, -0.05);
      crest.castShadow = true;
      this.mesh.add(crest);
    } else if (this.id === 'elara') {
      // Flowing hair with golden ornament
      const hairGeo = new THREE.SphereGeometry(0.33, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.65);
      const hairMat = new THREE.MeshPhysicalMaterial({
        color: 0xd4a843, roughness: 0.6, metalness: 0.1,
        sheen: 1.0, sheenRoughness: 0.3,
        sheenColor: new THREE.Color(0xffd700),
      });
      const hair = new THREE.Mesh(hairGeo, hairMat);
      hair.position.y = 2.18;
      hair.castShadow = true;
      this.mesh.add(hair);

      // Crown/tiara
      const crownGeo = new THREE.TorusGeometry(0.3, 0.03, 6, 16, Math.PI);
      const crownMat = new THREE.MeshPhysicalMaterial({
        color: 0xffd700, roughness: 0.15, metalness: 0.95,
        emissive: 0xffd700, emissiveIntensity: 0.3,
      });
      const crown = new THREE.Mesh(crownGeo, crownMat);
      crown.position.set(0, 2.35, 0);
      crown.rotation.x = -Math.PI / 2;
      this.mesh.add(crown);
    } else if (this.id === 'lucien') {
      // Hood/cloak hood
      const hoodGeo = new THREE.SphereGeometry(0.35, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.7);
      const hoodMat = new THREE.MeshPhysicalMaterial({
        color: 0x3a1a4a, roughness: 0.7, metalness: 0.05,
        sheen: 0.8, sheenRoughness: 0.4,
        sheenColor: new THREE.Color(0x6a3d7d),
      });
      const hood = new THREE.Mesh(hoodGeo, hoodMat);
      hood.position.y = 2.18;
      hood.castShadow = true;
      this.mesh.add(hood);
    }
  }

  _buildAccent() {
    if (this.id === 'valerius') {
      // Large shield on left arm
      const shieldGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.06, 12);
      const shieldMat = new THREE.MeshPhysicalMaterial({
        color: this._accentColor, roughness: 0.15, metalness: 0.9,
        emissive: this._accentColor, emissiveIntensity: 0.2,
        iridescence: 1.0, iridescenceIOR: 1.5,
        iridescenceThicknessRange: [100, 400],
        clearcoat: 1.0, clearcoatRoughness: 0.05,
      });
      const shield = new THREE.Mesh(shieldGeo, shieldMat);
      shield.position.set(-0.6, 1.2, 0.25);
      shield.rotation.x = Math.PI / 2;
      shield.castShadow = true;
      this.mesh.add(shield);

      // Shield emblem
      const emblemGeo = new THREE.CircleGeometry(0.12, 6);
      const emblemMat = new THREE.MeshStandardMaterial({
        color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.5,
      });
      const emblem = new THREE.Mesh(emblemGeo, emblemMat);
      emblem.position.set(-0.6, 1.2, 0.29);
      this.mesh.add(emblem);

      // Sword on right side
      const bladeGeo = new THREE.BoxGeometry(0.06, 0.9, 0.02);
      const bladeMat = new THREE.MeshPhysicalMaterial({
        color: 0xccccdd, roughness: 0.1, metalness: 0.95,
        clearcoat: 1.0,
      });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(0.65, 1.3, 0.1);
      blade.castShadow = true;
      this.mesh.add(blade);

      // Hilt
      const hiltGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8);
      const hiltMat = new THREE.MeshPhysicalMaterial({
        color: 0x3a2a1a, roughness: 0.5, metalness: 0.3,
      });
      const hilt = new THREE.Mesh(hiltGeo, hiltMat);
      hilt.position.set(0.65, 0.85, 0.1);
      this.mesh.add(hilt);
    } else if (this.id === 'elara') {
      // Staff
      const staffGeo = new THREE.CylinderGeometry(0.035, 0.03, 1.8, 8);
      const staffMat = new THREE.MeshPhysicalMaterial({
        color: 0x8b7355, roughness: 0.4, metalness: 0.2,
      });
      const staff = new THREE.Mesh(staffGeo, staffMat);
      staff.position.set(0.6, 1.5, 0);
      staff.castShadow = true;
      this.mesh.add(staff);

      // Glowing orb
      const orbGeo = new THREE.SphereGeometry(0.1, 12, 10);
      const orbMat = new THREE.MeshPhysicalMaterial({
        color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 3.0,
        iridescence: 1.0, iridescenceIOR: 1.8,
        iridescenceThicknessRange: [200, 600],
        transmission: 0.4, thickness: 0.5,
      });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.set(0.6, 2.5, 0);
      this.mesh.add(orb);
      this._orb = orb;

      // Orb ring
      const ringGeo = new THREE.TorusGeometry(0.15, 0.02, 8, 16);
      const ringMat = new THREE.MeshPhysicalMaterial({
        color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 1.0,
        transparent: true, opacity: 0.7,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(0.6, 2.5, 0);
      ring.rotation.x = Math.PI / 2;
      this.mesh.add(ring);
      this._orbRing = ring;
    } else if (this.id === 'lucien') {
      // Arcane wand
      const wandGeo = new THREE.CylinderGeometry(0.025, 0.04, 0.9, 8);
      const wandMat = new THREE.MeshPhysicalMaterial({
        color: 0x4a2060, roughness: 0.3, metalness: 0.4,
      });
      const wand = new THREE.Mesh(wandGeo, wandMat);
      wand.position.set(0.6, 1.5, 0.15);
      wand.rotation.x = -0.3;
      wand.castShadow = true;
      this.mesh.add(wand);

      // Crystal tip
      const tipGeo = new THREE.OctahedronGeometry(0.08, 1);
      const tipMat = new THREE.MeshPhysicalMaterial({
        color: 0x9b59b6, emissive: 0x9b59b6, emissiveIntensity: 3.0,
        iridescence: 1.0, iridescenceIOR: 1.8,
        iridescenceThicknessRange: [200, 600],
        transmission: 0.5, thickness: 0.3,
      });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.set(0.6, 1.95, 0.2);
      this.mesh.add(tip);
      this._crystal = tip;

      // Floating arcane symbols
      this._arcaneSymbols = [];
      for (let i = 0; i < 3; i++) {
        const symGeo = new THREE.OctahedronGeometry(0.04, 0);
        const symMat = new THREE.MeshStandardMaterial({
          color: 0x9b59b6, emissive: 0x9b59b6, emissiveIntensity: 1.5,
          transparent: true, opacity: 0.6,
        });
        const sym = new THREE.Mesh(symGeo, symMat);
        sym.userData = { angle: (i / 3) * Math.PI * 2, radius: 0.5, speed: 0.8 };
        this.mesh.add(sym);
        this._arcaneSymbols.push(sym);
      }
    }
  }

  updateHpBar() {
    const ratio = Math.max(0, this.hp / this.maxHp);
    this._hpBar.scale.x = 0.8 * ratio;
    this._hpBar.position.x = -0.4 * (1 - ratio);
    const r = ratio > 0.5 ? 0.27 : (1 - ratio) * 2 * 0.73 + 0.27;
    const g = ratio > 0.5 ? 0.8 : ratio * 1.6;
    this._hpBar.material.color.setRGB(r, g, 0.2);
  }

  animate(deltaTime) {
    this._animTime += deltaTime;
    const t = this._animTime;

    // Animate arcane symbols for Lucien
    if (this._arcaneSymbols) {
      for (const s of this._arcaneSymbols) {
        s.userData.angle += s.userData.speed * deltaTime;
        s.position.x = 0.6 + Math.cos(s.userData.angle) * s.userData.radius;
        s.position.z = 0.15 + Math.sin(s.userData.angle) * s.userData.radius;
        s.position.y = 1.5 + Math.sin(s.userData.angle * 2) * 0.2;
      }
    }

    // Animate orb ring for Elara
    if (this._orbRing) {
      this._orbRing.rotation.z = t * 0.5;
    }

    if (this._animState === 'idle') {
      // Breathing: torso expands slightly
      if (this._torso) this._torso.scale.y = 1 + Math.sin(t * 2) * 0.015;
      // Head bob
      this._head.position.y = 2.1 + Math.sin(t * 2) * 0.008;
      // Arm sway
      if (this._leftArm) this._leftArm.rotation.x = Math.sin(t * 1.5) * 0.04;
      if (this._rightArm) this._rightArm.rotation.x = Math.sin(t * 1.5 + 1) * 0.04;
      // Subtle leg shift
      if (this._leftThigh) this._leftThigh.rotation.x = Math.sin(t * 0.8) * 0.02;
      if (this._rightThigh) this._rightThigh.rotation.x = Math.sin(t * 0.8 + 0.5) * 0.02;
    } else if (this._animState === 'attack') {
      const progress = Math.min(t / 0.4, 1);
      const swing = Math.sin(progress * Math.PI);
      if (this._rightArm) this._rightArm.rotation.x = -swing * 1.2;
      if (this._rightUpperArm) this._rightUpperArm.rotation.x = -swing * 0.6;
      if (this._torso) this._torso.rotation.y = swing * 0.3;
      if (progress >= 1) this._animState = 'idle';
    } else if (this._animState === 'hit') {
      const progress = Math.min(t / 0.3, 1);
      const recoil = Math.sin(progress * Math.PI);
      if (this._torso) this._torso.position.x = -recoil * 0.15;
      this._head.position.x = -recoil * 0.1;

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
        if (this._torso) this._torso.position.x = 0;
        this._head.position.x = 0;
      }
    } else if (this._animState === 'heal') {
      const progress = Math.min(t / 0.6, 1);
      const glow = Math.sin(progress * Math.PI);
      if (this._orb) {
        this._orb.material.emissiveIntensity = 1.5 + glow * 3;
        this._orb.scale.setScalar(1 + glow * 0.5);
      }
      if (this._crystal) {
        this._crystal.material.emissiveIntensity = 1.2 + glow * 3;
      }
      if (this._rightArm) this._rightArm.rotation.x = -glow * 0.5;
      if (progress >= 1) this._animState = 'idle';
    } else if (this._animState === 'death') {
      const progress = Math.min(t / 1.0, 1);
      this.mesh.rotation.x = progress * Math.PI / 2;
      this.mesh.position.y = -progress * 0.3;
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

  /** Dispose all WebGL resources owned by this character mesh. */
  dispose() {
    if (!this.mesh) return;
    this.mesh.traverse(child => {
      if (child.isMesh || child.isSprite) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            for (const m of child.material) m.dispose();
          } else {
            // Dispose texture maps on material
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
    // Remove from parent scene
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }
}
