// Every selector for X's markup lives here. When X changes its HTML, this is the file to update.
//
// Content scripts listed in the manifest share one scope; each file adds its part to `Xtend`.
// To be implemented in #7.

(function () {
  'use strict';

  const Xtend = (self.Xtend = self.Xtend || {});

  Xtend.selectors = {};
})();
