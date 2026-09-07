/**
 * The player avatar in the overworld, and the two followers.
 *
 * The avatar is the *same* procedural Character the battle uses, so Aurel who
 * walks the parvis and Aurel who parries the Curator are visibly one person.
 * Player owns position and facing; the Character handles animation, which keeps
 * the locomotion identical to the one already verified in combat.
 *
 * Movement is camera-relative, collision is resolved on the XZ plane, and the
 * body is pinned to terrain height every frame — the character never leaves the
 * ground, so no gravity integration is needed.
 */

import * as THREE from 'three';
import { heightAt, isDeepWater } from './terrain.js';
import { clamp01, damp, dampAngle } from '../core/easing.js';

const WALK_SPEED = 4.4;
const RUN_SPEED = 8.6;
const ACCEL = 15;
export const PLAYER_RADIUS = 0.55;

export class Player {
  /**
   * @param {import('./actor.js').Actor} actor skinned overworld avatar
   * @param {import('./collision.js').CollisionWorld} collision
   */
  constructor(actor, collision) {
    this.actor = actor;
    this.collision = collision;
    this.root = actor.root;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.facing = 0;
    this.speed = 0;
    this.moving = false;
    this.enabled = true;
    this._dir = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  spawnAt(x, z, facing = 0) {
    this.position.set(x, heightAt(x, z), z);
    this.facing = facing;
    this.targetFacing = facing;
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.actor.setPosition(this.position.x, this.position.y, this.position.z);
    this.actor.setFacing(facing);
  }

  /**
   * @param {number} dt
   * @param {{x:number, y:number}} input movement axis in camera space
   * @param {number} cameraYaw
   * @param {boolean} sprint
   */
  update(dt, input, cameraYaw, sprint) {
    const wanted = this._tmp.set(0, 0, 0);
    if (this.enabled && (input.x !== 0 || input.y !== 0)) {
      // Camera-relative movement.
      //
      // The chase camera sits at focus + (sin(yaw), cos(yaw)) * distance, so
      // the direction *away* from it — where W must go — is -(sin, cos), and
      // screen-right is cross(forward, up) = (cos, -sin).
      //
      // Getting the sign of the Z row wrong produces a mirrored basis rather
      // than a rotated one, which is why the old code felt correct along one
      // axis and inverted along the other depending on where you were looking.
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      const fwdX = -sin;
      const fwdZ = -cos;
      const rightX = cos;
      const rightZ = -sin;
      wanted.x = input.x * rightX + input.y * fwdX;
      wanted.z = input.x * rightZ + input.y * fwdZ;
      if (wanted.lengthSq() > 1) wanted.normalize();
    }

    const target = sprint ? RUN_SPEED : WALK_SPEED;
    this._dir.copy(wanted).multiplyScalar(target);
    this.velocity.x = damp(this.velocity.x, this._dir.x, ACCEL, dt);
    this.velocity.z = damp(this.velocity.z, this._dir.z, ACCEL, dt);

    // Deep water is a wall, not a swim — but resolve the axes separately so
    // walking into the shoreline slides along it instead of stopping dead.
    const probe = { x: this.position.x, z: this.position.z };
    const stepX = this.position.x + this.velocity.x * dt;
    const stepZ = this.position.z + this.velocity.z * dt;
    if (!isDeepWater(stepX, probe.z)) probe.x = stepX;
    else this.velocity.x *= 0.2;
    if (!isDeepWater(probe.x, stepZ)) probe.z = stepZ;
    else this.velocity.z *= 0.2;
    this.collision.resolve(probe, PLAYER_RADIUS);
    this.position.set(probe.x, heightAt(probe.x, probe.z), probe.z);

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.moving = this.speed > 0.3;

    if (this.moving) this.targetFacing = Math.atan2(this.velocity.x, this.velocity.z);
    this.facing = dampAngle(this.facing, this.targetFacing, 11, dt);

    this.actor.setPosition(this.position.x, this.position.y, this.position.z);
    this.actor.setFacing(this.facing);
    this.actor.update(dt, this.speed);
  }

  /** Head-height world position, for camera targeting and dialogue framing. */
  headPosition(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.position.y + 1.55, this.position.z);
  }
}

/**
 * A trailing expedition member. Aims at a slot behind the leader and only moves
 * once the gap opens, which gives natural stop-start behaviour with no
 * pathfinding at all. Collision is applied so followers do not walk through the
 * ruins the player has to walk around.
 */
export class Follower {
  constructor(actor, offsetAngle, distance, collision) {
    this.actor = actor;
    this.offsetAngle = offsetAngle;
    this.distance = distance;
    this.collision = collision;
    this._target = new THREE.Vector3();
    this.speed = 0;
    this.facing = 0;
    this.targetFacing = 0;
  }

  update(dt, leader) {
    const pos = this.actor.root.position;
    const ang = leader.facing + Math.PI + this.offsetAngle;
    this._target.set(
      leader.position.x + Math.sin(ang) * this.distance,
      0,
      leader.position.z + Math.cos(ang) * this.distance,
    );

    const dx = this._target.x - pos.x;
    const dz = this._target.z - pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist > 0.7) {
      const step = Math.min(dist, (Math.max(leader.speed, 2.4) + 1.4) * dt * clamp01(dist / 2.0));
      const probe = { x: pos.x + (dx / dist) * step, z: pos.z + (dz / dist) * step };
      this.collision.resolve(probe, 0.45);
      const moved = Math.hypot(probe.x - pos.x, probe.z - pos.z);
      pos.x = probe.x;
      pos.z = probe.z;
      this.speed = moved / Math.max(dt, 1e-4);
      if (moved > 1e-3) this.targetFacing = Math.atan2(dx, dz);
    } else {
      this.speed = damp(this.speed, 0, 8, dt);
      if (leader.moving) this.targetFacing = leader.facing;
    }

    pos.y = heightAt(pos.x, pos.z);
    this.facing = dampAngle(this.facing, this.targetFacing, 9, dt);
    this.actor.setFacing(this.facing);
    this.actor.update(dt, this.speed);
  }

  teleportBehind(leader) {
    const ang = leader.facing + Math.PI + this.offsetAngle;
    const x = leader.position.x + Math.sin(ang) * this.distance;
    const z = leader.position.z + Math.cos(ang) * this.distance;
    this.actor.setPosition(x, heightAt(x, z), z);
    this.facing = leader.facing;
    this.targetFacing = leader.facing;
    this.actor.setFacing(this.facing);
  }
}
