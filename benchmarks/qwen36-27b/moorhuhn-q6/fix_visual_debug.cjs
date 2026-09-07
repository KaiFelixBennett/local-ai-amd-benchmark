const fs = require('fs');
const path = require('path');

const gp = path.join(__dirname, 'src', 'scenes', 'GameScene.ts');
let content = fs.readFileSync(gp, 'utf8');

// Remove console.log debug statements (they don't show in browser)
const debugCheckHit = `  private checkHit(x: number, y: number): Target | null {
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

const cleanCheckHit = `  private checkHit(x: number, y: number): Target | null {
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

content = content.replace(debugCheckHit, cleanCheckHit);

// Add debug text overlay in create() method
const oldCreate = `    this.setupInput();`;
const newCreate = `    // Debug overlay
    this.debugText = this.add.text(10, 10, '', {
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif',
      color: '#ff0000',
      backgroundColor: '#000000',
      padding: { x: 5, y: 3 },
    }).setOrigin(0, 0).setDepth(1000);

    this.setupInput();`;

content = content.replace(oldCreate, newCreate);

// Add debugText property
const oldProps = `  private targetList: Target[] = [];
  private tempVec: Phaser.Math.Vector2 = new Phaser.Math.Vector2();`;
const newProps = `  private targetList: Target[] = [];
  private tempVec: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private debugText!: Phaser.GameObjects.Text;`;

content = content.replace(oldProps, newProps);

// Update debug text in update() method
const oldUpdate = `  update(time: number, delta: number): void {
    if (this.paused) return;`;
const newUpdate = `  update(time: number, delta: number): void {
    // Update debug text
    if (this.debugText) {
      const alive = this.targetList.filter(t => t.alive).length;
      this.debugText.setText(\`Targets: \${this.targetList.length} | Alive: \${alive}\`);
    }

    if (this.paused) return;`;

content = content.replace(oldUpdate, newUpdate);

fs.writeFileSync(gp, content);
console.log('OK: Visual debug overlay added');