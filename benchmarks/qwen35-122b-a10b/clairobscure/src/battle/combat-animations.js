import * as THREE from 'three';

// Visual combat animations and effects

export class CombatAnimations {
  constructor(scene) {
    this.scene = scene;
    this.activeAnimations = [];
  }

  // Character attack lunge animation
  animateAttack(attackerMesh, targetMesh, onComplete) {
    const startPos = attackerMesh.position.clone();
    const targetPos = targetMesh.position.clone();
    
    // Calculate lunge distance
    const direction = targetPos.clone().sub(startPos).normalize();
    const lungeDistance = 2.0;
    const endPos = startPos.clone().add(direction.multiplyScalar(lungeDistance));
    
    const animation = {
      type: 'attack',
      mesh: attackerMesh,
      startTime: performance.now(),
      duration: 300,
      startPos: startPos,
      endPos: endPos,
      targetPos: targetPos,
      onComplete: onComplete
    };
    
    this.activeAnimations.push(animation);
    return animation;
  }

  // Update all active animations
  update(deltaTime) {
    const now = performance.now();
    
    this.activeAnimations = this.activeAnimations.filter(anim => {
      const elapsed = now - anim.startTime;
      const progress = Math.min(1, elapsed / anim.duration);
      
      if (anim.type === 'attack') {
        // Lunge forward then retreat
        if (progress < 0.5) {
          // Forward phase
          const forwardProgress = progress * 2;
          const currentPos = anim.startPos.clone().lerp(anim.endPos, forwardProgress);
          anim.mesh.position.copy(currentPos);
          
          // Rotate towards target
          anim.mesh.lookAt(anim.targetPos);
        } else {
          // Retreat phase
          const retreatProgress = (progress - 0.5) * 2;
          const currentPos = anim.endPos.clone().lerp(anim.startPos, retreatProgress);
          anim.mesh.position.copy(currentPos);
          
          if (retreatProgress >= 1 && anim.onComplete) {
            anim.onComplete();
            return false;
          }
        }
      }
      
      return progress < 1;
    });
  }

  // Create hit spark effect
  createHitSpark(position, color = 0xffff00) {
    if (!this.scene) return [];
    
    const particleCount = 15;
    const particles = [];
    
    for (let i = 0; i < particleCount; i++) {
      const geometry = new THREE.BoxGeometry(0.15, 0.15, 0.15);
      const material = new THREE.MeshBasicMaterial({ 
        color: color,
        transparent: true,
        opacity: 1.0
      });
      
      const particle = new THREE.Mesh(geometry, material);
      particle.position.copy(position);
      
      // Random velocity
      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8 + 4,
        (Math.random() - 0.5) * 8
      );
      
      particle.userData.life = 1.0;
      particle.userData.decay = 0.02 + Math.random() * 0.02;
      
      this.scene.add(particle);
      particles.push(particle);
    }
    
    return particles;
  }

  // Update hit sparks
  updateSparks(deltaTime, sparks) {
    sparks = sparks.filter(particle => {
      particle.userData.life -= deltaTime;
      particle.userData.velocity.y -= 9.8 * deltaTime; // Gravity
      
      particle.position.add(particle.userData.velocity.clone().multiplyScalar(deltaTime));
      particle.rotation.x += 5 * deltaTime;
      particle.rotation.y += 5 * deltaTime;
      
      particle.material.opacity = particle.userData.life;
      
      if (particle.position.y < 0) {
        particle.position.y = 0;
        particle.userData.velocity.y *= -0.5; // Bounce
      }
      
      if (particle.userData.life <= 0) {
        this.scene.remove(particle);
        return false;
      }
      
      return true;
    });
    
    return sparks;
  }

  // Create damage number floating text
  createDamageNumber(position, damage, isCrit = false) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 128;
    
    ctx.font = `bold ${isCrit ? '72px' : '48px'} Arial`;
    ctx.fillStyle = isCrit ? '#ff0' : '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(damage.toString(), 128, 80);
    
    if (isCrit) {
      ctx.font = 'bold 36px Arial';
      ctx.fillText('CRIT!', 128, 110);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true,
      opacity: 1.0
    });
    
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.position.y += 2;
    sprite.scale.set(3, 1.5, 1);
    
    this.scene.add(sprite);
    
    return {
      sprite: sprite,
      life: 2.0,
      startY: position.y + 2
    };
  }

  // Update damage numbers
  updateDamageNumbers(deltaTime, damageNumbers) {
    damageNumbers = damageNumbers.filter(dn => {
      dn.life -= deltaTime;
      dn.sprite.position.y = dn.startY + (2.0 - dn.life) * 1.5;
      dn.sprite.material.opacity = dn.life / 2.0;
      
      if (dn.life <= 0) {
        this.scene.remove(dn.sprite);
        return false;
      }
      
      return true;
    });
    
    return damageNumbers;
  }

  // Create magic spell effect
  createSpellEffect(position, color = 0x8888ff) {
    const geometry = new THREE.SphereGeometry(1.5, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });
    
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(position);
    
    this.scene.add(sphere);
    
    return {
      mesh: sphere,
      startTime: performance.now(),
      duration: 800,
      maxScale: 2.5
    };
  }

  // Update spell effects
  updateSpellEffects(deltaTime, spellEffects) {
    spellEffects = spellEffects.filter(effect => {
      const elapsed = performance.now() - effect.startTime;
      const progress = Math.min(1, elapsed / effect.duration);
      
      effect.mesh.scale.setScalar(1 + (progress * (effect.maxScale - 1)));
      effect.mesh.material.opacity = 0.8 * (1 - progress);
      
      if (progress >= 1) {
        this.scene.remove(effect.mesh);
        return false;
      }
      
      return true;
    });
    
    return spellEffects;
  }

  // Screen shake effect
  shakeCamera(camera, intensity = 0.5, duration = 300) {
    const originalPosition = camera.position.clone();
    
    const shake = {
      camera: camera,
      startTime: performance.now(),
      duration: duration,
      intensity: intensity,
      originalPosition: originalPosition
    };
    
    this.activeAnimations.push({
      type: 'shake',
      ...shake
    });
  }

  // Update camera shake
  updateCameraShake(deltaTime) {
    this.activeAnimations = this.activeAnimations.filter(anim => {
      if (anim.type !== 'shake') return true;
      
      const elapsed = performance.now() - anim.startTime;
      const progress = Math.min(1, elapsed / anim.duration);
      
      if (progress < 1) {
        const remainingIntensity = anim.intensity * (1 - progress);
        anim.camera.position.x = anim.originalPosition.x + (Math.random() - 0.5) * remainingIntensity;
        anim.camera.position.y = anim.originalPosition.y + (Math.random() - 0.5) * remainingIntensity;
      } else {
        anim.camera.position.copy(anim.originalPosition);
        return false;
      }
      
      return true;
    });
  }

  clear() {
    this.activeAnimations = [];
  }
}

export const combatAnimations = new CombatAnimations(null);
