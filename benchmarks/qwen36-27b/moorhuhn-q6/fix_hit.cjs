const fs = require('fs');
const path = require('path');

const gp = path.join(__dirname, 'src', 'scenes', 'GameScene.ts');
let lines = fs.readFileSync(gp, 'utf8').split(/\r?\n/);

const eol = fs.readFileSync(gp, 'utf8').includes('\r\n') ? '\r\n' : '\n';

// Find and fix the onShoot method - replace pointer.x/y with game coordinates
let newLines = [];
for (let i = 0; i < lines.length; i++) {
  // Fix: convert viewport coords to game coords for hit detection
  if (lines[i].includes('// Hit detection') && lines[i+1] && lines[i+1].includes('const hit = this.checkHit(pointer.x, pointer.y)')) {
    newLines.push(lines[i]); // // Hit detection
    newLines.push('    // Convert viewport coordinates to game coordinates for accurate hit detection');
    newLines.push('    const gameX = Phaser.Math.Linear(0, this.scale.width, pointer.x / this.scale.gameSize.width);');
    newLines.push('    const gameY = Phaser.Math.Linear(0, this.scale.height, pointer.y / this.scale.gameSize.height);');
    newLines.push('    const hit = this.checkHit(gameX, gameY);');
    i++; // skip old line
    
    // Also fix the effect positions
    while (i < lines.length - 1) {
      i++;
      if (lines[i].includes('this.onTargetHit(hit, pointer.x, pointer.y)')) {
        newLines.push('      this.onTargetHit(hit, gameX, gameY);');
        break;
      } else if (lines[i].includes('this.onMissShot(pointer.x, pointer.y)')) {
        newLines.push('      this.onMissShot(gameX, gameY);');
        break;
      }
      newLines.push(lines[i]);
    }
  } 
  // Fix visual effects too (muzzle flash, recoil)
  else if (lines[i].includes('this.showMuzzleFlash(pointer.x, pointer.y)')) {
    // These are for visual rendering, so viewport coords are actually correct
    newLines.push(lines[i]);
  }
  else {
    newLines.push(lines[i]);
  }
}

fs.writeFileSync(gp, newLines.join(eol));
console.log('OK: Hit detection coordinate fix applied');