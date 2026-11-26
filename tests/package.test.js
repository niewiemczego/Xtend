// Run with: node --test
// The release package must be reproducible and contain exactly extension/.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cpSync, chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const EXT = join(__dirname, '..', 'extension');
const load = () => Promise.all([import('../scripts/package.mjs'), import('../scripts/lib/zip.mjs')]);
const tmp = () => mkdtempSync(join(tmpdir(), 'xtend-'));

test('the zip holds exactly the files of extension/, byte for byte', async () => {
  const [{ buildPackage, collectFiles }, { readZip }] = await load();
  const out = tmp();
  try {
    const { zip, base } = buildPackage(EXT, out);
    const inside = readZip(zip);
    const expected = collectFiles(EXT);
    assert.deepEqual([...inside.keys()], expected.map((f) => f.name));
    for (const f of expected) assert.ok(inside.get(f.name).equals(f.data), f.name);
    assert.ok(inside.has('manifest.json'), 'manifest.json at the root');
    assert.deepEqual(readdirSync(out).sort(), [`${base}.files.sha256`, `${base}.zip`, `${base}.zip.sha256`]);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('same files → same SHA-256, whatever the dates, modes or junk files', async () => {
  const [{ buildPackage }] = await load();
  const a = tmp();
  const b = tmp();
  const copy = tmp();
  try {
    cpSync(EXT, copy, { recursive: true });
    utimesSync(join(copy, 'manifest.json'), new Date('2031-05-05'), new Date('2031-05-05'));
    chmodSync(join(copy, 'content', 'main.js'), 0o600);
    writeFileSync(join(copy, '.DS_Store'), 'junk');
    writeFileSync(join(copy, 'content', 'post.js~'), 'backup');
    assert.equal(buildPackage(copy, b).hash, buildPackage(EXT, a).hash);
  } finally {
    for (const d of [a, b, copy]) rmSync(d, { recursive: true, force: true });
  }
});

test('a changed file changes the SHA-256', async () => {
  const [{ buildPackage }] = await load();
  const a = tmp();
  const copy = tmp();
  try {
    cpSync(EXT, copy, { recursive: true });
    writeFileSync(join(copy, 'content', 'main.js'), readFileSync(join(EXT, 'content', 'main.js'), 'utf8') + '\n// changed\n');
    assert.notEqual(buildPackage(copy, a).hash, buildPackage(EXT, a).hash);
  } finally {
    for (const d of [a, copy]) rmSync(d, { recursive: true, force: true });
  }
});

test('checksum files use the sha256sum format', async () => {
  const [{ buildPackage, sha256 }] = await load();
  const out = tmp();
  try {
    const { base, zip, files } = buildPackage(EXT, out);
    assert.equal(readFileSync(join(out, `${base}.zip.sha256`), 'utf8'), `${sha256(zip)}  ${base}.zip\n`);
    const lines = readFileSync(join(out, `${base}.files.sha256`), 'utf8').trim().split('\n');
    assert.equal(lines.length, files.length);
    for (const line of lines) assert.match(line, /^[0-9a-f]{64} {2}\S+$/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
