// Run with: node --test
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { cleanPostUrl } = require('../extension/shared/post-link.js');
const { calls } = require('./fixtures/share/post-links.json');

describe('cleanPostUrl – captured links', () => {
  for (const call of calls) {
    test(call.what, () => {
      const link = typeof call.args[0] === 'string' ? call.args[0] : call.args[0].url;
      assert.equal(cleanPostUrl(link), call.clean);
    });
  }
});

describe('cleanPostUrl – post links', () => {
  const cases = [
    ['https://x.com/user/status/123?s=20#reply', 'https://x.com/user/status/123'],
    ['https://x.com/user/status/123#m', 'https://x.com/user/status/123'],
    ['https://x.com/user/status/123/photo/1?s=20', 'https://x.com/user/status/123/photo/1'],
    ['https://x.com/user/status/123/video/2?s=20', 'https://x.com/user/status/123/video/2'],
    ['https://x.com/user/status/123/?s=20', 'https://x.com/user/status/123/'],
    ['https://x.com/i/status/123?s=20', 'https://x.com/i/status/123'],
    ['https://twitter.com/User_1/status/123?s=20', 'https://twitter.com/User_1/status/123'],
    ['https://mobile.x.com/user/status/123?t=abc&s=09', 'https://mobile.x.com/user/status/123'],
    ['https://www.twitter.com/user/status/123?s=20', 'https://www.twitter.com/user/status/123'],
    ['https://X.com/user/status/123?s=20', 'https://x.com/user/status/123'],
  ];
  for (const [input, expected] of cases) {
    test(input, () => assert.equal(cleanPostUrl(input), expected));
  }

  test('an already clean link stays the same', () => {
    const clean = 'https://x.com/uwukko/status/2101031299884404830';
    assert.equal(cleanPostUrl(clean), clean);
  });
});

describe('cleanPostUrl – everything else is untouched', () => {
  const untouched = [
    'https://x.com/user?s=20', // profile
    'https://x.com/home?s=20',
    'https://x.com/user/status/123/likes?s=20',
    'https://x.com/user/status/123/photo/1/extra?s=20',
    'https://x.com/user/status/abc?s=20',
    'https://x.com/i/spaces/1ABCdef?s=20',
    'https://x.com/a_name_far_too_long/status/123?s=20',
    'https://example.com/user/status/123?s=20',
    'https://x.com.example.com/user/status/123?s=20',
    'https://t.co/abc?s=20',
    'http://x.com/user/status/123?s=20',
    'https://x.com:8443/user/status/123?s=20',
    'https://me@x.com/user/status/123?s=20',
    'check this https://x.com/user/status/123?s=20',
    'https://x.com/user/status/123?s=20 and this',
    ' https://x.com/user/status/123?s=20',
    'https://x.com/user/status/123?s=20\nhttps://x.com/user/status/456?s=20',
    'just some text',
    '',
  ];
  for (const value of untouched) {
    test(JSON.stringify(value), () => assert.equal(cleanPostUrl(value), value));
  }

  test('non-strings are returned as they are', () => {
    const obj = { url: 'https://x.com/user/status/123?s=20' };
    for (const value of [undefined, null, 42, obj, ['https://x.com/user/status/123?s=20']]) {
      assert.equal(cleanPostUrl(value), value);
    }
  });
});
