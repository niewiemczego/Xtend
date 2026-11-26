// Run with: node --test
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { createWindow, load, flush, plain, ORIGIN } = require('./helpers/fake-window.js');
const { extractFromGraphQL } = require('../extension/shared/video-media.js');

const api = (name) => require(join(__dirname, 'fixtures', 'api', `${name}.json`));

function storeWindow() {
  const win = load(createWindow(), 'content/video-store.js');
  win.Xtend.videoStore.listen();
  return win;
}

const message = (win, data, overrides = {}) =>
  win.dispatchEvent('message', { source: win.global, origin: ORIGIN, data, ...overrides });

const videosMessage = (items) => ({ source: 'xtend', type: 'videos', items });

describe('video store – messages', () => {
  test('stores the videos from an interceptor message', () => {
    const win = storeWindow();
    message(win, videosMessage(extractFromGraphQL(api('HomeTimeline'))));
    assert.equal(win.Xtend.videoStore.size, 22);
  });

  test('ignores messages from other windows, origins or senders', () => {
    const win = storeWindow();
    const items = extractFromGraphQL(api('TweetResultByRestId'));
    message(win, videosMessage(items), { source: {} });
    message(win, videosMessage(items), { origin: 'https://evil.example' });
    message(win, { source: 'other', type: 'videos', items });
    message(win, { source: 'xtend', type: 'other', items });
    message(win, 'xtend');
    message(win, null);
    assert.equal(win.Xtend.videoStore.size, 0);
  });

  test('listen() is idempotent', () => {
    const win = storeWindow();
    win.Xtend.videoStore.listen();
    message(win, videosMessage(extractFromGraphQL(api('TweetResultByRestId'))));
    assert.equal(win.Xtend.videoStore.size, 1);
  });
});

describe('video store – lookups', () => {
  const win = storeWindow();
  const store = win.Xtend.videoStore;
  store.add(extractFromGraphQL(api('HomeTimeline')));

  test('by media ID (the number in the poster URL)', () => {
    const item = plain(store.byMediaId('2064357061408825345'));
    assert.equal(item.tweetId, '2125649159302549531'); // the quoted post
    assert.match(item.url, /^https:\/\/video\.twimg\.com\//);
    assert.equal(store.byMediaId('1'), null);
  });

  test('by tweet ID', () => {
    assert.equal(store.byTweetId('2125649159302549531').length, 1);
    assert.equal(store.byTweetId('2125676161749414130').length, 0); // quoting post has no own video
  });

  test('byTweetId returns a copy', () => {
    store.byTweetId('2125649159302549531').pop();
    assert.equal(store.byTweetId('2125649159302549531').length, 1);
  });
});

describe('video store – validation', () => {
  const good = plain(extractFromGraphQL(api('TweetResultByRestId'))[0]);

  test('rejects anything that is not a twimg video with numeric IDs', () => {
    const store = storeWindow().Xtend.videoStore;
    const bad = [
      { ...good, url: 'https://evil.example/video.mp4' },
      { ...good, url: 'http://video.twimg.com/a.mp4' },
      { ...good, tweetId: 'abc' },
      { ...good, tweetId: 123 },
      { ...good, mediaId: '12x' },
      { ...good, kind: 'photo' },
      null,
      'video',
    ];
    assert.equal(store.add(bad), 0);
    assert.equal(store.add('not a list'), 0);
    assert.equal(store.size, 0);
  });

  test('keeps only known fields', () => {
    const store = storeWindow().Xtend.videoStore;
    store.add([{ ...good, extra: '<script>' }]);
    assert.deepEqual(Object.keys(store.byMediaId(good.mediaId)).sort(), [
      'allowDownload',
      'bitrate',
      'kind',
      'mediaId',
      'tweetId',
      'url',
    ]);
  });

  test('a repeat only fills in a missing allowDownload', () => {
    const store = storeWindow().Xtend.videoStore;
    assert.equal(store.add([{ ...good, allowDownload: null }]), 1);
    assert.equal(store.add([{ ...good, allowDownload: false }]), 0);
    assert.equal(store.byMediaId(good.mediaId).allowDownload, false);
    assert.equal(store.add([{ ...good, allowDownload: true }]), 0);
    assert.equal(store.byMediaId(good.mediaId).allowDownload, false);
  });
});

describe('video store – size cap', () => {
  test(`drops the oldest videos beyond MAX_ITEMS`, () => {
    const store = storeWindow().Xtend.videoStore;
    const max = store.MAX_ITEMS;
    const items = Array.from({ length: max + 10 }, (_, i) => ({
      tweetId: String(1000 + i),
      mediaId: String(5000 + i),
      url: `https://video.twimg.com/amplify_video/${5000 + i}/vid/a.mp4`,
      bitrate: 1,
      kind: 'video',
      allowDownload: null,
    }));
    store.add(items);
    assert.equal(store.size, max);
    assert.equal(store.byMediaId('5000'), null);
    assert.equal(store.byTweetId('1000').length, 0);
    assert.notEqual(store.byMediaId(String(5000 + max + 9)), null);
  });
});

describe('end to end: interceptor → postMessage → store', () => {
  test('a HomeTimeline response fills the store', async () => {
    const win = createWindow({
      deliverMessages: true,
      fetch: async () => ({ ok: true, clone: () => ({ json: async () => api('HomeTimeline') }) }),
    });
    load(
      win,
      'shared/video-media.js',
      'page/interceptor.js',
      'content/selectors.js',
      'content/post.js',
      'content/video-store.js',
      'content/video-resolver.js',
      'content/download-button.js',
      'content/share-menu.js',
      'content/main.js',
    );
    await win.fetch('https://x.com/i/api/graphql/abc/HomeTimeline');
    await flush();
    assert.equal(win.Xtend.videoStore.size, 22);
    assert.equal(plain(win.Xtend.videoStore.byTweetId('2125550295115522064'))[0].kind, 'gif');
  });
});
