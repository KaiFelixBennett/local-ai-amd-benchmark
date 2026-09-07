/**
 * Regenerates ASSETS.md from assets/manifest.json.
 * Run after tools/fetch-assets.mjs.  No manifest entry -> no asset ships.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'));

const KIND_TITLE = {
  hdri: 'Environment (HDRI)',
  texture: 'PBR textures',
  model: 'Models (glTF / GLB)',
};

const rows = manifest.ok.filter((e) => !e.entry);
const byKind = new Map();
for (const e of rows) {
  if (!byKind.has(e.kind)) byKind.set(e.kind, []);
  byKind.get(e.kind).push(e);
}

const totalBytes = rows.reduce((a, e) => a + (e.bytes || 0), 0);

let md = `# Asset credits

Every file under \`assets/\` was downloaded by \`tools/fetch-assets.mjs\`, which resolves
each URL from an official JSON API (Poly Haven \`api.polyhaven.com\`) or a version-pinned
repository path — no URL in this project was hand-written or guessed. Each download is
verified for HTTP 200, a non-zero body and a correct format magic number before it is
written to disk.

Regenerate with:

\`\`\`
node tools/fetch-assets.mjs
node tools/write-assets-md.mjs
\`\`\`

**${rows.length} files, ${(totalBytes / 1048576).toFixed(1)} MB total.**
`;

for (const [kind, list] of byKind) {
  md += `\n## ${KIND_TITLE[kind] || kind}\n\n`;
  md += '| File | Source URL | License | Author |\n|---|---|---|---|\n';
  for (const e of list.sort((a, b) => a.file.localeCompare(b.file))) {
    md += `| \`assets/${e.file}\` | ${e.source} | ${e.license} | ${e.author} |\n`;
  }
}

md += `
## Licence notes

- **CC0 1.0** (Poly Haven): public domain dedication — no attribution legally required.
  Credited here anyway, because the people who scanned these deserve it.
- **CC BY 4.0** (three.js example model): attribution required, given in the table above.

## Failed downloads

`;

if (manifest.failed.length === 0) {
  md += 'None — every requested asset downloaded and verified.\n';
} else {
  md += '| File | URL | Error |\n|---|---|---|\n';
  for (const f of manifest.failed) md += `| ${f.file} | ${f.url} | ${f.error} |\n`;
  md += '\nAssets that fail verification are deleted rather than shipped broken.\n';
}

fs.writeFileSync(path.join(ROOT, 'ASSETS.md'), md);
console.log(`ASSETS.md written: ${rows.length} files, ${(totalBytes / 1048576).toFixed(1)} MB`);
