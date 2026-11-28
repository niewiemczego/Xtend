// Every selector for X's markup lives here. When X changes its HTML, this is the file to update.
// All of them come from the captures in tests/fixtures/html (2026-11-26) – X no longer uses
// data-testid, so nothing here relies on it.
//
// Content scripts listed in the manifest share one scope; each file adds its part to `Xtend`.

(function () {
  'use strict';

  const Xtend = (self.Xtend = self.Xtend || {});

  Xtend.selectors = Object.freeze({
    /** Timeline post root: <div role="link" data-href="/<user>/status/<id>">. Quoted posts use the same. */
    postLink: '[role="link"][data-href*="/status/"]',
    /** Post body. On the status page the <article> is the root (no data-href above it). */
    article: 'article',

    /** Action bar candidates – the video's seek slider is a role="group" too, so filter by `reply`. */
    group: '[role="group"]',
    replyButton: '[data-engagement-action="reply"]',
    shareButton: '[data-engagement-action="share"]',
    engagementButton: 'button.x-engagement-button',

    video: 'video',
    photo: 'img[src^="https://pbs.twimg.com/media/"]',
    statusLink: 'a[href*="/status/"]',

    /** Share menu is rendered at the end of <body>; aria-labelledby points at the Share button. */
    menu: '[role="menu"]',
    menuItem: '[role="menuitem"]',
  });
})();
