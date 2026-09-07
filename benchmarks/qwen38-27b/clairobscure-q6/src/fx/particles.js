/**
 * fx/particles.js — Additive GPU particle system (THREE.Points + a tiny
 * custom shader). One shared pool powers every effect in the game:
 *
 *   burst()     — impact bursts, parry sparks, status puffs
 *   dissolve()  — the death effect: a combatant breaks into drifting paint
 *   tracer()    — ranged shots / magic bolts as a streak of motes
 *   mote()      — the ambient floating paint motes of the stage
 *
 * Per-particle color/size/alpha via vertex attributes (additive blending, so
 * fading the color toward black fades the particle out — no alpha sorting).
 * Pool is fixed (no per-frame allocation). Delta-time integrated.
 */
import * as THREE from 'three';
import { makePaintMoteTexture } from '../engine/textures.js';

const MAX = 900;

const VERT = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uPixelRatio;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (240.0 / max(0.1, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  precision mediump float;
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor, 1.0) * tex * vAlpha;
  }
`;

export class ParticleSystem {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this._pos = new Float32Array(MAX * 3);
    this._vel = new Float32Array(MAX * 3);
    this._col = new Float32Array(MAX * 3);
    this._size = new Float32Array(MAX);
    this._alpha = new Float32Array(MAX);
    this._life = new Float32Array(MAX);
    this._maxLife = new Float32Array(MAX);
    this._grav = new Float32Array(MAX);
    this._drag = new Float32Array(MAX);
    this._grow = new Float32Array(MAX);
    this._active = 0;

    this._geo = new THREE.BufferGeometry();
    this._geo.setAttribute('position', new THREE.BufferAttribute(this._pos, 3).setUsage(THREE.DynamicDrawUsage));
    this._geo.setAttribute('aColor', new THREE.BufferAttribute(this._col, 3).setUsage(THREE.DynamicDrawUsage));
    this._geo.setAttribute('aSize', new THREE.BufferAttribute(this._size, 1).setUsage(THREE.DynamicDrawUsage));
    this._geo.setAttribute('aAlpha', new THREE.BufferAttribute(this._alpha, 1).setUsage(THREE.DynamicDrawUsage));

    this._moteTex = makePaintMoteTexture();

    this._mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: this._moteTex },
        uPixelRatio: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });

    this._points = new THREE.Points(this._geo, this._mat);
    this._points.frustumCulled = false;
    this._points.renderOrder = 500;
    scene.add(this._points);
    this._cursor = 0;
    this._scratch = new THREE.Color();
  }

  setPixelRatio(pr) {
    this._mat.uniforms.uPixelRatio.value = pr;
  }

  /** Grab a free slot (ring allocation overwrites the oldest). */
  _slot() {
    const i = this._cursor;
    this._cursor = (this._cursor + 1) % MAX;
    return i;
  }

  _spawn(i, p, v, color, size, life, { grav = 0, drag = 0, grow = 0, map = null } = {}) {
    this._pos[i * 3] = p.x;
    this._pos[i * 3 + 1] = p.y;
    this._pos[i * 3 + 2] = p.z;
    this._vel[i * 3] = v.x;
    this._vel[i * 3 + 1] = v.y;
    this._vel[i * 3 + 2] = v.z;
    this._scratch.set(color);
    this._col[i * 3] = this._scratch.r;
    this._col[i * 3 + 1] = this._scratch.g;
    this._col[i * 3 + 2] = this._scratch.b;
    this._size[i] = size;
    this._alpha[i] = 1;
    this._life[i] = life;
    this._maxLife[i] = life;
    this._grav[i] = grav;
    this._drag[i] = drag;
    this._grow[i] = grow;
  }

  /**
   * Radial burst.
   * @param {THREE.Vector3|number[]} pos
   * @param {object} o { color, count, speed, size, life, grav, drag, spread }
   */
  burst(pos, o = {}) {
    const p = pos.x !== undefined ? pos : new THREE.Vector3(...pos);
    const {
      color = 0xffd76a, count = 24, speed = 2.4, size = 10, life = 0.6,
      grav = -3, drag = 2, spread = 1,
    } = o;
    for (let n = 0; n < count; n++) {
      const i = this._slot();
      // random direction on a sphere, biased outward
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.4 + Math.random() * 0.9) * spread;
      const v = new THREE.Vector3(
        Math.sin(ph) * Math.cos(th),
        Math.cos(ph) * (o.upBias ?? 0.4),
        Math.sin(ph) * Math.sin(th)
      ).multiplyScalar(s);
      this._spawn(i, p, v, color, size * (0.6 + Math.random() * 0.8), life * (0.7 + Math.random() * 0.6), { grav, drag });
    }
  }

  /** Death dissolve: many slow paint motes drift up and out, fading. */
  dissolve(pos, o = {}) {
    const p = pos.x !== undefined ? pos : new THREE.Vector3(...pos);
    const { color = 0xc9a24b, count = 90 } = o;
    // Two tones: the combatant's accent + a warm gold
    for (let n = 0; n < count; n++) {
      const i = this._slot();
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.7;
      const start = new THREE.Vector3(
        p.x + Math.cos(ang) * r,
        p.y + Math.random() * 1.4,
        p.z + Math.sin(ang) * r
      );
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 1.6,
        0.8 + Math.random() * 1.8,
        (Math.random() - 0.5) * 1.6
      );
      const c = n % 3 === 0 ? 0xe8c979 : color;
      this._spawn(i, start, v, c, 12 + Math.random() * 16, 1.4 + Math.random() * 1.4, { grav: -1.2, drag: 1.4, grow: 6 });
    }
    // A bright core flash
    this.burst(p, { color: 0xfff2c4, count: 26, speed: 3.4, size: 14, life: 0.5, grav: -1, upBias: 0.2 });
  }

  /** Ranged/magic streak from a to b. */
  tracer(from, to, o = {}) {
    const a = from.x !== undefined ? from : new THREE.Vector3(...from);
    const b = to.x !== undefined ? to : new THREE.Vector3(...to);
    const { color = 0x7fd8cf, count = 16, size = 7, life = 0.4 } = o;
    for (let n = 0; n < count; n++) {
      const i = this._slot();
      const t = n / (count - 1);
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      p.x += (Math.random() - 0.5) * 0.08;
      p.y += (Math.random() - 0.5) * 0.08;
      p.z += (Math.random() - 0.5) * 0.08;
      const dir = new THREE.Vector3().subVectors(b, a).normalize().multiplyScalar(1.5);
      this._spawn(i, p, dir, color, size * (0.6 + Math.random() * 0.7), life * (0.6 + Math.random() * 0.8), { grav: 0, drag: 1 });
    }
  }

  /** One ambient paint mote (called sparsely by game for the floating dust). */
  mote(pos, o = {}) {
    const p = pos.x !== undefined ? pos : new THREE.Vector3(...pos);
    const i = this._slot();
    const v = new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.1 + Math.random() * 0.2, (Math.random() - 0.5) * 0.15);
    const c = Math.random() > 0.6 ? 0xe8c979 : (Math.random() > 0.5 ? 0x7fd8cf : 0x9fb4c4);
    this._spawn(i, p, v, c, 5 + Math.random() * 6, 4 + Math.random() * 4, { grav: -0.05, drag: 0.4, grow: -0.4 });
  }

  update(dt) {
    const pos = this._pos, vel = this._vel;
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (this._life[i] <= 0) {
        this._alpha[i] = 0;
        continue;
      }
      any = true;
      this._life[i] -= dt;
      // integrate
      vel[i * 3 + 1] += this._grav[i] * dt;
      const d = 1 - this._drag[i] * dt;
      vel[i * 3] *= d; vel[i * 3 + 1] *= d; vel[i * 3 + 2] *= d;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      // size grow
      this._size[i] += this._grow[i] * dt;
      if (this._size[i] < 0.2) this._size[i] = 0.2;
      // fade over life (ease out)
      const lr = Math.max(0, this._life[i] / this._maxLife[i]);
      this._alpha[i] = lr * lr;
    }
    if (any) {
      this._geo.attributes.position.needsUpdate = true;
      this._geo.attributes.aColor.needsUpdate = true;
      this._geo.attributes.aSize.needsUpdate = true;
      this._geo.attributes.aAlpha.needsUpdate = true;
    }
    // Map is global; default back to mote each frame unless a burst set spark.
    // (bursts set it at call time; we leave it — spark bursts are short)
  }

  clear() {
    this._life.fill(0);
    this._alpha.fill(0);
  }

  dispose() {
    this.scene.remove(this._points);
    this._geo.dispose();
    this._mat.dispose();
  }
}
