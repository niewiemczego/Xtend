// Debug logs. Off by default; turn on in the x.com console with
//   localStorage.xtendDebug = '1'   (then refresh)
// and off with
//   localStorage.removeItem('xtendDebug')
// Every Xtend line starts with [xtend]. See "Troubleshooting" in the README.

(function () {
  'use strict';

  const Xtend = (self.Xtend = self.Xtend || {});

  function enabled() {
    try {
      return localStorage.getItem('xtendDebug') === '1';
    } catch (_) {
      return false;
    }
  }

  Xtend.debug = {
    enabled,
    log(...args) {
      if (enabled()) console.log('[xtend]', ...args);
    },
    warn(...args) {
      if (enabled()) console.warn('[xtend]', ...args);
    },
  };
})();
