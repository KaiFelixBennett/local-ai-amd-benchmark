import * as THREE from 'three';

// Particle system for combat FX

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particleSystems = [];
    
    // Pre-generated particle textures (procedural)
    this.particleTextures = {};
    this.createParticleTextures();
  }

  createParticleTextures() {
    // Create procedural particle textures
    const sizes = [8, 16, 32];
    
    if (!sizes || !sizes.forEach) return;
    sizes.forEach(size => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // Radial gradient for soft particle
      const gradient = ctx.createRadialGradient(
        size / 2, size / 2, 0,
        size / 2, size / 2, size / 2
      );
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      const texture = new THREE.CanvasTexture(canvas);
      this.particleTextures[size] = texture;
    });
  }

  // Impact burst - sparks flying out
  createImpactBurst(position, color = 0xffffff, count = 20) {
    const particles = [];
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;

      // Random velocity in hemisphere facing up
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI / 2;
      const speed = 2 + Math.random() * 4;

      velocities.push({
        x: Math.sin(phi) * Math.cos(theta) * speed,
        y: Math.cos(phi) * speed,
        z: Math.sin(phi) * Math.sin(theta) * speed,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 0.5 + Math.random() * 0.5
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color,
      size: 0.15,
      map: this.particleTextures[16],
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particleSystem = new THREE.Points(geometry, material);
    particleSystem.userData.velocities = velocities;
    particleSystem.userData.count = count;

    this.scene.add(particleSystem);
    this.particleSystems.push(particleSystem);

    return particleSystem;
  }

  // Magic spell effect - swirling particles
  createMagicEffect(position, color = 0x8844ff, radius = 1.0) {
    const geometry = new THREE.BufferGeometry();
    const particleCount = 50;
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = Math.random() * radius;

      positions[i * 3] = position.x + r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = position.y + r * Math.cos(phi);
      positions[i * 3 + 2] = position.z + r * Math.sin(phi) * Math.sin(theta);

      sizes[i] = Math.random() * 0.2 + 0.1;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      color,
      size: 0.2,
      map: this.particleTextures[32],
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particleSystem = new THREE.Points(geometry, material);
    particleSystem.position.copy(position);
    particleSystem.userData.spinSpeed = 1.0 + Math.random();
    particleSystem.userData.lifetime = 2.0;
    particleSystem.userData.maxLifetime = 2.0;

    this.scene.add(particleSystem);
    this.particleSystems.push(particleSystem);

    return particleSystem;
  }

  // Death dissolve - particles drifting away
  createDeathDissolve(position, color = 0x888888) {
    const geometry = new THREE.BufferGeometry();
    const particleCount = 100;
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
      // Start at center
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y + 1;
      positions[i * 3 + 2] = position.z;

      // Drift outward slowly
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 0.5 + Math.random() * 1.0;

      velocities.push({
        x: Math.sin(phi) * Math.cos(theta) * speed,
        y: Math.cos(phi) * speed + 0.5, // Float upward
        z: Math.sin(phi) * Math.sin(theta) * speed,
        life: 1.5 + Math.random() * 1.0,
        maxLife: 1.5 + Math.random() * 1.0,
        size: 0.1 + Math.random() * 0.2
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color,
      size: 0.25,
      map: this.particleTextures[32],
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particleSystem = new THREE.Points(geometry, material);
    particleSystem.userData.velocities = velocities;
    particleSystem.userData.isDeathEffect = true;

    this.scene.add(particleSystem);
    this.particleSystems.push(particleSystem);

    return particleSystem;
  }

  // Paint particles (for Belle Époque aesthetic)
  createPaintMotes(position, colors = [0xff6b9d, 0xc44569, 0xf78fb3]) {
    const geometry = new THREE.BufferGeometry();
    const particleCount = 30;
    const positions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y + 1;
      positions[i * 3 + 2] = position.z;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI / 2;
      const speed = 1 + Math.random() * 2;

      velocities.push({
        x: Math.sin(phi) * Math.cos(theta) * speed,
        y: Math.cos(phi) * speed,
        z: Math.sin(phi) * Math.sin(theta) * speed,
        life: 2.0 + Math.random(),
        maxLife: 2.0 + Math.random()
      });

      // Color from palette
      const color = new THREE.Color(colors[i % colors.length]);
      particleColors[i * 3] = color.r;
      particleColors[i * 3 + 1] = color.g;
      particleColors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      map: this.particleTextures[16],
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particleSystem = new THREE.Points(geometry, material);
    particleSystem.userData.velocities = velocities;

    this.scene.add(particleSystem);
    this.particleSystems.push(particleSystem);

    return particleSystem;
  }

  // Lightning/energy bolt
  createEnergyBolt(startPos, endPos, color = 0x00ffff) {
    // Create a segmented line that flickers
    const segments = 8;
    const points = [];
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = new THREE.Vector3().lerpVectors(startPos, endPos, t);
      
      // Add jitter
      if (i > 0 && i < segments) {
        point.x += (Math.random() - 0.5) * 0.3;
        point.y += (Math.random() - 0.5) * 0.3;
        point.z += (Math.random() - 0.5) * 0.3;
      }
      
      points.push(point);
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      linewidth: 3,
      transparent: true,
      opacity: 0.9
    });

    const bolt = new THREE.Line(geometry, material);
    bolt.userData.lifetime = 0.3;
    bolt.userData.maxLifetime = 0.3;

    this.scene.add(bolt);
    this.particleSystems.push(bolt);

    // Add glow particles at endpoints
    this.createImpactBurst(startPos, color, 10);
    this.createImpactBurst(endPos, color, 15);

    return bolt;
  }

  // Update all particle systems
  update(deltaTime) {
    this.particleSystems = this.particleSystems.filter(system => {
      return this.updateSystem(system, deltaTime);
    });
  }

  updateSystem(system, deltaTime) {
    const positions = system.geometry.attributes.position.array;
    const velocities = system.userData.velocities;

    if (velocities) {
      // Update particle positions
      for (let i = 0; i < velocities.length; i++) {
        const v = velocities[i];
        
        positions[i * 3] += v.x * deltaTime;
        positions[i * 3 + 1] += v.y * deltaTime;
        positions[i * 3 + 2] += v.z * deltaTime;

        // Gravity for some particles
        if (!system.userData.isDeathEffect) {
          v.y -= deltaTime * 2; // Gravity
        }

        v.life -= deltaTime;
      }

      system.geometry.attributes.position.needsUpdate = true;

      // Check if all particles are dead
      const alive = velocities.some(v => v.life > 0);
      if (!alive) {
        this.cleanupSystem(system);
        return false;
      }
    } else if (system.userData.lifetime !== undefined) {
      // Time-based lifetime systems
      system.userData.lifetime -= deltaTime;
      
      // Spin animation for magic effects
      if (system.userData.spinSpeed) {
        system.rotation.y += system.userData.spinSpeed * deltaTime;
      }

      // Fade out
      if (system.material.opacity !== undefined) {
        system.material.opacity = system.userData.lifetime / system.userData.maxLifetime;
      }

      if (system.userData.lifetime <= 0) {
        this.cleanupSystem(system);
        return false;
      }
    } else if (system.isLine) {
      // Line-based systems (lightning)
      if (system.userData.lifetime !== undefined) {
        system.userData.lifetime -= deltaTime;
        
        if (system.material.opacity !== undefined) {
          system.material.opacity = system.userData.lifetime / system.userData.maxLifetime;
        }

        // Flicker effect
        if (Math.random() > 0.5 && system.geometry) {
          const points = system.geometry.attributes.position.array;
          for (let i = 1; i < points.length / 3 - 1; i++) {
            points[i * 3] += (Math.random() - 0.5) * 0.1;
            points[i * 3 + 2] += (Math.random() - 0.5) * 0.1;
          }
          system.geometry.attributes.position.needsUpdate = true;
        }

        if (system.userData.lifetime <= 0) {
          this.cleanupSystem(system);
          return false;
        }
      }
    }

    return true;
  }

  cleanupSystem(system) {
    if (!this.scene || !system) return;
    
    this.scene.remove(system);
    
    if (system.geometry) {
      system.geometry.dispose();
    }
    if (system.material) {
      if (Array.isArray(system.material)) {
        if (system.material && system.material.forEach) {
          system.material.forEach(m => m.dispose());
        }
      } else {
        system.material.dispose();
      }
    }
  }

  // Clear all particles
  clear() {
    if (this.particleSystems && Array.isArray(this.particleSystems)) {
      for (let i = 0; i < this.particleSystems.length; i++) {
        this.cleanupSystem(this.particleSystems[i]);
      }
    }
    this.particleSystems = [];
  }
}

export const particleSystem = new ParticleSystem(null);
