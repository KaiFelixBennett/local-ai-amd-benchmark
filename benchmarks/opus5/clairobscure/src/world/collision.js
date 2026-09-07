/**
 * Collision for the overworld.
 *
 * Deliberately simple and cheap: the player is a circle on the XZ plane, the
 * world is a list of circles and axis-aligned boxes, plus a set of convex
 * "keep inside" boundaries. Resolution is positional push-out, run twice so a
 * corner between two colliders settles instead of jittering.
 *
 * A full physics engine would buy nothing here — there is no stacking, no
 * dynamics, and the character never leaves the ground plane.
 */

export class CollisionWorld {
  constructor() {
    this.circles = [];    // { x, z, r, top }
    this.boxes = [];      // { minX, maxX, minZ, maxZ, top }
    this.bounds = null;   // { x, z, r } — player is kept inside this circle
  }

  /**
   * @param {number} top world Y of the obstacle's top. Movement ignores it —
   *        everything blocks a walking character — but the camera ray uses it
   *        so the boom is not collapsed by a plinth it is floating above.
   */
  addCircle(x, z, r, top = 6) {
    this.circles.push({ x, z, r, top });
    return this;
  }

  addBox(minX, minZ, maxX, maxZ, top = 6) {
    this.boxes.push({ minX, minZ, maxX, maxZ, top });
    return this;
  }

  /** Axis-aligned box from a centre and size. */
  addBoxAt(cx, cz, sizeX, sizeZ, top = 6) {
    return this.addBox(cx - sizeX / 2, cz - sizeZ / 2, cx + sizeX / 2, cz + sizeZ / 2, top);
  }

  setBounds(x, z, r) {
    this.bounds = { x, z, r };
    return this;
  }

  clear() {
    this.circles.length = 0;
    this.boxes.length = 0;
  }

  /**
   * Push a moving circle out of everything it overlaps.
   * @param {{x:number, z:number}} p mutated in place
   * @param {number} radius
   * @returns {boolean} whether anything was hit
   */
  resolve(p, radius) {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.circles) {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const min = c.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / d;
        p.x += dx * push;
        p.z += dz * push;
        hit = true;
      }
      for (const b of this.boxes) {
        // Nearest point on the box to the circle centre.
        const nx = Math.max(b.minX, Math.min(p.x, b.maxX));
        const nz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
        const dx = p.x - nx;
        const dz = p.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = (radius - d) / d;
          p.x += dx * push;
          p.z += dz * push;
        } else {
          // Centre is inside the box: eject along the shallowest axis.
          const toMinX = p.x - b.minX;
          const toMaxX = b.maxX - p.x;
          const toMinZ = p.z - b.minZ;
          const toMaxZ = b.maxZ - p.z;
          const m = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
          if (m === toMinX) p.x = b.minX - radius;
          else if (m === toMaxX) p.x = b.maxX + radius;
          else if (m === toMinZ) p.z = b.minZ - radius;
          else p.z = b.maxZ + radius;
        }
      }
    }

    if (this.bounds) {
      const dx = p.x - this.bounds.x;
      const dz = p.z - this.bounds.z;
      const max = this.bounds.r - radius;
      const d2 = dx * dx + dz * dz;
      if (d2 > max * max && d2 > 0) {
        const d = Math.sqrt(d2);
        p.x = this.bounds.x + (dx / d) * max;
        p.z = this.bounds.z + (dz / d) * max;
        hit = true;
      }
    }
    return hit;
  }

  /**
   * First blocker along a ray on the XZ plane, used to keep the chase camera
   * from pushing through walls. Returns the free distance along `dir`.
   *
   * @param {number} rayY height the ray travels at; obstacles whose top is
   *        below this are ignored, because the camera clears them.
   */
  rayDistance(ox, oz, dx, dz, maxDist, pad = 0.3, rayY = -Infinity) {
    let best = maxDist;
    for (const c of this.circles) {
      if (c.top < rayY) continue;
      const mx = ox - c.x;
      const mz = oz - c.z;
      const b = mx * dx + mz * dz;
      const cc = mx * mx + mz * mz - (c.r + pad) * (c.r + pad);
      if (cc > 0 && b > 0) continue;
      const disc = b * b - cc;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t >= 0 && t < best) best = t;
    }
    for (const bx of this.boxes) {
      if (bx.top < rayY) continue;
      const t = raySlab(ox, oz, dx, dz, bx, pad);
      if (t !== null && t >= 0 && t < best) best = t;
    }
    return best;
  }
}

/** Slab test for an axis-aligned box, inflated by `pad`. */
function raySlab(ox, oz, dx, dz, b, pad) {
  const minX = b.minX - pad;
  const maxX = b.maxX + pad;
  const minZ = b.minZ - pad;
  const maxZ = b.maxZ + pad;
  let tmin = -Infinity;
  let tmax = Infinity;

  if (Math.abs(dx) < 1e-8) {
    if (ox < minX || ox > maxX) return null;
  } else {
    let t1 = (minX - ox) / dx;
    let t2 = (maxX - ox) / dx;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (Math.abs(dz) < 1e-8) {
    if (oz < minZ || oz > maxZ) return null;
  } else {
    let t1 = (minZ - oz) / dz;
    let t2 = (maxZ - oz) / dz;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (tmax < tmin || tmax < 0) return null;
  return tmin;
}
