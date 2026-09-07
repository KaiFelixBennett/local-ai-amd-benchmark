/**
 * Paint particles, impact bursts, death dissolve effect.
 * All rendered as 3D sprites in the scene.
 */

import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this._particles = [];
  }

  /** Spawn an impact burst at a world position. */
  spawnImpact(position, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.PlaneGeometry(0.08, 0.08);
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      this.scene.add(mesh);
      this._particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          Math.random() * 3 + 1,
          (Math.random() - 0.5) * 4
        ),
        life: 0.5 + Math.random() * 0.5,
        maxLife: 0.5 + Math.random() * 0.5,
        gravity: -8,
      });
    }
  }

  /** Spawn a parry flash — golden ring burst. */
  spawnParryFlash(position) {
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const geo = new THREE.PlaneGeometry(0.1, 0.1);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd700, transparent: true, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      this.scene.add(mesh);
      this._particles.push({
        mesh,
        velocity: new THREE.Vector3(
          Math.cos(angle) * 5,
          Math.sin(angle) * 5,
          (Math.random() - 0.5) * 2
        ),
        life: 0.4,
        maxLife: 0.4,
        gravity: 0,
      });
    }
  }

  /** Spawn floating paint motes (ambient). */
  spawnAmbientMotes(count = 30) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.PlaneGeometry(0.04, 0.04);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.1 + Math.random() * 0.1, 0.5, 0.6),
        transparent: true, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 20,
        Math.random() * 6,
        (Math.random() - 0.5) * 15
      );
      this.scene.add(mesh);
      this._particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.3,
          Math.random() * 0.2 + 0.1,
          (Math.random() - 0.5) * 0.3
        ),
        life: 5 + Math.random() * 10,
        maxLife: 5 + Math.random() * 10,
        gravity: 0,
        ambient: true,
      });
    }
  }

  /** Death dissolve — paint particles rising from a position. */
  spawnDeathDissolve(position, color, count = 40) {
    for (let i = 0; i < count; i++) {
      const size = 0.05 + Math.random() * 0.15;
      const geo = new THREE.PlaneGeometry(size, size);
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, side: THREE.DoubleSide,
        blending: THREE.NormalBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      mesh.position.x += (Math.random() - 0.5) * 0.5;
      mesh.position.y += Math.random() * 1.5;
      mesh.position.z += (Math.random() - 0.5) * 0.5;
      this.scene.add(mesh);
      this._particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 1,
          Math.random() * 2 + 0.5,
          (Math.random() - 0.5) * 1
        ),
        life: 1.5 + Math.random() * 1.5,
        maxLife: 1.5 + Math.random() * 1.5,
        gravity: -1,
        rotate: true,
        rotSpeed: (Math.random() - 0.5) * 5,
      });
    }
  }

  /** Heal particles — soft green/gold rising motes. */
  spawnHealParticles(position) {
    for (let i = 0; i < 15; i++) {
      const geo = new THREE.PlaneGeometry(0.06, 0.06);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x88ff88, transparent: true, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      mesh.position.x += (Math.random() - 0.5) * 0.3;
      this.scene.add(mesh);
      this._particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          Math.random() * 2 + 1,
          (Math.random() - 0.5) * 0.5
        ),
        life: 0.8 + Math.random() * 0.5,
        maxLife: 0.8 + Math.random() * 0.5,
        gravity: 0.5,
      });
    }
  }

  update(deltaTime) {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.life -= deltaTime;

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this._particles.splice(i, 1);
        continue;
      }

      // Update position
      p.velocity.y += p.gravity * deltaTime;
      p.mesh.position.add(p.velocity.clone().multiplyScalar(deltaTime));

      // Fade out
      const lifeRatio = p.life / p.maxLife;
      p.mesh.material.opacity = lifeRatio;

      // Billboard - face camera
      if (!p.ambient) {
        p.mesh.lookAt(this.camera.position);
      }

      // Rotation for death particles
      if (p.rotate) {
        p.mesh.rotation.z += p.rotSpeed * deltaTime;
      }
    }
  }

  clear() {
    for (const p of this._particles) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    this._particles = [];
  }
}
