// DOM tests for extension/content/download-button.js on the captured HTML.
/* global test, assert, fixtures, Xtend, XtendVideoMedia */

// isolated scope: test files share the page's global scope
{
  const B = Xtend.downloadButton;
  const VIDEO_FIXTURES = [
    'post-original-timeline.html',
    'post-original-status.html',
    'post-original-timeline-gif.html',
    'post-original-status-gif.html',
    'post-quote.html',
    'post-video-from-other-post.html',
  ];
  const NO_VIDEO_FIXTURES = ['post-no-video.html', 'post-no-video-with-image.html'];
  const TIMELINE = { tweetId: '2125387364696756699', mediaId: '2125387308996468736' };

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function barAndPost(name) {
    const doc = await fixtures(name);
    const bar = Xtend.post.findActionBars(doc)[0];
    return { doc, bar, post: Xtend.post.findPost(bar) };
  }

  let realItem = null;
  /** A real VideoItem (from the API capture), re-keyed to the timeline fixture's IDs. */
  async function timelineItem(extra = {}) {
    if (!realItem) {
      const json = await (await fetch('../fixtures/api/TweetResultByRestId.json')).json();
      realItem = XtendVideoMedia.extractFromGraphQL(json)[0];
    }
    return { ...realItem, tweetId: TIMELINE.tweetId, mediaId: TIMELINE.mediaId, ...extra };
  }

  /** Replaces the service-worker call for one test; returns the list of sent messages. */
  function fakeWorker(reply = (message) => ({ ok: true, filename: 'x.mp4', downloadId: 1, message })) {
    const sent = [];
    B.send = async (message) => {
      sent.push(message);
      return typeof reply === 'function' ? reply(message) : reply;
    };
    return sent;
  }

  // --- placement and look -----------------------------------------------------------------

  test('button: first in the Bookmark/Share container, right before Bookmark', async () => {
    for (const name of VIDEO_FIXTURES) {
      const { bar, post } = await barAndPost(name);
      const button = B.ensure(bar, post);
      const container = Xtend.post.shareButtonOf(bar).parentElement;
      assert.equal(container.firstElementChild, button, name);
      // Bookmark sits in its own wrapper (<div class="@max-[290px]:hidden">), Share follows it
      const next = button.nextElementSibling;
      assert.ok(next && next.querySelector('[data-engagement-action="bookmark"]'), `${name}: Bookmark right after`);
    }
  });

  test("button: X's Share button look, our icon and label, no menu wiring", async () => {
    const { bar, post } = await barAndPost('post-original-timeline.html');
    const button = B.ensure(bar, post);
    assert.ok(button.classList.contains('x-engagement-button'), 'X class kept');
    assert.ok(button.classList.contains(B.CLASS), 'our class');
    assert.ok(button.querySelector('.x-engagement-pill'), 'pill kept');
    assert.equal(button.querySelector('svg').getAttribute('viewBox'), '0 0 20 20');
    assert.equal(button.querySelector('use'), null, 'share icon replaced');
    assert.equal(button.getAttribute('aria-label'), 'Download video');
    assert.equal(button.id, '');
    assert.equal(button.getAttribute('aria-haspopup'), null);
    assert.equal(button.getAttribute('data-engagement-action'), null);
    assert.deepEqual(Array.from(button.attributes).filter((a) => a.name.startsWith('data-')).map((a) => a.name), []);
  });

  test("button: X's Share button stays untouched", async () => {
    const { bar, post } = await barAndPost('post-original-timeline.html');
    const share = Xtend.post.shareButtonOf(bar);
    const before = share.outerHTML;
    B.ensure(bar, post);
    assert.equal(share.outerHTML, before);
  });

  test('button: added once per action bar', async () => {
    const { bar, post } = await barAndPost('post-quote.html');
    const first = B.ensure(bar, post);
    assert.equal(B.ensure(bar, post), first);
    B.scan(bar.ownerDocument);
    assert.equal(bar.querySelectorAll(`.${B.CLASS}`).length, 1);
  });

  test('scan: buttons only on posts with a video or GIF', async () => {
    for (const name of VIDEO_FIXTURES) {
      const doc = await fixtures(name);
      B.scan(doc);
      assert.equal(doc.querySelectorAll(`.${B.CLASS}`).length, 1, name);
    }
    for (const name of NO_VIDEO_FIXTURES) {
      const doc = await fixtures(name);
      B.scan(doc);
      assert.equal(doc.querySelectorAll(`.${B.CLASS}`).length, 0, name);
    }
  });

  // --- clicking ---------------------------------------------------------------------------

  test('click: sends the resolved video to the service worker and shows success', async () => {
    Xtend.videoStore.clear();
    const item = await timelineItem({ allowDownload: true });
    Xtend.videoStore.add([item]);
    const sent = fakeWorker();
    const { bar, post } = await barAndPost('post-original-timeline.html');
    const button = B.ensure(bar, post);

    button.click();
    assert.ok(button.classList.contains('xtend-busy'), 'busy while downloading');
    await settle();

    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, 'xtend:download');
    assert.equal(sent[0].video.url, item.url);
    assert.equal(sent[0].video.tweetId, TIMELINE.tweetId);
    assert.ok(button.classList.contains('xtend-ok'));
    assert.equal(button.title, 'Saved');
  });

  test('click: still downloads when the author turned downloads off, and says so', async () => {
    Xtend.videoStore.clear();
    Xtend.videoStore.add([await timelineItem({ allowDownload: false })]);
    const sent = fakeWorker();
    const { bar, post } = await barAndPost('post-original-timeline.html');
    const button = B.ensure(bar, post);
    button.click();
    await settle();
    assert.equal(sent.length, 1);
    assert.ok(button.classList.contains('xtend-ok'));
    assert.ok(/author turned off downloads/.test(button.title), button.title);
  });

  test('click: video not loaded yet → error state with an explanation', async () => {
    Xtend.videoStore.clear();
    const sent = fakeWorker();
    const { bar, post } = await barAndPost('post-original-timeline.html');
    const button = B.ensure(bar, post);
    button.click();
    await settle();
    assert.equal(sent.length, 0);
    assert.ok(button.classList.contains('xtend-error'));
    assert.ok(/hasn't sent this video yet/.test(button.title), button.title);
  });

  test('click: GIF downloads from its direct MP4 even with an empty store', async () => {
    Xtend.videoStore.clear();
    const sent = fakeWorker();
    const { bar, post } = await barAndPost('post-original-timeline-gif.html');
    B.ensure(bar, post).click();
    await settle();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].video.kind, 'gif');
    assert.equal(sent[0].video.url, 'https://video.twimg.com/tweet_video/HX7auBYXIAA1xX0.mp4');
  });

  test('click: a refused or failed download shows the reason', async () => {
    Xtend.videoStore.clear();
    Xtend.videoStore.add([await timelineItem()]);
    fakeWorker({ ok: false, error: 'Download blocked' });
    const { bar, post } = await barAndPost('post-original-timeline.html');
    const button = B.ensure(bar, post);
    button.click();
    await settle();
    assert.ok(button.classList.contains('xtend-error'));
    assert.equal(button.title, 'Download blocked');
  });

  test('click: reloaded extension → ask to refresh the page', async () => {
    Xtend.videoStore.clear();
    Xtend.videoStore.add([await timelineItem()]);
    B.send = async () => {
      throw new Error('Extension context invalidated.');
    };
    const { bar, post } = await barAndPost('post-original-timeline.html');
    const button = B.ensure(bar, post);
    button.click();
    await settle();
    assert.equal(button.title, 'Xtend was updated – refresh the page.');
  });

  test('click: a second click while downloading is ignored', async () => {
    Xtend.videoStore.clear();
    Xtend.videoStore.add([await timelineItem()]);
    const sent = [];
    let finish;
    B.send = (message) => {
      sent.push(message);
      return new Promise((resolve) => (finish = () => resolve({ ok: true })));
    };
    const { bar, post } = await barAndPost('post-original-timeline.html');
    const button = B.ensure(bar, post);
    button.click();
    button.click();
    await settle();
    assert.equal(sent.length, 1);
    finish();
    await settle();
    assert.ok(button.classList.contains('xtend-ok'));
  });

  test('click: does not reach the post (which would open it)', async () => {
    Xtend.videoStore.clear();
    Xtend.videoStore.add([await timelineItem()]);
    fakeWorker();
    const { doc, bar, post } = await barAndPost('post-original-timeline.html');
    const button = B.ensure(bar, post);
    const root = doc.querySelector(Xtend.selectors.postLink);
    const reached = [];
    for (const type of ['click', 'pointerdown', 'mousedown', 'mouseup', 'keydown']) {
      root.addEventListener(type, () => reached.push(type));
    }
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'keydown']) {
      button.dispatchEvent(new Event(type, { bubbles: true }));
    }
    button.click();
    await settle();
    assert.deepEqual(reached, []);
  });
}
