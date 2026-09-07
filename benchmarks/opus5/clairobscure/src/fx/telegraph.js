/**
 * In-world telegraph rendering — the ground cue the whole reactive layer is
 * read from.
 *
 * Under every targeted ally sits a fixed "impact marker" ring. A second, larger
 * ring shrinks toward it as the wind-up progresses; the instant the two meet is
 * the instant to press. Colour separates parryable (gold) from unblockable
 * grabs (crimson), and a white flash confirms an armed input.
 *
 * Rings are pooled and driven entirely from `ReactionSystem.liveTelegraphs()`,
 * so the visual can never drift out of sync with the timing logic.
 */

import * as THREE from 'three';
import { telegraphRingTexture, impactRingTexture } from '../engine/textures.js';
import { clamp01, lerp, easeOutCubic } from '../core/easing.js';

const POOL = 6;
const MARKER_RADIUS = 1.5;
const START_RADIUS = 5.4;

const COLORS = {
  parry: new THREE.Color('#f0d060'),
  grab: new THREE.Color('#e04a3a'),
  armedParry: new THREE.Color('#bff2ff'),
  armedDodge: new THREE.Color('#9ee8b0'),
};

function ringMesh(map, color, renderOrder) {
  const mat = new THREE.MeshBasicMaterial({
    map, color, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = renderOrder;
  m.visible = false;
  return m;
}

export class TelegraphFX {
  constructor(scene) {
    this.scene = scene;
    this.slots = [];
    for (let i = 0; i < POOL; i++) {
      const group = new THREE.Group();
      const marker = ringMesh(impactRingTexture(), COLORS.parry, 3);
      const closing = ringMesh(telegraphRingTexture(), COLORS.parry, 4);
      group.add(marker, closing);
      group.visible = false;
      scene.add(group);
      this.slots.push({ group, marker, closing, used: false });
    }
    this._v = new THREE.Vector3();
  }

  /**
   * @param {Array} telegraphs from ReactionSystem.liveTelegraphs()
   */
  sync(telegraphs) {
    for (const s of this.slots) s.used = false;

    for (let i = 0; i < telegraphs.length && i < POOL; i++) {
      const t = telegraphs[i];
      const s = this.slots[i];
      s.used = true;
      if (!t.target) continue;

      const p = t.target.root.position;
      s.group.position.set(p.x, 0.06, p.z);
      s.group.visible = true;

      const base = t.kind === 'grab' ? COLORS.grab : COLORS.parry;
      const armed = t.armed === 'parry' ? COLORS.armedParry
        : t.armed === 'dodge' ? COLORS.armedDodge : null;
      const col = armed || base;

      const prog = clamp01(t.progress);
      const radius = lerp(START_RADIUS, MARKER_RADIUS, easeOutCubic(prog) * 0.35 + prog * 0.65);

      // Closing ring: shrinks onto the marker, brightening as it converges.
      s.closing.visible = true;
      s.closing.scale.set(radius * 2, radius * 2, 1);
      s.closing.material.color.copy(col);
      s.closing.material.opacity = 0.35 + prog * 0.65;

      // Marker: pulses harder the closer the strike gets.
      s.marker.visible = true;
      const pulse = 1 + Math.sin(prog * 22) * 0.03 * prog;
      s.marker.scale.set(MARKER_RADIUS * 2 * pulse, MARKER_RADIUS * 2 * pulse, 1);
      s.marker.material.color.copy(col);
      s.marker.material.opacity = 0.35 + prog * 0.4 + (armed ? 0.3 : 0);
    }

    for (const s of this.slots) {
      if (s.used) continue;
      s.group.visible = false;
      s.closing.visible = false;
      s.marker.visible = false;
    }
  }

  clear() {
    for (const s of this.slots) {
      s.group.visible = false;
      s.used = false;
    }
  }
}
