const fs = require('fs');
const path = require('path');

const gp = path.join(__dirname, 'src', 'scenes', 'GameScene.ts');
let content = fs.readFileSync(gp, 'utf8');

// Add tempVec for coordinate conversion in class properties
const oldProps = `  private targetList: Target[] = [];`;
const newProps = `  private targetList: Target[] = [];
  private tempVec: Phaser.Math.Vector2 = new Phaser.Math.Vector2();`;
content = content.replace(oldProps, newProps);

// Fix onShoot to use game coordinates instead of viewport coordinates
const oldHit = `    // Hit detection
    const hit = this.checkHit(pointer.x, pointer.y);`;
const newHit = `    // Hit detection - convert viewport coords to game coords
    pointer.toGameCoordinates(this.tempVec);
    const hit = this.checkHit(this.tempVec.x, this.tempVec.y);`;
content = content.replace(oldHit, newHit);

// Fix checkHit to also use game coords for effect positions
const oldEffect = `      // Show hit effect at hit position
      this.showHitEffect(hitX, hitY, isPerfect);
      this.showScorePopup(hitX, hitY, points);`;
const newEffect = `      // Show hit effect at hit position (already in game coords)
      this.showHitEffect(hitX, hitY, isPerfect);
      this.showScorePopup(hitX, hitY, points);`;
content = content.replace(oldEffect, newEffect);

// Fix onMissShot too
const oldMiss = `  private onMissShot(x: number, y: number): void {
    this.misses++;
    this.combo = onMiss(this.combo!);
    this.showMissEffect(x, y);`;
const newMiss = `  private onMissShot(x: number, y: number): void {
    this.misses++;
    this.combo = onMiss(this.combo!);
    this.showMissEffect(x, y);`;
content = content.replace(oldMiss, newMiss);

fs.writeFileSync(gp, content);
console.log('OK: Coordinate conversion applied');