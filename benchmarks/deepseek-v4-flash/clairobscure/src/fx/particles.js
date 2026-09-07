// particles.js — paint particles, impact bursts, death dissolve.
// GPU-less: a pooled THREE.Points system with per-particle velocity.
import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene, max = 800) {
        this.scene = scene;
        this.max = max;
        this.pool = [];
        this.geo = new THREE.BufferGeometry();
        this.positions = new Float32Array(max * 3);
        this.colors = new Float32Array(max * 3);
        this.alphas = new Float32Array(max);
        this.lifes = new Float32Array(max);
        this.maxLifes = new Float32Array(max);
        this.vx = new Float32Array(max);
        this.vy = new Float32Array(max);
        this.vz = new Float32Array(max);
        this.sizes = new Float32Array(max);
        this.active = 0;

        this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
        this.spriteTex = this._makeDot();
        this.mat = new THREE.PointsMaterial({
            size: 0.18,
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            map: this.spriteTex,
            blending: THREE.AdditiveBlending,
        });
        this.points = new THREE.Points(this.geo, this.mat);
        this.points.frustumCulled = false;
        this.scene.add(this.points);
    }

    _makeDot() {
        const c = document.createElement('canvas');
        c.width = 32; c.height = 32;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.4, 'rgba(255,255,255,0.8)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 32, 32);
        const t = new THREE.CanvasTexture(c);
        return t;
    }

    // spawn a burst of paint at a world position
    burst(pos, opts = {}) {
        const count = opts.count || 20;
        const color = opts.color || new THREE.Color(0xffd0a0);
        const speed = opts.speed || 4;
        const spread = opts.spread || 0.9;
        for (let i = 0; i < count; i++) {
            if (this.active >= this.max) break;
            const idx = this.active;
            this.positions[idx * 3] = pos.x + (Math.random() - 0.5) * 0.4;
            this.positions[idx * 3 + 1] = pos.y + Math.random() * 0.5;
            this.positions[idx * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.4;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            this.vx[idx] = Math.sin(phi) * Math.cos(theta) * speed * spread;
            this.vy[idx] = Math.abs(Math.sin(phi) * Math.sin(theta)) * speed * 0.9 + 0.4;
            this.vz[idx] = Math.cos(phi) * speed * spread;
            const cc = color.clone().multiplyScalar(0.85 + Math.random() * 0.3);
            this.colors[idx * 3] = cc.r; this.colors[idx * 3 + 1] = cc.g; this.colors[idx * 3 + 2] = cc.b;
            this.lifes[idx] = 0.3 + Math.random() * 0.6;
            this.maxLifes[idx] = 1.2;
            this.sizes[idx] = 0.08 + Math.random() * 0.2;
            this.active++;
        }
    }

    // death dissolve: slow churn of colored particles rising
    deathDissolve(actor, opts = {}) {
        const color = opts.color || new THREE.Color(0x9db8ff);
        this.burst(actor.pos, { count: 34, color, speed: 1.2, spread: 1.6 });
        // second wave higher
        this.burst(actor.pos, { count: 20, color: color.clone().lerp(new THREE.Color(0xffd0a0), 0.4), speed: 0.6, spread: 0.8 });
    }

    // simple ring of sparks for weakspot hit
    ringSpark(pos) {
        this.burst(pos, { count: 12, color: new THREE.Color(0xffe08a), speed: 2.5, spread: 1 });
    }

    update(dt) {
        // age particles
        let write = 0;
        for (let i = 0; i < this.active; i++) {
            this.lifes[i] -= dt;
            if (this.lifes[i] <= 0) continue;
            this.vy[i] -= dt * 1.4;
            this.vx[i] *= (1 - dt * 0.4);
            this.vz[i] *= (1 - dt * 0.4);
            this.positions[write * 3] = this.positions[i * 3] + this.vx[i] * dt;
            this.positions[write * 3 + 1] = this.positions[i * 3 + 1] + this.vy[i] * dt;
            this.positions[write * 3 + 2] = this.positions[i * 3 + 2] + this.vz[i] * dt;
            this.colors[write * 3] = this.colors[i * 3];
            this.colors[write * 3 + 1] = this.colors[i * 3 + 1];
            this.colors[write * 3 + 2] = this.colors[i * 3 + 2];
            this.sizes[write] = this.sizes[i];
            write++;
        }
        this.active = write;
        // zero out dead slots (avoid stale positions)
        for (let i = write; i < this.max; i++) {
            this.positions[i * 3] = 0; this.positions[i * 3 + 1] = -50; this.positions[i * 3 + 2] = 0;
        }
        this.geo.attributes.position.needsUpdate = true;
        this.geo.attributes.color.needsUpdate = true;
        this.points.material.size = 0.18;
    }
}

// Convenience thin wrapper with a couple of named effects used elsewhere.
export function makeFx(scene) {
    const ps = new ParticleSystem(scene);
    return {
        spawnCombatant(mesh, pos, side) {
            mesh.position.set(pos.x, pos.y, pos.z);
            scene.add(mesh);
        },
        impact(target, kind) {
            if (!target.mesh) return;
            const p = target.mesh.position;
            ps.burst({ x: p.x, y: p.y + 1, z: p.z }, {
                count: kind === 'ult' ? 40 : 16,
                color: kind === 'ult' ? new THREE.Color(0xffc06a) : new THREE.Color(0xffb066),
                speed: kind === 'ult' ? 6 : 3,
            });
            // flinch: quick knockback on the mesh
            target.mesh._flinch = 0.25;
        },
        spawnDamageNumber(v, target, opts) { /* delegated to damage-numbers module in game */ },
        death(actor) {
            ps.deathDissolve(actor.mesh ? { pos: actor.mesh.position } : actor, {
                color: new THREE.Color(actor.side === 'party' ? 0x9db8ff : 0xd9b25c),
            });
            actor.mesh?.traverse?.(o => o.visible = false);
        },
        ringSpark(pos) { ps.ringSpark(pos); },
        update(dt) { ps.update(dt); },
        burst(pos, opts) { ps.burst(pos, opts); },
    };
}
