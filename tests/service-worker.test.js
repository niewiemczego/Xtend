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

// Real MediaItems from the captured GraphQL responses
const video = JSON.parse(JSON.stringify(extractFromGraphQL(api('TweetResultByRestId'))[0]));
const gif = JSON.parse(
  JSON.stringify(extractFromGraphQL(api('HomeTimeline')).find((i) => i.kind === 'gif')),
);
const detailItems = extractFromGraphQL(api('TweetDetail'));
const jpgPhoto = JSON.parse(JSON.stringify(detailItems.find((i) => i.kind === 'photo' && i.url.includes('format=jpg'))));
const pngPhoto = JSON.parse(JSON.stringify(detailItems.find((i) => i.kind === 'photo' && i.url.includes('format=png'))));

describe('buildFilename', () => {
  const { worker } = loadWorker();

  test('post ID + media ID', () => {
    assert.equal(worker.buildFilename(video), 'xtend_2125654411900760238_2125654023743102976.mp4');
  });

  test('GIFs are marked', () => {
    assert.equal(worker.buildFilename(gif), `xtend_${gif.tweetId}_${gif.mediaId}_gif.mp4`);
  });

  test('photos use the image format from the URL', () => {
    assert.equal(worker.buildFilename(jpgPhoto), `xtend_${jpgPhoto.tweetId}_${jpgPhoto.mediaId}.jpg`);
    assert.equal(worker.buildFilename(pngPhoto), 'xtend_2124066362058273249_2124066322879315969.png');
    assert.equal(
      worker.buildFilename({ ...jpgPhoto, url: 'https://pbs.twimg.com/media/HX8nO9yW8AE_59M?name=orig' }),
      `xtend_${jpgPhoto.tweetId}_${jpgPhoto.mediaId}.jpg`,
    );
  });

  test('works without a media ID', () => {
    assert.equal(worker.buildFilename({ ...video, mediaId: null }), 'xtend_2125654411900760238.mp4');
    assert.equal(worker.buildFilename({ ...pngPhoto, mediaId: null }), 'xtend_2124066362058273249.png');
  });
});

describe('download message', () => {
  test('downloads the MP4 under the built file name', async () => {
    const { send, downloads } = loadWorker();
    const reply = await send({ type: 'xtend:download', media: video });
    assert.equal(reply.ok, true);
    assert.equal(reply.filename, 'xtend_2125654411900760238_2125654023743102976.mp4');
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].url, video.url);
    assert.equal(downloads[0].conflictAction, 'uniquify');
  });

  test('downloads an original-quality photo from pbs.twimg.com', async () => {
    const { send, downloads } = loadWorker();
    const reply = await send({ type: 'xtend:download', media: pngPhoto });
    assert.equal(reply.ok, true);
    assert.equal(reply.filename, 'xtend_2124066362058273249_2124066322879315969.png');
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].url, pngPhoto.url);
    assert.equal(downloads[0].conflictAction, 'uniquify');
  });

  test('works when chrome.downloads.download returns a promise', async () => {
    const { send, downloads } = loadWorker('promise');
    const reply = await send({ type: 'xtend:download', media: video });
    assert.equal(reply.ok, true);
    assert.equal(downloads.length, 1);
  });

  test('reports a failed download', async () => {
    const { send } = loadWorker('error');
    const reply = await send({ type: 'xtend:download', media: video });
    assert.deepEqual(JSON.parse(JSON.stringify(reply)), { ok: false, error: 'Download blocked' });
  });

  test('accepts content scripts on twitter.com too (sender without origin)', async () => {
    const { send } = loadWorker();
    const reply = await send({ type: 'xtend:download', media: video }, { id: EXTENSION_ID, url: 'https://twitter.com/home' });
    assert.equal(reply.ok, true);
  });

  test('logs nothing unless the message asks for debug output', async () => {
    const quiet = loadWorker();
    await quiet.send({ type: 'xtend:download', media: video });
    assert.deepEqual(quiet.logs, []);

    const verbose = loadWorker();
    await verbose.send({ type: 'xtend:download', media: video, debug: true });
    assert.ok(verbose.logs.length >= 2, verbose.logs.join('\n'));
    assert.ok(verbose.logs.every((line) => line.startsWith('[xtend]')));
  });

  test('answers a ping right away', async () => {
    const { send } = loadWorker();
    assert.deepEqual(JSON.parse(JSON.stringify(await send({ type: 'xtend:ping' }))), { ok: true });
  });

  test("gives up when the browser never answers chrome.downloads", async () => {
    const { send, downloads } = loadWorker('hang');
    const reply = await send({ type: 'xtend:download', media: video });
    assert.equal(downloads.length, 1);
    assert.equal(reply.ok, false);
    assert.match(reply.error, /did not start the download/);
  });

  test('reports a browser without chrome.downloads', async () => {
    const { send } = loadWorker('missing');
    const reply = await send({ type: 'xtend:download', media: video });
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
    ['a non-twimg video URL', fromX, { ...video, url: 'https://evil.example/a.mp4' }, 'not a video.twimg.com URL'],
    ['plain http video', fromX, { ...video, url: 'http://video.twimg.com/a.mp4' }, 'not a video.twimg.com URL'],
    ['pbs URL passed as video', fromX, { ...video, url: jpgPhoto.url }, 'not a video.twimg.com URL'],
    ['a non-twimg photo URL', fromX, { ...jpgPhoto, url: 'https://evil.example/media/a.jpg' }, 'not a pbs.twimg.com URL'],
    ['plain http photo', fromX, { ...jpgPhoto, url: 'http://pbs.twimg.com/media/a.jpg' }, 'not a pbs.twimg.com URL'],
    ['pbs non-media path (avatar)', fromX, { ...jpgPhoto, url: 'https://pbs.twimg.com/profile_images/1/a.jpg' }, 'not a pbs.twimg.com URL'],
    ['pbs path traversal', fromX, { ...jpgPhoto, url: 'https://pbs.twimg.com/media/../profile_images/1.jpg' }, 'not a pbs.twimg.com URL'],
    ['bad media kind', fromX, { ...video, kind: 'audio' }, 'bad media kind'],
    ['a bad post ID', fromX, { ...video, tweetId: '../../etc' }, 'bad post ID'],
    ['a bad media ID', fromX, { ...video, mediaId: 'x/y' }, 'bad media ID'],
    ['no media', fromX, undefined, 'no media'],
  ];
  for (const [name, sender, m, error] of cases) {
    test(name, async () => {
      const { send, downloads } = loadWorker();
      const reply = await send({ type: 'xtend:download', media: m }, sender);
      assert.equal(reply.ok, false);
      assert.equal(reply.error, error);
      assert.equal(downloads.length, 0);
    });
  }
});
