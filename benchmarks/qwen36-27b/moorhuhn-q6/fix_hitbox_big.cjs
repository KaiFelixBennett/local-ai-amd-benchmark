const fs = require('fs');
const path = require('path');

const gp = path.join(__dirname, 'src', 'scenes', 'GameScene.ts');
let content = fs.readFileSync(gp, 'utf8');

// Make hitbox radius MUCH bigger for testing - change from 45 to 100
content = content.replace(/hitboxRadius \* Math\.abs\(this\.bodySprite\?\.scaleX \?\? 1\)/, 'hitboxRadius * Math.abs(this.bodySprite?.scaleX ?? 1) * 3');

// Also increase the fallback radius
content = content.replace(/return 30;/, 'return 100;');

fs.writeFileSync(gp, content);
console.log('OK: Hitbox radius tripled for testing');