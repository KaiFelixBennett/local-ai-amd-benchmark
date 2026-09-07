// Robuster statischer Server fuer dieses Projekt (ES-Module + Importmap).
// Warum nicht `python -m http.server`? Das ist SINGLE-THREADED; Chromium
// (agent-browser) oeffnet beim Laden mehrere parallele Verbindungen und
// bekommt dann net::ERR_EMPTY_RESPONSE. Node http ist nebenlaeufig -> stabil.
// Bindet auf 0.0.0.0, damit der Browser-Host die Loopback-URL erreicht.
// Start: `node serve.mjs`  (oder start.bat).  Zugriff: http://127.0.0.1:8123/
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';

const ROOT = process.cwd();
const PORT = Number(process.env.PORT) || 8123;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.map':  'application/json; charset=utf-8',
  '.gltf': 'model/gltf+json; charset=utf-8',
  '.glb':  'model/gltf-binary',
  '.bin':  'application/octet-stream',
  '.hdr':  'image/vnd.radiance',
  '.exr':  'image/x-exr',
  '.webp': 'image/webp',
};

const server = http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
    const filePath = normalize(join(ROOT, rel));
    if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} ist belegt -> ein Server laeuft vermutlich schon.`);
    console.log(`Einfach http://127.0.0.1:${PORT}/ verwenden (nicht neu starten).`);
    process.exit(0);
  }
  console.error(e);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Serving ${ROOT}`);
  console.log(`  http://127.0.0.1:${PORT}/`);
  console.log('  (Fenster offen lassen = Server laeuft. Strg+C = stop.)');
});
