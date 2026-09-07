/**
 * Free-aim reticle + weak-point hit detection for ranged attacks.
 */

import * as THREE from 'three';

export class TargetingSystem {
  constructor(scene, camera, renderer, container) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.container = container;

    this._active = false;
    this._reticle = null;
    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._targetMeshes = [];
    this._weakPointMeshes = [];
    this._hitWeakPoint = false;
    this._targetedEnemy = null;
    this._highlightRings = [];

    this._buildReticle();
    this._onMouseMove = this._onMouseMove.bind(this);
  }

  _buildReticle() {
    const group = new THREE.Group();

    // Outer ring
    const ringGeo = new THREE.RingGeometry(0.15, 0.18, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff4444, transparent: true, side: THREE.DoubleSide,
      depthTest: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    // Crosshair lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0xff4444, transparent: true });
    for (const angle of [0, Math.PI / 2]) {
      const points = [
        new THREE.Vector3(Math.cos(angle) * 0.25, Math.sin(angle) * 0.25, 0),
        new THREE.Vector3(Math.cos(angle) * 0.1, Math.sin(angle) * 0.1, 0),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      group.add(new THREE.Line(lineGeo, lineMat));

      const points2 = [
        new THREE.Vector3(-Math.cos(angle) * 0.25, -Math.sin(angle) * 0.25, 0),
        new THREE.Vector3(-Math.cos(angle) * 0.1, -Math.sin(angle) * 0.1, 0),
      ];
      const lineGeo2 = new THREE.BufferGeometry().setFromPoints(points2);
      group.add(new THREE.Line(lineGeo2, lineMat));
    }

    // Center dot
    const dotGeo = new THREE.CircleGeometry(0.02, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(dotGeo, dotMat));

    group.visible = false;
    this.scene.add(group);
    this._reticle = group;
  }

  start(enemies) {
    this._active = true;
    this._reticle.visible = true;
    this._hitWeakPoint = false;
    this._targetedEnemy = null;

    // Collect target meshes and weak points
    this._targetMeshes = [];
    this._weakPointMeshes = [];
    this._highlightRings = [];

    for (const enemy of enemies) {
      if (enemy.isDead) continue;
      // Add all child meshes as targets
      enemy.mesh.traverse(child => {
        if (child.isMesh) {
          this._targetMeshes.push(child);
          child.userData._enemy = enemy;
        }
      });

      // Add weak point (head/eyes area)
      const wpGeo = new THREE.SphereGeometry(0.2, 8, 8);
      const wpMat = new THREE.MeshBasicMaterial({
        color: 0xff0000, transparent: true, opacity: 0.3,
        side: THREE.DoubleSide, depthWrite: false,
      });
      const wp = new THREE.Mesh(wpGeo, wpMat);
      wp.position.copy(enemy.mesh.position);
      wp.position.y += (enemy.id === 'iron_golem' ? 2.9 : 2.35);
      wp.userData._enemy = enemy;
      wp.userData._isWeakPoint = true;
      this.scene.add(wp);
      this._weakPointMeshes.push(wp);
      enemy.mesh.add(wp);

      // Add highlight ring around enemy
      const ringGeo = new THREE.RingGeometry(1.0, 1.15, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffd700, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(enemy.mesh.position);
      ring.position.y = 0.05;
      this.scene.add(ring);
      this._highlightRings.push({ ring, enemy });
    }

    this.container.addEventListener('mousemove', this._onMouseMove);
  }

  stop() {
    this._active = false;
    this._reticle.visible = false;
    this.container.removeEventListener('mousemove', this._onMouseMove);

    // Remove weak point meshes
    for (const wp of this._weakPointMeshes) {
      if (wp.parent) wp.parent.remove(wp);
      wp.geometry.dispose();
      wp.material.dispose();
    }
    this._weakPointMeshes = [];
    this._targetMeshes = [];

    // Remove highlight rings
    for (const { ring } of this._highlightRings) {
      if (ring.parent) ring.parent.remove(ring);
      ring.geometry.dispose();
      ring.material.dispose();
    }
    this._highlightRings = [];
  }

  _onMouseMove(e) {
    if (!this._active) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._mouse, this.camera);

    // Check weak points first
    const wpHits = this._raycaster.intersectObjects(this._weakPointMeshes);
    if (wpHits.length > 0) {
      this._hitWeakPoint = true;
      this._targetedEnemy = wpHits[0].object.userData._enemy;
      this._reticle.position.copy(wpHits[0].point);
      this._reticle.children[0].material.color.setHex(0xffaa00); // gold for weak point
      this._reticle.scale.setScalar(1.3);
    } else {
      // Check regular meshes
      const hits = this._raycaster.intersectObjects(this._targetMeshes);
      if (hits.length > 0) {
        this._hitWeakPoint = false;
        this._targetedEnemy = hits[0].object.userData._enemy;
        this._reticle.position.copy(hits[0].point);
        this._reticle.children[0].material.color.setHex(0xff4444);
        this._reticle.scale.setScalar(1);
      } else {
        this._targetedEnemy = null;
        // Place reticle at a reasonable distance along ray
        const point = this._raycaster.ray.at(10, new THREE.Vector3());
        this._reticle.position.copy(point);
        this._reticle.children[0].material.color.setHex(0x888888);
        this._reticle.scale.setScalar(0.8);
      }
    }

    // Billboard reticle
    this._reticle.lookAt(this.camera.position);

    // Update highlight rings
    for (const { ring, enemy } of this._highlightRings) {
      const isTargeted = enemy === this._targetedEnemy;
      const targetOpacity = isTargeted ? (this._hitWeakPoint ? 0.7 : 0.5) : 0;
      ring.material.opacity += (targetOpacity - ring.material.opacity) * 0.15;
      ring.material.color.setHex(isTargeted ? (this._hitWeakPoint ? 0xffaa00 : 0xffd700) : 0xff4444);
    }
  }

  confirm() {
    if (!this._targetedEnemy) return null;
    return {
      target: this._targetedEnemy,
      hitWeakPoint: this._hitWeakPoint,
    };
  }

  update(deltaTime) {
    const t = performance.now() * 0.001;
    // Pulse reticle when on weak point
    if (this._active && this._hitWeakPoint) {
      const pulse = 1 + Math.sin(t * 8) * 0.15;
      this._reticle.scale.setScalar(1.3 * pulse);
    }

    // Animate highlight rings
    for (const { ring, enemy } of this._highlightRings) {
      if (ring.material.opacity > 0.01) {
        const pulse = 0.9 + Math.sin(t * 4) * 0.1;
        ring.scale.setScalar(pulse);
        ring.rotation.z = t * 0.5;
      }
    }
  }
}
