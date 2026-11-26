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

  test('resolvePost: a post without video resolves to nothing', async () => {
    store.clear();
    const doc = await fixtures('post-no-video.html');
    const post = Xtend.post.findPost(Xtend.post.findActionBars(doc)[0]);
    assert.deepEqual(R.resolvePost(post, { pathname: '/home' }), { items: [], missing: 0 });
  });
}
