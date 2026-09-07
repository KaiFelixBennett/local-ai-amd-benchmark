/**
 * WebGL renderer, scene, camera and the lighting rig.
 *
 * Lighting is a three-point setup tuned for a painterly look: a warm key that
 * casts the only shadow, a cool bounce fill so shadows never go pure black, and
 * a gilded rim from behind that separates silhouettes from the backdrop.
 * `setMood()` shifts colour temperature with battle intensity.
 */

import * as THREE from 'three';
import { damp, lerp, clamp01 } from '../core/easing.js';

/**
 * The single WebGL context for the whole application. Both the exploration
 * scene and the battle scene draw through this; creating a second context would
 * double VRAM and break asset sharing between the two modes.
 */
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // AgX rolls highlights off without the hue shift toward white that ACES
  // shows on bright saturated light — noticeably better on a sunset HDRI.
  renderer.toneMapping = THREE.AgXToneMapping;
  // 1.35 pushed a sunset HDRI past the point where AgX can hold anything: the
  // sky clipped, bloom smeared the clipped region outward, and the whole frame
  // turned to milk. Just under 1 keeps the sky inside the curve's shoulder,
  // where the cloud structure actually survives.
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x050f11, 1);
  return renderer;
}

export class RenderCore {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {(msg:string)=>void} onContextLost notified when the GPU context drops
   * @param {THREE.WebGLRenderer|null} sharedRenderer reuse an existing renderer
   *        (the exploration mode and the battle share one GL context)
   */
  constructor(canvas, onContextLost, sharedRenderer = null) {
    this.canvas = canvas;
    this.onContextLost = onContextLost || (() => {});
    this.contextLost = false;
    this.ownsRenderer = !sharedRenderer;

    this.renderer = sharedRenderer || createRenderer(canvas);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0b2226, 0.019);

    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.2, 320);
    this.camera.position.set(0, 6.4, 15);
    this.camera.lookAt(0, 1.5, 0);

    this._buildLights();

    // Colour-temperature mood, driven by battle intensity.
    this.mood = { warm: 0.5, target: 0.5, flash: 0, flashColor: new THREE.Color(0xffffff) };

    this._onLost = (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.onContextLost('The graphics context was lost. Restoring…');
    };
    this._onRestored = () => {
      this.contextLost = false;
      this.onContextLost('');
    };
    canvas.addEventListener('webglcontextlost', this._onLost, false);
    canvas.addEventListener('webglcontextrestored', this._onRestored, false);
  }

  _buildLights() {
    const s = this.scene;

    // Sky/ground hemisphere: cheap global fill that keeps shadows coloured.
    this.hemi = new THREE.HemisphereLight(0x9fd0d4, 0x2a1b10, 0.55);
    s.add(this.hemi);

    // Warm key — the only shadow caster.
    this.key = new THREE.DirectionalLight(0xffd9a0, 2.4);
    this.key.position.set(7.5, 12, 7);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 48;
    this.key.shadow.camera.left = -18;
    this.key.shadow.camera.right = 18;
    this.key.shadow.camera.top = 16;
    this.key.shadow.camera.bottom = -10;
    this.key.shadow.bias = -0.0009;
    this.key.shadow.normalBias = 0.028;
    s.add(this.key);
    s.add(this.key.target);
    this.key.target.position.set(0, 1, 0);

    // Cool fill from the opposite side.
    this.fill = new THREE.DirectionalLight(0x7ec4d8, 0.75);
    this.fill.position.set(-9, 5.5, 4);
    s.add(this.fill);

    // Gilded rim from behind and above.
    this.rim = new THREE.DirectionalLight(0xffc978, 1.5);
    this.rim.position.set(-2.5, 7, -12);
    s.add(this.rim);

    // Two practical point lights sitting in the arena for local sparkle.
    this.practicalA = new THREE.PointLight(0xffbe6a, 14, 26, 2);
    this.practicalA.position.set(-8.5, 3.4, -3.5);
    s.add(this.practicalA);
    this.practicalB = new THREE.PointLight(0x66d9d0, 10, 24, 2);
    this.practicalB.position.set(8.5, 3.2, -3.5);
    s.add(this.practicalB);

    // Reusable flash light for parries and crits.
    this.flashLight = new THREE.PointLight(0xffffff, 0, 30, 2);
    this.flashLight.position.set(0, 4, 3);
    s.add(this.flashLight);

    this.ambient = new THREE.AmbientLight(0x24484c, 0.42);
    s.add(this.ambient);
  }

  /**
   * @param {number} warmth 0 = cold and dim (party in danger), 1 = warm and bright
   */
  setMood(warmth) {
    this.mood.target = clamp01(warmth);
  }

  /** Trigger a short coloured light burst (parry = cold, crit = warm). */
  flash(colorHex, strength = 1) {
    this.mood.flash = Math.max(this.mood.flash, strength);
    this.mood.flashColor.setHex(colorHex);
  }

  update(dt, elapsed) {
    const m = this.mood;
    m.warm = damp(m.warm, m.target, 1.6, dt);
    m.flash = Math.max(0, m.flash - dt * 3.4);

    this.key.intensity = lerp(1.5, 2.7, m.warm);
    this.key.color.setHSL(lerp(0.075, 0.1, m.warm), lerp(0.62, 0.44, m.warm), 0.62);
    this.fill.intensity = lerp(1.05, 0.7, m.warm);
    this.hemi.intensity = lerp(0.36, 0.6, m.warm);
    this.rim.intensity = lerp(2.1, 1.4, m.warm) + m.flash * 1.4;

    // Practicals breathe slightly, like gas lamps.
    this.practicalA.intensity = 12 + Math.sin(elapsed * 2.1) * 2.2 + m.flash * 10;
    this.practicalB.intensity = 9 + Math.sin(elapsed * 1.7 + 1.3) * 1.8 + m.flash * 8;

    this.flashLight.intensity = m.flash * 46;
    this.flashLight.color.copy(m.flashColor);

    this.scene.fog.density = lerp(0.026, 0.015, m.warm);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.ownsRenderer) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(w, h, false);
    }
  }

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this._onLost);
    this.canvas.removeEventListener('webglcontextrestored', this._onRestored);
    if (this.ownsRenderer) this.renderer.dispose();
  }
}
