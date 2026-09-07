const fs = require('fs');
const path = require('path');

const gp = path.join(__dirname, 'src', 'scenes', 'GameScene.ts');
let content = fs.readFileSync(gp, 'utf8');

// Add debug logging to checkHit
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

    console.log('[HIT] Click:', x.toFixed(0), y.toFixed(0), '| List:', this.targetList.length, '| Alive:', this.targetList.filter(t => t.alive).length);

    this.targetList.forEach(target => {
      if (!target.alive) return;

      const dx = x - target.x;
      const dy = y - target.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = target.getHitboxRadius();

      console.log('[HIT] Target', target.typeId, 'at', target.x.toFixed(0), target.y.toFixed(0), '| dist:', dist.toFixed(0), '| radius:', radius.toFixed(0), '| hit:', dist <= radius);

      if (dist <= radius && dist < closestDist) {
        closestDist = dist;
        closest = target;
      }
    });

    console.log('[HIT] Result:', closest ? closest.typeId : 'MISS');
    return closest;
  }`;

content = content.replace(oldCheckHit, newCheckHit);

fs.writeFileSync(gp, content);
console.log('OK: Debug logging added');