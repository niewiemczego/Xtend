// Content script entry point – loaded last. Starts listening for page messages and
// watches the DOM for posts (and, in #11, Share menus).

(function () {
  'use strict';

  const Xtend = self.Xtend;

  // Content scripts run at document_start, so this is in place before X's first API call.
  Xtend.videoStore.listen();

  // X renders posts continuously (scrolling, navigation, lazy media). Rescan once per frame
  // at most, whatever the number of DOM changes.
  let scheduled = false;
  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      Xtend.downloadButton.scan(document);
    });
  }

  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
  scheduleScan();
})();
