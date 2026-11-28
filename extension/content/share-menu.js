// "Download video", "Download photo(s)" and "Copy embed link" in the Share menu (original posts,
// reposts of them, and quote posts).
//
// - X's own *Download video* item (original posts): left exactly as X renders it – cloning,
//   hiding or moving it broke the menu layout in the prototype. Its activation is taken over
//   in the capture phase on the document, before X's handlers, and runs Xtend's download.
// - No native item for a video post (e.g. a quote post whose quoted post has a video):
//   our own *Download video* item is added, cloned from the last item.
// - Photo post (original, repost or quote): our own *Download photo* (or *Download photos* for
//   multiple) item is added, cloned from the last item.
// - Every post: our own *Copy embed link* item is added right after X's *Copy link*, cloned
//   from it (so it keeps X's link icon). It copies the post's fixupx.com link (content/embed-link.js).
//
// The menu is rendered at the end of <body>; Xtend.post.postForMenu finds its post through
// aria-labelledby → Share button. Nothing is shown on the page; debug mode logs what happens.

(function () {
  'use strict';

  const Xtend = (self.Xtend = self.Xtend || {});
  const P = Xtend.post;
  const S = Xtend.selectors;

  const NATIVE_LABEL = 'Download video'; // as in tests/fixtures/html/share-menu-original.html
  const PHOTO_LABEL = 'Download photo';
  const PHOTO_LABEL_PLURAL = 'Download photos';
  const COPY_LINK_LABEL = 'Copy link'; // X's own item, as in tests/fixtures/html/share-menu-original.html
  const EMBED_LABEL = 'Copy embed link';
  const ITEM_CLASS = 'xtend-menu-item';
  const SWALLOWED = ['pointerdown', 'pointerup', 'mousedown', 'mouseup'];

  /** @type {WeakMap<Element, 'video'|'photo'|'embed'>} */
  const itemKind = new WeakMap();

  function isOurs(item) {
    return item.classList.contains(ITEM_CLASS);
  }

  function isNative(item) {
    return !isOurs(item) && item.textContent.trim() === NATIVE_LABEL;
  }

  function kindOf(item) {
    return itemKind.get(item) || null;
  }

  function isCopyLink(item) {
    return !isOurs(item) && item.textContent.trim() === COPY_LINK_LABEL;
  }

  /**
   * Our item, cloned from `template`: no id / data-* (X's wiring), our label and – unless
   * `keepIcon` – our download icon.
   */
  function createItem(template, labelText, kind, keepIcon) {
    const item = template.cloneNode(true);
    for (const attr of Array.from(item.attributes)) {
      if (attr.name === 'id' || attr.name.startsWith('data-')) item.removeAttribute(attr.name);
    }
    item.classList.add(ITEM_CLASS);
    const icon = item.querySelector('svg');
    if (icon && !keepIcon) icon.outerHTML = Xtend.download.ICON;
    const labels = Array.from(item.querySelectorAll('div, span')).filter(
      (el) => el.textContent.trim() && !el.querySelector('svg'),
    );
    const label = labels[labels.length - 1];
    if (label) label.textContent = labelText;
    itemKind.set(item, kind);
    return item;
  }

  /** Adds our items to a post's Share menu when needed: embed link always, downloads for media. */
  function prepare(menu) {
    const post = P.postForMenu(menu);
    if (!post) return;
    const wantVideo = P.hasVideo(post);
    const wantPhoto = P.hasPhoto(post);
    const wantEmbed = !!Xtend.embedLink.linkFor(post);

    const items = Array.from(menu.querySelectorAll(S.menuItem));
    if (!items.length) return;
    const template = items[items.length - 1];
    let tail = template;

    if (wantEmbed && !items.some((i) => kindOf(i) === 'embed')) {
      const copyLink = items.find(isCopyLink);
      const embedItem = createItem(copyLink || template, EMBED_LABEL, 'embed', !!copyLink);
      (copyLink || template).after(embedItem);
      if (!copyLink) tail = embedItem;
    }

    if (wantVideo && !items.some(isNative) && !items.some((i) => kindOf(i) === 'video')) {
      const videoItem = createItem(template, NATIVE_LABEL, 'video');
      tail.after(videoItem);
      tail = videoItem;
    }
    if (wantPhoto && !items.some((i) => kindOf(i) === 'photo')) {
      const label = Xtend.videoResolver.photoCount(post) > 1 ? PHOTO_LABEL_PLURAL : PHOTO_LABEL;
      tail.after(createItem(template, label, 'photo'));
    }
  }

  function scan(root) {
    for (const menu of root.querySelectorAll(S.menu)) prepare(menu);
  }

  // --- activation ----------------------------------------------------------------------

  /** The download item (native or ours) an event is aimed at, with its menu, post and kind. */
  function hit(event) {
    const target = event.target;
    const item = target && target.closest ? target.closest(S.menuItem) : null;
    if (!item) return null;
    let kind = kindOf(item);
    if (!kind) {
      if (!isNative(item)) return null;
      kind = 'video';
    }
    const menu = item.closest(S.menu);
    const post = menu ? P.postForMenu(menu) : null;
    if (!post) return null;
    if (kind === 'video' && !P.hasVideo(post)) return null; // unknown / non-video post → X's own behaviour
    if (kind === 'photo' && !P.hasPhoto(post)) return null;
    if (kind === 'embed' && !Xtend.embedLink.linkFor(post)) return null;
    return { item, menu, post, kind };
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
    Xtend.debug.log(`Share menu: ${found.item.textContent.trim()}`, found.post);
    event.preventDefault();
    event.stopImmediatePropagation();
    if (found.kind === 'embed') {
      // before closing the menu: the clipboard write needs this click's user activation
      Xtend.embedLink.copy(found.post);
      closeMenu(found.menu);
      return;
    }
    closeMenu(found.menu);
    Xtend.download.start(found.post, { kind: found.kind });
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

  Xtend.shareMenu = {
    install,
    scan,
    prepare,
    ITEM_CLASS,
    NATIVE_LABEL,
    PHOTO_LABEL,
    PHOTO_LABEL_PLURAL,
    EMBED_LABEL,
  };
})();
