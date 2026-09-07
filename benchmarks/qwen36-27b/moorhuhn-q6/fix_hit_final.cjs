const fs = require('fs');
const path = require('path');

const gp = path.join(__dirname, 'src', 'scenes', 'GameScene.ts');
let content = fs.readFileSync(gp, 'utf8');

// Remove the pointer.gameX/gameY conversion (it doesn't exist)
// Use pointer.toWorldCoordinates() instead
const oldOnShoot = `    // Convert viewport coordinates to game coordinates for hit detection
    // pointer.x/y are in viewport coords, target.x/y are in game coords (1280x720)
    const gameX = pointer.gameX;
    const gameY = pointer.gameY;

    // Visual effects (use viewport coords for rendering)
    this.showMuzzleFlash(pointer.x, pointer.y);
    this.showRecoil(pointer.x, pointer.y);

    // Hit detection (use game coords)
    const hit = this.checkHit(gameX, gameY);
    if (hit) {
      this.onTargetHit(hit, gameX, gameY);
    } else {
      this.onMissShot(gameX, gameY);
    }`;

const newOnShoot = `    // Visual effects
    this.showMuzzleFlash(pointer.x, pointer.y);
    this.showRecoil(pointer.x, pointer.y);

    // Hit detection - use pointer coordinates directly
    // In Phaser with FIT scaling, pointer.x/y should already be in game coordinates
    const hit = this.checkHit(pointer.x, pointer.y);
    if (hit) {
      this.onTargetHit(hit, pointer.x, pointer.y);
    } else {
      this.onMissShot(pointer.x, pointer.y);
    }`;

content = content.replace(oldOnShoot, newOnShoot);

// Remove the hitbox multiplier we added for testing
content = content.replace(/hitboxRadius \* Math\.abs\(this\.bodySprite\?\.scaleX \?\? 1\) \* 3/, 'hitboxRadius * Math.abs(this.bodySprite?.scaleX ?? 1)');

// Restore the fallback radius
content = content.replace(/return 100;/, 'return 30;');

fs.writeFileSync(gp, content);
console.log('OK: Hit detection restored to use pointer.x/y directly');