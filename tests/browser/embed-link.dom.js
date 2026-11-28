// DOM tests for extension/content/embed-link.js and the Share menu's "Copy embed link".
//
// The clipboard is replaced with a recorder (Xtend.embedLink.write) – headless Chrome has no
// user activation, so a real write would be refused.
/* global test, assert, fixtures, Xtend */

// isolated scope: test files share the page's global scope
{
  const E = Xtend.embedLink;
  const M = Xtend.shareMenu;
  const S = Xtend.selectors;
  const P = Xtend.post;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const realWrite = E.write;

  /** Records what would be copied; `ok` decides whether the write "works". */
  function fakeClipboard(ok = true) {
    const written = [];
    E.write = async (text) => {
      written.push(text);
      return ok;
    };
    return written;
  }

  function fakeWorker() {
    const sent = [];
    Xtend.download.send = async (message) => {
      if (message.type === 'xtend:ping') return { ok: true };
      sent.push(message);
      return { ok: true, downloadId: 1, filename: 'x.mp4' };
    };
    return sent;
  }

  async function postWithMenu(postFixture) {
    const doc = await fixtures(postFixture, 'share-menu-original.html');
    const menu = doc.querySelector(S.menu);
    const [bar] = P.findActionBars(doc);
    P.shareButtonOf(bar).id = menu.getAttribute('aria-labelledby');
    M.install(doc);
    M.scan(doc);
    return { doc, menu, post: P.findPost(bar) };
  }

  function items(menu) {
    return Array.from(menu.querySelectorAll(S.menuItem));
  }
  function embedItem(menu) {
    return items(menu).find((i) => i.textContent.trim() === M.EMBED_LABEL) || null;
  }

  // --- the link --------------------------------------------------------------------------

  test('embed link: timeline post → fixupx.com with the same user and ID', async () => {
    const doc = await fixtures('post-original-timeline.html');
    const post = P.findPost(P.findActionBars(doc)[0]);
    assert.equal(E.linkFor(post), 'https://fixupx.com/DrewPavlou/status/2125387364696756699');
  });

  test('embed link: quote post → the outer post, not the quoted one', async () => {
    const doc = await fixtures('post-quote.html');
    const post = P.findPost(P.findActionBars(doc)[0]);
    assert.equal(E.linkFor(post), 'https://fixupx.com/YakumoLegalist/status/2125584099888828497');
  });

  test('embed link: status page → from the page URL, extra path parts dropped', async () => {
    const doc = await fixtures('post-original-status.html');
    const post = P.findPost(P.findActionBars(doc)[0]);
    assert.equal(
      E.linkFor(post, { pathname: '/someone/status/2125387364696756699/photo/1' }),
      'https://fixupx.com/someone/status/2125387364696756699',
    );
    assert.equal(E.linkFor(post, { pathname: '/home' }), null, 'not a post page');
  });

  // --- the menu item -----------------------------------------------------------------------

  test('menu: "Copy embed link" sits right after "Copy link", with X\'s link icon', async () => {
    const { menu } = await postWithMenu('post-original-timeline.html');
    const list = items(menu);
    const copyLink = list.find((i) => i.textContent.trim() === 'Copy link');
    const ours = embedItem(menu);
    assert.ok(ours, 'embed item');
    assert.equal(list.indexOf(ours), list.indexOf(copyLink) + 1);
    assert.ok(ours.classList.contains(M.ITEM_CLASS));
    assert.equal(ours.getAttribute('role'), 'menuitem');
    assert.equal(ours.id, '');
    assert.deepEqual(Array.from(ours.attributes).filter((a) => a.name.startsWith('data-')).map((a) => a.name), []);
    assert.equal(ours.querySelector('svg').getAttribute('data-icon'), 'icon-link');
  });

  test('menu: clicking "Copy embed link" copies the link and closes the menu', async () => {
    const written = fakeClipboard();
    const sent = fakeWorker();
    const { menu } = await postWithMenu('post-original-timeline.html');
    const closed = [];
    menu.addEventListener('keydown', (e) => closed.push(e.key));

    embedItem(menu).querySelector('div').click(); // on the label, like a user would
    await settle();

    assert.deepEqual(written, ['https://fixupx.com/DrewPavlou/status/2125387364696756699']);
    assert.deepEqual(closed, ['Escape'], 'menu asked to close');
    assert.equal(sent.length, 0, 'nothing downloaded');
    E.write = realWrite;
  });

  test('menu: Enter and Space on "Copy embed link" copy too', async () => {
    for (const key of ['Enter', ' ']) {
      const written = fakeClipboard();
      const { menu } = await postWithMenu('post-no-video.html');
      embedItem(menu).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      await settle();
      assert.deepEqual(written, ['https://fixupx.com/AdamKoscielak/status/2125578293399491003'], JSON.stringify(key));
    }
    E.write = realWrite;
  });

  test('menu: a refused clipboard write resolves to null, nothing throws', async () => {
    fakeClipboard(false);
    const doc = await fixtures('post-no-video.html');
    const post = P.findPost(P.findActionBars(doc)[0]);
    assert.equal(await E.copy(post), null);
    E.write = realWrite;
  });

  test('menu: added once, however often the menu is scanned', async () => {
    const { menu } = await postWithMenu('post-no-video-with-image.html');
    M.scan(menu.ownerDocument);
    M.prepare(menu);
    assert.equal(items(menu).filter((i) => i.textContent.trim() === M.EMBED_LABEL).length, 1);
  });
}
