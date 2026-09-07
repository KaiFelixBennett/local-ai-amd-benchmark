const fs = require('fs');
const path = require('path');

const gp = path.join(__dirname, 'src', 'scenes', 'GameScene.ts');
let content = fs.readFileSync(gp, 'utf8');

// Remove debug overlay creation
content = content.replace(`    // Debug overlay
    this.debugText = this.add.text(10, 10, '', {
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif',
      color: '#ff0000',
      backgroundColor: '#000000',
      padding: { x: 5, y: 3 },
    }).setOrigin(0, 0).setDepth(1000);

    this.setupInput();`, `    this.setupInput();`);

// Remove debugText property
content = content.replace(`  private targetList: Target[] = [];
  private tempVec: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private debugText!: Phaser.GameObjects.Text;`, `  private targetList: Target[] = [];
  private tempVec: Phaser.Math.Vector2 = new Phaser.Math.Vector2();`);

// Remove debug text update in update()
content = content.replace(`  update(time: number, delta: number): void {
    // Update debug text
    if (this.debugText) {
      const alive = this.targetList.filter(t => t.alive).length;
      this.debugText.setText(\`Targets: \${this.targetList.length} | Alive: \${alive}\`);
    }

    if (this.paused) return;`, `  update(time: number, delta: number): void {
    if (this.paused) return;`);

fs.writeFileSync(gp, content);
console.log('OK: Debug overlay removed');