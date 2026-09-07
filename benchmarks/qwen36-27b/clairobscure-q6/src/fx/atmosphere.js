/**
 * Atmosphere: fog particles, starfield, sky dome, ambient lights.
 * Adds cinematic depth and mood to the scene.
 */

import * as THREE from 'three';

const FOG_PARTICLE_COUNT = 400;  // Reduced from 800
const STAR_COUNT = 2000;         // Reduced from 3000
const DOME_RADIUS = 90;

// Procedural fog particle texture (soft radial gradient)
function createFogTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(180, 180, 220, 0.6)');
  gradient.addColorStop(0.4, 'rgba(140, 140, 200, 0.3)');
  gradient.addColorStop(1, 'rgba(100, 100, 180, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// Procedural star texture (bright center, soft glow)
function createStarTexture() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 255, 240, 1)');
  gradient.addColorStop(0.15, 'rgba(255, 255, 240, 0.6)');
  gradient.addColorStop(0.5, 'rgba(200, 200, 255, 0.15)');
  gradient.addColorStop(1, 'rgba(150, 150, 220, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// Sky dome gradient shader
const SkyDomeShader = {
  uniforms: {
    topColor: { value: new THREE.Color(0x0a0a1e) },
    midColor: { value: new THREE.Color(0x1a1a3e) },
    bottomColor: { value: new THREE.Color(0x12122a) },
    offset: { value: 20 },
    exponent: { value: 0.4 },
  },
  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 midColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    varying vec3 vWorldPosition;
    void main() {
      float h = normalize(vWorldPosition + offset).y;
      float t = max(pow(max(h, 0.0), exponent), 0.0);
      vec3 col = mix(bottomColor, midColor, smoothstep(0.0, 0.4, t));
      col = mix(col, topColor, smoothstep(0.4, 1.0, t));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Atmosphere {
  constructor(scene) {
    this._scene = scene;
    this._fogParticles = null;
    this._starfield = null;
    this._skyDome = null;
    this._ambientLights = [];
    this._twinkleTime = 0;

    this._buildSkyDome();
    this._buildStarfield();
    this._buildFogParticles();
    this._buildAmbientLights();
    this._buildArchitecture();
    this._buildGodRays();
  }

  _buildSkyDome() {
    const geo = new THREE.SphereGeometry(DOME_RADIUS, 16, 12);
    const mat = new THREE.ShaderMaterial({
      ...SkyDomeShader,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this._skyDome = new THREE.Mesh(geo, mat);
    this._skyDome.renderOrder = -1000;
    this._scene.add(this._skyDome);
  }

  _buildStarfield() {
    const positions = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);
    const twinkleSpeeds = new Float32Array(STAR_COUNT);

    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = DOME_RADIUS * 0.92;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 5;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      sizes[i] = 0.3 + Math.random() * 1.2;
      twinkleSpeeds[i] = 0.5 + Math.random() * 2.0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('twinkle', new THREE.BufferAttribute(twinkleSpeeds, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTexture: { value: createStarTexture() },
        uColor: { value: new THREE.Color(0xddeeff) },
      },
      vertexShader: `
        attribute float size;
        attribute float twinkle;
        uniform float uTime;
        varying float vAlpha;
        void main() {
          vAlpha = 0.4 + 0.6 * (0.5 + 0.5 * sin(uTime * twinkle + position.x * 0.1));
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (200.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform sampler2D uTexture;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(uTexture, gl_PointCoord);
          gl_FragColor = vec4(uColor, tex.a * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._starfield = new THREE.Points(geo, mat);
    this._starfield.renderOrder = -999;
    this._scene.add(this._starfield);
  }

  _buildFogParticles() {
    const texture = createFogTexture();
    const positions = new Float32Array(FOG_PARTICLE_COUNT * 3);
    const sizes = new Float32Array(FOG_PARTICLE_COUNT);
    const alphas = new Float32Array(FOG_PARTICLE_COUNT);
    const speeds = new Float32Array(FOG_PARTICLE_COUNT);

    for (let i = 0; i < FOG_PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = Math.random() * 4 + 0.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20 - 2;
      sizes[i] = 0.5 + Math.random() * 1.5;  // Smaller particles
      alphas[i] = 0.02 + Math.random() * 0.06;  // Much more transparent
      speeds[i] = 0.1 + Math.random() * 0.3;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    geo.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTexture: { value: texture },
        uColor: { value: new THREE.Color(0x4455aa) },  // Cooler, darker fog
      },
      vertexShader: `
        attribute float size;
        attribute float alpha;
        attribute float speed;
        uniform float uTime;
        varying float vAlpha;
        void main() {
          vec3 pos = position;
          pos.x += sin(uTime * speed + position.z * 0.5) * 0.5;
          pos.y += sin(uTime * speed * 0.5 + position.x * 0.3) * 0.2;
          vAlpha = alpha;
          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = size * (80.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform sampler2D uTexture;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(uTexture, gl_PointCoord);
          gl_FragColor = vec4(uColor, tex.a * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this._fogParticles = new THREE.Points(geo, mat);
    this._scene.add(this._fogParticles);
  }

  _buildAmbientLights() {
    // Hemisphere light for natural sky/ground bounce
    const hemi = new THREE.HemisphereLight(0x3a3a6e, 0x1a1a2e, 0.35);
    this._scene.add(hemi);
    this._ambientLights.push(hemi);

    // Subtle purple accent from behind
    const purple = new THREE.PointLight(0x6a3a9a, 0.6, 25);
    purple.position.set(0, 4, -8);
    this._scene.add(purple);
    this._ambientLights.push(purple);

    // Warm amber from above
    const amber = new THREE.PointLight(0xffaa44, 0.3, 20);
    amber.position.set(0, 6, 0);
    this._scene.add(amber);
    this._ambientLights.push(amber);
  }

  _buildArchitecture() {
    // Background arch silhouettes — Art Nouveau style
    const archMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e, roughness: 0.95, metalness: 0.05,
    });

    // Large central arch
    const archShape = new THREE.Shape();
    archShape.moveTo(-2, 0);
    archShape.lineTo(-2, 6);
    archShape.quadraticCurveTo(-2, 9, 0, 10);
    archShape.quadraticCurveTo(2, 9, 2, 6);
    archShape.lineTo(2, 0);
    archShape.lineTo(-2, 0);

    // Cutout (inner arch — creates a window effect)
    const holePath = new THREE.Path();
    holePath.moveTo(-1.4, 0);
    holePath.lineTo(-1.4, 5.5);
    holePath.quadraticCurveTo(-1.4, 8, 0, 8.8);
    holePath.quadraticCurveTo(1.4, 8, 1.4, 5.5);
    holePath.lineTo(1.4, 0);
    holePath.lineTo(-1.4, 0);
    archShape.holes.push(holePath);

    const archGeo = new THREE.ExtrudeGeometry(archShape, { depth: 0.5, bevelEnabled: false });
    const arch = new THREE.Mesh(archGeo, archMat);
    arch.position.set(0, 0, -12);
    arch.receiveShadow = true;
    this._scene.add(arch);

    // Side columns
    for (const side of [-1, 1]) {
      const colGeo = new THREE.BoxGeometry(0.8, 10, 0.8);
      const col = new THREE.Mesh(colGeo, archMat);
      col.position.set(side * 8, 5, -11);
      col.receiveShadow = true;
      this._scene.add(col);

      // Column capital
      const capGeo = new THREE.BoxGeometry(1.2, 0.5, 1.2);
      const cap = new THREE.Mesh(capGeo, archMat);
      cap.position.set(side * 8, 10.2, -11);
      this._scene.add(cap);
    }

    // Distant archway silhouettes (parallax layer)
    for (let i = -2; i <= 2; i++) {
      const distArchGeo = new THREE.PlaneGeometry(3, 7);
      const distArchCanvas = document.createElement('canvas');
      distArchCanvas.width = 128; distArchCanvas.height = 256;
      const dctx = distArchCanvas.getContext('2d');
      dctx.fillStyle = '#1a1a2e';
      dctx.fillRect(0, 0, 128, 256);
      // Arch shape
      dctx.fillStyle = '#0a0a18';
      dctx.beginPath();
      dctx.moveTo(10, 256);
      dctx.lineTo(10, 80);
      dctx.quadraticCurveTo(10, 20, 64, 10);
      dctx.quadraticCurveTo(118, 20, 118, 80);
      dctx.lineTo(118, 256);
      dctx.closePath();
      dctx.fill();
      const distArchTex = new THREE.CanvasTexture(distArchCanvas);
      const distArchMat = new THREE.MeshBasicMaterial({
        map: distArchTex, transparent: true, opacity: 0.5,
        depthWrite: false,
      });
      const distArch = new THREE.Mesh(distArchGeo, distArchMat);
      distArch.position.set(i * 6, 3.5, -18);
      this._scene.add(distArch);
    }
  }

  _buildGodRays() {
    // Volumetric light cones — additive blended geometry
    const rayCanvas = document.createElement('canvas');
    rayCanvas.width = 64; rayCanvas.height = 256;
    const rctx = rayCanvas.getContext('2d');
    const rayGrad = rctx.createLinearGradient(32, 0, 32, 256);
    rayGrad.addColorStop(0, 'rgba(255, 220, 150, 0.15)');
    rayGrad.addColorStop(0.3, 'rgba(255, 200, 120, 0.08)');
    rayGrad.addColorStop(0.7, 'rgba(255, 180, 100, 0.03)');
    rayGrad.addColorStop(1, 'rgba(255, 160, 80, 0)');
    rctx.fillStyle = rayGrad;
    rctx.fillRect(0, 0, 64, 256);

    // Add noise for volumetric feel
    for (let i = 0; i < 500; i++) {
      const x = Math.random() * 64;
      const y = Math.random() * 256;
      const alpha = Math.random() * 0.05 * (1 - y / 256);
      rctx.fillStyle = `rgba(255, 220, 150, ${alpha})`;
      rctx.fillRect(x, y, 1, 2);
    }

    const rayTex = new THREE.CanvasTexture(rayCanvas);

    // Multiple light rays from above
    this._godRays = [];
    for (let i = 0; i < 5; i++) {
      const rayGeo = new THREE.PlaneGeometry(2 + Math.random() * 2, 12 + Math.random() * 4);
      const rayMat = new THREE.MeshBasicMaterial({
        map: rayTex, transparent: true, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending,
        opacity: 0.08 + Math.random() * 0.06,  // Much subtler god rays
      });
      const ray = new THREE.Mesh(rayGeo, rayMat);
      ray.position.set(
        (Math.random() - 0.5) * 10,
        6 + Math.random() * 3,
        -5 + (Math.random() - 0.5) * 8
      );
      ray.rotation.z = (Math.random() - 0.5) * 0.3;
      ray.rotation.y = Math.random() * Math.PI;
      ray.userData = { speed: 0.05 + Math.random() * 0.1, baseX: ray.position.x };
      this._scene.add(ray);
      this._godRays.push(ray);
    }
  }

  /** Per-frame update: twinkle stars, drift fog, animate god rays. */
  update(dt) {
    this._twinkleTime += dt;
    if (this._starfield) {
      this._starfield.material.uniforms.uTime.value = this._twinkleTime;
    }
    if (this._fogParticles) {
      this._fogParticles.material.uniforms.uTime.value = this._twinkleTime;
    }
    // Animate god rays — slow drift and opacity pulse
    if (this._godRays) {
      for (const ray of this._godRays) {
        ray.position.x = ray.userData.baseX + Math.sin(this._twinkleTime * ray.userData.speed) * 0.5;
        ray.material.opacity = 0.06 + Math.sin(this._twinkleTime * ray.userData.speed * 2) * 0.03;
      }
    }
  }

  /** Keep sky dome centered on camera target. */
  setCameraTarget(x, y, z) {
    if (this._skyDome) {
      this._skyDome.position.set(x, y, z);
    }
    if (this._starfield) {
      this._starfield.position.set(x, y, z);
    }
  }

  /** Adjust fog color for mood changes. */
  setFogColor(color) {
    if (this._fogParticles) {
      this._fogParticles.material.uniforms.uColor.value.set(color);
    }
  }

  /** Adjust star color. */
  setStarColor(color) {
    if (this._starfield) {
      this._starfield.material.uniforms.uColor.value.set(color);
    }
  }

  /** Dispose all geometry/materials. */
  dispose() {
    if (this._skyDome) {
      this._skyDome.geometry.dispose();
      this._skyDome.material.dispose();
    }
    if (this._starfield) {
      this._starfield.geometry.dispose();
      this._starfield.material.uniforms.uTexture.value.dispose();
      this._starfield.material.dispose();
    }
    if (this._fogParticles) {
      this._fogParticles.geometry.dispose();
      this._fogParticles.material.uniforms.uTexture.value.dispose();
      this._fogParticles.material.dispose();
    }
    for (const light of this._ambientLights) {
      this._scene.remove(light);
    }
    // God rays — dispose textures and meshes
    if (this._godRays) {
      for (const ray of this._godRays) {
        this._scene.remove(ray);
        ray.geometry.dispose();
        if (ray.material.map) ray.material.map.dispose();
        ray.material.dispose();
      }
      this._godRays.length = 0;
    }
  }
}
