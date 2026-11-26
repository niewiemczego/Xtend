// DOM tests for extension/content/selectors.js and post.js on the captured HTML.
/* global test, assert, fixtures, Xtend */

// isolated scope: test files share the page's global scope
{
  const P = Xtend.post;

  const VIDEO_POSTS = {
    'post-original-timeline.html': { tweetId: '2125387364696756699', mediaId: '2125387308996468736' },
    'post-original-status.html': { tweetId: null, mediaId: '2125387308996468736' }, // ID only in the URL
    'post-original-timeline-gif.html': { tweetId: '2125376722317287862', mediaId: null },
    'post-original-status-gif.html': { tweetId: null, mediaId: null },
    'post-quote.html': { tweetId: '2125584099888828497', mediaId: '2125224005795717120' },
    'post-video-from-other-post.html': { tweetId: '2125716156392632370', mediaId: '2125138957461598208' },
  };
  const NO_VIDEO_POSTS = ['post-no-video.html', 'post-no-video-with-image.html'];
  const ALL_POSTS = [...Object.keys(VIDEO_POSTS), ...NO_VIDEO_POSTS];

  /** The only post of a single-post fixture, via its action bar. */
  async function onlyPost(name) {
    const doc = await fixtures(name);
    const bars = P.findActionBars(doc);
    assert.equal(bars.length, 1, `${name}: action bars`);
    return { doc, bar: bars[0], post: P.findPost(bars[0]) };
  }

  // --- selectors ----------------------------------------------------------------

  test('selectors do not rely on data-testid (X removed it)', () => {
    for (const selector of Object.values(Xtend.selectors)) {
      assert.ok(!selector.includes('data-testid'), selector);
    }
  });

  // --- action bar and post --------------------------------------------------------

  test('every post has exactly one action bar – the seek slider group is skipped', async () => {
    for (const name of ALL_POSTS) {
      const doc = await fixtures(name);
      const groups = doc.querySelectorAll(Xtend.selectors.group).length;
      assert.equal(P.findActionBars(doc).length, 1, `${name} (${groups} role=group)`);
    }
  });

  test('findPost returns the <article> that holds the action bar', async () => {
    for (const name of ALL_POSTS) {
      const { bar, post } = await onlyPost(name);
      assert.equal(post && post.tagName, 'ARTICLE', name);
      assert.ok(post.contains(bar), name);
    }
  });

  test('quote: the post is the outer article, not the quoted one', async () => {
    const { post } = await onlyPost('post-quote.html');
    assert.equal(P.tweetIdOf(post), '2125584099888828497');
    assert.equal(post.querySelectorAll('article').length, 1, 'one nested (quoted) article');
  });

  // --- tweet IDs --------------------------------------------------------------------

  test('tweetIdOf(post) reads the data-href of the timeline post', async () => {
    for (const [name, expected] of Object.entries(VIDEO_POSTS)) {
      const { post } = await onlyPost(name);
      assert.equal(P.tweetIdOf(post, { pathname: '/home' }), expected.tweetId, name);
    }
  });

  test('status page: the post ID comes from the page URL', async () => {
    const { post } = await onlyPost('post-original-status.html');
    assert.equal(P.tweetIdOf(post, { pathname: '/DrewPavlou/status/2125387364696756699' }), '2125387364696756699');
    assert.equal(P.tweetIdOf(post, { pathname: '/DrewPavlou/status/2125387364696756699/analytics' }), '2125387364696756699');
    assert.equal(P.tweetIdOf(post, { pathname: '/home' }), null);
  });

  test('quote: the video belongs to the quoted post', async () => {
    const { post } = await onlyPost('post-quote.html');
    const [video] = P.videosOf(post);
    assert.equal(P.tweetIdOf(video), '2125224655359197191');
  });

  test('video from another post: the video sits in the showing post', async () => {
    const { post } = await onlyPost('post-video-from-other-post.html');
    const [video] = P.videosOf(post);
    assert.equal(P.tweetIdOf(video), '2125716156392632370');
  });

  // --- videos ------------------------------------------------------------------------

  test('hasVideo: true for video and GIF posts, false otherwise', async () => {
    for (const name of Object.keys(VIDEO_POSTS)) {
      const { post } = await onlyPost(name);
      assert.equal(P.hasVideo(post), true, name);
      assert.equal(P.videosOf(post).length, 1, name);
    }
    for (const name of NO_VIDEO_POSTS) {
      const { post } = await onlyPost(name);
      assert.equal(P.hasVideo(post), false, name);
    }
    assert.equal(P.hasVideo(null), false);
  });

  test('mediaIdOf reads the poster; GIFs have none', async () => {
    for (const [name, expected] of Object.entries(VIDEO_POSTS)) {
      const { post } = await onlyPost(name);
      assert.equal(P.mediaIdOf(P.videosOf(post)[0]), expected.mediaId, name);
    }
  });

  test('directMp4Of: GIFs play a direct MP4, videos a blob: URL', async () => {
    const gif = (await onlyPost('post-original-timeline-gif.html')).post;
    assert.equal(P.directMp4Of(P.videosOf(gif)[0]), 'https://video.twimg.com/tweet_video/HX7auBYXIAA1xX0.mp4');
    const video = (await onlyPost('post-original-timeline.html')).post;
    assert.equal(P.directMp4Of(P.videosOf(video)[0]), null);
  });

  // --- Share button and menu ---------------------------------------------------------

  test('every action bar has a Share button', async () => {
    for (const name of ALL_POSTS) {
      const { bar } = await onlyPost(name);
      const share = P.shareButtonOf(bar);
      assert.ok(share, name);
      assert.equal(share.getAttribute('aria-haspopup'), 'menu', name);
    }
  });

  test('Share menu fixture: 5 items, X\'s own "Download video" is last', async () => {
    const doc = await fixtures('share-menu-original.html');
    const menus = doc.querySelectorAll(Xtend.selectors.menu);
    assert.equal(menus.length, 1);
    const items = Array.from(menus[0].querySelectorAll(Xtend.selectors.menuItem)).map((i) => i.textContent.trim());
    assert.deepEqual(items, ['Send via Chat', 'Copy link', 'Share post via …', 'Post video', 'Download video']);
  });

  test('postForMenu finds the post through aria-labelledby → Share button', async () => {
    const doc = await fixtures('post-original-timeline.html', 'share-menu-original.html');
    const menu = doc.querySelector(Xtend.selectors.menu);
    const [bar] = P.findActionBars(doc);

    // The two captures come from different page loads, so link them the way X does.
    P.shareButtonOf(bar).id = menu.getAttribute('aria-labelledby');
    const post = P.postForMenu(menu);
    assert.ok(post, 'post found');
    assert.equal(P.tweetIdOf(post), '2125387364696756699');
  });

  test('postForMenu returns null when the trigger is not a Share button or missing', async () => {
    const doc = await fixtures('post-original-timeline.html', 'share-menu-original.html');
    const menu = doc.querySelector(Xtend.selectors.menu);
    assert.equal(P.postForMenu(menu), null, 'no element with that id');
    const [bar] = P.findActionBars(doc);
    bar.querySelector('[data-engagement-action="like"]').id = menu.getAttribute('aria-labelledby');
    assert.equal(P.postForMenu(menu), null, 'trigger is the like button');
    assert.equal(P.postForMenu(null), null);
  });
}
