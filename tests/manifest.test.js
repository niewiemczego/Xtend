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
const styles = manifest.content_scripts.flatMap((cs) => cs.css || []);

test('is Manifest V3', () => {
  assert.equal(manifest.manifest_version, 3);
});

test('every file referenced by the manifest exists', () => {
  for (const file of [...scripts, ...styles]) {
    assert.ok(existsSync(join(EXT, file)), `missing: ${file}`);
  }
});

test('every script is valid JavaScript', () => {
  for (const file of scripts) {
    const code = readFileSync(join(EXT, file), 'utf8');
    assert.doesNotThrow(() => new vm.Script(code, { filename: file }), file);
  }
});

test('interceptor runs in the MAIN world at document_start, after video-media.js', () => {
  const page = manifest.content_scripts.find((cs) => cs.world === 'MAIN');
  assert.equal(page.run_at, 'document_start');
  assert.deepEqual(page.js, ['shared/video-media.js', 'page/interceptor.js']);
});

test('content/main.js is loaded last', () => {
  const content = manifest.content_scripts.find((cs) => cs.world !== 'MAIN');
  assert.equal(content.js.at(-1), 'content/main.js');
});

test('permissions stay minimal', () => {
  assert.deepEqual(manifest.permissions, ['downloads']);
  assert.deepEqual(manifest.host_permissions, ['https://cdn.syndication.twimg.com/*']);
});
