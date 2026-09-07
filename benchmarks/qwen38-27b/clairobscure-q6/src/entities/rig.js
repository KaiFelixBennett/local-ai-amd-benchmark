/**
 * entities/rig.js — Shared procedural rig: materials, limb helpers, and the
 * pose/animation machinery both Character (party) and Enemy extend.
 *
 * A Rig is a THREE.Group with a `body` subgroup (everything that animates)
 * on top of an unanimated `root`. Animations are named functions of
 * progress (0..1) that write into a `pose` object; `applyPose()` maps the
 * pose to transforms every frame with damping, so animation changes blend
 * smoothly instead of snapping.
 */
import * as THREE from 'three';
import { PALETTE, makeClothTexture, makeGoldTexture, makeRuneTexture } from '../engine/textures.js';
import { damp, clamp } from '../core/rng.js';

// ---------------------------------------------------------------------------
// Material factories (cached per key so repeated surfaces share textures)
// ---------------------------------------------------------------------------
const _clothCache = new Map();
const _goldCache = new Map();

export function clothMaterial(hex, seed = 1, { sheen = 0.4 } = {}) {
  const key = hex + '|' + seed + '|' + sheen;
  if (_clothCache.has(key)) return _clothCache.get(key);
  const tex = makeClothTexture(hex, seed);
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.0,
    sheen: sheen,
    sheenColor: new THREE.Color(0x665533),
    sheenRoughness: 0.8,
  });
  _clothCache.set(key, mat);
  return mat;
}

export function goldMaterial(seed = 1, color = 0xd8b45e) {
  const key = seed + '|' + color;
  if (_goldCache.has(key)) return _goldCache.get(key);
  const mat = new THREE.MeshPhysicalMaterial({
    map: makeGoldTexture(seed),
    color,
    metalness: 0.92,
    roughness: 0.32,
    clearcoat: 0.3,
  });
  _goldCache.set(key, mat);
  return mat;
}

export function skinMaterial(hex) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.65, metalness: 0.0 });
}

export function darkMetalMaterial(color = 0x3a444d) {
  return new THREE.MeshPhysicalMaterial({
    color, metalness: 0.85, roughness: 0.45, clearcoat: 0.2,
  });
}

export function emissiveMaterial(hex, intensity = 1.4) {
  return new THREE.MeshStandardMaterial({
    color: 0x111111,
    emissive: new THREE.Color(hex),
    emissiveIntensity: intensity,
    roughness: 0.4,
  });
}

/** A glowing rune billboard (sprite) for weak points / magic accents. */
export function runeSprite(hex, size = 0.5) {
  const tex = makeRuneTexture(Math.floor(Math.random() * 999) + 1);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: new THREE.Color(hex),
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.setScalar(size);
  return sp;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

export function mesh(geo, mat, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], cast = true, name = '' } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  m.castShadow = cast;
  if (name) m.name = name;
  return m;
}

/** Simple two-bone limb: upper + lower, pivoting at `upper` joint. */
export function makeLimb({
  parent, matUpper, matLower,
  upperLen = 0.34, lowerLen = 0.32, upperR = 0.09, lowerR = 0.08,
  joint = [0, 0, 0], baseRot = [0, 0, 0],
} = {}) {
  const group = new THREE.Group();
  group.position.set(...joint);
  group.rotation.set(...baseRot);
  const upper = mesh(new THREE.CylinderGeometry(upperR, lowerR + 0.01, upperLen, 10), matUpper, { pos: [0, -upperLen / 2, 0] });
  const elbow = new THREE.Group();
  elbow.position.set(0, -upperLen, 0);
  const lower = mesh(new THREE.CylinderGeometry(lowerR, lowerR * 0.85, lowerLen, 10), matLower, { pos: [0, -lowerLen / 2, 0] });
  const hand = new THREE.SphereGeometry(lowerR * 1.15, 10, 10);
  const handM = mesh(hand, matLower, { pos: [0, -lowerLen, 0] });
  elbow.add(lower, handM);
  group.add(upper, elbow);
  parent.add(group);
  return { group, elbow, hand: handM };
}

// ---------------------------------------------------------------------------
// Rig base class
// ---------------------------------------------------------------------------

export class Rig {
  /**
   * @param {THREE.Scene} scene
   * @param {object} cfg { position:[x,y,z], rotationY, scale }
   */
  constructor(scene, cfg = {}) {
    this.root = new THREE.Group();
    this.root.name = 'rig-root';
    this.root.position.set(...(cfg.position || [0, 0, 0]));
    this.root.rotation.y = cfg.rotationY || 0;
    if (cfg.scale) this.root.scale.setScalar(cfg.scale);

    this.body = new THREE.Group();
    this.root.add(this.body);

    // Pose: current (damped) and target values
    this.pose = {
      bob: 0, lean: 0, crouch: 0,
      armL: 0, armR: 0, elbowL: 0, elbowR: 0,
      weapon: 0, weaponZ: 0,
      slide: 0, squash: 0, fall: 0, shake: 0,
      glow: 0,
    };
    this._target = { ...this.pose };
    this._anim = null; // { name, t, dur, loop, fn }
    this._poseScale = cfg.scale || 1;
    scene.add(this.root);
  }

  /** Switch animation. fn(progress, rig) writes pose targets. */
  play(name, durMs, fn, { loop = false } = {}) {
    this._anim = { name, t: 0, dur: Math.max(1, durMs), loop, fn };
  }

  get animName() {
    return this._anim ? this._anim.name : 'idle';
  }

  get animProgress() {
    return this._anim ? Math.min(1, this._anim.t / this._anim.dur) : 0;
  }

  /** Write pose targets for idle breathing (called when no anim is active). */
  idlePose(t) {
    this._target.bob = Math.sin(t * 2.1) * 0.025;
    this._target.lean = 0;
    this._target.crouch = 0;
    this._target.shake = 0;
    this._target.slide = 0;
  }

  update(dt, worldT) {
    const a = this._anim;
    if (a) {
      a.t += dt * 1000;
      if (a.fn) a.fn(Math.min(1, a.t / a.dur), this);
      if (a.t >= a.dur) {
        if (a.loop) a.t = a.t % a.dur;
        else this._anim = null;
      }
    } else {
      this.idlePose(worldT);
    }
    // Damp current pose toward targets
    const p = this.pose, tg = this._target;
    const l = 14;
    p.bob = damp(p.bob, tg.bob, l, dt);
    p.lean = damp(p.lean, tg.lean, l, dt);
    p.crouch = damp(p.crouch, tg.crouch, l, dt);
    p.armL = damp(p.armL, tg.armL, l, dt);
    p.armR = damp(p.armR, tg.armR, l, dt);
    p.elbowL = damp(p.elbowL, tg.elbowL, l, dt);
    p.elbowR = damp(p.elbowR, tg.elbowR, l, dt);
    p.weapon = damp(p.weapon, tg.weapon, l * 1.2, dt);
    p.weaponZ = damp(p.weaponZ, tg.weaponZ, l * 1.2, dt);
    p.slide = damp(p.slide, tg.slide, 10, dt);
    p.squash = damp(p.squash, tg.squash, 12, dt);
    p.fall = damp(p.fall, tg.fall, 3.2, dt);
    p.shake = damp(p.shake, tg.shake, 16, dt);
    p.glow = damp(p.glow, tg.glow, 8, dt);
    this.applyPose(worldT);
  }

  /** Subclasses map pose -> transforms. Default: simple bob/crouch/lean. */
  applyPose(worldT) {
    const p = this.pose;
    this.body.position.y = p.bob - p.crouch * 0.35;
    this.body.rotation.x = p.lean;
    this.body.rotation.z = p.shake * Math.sin(worldT * 55) * 0.06 + p.fall * -1.35;
    this.body.position.x = p.slide;
    const sq = 1 - p.squash * 0.12;
    this.body.scale.set(1 + p.squash * 0.08, sq, 1 + p.squash * 0.08);
    if (p.fall > 0.02) this.root.scale.setScalar((this._poseScale || 1) * (1 - p.fall * 0.25));
  }

  get position() {
    return this.root.position;
  }

  /** Local-space point -> world (for aim tracers, markers). */
  toWorld(local) {
    const v = local.clone ? local.clone() : new THREE.Vector3(...local);
    return this.root.localToWorld(v);
  }

  dispose(scene) {
    scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}
