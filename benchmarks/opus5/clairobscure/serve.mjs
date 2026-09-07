/**
 * Zero-dependency static server for the project.
 *
 * Exists because the game is a native ES-module project (no bundler) and
 * browsers refuse cross-file module loads over file://. Also sets the MIME
 * types the asset pipeline needs — .hdr and .glb in particular are unknown to
 * most default servers, and a wrong type makes RGBELoader/GLTFLoader fail in
 * ways that look like corrupt files.
 *
 * Run:  node serve.mjs [port]
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// 8080 is somebody else's port on most machines; pick something quieter.
const DEFAULT_PORT = 8123;
const REQUESTED_PORT = Number(process.argv[2]) || DEFAULT_PORT;
const MAX_PORT_TRIES = 20;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.hdr': 'image/vnd.radiance',
  '.exr': 'image/x-exr',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ktx2': 'image/ktx2',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function safeJoin(base, target) {
  const p = path.normalize(path.join(base, target));
  // Reject anything that escapes the served root.
  if (!p.startsWith(base)) return null;
  return p;
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = safeJoin(ROOT, urlPath);
  if (!filePath) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 Not Found: ${urlPath}`);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      // Assets are content-addressed by name and never mutate during a session.
      'Cache-Control': ext === '.html' || ext === '.js' ? 'no-cache' : 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

/**
 * Bind to the requested port, stepping to the next free one if it is taken.
 * An explicitly requested port is never silently moved — that would hide a
 * mistake — but the default is allowed to walk.
 */
// Registered once, and reports the port actually bound. Passing a callback to
// each `listen()` attempt instead would leave the failed attempts' callbacks
// registered, and every one of them fires on the eventual success — printing a
// list of URLs of which only the last is real.
server.on('listening', () => {
  const { port } = server.address();
  console.log(`Gilded Requiem — serving ${ROOT}`);
  console.log(`  http://localhost:${port}/`);
});

function listen(port, triesLeft) {
  server.once('error', (err) => {
    if (err.code !== 'EADDRINUSE') {
      console.error(`Server error: ${err.message}`);
      process.exit(1);
    }
    const explicit = process.argv[2] !== undefined;
    if (explicit || triesLeft <= 0) {
      console.error(`Port ${port} is already in use.`);
      console.error(explicit
        ? '  Pass a different port:  node serve.mjs 9000'
        : `  Tried ${DEFAULT_PORT}-${port}. Pass one explicitly: node serve.mjs 9000`);
      process.exit(1);
    }
    console.log(`  port ${port} busy, trying ${port + 1}…`);
    listen(port + 1, triesLeft - 1);
  });

  server.listen(port);
}

listen(REQUESTED_PORT, MAX_PORT_TRIES);
