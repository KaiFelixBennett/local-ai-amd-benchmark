#!/usr/bin/env node
/**
 * tools/check-syntax.mjs - validates ES module syntax for every .js file under
 * the src directory (recursively). Node's --check is finicky about .js ESM in
 * some setups, so each file is copied to a temp .mjs and parsed. Usage:
 *   node tools/check-syntax.mjs
 */
import { cp, mkdtemp, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith('.js')) yield full;
  }
}

const tmp = await mkdtemp(path.join(os.tmpdir(), 'syncheck-'));
let i = 0;
let failed = 0;

if (existsSync(src)) {
  for await (const file of walk(src)) {
    const rel = path.relative(root, file);
    const dest = path.join(tmp, `m${i++}.mjs`);
    await cp(file, dest);
    try {
      await run(process.execPath, ['--check', dest]);
      process.stdout.write(`OK    ${rel}\n`);
    } catch (err) {
      failed++;
      process.stdout.write(`FAIL  ${rel}\n${String(err.stdout || '')}${String(err.stderr || '')}\n`);
    }
  }
}

await rm(tmp, { recursive: true, force: true });

if (failed > 0) {
  console.error(`${failed} file(s) failed syntax check.`);
  process.exit(1);
}
console.log('All files parse cleanly.');
