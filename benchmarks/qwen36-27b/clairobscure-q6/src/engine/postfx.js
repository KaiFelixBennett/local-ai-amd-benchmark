/**
 * Post-processing pipeline:
 *   RenderPass → SSAO → UnrealBloom → SMAA → Vignette/ColorGrade → OutputPass
 * Falls back to no-op if any import fails.
 */

import * as THREE from 'three';

// ─── Chromatic Aberration Shader ───
const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0.002 },
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
    uniform float uIntensity;
    varying vec2 vUv;
    void main() {
      vec2 center = vUv - 0.5;
      float dist = length(center);
      vec2 direction = normalize(center) * dist * uIntensity;
      float r = texture2D(tDiffuse, vUv + direction).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - direction).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};

// ─── Custom Vignette + Cinematic Color Grading + Film Grain Shader ───
// Teal/Violet contrast: shadows push teal-blue, highlights push warm-orange
const VignetteColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignetteIntensity: { value: 0.3 },
    vignetteColor: { value: new THREE.Color(0x0a0a18) },
    contrast: { value: 1.0 },
    saturation: { value: 1.05 },
    grainIntensity: { value: 0.015 },
    time: { value: 0 },
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
    uniform float vignetteIntensity;
    uniform vec3 vignetteColor;
    uniform float contrast;
    uniform float saturation;
    uniform float grainIntensity;
    uniform float time;
    varying vec2 vUv;

    // Pseudo-random noise
    float random(vec2 st) {
      return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 col = texel.rgb;

      // Contrast — lift blacks so scene stays readable
      col = (col - 0.5) * contrast + 0.5;

      // Saturation
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, saturation);

      // Teal/Violet color grading
      // Shadows: push toward teal-blue (more G and B, less R)
      // Highlights: push toward warm orange (more R, slightly more G)
      float brightness = dot(col, vec3(0.33, 0.33, 0.33));
      float shadowMask = smoothstep(0.0, 0.4, brightness);
      float highlightMask = smoothstep(0.4, 0.9, brightness);

      // Teal in shadows — subtle
      col.r -= 0.015 * (1.0 - shadowMask);
      col.g += 0.01 * (1.0 - shadowMask);
      col.b += 0.015 * (1.0 - shadowMask);

      // Warm orange in highlights
      col.r += 0.04 * highlightMask;
      col.g += 0.015 * highlightMask;
      col.b -= 0.02 * highlightMask;

      // Film grain — animated noise
      float grain = random(vUv * time * 100.0) - 0.5;
      col += grain * grainIntensity;

      // Vignette — stronger, darker edges
      vec2 uv = vUv * (1.0 - vUv);
      float vig = uv.x * uv.y * 18.0;
      vig = pow(vig, vignetteIntensity);
      col = mix(vignetteColor, col, vig);

      gl_FragColor = vec4(col, texel.a);
    }
  `,
};

export class PostProcessing {
  constructor() {
    this.composer = null;
    this.bloomPass = null;
    this.vignettePass = null;
    this._active = false;
  }

  static async create(renderer, scene, camera) {
    const pp = new PostProcessing();
    try {
      const [m0, m1, m2, m3, m4, m5, m6] = await Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'),
        import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js'),
        import('three/addons/postprocessing/OutputPass.js'),
        import('three/addons/postprocessing/SSAOPass.js'),
        import('three/addons/postprocessing/SMAAPass.js'),
        import('three/addons/postprocessing/ShaderPass.js'),
      ]);

      const w = window.innerWidth;
      const h = window.innerHeight;

      pp.composer = new m0.EffectComposer(renderer);

      // 1. Render scene
      const rp = new m1.RenderPass(scene, camera);
      pp.composer.addPass(rp);
      pp._renderPass = rp;

      // 2. SSAO — ambient occlusion for depth in corners/crevices
      const ssao = new m4.SSAOPass(scene, camera, w, h);
      ssao.kernelRadius = 16;
      ssao.minDistance = 0.005;
      ssao.maxDistance = 0.12;
      ssao.output = m4.SSAOPass.OUTPUT.Default;
      pp.composer.addPass(ssao);
      pp.ssaoPass = ssao;

      // 3. Bloom — glow on emissive materials (eyes, weapons, magic, auras)
      // strength, radius, threshold — lower threshold = more things bloom
      const bloom = new m2.UnrealBloomPass(
        new THREE.Vector2(w, h), 0.35, 0.4, 0.5
      );
      pp.composer.addPass(bloom);
      pp.bloomPass = bloom;

      // 4. SMAA — anti-aliasing for crisp edges
      const smaa = new m5.SMAAPass(w, h);
      pp.composer.addPass(smaa);
      pp.smaaPass = smaa;

      // 5. Subtle chromatic aberration — cinematic edge fringing
      const caPass = new m6.ShaderPass(ChromaticAberrationShader);
      pp.composer.addPass(caPass);
      pp.caPass = caPass;

      // 6. Custom Vignette + Color Grading
      const vigPass = new m6.ShaderPass(VignetteColorGradeShader);
      pp.composer.addPass(vigPass);
      pp.vignettePass = vigPass;

      // 7. OutputPass — sRGB + tone mapping finalization
      pp.composer.addPass(new m3.OutputPass());

      pp._active = true;
    } catch (e) {
      console.warn('Post-processing unavailable:', e.message);
      pp._active = false;
    }
    return pp;
  }

  get active() { return this._active; }

  setBloomStrength(v) {
    if (this.bloomPass) this.bloomPass.strength = v;
  }

  setChromaticAberration(v) {
    if (this.caPass) {
      this.caPass.uniforms.uIntensity.value = v;
    }
  }

  setVignetteIntensity(v) {
    if (this.vignettePass) {
      this.vignettePass.uniforms.vignetteIntensity.value = v;
    }
  }

  update(time) {
    // Update film grain time uniform
    if (this.vignettePass && this.vignettePass.uniforms.time) {
      this.vignettePass.uniforms.time.value = time;
    }
  }

  setWarmth(v) {
    if (this.vignettePass) {
      this.vignettePass.uniforms.warmth.value = v;
    }
  }

  setContrast(v) {
    if (this.vignettePass) {
      this.vignettePass.uniforms.contrast.value = v;
    }
  }

  setSize(w, h) {
    if (this.composer) this.composer.setSize(w, h);
    if (this.smaaPass) this.smaaPass.resolution.set(w, h);
    if (this.ssaoPass) {
      this.ssaoPass.setSize(w, h);
    }
  }

  /** Dispose all post-processing resources (render targets, textures, shaders). */
  dispose() {
    if (!this.composer) return;
    // Dispose each pass individually (they hold render targets, uniforms, textures)
    for (const pass of this.composer.passes) {
      if (pass.dispose) pass.dispose();
      // Also dispose uniform textures that pass.dispose() might miss
      if (pass.uniforms) {
        for (const key of Object.keys(pass.uniforms)) {
          const val = pass.uniforms[key]?.value;
          if (val && val.isTexture) val.dispose();
        }
      }
    }
    this.composer.passes.length = 0;
    this.composer = null;
    this.bloomPass = null;
    this.vignettePass = null;
    this.smaaPass = null;
    this.ssaoPass = null;
    this.caPass = null;
    this._renderPass = null;
  }
}
