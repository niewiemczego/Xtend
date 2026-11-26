// A small status message at the bottom of the page: "Downloading…", "Saved", or what went
// wrong. The Share menu closes on click, so this is where the result shows up.

(function () {
  'use strict';

  const Xtend = (self.Xtend = self.Xtend || {});

  const CLASS = 'xtend-toast';
  const VISIBLE = 'xtend-toast-visible';
  const SHOW_MS = { busy: 0, ok: 3000, error: 6000 }; // 0 = until replaced

  const timers = new WeakMap();

  function elementFor(doc) {
    let el = doc.querySelector(`.${CLASS}`);
    if (!el) {
      el = doc.createElement('div');
      el.className = CLASS;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      (doc.body || doc.documentElement).appendChild(el);
    }
    return el;
  }

  /**
   * @param {string} text
   * @param {'busy'|'ok'|'error'} kind
   * @param {Document} [doc]
   */
  function show(text, kind, doc) {
    const el = elementFor(doc || document);
    el.textContent = text;
    el.dataset.kind = kind;
    el.classList.add(VISIBLE);
    clearTimeout(timers.get(el));
    const ms = SHOW_MS[kind];
    if (ms) timers.set(el, setTimeout(() => el.classList.remove(VISIBLE), ms));
  }

  Xtend.toast = { show, CLASS, VISIBLE };
})();
