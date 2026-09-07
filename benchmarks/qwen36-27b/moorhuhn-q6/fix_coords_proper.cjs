const fs = require('fs');
const path = require('path');

const gp = path.join(__dirname, 'src', 'scenes', 'GameScene.ts');
let content = fs.readFileSync(gp, 'utf8');

// Fix: use pointer to world coordinates conversion
const oldOnShoot = `    // Visual effects
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

const newOnShoot = `    // Convert pointer coordinates to game world coordinates
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

content = content.replace(oldOnShoot, newOnShoot);

fs.writeFileSync(gp, content);
console.log('OK: Proper coordinate conversion applied');