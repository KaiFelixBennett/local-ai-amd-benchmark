const fs = require('fs');
const path = require('path');

// Fix hitbox sizes in types
const typesPath = path.join(__dirname, 'src', 'types', 'index.ts');
let content = fs.readFileSync(typesPath, 'utf8');

// Increase hitboxRadius for all targets to make them easier to hit
content = content.replace(/hitboxRadius: 30,/, 'hitboxRadius: 45,');
content = content.replace(/hitboxRadius: 18,/, 'hitboxRadius: 28,');
content = content.replace(/hitboxRadius: 22,/, 'hitboxRadius: 35,');
content = content.replace(/hitboxRadius: 25,/, 'hitboxRadius: 40,');
content = content.replace(/hitboxRadius: 15,/, 'hitboxRadius: 25,');
content = content.replace(/hitboxRadius: 20,/, 'hitboxRadius: 32,');
content = content.replace(/hitboxRadius: 28,/, 'hitboxRadius: 42,');

fs.writeFileSync(typesPath, content);
console.log('OK: Hitbox sizes increased');