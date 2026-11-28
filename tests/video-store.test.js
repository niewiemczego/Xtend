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

const mediaMessage = (items) => ({ source: 'xtend', type: 'media', items });

describe('video store – messages', () => {
  test('stores the videos, GIFs and photos from an interceptor message', () => {
    const win = storeWindow();
    message(win, mediaMessage(extractFromGraphQL(api('HomeTimeline'))));
    assert.equal(win.Xtend.videoStore.size, 42);
  });

  test('ignores messages from other windows, origins or senders', () => {
    const win = storeWindow();
    const items = extractFromGraphQL(api('TweetResultByRestId'));
    message(win, mediaMessage(items), { source: {} });
    message(win, mediaMessage(items), { origin: 'https://evil.example' });
    message(win, { source: 'other', type: 'media', items });
    message(win, { source: 'xtend', type: 'other', items });
    message(win, 'xtend');
    message(win, null);
    assert.equal(win.Xtend.videoStore.size, 0);
  });

  test('listen() is idempotent', () => {
    const win = storeWindow();
    win.Xtend.videoStore.listen();
    message(win, mediaMessage(extractFromGraphQL(api('TweetResultByRestId'))));
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

  test('by photo key', () => {
    const item = plain(store.byPhotoKey('HX_vJtRb0AA5o0a'));
    assert.equal(item.tweetId, '2125680501612843064');
    assert.equal(item.mediaId, '2125680499192745984');
    assert.equal(item.kind, 'photo');
    assert.equal(item.url, 'https://pbs.twimg.com/media/HX_vJtRb0AA5o0a?format=jpg&name=orig');
    assert.equal(store.byPhotoKey('nonexistent'), null);
  });

  test('by tweet ID', () => {
    assert.equal(store.byTweetId('2125649159302549531').length, 1);
    assert.equal(store.byTweetId('2125676161749414130').length, 0); // quoting post has no own media
    assert.equal(store.byTweetId('2125628271337554117').length, 2); // multi-photo post
  });

  test('byTweetId returns a copy', () => {
    store.byTweetId('2125649159302549531').pop();
    assert.equal(store.byTweetId('2125649159302549531').length, 1);
  });
});

describe('video store – validation', () => {
  const good = plain(extractFromGraphQL(api('TweetResultByRestId'))[0]);
  const goodPhoto = plain(extractFromGraphQL(api('TweetDetail')).find((i) => i.kind === 'photo'));

  test('rejects anything that is not a valid twimg video or photo with numeric IDs', () => {
    const store = storeWindow().Xtend.videoStore;
    const bad = [
      { ...good, url: 'https://evil.example/video.mp4' },
      { ...good, url: 'http://video.twimg.com/a.mp4' },
      { ...good, url: goodPhoto.url }, // photo URL with kind=video
      { ...goodPhoto, url: good.url }, // video URL with kind=photo
      { ...goodPhoto, url: 'https://pbs.twimg.com/profile_images/1/a.jpg' },
      { ...goodPhoto, url: 'https://pbs.twimg.com/media/../profile_images/1.jpg' },
      { ...goodPhoto, url: 'http://pbs.twimg.com/media/HX8nO9yW8AE_59M?format=jpg&name=orig' },
      { ...good, tweetId: 'abc' },
      { ...good, tweetId: 123 },
      { ...good, mediaId: '12x' },
      { ...good, kind: 'audio' },
      null,
      'video',
    ];
    assert.equal(store.add(bad), 0);
    assert.equal(store.add('not a list'), 0);
    assert.equal(store.size, 0);
  });

  test('accepts valid photos', () => {
    const store = storeWindow().Xtend.videoStore;
    assert.equal(store.add([goodPhoto]), 1);
    assert.equal(store.byMediaId(goodPhoto.mediaId).kind, 'photo');
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

  test('a repeat fills in a missing allowDownload or mediaId', () => {
    const store = storeWindow().Xtend.videoStore;
    assert.equal(store.add([{ ...good, allowDownload: null }]), 1);
    assert.equal(store.add([{ ...good, allowDownload: false }]), 0);
    assert.equal(store.byMediaId(good.mediaId).allowDownload, false);
    assert.equal(store.add([{ ...good, allowDownload: true }]), 0);
    assert.equal(store.byMediaId(good.mediaId).allowDownload, false);

    assert.equal(store.add([{ ...goodPhoto, mediaId: null, allowDownload: null }]), 1);
    assert.equal(store.add([goodPhoto]), 0);
    assert.equal(store.byMediaId(goodPhoto.mediaId).mediaId, goodPhoto.mediaId);
  });
});

describe('video store – size cap', () => {
  test(`drops the oldest items beyond MAX_ITEMS`, () => {
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
    // Page world + the store. main.js (which also starts the DOM observer) is covered by
    // the browser tests; here the listener is started the same way main.js does it.
    load(win, 'shared/video-media.js', 'page/interceptor.js', 'content/video-store.js');
    win.Xtend.videoStore.listen();
    await win.fetch('https://x.com/i/api/graphql/abc/HomeTimeline');
    await flush();
    assert.equal(win.Xtend.videoStore.size, 42);
    assert.equal(plain(win.Xtend.videoStore.byTweetId('2125550295115522064'))[0].kind, 'gif');
    assert.equal(plain(win.Xtend.videoStore.byPhotoKey('HX_vJtRb0AA5o0a')).kind, 'photo');
  });
});
