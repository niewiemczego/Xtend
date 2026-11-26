// Run with: node --test
// scripts/verify-store.mjs on copies shaped like the Chrome Web Store's: a CRX3 with a signed
// header, deflated entries, a _metadata/ folder and possibly store keys in manifest.json.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const EXT = join(__dirname, '..', 'extension');
const load = async () => {
  const [pkg, zip, verify] = await Promise.all([
    import('../scripts/package.mjs'),
    import('../scripts/lib/zip.mjs'),
    import('../scripts/verify-store.mjs'),
  ]);
  return { ...pkg, ...zip, ...verify };
};

/** CRX3: "Cr24", version 3, header length, header bytes, then the ZIP. */
function crx(zip) {
  const header = Buffer.from('fake signed header – contents are not checked by the verifier');
  const prefix = Buffer.alloc(12);
  prefix.write('Cr24', 0, 'ascii');
  prefix.writeUInt32LE(3, 4);
  prefix.writeUInt32LE(header.length, 8);
  return Buffer.concat([prefix, header, zip]);
}

async function storeCopy({ change, drop, add, manifestKeys } = {}) {
  const m = await load();
  const files = m.collectFiles(EXT).map((f) => ({ ...f }));
  if (manifestKeys) {
    const manifest = files.find((f) => f.name === 'manifest.json');
    const json = JSON.parse(manifest.data.toString('utf8'));
    Object.assign(json, manifestKeys);
    manifest.data = Buffer.from(JSON.stringify(json)); // the store re-serialises it
  }
  if (change) files.find((f) => f.name === change).data = Buffer.from('tampered');
  const kept = files.filter((f) => f.name !== drop);
  kept.push({ name: '_metadata/verified_contents.json', data: Buffer.from('[]') });
  if (add) kept.push({ name: add, data: Buffer.from('extra') });
  return { m, buf: crx(m.writeZip(kept, { compress: true })) };
}

const expectedSums = async () => {
  const m = await load();
  return m.parseSums(m.sumsFor(m.collectFiles(EXT)));
};
const releaseManifest = readFileSync(join(EXT, 'manifest.json'));

test('a store CRX with the same files → OK (_metadata ignored)', async () => {
  const { m, buf } = await storeCopy();
  const files = m.readZip(m.zipFromCrx(buf));
  assert.ok(files.has('_metadata/verified_contents.json'), 'the store copy has _metadata/');
  const r = m.compare(m.withoutMetadata(files), await expectedSums(), releaseManifest);
  assert.equal(r.ok, true);
  assert.deepEqual([r.missing, r.extra, r.changed], [[], [], []]);
});

test('store keys added to manifest.json are tolerated and reported', async () => {
  const { m, buf } = await storeCopy({ manifestKeys: { update_url: 'https://clients2.google.com/service/update2/crx' } });
  const files = m.withoutMetadata(m.readZip(m.zipFromCrx(buf)));
  const r = m.compare(files, await expectedSums(), releaseManifest);
  assert.equal(r.ok, true);
  assert.equal(r.notes.length, 1);
});

test('any other manifest change is reported', async () => {
  const { m, buf } = await storeCopy({ manifestKeys: { permissions: ['downloads', 'tabs'] } });
  const files = m.withoutMetadata(m.readZip(m.zipFromCrx(buf)));
  const r = m.compare(files, await expectedSums(), releaseManifest);
  assert.equal(r.ok, false);
  assert.deepEqual(r.changed, ['manifest.json']);
});

test('a changed, missing or extra file is reported', async () => {
  for (const [options, field, name] of [
    [{ change: 'content/download.js' }, 'changed', 'content/download.js'],
    [{ drop: 'content/debug.js' }, 'missing', 'content/debug.js'],
    [{ add: 'content/extra.js' }, 'extra', 'content/extra.js'],
  ]) {
    const { m, buf } = await storeCopy(options);
    const files = m.withoutMetadata(m.readZip(m.zipFromCrx(buf)));
    const r = m.compare(files, await expectedSums(), releaseManifest);
    assert.equal(r.ok, false, name);
    assert.deepEqual(r[field], [name]);
  }
});

test('readCopy works on a .crx file, a .zip and an installed folder', async () => {
  const m = await load();
  const dir = mkdtempSync(join(tmpdir(), 'xtend-verify-'));
  try {
    const { buf } = await storeCopy();
    writeFileSync(join(dir, 'store.crx'), buf);
    writeFileSync(join(dir, 'release.zip'), m.writeZip(m.collectFiles(EXT)));
    // installed folder: the extension's files plus _metadata/
    const installed = join(dir, 'installed');
    for (const f of m.collectFiles(EXT)) {
      mkdirSync(join(installed, f.name, '..'), { recursive: true });
      writeFileSync(join(installed, f.name), f.data);
    }
    mkdirSync(join(installed, '_metadata'), { recursive: true });
    writeFileSync(join(installed, '_metadata', 'computed_hashes.json'), '{}');

    const expected = await expectedSums();
    for (const name of ['store.crx', 'release.zip', 'installed']) {
      const r = m.compare(m.readCopy(join(dir, name)), expected, releaseManifest);
      assert.equal(r.ok, true, name);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the release zip itself verifies against its own checksum file (CLI)', async () => {
  const { spawnSync } = require('node:child_process');
  const m = await load();
  const out = mkdtempSync(join(tmpdir(), 'xtend-cli-'));
  try {
    const { base } = m.buildPackage(EXT, out);
    const script = join(__dirname, '..', 'scripts', 'verify-store.mjs');
    const ok = spawnSync(process.execPath, [script, join(out, `${base}.zip`), join(out, `${base}.files.sha256`)], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /^OK – all \d+ files match/m);

    const { buf } = await storeCopy({ change: 'content/main.js' });
    writeFileSync(join(out, 'tampered.crx'), buf);
    const bad = spawnSync(process.execPath, [script, join(out, 'tampered.crx'), join(out, `${base}.files.sha256`)], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /CHANGED {2}content\/main\.js/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
