// Run with: node --test
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');

const { bestMp4, mediaIdFromUrl, photoKeyFromUrl, photoOrigUrl, extractFromGraphQL } = require('../extension/shared/video-media.js');

const api = (name) => require(join(__dirname, 'fixtures', 'api', `${name}.json`));
const find = (items, tweetId) => items.filter((i) => i.tweetId === tweetId);

describe('bestMp4', () => {
  const single = api('TweetResultByRestId').data.tweet_result_by_rest_id.result;
  const variants = single.media_entities2[0].video_info.variants; // 1 HLS + 3 MP4

  test('picks the highest-bitrate MP4 and ignores HLS', () => {
    assert.equal(variants[0].content_type, 'application/x-mpegURL');
    assert.equal(bestMp4(variants).bitrate, 2176000);
    assert.match(bestMp4(variants).url, /710x524\/.+\.mp4/);
  });

  test('does not depend on variant order', () => {
    assert.deepEqual(bestMp4([...variants].reverse()), bestMp4(variants));
  });

  test('returns null when there is no MP4', () => {
    assert.equal(bestMp4([variants[0]]), null); // HLS only
    assert.equal(bestMp4([]), null);
    assert.equal(bestMp4(undefined), null);
  });
});

describe('mediaIdFromUrl', () => {
  // URLs as they appear in tests/fixtures
  test('amplify_video poster and MP4', () => {
    assert.equal(
      mediaIdFromUrl('https://pbs.twimg.com/amplify_video_thumb/2125654023743102976/img/uvm8xXDyJ7wwY9kG.jpg'),
      '2125654023743102976',
    );
    assert.equal(
      mediaIdFromUrl('https://video.twimg.com/amplify_video/2125654023743102976/vid/avc1/710x524/DVS_DEZqedA1W6ka.mp4?tag=29'),
      '2125654023743102976',
    );
  });

  test('ext_tw_video poster and MP4', () => {
    assert.equal(
      mediaIdFromUrl('https://pbs.twimg.com/ext_tw_video_thumb/1997702283795070976/pu/img/QnME4xMmilMLNbjV.jpg'),
      '1997702283795070976',
    );
    assert.equal(
      mediaIdFromUrl('https://video.twimg.com/ext_tw_video/1997702283795070976/pu/vid/avc1/320x568/G8j2szr1VHG006Ws.mp4?tag=19'),
      '1997702283795070976',
    );
  });

  test('GIF thumbnails carry no media ID', () => {
    assert.equal(mediaIdFromUrl('https://pbs.twimg.com/tweet_video_thumb/HX7auBYXIAA1xX0?format=jpg&name=large'), null);
    assert.equal(mediaIdFromUrl(undefined), null);
  });
});

describe('photoOrigUrl & photoKeyFromUrl', () => {
  test('turns GraphQL media_url_https into name=orig', () => {
    assert.equal(
      photoOrigUrl('https://pbs.twimg.com/media/HX8nO9yW8AE_59M.jpg'),
      'https://pbs.twimg.com/media/HX8nO9yW8AE_59M?format=jpg&name=orig',
    );
    assert.equal(
      photoOrigUrl('https://pbs.twimg.com/media/HXozER6XgAEnLZs.png'),
      'https://pbs.twimg.com/media/HXozER6XgAEnLZs?format=png&name=orig',
    );
  });

  test('turns DOM img src into the exact same name=orig URL', () => {
    assert.equal(
      photoOrigUrl('https://pbs.twimg.com/media/HX9WU9tWoAAIVEL?format=jpg&name=large'),
      'https://pbs.twimg.com/media/HX9WU9tWoAAIVEL?format=jpg&name=orig',
    );
    assert.equal(
      photoOrigUrl('https://pbs.twimg.com/media/HX8nO9yW8AE_59M'),
      'https://pbs.twimg.com/media/HX8nO9yW8AE_59M?name=orig',
    );
  });

  test('extracts the same photo key from GraphQL and DOM URLs', () => {
    assert.equal(photoKeyFromUrl('https://pbs.twimg.com/media/HXozER6XgAEnLZs.png'), 'HXozER6XgAEnLZs');
    assert.equal(
      photoKeyFromUrl('https://pbs.twimg.com/media/HXozER6XgAEnLZs?format=webp&name=small'),
      'HXozER6XgAEnLZs',
    );
  });

  test('rejects non-media, non-https and traversal URLs', () => {
    for (const bad of [
      'https://pbs.twimg.com/profile_images/1929936006267936777/xcE1GO9c_normal.jpg',
      'https://pbs.twimg.com/amplify_video_thumb/2125654023743102976/img/uvm8xXDyJ7wwY9kG.jpg',
      'https://pbs.twimg.com/media/../profile_images/1.jpg',
      'http://pbs.twimg.com/media/HX8nO9yW8AE_59M.jpg',
      'https://evil.example/media/HX8nO9yW8AE_59M.jpg',
      null,
      undefined,
      'not a url',
    ]) {
      assert.equal(photoOrigUrl(bad), null, String(bad));
      assert.equal(photoKeyFromUrl(bad), null, String(bad));
    }
  });
});

describe('extractFromGraphQL – TweetResultByRestId', () => {
  const items = extractFromGraphQL(api('TweetResultByRestId'));

  test('finds the single video with its best MP4', () => {
    assert.equal(items.length, 1);
    const [item] = items;
    assert.equal(item.tweetId, '2125654411900760238');
    assert.equal(item.mediaId, '2125654023743102976');
    assert.equal(item.kind, 'video');
    assert.equal(item.bitrate, 2176000);
    assert.match(item.url, /\/vid\/avc1\/710x524\/.+\.mp4/);
  });

  test("passes the author's allow_download setting through", () => {
    assert.equal(items[0].allowDownload, false);
  });
});

describe('extractFromGraphQL – TweetDetail', () => {
  const items = extractFromGraphQL(api('TweetDetail'));

  test('returns each video and photo once', () => {
    assert.deepEqual(
      items.filter((i) => i.kind !== 'photo').map((i) => [i.tweetId, i.mediaId]),
      [
        ['2125654411900760238', '2125654023743102976'],
        ['2125393023093592423', '2125392963853340672'],
        ['2125448866132820027', '2125448819534188544'],
      ],
    );
    const photos = items.filter((i) => i.kind === 'photo');
    assert.equal(photos.length, 5);
    assert.equal(
      find(photos, '2125460691691979009')[0].url,
      'https://pbs.twimg.com/media/HX8nO9yW8AE_59M?format=jpg&name=orig',
    );
    assert.equal(
      find(photos, '2124066362058273249')[0].url,
      'https://pbs.twimg.com/media/HXozER6XgAEnLZs?format=png&name=orig',
    );
    assert.equal(find(photos, '2125681031349240128').length, 2); // multi-photo post
  });

  test('the focal post appears twice in the response but keeps allowDownload from the full copy', () => {
    // data.tweet_result_by_rest_id repeats the post without id_str / allow_download_status
    assert.equal(find(items, '2125654411900760238')[0].allowDownload, false);
  });

  test('picks the best available MP4 per video', () => {
    assert.equal(find(items, '2125448866132820027')[0].bitrate, 832000); // only 3 variants
  });
});

describe('extractFromGraphQL – HomeTimeline', () => {
  const items = extractFromGraphQL(api('HomeTimeline'));

  test('finds all 21 videos, 1 GIF and 20 photos', () => {
    assert.equal(items.filter((i) => i.kind === 'video').length, 21);
    assert.equal(items.filter((i) => i.kind === 'gif').length, 1);
    assert.equal(items.filter((i) => i.kind === 'photo').length, 20);
  });

  test('every video/GIF is a video.twimg.com MP4 and every photo is a pbs.twimg.com name=orig URL', () => {
    for (const item of items) {
      assert.match(item.tweetId, /^\d+$/);
      if (item.kind === 'photo') {
        assert.match(item.url, /^https:\/\/pbs\.twimg\.com\/media\/[A-Za-z0-9_-]+\?format=[a-z]+&name=orig$/, item.url);
        assert.equal(item.bitrate, 0);
      } else {
        assert.match(item.url, /^https:\/\/video\.twimg\.com\/.+\.mp4(\?|$)/, item.url);
      }
    }
  });

  test('a video in a quoted post belongs to the quoted post, not the quoting one', () => {
    assert.equal(find(items, '2125676161749414130').length, 0); // quoting post, no own media
    const quoted = find(items, '2125649159302549531');
    assert.equal(quoted.length, 1);
    assert.equal(quoted[0].mediaId, '2064357061408825345');
  });

  test('a post with its own video that quotes a post without video', () => {
    assert.equal(find(items, '2125603211172299226').length, 1);
    assert.equal(find(items, '2125312372651016409').length, 0);
  });

  test('GIF: direct tweet_video MP4, bitrate 0, no allow_download info', () => {
    const [gif] = find(items, '2125550295115522064');
    assert.equal(gif.kind, 'gif');
    assert.equal(gif.mediaId, '2125550274416709632');
    assert.equal(gif.bitrate, 0);
    assert.match(gif.url, /^https:\/\/video\.twimg\.com\/tweet_video\/.+\.mp4$/);
    assert.equal(gif.allowDownload, null);
  });

  test('allowDownload is true, false or null', () => {
    for (const item of items) assert.ok([true, false, null].includes(item.allowDownload));
    assert.ok(items.some((i) => i.allowDownload === false));
  });
});

describe('extractFromGraphQL – bad input', () => {
  test('never throws, returns an empty array', () => {
    for (const input of [null, undefined, 42, 'text', [], {}, { data: null }, [[null]]]) {
      assert.deepEqual(extractFromGraphQL(input), []);
    }
  });
});
