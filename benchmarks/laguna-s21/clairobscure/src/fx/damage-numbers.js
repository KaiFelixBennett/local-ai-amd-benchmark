/**
 * Floating damage/heal numbers rendered in 3D space.
 */

import * as THREE from 'three';

export class DamageNumbers3D {
    constructor(scene) {
        this.scene = scene;
        this.numbers = [];
    }

    /** Spawn a floating number at a 3D position */
    spawn(position, value, type = 'damage', isCrit = false) {
        let color;
        switch (type) {
            case 'damage':
                color = isCrit ? 0xff4422 : 0xff8866;
                break;
            case 'heal':
                color = 0x44ff88;
                break;
            case 'ap':
                color = 0xaa88ff;
                break;
            case 'stagger':
                color = 0xffaa22;
                break;
            case 'miss':
                color = 0x888888;
                break;
            default:
                color = 0xffffff;
        }

        // Create sprite
        const sprite = this.createTextSprite(value, color, isCrit, type);
        sprite.position.copy(position);
        sprite.position.y += 1.5;
        sprite.position.x += (Math.random() - 0.5) * 0.5;
        this.scene.add(sprite);

        this.numbers.push({
            sprite,
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.5,
                2 + Math.random(),
                (Math.random() - 0.5) * 0.5
            ),
            life: 1.5,
            maxLife: 1.5,
            type
        });
    }

    createTextSprite(text, color, isCrit, type) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        const hexColor = '#' + new THREE.Color(color).getHexString();
        const fontSize = isCrit ? 40 : 28;

        ctx.font = `bold ${fontSize}px Georgia`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillText(text, 66, 34);

        // Main text
        ctx.fillStyle = hexColor;
        ctx.fillText(text, 64, 32);

        // Crit label
        if (isCrit) {
            ctx.font = 'bold 14px Georgia';
            ctx.fillStyle = '#ffcc00';
            ctx.fillText('CRIT!', 64, 52);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;

        const mat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending
        });

        return new THREE.Sprite(mat);
    }

    update(dt) {
        for (let i = this.numbers.length - 1; i >= 0; i--) {
            const n = this.numbers[i];
            n.life -= dt;

            if (n.life <= 0) {
                this.scene.remove(n.sprite);
                n.sprite.material.map.dispose();
                n.sprite.material.dispose();
                this.numbers.splice(i, 1);
                continue;
            }

            // Update position
            n.sprite.position.add(n.velocity.clone().multiplyScalar(dt));
            n.velocity.y -= 2 * dt; // Gravity

            // Fade and scale
            const progress = n.life / n.maxLife;
            n.sprite.material.opacity = progress;
            const scale = 0.8 + progress * 0.4;
            n.sprite.scale.set(scale * 2, scale, 1);

            // Face camera
            n.sprite.lookAt(this.scene.children.find(c => c.isCamera) || new THREE.Vector3(0, 2, 10));
        }
    }

    clear() {
        for (const n of this.numbers) {
            this.scene.remove(n.sprite);
            n.sprite.material.map.dispose();
            n.sprite.material.dispose();
        }
        this.numbers = [];
    }
}
