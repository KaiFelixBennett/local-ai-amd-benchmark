/**
 * entities/enemy.js — An enemy combatant: procedural mesh per type, plus
 * timeline-locked telegraph animations and hit/stagger/death reactions.
 *
 * Telegraphs are the most important thing an enemy renders: the animation
 * is locked to the ReactionSystem's schedule (hit.start -> hit.center), so
 * the swing's peak lands on the exact frame the window is centered. A
 * rising emissive "charge" on the accent material doubles as the timing cue.
 *
 * Types (from enemy-data.js):
 *   nox_hound        — quadruped beast, low lunge-bites, triple rakes
 *   cindervane_knight — armored duelist, greatsword slashes + a GRAB
 *   nameless         — the boss: tall void-robe, shards, feints, phases
 *
 * The enemy owns no combat logic: battle-system / ReactionSystem tell it
 * `enterTelegraph(...)` and `resolveTelegraph(...)`; it only animates.
 */
import * as THREE from 'three';
import {
  Rig, clothMaterial, goldMaterial, darkMetalMaterial, emissiveMaterial,
  mesh, runeSprite,
} from './rig.js';
import { makeScaleTexture } from '../engine/textures.js';
import { easeOutCubic, easeInCubic, easeInOutCubic, smoothstep } from '../core/easing.js';

export class Enemy extends Rig {
  /**
   * @param {THREE.Scene} scene
   * @param {object} data  enemy-data combatant (ENEMY_DATA fields + stats)
   * @param {import('../core/timeline.js').Timeline} timeline
   */
  constructor(scene, data, timeline) {
    super(scene, { position: data.position || [0, 0, 0], rotationY: 0, scale: data.look.scale || 1 });
    this.data = data;
    this.tl = timeline;
    this._tele = null;      // active telegraph anim
    this._teleImpact = null;
    this._chargeMats = [];  // emissive mats that ramp during telegraph
    this._shards = [];
    this.build();
    this.buildWeakPoints();
    this.playIdle();
    this.setPhase(1);
  }

  build() {
    const d = this.data;
    const look = d.look;
    const hide = new THREE.MeshPhysicalMaterial({
      map: makeScaleTexture(look.hide, look.seed),
      color: new THREE.Color(look.body),
      roughness: 0.75,
      metalness: 0.1,
      sheen: 0.3,
    });
    const accent = emissiveMaterial(look.accent, 0.35);
    accent.emissive = new THREE.Color(look.accent);
    this._chargeMats.push(accent);
    const eyeMat = emissiveMaterial(look.eyes, 2.4);
    const gold = goldMaterial(look.seed, 0xc9a24b);
    const armor = darkMetalMaterial(0x444f5a);
    const body = this.body;

    if (d.id === 'nox_hound') this._buildHound(body, hide, accent, eyeMat, gold);
    else if (d.id === 'cindervane_knight') this._buildKnight(body, hide, accent, eyeMat, gold, armor);
    else this._buildNameless(body, hide, accent, eyeMat, gold);
  }

  // ------------------------------------------------------------------
  // Meshes
  // ------------------------------------------------------------------

  _buildHound(body, hide, accent, eyeMat, gold) {
    // Torso: long low ellipsoid
    this.torsoM = mesh(new THREE.SphereGeometry(0.42, 14, 12), hide, { pos: [0, 0.62, 0], scale: [1.0, 0.72, 1.55] });
    body.add(this.torsoM);
    // Mane along the spine
    for (let i = 0; i < 5; i++) {
      body.add(mesh(new THREE.ConeGeometry(0.09, 0.22, 6), accent, { pos: [0, 1.0 - i * 0.02, -0.15 - i * 0.16], rot: [0.5 - i * 0.28, 0, 0] }));
    }
    // Head group (lunges forward)
    this.headG = new THREE.Group();
    this.headG.position.set(0, 0.78, 0.62);
    body.add(this.headG);
    const skull = mesh(new THREE.SphereGeometry(0.24, 12, 10), hide, { pos: [0, 0, 0.12], scale: [0.9, 0.8, 1.25] });
    this.headG.add(skull);
    // Jaw (opens during bite)
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.05, 0.28);
    this.headG.add(this.jaw);
    this.jaw.add(mesh(new THREE.SphereGeometry(0.16, 10, 8), hide, { pos: [0, -0.04, 0.1], scale: [0.85, 0.45, 1.1] }));
    // Teeth
    for (let i = -2; i <= 2; i++) {
      this.jaw.add(mesh(new THREE.ConeGeometry(0.02, 0.07, 4), gold, { pos: [i * 0.05, 0.02, 0.2], rot: [Math.PI, 0, 0] }));
    }
    // Eyes
    this.headG.add(mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat, { pos: [-0.09, 0.08, 0.28] }));
    this.headG.add(mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat, { pos: [0.09, 0.08, 0.28] }));
    // Horns
    this.headG.add(mesh(new THREE.ConeGeometry(0.05, 0.3, 6), gold, { pos: [-0.13, 0.16, -0.05], rot: [0.4, 0, 0.5] }));
    this.headG.add(mesh(new THREE.ConeGeometry(0.05, 0.3, 6), gold, { pos: [0.13, 0.16, -0.05], rot: [0.4, 0, -0.5] }));
    // Neck
    body.add(mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.5, 10), hide, { pos: [0, 0.72, 0.42], rot: [0.6, 0, 0] }));

    // Four legs
    const legGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.62, 8);
    this.legs = [];
    for (const [x, z] of [[-0.26, 0.5], [0.26, 0.5], [-0.26, -0.5], [0.26, -0.5]]) {
      const g = new THREE.Group();
      g.position.set(x, 0.62, z);
      const upper = mesh(legGeo, hide, { pos: [0, -0.31, 0] });
      g.add(upper);
      g.add(mesh(new THREE.SphereGeometry(0.075, 8, 6), hide, { pos: [0, -0.62, 0.04] }));
      body.add(g);
      this.legs.push(g);
    }
    // Tail
    this.tail = mesh(new THREE.ConeGeometry(0.07, 0.5, 6), accent, { pos: [0, 0.72, -0.78], rot: [-2.4, 0, 0] });
    body.add(this.tail);
    // Claws accent on front legs
    this._clawMat = gold;
  }

  _buildKnight(body, hide, accent, eyeMat, gold, armor) {
    // Heavily armored humanoid
    // Legs
    for (const x of [-0.16, 0.16]) {
      body.add(mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.55, 10), armor, { pos: [x, -0.24, 0] }));
      body.add(mesh(new THREE.BoxGeometry(0.2, 0.1, 0.26), darkMetalMaterial(0x2c333b), { pos: [x, -0.55, 0.04] }));
    }
    // Torso plate
    this.torsoM = mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.7, 12), armor, { pos: [0, 0.34, 0] });
    body.add(this.torsoM);
    body.add(mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.1, 12), gold, { pos: [0, 0.66, 0] }));
    // Glowing core slit (charge)
    body.add(mesh(new THREE.BoxGeometry(0.05, 0.34, 0.03), accent, { pos: [0, 0.34, 0.25] }));
    // Pauldrons
    body.add(mesh(new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold, { pos: [-0.3, 0.68, 0] }));
    body.add(mesh(new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold, { pos: [0.3, 0.68, 0] }));
    // Head: horned visor
    this.headG = new THREE.Group();
    this.headG.position.set(0, 0.86, 0);
    body.add(this.headG);
    this.headG.add(mesh(new THREE.SphereGeometry(0.17, 12, 10), armor, { pos: [0, 0.05, 0] }));
    this.headG.add(mesh(new THREE.SphereGeometry(0.155, 12, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.5), gold, { pos: [0, 0.07, 0] }));
    // Eye slits
    this.headG.add(mesh(new THREE.BoxGeometry(0.09, 0.02, 0.02), eyeMat, { pos: [-0.06, 0.05, 0.155] }));
    this.headG.add(mesh(new THREE.BoxGeometry(0.09, 0.02, 0.02), eyeMat, { pos: [0.06, 0.05, 0.155] }));
    // Horns
    this.headG.add(mesh(new THREE.ConeGeometry(0.045, 0.34, 6), gold, { pos: [-0.15, 0.2, -0.02], rot: [0.2, 0, 0.6] }));
    this.headG.add(mesh(new THREE.ConeGeometry(0.045, 0.34, 6), gold, { pos: [0.15, 0.2, -0.02], rot: [0.2, 0, -0.6] }));
    // Cape
    this.cloak = mesh(new THREE.ConeGeometry(0.42, 1.0, 12, 1, true), clothMaterial('#3a2a44', 71), { pos: [0, 0.12, -0.14] });
    this.cloak.rotation.x = Math.PI;
    this.cloak.material.side = THREE.DoubleSide;
    body.add(this.cloak);

    // Arms
    this.shoulderL = new THREE.Group();
    this.shoulderL.position.set(-0.3, 0.66, 0);
    this.shoulderR = new THREE.Group();
    this.shoulderR.position.set(0.3, 0.66, 0);
    body.add(this.shoulderL, this.shoulderR);
    const armU = new THREE.CylinderGeometry(0.08, 0.07, 0.3, 8);
    const armL = new THREE.CylinderGeometry(0.07, 0.06, 0.28, 8);
    this.armLU = mesh(armU, armor, { pos: [0, -0.15, 0] });
    this.armLL = mesh(armL, armor, { pos: [0, -0.14, 0] });
    this.elbowL = new THREE.Group();
    this.elbowL.position.set(0, -0.3, 0);
    this.elbowL.add(this.armLL);
    this.shoulderL.add(this.armLU, this.elbowL);
    this.armRU = mesh(armU, armor, { pos: [0, -0.15, 0] });
    this.armRL = mesh(armL, armor, { pos: [0, -0.14, 0] });
    this.elbowR = new THREE.Group();
    this.elbowR.position.set(0, -0.3, 0);
    this.elbowR.add(this.armRL);
    this.shoulderR.add(this.armRU, this.elbowR);

    // Greatsword
    this.weapon = new THREE.Group();
    this.weapon.add(mesh(new THREE.BoxGeometry(0.13, 1.5, 0.05), darkMetalMaterial(0x555f6a), { pos: [0, 0.55, 0] }));
    this.weapon.add(mesh(new THREE.ConeGeometry(0.075, 0.2, 4), darkMetalMaterial(0x555f6a), { pos: [0, 1.38, 0] }));
    this.weapon.add(mesh(new THREE.BoxGeometry(0.42, 0.06, 0.08), gold, { pos: [0, -0.05, 0] }));
    // Glow groove in the blade
    this.weapon.add(mesh(new THREE.BoxGeometry(0.03, 1.2, 0.055), accent, { pos: [0, 0.6, 0] }));
    this.shoulderR.add(this.weapon);
    this.weapon.position.set(0, -0.62, 0.1);
    this.weapon.rotation.x = 0.5;
    this._baseWeaponX = this.weapon.rotation.x;
  }

  _buildNameless(body, hide, accent, eyeMat, gold) {
    // Floating robed void figure
    this.robe = mesh(new THREE.ConeGeometry(0.55, 1.5, 14, 1, true), hide, { pos: [0, 0.62, 0] });
    this.robe.rotation.x = Math.PI;
    this.robe.material = hide.clone();
    this.robe.material.side = THREE.DoubleSide;
    body.add(this.robe);
    // Gold hem ring
    body.add(mesh(new THREE.TorusGeometry(0.52, 0.03, 8, 40), gold, { pos: [0, -0.12, 0], rot: [Math.PI / 2, 0, 0] }));
    // Inner light (charge)
    this.innerLight = mesh(new THREE.SphereGeometry(0.3, 12, 10), accent, { pos: [0, 0.7, 0.05] });
    body.add(this.innerLight);
    // Hood + face
    this.headG = new THREE.Group();
    this.headG.position.set(0, 1.32, 0);
    body.add(this.headG);
    this.headG.add(mesh(new THREE.SphereGeometry(0.22, 12, 10), hide, { pos: [0, 0, 0] }));
    this.headG.add(mesh(new THREE.ConeGeometry(0.24, 0.3, 12, 1, true), hide, { pos: [0, 0.14, 0], rot: [0.3, 0, 0] }));
    // The Eye
    this.eye = mesh(new THREE.SphereGeometry(0.07, 10, 8), eyeMat, { pos: [0, 0.02, 0.17] });
    this.headG.add(this.eye);
    // Shoulder shards
    this.shoulderL = new THREE.Group();
    this.shoulderL.position.set(-0.34, 1.18, 0);
    this.shoulderR = new THREE.Group();
    this.shoulderR.position.set(0.34, 1.18, 0);
    body.add(this.shoulderL, this.shoulderR);
    this._shardL = mesh(new THREE.OctahedronGeometry(0.14), darkMetalMaterial(0x2a3244), { pos: [0, 0, 0] });
    this._shardR = mesh(new THREE.OctahedronGeometry(0.14), darkMetalMaterial(0x2a3244), { pos: [0, 0, 0] });
    this.shoulderL.add(this._shardL);
    this.shoulderR.add(this._shardR);

    // Orbiting shards (magic)
    for (let i = 0; i < 5; i++) {
      const s = mesh(new THREE.OctahedronGeometry(0.06 + (i % 2) * 0.03), darkMetalMaterial(0x33405a), { cast: false });
      s.userData.phase = (i / 5) * Math.PI * 2;
      body.add(s);
      this._shards.push(s);
    }
    this._floatBase = 0.18; // robe floats above the floor
  }

  buildWeakPoints() {
    const look = this.data.look;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(look.accent),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.weakPointMeshes = [];
    this.weakPoints = this.data.weakPoints.map((wp) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), mat);
      m.position.set(...wp.local);
      this.body.add(m);
      this.weakPointMeshes.push(m);
      return new THREE.Vector3(...wp.local);
    });
  }

  // ------------------------------------------------------------------
  // Animation
  // ------------------------------------------------------------------

  _styleFor(patternId) {
    const id = patternId || '';
    if (id.includes('bite') || id.includes('lunge') || id.includes('recover')) return 'lunge';
    if (id.includes('rake')) return 'claw';
    if (id.includes('grab') || id.includes('grip')) return 'grab';
    if (id.includes('feint') || id.includes('false')) return 'feint';
    if (id.includes('shatter') || id.includes('triple2') || id.includes('duress')) return 'shards';
    if (id.includes('frenzy')) return 'frenzy';
    if (id.includes('wave')) return 'wave';
    return 'slash';
  }

  /**
   * Lock a telegraph animation to the reaction schedule.
   * @param {object} pattern  pattern object (for style)
   * @param {object} hit      scheduled hit { start, center, windup, feint }
   */
  enterTelegraph(pattern, hit) {
    this._tele = {
      start: hit.start,
      center: hit.center,
      windup: hit.windup,
      style: this._styleFor(pattern.id),
      feint: !!hit.feint,
      done: false,
    };
    this._teleImpact = null;
  }

  /** Called at impact: play follow-through (or the deflected recoil). */
  resolveTelegraph(hit) {
    this._tele = null;
    this._teleImpact = {
      start: this.tl.now(),
      deflected: hit.quality === 'perfect' || hit.quality === 'good' || hit.quality === 'dodge',
      style: hit.quality,
    };
    for (const m of this._chargeMats) m.emissiveIntensity = 0.35;
    if (hit.quality === 'hit' || hit.quality === 'early') this.playHitFlash(420);
  }

  playIdle() {
    this._tele = null;
    this._teleImpact = null;
    this._idleT = 0;
  }

  playHitFlash(durMs = 380) {
    this._hitAnim = { t: 0, dur: durMs };
  }

  playStagger() {
    this._staggerAnim = { t: 0, dur: 1400 };
  }

  playDeath() {
    this._deathAnim = { t: 0, dur: 1400 };
  }

  setPhase(p) {
    this.phase = p;
    // Phase 2+: faster, brighter charge; phase 3: redder
    const base = this.data.look;
    if (p >= 3) {
      this._chargeMats.forEach((m) => { m.emissive.setHex(0xd84a3a); });
    } else if (p >= 2) {
      this._chargeMats.forEach((m) => { m.emissive.setHex(0x7fd8cf); });
    }
  }

  update(dt, worldT) {
    this._idleT = (this._idleT || 0) + dt;
    const p = this.pose;
    const tg = this._target;

    // --- Death: sink + dissolve handled by particles; rig just falls ---
    if (this._deathAnim) {
      this._deathAnim.t += dt * 1000;
      const t = Math.min(1, this._deathAnim.t / this._deathAnim.dur);
      tg.fall = easeInCubic(t);
      tg.shake = Math.sin(t * Math.PI) * 0.5;
      this.body.visible = t < 0.85;
      if (t >= 1) this._deathAnim = null;
    }

    // --- Stagger: wobble + crouch ---
    if (this._staggerAnim) {
      this._staggerAnim.t += dt * 1000;
      const t = this._staggerAnim.t / this._staggerAnim.dur;
      if (t >= 1) this._staggerAnim = null;
      else {
        tg.shake = Math.sin(t * Math.PI * 4) * 0.35 * (1 - t);
        tg.crouch = 0.3 * Math.sin(t * Math.PI) * (1 - t);
      }
    }

    // --- Telegraph (timeline-locked) ---
    let charge = 0;
    if (this._tele) {
      const el = this.tl.now() - this._tele.start;
      const pr = Math.max(0, Math.min(1.08, el / this._tele.windup));
      charge = smoothstep(0.15, 0.95, pr);
      this._poseTele(pr);
      if (pr >= 1.02) this._tele = null; // let resolveTelegraph take over
    } else if (this._teleImpact) {
      const el = this.tl.now() - this._teleImpact.start;
      const pr = el / 300;
      if (pr >= 1) this._teleImpact = null;
      else this._poseImpact(pr, this._teleImpact);
    }

    // --- Hit flinch ---
    if (this._hitAnim) {
      this._hitAnim.t += dt * 1000;
      const t = this._hitAnim.t / this._hitAnim.dur;
      if (t >= 1) this._hitAnim = null;
      else {
        tg.shake = Math.sin(t * Math.PI) * 0.55;
        tg.lean = -0.3 * Math.sin(t * Math.PI);
        tg.crouch = 0.15 * Math.sin(t * Math.PI);
      }
    }

    // --- Idle personality (when nothing else is driving) ---
    const driving = this._tele || this._teleImpact || this._hitAnim || this._staggerAnim || this._deathAnim;
    if (!driving) this._poseIdle(worldT);

    // Charge glow on accent materials
    for (const m of this._chargeMats) {
      m.emissiveIntensity = (this.phase >= 3 ? 0.9 : this.phase >= 2 ? 0.6 : 0.35) + charge * 3.2;
    }

    // Super-rig damping + apply
    super.update(dt, worldT);

    // Weak point world positions (for targeting)
    for (let i = 0; i < this.weakPoints.length; i++) {
      const v = this.weakPoints[i].clone();
      this.body.localToWorld(v);
      this.weakPoints[i].copy(v);
    }

    // Shard orbit (Nameless)
    for (const s of this._shards) {
      const ph = s.userData.phase + worldT * 1.4;
      s.position.set(Math.cos(ph) * 0.85, 0.9 + Math.sin(ph * 1.7) * 0.3, Math.sin(ph) * 0.85);
      s.rotation.y = worldT * 2;
    }
  }

  // Pose writers per style. pr in [0, ~1.08]; peak ~1.0 = swing lands.
  _poseTele(pr) {
    const tg = this._target;
    const style = this._tele.style;
    const pre = smoothstep(0, 0.72, pr);      // wind-up
    const strike = pr > 0.72 ? smoothstep(0.72, 1.0, pr) : 0;
    const feintPull = this._tele.feint && pr > 0.86 ? smoothstep(0.86, 1.04, pr) : 0;
    const pull = strike * (1 - feintPull * 1.0); // feint cancels the final extension
    const pullBack = feintPull;

    if (this.data.id === 'nox_hound') {
      tg.crouch = 0.32 * pre - 0.1 * pull;
      tg.slide = 0.5 * pull;
      tg.lean = 0.5 * pull - 0.2 * pre;
      if (this.headG) {
        this.headG.position.z = 0.62 + 0.5 * pull - 0.08 * pre;
        this.headG.position.y = 0.78 - 0.18 * pre + 0.08 * pull;
        this.headG.rotation.x = 0.35 * pull;
      }
      if (this.jaw) this.jaw.rotation.x = 0.7 * Math.max(pull, pre * 0.5);
      if (this.tail) this.tail.rotation.x = -2.4 + 0.5 * Math.sin(pr * Math.PI * 3);
      tg.bob = 0.04 * Math.sin(pr * Math.PI * 2);
    } else if (this.data.id === 'cindervane_knight') {
      if (style === 'grab') {
        // Arms reach forward, low — a DODGE-or-die
        tg.crouch = 0.25 * pre;
        tg.slide = 0.35 * pull;
        this.shoulderR.rotation.x = -1.9 * pre + 0.4 * pull;
        this.shoulderL.rotation.x = -1.9 * pre + 0.4 * pull;
        this.shoulderR.rotation.z = -0.3;
        this.shoulderL.rotation.z = 0.3;
        tg.lean = 0.25 * pull;
      } else if (style === 'slash' || style === 'frenzy') {
        tg.crouch = 0.2 * pre;
        tg.lean = -0.3 * pre + 0.4 * pull;
        this.shoulderR.rotation.x = -2.6 * pre + 3.2 * pull;
        this.shoulderR.rotation.z = -0.35 * pre + 0.5 * pull;
        this.elbowR.rotation.x = -1.2 * pre + 1.6 * pull;
        if (this.weapon) {
          this.weapon.rotation.x = this._baseWeaponX - 2.0 * pre + 2.6 * pull;
        }
        this.shoulderL.rotation.x = -0.6 * pre + 0.8 * pull;
        tg.slide = 0.3 * pull;
      } else {
        // shards/combo: alternating arcs
        tg.crouch = 0.18 * pre;
        tg.lean = -0.2 * pre + 0.3 * pull;
        this.shoulderR.rotation.x = -2.4 * pre + 2.9 * pull;
        if (this.weapon) this.weapon.rotation.x = this._baseWeaponX - 1.8 * pre + 2.4 * pull;
        this.shoulderL.rotation.x = -0.5 * pre;
      }
    } else {
      // Nameless
      if (style === 'wave') {
        tg.crouch = 0.0;
        this.shoulderR.rotation.x = -2.9 * pre + 3.4 * pull;
        this.shoulderL.rotation.x = -2.9 * pre + 3.4 * pull;
        tg.lean = 0.15 * pull;
        this._floatLift = 0.15 * pre;
      } else if (style === 'grab') {
        this.shoulderR.rotation.x = -2.4 * pre + 2.8 * pull;
        this.shoulderL.rotation.x = -2.4 * pre + 2.8 * pull;
        tg.slide = 0.4 * pull;
      } else if (style === 'feint') {
        this.shoulderR.rotation.x = -2.6 * pre + 2.8 * pull;
        tg.lean = -0.2 * pre + 0.3 * pull;
      } else {
        // shards: both arms sweep in a wide arc
        this.shoulderR.rotation.x = -2.5 * pre + 3.0 * pull;
        this.shoulderL.rotation.x = -2.5 * pre + 3.0 * pull;
        this.shoulderR.rotation.z = -1.2 * pre + 1.5 * pull;
        this.shoulderL.rotation.z = 1.2 * pre - 1.5 * pull;
        tg.lean = 0.1 * pull;
      }
      if (this.robe) this.robe.rotation.y = Math.sin(pr * Math.PI) * 0.4;
    }
    // Pull-back (feint snap): at the last moment the wind-up retracts so the
    // swing never connects — the readable tell that this was a feint.
    if (pullBack > 0) {
      if (this.shoulderR) this.shoulderR.rotation.x -= 1.6 * pullBack;
      if (this.shoulderL) this.shoulderL.rotation.x -= 1.2 * pullBack;
      if (this.weapon) this.weapon.rotation.x -= 1.4 * pullBack;
      if (this.headG && this.data.id === 'nox_hound') this.headG.position.z -= 0.25 * pullBack;
    }
  }

  _poseImpact(pr, impact) {
    const tg = this._target;
    const s = Math.sin(Math.min(1, pr) * Math.PI);
    if (impact.deflected) {
      // Recoil from the parry: snap back, small
      tg.lean = -0.25 * s;
      tg.shake = 0.25 * s;
      tg.crouch = 0.1 * s;
    } else {
      // Follow-through
      tg.lean = 0.35 * s;
      tg.crouch = 0.18 * s;
      tg.slide = 0.15 * s;
    }
  }

  _poseIdle(worldT) {
    const tg = this._target;
    const t = worldT;
    if (this.data.id === 'nox_hound') {
      tg.bob = Math.sin(t * 3.1) * 0.03;
      tg.crouch = 0.06;
      if (this.headG) {
        this.headG.rotation.y = Math.sin(t * 0.9) * 0.3;
        this.headG.rotation.x = Math.sin(t * 1.3) * 0.08;
      }
      tg.lean = 0;
      if (this.tail) this.tail.rotation.x = -2.4 + Math.sin(t * 2.2) * 0.25;
    } else if (this.data.id === 'cindervane_knight') {
      tg.bob = Math.sin(t * 1.6) * 0.02;
      tg.lean = 0.03;
      if (this.weapon) this.weapon.rotation.x = this._baseWeaponX + Math.sin(t * 1.1) * 0.05;
      if (this.cloak) this.cloak.rotation.y = Math.sin(t * 0.8) * 0.1;
    } else {
      tg.bob = Math.sin(t * 1.2) * 0.05 + 0.05;
      if (this.headG) this.headG.rotation.y = Math.sin(t * 0.6) * 0.15;
      if (this._shardL) this._shardL.rotation.y = t * 1.5;
      if (this._shardR) this._shardR.rotation.y = -t * 1.5;
    }
  }

  applyPose(worldT) {
    super.applyPose(worldT);
    const p = this.pose;
    // Nameless floats above the floor; the others stand on it.
    if (this.data.id === 'nameless') {
      this.body.position.y = this._floatBase + p.bob + (this._floatLift || 0);
      this._floatLift = (this._floatLift || 0) * 0.94;
    }
  }
}
