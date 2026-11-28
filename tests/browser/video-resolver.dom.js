// DOM tests for extension/content/video-resolver.js.
//
// The HTML and JSON captures come from different posts, so the store is seeded with real
// VideoItems from the captured TweetResultByRestId response, re-keyed to the post and media
// IDs found in each HTML fixture. (A matching HTML + JSON pair from one page is on #2.)
/* global test, assert, fixtures, Xtend, XtendVideoMedia */

// isolated scope: test files share the page's global scope
{
  const R = Xtend.videoResolver;
  const store = Xtend.videoStore;

  let template = null;

  /** A real VideoItem (from the API capture) with the given IDs. */
  async function videoItem(tweetId, mediaId, extra = {}) {
    if (!template) {
      const json = await (await fetch('../fixtures/api/TweetResultByRestId.json')).json();
      template = XtendVideoMedia.extractFromGraphQL(json)[0];
    }
    const url = template.url.replace(/amplify_video\/\d+\//, `amplify_video/${mediaId || '1'}/`);
    return { ...template, tweetId, mediaId, url, ...extra };
  }

  async function postOf(name) {
    const doc = await fixtures(name);
    const [bar] = Xtend.post.findActionBars(doc);
    const post = Xtend.post.findPost(bar);
    return { post, video: Xtend.post.videosOf(post)[0] };
  }

  const TIMELINE = { tweetId: '2125387364696756699', mediaId: '2125387308996468736' };
  const QUOTE = { outer: '2125584099888828497', quoted: '2125224655359197191', mediaId: '2125224005795717120' };
  const GIF = { tweetId: '2125376722317287862', url: 'https://video.twimg.com/tweet_video/HX7auBYXIAA1xX0.mp4' };

  test('resolver: video found by the media ID in its poster', async () => {
    store.clear();
    const item = await videoItem(TIMELINE.tweetId, TIMELINE.mediaId);
    store.add([item, await videoItem('1', '2')]);
    const { video } = await postOf('post-original-timeline.html');
    const found = R.resolveVideo(video, { pathname: '/home' });
    assert.equal(found && found.url, item.url);
  });

  test('resolver: falls back to the post ID when the media ID is unknown', async () => {
    store.clear();
    const item = await videoItem(TIMELINE.tweetId, '999');
    store.add([item]);
    const { video } = await postOf('post-original-timeline.html');
    assert.equal(R.resolveVideo(video, { pathname: '/home' }).url, item.url);
  });

  test('resolver: status page uses the post ID from the URL', async () => {
    store.clear();
    const item = await videoItem(TIMELINE.tweetId, '999');
    store.add([item]);
    const { video } = await postOf('post-original-status.html');
    assert.equal(R.resolveVideo(video, { pathname: `/DrewPavlou/status/${TIMELINE.tweetId}` }).url, item.url);
    assert.equal(R.resolveVideo(video, { pathname: '/home' }), null, 'no ID without the URL');
  });

  test('resolver: a quoted video is looked up under the quoted post', async () => {
    store.clear();
    const outer = await videoItem(QUOTE.outer, '111');
    const quoted = await videoItem(QUOTE.quoted, '222'); // media ID deliberately unknown
    store.add([outer, quoted]);
    const { video } = await postOf('post-quote.html');
    assert.equal(R.resolveVideo(video, { pathname: '/home' }).tweetId, QUOTE.quoted);
  });

  test('resolver: GIF uses its direct MP4 even when the store knows nothing', async () => {
    store.clear();
    const { video } = await postOf('post-original-timeline-gif.html');
    const found = R.resolveVideo(video, { pathname: '/home' });
    assert.deepEqual(
      { tweetId: found.tweetId, url: found.url, kind: found.kind, mediaId: found.mediaId },
      { tweetId: GIF.tweetId, url: GIF.url, kind: 'gif', mediaId: null },
    );
  });

  test("resolver: GIF prefers the store's copy (media ID, allowDownload)", async () => {
    store.clear();
    store.add([
      { tweetId: GIF.tweetId, mediaId: '2125376700000000000', url: GIF.url, bitrate: 0, kind: 'gif', allowDownload: false },
    ]);
    const { video } = await postOf('post-original-timeline-gif.html');
    const found = R.resolveVideo(video, { pathname: '/home' });
    assert.equal(found.mediaId, '2125376700000000000');
    assert.equal(found.allowDownload, false);
  });

  test('resolver: allowDownload is passed through', async () => {
    store.clear();
    store.add([await videoItem(TIMELINE.tweetId, TIMELINE.mediaId, { allowDownload: false })]);
    const { video } = await postOf('post-original-timeline.html');
    assert.equal(R.resolveVideo(video, { pathname: '/home' }).allowDownload, false);
  });

  test('resolver: nothing loaded yet → null', async () => {
    store.clear();
    const { video } = await postOf('post-original-timeline.html');
    assert.equal(R.resolveVideo(video, { pathname: '/home' }), null);
    assert.equal(R.resolveVideo(null), null);
  });

  test('resolvePost: items and the number of videos still missing', async () => {
    store.clear();
    const { post } = await postOf('post-quote.html');
    assert.deepEqual(R.resolvePost(post, { pathname: '/home' }), { items: [], missing: 1 });

    const quoted = await videoItem(QUOTE.quoted, QUOTE.mediaId);
    store.add([quoted]);
    const result = R.resolvePost(post, { pathname: '/home' });
    assert.equal(result.missing, 0);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].url, quoted.url);
  });

  test('resolvePost: a post without video or photo resolves to nothing', async () => {
    store.clear();
    const doc = await fixtures('post-no-video.html');
    const post = Xtend.post.findPost(Xtend.post.findActionBars(doc)[0]);
    assert.deepEqual(R.resolvePost(post, { pathname: '/home' }), { items: [], missing: 0 });
  });

  // --- photos ------------------------------------------------------------------------

  const PHOTO = {
    tweetId: '2125512480285978812',
    mediaId: '2125512475000000000',
    key: 'HX9WU9tWoAAIVEL',
    origUrl: 'https://pbs.twimg.com/media/HX9WU9tWoAAIVEL?format=jpg&name=orig',
  };

  test('resolver: photo prefers the store copy (mediaId, original format, allowDownload)', async () => {
    store.clear();
    const pngOrig = `https://pbs.twimg.com/media/${PHOTO.key}?format=png&name=orig`;
    store.add([
      {
        tweetId: PHOTO.tweetId,
        mediaId: PHOTO.mediaId,
        url: pngOrig,
        bitrate: 0,
        kind: 'photo',
        allowDownload: false,
      },
    ]);
    const { post } = await postOf('post-no-video-with-image.html');
    const img = Xtend.post.photosOf(post)[0];
    const found = R.resolvePhoto(img, { pathname: '/home' });
    assert.equal(found.mediaId, PHOTO.mediaId);
    assert.equal(found.url, pngOrig); // GraphQL original PNG beats DOM format=jpg
    assert.equal(found.allowDownload, false);
  });

  test('resolver: photo falls back to direct name=orig when the store is empty', async () => {
    store.clear();
    const { post } = await postOf('post-no-video-with-image.html');
    const found = R.resolvePhoto(Xtend.post.photosOf(post)[0], { pathname: '/home' });
    assert.deepEqual(
      { tweetId: found.tweetId, mediaId: found.mediaId, url: found.url, kind: found.kind },
      { tweetId: PHOTO.tweetId, mediaId: null, url: PHOTO.origUrl, kind: 'photo' },
    );
  });

  test('resolvePost: filters by kind (video vs photo)', async () => {
    store.clear();
    const { post } = await postOf('post-no-video-with-image.html');
    assert.equal(R.resolvePost(post, { pathname: '/home', kind: 'video' }).items.length, 0);
    const photos = R.resolvePost(post, { pathname: '/home', kind: 'photo' });
    assert.equal(photos.missing, 0);
    assert.equal(photos.items.length, 1);
    assert.equal(photos.items[0].url, PHOTO.origUrl);
  });

  // --- photos X sent but doesn't show (quote card on the home timeline) ---------------------

  /** A photo MediaItem of the photo post's tweet, with the given key. */
  function photoOf(key, mediaId, format = 'jpg') {
    return {
      tweetId: PHOTO.tweetId,
      mediaId,
      url: `https://pbs.twimg.com/media/${key}?format=${format}&name=orig`,
      bitrate: 0,
      kind: 'photo',
      allowDownload: true,
    };
  }

  test('resolvePost: adds the photos the store has but the page shows only one of', async () => {
    store.clear();
    store.add([photoOf('HX9WU9tWoAAIVEL', '1'), photoOf('HX9WAAAAAAAAAA2', '2'), photoOf('HX9WAAAAAAAAAA3', '3')]);
    const { post } = await postOf('post-no-video-with-image.html');
    assert.equal(Xtend.post.photosOf(post).length, 1, 'the fixture shows one photo');
    const { items, missing } = R.resolvePost(post, { pathname: '/home', kind: 'photo' });
    assert.equal(missing, 0);
    assert.deepEqual(items.map((i) => i.mediaId), ['1', '2', '3']);
  });

  test('resolvePost: a photo is added once, even when the store has it in another format', async () => {
    store.clear();
    const { post } = await postOf('post-no-video-with-image.html');
    // the page's photo resolves to its direct name=orig URL first (store empty) …
    assert.equal(R.resolvePost(post, { pathname: '/home', kind: 'photo' }).items.length, 1);
    // … and the store's copy of the same photo (other format) is not added again
    store.add([photoOf('HX9WU9tWoAAIVEL', '1', 'png')]);
    const { items } = R.resolvePost(post, { pathname: '/home', kind: 'photo' });
    assert.equal(items.length, 1);
  });

  test("resolvePost: photos of other posts in the store aren't added", async () => {
    store.clear();
    store.add([photoOf('HX9WU9tWoAAIVEL', '1'), { ...photoOf('HX9WAAAAAAAAAA2', '2'), tweetId: '1' }]);
    const { post } = await postOf('post-no-video-with-image.html');
    const { items } = R.resolvePost(post, { pathname: '/home', kind: 'photo' });
    assert.deepEqual(items.map((i) => i.mediaId), ['1']);
  });

  test('resolvePost: videos are not added from the store by the photo top-up', async () => {
    store.clear();
    store.add([photoOf('HX9WU9tWoAAIVEL', '1'), await videoItem(PHOTO.tweetId, '9')]);
    const { post } = await postOf('post-no-video-with-image.html');
    const { items } = R.resolvePost(post, { pathname: '/home', kind: 'photo' });
    assert.deepEqual(items.map((i) => i.kind), ['photo']);
  });
}
