// DOM tests for extension/content/share-menu.js.
//
// share-menu-original.html (a real menu) is combined with a post fixture in one document and
// linked the way X links them: menu[aria-labelledby] = the Share button's id. There is no
// capture of a quote post's menu yet, so that case removes X's native item from the real menu.
/* global test, assert, fixtures, Xtend, XtendVideoMedia */

// isolated scope: test files share the page's global scope
{
  const M = Xtend.shareMenu;
  const D = Xtend.download;
  const S = Xtend.selectors;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  let realItem = null;
  async function videoItem(tweetId, mediaId, extra = {}) {
    if (!realItem) {
      const json = await (await fetch('../fixtures/api/TweetResultByRestId.json')).json();
      realItem = XtendVideoMedia.extractFromGraphQL(json)[0];
    }
    return { ...realItem, tweetId, mediaId, allowDownload: true, ...extra };
  }

  function fakeWorker() {
    const sent = [];
    D.send = async (message) => {
      if (message.type === 'xtend:ping') return { ok: true };
      sent.push(message);
      return { ok: true, downloadId: 1, filename: 'x.mp4' };
    };
    return sent;
  }

  /** A post fixture + the real Share menu, linked like X does, with Xtend's listeners on. */
  async function postWithMenu(postFixture, { withoutNativeItem = false } = {}) {
    const doc = await fixtures(postFixture, 'share-menu-original.html');
    const menu = doc.querySelector(S.menu);
    const [bar] = Xtend.post.findActionBars(doc);
    Xtend.post.shareButtonOf(bar).id = menu.getAttribute('aria-labelledby');
    if (withoutNativeItem) nativeItem(menu).remove();
    M.install(doc);
    return { doc, menu, bar, post: Xtend.post.findPost(bar) };
  }

  function items(menu) {
    return Array.from(menu.querySelectorAll(S.menuItem));
  }
  function labels(menu) {
    return items(menu).map((i) => i.textContent.trim());
  }
  function nativeItem(menu) {
    return items(menu).find((i) => i.textContent.trim() === 'Download video' && !i.classList.contains(M.ITEM_CLASS));
  }
  /** Records X's own handlers on an element (they must not run when Xtend takes over). */
  function xHandlers(el, types) {
    const calls = [];
    for (const type of types) el.addEventListener(type, () => calls.push(type));
    return calls;
  }

  const TIMELINE = { tweetId: '2125387364696756699', mediaId: '2125387308996468736' };
  const QUOTED = { tweetId: '2125224655359197191', mediaId: '2125224005795717120' };

  // --- original post: X's own item --------------------------------------------------------

  test("menu: X's own Download video item is left exactly as it is", async () => {
    const { menu } = await postWithMenu('post-original-timeline.html');
    const before = menu.outerHTML;
    M.scan(menu.ownerDocument);
    M.prepare(menu);
    assert.equal(menu.outerHTML, before);
    assert.deepEqual(labels(menu), ['Send via Chat', 'Copy link', 'Share post via …', 'Post video', 'Download video']);
  });

  test("menu: clicking X's item downloads through Xtend, X's handler doesn't run", async () => {
    Xtend.videoStore.clear();
    const item = await videoItem(TIMELINE.tweetId, TIMELINE.mediaId);
    Xtend.videoStore.add([item]);
    const sent = fakeWorker();
    const { doc, menu } = await postWithMenu('post-original-timeline.html');
    const native = nativeItem(menu);
    const xCalls = xHandlers(native, ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup']);
    const closed = [];
    menu.addEventListener('keydown', (e) => closed.push(e.key));

    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      native.querySelector('div').dispatchEvent(new Event(type, { bubbles: true }));
    }
    native.querySelector('div').click(); // click on the label, like a user would
    await settle();

    assert.deepEqual(xCalls, [], "X's handlers");
    assert.deepEqual(closed, ['Escape'], 'menu asked to close');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].video.url, item.url);
    assert.equal(doc.querySelectorAll('.xtend-download').length, 0, 'no action-bar button');
  });

  test("menu: Enter and Space on X's item download too", async () => {
    Xtend.videoStore.clear();
    Xtend.videoStore.add([await videoItem(TIMELINE.tweetId, TIMELINE.mediaId)]);
    for (const key of ['Enter', ' ']) {
      const sent = fakeWorker();
      const { menu } = await postWithMenu('post-original-timeline.html');
      const native = nativeItem(menu);
      const xCalls = xHandlers(native, ['keydown']);
      native.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      await settle();
      assert.equal(sent.length, 1, JSON.stringify(key));
      assert.deepEqual(xCalls, [], JSON.stringify(key));
    }
  });

  test('menu: other items keep working normally', async () => {
    const sent = fakeWorker();
    const { menu } = await postWithMenu('post-original-timeline.html');
    const copyLink = items(menu).find((i) => i.textContent.trim() === 'Copy link');
    const xCalls = xHandlers(copyLink, ['click', 'pointerdown']);
    copyLink.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    copyLink.click();
    await settle();
    assert.deepEqual(xCalls, ['pointerdown', 'click']);
    assert.equal(sent.length, 0);
  });

  // --- quote post: no native item ------------------------------------------------------------

  test('menu: no native item on a video post → our item after "Post video"', async () => {
    const { menu } = await postWithMenu('post-quote.html', { withoutNativeItem: true });
    M.scan(menu.ownerDocument);
    assert.deepEqual(labels(menu), ['Send via Chat', 'Copy link', 'Share post via …', 'Post video', 'Download video']);
    const ours = menu.querySelector(`.${M.ITEM_CLASS}`);
    assert.ok(ours, 'our item');
    assert.equal(ours.getAttribute('role'), 'menuitem');
    assert.equal(ours.id, '');
    assert.deepEqual(Array.from(ours.attributes).filter((a) => a.name.startsWith('data-')).map((a) => a.name), []);
    assert.equal(ours.querySelector('svg').getAttribute('viewBox'), '0 0 20 20');
    assert.ok(ours.classList.contains('rounded-md'), "X's item classes kept");
  });

  test('menu: our item is added once', async () => {
    const { menu } = await postWithMenu('post-quote.html', { withoutNativeItem: true });
    M.scan(menu.ownerDocument);
    M.scan(menu.ownerDocument);
    M.prepare(menu);
    assert.equal(menu.querySelectorAll(`.${M.ITEM_CLASS}`).length, 1);
  });

  test("menu (quote): our item downloads the quoted post's video", async () => {
    Xtend.videoStore.clear();
    const quoted = await videoItem(QUOTED.tweetId, QUOTED.mediaId);
    Xtend.videoStore.add([quoted]);
    const sent = fakeWorker();
    const { menu } = await postWithMenu('post-quote.html', { withoutNativeItem: true });
    M.scan(menu.ownerDocument);
    menu.querySelector(`.${M.ITEM_CLASS}`).click();
    await settle();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].video.tweetId, QUOTED.tweetId);
  });

  // --- when Xtend stays out of the way ---------------------------------------------------------

  test('menu: post without video → nothing added, X keeps its own behaviour', async () => {
    const sent = fakeWorker();
    const { menu } = await postWithMenu('post-no-video.html');
    const before = menu.outerHTML;
    M.scan(menu.ownerDocument);
    assert.equal(menu.outerHTML, before);
    const xCalls = xHandlers(nativeItem(menu), ['click']);
    nativeItem(menu).click();
    await settle();
    assert.deepEqual(xCalls, ['click']);
    assert.equal(sent.length, 0);
  });

  test("menu: unknown post (trigger not found) → X's item is not taken over", async () => {
    const sent = fakeWorker();
    const doc = await fixtures('post-original-timeline.html', 'share-menu-original.html'); // not linked
    M.install(doc);
    const menu = doc.querySelector(S.menu);
    M.scan(doc);
    const xCalls = xHandlers(nativeItem(menu), ['click']);
    nativeItem(menu).click();
    await settle();
    assert.deepEqual(xCalls, ['click']);
    assert.equal(sent.length, 0);
    assert.equal(menu.querySelectorAll(`.${M.ITEM_CLASS}`).length, 0);
  });
}
