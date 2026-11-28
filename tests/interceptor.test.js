// Run with: node --test
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { createWindow, load, flush, plain, ORIGIN } = require('./helpers/fake-window.js');

const api = (name) => require(join(__dirname, 'fixtures', 'api', `${name}.json`));
const GRAPHQL = 'https://x.com/i/api/graphql/abc123/HomeTimeline?variables=%7B%7D';

function fakeResponse(body, { ok = true } = {}) {
  return { ok, clone: () => ({ json: async () => body }) };
}

function withInterceptor(fetchImpl) {
  return load(createWindow({ fetch: fetchImpl }), 'shared/video-media.js', 'page/interceptor.js');
}

describe('interceptor – fetch', () => {
  test('publishes the media of a GraphQL response to the content script', async () => {
    const win = withInterceptor(async () => fakeResponse(api('HomeTimeline')));
    await win.fetch(GRAPHQL);
    await flush();

    assert.equal(win.posted.length, 1);
    const { data, targetOrigin } = win.posted[0];
    assert.equal(targetOrigin, ORIGIN);
    assert.equal(data.source, 'xtend');
    assert.equal(data.type, 'media');
    assert.equal(data.items.length, 42);
  });

  test('X gets back exactly the same response object', async () => {
    const response = fakeResponse(api('TweetResultByRestId'));
    const win = withInterceptor(async () => response);
    assert.equal(await win.fetch(GRAPHQL), response);
  });

  test('accepts URL and Request objects as input', async () => {
    const win = withInterceptor(async () => fakeResponse(api('TweetResultByRestId')));
    await win.fetch({ href: GRAPHQL });
    await win.fetch({ url: GRAPHQL });
    await flush();
    assert.equal(win.posted.length, 2);
  });

  test('ignores non-GraphQL requests', async () => {
    let read = false;
    const win = withInterceptor(async () => ({
      ok: true,
      clone() {
        read = true;
        return { json: async () => api('HomeTimeline') };
      },
    }));
    await win.fetch('https://x.com/i/api/1.1/jot/client_event.json');
    await flush();
    assert.equal(read, false);
    assert.equal(win.posted.length, 0);
  });

  test('ignores failed responses and responses without videos', async () => {
    const win = withInterceptor(async (url) =>
      url.includes('fail') ? fakeResponse(api('HomeTimeline'), { ok: false }) : fakeResponse({ data: {} }),
    );
    await win.fetch(`${GRAPHQL}&fail`);
    await win.fetch(GRAPHQL);
    await flush();
    assert.equal(win.posted.length, 0);
  });

  test("X's own errors still reach X", async () => {
    const win = withInterceptor(async () => {
      throw new Error('offline');
    });
    await assert.rejects(win.fetch(GRAPHQL), /offline/);
  });

  test('a body that is not JSON does not break anything', async () => {
    const win = withInterceptor(async () => ({
      ok: true,
      clone: () => ({ json: async () => JSON.parse('<html>') }),
    }));
    await win.fetch(GRAPHQL);
    await flush();
    assert.equal(win.posted.length, 0);
  });

  test('installs itself only once', async () => {
    let calls = 0;
    const win = withInterceptor(async () => {
      calls++;
      return fakeResponse(api('TweetResultByRestId'));
    });
    load(win, 'page/interceptor.js'); // second injection
    await win.fetch(GRAPHQL);
    await flush();
    assert.equal(calls, 1);
    assert.equal(win.posted.length, 1);
  });
});

describe('interceptor – XMLHttpRequest', () => {
  const xhrWindow = () => withInterceptor(async () => fakeResponse({}));

  test('publishes media from a text response', () => {
    const win = xhrWindow();
    const xhr = new win.XMLHttpRequest();
    xhr.open('GET', GRAPHQL);
    xhr.send();
    assert.equal(xhr.sent, true);
    xhr.respond(200, api('TweetDetail'));
    assert.equal(win.posted.length, 1);
    const items = plain(win.posted[0].data.items);
    assert.deepEqual(
      items.filter((i) => i.kind !== 'photo').map((i) => i.tweetId),
      ['2125654411900760238', '2125393023093592423', '2125448866132820027'],
    );
    assert.equal(items.filter((i) => i.kind === 'photo').length, 5);
  });

  test('publishes videos from a json response', () => {
    const win = xhrWindow();
    const xhr = new win.XMLHttpRequest();
    xhr.open('GET', GRAPHQL);
    xhr.send();
    xhr.respond(200, api('TweetResultByRestId'), 'json');
    assert.equal(win.posted.length, 1);
  });

  test('ignores errors, other URLs and non-JSON bodies', () => {
    const win = xhrWindow();
    const cases = [
      [GRAPHQL, 500, api('HomeTimeline')],
      ['https://x.com/i/api/1.1/live_pipeline/events', 200, api('HomeTimeline')],
      [GRAPHQL, 200, '<html>'],
    ];
    for (const [url, status, body] of cases) {
      const xhr = new win.XMLHttpRequest();
      xhr.open('GET', url);
      xhr.send();
      xhr.respond(status, body);
    }
    assert.equal(win.posted.length, 0);
  });
});

describe('interceptor – SSR hydration ($_TSR)', () => {
  /** Minimal seroval stream matching X's streamed HTML hydration helper. */
  function createSerovalStream() {
    const buffer = [];
    const listeners = [];
    return {
      __SEROVAL_STREAM__: true,
      on(listener) {
        listeners.push(listener);
        for (const value of buffer) listener.next(value);
        return () => {
          const i = listeners.indexOf(listener);
          if (i !== -1) listeners.splice(i, 1);
        };
      },
      next(value) {
        buffer.push(value);
        for (const listener of listeners) listener.next(value);
      },
    };
  }

  test('publishes media from messagesBeforeDehydration and streamed $R.tsr chunks', () => {
    const win = withInterceptor(async () => fakeResponse({}));
    const stream = createSerovalStream();
    const xReceived = [];
    stream.on({ next: (v) => xReceived.push(v), throw() {}, return() {} });

    win.$R = { tsr: [stream] };
    win.$_TSR = {
      c() {
        delete win.$_TSR;
        delete win.$R.tsr;
      },
    };
    win.$_TSR.router = {
      dehydratedData: {
        messagesBeforeDehydration: [
          { kind: 1, result: { kind: 'Result.Ok', value: JSON.stringify({ data: { can_access_payments: false } }) } },
          { kind: 1, result: { kind: 'Result.Ok', value: JSON.stringify(api('TweetResultByRestId')) } },
        ],
      },
    };

    assert.equal(win.posted.length, 1);
    assert.deepEqual(
      plain(win.posted[0].data.items).map((i) => i.tweetId),
      ['2125654411900760238'],
    );

    // Streamed TweetDetail chunk arrives later
    const detailMsg = { kind: 1, result: { kind: 'Result.Ok', value: JSON.stringify(api('TweetDetail')) } };
    stream.next(detailMsg);

    assert.equal(win.posted.length, 2);
    const streamedItems = plain(win.posted[1].data.items);
    assert.deepEqual(
      streamedItems.filter((i) => i.kind !== 'photo').map((i) => i.tweetId),
      ['2125654411900760238', '2125393023093592423', '2125448866132820027'],
    );
    assert.equal(streamedItems.filter((i) => i.kind === 'photo').length, 5);
    // X's own stream listener still receives everything untouched
    assert.deepEqual(xReceived, [detailMsg]);

    // X's cleanup (delete self.$_TSR) succeeds cleanly
    win.$_TSR.c();
    assert.equal('$_TSR' in win, false);
  });

  test('ignores malformed hydration payloads without affecting X', () => {
    const win = withInterceptor(async () => fakeResponse({}));
    const stream = createSerovalStream();
    win.$R = { tsr: [stream] };
    win.$_TSR = {};
    const router = {
      dehydratedData: {
        messagesBeforeDehydration: [null, { result: { value: '{media_entities2 broken json' } }],
      },
    };
    win.$_TSR.router = router;
    stream.next({ result: { value: 'not json media_entities2' } });
    assert.equal(win.$_TSR.router, router);
    assert.equal(win.posted.length, 0);
  });
});
