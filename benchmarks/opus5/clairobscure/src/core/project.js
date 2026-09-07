/**
 * World-space to screen-space projection helpers shared by the HUD overlay,
 * damage numbers and the free-aim reticle.
 *
 * Deliberately THREE-agnostic: callers pass in their own scratch vector so this
 * module has no import graph of its own.
 */

/**
 * Project a THREE.Vector3-like world position into CSS-pixel screen space.
 *
 * @param {{x:number,y:number,z:number}} worldPos source position
 * @param {object} camera THREE camera (must implement projection matrices)
 * @param {number} width  viewport width in CSS pixels
 * @param {number} height viewport height in CSS pixels
 * @param {{copy:Function, project:Function, x:number, y:number, z:number}} scratch
 *        a reusable THREE.Vector3 owned by the caller
 * @returns {{x:number, y:number, depth:number, visible:boolean}}
 */
export function worldToScreen(worldPos, camera, width, height, scratch) {
  scratch.copy(worldPos);
  scratch.project(camera);
  const depth = scratch.z;
  return {
    x: (scratch.x * 0.5 + 0.5) * width,
    y: (-scratch.y * 0.5 + 0.5) * height,
    depth,
    visible: depth > -1 && depth < 1,
  };
}
