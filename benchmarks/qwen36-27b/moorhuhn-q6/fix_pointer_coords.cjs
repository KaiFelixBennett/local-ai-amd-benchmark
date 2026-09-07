const fs = require('fs');
const path = require('path');

const gp = path.join(__dirname, 'src', 'scenes', 'GameScene.ts');
let content = fs.readFileSync(gp, 'utf8');

// Remove debug logging first (restore original checkHit)
const debugCheckHit = `  private checkHit(x: number, y: number): Target | null {
    let closest: Target | null = null;
    let closestDist = Infinity;

    // DEBUG: log click position and target info
    console.log('[HIT DEBUG] Click at:', x, y, '| Targets:', this.targetList.length, '| Alive:', this.targetList.filter(t => t.alive).length);

    this.targetList.forEach(target => {
      if (!target.alive) return;

      const dx = x - target.x;
      const dy = y - target.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = target.getHitboxRadius();

      console.log('[HIT DEBUG] Target', target.typeId, 'at', target.x, target.y, '| dist:', dist.toFixed(1), '| radius:', radius.toFixed(1), '| hit:', dist <= radius);

      if (dist <= radius && dist < closestDist) {
        closestDist = dist;
        closest = target;
      }
    });

    console.log('[HIT DEBUG] Result:', closest ? closest.typeId : 'MISS');
    return closest;
  }`;

const originalCheckHit = `  private checkHit(x: number, y: number): Target | null {
    let closest: Target | null = null;
    let closestDist = Infinity;

    this.targetList.forEach(target => {
      if (!target.alive) return;

      const dx = x - target.x;
      const dy = y - target.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = target.getHitboxRadius();

      if (dist <= radius && dist < closestDist) {
        closestDist = dist;
        closest = target;
      }
    });

    return closest;
  }`;

content = content.replace(debugCheckHit, originalCheckHit);

// Now fix the onShoot method to convert viewport coordinates to game coordinates
const oldOnShoot = `    // Visual effects
    this.showMuzzleFlash(pointer.x, pointer.y);
    this.showRecoil(pointer.x, pointer.y);

    // Hit detection
    const hit = this.checkHit(pointer.x, pointer.y);
    if (hit) {
      this.onTargetHit(hit, pointer.x, pointer.y);
    } else {
      this.onMissShot(pointer.x, pointer.y);
    }`;

const newOnShoot = `    // Convert viewport coordinates to game coordinates for hit detection
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

content = content.replace(oldOnShoot, newOnShoot);

fs.writeFileSync(gp, content);
console.log('OK: Pointer coordinate conversion applied');