/**
 * entities/character.js — A playable party member: procedural humanoid mesh
 * + named pose animations driven through the shared Rig.
 *
 * Build (all primitives, look-driven):
 *   legs (2) -> hips -> torso (cloth) -> shoulders -> arms (2)
 *   head (skin) + hair (style: long/bun/short) + eyes
 *   cloak (cone) for Mae/Lune, pauldrons + greatsword for Gustave,
 *   bow for Mae, staff for Lune
 *
 * Animations write pose targets (see rig.js): 'idle', 'attack', 'cast',
 * 'parry', 'dodge', 'hit', 'death', 'victory', 'buff'. fx/particles reads
 * `swing` / `castGlow` to fire tracers at the right moment.
 */
import * as THREE from 'three';
import {
  Rig, clothMaterial, goldMaterial, skinMaterial, darkMetalMaterial,
  emissiveMaterial, mesh, runeSprite,
} from './rig.js';
import { easeOutCubic, easeInCubic, easeOutBack, easeInOutCubic } from '../core/easing.js';

const Y = 0.52; // body pivot height (feet rest on the floor at local y=-0.52)

export class Character extends Rig {
  constructor(scene, data, slotIndex) {
    // Formation: front row nearer the enemies (-z), back row behind; the
    // party faces the enemy side. `slotIndex` keeps the three apart.
    const row = data.row === 'front' ? 0 : 1;
    const side = slotIndex - 1; // -1, 0, 1
    const x = side * 1.5;
    const z = (row === 0 ? 4.4 : 2.7) + side * side * 0.35;
    super(scene, { position: [x, Y, z], rotationY: Math.PI, scale: 1 });
    this.data = data;
    this.swing = { active: false, progress: 0 };
    this.castGlow = 0;
    this._hitUntil = 0;
    this.build(slotIndex);
    if (this.weapon) this._initBaseWeaponX();
    this.playIdle();
  }

  build(slotIndex) {
    const look = this.data.look || {};
    const skin = skinMaterial(look.skin || '#e8c9a8');
    const cloth = clothMaterial(look.accent || '#3f8f83', look.seed || 1);
    const cloth2 = clothMaterial(look.cloak || look.accent || '#333', (look.seed || 1) + 7);
    const gold = goldMaterial(look.seed || 1, 0xc9a24b);
    const body = this.body;

    // --- Legs ---
    this.legL = mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.5, 10), cloth2, { pos: [-0.11, -0.25, 0] });
    this.legR = mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.5, 10), cloth2, { pos: [0.11, -0.25, 0] });
    body.add(this.legL, this.legR);
    // Boots
    body.add(mesh(new THREE.BoxGeometry(0.13, 0.08, 0.2), darkMetalMaterial(0x2a2622), { pos: [-0.11, -0.52, 0.03] }));
    body.add(mesh(new THREE.BoxGeometry(0.13, 0.08, 0.2), darkMetalMaterial(0x2a2622), { pos: [0.11, -0.52, 0.03] }));

    // --- Torso (slightly tapered, cloth) ---
    this.torso = mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.62, 12), cloth, { pos: [0, 0.31, 0] });
    body.add(this.torso);
    // Belt
    body.add(mesh(new THREE.TorusGeometry(0.185, 0.03, 8, 18), gold, { pos: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0] }));
    body.add(mesh(new THREE.BoxGeometry(0.08, 0.06, 0.03), gold, { pos: [0, 0.03, 0.17] }));

    // --- Shoulders + arms ---
    this.shoulderL = new THREE.Group();
    this.shoulderL.position.set(-0.21, 0.56, 0);
    this.shoulderR = new THREE.Group();
    this.shoulderR.position.set(0.21, 0.56, 0);
    body.add(this.shoulderL, this.shoulderR);

    const armGeoU = new THREE.CylinderGeometry(0.055, 0.05, 0.3, 8);
    const armGeoL = new THREE.CylinderGeometry(0.05, 0.045, 0.28, 8);
    this.armLU = mesh(armGeoU, cloth, { pos: [0, -0.15, 0] });
    this.armLL = mesh(armGeoL, cloth, { pos: [0, -0.14, 0] });
    this.elbowL = new THREE.Group();
    this.elbowL.position.set(0, -0.3, 0);
    this.elbowL.add(this.armLL);
    this.elbowL.add(mesh(new THREE.SphereGeometry(0.055, 8, 8), skin, { pos: [0, -0.26, 0] }));
    this.shoulderL.add(this.armLU, this.elbowL);

    this.armRU = mesh(armGeoU, cloth, { pos: [0, -0.15, 0] });
    this.armRL = mesh(armGeoL, cloth, { pos: [0, -0.14, 0] });
    this.elbowR = new THREE.Group();
    this.elbowR.position.set(0, -0.3, 0);
    this.elbowR.add(this.armRL);
    this.elbowR.add(mesh(new THREE.SphereGeometry(0.055, 8, 8), skin, { pos: [0, -0.26, 0] }));
    this.shoulderR.add(this.armRU, this.elbowR);

    // Pauldrons (Gustave gets bigger gilded ones)
    const pMat = this.data.id === 'gustave' ? gold : cloth;
    body.add(mesh(new THREE.SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), pMat, { pos: [-0.21, 0.58, 0] }));
    body.add(mesh(new THREE.SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), pMat, { pos: [0.21, 0.58, 0] }));

    // --- Head ---
    this.head = new THREE.Group();
    this.head.position.set(0, 0.72, 0);
    body.add(this.head);
    const headM = mesh(new THREE.SphereGeometry(0.13, 14, 12), skin, { pos: [0, 0.06, 0] });
    this.head.add(headM);
    // Eyes
    const eyeMat = emissiveMaterial(0xd9e6e2, 0.55);
    this.head.add(mesh(new THREE.SphereGeometry(0.016, 6, 6), eyeMat, { pos: [-0.045, 0.06, 0.115] }));
    this.head.add(mesh(new THREE.SphereGeometry(0.016, 6, 6), eyeMat, { pos: [0.045, 0.06, 0.115] }));
    // Hair by style
    const hairMat = clothMaterial(look.hair || '#444', (look.seed || 1) + 13, { sheen: 0.8 });
    if (look.hairStyle === 'long') {
      this.head.add(mesh(new THREE.SphereGeometry(0.138, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat, { pos: [0, 0.075, -0.01] }));
      this.head.add(mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.5, 10), hairMat, { pos: [0, -0.16, -0.07] }));
    } else if (look.hairStyle === 'bun') {
      this.head.add(mesh(new THREE.SphereGeometry(0.14, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat, { pos: [0, 0.08, -0.01] }));
      this.head.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), hairMat, { pos: [0, 0.2, -0.04] }));
      this.head.add(mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14), gold, { pos: [0, 0.155, -0.04], rot: [Math.PI / 2, 0, 0] }));
    } else {
      this.head.add(mesh(new THREE.SphereGeometry(0.14, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat, { pos: [0, 0.085, -0.015] }));
    }

    // --- Cloak (Mae, Lune) ---
    if (this.data.id !== 'gustave') {
      this.cloak = mesh(new THREE.ConeGeometry(0.34, 0.95, 12, 1, true), cloth2, { pos: [0, 0.1, -0.09] });
      this.cloak.rotation.x = Math.PI; // open cone pointing down
      this.cloak.material = cloth2.clone();
      this.cloak.material.side = THREE.DoubleSide;
      body.add(this.cloak);
    }

    // --- Weapon by class ---
    this._buildWeapon();

    // Weak point markers (party: none; enemies own theirs)
    this.weakPoints = [];
    this.aimRadius = 1.15;
  }

  _buildWeapon() {
    const gold = goldMaterial((this.data.look.seed || 1) + 21, 0xd8b45e);
    const dark = darkMetalMaterial(0x39434c);
    if (this.data.id === 'mae') {
      // Bow in right hand: curved arc + string
      this.weapon = new THREE.Group();
      const bowArc = mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 20, Math.PI * 1.1), dark, { rot: [0, 0, -Math.PI * 0.05] });
      this.weapon.add(bowArc);
      const stringGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -0.3 * Math.sin(Math.PI * 0.55), 0),
        new THREE.Vector3(0, 0.3 * Math.sin(Math.PI * 0.55), 0),
      ]);
      this.weapon.add(new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xd9d2c0 })));
      this.shoulderR.add(this.weapon);
      this.weapon.position.set(0, -0.56, 0.1);
    } else if (this.data.id === 'lune') {
      // Staff: pole + glowing orb
      this.weapon = new THREE.Group();
      this.weapon.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.0, 8), dark, { pos: [0, 0, 0] }));
      const orb = mesh(new THREE.SphereGeometry(0.07, 12, 10), emissiveMaterial(0x7fd8cf, 2.2), { pos: [0, 0.52, 0] });
      this.weapon.add(orb);
      this._orb = orb;
      this.shoulderR.add(this.weapon);
      this.weapon.position.set(0.02, -0.5, 0.12);
      this.weapon.rotation.z = -0.12;
    } else {
      // Greatsword: long blade + gilded guard
      this.weapon = new THREE.Group();
      this.weapon.add(mesh(new THREE.BoxGeometry(0.09, 0.95, 0.035), dark, { pos: [0, 0.35, 0] }));
      this.weapon.add(mesh(new THREE.ConeGeometry(0.05, 0.14, 4), dark, { pos: [0, 0.88, 0] }));
      this.weapon.add(mesh(new THREE.BoxGeometry(0.26, 0.04, 0.06), gold, { pos: [0, -0.05, 0] }));
      this.weapon.add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 8), gold, { pos: [0, -0.16, 0] }));
      this.shoulderR.add(this.weapon);
      this.weapon.position.set(0, -0.56, 0.08);
      this.weapon.rotation.x = 0.4;
    }
  }

  // ------------------------------------------------------------------
  // Pose application (class-specific)
  // ------------------------------------------------------------------

  applyPose(worldT) {
    super.applyPose(worldT);
    const p = this.pose;
    this.shoulderL.rotation.x = p.armL;
    this.shoulderL.rotation.z = 0.12 + p.armL * 0.2;
    this.elbowL.rotation.x = p.elbowL;
    this.shoulderR.rotation.x = p.armR;
    this.shoulderR.rotation.z = -0.12 - p.armR * 0.2;
    this.elbowR.rotation.x = p.elbowR;
    if (this.weapon) {
      this.weapon.rotation.x = this._baseWeaponX + p.weapon;
      this.weapon.rotation.y = p.weaponZ;
    }
    if (this.cloak) {
      this.cloak.rotation.y = Math.sin(worldT * 1.3) * 0.12;
    }
    if (this._orb) {
      this._orb.material.emissiveIntensity = 1.6 + p.glow * 3.5 + Math.sin(worldT * 5) * 0.25;
    }
  }

  _initBaseWeaponX() {
    this._baseWeaponX = this.weapon ? this.weapon.rotation.x : 0;
  }

  // ------------------------------------------------------------------
  // Animations (write pose targets from progress 0..1)
  // ------------------------------------------------------------------

  playIdle() {
    this._resetPose();
    // Gentle breathing loop (a loop with no fn would never end: play()
    // would hold a NaN duration).
    this.play('idle', 4200, (t, rig) => {
      const s = Math.sin((t % 1) * Math.PI * 2);
      rig._target.bob = s * 0.028;
      rig._target.lean = s * 0.02;
      rig._target.armR = 0.05 * s;
      rig._target.armL = -0.04 * s;
    }, { loop: true });
  }

  /** Dead members stay down instead of idling back upright. */
  idlePose(t) {
    if (this.data.dead) {
      this._target.fall = 1;
      this._target.lean = 0.8;
      this._target.crouch = 0.6;
      this._target.bob = 0;
      this._target.shake = 0;
      this._target.slide = 0;
      return;
    }
    super.idlePose(t);
  }
  _resetPose() {
    this._target.bob = 0; this._target.lean = 0; this._target.crouch = 0;
    this._target.armL = 0; this._target.armR = 0; this._target.elbowL = 0.25; this._target.elbowR = 0.25;
    this._target.weapon = 0; this._target.weaponZ = 0;
    this._target.slide = 0; this._target.squash = 0; this._target.fall = 0; this._target.shake = 0;
    this._target.glow = 0;
    this.swing.active = false;
    if (this.weapon) this._initBaseWeaponX();
  }

  /** Melee swing / bow draw / staff thrust. `swing` flag peaks at 0.55. */
  playAttack(durMs = 560) {
    if (!this.weapon) this._initBaseWeaponX();
    this.play('attack', durMs, (t) => {
      const wind = easeOutCubic(Math.min(1, t / 0.45));
      const swing = t < 0.45 ? 0 : easeInOutCubic((t - 0.45) / 0.4);
      const recover = t > 0.85 ? easeInCubic((t - 0.85) / 0.15) : 0;
      this._target.armR = -0.5 * wind - 2.2 * swing + 2.2 * recover * swing;
      this._target.armL = 0.3 * wind + 0.5 * swing;
      this._target.elbowR = 0.6 * wind - 0.4 * swing;
      this._target.weapon = this.data.ranged ? 0 : -1.7 * swing + 1.7 * recover * swing;
      this._target.lean = -0.18 * swing + 0.1 * wind;
      this._target.slide = 0.28 * swing - 0.28 * recover * swing;
      this._target.crouch = 0.12 * swing;
      this.swing.active = t >= 0.5 && t <= 0.85;
      this.swing.progress = swing;
    });
    this.swing.active = true;
  }

  playCast(durMs = 700) {
    this.play('cast', durMs, (t) => {
      const up = easeOutCubic(Math.min(1, t / 0.5));
      const flare = t > 0.45 && t < 0.8 ? Math.sin(((t - 0.45) / 0.35) * Math.PI) : 0;
      this._target.armR = -1.9 * up;
      this._target.armL = -1.2 * up;
      this._target.elbowR = -0.5 * up;
      this._target.lean = -0.12 * up;
      this._target.glow = flare;
      this.castGlow = flare;
    });
  }

  playHeal(durMs = 720) { this.playCast(720); }

  playBuff(durMs = 560) {
    this.play('buff', durMs, (t) => {
      const s = Math.sin(t * Math.PI);
      this._target.armR = -1.4 * s;
      this._target.armL = -1.4 * s;
      this._target.glow = s * 0.7;
      this._target.crouch = 0.1 * s;
    });
  }

  playParry(durMs = 420) {
    this.play('parry', durMs, (t) => {
      const s = Math.sin(t * Math.PI);
      // Arms cross in front, weapon up to deflect
      this._target.armR = -1.5 * s;
      this._target.armL = -1.1 * s;
      this._target.elbowR = -1.2 * s;
      this._target.elbowL = -0.8 * s;
      this._target.weapon = 0.9 * s;
      this._target.weaponZ = 0.7 * s;
      this._target.crouch = 0.18 * s;
      this._target.glow = s * 0.5;
    });
  }

  playDodge(durMs = 380) {
    this.play('dodge', durMs, (t) => {
      const s = Math.sin(t * Math.PI);
      this._target.slide = 0.55 * s;
      this._target.lean = 0.5 * s;
      this._target.crouch = 0.3 * s;
      this._target.armL = -0.8 * s;
      this._target.armR = -0.8 * s;
    });
  }

  playHit(durMs = 360) {
    this.play('hit', durMs, (t) => {
      const s = Math.sin(t * Math.PI);
      this._target.lean = 0.45 * s;
      this._target.shake = s;
      this._target.armL = 0.5 * s;
      this._target.armR = 0.6 * s;
    });
  }

  playDeath() {
    this.play('death', 1250, (t) => {
      const f = easeInCubic(Math.min(1, t / 0.85));
      this._target.fall = f;
      this._target.lean = f * 0.8;
      this._target.crouch = f * 0.6;
    }, { loop: false });
  }

  playVictory() {
    this.play('victory', 900, (t) => {
      const s = Math.sin(t * Math.PI);
      this._target.armR = -2.6 * s;
      this._target.bob = Math.abs(Math.sin(t * Math.PI * 3)) * 0.08;
    });
  }

  playStaggered() {
    this.play('stagger', 600, (t) => {
      this._target.shake = Math.sin(t * Math.PI) * 0.8;
      this._target.crouch = 0.25 * Math.sin(t * Math.PI);
      this._target.lean = 0.3 * Math.sin(t * 2 * Math.PI);
    });
  }

  /** Face the enemy side (rotation handled by scene placement). */
  faceAngle(a) {
    this.root.rotation.y = a;
  }

  get isDown() {
    return this.pose.fall > 0.5;
  }
}
