// "Copy embed link" in the Share menu: copies the post's link on fixupx.com (FxEmbed), so
// chat apps like Discord show the post with a video that plays inline.
//
//   /<user>/status/<id>  →  https://fixupx.com/<user>/status/<id>
//
// The link is built from the post's data-href (or the status page URL) – nothing is fetched.
// The clipboard is only written, never read. Nothing is shown on the page; debug mode logs
// the copied link or why copying failed.

(function () {
  'use strict';

  const Xtend = (self.Xtend = self.Xtend || {});
  const S = Xtend.selectors;

  /**
   * Path of the post (`/<user>/status/<id>`): its own data-href, otherwise the status page URL.
   * For a quote post this is the outer post – the one whose Share menu was opened.
   * @param {Element} post
   * @param {{pathname?: string}} [opts]  page path (defaults to location.pathname)
   */
  function pathOf(post, opts) {
    if (!post) return null;
    const link = post.closest(S.postLink);
    if (link) return link.getAttribute('data-href');
    return opts && opts.pathname !== undefined ? opts.pathname : location.pathname;
  }

  /** The fixupx.com link for `post`, or null when its path isn't a post path. */
  function linkFor(post, opts) {
    return self.XtendPostLink.embedPostUrl(pathOf(post, opts));
  }

  /** Fallback for browsers without navigator.clipboard (or when it refuses): the copy event. */
  function copyWithEvent(text) {
    let done = false;
    const onCopy = (event) => {
      event.clipboardData.setData('text/plain', text);
      event.preventDefault();
      done = true;
    };
    document.addEventListener('copy', onCopy, true);
    try {
      document.execCommand('copy');
    } catch (_) {
      // done stays false
    } finally {
      document.removeEventListener('copy', onCopy, true);
    }
    return done;
  }

  /** Writes `text` to the clipboard. Must run inside the click / key handler (user activation). */
  async function write(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      Xtend.debug.warn('clipboard.writeText failed, trying the copy event', error);
    }
    return copyWithEvent(text);
  }

  /** Copies the embed link for `post`. Resolves to the link, or null if nothing was copied. */
  async function copy(post) {
    const link = linkFor(post);
    if (!link) {
      Xtend.debug.warn('embed link: no post path found', post);
      return null;
    }
    const ok = await Xtend.embedLink.write(link);
    if (ok) Xtend.debug.log(`copied embed link: ${link}`);
    else Xtend.debug.warn(`embed link: could not copy ${link}`);
    return ok ? link : null;
  }

  // `write` is looked up on the object at call time so DOM tests can replace it.
  Xtend.embedLink = { pathOf, linkFor, copy, write };
})();
