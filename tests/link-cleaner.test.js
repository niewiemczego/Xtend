// Run with: node --test
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createWindow, createNavigator, load } = require('./helpers/fake-window.js');
const { calls: captured } = require('./fixtures/share/post-links.json');

const DIRTY = 'https://x.com/uwukko/status/2101031299884404830?s=20';
const CLEAN = 'https://x.com/uwukko/status/2101031299884404830';

function withCleaner(navigatorOptions, { debug = false } = {}) {
  const nav = createNavigator(navigatorOptions);
  const win = createWindow({ navigator: nav });
  win.logs = [];
  win.localStorage = { getItem: (key) => (debug && key === 'xtendDebug' ? '1' : null) };
  win.console = { log: (...args) => win.logs.push(args.join(' ')) };
  load(win, 'shared/post-link.js', 'page/link-cleaner.js');
  return { win, nav };
}

describe('link cleaner – Copy link (clipboard.writeText)', () => {
  test('X writes the clean link for every captured Copy link call', async () => {
    const { nav } = withCleaner();
    for (const call of captured.filter((c) => c.api === 'navigator.clipboard.writeText')) {
      await nav.clipboard.writeText(...call.args);
      assert.equal(nav.calls.at(-1).args[0], call.clean, call.what);
    }
  });

  test('runs on the same clipboard object and returns the browser\'s promise', async () => {
    const nav = createNavigator();
    const proto = Object.getPrototypeOf(nav.clipboard);
    const promise = Promise.resolve();
    const original = proto.writeText;
    proto.writeText = function () {
      original.apply(this, arguments);
      return promise;
    };
    load(createWindow({ navigator: nav }), 'shared/post-link.js', 'page/link-cleaner.js');
    assert.equal(nav.clipboard.writeText(DIRTY), promise);
    assert.equal(nav.calls[0].self, nav.clipboard);
    assert.equal(nav.calls[0].args[0], CLEAN);
  });

  test('anything that is not a post link passes through unchanged', async () => {
    const { nav } = withCleaner();
    const values = ['hello', 'https://x.com/user?s=20', 'see https://x.com/a/status/1?s=20'];
    for (const value of values) await nav.clipboard.writeText(value);
    assert.deepEqual(nav.calls.map((c) => c.args[0]), values);
  });

  test('extra and missing arguments reach the browser as they are', async () => {
    const { nav } = withCleaner();
    await nav.clipboard.writeText(DIRTY, 'extra');
    await nav.clipboard.writeText();
    assert.deepEqual(nav.calls[0].args, [CLEAN, 'extra']);
    assert.deepEqual(nav.calls[1].args, []);
  });

  test("the browser's errors still reach X", async () => {
    const nav = createNavigator();
    Object.getPrototypeOf(nav.clipboard).writeText = () => Promise.reject(new Error('denied'));
    load(createWindow({ navigator: nav }), 'shared/post-link.js', 'page/link-cleaner.js');
    await assert.rejects(nav.clipboard.writeText(DIRTY), /denied/);
  });
});

describe('link cleaner – Share post via … (navigator.share)', () => {
  test('X shares the clean link for the captured call', async () => {
    const { nav } = withCleaner();
    const call = captured.find((c) => c.api === 'navigator.share');
    await nav.share(...call.args);
    assert.deepEqual({ ...nav.calls[0].args[0] }, { url: call.clean });
    assert.equal(nav.calls[0].self, nav);
  });

  test("X's object is not modified – a copy with the clean link is passed on", async () => {
    const { nav } = withCleaner();
    const data = { url: DIRTY, title: 'Post' };
    await nav.share(data);
    assert.equal(data.url, DIRTY);
    assert.deepEqual({ ...nav.calls[0].args[0] }, { url: CLEAN, title: 'Post' });
  });

  test('a post link as the whole `text` is cleaned too', async () => {
    const { nav } = withCleaner();
    await nav.share({ text: DIRTY });
    assert.equal(nav.calls[0].args[0].text, CLEAN);
  });

  test('other data is passed on as the very same object', async () => {
    const { nav } = withCleaner();
    const values = [{ url: 'https://example.com/?s=20' }, { text: 'hi' }, {}, undefined, null];
    for (const value of values) await nav.share(value);
    nav.calls.forEach((c, i) => assert.equal(c.args[0], values[i]));
  });

  test('a getter that throws does not stop the share', async () => {
    const { nav } = withCleaner();
    const data = {
      get url() {
        throw new Error('boom');
      },
    };
    await nav.share(data);
    assert.equal(nav.calls[0].args[0], data);
  });
});

describe('link cleaner – install', () => {
  test('adds nothing the browser does not have', () => {
    const { nav } = withCleaner({ clipboard: false, share: false });
    assert.equal(nav.clipboard, undefined);
    assert.equal('share' in nav, false);
  });

  test('no navigator at all is fine', () => {
    const win = createWindow();
    assert.doesNotThrow(() => load(win, 'shared/post-link.js', 'page/link-cleaner.js'));
  });

  test('installs itself only once', async () => {
    const { win, nav } = withCleaner({}, { debug: true });
    load(win, 'page/link-cleaner.js'); // second injection
    await nav.clipboard.writeText(DIRTY);
    assert.equal(nav.calls.length, 1);
    assert.equal(win.logs.length, 1);
  });

  test('keeps the property attributes of the browser method', () => {
    const nav = createNavigator();
    const proto = Object.getPrototypeOf(nav.clipboard);
    const before = Object.getOwnPropertyDescriptor(proto, 'writeText');
    load(createWindow({ navigator: nav }), 'shared/post-link.js', 'page/link-cleaner.js');
    const after = Object.getOwnPropertyDescriptor(proto, 'writeText');
    assert.notEqual(after.value, before.value);
    assert.equal(after.enumerable, before.enumerable);
    assert.equal(after.writable, before.writable);
    assert.equal(after.configurable, before.configurable);
  });
});

describe('link cleaner – debug mode', () => {
  test('logs "[xtend] cleaned link: <before> → <after>"', async () => {
    const { win, nav } = withCleaner({}, { debug: true });
    await nav.clipboard.writeText(DIRTY);
    await nav.share({ url: DIRTY });
    assert.deepEqual(win.logs, [
      `[xtend] cleaned link: ${DIRTY} → ${CLEAN}`,
      `[xtend] cleaned link: ${DIRTY} → ${CLEAN}`,
    ]);
  });

  test('logs nothing for untouched values, or when debug mode is off', async () => {
    const on = withCleaner({}, { debug: true });
    await on.nav.clipboard.writeText('hello');
    await on.nav.clipboard.writeText(CLEAN);
    assert.deepEqual(on.win.logs, []);

    const off = withCleaner();
    await off.nav.clipboard.writeText(DIRTY);
    assert.deepEqual(off.win.logs, []);
  });
});
