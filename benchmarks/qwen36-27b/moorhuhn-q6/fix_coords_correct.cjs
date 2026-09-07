const fs = require('fs');
const path = require('path');

const gp = path.join(__dirname, 'src', 'scenes', 'GameScene.ts');
let content = fs.readFileSync(gp, 'utf8');

// Use the CORRECT coordinate conversion formula
const oldOnShoot = `    // Visual effects
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

const newOnShoot = `    // Convert pointer coordinates from display space to game space
    // pointer.x/y are in display coordinates (0 to displayWidth/Height)
    // target.x/y are in game coordinates (0 to width/height = 1280x720)
    const scaleX = this.scale.width / this.scale.displayWidth;
    const scaleY = this.scale.height / this.scale.displayHeight;
    const gameX = pointer.x * scaleX;
    const gameY = pointer.y * scaleY;

    // Visual effects (use display coords)
    this.showMuzzleFlash(pointer.x, pointer.y);
    this.showRecoil(pointer.x, pointer.y);

    // Hit detection (use game coords)
    const hit = this.checkHit(gameX, gameY);
    if (hit) {
      this.onTargetHit(hit, gameX, gameY);
    } else {
      this.onMissShot(gameX, gameY);
    }`;

content = content.replace(oldOnShoot, newOnShoot);

fs.writeFileSync(gp, content);
console.log('OK: Correct coordinate conversion applied (scaleX/scaleY)');