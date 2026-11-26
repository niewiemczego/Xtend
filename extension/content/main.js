// Content script entry point – loaded last. Starts listening for page messages and
// watches the DOM for posts and Share menus.
//
// DOM observer and UI: #10 and #11.

(function () {
  'use strict';

  const Xtend = self.Xtend;

  // Content scripts run at document_start, so this is in place before X's first API call.
  Xtend.videoStore.listen();
})();
