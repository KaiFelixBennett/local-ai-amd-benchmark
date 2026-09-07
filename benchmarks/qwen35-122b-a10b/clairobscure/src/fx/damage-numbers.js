import * as THREE from 'three';

// Floating damage/heal numbers system

export class DamageNumbers {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.numbers = [];
    
    // Font setup for canvas rendering
    this.fontHeight = 24;
    this.fontFamily = 'Georgia, serif';
  }

  // Create a floating damage number
  create(x, y, z, value, options = {}) {
    const {
      type = 'damage', // damage, heal, crit, miss
      isCrit = false,
      isWeakness = false,
      color = null,
      scale = 1.0
    } = options;

    const number = {
      position: new THREE.Vector3(x, y + 2, z),
      value,
      type,
      isCrit,
      isWeakness,
      scale,
      vy: 2.0, // Vertical velocity
      alpha: 1.0,
      lifetime: 1.5,
      maxLifetime: 1.5,
      text: this.formatValue(value, type, isCrit)
    };

    // Color based on type
    if (color) {
      number.color = color;
    } else if (type === 'heal') {
      number.color = new THREE.Color(0x8bc34a);
    } else if (isCrit) {
      number.color = new THREE.Color(0xff5722);
    } else if (isWeakness) {
      number.color = new THREE.Color(0xe91e63);
    } else if (type === 'miss') {
      number.color = new THREE.Color(0x999);
    } else {
      number.color = new THREE.Color(0xf44336);
    }

    this.numbers.push(number);
  }

  formatValue(value, type, isCrit) {
    if (type === 'miss') return 'MISS';
    if (isCrit) return `${Math.round(value)}!`;
    if (type === 'heal') return `+${Math.round(value)}`;
    return Math.round(value).toString();
  }

  // Project 3D position to 2D screen space
  projectToScreen(position) {
    const vector = position.clone();
    vector.project(this.camera);

    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;

    // Check if behind camera
    if (vector.z > 1) {
      return null;
    }

    return { x, y };
  }

  update(deltaTime) {
    this.numbers = this.numbers.filter(number => {
      // Update position
      number.position.y += number.vy * deltaTime;
      number.vy -= deltaTime * 3; // Gravity
      
      // Update lifetime and alpha
      number.lifetime -= deltaTime;
      number.alpha = Math.max(0, number.lifetime / number.maxLifetime);

      return number.lifetime > 0 && number.position.y < 10; // Remove when fallen off screen
    });
  }

  render() {
    const canvas = document.getElementById('overlay');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!this.numbers || !Array.isArray(this.numbers)) return;
    
    for (let i = 0; i < this.numbers.length; i++) {
      const number = this.numbers[i];
      const screenPos = this.projectToScreen(number.position);
      
      if (!screenPos) return;

      ctx.save();
      ctx.globalAlpha = number.alpha;
      ctx.translate(screenPos.x, screenPos.y);
      ctx.scale(number.scale, number.scale);

      // Text shadow for readability
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      // Font setup
      const fontSize = this.fontHeight * number.scale;
      ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Draw text
      if (number.isCrit) {
        // Extra glow for crits
        ctx.shadowColor = number.color;
        ctx.shadowBlur = 15;
      }

      ctx.fillStyle = `rgb(${number.color.r * 255}, ${number.color.g * 255}, ${number.color.b * 255})`;
      ctx.fillText(number.text, 0, 0);

      // Reset shadow
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      ctx.restore();
    });
  }

  clear() {
    this.numbers = [];
  }

  // Convenience methods
  damage(x, y, z, amount, isCrit = false, isWeakness = false) {
    this.create(x, y, z, amount, { 
      type: 'damage', 
      isCrit, 
      isWeakness 
    });
  }

  heal(x, y, z, amount) {
    this.create(x, y, z, amount, { type: 'heal' });
  }

  miss(x, y, z) {
    this.create(x, y, z, 0, { type: 'miss' });
  }

  crit(x, y, z, amount) {
    this.create(x, y, z, amount, { type: 'damage', isCrit: true });
  }

  weakness(x, y, z, amount) {
    this.create(x, y, z, amount, { type: 'damage', isWeakness: true });
  }
}

export const damageNumbers = new DamageNumbers(null, null);
