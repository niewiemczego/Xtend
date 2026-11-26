#!/usr/bin/env node
// Builds the release package from extension/ – reproducibly: the same files always give a
// byte-identical zip, so anyone can rebuild a release from its tag and compare SHA-256.
//
//   node scripts/package.mjs              → dist/xtend-<version>.zip
//                                           dist/xtend-<version>.zip.sha256    (the zip)
//                                           dist/xtend-<version>.files.sha256  (every file inside)
//   node scripts/package.mjs --no-tests   skip `node --test` (CI runs the tests separately)
//
// Only Node's standard library; the version comes from extension/manifest.json.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeZip } from './lib/zip.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = [/^\./, /^__MACOSX$/, /~$/, /\.swp$/]; // .DS_Store, editor files, hidden files

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Every file under `dir`, as { name: 'a/b.js', data }, hidden and junk files left out. */
export function collectFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (SKIP.some((re) => re.test(entry.name))) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push({ name: relative(dir, full).split(sep).join('/'), data: readFileSync(full) });
    }
  };
  walk(dir);
  return out.sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
}

/** `sha256sum` format: "<hash>  <name>" per line, sorted. */
export function sumsFor(files) {
  return files.map((f) => `${sha256(f.data)}  ${f.name}\n`).join('');
}

export function buildPackage(extensionDir, outDir) {
  const manifest = JSON.parse(readFileSync(join(extensionDir, 'manifest.json'), 'utf8'));
  const version = manifest.version;
  if (!/^\d+(\.\d+){0,3}$/.test(String(version))) throw new Error(`Invalid version in manifest.json: "${version}"`);

  const files = collectFiles(extensionDir);
  const zip = writeZip(files);
  const base = `xtend-${version}`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${base}.zip`), zip);
  writeFileSync(join(outDir, `${base}.zip.sha256`), `${sha256(zip)}  ${base}.zip\n`);
  writeFileSync(join(outDir, `${base}.files.sha256`), sumsFor(files));
  return { version, base, zip, files, hash: sha256(zip) };
}

function main(args) {
  if (!args.includes('--no-tests')) {
    console.log('Running tests…');
    const tests = spawnSync(process.execPath, ['--test'], { cwd: ROOT, stdio: 'ignore' });
    if (tests.status !== 0) {
      console.error("Tests failed – no package built. Run 'node --test' to see why.");
      process.exit(1);
    }
  }
  const { base, zip, files, hash } = buildPackage(join(ROOT, 'extension'), join(ROOT, 'dist'));
  console.log(`Built dist/${base}.zip – ${files.length} files, ${zip.length} bytes`);
  console.log(`SHA-256 ${hash}`);
  console.log(`Checksums: dist/${base}.zip.sha256, dist/${base}.files.sha256`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
