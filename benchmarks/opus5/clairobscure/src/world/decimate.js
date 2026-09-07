/**
 * Vertex-clustering decimation.
 *
 * Poly Haven's scanned props are authored for hero close-ups: a single boulder
 * is ~98k triangles. Scattering forty of them is millions of triangles per
 * frame, most of it invisible detail on rocks the player walks past.
 *
 * This collapses a mesh onto a uniform grid: every vertex falling in the same
 * cell is merged into their average, triangles that degenerate are dropped, and
 * normals are recomputed. It is lossy and it is meant to be — silhouette and
 * volume survive, micro-detail does not, and the normal map carries the surface
 * anyway. A 98k boulder becomes ~3k triangles with no visible difference at the
 * distance these are actually seen from.
 */

import * as THREE from 'three';

/**
 * @param {THREE.BufferGeometry} geometry source (not modified)
 * @param {number} gridSize cells along the longest axis; lower = more collapse
 * @returns {THREE.BufferGeometry} a new, smaller geometry
 */
export function decimateGeometry(geometry, gridSize = 22) {
  const src = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const pos = src.attributes.position;
  const uv = src.attributes.uv;
  const vertexCount = pos.count;
  if (vertexCount < 300) return src;

  src.computeBoundingBox();
  const bb = src.boundingBox;
  const sizeX = bb.max.x - bb.min.x;
  const sizeY = bb.max.y - bb.min.y;
  const sizeZ = bb.max.z - bb.min.z;
  const longest = Math.max(sizeX, sizeY, sizeZ);
  if (!(longest > 0)) return src;

  // Per-axis divisions with a floor of MIN_DIV.
  //
  // A uniform grid sized by the longest axis destroys thin geometry: a 5 m lamp
  // post is thinner than one cell, so its whole cross-section collapses to a
  // single point and the post disappears. Guaranteeing a few cells across every
  // axis keeps slender shapes standing.
  const MIN_DIV = 4;
  const cellUniform = longest / gridSize;
  const divX = Math.max(MIN_DIV, Math.ceil(sizeX / cellUniform));
  const divY = Math.max(MIN_DIV, Math.ceil(sizeY / cellUniform));
  const divZ = Math.max(MIN_DIV, Math.ceil(sizeZ / cellUniform));
  const cellX = sizeX > 0 ? sizeX / divX : 1;
  const cellY = sizeY > 0 ? sizeY / divY : 1;
  const cellZ = sizeZ > 0 ? sizeZ / divZ : 1;
  const nx = divX + 1;
  const ny = divY + 1;

  // cellKey -> { index, x, y, z, u, v, n }
  const cells = new Map();
  const vertexToCell = new Int32Array(vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const cx = Math.floor((x - bb.min.x) / cellX);
    const cy = Math.floor((y - bb.min.y) / cellY);
    const cz = Math.floor((z - bb.min.z) / cellZ);
    const key = cx + cy * nx + cz * nx * ny;

    let c = cells.get(key);
    if (!c) {
      c = { index: cells.size, x: 0, y: 0, z: 0, u: 0, v: 0, n: 0 };
      cells.set(key, c);
    }
    c.x += x;
    c.y += y;
    c.z += z;
    if (uv) {
      c.u += uv.getX(i);
      c.v += uv.getY(i);
    }
    c.n++;
    vertexToCell[i] = c.index;
  }

  // Representative vertex per cell = the average of everything that fell in it.
  const outCount = cells.size;
  const outPos = new Float32Array(outCount * 3);
  const outUv = uv ? new Float32Array(outCount * 2) : null;
  for (const c of cells.values()) {
    outPos[c.index * 3] = c.x / c.n;
    outPos[c.index * 3 + 1] = c.y / c.n;
    outPos[c.index * 3 + 2] = c.z / c.n;
    if (outUv) {
      outUv[c.index * 2] = c.u / c.n;
      outUv[c.index * 2 + 1] = c.v / c.n;
    }
  }

  // Rebuild triangles, dropping any that collapsed to a line or a point.
  const indices = [];
  for (let t = 0; t < vertexCount; t += 3) {
    const a = vertexToCell[t];
    const b = vertexToCell[t + 1];
    const c = vertexToCell[t + 2];
    if (a === b || b === c || a === c) continue;
    indices.push(a, b, c);
  }
  if (indices.length === 0) return src;

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  if (outUv) out.setAttribute('uv', new THREE.BufferAttribute(outUv, 2));
  out.setIndex(outCount > 65535
    ? new THREE.BufferAttribute(new Uint32Array(indices), 1)
    : new THREE.BufferAttribute(new Uint16Array(indices), 1));
  out.computeVertexNormals();
  out.computeBoundingBox();
  out.computeBoundingSphere();
  // aoMap needs a second UV channel; mirror the first.
  if (out.attributes.uv) out.setAttribute('uv1', out.attributes.uv);
  src.dispose();
  return out;
}

/** Triangle count of a geometry, for logging and budgeting. */
export function triangleCount(geometry) {
  if (geometry.index) return geometry.index.count / 3;
  return geometry.attributes.position.count / 3;
}
