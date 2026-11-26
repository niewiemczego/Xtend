// "Download video" in the Share menu (original posts and quote posts; no reposts yet).
//
// - X's own *Download video* item (original posts): left exactly as X renders it – cloning,
//   hiding or moving it broke the menu layout in the prototype. Its activation is taken over
//   in the capture phase on the document, before X's handlers, and runs Xtend's download.
// - No native item but the post has a video (e.g. a quote post whose quoted post has it):
//   our own item is added, cloned from the last item (*Post video*).
//
// The menu is rendered at the end of <body>; Xtend.post.postForMenu finds its post through
// aria-labelledby → Share button. Nothing is shown on the page; debug mode logs what happens.

(function () {
  'use strict';

  const Xtend = (self.Xtend = self.Xtend || {});
  const P = Xtend.post;
  const S = Xtend.selectors;

  const NATIVE_LABEL = 'Download video'; // as in tests/fixtures/html/share-menu-original.html
  const ITEM_CLASS = 'xtend-menu-item';
  const SWALLOWED = ['pointerdown', 'pointerup', 'mousedown', 'mouseup'];

  function isOurs(item) {
    return item.classList.contains(ITEM_CLASS);
  }

  function isNative(item) {
    return !isOurs(item) && item.textContent.trim() === NATIVE_LABEL;
  }

  /** Post with a video that `menu` was opened for, or null. */
  function videoPostFor(menu) {
    const post = P.postForMenu(menu);
    return post && P.hasVideo(post) ? post : null;
  }

  /** Our item, cloned from `template`: no id / data-* (X's wiring), our icon and label. */
  function createItem(template) {
    const item = template.cloneNode(true);
    for (const attr of Array.from(item.attributes)) {
      if (attr.name === 'id' || attr.name.startsWith('data-')) item.removeAttribute(attr.name);
    }
    item.classList.add(ITEM_CLASS);
    const icon = item.querySelector('svg');
    if (icon) icon.outerHTML = Xtend.download.ICON;
    const labels = Array.from(item.querySelectorAll('div, span')).filter(
      (el) => el.textContent.trim() && !el.querySelector('svg'),
    );
    const label = labels[labels.length - 1];
    if (label) label.textContent = NATIVE_LABEL;
    return item;
  }

  /** Adds our item to a menu of a video post that has no native one. */
  function prepare(menu) {
    if (!videoPostFor(menu)) return;
    const items = Array.from(menu.querySelectorAll(S.menuItem));
    if (!items.length || items.some(isOurs) || items.some(isNative)) return;
    const last = items[items.length - 1];
    last.after(createItem(last));
  }

  function scan(root) {
    for (const menu of root.querySelectorAll(S.menu)) prepare(menu);
  }

  // --- activation ----------------------------------------------------------------------

  /** The download item (native or ours) an event is aimed at, with its menu and post. */
  function hit(event) {
    const target = event.target;
    const item = target && target.closest ? target.closest(S.menuItem) : null;
    if (!item || !(isOurs(item) || isNative(item))) return null;
    const menu = item.closest(S.menu);
    const post = menu ? videoPostFor(menu) : null;
    return post ? { item, menu, post } : null; // unknown post → X's own behaviour
  }

  function closeMenu(menu) {
    menu.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }),
    );
  }

  function onActivate(event) {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    const found = hit(event);
    if (!found) return;
    Xtend.debug.log('Share menu: Download video', found.post);
    event.preventDefault();
    event.stopImmediatePropagation();
    closeMenu(found.menu);
    Xtend.download.start(found.post);
  }

  function swallow(event) {
    if (hit(event)) event.stopImmediatePropagation();
  }

  const installed = new WeakSet();

  /** Listens on `doc` in the capture phase – before X's handlers, which sit lower in the tree. */
  function install(doc) {
    if (installed.has(doc)) return;
    installed.add(doc);
    doc.addEventListener('click', onActivate, true);
    doc.addEventListener('keydown', onActivate, true);
    for (const type of SWALLOWED) doc.addEventListener(type, swallow, true);
  }

  Xtend.shareMenu = { install, scan, prepare, ITEM_CLASS, NATIVE_LABEL };
})();
