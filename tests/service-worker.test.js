// Run with: node --test
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { extractFromGraphQL } = require('../extension/shared/video-media.js');

const SW = readFileSync(join(__dirname, '..', 'extension', 'background', 'service-worker.js'), 'utf8');
const api = (name) => require(join(__dirname, 'fixtures', 'api', `${name}.json`));

const EXTENSION_ID = 'xtend-test-id';
const fromX = { id: EXTENSION_ID, url: 'https://x.com/home', origin: 'https://x.com' };

/**
 * Loads the service worker with a fake `chrome`.
 * @param {'callback'|'promise'|'error'|'hang'|'missing'} mode how chrome.downloads.download behaves
 */
function loadWorker(mode = 'callback') {
  const downloads = [];
  const listeners = [];
  const chrome = {
    runtime: {
      id: EXTENSION_ID,
      lastError: undefined,
      onMessage: { addListener: (fn) => listeners.push(fn) },
    },
    downloads: {
      download(options, callback) {
        downloads.push(options);
        if (mode === 'hang') return undefined; // never answers
        if (mode === 'promise') return Promise.resolve(downloads.length);
        if (mode === 'error') {
          chrome.runtime.lastError = { message: 'Download blocked' };
          callback(undefined);
          chrome.runtime.lastError = undefined;
          return undefined;
        }
        callback(downloads.length);
        return undefined;
      },
    },
  };
  if (mode === 'missing') delete chrome.downloads;
  // Time limits fire right away, so 'hang' doesn't make the test wait 15 s.
  const logs = [];
  const ctx = {
    chrome,
    URL,
    console: { log: (...args) => logs.push(args.join(' ')) },
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout,
  };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(SW, ctx, { filename: 'service-worker.js' });

  /** Sends a runtime message like a content script would; resolves with the reply. */
  const send = (message, sender = fromX) =>
    new Promise((resolve) => {
      const keepOpen = listeners[0](message, sender, resolve);
      if (keepOpen !== true) resolve(undefined);
    });

  return { worker: ctx.XtendBackground, downloads, send, listeners, logs };
}

// A real VideoItem from the captured TweetResultByRestId response
const video = JSON.parse(JSON.stringify(extractFromGraphQL(api('TweetResultByRestId'))[0]));
const gif = JSON.parse(
  JSON.stringify(extractFromGraphQL(api('HomeTimeline')).find((i) => i.kind === 'gif')),
);

describe('buildFilename', () => {
  const { worker } = loadWorker();

  test('post ID + media ID', () => {
    assert.equal(worker.buildFilename(video), 'xtend_2125654411900760238_2125654023743102976.mp4');
  });

  test('GIFs are marked', () => {
    assert.equal(worker.buildFilename(gif), `xtend_${gif.tweetId}_${gif.mediaId}_gif.mp4`);
  });

  test('works without a media ID', () => {
    assert.equal(worker.buildFilename({ ...video, mediaId: null }), 'xtend_2125654411900760238.mp4');
  });
});

describe('download message', () => {
  test('downloads the MP4 under the built file name', async () => {
    const { send, downloads } = loadWorker();
    const reply = await send({ type: 'xtend:download', video });
    assert.equal(reply.ok, true);
    assert.equal(reply.filename, 'xtend_2125654411900760238_2125654023743102976.mp4');
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].url, video.url);
    assert.equal(downloads[0].conflictAction, 'uniquify');
  });

  test('works when chrome.downloads.download returns a promise', async () => {
    const { send, downloads } = loadWorker('promise');
    const reply = await send({ type: 'xtend:download', video });
    assert.equal(reply.ok, true);
    assert.equal(downloads.length, 1);
  });

  test('reports a failed download', async () => {
    const { send } = loadWorker('error');
    const reply = await send({ type: 'xtend:download', video });
    assert.deepEqual(JSON.parse(JSON.stringify(reply)), { ok: false, error: 'Download blocked' });
  });

  test('accepts content scripts on twitter.com too (sender without origin)', async () => {
    const { send } = loadWorker();
    const reply = await send({ type: 'xtend:download', video }, { id: EXTENSION_ID, url: 'https://twitter.com/home' });
    assert.equal(reply.ok, true);
  });

  test('logs nothing unless the message asks for debug output', async () => {
    const quiet = loadWorker();
    await quiet.send({ type: 'xtend:download', video });
    assert.deepEqual(quiet.logs, []);

    const verbose = loadWorker();
    await verbose.send({ type: 'xtend:download', video, debug: true });
    assert.ok(verbose.logs.length >= 2, verbose.logs.join('\n'));
    assert.ok(verbose.logs.every((line) => line.startsWith('[xtend]')));
  });

  test('answers a ping right away', async () => {
    const { send } = loadWorker();
    assert.deepEqual(JSON.parse(JSON.stringify(await send({ type: 'xtend:ping' }))), { ok: true });
  });

  test("gives up when the browser never answers chrome.downloads", async () => {
    const { send, downloads } = loadWorker('hang');
    const reply = await send({ type: 'xtend:download', video });
    assert.equal(downloads.length, 1);
    assert.equal(reply.ok, false);
    assert.match(reply.error, /did not start the download/);
  });

  test('reports a browser without chrome.downloads', async () => {
    const { send } = loadWorker('missing');
    const reply = await send({ type: 'xtend:download', video });
    assert.equal(reply.ok, false);
    assert.match(reply.error, /no chrome\.downloads/);
  });

  test('ignores other message types', async () => {
    const { send, downloads } = loadWorker();
    assert.equal(await send({ type: 'something-else' }), undefined);
    assert.equal(await send(null), undefined);
    assert.equal(downloads.length, 0);
  });
});

describe('refused requests – nothing is downloaded', () => {
  const cases = [
    ['another extension', { ...fromX, id: 'other' }, video, 'not from Xtend'],
    ['another site', { id: EXTENSION_ID, url: 'https://evil.example/', origin: 'https://evil.example' }, video, 'not from x.com'],
    ['a non-twimg URL', fromX, { ...video, url: 'https://evil.example/a.mp4' }, 'not a video.twimg.com URL'],
    ['plain http', fromX, { ...video, url: 'http://video.twimg.com/a.mp4' }, 'not a video.twimg.com URL'],
    ['a bad post ID', fromX, { ...video, tweetId: '../../etc' }, 'bad post ID'],
    ['a bad media ID', fromX, { ...video, mediaId: 'x/y' }, 'bad media ID'],
    ['no video', fromX, undefined, 'no video'],
  ];
  for (const [name, sender, v, error] of cases) {
    test(name, async () => {
      const { send, downloads } = loadWorker();
      const reply = await send({ type: 'xtend:download', video: v }, sender);
      assert.equal(reply.ok, false);
      assert.equal(reply.error, error);
      assert.equal(downloads.length, 0);
    });
  }
});
