/**
 * engine/postfx.js — EffectComposer + UnrealBloom + OutputPass.
 *
 * All three import paths and constructor signatures below are pinned to
 * three@0.160.0 (verified against the examples/jsm shipped with that
 * release). If anything in the chain fails to construct (context limits,
 * missing WebGL extensions), we degrade to a plain renderer pass so the
 * game always renders. `game.js` calls `render()` either way.
 *
 * Keep bloom subtle: it exists to make gilded trim, runes and magic glow —
 * the vignette / grain / grade live on the 2D HUD overlay, not here.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

// A self-contained cinematic grade: gentle vignette, a soft teal-shadow /
// warm-highlight split, a touch of contrast, and a faint time-varying grain.
// Written so it reads as "film" without turning the palette wrong. If this
// pass ever fails to construct, PostFX simply keeps the verified bloom chain.
const CinematicGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.0 },
    uSplit: { value: 1.0 },
    uGrain: { value: 0.04 },
    uCA: { value: 0.0 }, // chromatic aberration amount (cinematic lens feel)
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uSplit;
    uniform float uGrain;
    uniform float uCA;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      // Lens-like RGB separation, growing toward the frame edges.
      vec2 caDir = (uv - 0.5) * (uCA * 0.015);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + caDir).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - caDir).b;
      // Soft split-tone: teal in shadows, warm in highlights.
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 shadowTint = vec3(0.42, 0.58, 0.60);
      vec3 highlightTint = vec3(1.0, 0.94, 0.82);
      col = mix(col, col * shadowTint, (1.0 - smoothstep(0.0, 0.55, luma)) * 0.18 * uSplit);
      col = mix(col, col * highlightTint, (smoothstep(0.55, 1.0, luma)) * 0.14 * uSplit);
      // Gentle contrast + lift on the midtones.
      col = (col - 0.5) * 1.05 + 0.5;
      // Vignette.
      vec2 d = uv - 0.5;
      float vig = smoothstep(0.95, 0.32, length(d) * 1.25);
      col *= mix(1.0, vig, uVignette);
      // Faint grain.
      float g = (hash(uv * 913.0 + vec2(uTime * 60.0)) - 0.5) * uGrain;
      col += g;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

// God rays ("light streaks"): radial blur toward a screen-space light point
// (the Spire beacon / the setting sun), thresholded so only bright sources
// streak, then added back. The overworld-only answer to volumetric light
// shafts — cheap, and it is exactly what makes the Spire read monumental.
const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    uLightPos: { value: new THREE.Vector2(0.5, 0.8) },
    uStrength: { value: 0.5 },
    uRadius: { value: 0.28 },
    uThreshold: { value: 0.72 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uLightPos;
    uniform float uStrength;
    uniform float uRadius;
    uniform float uThreshold;
    varying vec2 vUv;
    void main() {
      // 32-sample radial march from the light point to the pixel.
      vec2 d = vUv - uLightPos;
      vec2 stepVec = d * (1.0 / 32.0);
      vec2 uv = uLightPos + stepVec;
      float illum = 0.0;
      for (int i = 0; i < 32; i++) {
        float luma = dot(texture2D(tDiffuse, uv).rgb, vec3(0.299, 0.587, 0.114));
        illum += max(0.0, luma - uThreshold) * (1.0 - float(i) / 32.0);
        uv += stepVec;
      }
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float streak = (illum / 32.0) * uStrength;
      streak *= smoothstep(uRadius, uRadius * 0.15, length(d)); // fade far from source
      col += vec3(1.0, 0.86, 0.62) * streak; // warm shaft
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostFX {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   */
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = null;
    this.bloom = null;
    this.enabled = false;
    this._boost = 0;
    this._w = renderer.domElement.width;
    this._h = renderer.domElement.height;
    this._pixelRatio = renderer.getPixelRatio();
    try {
      this._init();
    } catch (err) {
      console.warn('PostFX unavailable, using plain rendering:', err && err.message);
      this.composer = null;
    }
  }

  _init() {
    const renderer = this.renderer;
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));

    const size = renderer.getSize(new THREE.Vector2());
    const bloom = new UnrealBloomPass(
      size,       // resolution Vector2
      0.38,       // strength  — subtle, for gilded highlights only
      0.55,       // radius
      0.78        // threshold — bright emissive/rune/light areas only
    );
    composer.addPass(bloom);

    // God rays: warm radial streaks from a screen-space light point.
    // Overworld-only (Spire beacon / setting sun); off in the battle so the
    // verified combat look is untouched. Wrapped: a failure skips the pass.
    this.godRays = null;
    this._worldLook = false;
    try {
      const rays = new ShaderPass(GodRaysShader);
      rays.uniforms.uStrength.value = 0.5;
      rays.uniforms.uRadius.value = 0.3;
      rays.uniforms.uThreshold.value = 0.7;
      rays.enabled = false;
      composer.addPass(rays);
      this.godRays = rays;
    } catch (err) {
      console.warn('God rays unavailable:', err && err.message);
    }

    // Cinematic depth of field (BokehPass). It renders a second depth pass
    // of the scene, so it is heavy: enabled ONLY for overworld/cutscene
    // moments, never in battle. Same guarded pattern as the grade.
    this.bokeh = null;
    try {
      const bokeh = new BokehPass(this.scene, this.camera, {
        focus: 24.0,     // world-space distance of the focal plane (subject)
        aperture: 0.00025,
        maxblur: 0.006,
      });
      bokeh.uniforms.nearClip.value = this.camera.near;
      bokeh.uniforms.farClip.value = this.camera.far;
      bokeh.enabled = false;
      composer.addPass(bokeh);
      this.bokeh = bokeh;
    } catch (err) {
      console.warn('Depth of field unavailable:', err && err.message);
    }

    // Cinematic grade (vignette / split-tone / grain / chromatic aberration).
    // Added AFTER bloom so it grades the final image, before the colour-space
    // OutputPass. It starts disabled and is toggled for cinematics; a failure
    // here must NOT break the verified bloom chain, so it is wrapped and
    // simply skipped on error.
    this.grade = null;
    this._cinematic = false;
    try {
      const grade = new ShaderPass(CinematicGradeShader);
      grade.uniforms.uVignette.value = 1.0;
      grade.uniforms.uSplit.value = 1.0;
      grade.uniforms.uGrain.value = 0.04;
      grade.uniforms.uCA.value = 0.0;
      grade.enabled = false;
      composer.addPass(grade);
      this.grade = grade;
    } catch (err) {
      console.warn('Cinematic grade unavailable:', err && err.message);
    }

    composer.addPass(new OutputPass());

    composer.setPixelRatio(this._pixelRatio);
    composer.setSize(size.x, size.y);

    this.composer = composer;
    this.bloom = bloom;
    this.enabled = true;
  }

  /** Call on window resize. */
  resize(w, h, pixelRatio) {
    this._w = w;
    this._h = h;
    if (pixelRatio != null) this._pixelRatio = pixelRatio;
    if (this.composer) {
      this.composer.setPixelRatio(this._pixelRatio);
      this.composer.setSize(w, h);
    }
  }

  /**
   * Momentary bloom lift (parry flash / ultimate). `boost` is added to the
   * base strength and decays automatically via `update`.
   */
  pulse(boost = 0.5) {
    this._boost = (this._boost || 0) + boost;
  }

  /**
   * Toggle the cinematic grade for cutscenes. On, the vignette/split/grain
   * pass is enabled (and the bloom is dialed back so it doesn't fight the
   * grade); off, the normal battle look returns. No-op if the pass is absent.
   */
  setCinematic(on) {
    this._cinematic = !!on;
    if (this.grade) {
      this.grade.enabled = !!on;
      // A touch of lens aberration sells the cutscene look; 0 in battle.
      this.grade.uniforms.uCA.value = on ? 1.0 : 0.0;
    }
  }

  /**
   * World-look pass: god rays + depth of field. On for the overworld and
   * cinematics (the "painted expedition" feel), OFF for battle — the
   * verified combat look must stay crisp and fast. `focus` is the
   * world-space distance the focal plane sits at (usually the subject, e.g.
   * the player or the Spire).
   */
  setWorldLook(on, focus = 24) {
    this._worldLook = !!on;
    if (this.godRays) this.godRays.enabled = this._worldLook;
    if (this.bokeh) {
      this.bokeh.enabled = this._worldLook;
      if (typeof focus === 'number' && isFinite(focus) && focus > 0) {
        this.bokeh.uniforms.focus.value = focus;
      }
    }
  }

  /**
   * Update the god-rays light anchor (a world-space Vector3; the Spire
   * beacon or the sun). No-op when the pass is absent.
   */
  setLightAnchor(worldPos) {
    if (!this.godRays || !worldPos) return;
    const v = worldPos.clone ? worldPos.clone() : new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
    v.project(this.camera);
    if (!isFinite(v.x) || !isFinite(v.y)) return;
    // NDC is (-1..1, +y up); UV is (0..1, +v up) — the same orientation.
    const u = this.godRays.uniforms.uLightPos;
    u.value.x = v.x * 0.5 + 0.5;
    u.value.y = v.y * 0.5 + 0.5;
  }

  /** Per-frame: decay the pulse; advance the grade's grain clock. */
  update(dt) {
    // _boost must be a real number from frame one: `0.38 + undefined` is NaN
    // and NaN poisons the bloom composite, blacking out the whole frame.
    if (typeof this._boost !== 'number') this._boost = 0;
    if (this._boost > 0) {
      this._boost = Math.max(0, this._boost - dt * 2.2);
    }
    if (this.bloom) {
      // Slightly calmer bloom during cinematics so the grade reads as film.
      this.bloom.strength = (this._cinematic ? 0.3 : 0.38) + this._boost;
    }
    if (this.grade && this.grade.uniforms && this.grade.uniforms.uTime) {
      this.grade.uniforms.uTime.value += dt;
    }
  }

  /** Render the scene through the composer (or plain fallback). */
  render() {
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    if (this.composer) {
      try { this.composer.dispose(); } catch (err) { /* noop */ }
    }
    this.composer = null;
    this.enabled = false;
  }
}
