const fs = require('fs');
const path = require('path');

const gp = path.join(__dirname, 'src', 'scenes', 'GameScene.ts');
let content = fs.readFileSync(gp, 'utf8');

// Replace the coordinate conversion with a simpler approach
// In Phaser 3 with FIT scaling, pointer.x/y might already be in game coordinates
// Let's try using them directly first

const oldOnShoot = `    // Convert pointer coordinates to game world coordinates
    // pointer.x/y are in viewport coordinates, need to convert to game coordinates (1280x720)
    const worldX = Phaser.Math.Linear(0, this.scale.width, pointer.x / this.scale.displayWidth);
    const worldY = Phaser.Math.Linear(0, this.scale.height, pointer.y / this.scale.displayHeight);

    // Visual effects (use viewport coords)
    this.showMuzzleFlash(pointer.x, pointer.y);
    this.showRecoil(pointer.x, pointer.y);

    // Hit detection (use world coords)
    const hit = this.checkHit(worldX, worldY);
    if (hit) {
      this.onTargetHit(hit, worldX, worldY);
    } else {
      this.onMissShot(worldX, worldY);
    }`;

const newOnShoot = `    // Visual effects
    this.showMuzzleFlash(pointer.x, pointer.y);
    this.showRecoil(pointer.x, pointer.y);

    // Hit detection
    // Try using pointer coordinates directly (Phaser 3 FIT scaling should handle this)
    const hit = this.checkHit(pointer.x, pointer.y);
    if (hit) {
      this.onTargetHit(hit, pointer.x, pointer.y);
    } else {
      this.onMissShot(pointer.x, pointer.y);
    }`;

content = content.replace(oldOnShoot, newOnShoot);

fs.writeFileSync(gp, content);
console.log('OK: Simplified hit detection - using pointer.x/y directly');