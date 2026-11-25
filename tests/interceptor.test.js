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
  test('publishes the videos of a GraphQL response to the content script', async () => {
    const win = withInterceptor(async () => fakeResponse(api('HomeTimeline')));
    await win.fetch(GRAPHQL);
    await flush();

    assert.equal(win.posted.length, 1);
    const { data, targetOrigin } = win.posted[0];
    assert.equal(targetOrigin, ORIGIN);
    assert.equal(data.source, 'xtend');
    assert.equal(data.type, 'videos');
    assert.equal(data.items.length, 22);
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

  test('publishes videos from a text response', () => {
    const win = xhrWindow();
    const xhr = new win.XMLHttpRequest();
    xhr.open('GET', GRAPHQL);
    xhr.send();
    assert.equal(xhr.sent, true);
    xhr.respond(200, api('TweetDetail'));
    assert.equal(win.posted.length, 1);
    assert.deepEqual(
      plain(win.posted[0].data.items).map((i) => i.tweetId),
      ['2125654411900760238', '2125393023093592423', '2125448866132820027'],
    );
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
