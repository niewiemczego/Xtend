// Run with: node --test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const EXT = join(__dirname, '..', 'extension');
const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));

const scripts = [
  manifest.background.service_worker,
  ...manifest.content_scripts.flatMap((cs) => cs.js || []),
];
const icons = Object.values(manifest.icons || {});
const styles = manifest.content_scripts.flatMap((cs) => cs.css || []);

test('is Manifest V3', () => {
  assert.equal(manifest.manifest_version, 3);
});

test('every file referenced by the manifest exists', () => {
  for (const file of [...scripts, ...styles, ...icons]) {
    assert.ok(existsSync(join(EXT, file)), `missing: ${file}`);
  }
});

test('every script is valid JavaScript', () => {
  for (const file of scripts) {
    const code = readFileSync(join(EXT, file), 'utf8');
    assert.doesNotThrow(() => new vm.Script(code, { filename: file }), file);
  }
});

test('page scripts run in the MAIN world at document_start, each after its shared file', () => {
  const page = manifest.content_scripts.find((cs) => cs.world === 'MAIN');
  assert.equal(page.run_at, 'document_start');
  assert.deepEqual(page.js, [
    'shared/video-media.js',
    'page/interceptor.js',
    'shared/post-link.js',
    'page/link-cleaner.js',
  ]);
});

test('content/main.js is loaded last', () => {
  const content = manifest.content_scripts.find((cs) => cs.world !== 'MAIN');
  assert.equal(content.js.at(-1), 'content/main.js');
});

test('permissions stay minimal', () => {
  assert.deepEqual(manifest.permissions, ['downloads']);
  assert.equal(manifest.host_permissions, undefined);
});

test("store name and short name fit Chrome's limits", () => {
  assert.equal(manifest.name, 'Xtend: Social Media Toolkit');
  assert.ok(manifest.name.length <= 75, 'name ≤ 75 characters');
  assert.equal(manifest.short_name, 'Xtend');
  assert.ok(manifest.short_name.length <= 12, 'short_name ≤ 12 characters');
  assert.ok(manifest.description.length <= 132, 'description ≤ 132 characters');
});

test('icons: 16, 32, 48 and 128 px PNGs at the declared sizes', () => {
  assert.deepEqual(Object.keys(manifest.icons), ['16', '32', '48', '128']);
  for (const [size, file] of Object.entries(manifest.icons)) {
    const png = readFileSync(join(EXT, file));
    assert.equal(png.toString('ascii', 1, 4), 'PNG', file);
    assert.equal(png.readUInt32BE(16), Number(size), `${file} width`);
    assert.equal(png.readUInt32BE(20), Number(size), `${file} height`);
  }
});
