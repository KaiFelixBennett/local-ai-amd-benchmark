/**
 * Skinned overworld actors.
 *
 * Locomotion clips come from the character's *own* file wherever possible.
 * Two of the three downloaded rigs ship a full idle/walk/run set; sharing one
 * rig's clips with another only looks right when both bake the same bone rest
 * orientations, which these exports do not — driving the mannequin with the
 * soldier's clips laid it flat on its back. Own clips first, borrowed clips
 * only for the character that has none, is both simpler and more correct than
 * retargeting.
 *
 * Locomotion is a three-way weight blend (idle / walk / run) driven by ground
 * speed, with playback rate tied to speed so the feet do not skate.
 */

import * as THREE from 'three';
import { clamp01, damp, lerp } from '../core/easing.js';

const UP = new THREE.Vector3(0, 1, 0);

const WALK_AT = 4.4;
const RUN_AT = 8.6;

const LOCOMOTION = /^(idle|walk|run)$/i;

/**
 * Strip root motion from a clip authored for *this* rig.
 *
 * The hips translation walks the character across the floor; the controller
 * owns position, so replaying it would make the body drift away from its own
 * collision capsule. Every rotation track is kept, including the hips, because
 * on its own rig those are exactly right.
 */
export function ownClip(clip) {
  const tracks = clip.tracks.filter((t) => !t.name.endsWith('.position') && !t.name.endsWith('.scale'));
  return new THREE.AnimationClip(clip.name.toLowerCase(), clip.duration, tracks);
}

/**
 * Reduce a clip so it can drive a *different* Mixamo skeleton.
 *
 * Beyond the root motion, the hips *rotation* also goes: each export bakes its
 * own axis correction into the hip bone's rest orientation, so overwriting it
 * with a foreign rig's hip rotation tips the whole figure over. The hips only
 * carry gentle body sway in a locomotion clip, so losing it costs nothing.
 */
export function rotationOnlyClip(clip) {
  const tracks = clip.tracks.filter((t) => (
    t.name.endsWith('.quaternion') && !/Hips\.quaternion$/.test(t.name)
  ));
  return new THREE.AnimationClip(clip.name.toLowerCase(), clip.duration, tracks);
}

/**
 * Pick the locomotion set for one character: its own idle/walk/run if the file
 * ships all three, otherwise the borrowed set.
 *
 * @param {THREE.AnimationClip[]} own clips found in the character's own glTF
 * @param {THREE.AnimationClip[]} borrowed already-reduced fallback clips
 * @returns {{clips:THREE.AnimationClip[], source:'own'|'borrowed'}}
 */
export function locomotionFor(own, borrowed) {
  const mine = (own || []).filter((c) => LOCOMOTION.test(c.name));
  if (mine.length >= 3) return { clips: mine.map(ownClip), source: 'own' };
  return { clips: borrowed, source: 'borrowed' };
}

export class Actor {
  /**
   * @param {THREE.Object3D} model the loaded glTF scene (used directly)
   * @param {THREE.AnimationClip[]} clips rotation-only locomotion clips
   * @param {{tint?:number, roughness?:number, metalness?:number}} look
   */
  constructor(model, clips, look = {}) {
    this.root = new THREE.Group();
    this.model = model;
    this.root.add(model);

    model.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      // Skinned bounds are computed from the bind pose and go stale while
      // animating; culling on them makes limbs pop out of existence.
      o.frustumCulled = false;
      if (!o.material) return;
      o.material = o.material.clone();
      o.material.envMapIntensity = look.envMapIntensity ?? 1.0;
      if (look.roughness !== undefined) o.material.roughness = look.roughness;
      if (look.metalness !== undefined) o.material.metalness = look.metalness;
      // Tint is applied whether or not the rig is textured: `color` multiplies
      // the map, so a textured character is graded rather than repainted. The
      // soldier ships near-white and read as a bleached cut-out against a
      // sunset; an untextured rig would otherwise read as flat plastic.
      if (look.tint !== undefined) {
        const tint = new THREE.Color(look.tint);
        o.material.color = o.material.map
          ? o.material.color.clone().lerp(tint, look.grade ?? 0.45)
          : tint;
      }
    });

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of clips) {
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      action.setEffectiveWeight(0);
      action.play();
      this.actions[clip.name.toLowerCase()] = action;
    }
    if (this.actions.idle) this.actions.idle.setEffectiveWeight(1);

    this.speed = 0;
  }

  /**
   * Vertical extent of the skeleton in world units, measured from bone
   * positions.
   *
   * Deliberately *not* using `SkinnedMesh.computeBoundingBox()`: that walks the
   * vertices through `applyBoneTransform`, whose result does not reflect a scale
   * applied to the model node the way you would expect, so scaling the rig left
   * the reported height unchanged. Bone world translations are unambiguous.
   *
   * @returns {{height:number, footY:number}} footY is relative to the rig root
   */
  measureSkeleton() {
    this.model.updateWorldMatrix(true, true);
    let minY = Infinity;
    let maxY = -Infinity;
    this.model.traverse((o) => {
      if (!o.isBone) return;
      const y = o.matrixWorld.elements[13];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
    if (!(maxY > minY)) return { height: 0, footY: 0 };
    return { height: maxY - minY, footY: minY - this.root.position.y };
  }

  measureHeight() {
    return this.measureSkeleton().height;
  }

  /**
   * Scale the rig so the skeleton spans `target` metres, and put its feet on
   * the rig origin.
   *
   * The three downloaded characters do not agree on units — as loaded their
   * skeletons spanned wildly different heights, which would have put a
   * knee-high figure next to a full-size one. Two correction passes are run
   * because the first measurement is taken before the pose has settled.
   *
   * @returns {{before:number, after:number}}
   */
  /** Find a bone whose name ends with `suffix` (Mixamo naming). */
  findBone(suffix) {
    let found = null;
    this.model.traverse((o) => {
      if (!found && o.isBone && o.name.endsWith(suffix)) found = o;
    });
    return found;
  }

  /**
   * Rotate the rig so its head really is above its hips.
   *
   * These exports do not agree on an up axis: one bakes a Z-up correction into
   * the hip bone's rest orientation, which the shared clips then partly
   * override, leaving the figure on its back. Rather than hard-coding a fix per
   * model, measure the actual hips→head vector and rotate whatever is needed to
   * stand it up. Self-correcting, and it costs nothing when already upright.
   *
   * @returns {number} the hips→head Y component before correction
   */
  standUpright() {
    const hips = this.findBone('Hips');
    const head = this.findBone('Head');
    if (!hips || !head) return 1;

    this.model.updateWorldMatrix(true, true);
    const a = new THREE.Vector3().setFromMatrixPosition(hips.matrixWorld);
    const b = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
    const spine = b.sub(a);
    const len = spine.length();
    if (len < 1e-4) return 1;
    spine.divideScalar(len);
    if (spine.y > 0.85) return spine.y;      // already standing

    const fix = new THREE.Quaternion().setFromUnitVectors(spine, UP);
    this.model.quaternion.premultiply(fix);
    this.model.updateWorldMatrix(true, true);
    return spine.y;
  }

  normalizeHeight(target = 1.8) {
    this.mixer.update(1 / 60);
    const before = this.measureHeight();
    this.uprightBefore = this.standUpright();
    for (let pass = 0; pass < 2; pass++) {
      const { height } = this.measureSkeleton();
      if (height > 0.05) this.model.scale.multiplyScalar(target / height);
    }
    // Put the lowest bone on the rig origin so the feet meet the ground.
    const { footY } = this.measureSkeleton();
    this.model.position.y -= footY;
    return { before, after: this.measureHeight() };
  }

  setPosition(x, y, z) {
    this.root.position.set(x, y, z);
  }

  setFacing(yaw) {
    this.root.rotation.y = yaw;
  }

  /** @param {number} speed metres per second along the ground */
  update(dt, speed) {
    this.speed = speed;
    const { idle, walk, run } = this.actions;

    const wRun = clamp01((speed - WALK_AT * 0.75) / (RUN_AT - WALK_AT * 0.75));
    const wWalk = clamp01(speed / (WALK_AT * 0.75)) * (1 - wRun);
    const wIdle = Math.max(0, 1 - wWalk - wRun);

    const rate = 9;
    if (idle) idle.setEffectiveWeight(damp(idle.getEffectiveWeight(), wIdle, rate, dt));
    if (walk) walk.setEffectiveWeight(damp(walk.getEffectiveWeight(), wWalk, rate, dt));
    if (run) run.setEffectiveWeight(damp(run.getEffectiveWeight(), wRun, rate, dt));

    if (walk) walk.setEffectiveTimeScale(lerp(0.8, 1.25, clamp01(speed / WALK_AT)));
    if (run) run.setEffectiveTimeScale(lerp(0.85, 1.15, clamp01(speed / RUN_AT)));

    this.mixer.update(dt);
  }

  get visible() {
    return this.root.visible;
  }

  set visible(v) {
    this.root.visible = v;
  }
}
