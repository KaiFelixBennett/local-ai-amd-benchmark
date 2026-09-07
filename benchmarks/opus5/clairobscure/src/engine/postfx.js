/**
 * Post-processing pipeline.
 *
 * RenderPass -> UnrealBloomPass -> OutputPass. The OutputPass is mandatory:
 * when three.js renders into a composer render target it skips tone mapping and
 * colour-space conversion, so without it the whole frame comes out flat.
 *
 * The addon modules are pulled in with a dynamic import inside a try/catch. If
 * anything about them fails to load we fall back to rendering the scene
 * directly — `render()` has the same signature either way, so callers never
 * need to know which path is live.
 */

import * as THREE from 'three';
import { clamp01, damp } from '../core/easing.js';

export class PostFX {
  constructor(renderCore) {
    this.core = renderCore;
    this.composer = null;
    this.bloom = null;
    this.enabled = false;
    this.baseStrength = 0.52;
    this.boost = 0;
  }

  /**
   * Attempt to build the composer. Always resolves; `this.enabled` reports
   * whether the rich path or the passthrough path is in use.
   */
  async init() {
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] =
        await Promise.all([
          import('three/addons/postprocessing/EffectComposer.js'),
          import('three/addons/postprocessing/RenderPass.js'),
          import('three/addons/postprocessing/UnrealBloomPass.js'),
          import('three/addons/postprocessing/OutputPass.js'),
        ]);

      const { renderer, scene, camera } = this.core;
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Multisampled composer target.
      //
      // `new WebGLRenderer({ antialias: true })` only antialiases the *default*
      // framebuffer. Everything here is drawn into the composer's own target
      // instead, so that flag has been doing nothing and every edge in the game
      // — lamp posts, roof lines, character silhouettes — has been rendering
      // hard-aliased. Handing EffectComposer a target with `samples` restores
      // real MSAA on the geometry pass, which is where the aliasing is; the
      // later fullscreen passes do not need it.
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const target = new THREE.WebGLRenderTarget(
        Math.floor(w * pixelRatio),
        Math.floor(h * pixelRatio),
        { type: THREE.HalfFloatType, samples: 4 },
      );
      target.texture.name = 'PostFX.msaa';

      const composer = new EffectComposer(renderer, target);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
      composer.addPass(new RenderPass(scene, camera));

      // Subtle: bloom is for gilding, runes and rim light — not a haze filter.
      const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), this.baseStrength, 0.62, 0.82);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());

      this.composer = composer;
      this.bloom = bloom;
      this.enabled = true;
    } catch (err) {
      console.warn('[postfx] composer unavailable, falling back to direct render:', err);
      this.composer = null;
      this.bloom = null;
      this.enabled = false;
    }
    return this.enabled;
  }

  /** Momentarily push bloom for parries, ultimates and crits. */
  pulseBloom(amount = 0.6) {
    this.boost = Math.max(this.boost, amount);
  }

  update(dt) {
    this.boost = damp(this.boost, 0, 4.5, dt);
    if (this.bloom) {
      this.bloom.strength = this.baseStrength + this.boost;
      this.bloom.radius = 0.62 + clamp01(this.boost) * 0.2;
    }
  }

  render() {
    if (this.enabled && this.composer) this.composer.render();
    else this.core.renderer.render(this.core.scene, this.core.camera);
  }

  resize(w, h) {
    if (this.composer) {
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.composer.setSize(w, h);
    }
    if (this.bloom && this.bloom.resolution) this.bloom.resolution.set(w, h);
  }

  dispose() {
    if (this.composer && typeof this.composer.dispose === 'function') this.composer.dispose();
  }
}
