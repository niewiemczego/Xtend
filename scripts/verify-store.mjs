#!/usr/bin/env node
// Checks that a copy of Xtend – the .crx from the Chrome Web Store, a .zip, or the folder an
// installed extension lives in – contains exactly the files of a GitHub release.
//
//   node scripts/verify-store.mjs <copy> <xtend-<version>.files.sha256> [release manifest.json]
//
// Run it from a checkout of the release tag: the repo's extension/manifest.json is then used
// as the release manifest (only if its hash matches the release).
//
// The Chrome Web Store re-signs every package and adds a _metadata/ folder, so the store's
// file never has the same SHA-256 as the release zip. What can be compared is every file
// inside it: same names, same contents. _metadata/ is ignored. If manifest.json differs only
// by keys the store or browser adds ("update_url", "key"), it counts as a match, and the
// output says so.
//
// Exit code 0 = identical, 1 = differences, 2 = usage or read error.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readZip, zipFromCrx } from './lib/zip.mjs';
import { collectFiles } from './package.mjs';

const STORE_ADDED_MANIFEST_KEYS = ['update_url', 'key'];
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** "<hash>  <name>" lines → Map(name → hash) */
export function parseSums(text) {
  const sums = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(line.trim());
    if (!m) throw new Error(`Not a sha256 line: ${line}`);
    sums.set(m[2], m[1]);
  }
  return sums;
}

/** Drops the _metadata/ folder the store / browser adds. */
export function withoutMetadata(files) {
  for (const name of [...files.keys()]) if (name.startsWith('_metadata/')) files.delete(name);
  return files;
}

/** Files of a .crx / .zip / unpacked folder → Map(name → Buffer), _metadata/ left out. */
export function readCopy(path) {
  const files = statSync(path).isDirectory()
    ? new Map(collectFiles(path).map((f) => [f.name, f.data]))
    : readZip(zipFromCrx(readFileSync(path)));
  return withoutMetadata(files);
}

function manifestMatchesWithoutStoreKeys(data, expectedHash, releaseManifest) {
  if (!releaseManifest || sha256(releaseManifest) !== expectedHash) return false;
  try {
    const store = JSON.parse(data.toString('utf8'));
    const release = JSON.parse(releaseManifest.toString('utf8'));
    for (const key of STORE_ADDED_MANIFEST_KEYS) {
      if (!(key in release)) delete store[key];
    }
    return JSON.stringify(store) === JSON.stringify(release);
  } catch (_) {
    return false;
  }
}

/**
 * @param {Map<string, Buffer>} copy
 * @param {Map<string, string>} expected  name → sha256
 * @param {Buffer} [releaseManifest]  the release's manifest.json, to judge store-added keys
 */
export function compare(copy, expected, releaseManifest) {
  const result = { ok: true, matched: [], notes: [], missing: [], extra: [], changed: [] };
  for (const [name, hash] of expected) {
    const data = copy.get(name);
    if (!data) {
      result.missing.push(name);
    } else if (sha256(data) === hash) {
      result.matched.push(name);
    } else if (name === 'manifest.json' && manifestMatchesWithoutStoreKeys(data, hash, releaseManifest)) {
      result.matched.push(name);
      result.notes.push('manifest.json: identical apart from keys added by the store/browser (update_url, key)');
    } else {
      result.changed.push(name);
    }
  }
  for (const name of copy.keys()) if (!expected.has(name)) result.extra.push(name);
  result.ok = !result.missing.length && !result.extra.length && !result.changed.length;
  return result;
}

function main(args) {
  const [copyPath, sumsPath, releaseManifestPath] = args;
  if (!copyPath || !sumsPath) {
    console.error('Usage: node scripts/verify-store.mjs <store .crx | .zip | installed folder> <xtend-<version>.files.sha256> [release manifest.json]');
    return 2;
  }
  const expected = parseSums(readFileSync(sumsPath, 'utf8'));
  const copy = readCopy(copyPath);
  const repoManifest = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'manifest.json');
  const manifestPath = releaseManifestPath || (existsSync(repoManifest) ? repoManifest : null);
  const releaseManifest = manifestPath ? readFileSync(manifestPath) : undefined;
  const r = compare(copy, expected, releaseManifest);

  for (const note of r.notes) console.log(`note: ${note}`);
  for (const name of r.changed) console.log(`CHANGED  ${name}`);
  for (const name of r.missing) console.log(`MISSING  ${name}`);
  for (const name of r.extra) console.log(`EXTRA    ${name}`);
  if (r.ok) {
    console.log(`OK – all ${r.matched.length} files match the release (_metadata/ ignored).`);
    return 0;
  }
  console.log(`NOT THE SAME – ${r.changed.length} changed, ${r.missing.length} missing, ${r.extra.length} extra.`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
