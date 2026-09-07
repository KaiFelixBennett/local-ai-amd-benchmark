import * as THREE from 'three';

// Free-aim ranged attack system with weak point detection

export class TargetingSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.reticle = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.isTargeting = false;
    
    // Weak point positions (relative to enemy)
    this.weakPoints = [];
    
    // Ranged attack parameters
    this.maxRange = 30;
    this.weakPointBonusDamage = 1.5;
    this.weakPointAPGain = 1;
  }

  init(scene, camera) {
    if (!scene || !camera) return;
    this.scene = scene;
    this.camera = camera;
    
    // Create reticle mesh
    const geometry = new THREE.RingGeometry(0.3, 0.4, 32);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x00ff88,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });
    
    this.reticle = new THREE.Mesh(geometry, material);
    this.reticle.visible = false;
    scene.add(this.reticle);

    // Add inner dot
    const dotGeometry = new THREE.CircleGeometry(0.1, 16);
    const dotMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x00ff88,
      transparent: true,
      opacity: 0.9
    });
    this.reticleDot = new THREE.Mesh(dotGeometry, dotMaterial);
    this.reticle.add(this.reticleDot);
  }

  startTargeting(enemies) {
    this.isTargeting = true;
    this.enemies = enemies;
    this.reticle.visible = true;
    
    // Calculate weak points for each enemy
    this.weakPoints = [];
    enemies.forEach(enemy => {
      if (enemy.hasWeakPoints) {
        const weakPoint = this.calculateWeakPoint(enemy);
        this.weakPoints.push({
          enemy,
          position: weakPoint,
          isHit: false
        });
      }
    });
  }

  stopTargeting() {
    this.isTargeting = false;
    this.reticle.visible = false;
    this.enemies = null;
    this.weakPoints = [];
  }

  // Update reticle position based on mouse
  update(mouseX, mouseY) {
    if (!this.isTargeting) return null;

    // Convert mouse to normalized device coordinates
    this.mouse.x = (mouseX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(mouseY / window.innerHeight) * 2 + 1;

    // Raycast from camera
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Check for weak point hits first
    const weakPointHit = this.checkWeakPoints();
    
    if (weakPointHit) {
      this.reticle.position.copy(weakPointHit.position);
      this.reticle.scale.set(1.2, 1.2, 1.2);
      this.reticle.material.color.setHex(0xff3366); // Red for weak point
    } else {
      // Check for enemy body hits
      const enemyHit = this.checkEnemyHits();
      
      if (enemyHit) {
        this.reticle.position.copy(enemyHit.point);
        this.reticle.scale.set(1.0, 1.0, 1.0);
        this.reticle.material.color.setHex(0x00ff88); // Green for normal hit
      } else {
        // Reticle follows mouse but clamped to scene bounds
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
        const target = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(plane, target);
        
        if (target) {
          this.reticle.position.copy(target);
          this.reticle.scale.set(0.8, 0.8, 0.8);
          this.reticle.material.color.setHex(0x888888); // Gray for no hit
        }
      }
    }

    // Make reticle face camera
    this.reticle.lookAt(this.camera.position);

    return {
      isWeakPoint: !!weakPointHit,
      target: weakPointHit?.enemy || enemyHit?.object?.userData?.entity,
      point: this.reticle.position.clone()
    };
  }

  checkWeakPoints() {
    for (const wp of this.weakPoints) {
      if (wp.isHit || !wp.enemy.mesh || wp.enemy.hp <= 0) continue;

      const distance = this.raycaster.ray.distanceToPoint(wp.position);
      
      if (distance < 0.5) {
        return { position: wp.position.clone(), enemy: wp.enemy };
      }
    }
    return null;
  }

  checkEnemyHits() {
    const meshes = [];
    
    this.enemies?.forEach(enemy => {
      if (enemy.mesh && enemy.hp > 0) {
        meshes.push(enemy.mesh);
      }
    });

    if (meshes.length === 0) return null;

    const intersects = this.raycaster.intersectObjects(meshes, true);
    
    if (intersects.length > 0) {
      // Find parent with entity data
      for (const hit of intersects) {
        let obj = hit.object;
        while (obj) {
          if (obj.userData.entity) {
            return { point: hit.point, object: obj };
          }
          obj = obj.parent;
        }
      }
    }
    
    return null;
  }

  calculateWeakPoint(enemy) {
    // Default weak point is head/upper area
    const offset = new THREE.Vector3(0, 1.5, 0);
    
    if (enemy.mesh) {
      const box = new THREE.Box3().setFromObject(enemy.mesh);
      const center = box.getCenter(new THREE.Vector3());
      return center.add(offset);
    }

    return enemy.position.clone().add(offset);
  }

  // Execute ranged attack at aimed position
  executeAttack(attacker, targetInfo) {
    if (!targetInfo || !targetInfo.target) {
      return { hit: false, reason: 'miss' };
    }

    const isWeakPoint = targetInfo.isWeakPoint;
    const damageMultiplier = isWeakPoint ? this.weakPointBonusDamage : 1.0;
    const apGain = isWeakPoint ? this.weakPointAPGain : 0;

    return {
      hit: true,
      target: targetInfo.target,
      isWeakPoint,
      damageMultiplier,
      apGain
    };
  }

  getReticle() {
    return this.reticle;
  }
}

export const targetingSystem = new TargetingSystem(null, null);
