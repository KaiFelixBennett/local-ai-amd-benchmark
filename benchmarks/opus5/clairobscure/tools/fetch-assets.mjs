/**
 * Asset acquisition.
 *
 * Every URL used here comes from an official JSON API response or a verified
 * repository path — none are hand-written guesses. Each download is checked for
 * HTTP 200, a non-zero body and a plausible magic number for its format; a
 * failure skips the asset instead of leaving a broken file behind.
 *
 * Run:  node tools/fetch-assets.mjs
 * Output: assets/** plus assets/manifest.json (consumed by tools/write-assets-md.mjs)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');

const PH_API = 'https://api.polyhaven.com';

/**
 * Sky. `table_mountain_2_puresky` is a high-contrast sunset: high contrast means
 * a strong, well-defined sun, which is what produces real shadows and specular
 * response rather than flat ambient light. "Pure sky" has no baked ground, so
 * our own terrain is the only ground in shot.
 */
const HDRIS = [{ id: 'table_mountain_2_puresky', res: '4k', fmt: 'hdr' }];

/** 2k surfaces: these are walked over and stood next to, 1k showed its pixels. */
const TEXTURES = [
  { id: 'cobblestone_floor_08', res: '2k', maps: ['Diffuse', 'nor_gl', 'arm'] },
  { id: 'medieval_blocks_05', res: '2k', maps: ['Diffuse', 'nor_gl', 'arm'] },
  { id: 'forest_ground_04', res: '2k', maps: ['Diffuse', 'nor_gl', 'arm'] },
  { id: 'rock_wall_09', res: '2k', maps: ['Diffuse', 'nor_gl', 'arm'] },
];

/**
 * Characters, from the three.js repository at a pinned tag.
 *
 * All three are Adobe Mixamo rigs and share the identical `mixamorig:` skeleton
 * — verified: every one of the 52 nodes animated by Soldier's clips exists on
 * Michelle and Xbot as well. That is what lets one set of locomotion clips
 * drive all three characters.
 */
const CHARACTERS = [
  { id: 'Soldier', file: 'Soldier.glb', note: 'locomotion source: Idle / Walk / Run' },
  { id: 'Michelle', file: 'Michelle.glb', note: 'textured realistic figure' },
  { id: 'Xbot', file: 'Xbot.glb', note: 'third silhouette' },
];

const THREE_TAG = 'r160';
const THREE_MODELS = `https://raw.githubusercontent.com/mrdoob/three.js/${THREE_TAG}/examples/models/gltf`;

const MODELS = [
  'street_lamp_01',
  'large_iron_gate',
  'Chandelier_01',
  'bronze_whale_statue',
  'dead_tree_trunk_02',
  'tree_stump_01',
  'namaqualand_boulder_02',
  'namaqualand_boulder_03',
  'wooden_picnic_table',
  'stone_fire_pit',
];

const MAGIC = {
  '.gltf': (b) => b.slice(0, 1).toString() === '{',
  '.glb': (b) => b.slice(0, 4).toString('ascii') === 'glTF',
  '.bin': (b) => b.length > 0,
  '.jpg': (b) => b[0] === 0xff && b[1] === 0xd8,
  '.png': (b) => b[0] === 0x89 && b.slice(1, 4).toString('ascii') === 'PNG',
  '.hdr': (b) => b.slice(0, 2).toString('ascii') === '#?',
  '.exr': (b) => b[0] === 0x76 && b[1] === 0x2f && b[2] === 0x31 && b[3] === 0x01,
};

const report = { ok: [], failed: [] };

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

/** Download one file, verify it, and record it. Returns true on success. */
async function download(url, relOut, meta) {
  const dest = path.join(ASSETS, relOut);
  const ext = path.extname(dest).toLowerCase();
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length === 0) throw new Error('empty body');
    const check = MAGIC[ext];
    if (check && !check(buf)) throw new Error(`bad magic number for ${ext}`);

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    report.ok.push({ file: relOut, url, bytes: buf.length, ...meta });
    console.log(`  ok   ${relOut}  (${(buf.length / 1024).toFixed(0)} KB)`);
    return true;
  } catch (err) {
    report.failed.push({ file: relOut, url, error: String(err.message || err) });
    console.log(`  FAIL ${relOut}  — ${err.message || err}`);
    return false;
  }
}

// ---------------------------------------------------------------------------

async function fetchHdris() {
  console.log('\n## HDRIs');
  for (const spec of HDRIS) {
    const [files, info] = await Promise.all([
      getJson(`${PH_API}/files/${spec.id}`),
      getJson(`${PH_API}/info/${spec.id}`),
    ]);
    const entry = files.hdri?.[spec.res]?.[spec.fmt];
    if (!entry?.url) {
      report.failed.push({ file: spec.id, url: '-', error: 'no hdri entry in API response' });
      console.log(`  FAIL ${spec.id} — not offered at ${spec.res}/${spec.fmt}`);
      continue;
    }
    const authors = Object.keys(info.authors || {}).join(', ') || 'unknown';
    await download(entry.url, `hdri/${spec.id}_${spec.res}.${spec.fmt}`, {
      kind: 'hdri',
      source: `https://polyhaven.com/a/${spec.id}`,
      license: 'CC0 1.0',
      author: authors,
    });
  }
}

async function fetchTextures() {
  console.log('\n## Textures');
  for (const spec of TEXTURES) {
    const [files, info] = await Promise.all([
      getJson(`${PH_API}/files/${spec.id}`),
      getJson(`${PH_API}/info/${spec.id}`),
    ]);
    const authors = Object.keys(info.authors || {}).join(', ') || 'unknown';
    for (const map of spec.maps) {
      const entry = files[map]?.[spec.res]?.jpg;
      if (!entry?.url) {
        report.failed.push({ file: `${spec.id}/${map}`, url: '-', error: 'map not offered as jpg' });
        console.log(`  FAIL ${spec.id}/${map} — not offered as jpg at ${spec.res}`);
        continue;
      }
      const suffix = map === 'Diffuse' ? 'diff' : map === 'nor_gl' ? 'nor' : 'arm';
      await download(entry.url, `textures/${spec.id}/${suffix}.jpg`, {
        kind: 'texture',
        source: `https://polyhaven.com/a/${spec.id}`,
        license: 'CC0 1.0',
        author: authors,
      });
    }
  }
}

async function fetchModels() {
  console.log('\n## Models');
  for (const id of MODELS) {
    let files;
    let info;
    try {
      [files, info] = await Promise.all([
        getJson(`${PH_API}/files/${id}`),
        getJson(`${PH_API}/info/${id}`),
      ]);
    } catch (err) {
      report.failed.push({ file: id, url: `${PH_API}/files/${id}`, error: String(err.message) });
      console.log(`  FAIL ${id} — ${err.message}`);
      continue;
    }
    // Prefer the smallest offered resolution; props do not need 4k maps.
    const res = ['1k', '2k', '4k'].find((r) => files.gltf?.[r]?.gltf?.url);
    const entry = res && files.gltf[res].gltf;
    if (!entry) {
      report.failed.push({ file: id, url: '-', error: 'no gltf variant in API response' });
      console.log(`  FAIL ${id} — no gltf variant`);
      continue;
    }
    const authors = Object.keys(info.authors || {}).join(', ') || 'unknown';
    const meta = {
      kind: 'model',
      source: `https://polyhaven.com/a/${id}`,
      license: 'CC0 1.0',
      author: authors,
    };

    const dir = `models/${id}`;
    const gltfName = path.basename(new URL(entry.url).pathname);
    let allOk = await download(entry.url, `${dir}/${gltfName}`, meta);

    for (const [rel, sub] of Object.entries(entry.include || {})) {
      // `rel` is the path the .gltf references; preserve it exactly.
      const ok = await download(sub.url, `${dir}/${rel}`, { ...meta, part: true });
      allOk = allOk && ok;
    }
    if (allOk) {
      report.ok.push({ file: `${dir}/${gltfName}`, entry: true, id, res, ...meta, primary: true });
    } else {
      console.log(`  NOTE ${id} incomplete — removing directory`);
      fs.rmSync(path.join(ASSETS, dir), { recursive: true, force: true });
    }
  }
}

async function fetchCharacters() {
  console.log('\n## Characters');
  for (const c of CHARACTERS) {
    await download(`${THREE_MODELS}/${c.file}`, `characters/${c.file}`, {
      kind: 'character',
      source: `https://github.com/mrdoob/three.js/blob/${THREE_TAG}/examples/models/gltf/${c.file}`,
      license: 'three.js repository (MIT); character by Adobe Mixamo',
      author: 'Adobe Mixamo, via the three.js examples',
      id: c.id,
      note: c.note,
    });
  }
}

// ---------------------------------------------------------------------------

fs.mkdirSync(ASSETS, { recursive: true });
await fetchHdris();
await fetchTextures();
await fetchModels();
await fetchCharacters();

fs.writeFileSync(
  path.join(ASSETS, 'manifest.json'),
  `${JSON.stringify({ generated: 'tools/fetch-assets.mjs', ok: report.ok, failed: report.failed }, null, 2)}\n`,
);

console.log(`\n=== ${report.ok.length} files downloaded, ${report.failed.length} failed ===`);
if (report.failed.length) {
  for (const f of report.failed) console.log(`  ${f.file}: ${f.error}`);
}
