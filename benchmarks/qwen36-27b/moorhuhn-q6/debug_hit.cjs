const fs = require('fs');
const path = require('path');

const gp = path.join(__dirname, 'src', 'scenes', 'GameScene.ts');
let content = fs.readFileSync(gp, 'utf8');

// Add debug logging to checkHit to see what's happening
const oldCheckHit = `  private checkHit(x: number, y: number): Target | null {
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

const newCheckHit = `  private checkHit(x: number, y: number): Target | null {
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

content = content.replace(oldCheckHit, newCheckHit);

fs.writeFileSync(gp, content);
console.log('OK: Debug logging added to checkHit');