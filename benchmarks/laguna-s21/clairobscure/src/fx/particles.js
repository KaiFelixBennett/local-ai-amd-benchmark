/**
 * Paint particles, impact bursts, the death "dissolve" effect.
 */

import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.maxParticles = 500;
    }

    /** Spawn an impact burst at a 3D position */
    spawnImpact(position, color = 0xffaa44, count = 20) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = [];
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);

        const c = new THREE.Color(color);

        for (let i = 0; i < count; i++) {
            positions[i * 3] = position.x;
            positions[i * 3 + 1] = position.y;
            positions[i * 3 + 2] = position.z;

            velocities.push(new THREE.Vector3(
                (Math.random() - 0.5) * 4,
                Math.random() * 3 + 1,
                (Math.random() - 0.5) * 4
            ));

            colors[i * 3] = c.r + (Math.random() - 0.5) * 0.2;
            colors[i * 3 + 1] = c.g + (Math.random() - 0.5) * 0.2;
            colors[i * 3 + 2] = c.b + (Math.random() - 0.5) * 0.2;

            sizes[i] = Math.random() * 4 + 2;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        // Soft circle texture
        const cvs = document.createElement('canvas');
        cvs.width = 16;
        cvs.height = 16;
        const ctx = cvs.getContext('2d');
        const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 16, 16);

        const mat = new THREE.PointsMaterial({
            map: new THREE.CanvasTexture(cvs),
            size: 0.15,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexColors: true,
            sizeAttenuation: true
        });

        const points = new THREE.Points(geo, mat);
        this.scene.add(points);

        this.particles.push({
            mesh: points,
            velocities,
            life: 1.0,
            decay: 1.5,
            type: 'impact'
        });
    }

    /** Spawn a parry flash */
    spawnParryFlash(position, camera = null) {
        this.spawnImpact(position, 0xffd700, 30);

        // Ring effect
        const ringGeo = new THREE.RingGeometry(0.1, 0.3, 24);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffd700,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(position);
        ring.position.y += 0.5;
        if (camera) {
            ring.lookAt(camera.position);
        }
        this.scene.add(ring);

        this.particles.push({
            mesh: ring,
            life: 0.4,
            decay: 2.5,
            type: 'ring',
            scaleRate: 8
        });
    }

    /** Spawn a death dissolve effect */
    spawnDeathDissolve(position, color = 0x884444, count = 60) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = [];
        const colors = new Float32Array(count * 3);

        const c = new THREE.Color(color);

        for (let i = 0; i < count; i++) {
            positions[i * 3] = position.x + (Math.random() - 0.5) * 0.8;
            positions[i * 3 + 1] = position.y + Math.random() * 1.5;
            positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.8;

            velocities.push(new THREE.Vector3(
                (Math.random() - 0.5) * 1.5,
                Math.random() * 2 + 0.5,
                (Math.random() - 0.5) * 1.5
            ));

            colors[i * 3] = c.r + (Math.random() - 0.5) * 0.3;
            colors[i * 3 + 1] = c.g + (Math.random() - 0.5) * 0.3;
            colors[i * 3 + 2] = c.b + (Math.random() - 0.5) * 0.3;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 0.2,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            vertexColors: true,
            sizeAttenuation: true,
            blending: THREE.NormalBlending
        });

        const points = new THREE.Points(geo, mat);
        this.scene.add(points);

        this.particles.push({
            mesh: points,
            velocities,
            life: 2.0,
            decay: 0.6,
            type: 'dissolve'
        });
    }

    /** Spawn a skill effect */
    spawnSkillEffect(position, color = 0x8844ff, type = 'burst') {
        switch (type) {
            case 'burst':
                this.spawnImpact(position, color, 25);
                break;
            case 'heal': {
                // Rising light particles
                const count = 15;
                const geo = new THREE.BufferGeometry();
                const positions = new Float32Array(count * 3);
                const velocities = [];
                const colors = new Float32Array(count * 3);
                const c = new THREE.Color(color);

                for (let i = 0; i < count; i++) {
                    positions[i * 3] = position.x + (Math.random() - 0.5) * 0.5;
                    positions[i * 3 + 1] = position.y;
                    positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.5;
                    velocities.push(new THREE.Vector3(
                        (Math.random() - 0.5) * 0.5,
                        Math.random() * 3 + 2,
                        (Math.random() - 0.5) * 0.5
                    ));
                    colors[i * 3] = c.r;
                    colors[i * 3 + 1] = c.g;
                    colors[i * 3 + 2] = c.b;
                }

                geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

                const mat = new THREE.PointsMaterial({
                    size: 0.12,
                    transparent: true,
                    opacity: 0.9,
                    depthWrite: false,
                    vertexColors: true,
                    blending: THREE.AdditiveBlending,
                    sizeAttenuation: true
                });

                const points = new THREE.Points(geo, mat);
                this.scene.add(points);

                this.particles.push({
                    mesh: points,
                    velocities,
                    life: 1.2,
                    decay: 0.8,
                    type: 'heal'
                });
                break;
            }
        }
    }

    /** Update all particles per frame */
    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= p.decay * dt;

            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                this.particles.splice(i, 1);
                continue;
            }

            // Update opacity
            p.mesh.material.opacity = Math.max(0, p.life);

            if (p.type === 'impact' || p.type === 'dissolve' || p.type === 'heal') {
                const pos = p.mesh.geometry.attributes.position.array;
                for (let j = 0; j < p.velocities.length; j++) {
                    pos[j * 3] += p.velocities[j].x * dt;
                    pos[j * 3 + 1] += p.velocities[j].y * dt;
                    pos[j * 3 + 2] += p.velocities[j].z * dt;
                    // Gravity
                    p.velocities[j].y -= 3 * dt;
                }
                p.mesh.geometry.attributes.position.needsUpdate = true;
            }

            if (p.type === 'ring') {
                const scale = 1 + (1 - p.life) * p.scaleRate;
                p.mesh.scale.set(scale, scale, scale);
            }
        }
    }

    /** Clear all particles */
    clear() {
        for (const p of this.particles) {
            this.scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        }
        this.particles = [];
    }
}
