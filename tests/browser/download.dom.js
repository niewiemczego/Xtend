// DOM tests for extension/content/download.js on the captured HTML.
/* global test, assert, fixtures, Xtend, XtendVideoMedia */

// isolated scope: test files share the page's global scope
{
  const D = Xtend.download;
  const TIMELINE = { tweetId: '2125387364696756699', mediaId: '2125387308996468736' };

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  let realItem = null;
  /** A real VideoItem (from the API capture), re-keyed to the timeline fixture's IDs. */
  async function timelineItem(extra = {}) {
    if (!realItem) {
      const json = await (await fetch('../fixtures/api/TweetResultByRestId.json')).json();
      realItem = XtendVideoMedia.extractFromGraphQL(json)[0];
    }
    return { ...realItem, tweetId: TIMELINE.tweetId, mediaId: TIMELINE.mediaId, ...extra };
  }

  /** Replaces the service-worker call; pings get { ok: true }. Returns the download messages. */
  function fakeWorker(reply = { ok: true, filename: 'x.mp4', downloadId: 1 }) {
    const sent = [];
    D.send = async (message) => {
      if (message.type === 'xtend:ping') return { ok: true };
      sent.push(message);
      return typeof reply === 'function' ? reply(message) : reply;
    };
    return sent;
  }

  async function postOf(name) {
    const doc = await fixtures(name);
    const post = Xtend.post.findPost(Xtend.post.findActionBars(doc)[0]);
    return { doc, post };
  }

  // --- start(): download and its result ---------------------------------------------------

  test('start: sends the resolved video to the service worker', async () => {
    Xtend.videoStore.clear();
    const item = await timelineItem({ allowDownload: true });
    Xtend.videoStore.add([item]);
    const sent = fakeWorker();
    const { doc, post } = await postOf('post-original-timeline.html');

    const result = await D.start(post);

    assert.deepEqual(result, { ok: true, saved: 1, authorDisabled: false });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, 'xtend:download');
    assert.equal(sent[0].video.url, item.url);
    assert.equal(sent[0].video.tweetId, TIMELINE.tweetId);
    assert.equal(doc.body.children.length, 1, 'nothing added to the page');
  });

  test('start: still downloads when the author turned downloads off', async () => {
    Xtend.videoStore.clear();
    Xtend.videoStore.add([await timelineItem({ allowDownload: false })]);
    const sent = fakeWorker();
    const { post } = await postOf('post-original-timeline.html');
    assert.deepEqual(await D.start(post), { ok: true, saved: 1, authorDisabled: true });
    assert.equal(sent.length, 1);
  });

  test('start: GIF downloads from its direct MP4 even with an empty store', async () => {
    Xtend.videoStore.clear();
    const sent = fakeWorker();
    const { post } = await postOf('post-original-timeline-gif.html');
    await D.start(post);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].video.kind, 'gif');
    assert.equal(sent[0].video.url, 'https://video.twimg.com/tweet_video/HX7auBYXIAA1xX0.mp4');
  });

  test('start: video not loaded yet → error that says what to do', async () => {
    Xtend.videoStore.clear();
    const sent = fakeWorker();
    const { post } = await postOf('post-original-timeline.html');
    const result = await D.start(post);
    assert.equal(sent.length, 0);
    assert.equal(result.ok, false);
    assert.ok(/hasn't sent this video yet/.test(result.error), result.error);
  });

  test('start: refused / failed download → the reason', async () => {
    Xtend.videoStore.clear();
    Xtend.videoStore.add([await timelineItem()]);
    fakeWorker({ ok: false, error: 'Download blocked' });
    const { post } = await postOf('post-original-timeline.html');
    assert.deepEqual(await D.start(post), { ok: false, error: 'Download blocked' });
  });

  test("start: background script doesn't answer the ping → says so, nothing sent", async () => {
    Xtend.videoStore.clear();
    Xtend.videoStore.add([await timelineItem()]);
    const sent = [];
    D.send = async (message) => {
      if (message.type === 'xtend:ping') throw new Error("Xtend's background script isn't answering (no reply to ping).");
      sent.push(message);
      return { ok: true };
    };
    const { post } = await postOf('post-original-timeline.html');
    const result = await D.start(post);
    assert.equal(sent.length, 0);
    assert.ok(/isn't answering/.test(result.error), result.error);
  });

  test('start: reloaded extension → ask to refresh the page', async () => {
    Xtend.videoStore.clear();
    Xtend.videoStore.add([await timelineItem()]);
    D.send = async () => {
      throw new Error('Extension context invalidated.');
    };
    const { post } = await postOf('post-original-timeline.html');
    assert.deepEqual(await D.start(post), { ok: false, error: 'Xtend was updated – refresh the page.' });
  });

  test('start: a second start while the post is downloading is ignored', async () => {
    Xtend.videoStore.clear();
    Xtend.videoStore.add([await timelineItem()]);
    const sent = [];
    let finish;
    D.send = (message) => {
      if (message.type === 'xtend:ping') return Promise.resolve({ ok: true });
      sent.push(message);
      if (sent.length > 1) return Promise.resolve({ ok: true }); // later downloads answer at once
      return new Promise((resolve) => (finish = () => resolve({ ok: true })));
    };
    const { post } = await postOf('post-original-timeline.html');
    const first = D.start(post);
    assert.deepEqual(await D.start(post), { ok: false, skipped: true });
    await settle();
    assert.equal(sent.length, 1);
    finish();
    assert.equal((await first).ok, true);
    await D.start(post); // can be downloaded again afterwards
    assert.equal(sent.length, 2);
  });

  test('messages to the service worker carry the debug flag', async () => {
    Xtend.videoStore.clear();
    Xtend.videoStore.add([await timelineItem()]);
    const messages = [];
    D.send = async (message) => {
      messages.push(message);
      return { ok: true };
    };
    const { post } = await postOf('post-original-timeline.html');
    const before = localStorage.getItem('xtendDebug');
    try {
      localStorage.setItem('xtendDebug', '1');
      await D.start(post);
    } finally {
      if (before === null) localStorage.removeItem('xtendDebug');
      else localStorage.setItem('xtendDebug', before);
    }
    assert.deepEqual(messages.map((m) => [m.type, m.debug]), [
      ['xtend:ping', true],
      ['xtend:download', true],
    ]);
  });

  test('debug: silent unless localStorage.xtendDebug is "1"', () => {
    const before = localStorage.getItem('xtendDebug');
    const logged = [];
    const original = console.log;
    console.log = (...args) => logged.push(args.join(' '));
    try {
      localStorage.removeItem('xtendDebug');
      Xtend.debug.log('hidden');
      localStorage.setItem('xtendDebug', '1');
      Xtend.debug.log('shown');
    } finally {
      console.log = original;
      if (before === null) localStorage.removeItem('xtendDebug');
      else localStorage.setItem('xtendDebug', before);
    }
    assert.deepEqual(logged, ['[xtend] shown']);
  });

  // --- sendToWorker ------------------------------------------------------------------------

  test('sendToWorker: no reply → rejects with the given message after the time limit', async () => {
    let error = null;
    try {
      await D.sendToWorker({}, { runtime: { sendMessage() {} }, timeoutMs: 20, timeoutMessage: 'too slow' });
    } catch (e) {
      error = e;
    }
    assert.equal(error && error.message, 'too slow');
  });

  test('sendToWorker: callback reply, promise reply and lastError', async () => {
    const callbackRuntime = { sendMessage: (_m, cb) => cb({ ok: true, via: 'callback' }) };
    assert.equal((await D.sendToWorker({}, { runtime: callbackRuntime, timeoutMs: 1000 })).via, 'callback');

    const promiseRuntime = { sendMessage: () => Promise.resolve({ ok: true, via: 'promise' }) };
    assert.equal((await D.sendToWorker({}, { runtime: promiseRuntime, timeoutMs: 1000 })).via, 'promise');

    const failing = {
      lastError: null,
      sendMessage(_m, cb) {
        failing.lastError = { message: 'Could not establish connection.' };
        cb(undefined);
        failing.lastError = null;
      },
    };
    let error = null;
    try {
      await D.sendToWorker({}, { runtime: failing, timeoutMs: 1000 });
    } catch (e) {
      error = e;
    }
    assert.equal(error && error.message, 'Could not establish connection.');
  });

  test('sendToWorker: a late reply after the time limit is ignored', async () => {
    let late;
    let error = null;
    try {
      await D.sendToWorker({}, { runtime: { sendMessage: (_m, cb) => (late = cb) }, timeoutMs: 10, timeoutMessage: 'timed out' });
    } catch (e) {
      error = e;
    }
    late({ ok: true });
    assert.equal(error && error.message, 'timed out');
  });
}
