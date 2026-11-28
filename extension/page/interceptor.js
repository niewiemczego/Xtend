// Runs in the page's MAIN world at document_start, after shared/video-media.js.
// Reads the GraphQL responses X already loads (fetch, XHR and SSR hydration), finds media links with
// XtendVideoMedia and forwards them to the content script:
//
//   window.postMessage({ source: 'xtend', type: 'media', items: MediaItem[] }, location.origin)
//
// Rules: never change what X receives (same promise, same response, same errors),
// every hook is wrapped in try/catch, and the script installs itself only once.

(function () {
  'use strict';

  const INSTALLED = Symbol.for('xtend.interceptor');
  if (window[INSTALLED]) return;
  Object.defineProperty(window, INSTALLED, { value: true });

  const media = self.XtendVideoMedia;
  if (!media) return;

  // e.g. https://x.com/i/api/graphql/<hash>/HomeTimeline?variables=…
  const GRAPHQL_URL = /\/graphql\//;

  function publish(json) {
    let items;
    try {
      items = media.extractFromGraphQL(json);
    } catch (_) {
      return;
    }
    if (items.length) {
      window.postMessage({ source: 'xtend', type: 'media', items }, location.origin);
    }
  }

  function urlOf(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.href === 'string') return input.href; // URL
    if (input && typeof input.url === 'string') return input.url; // Request
    return '';
  }

  // --- fetch ---------------------------------------------------------------
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function fetch(input) {
      const promise = originalFetch.apply(this, arguments);
      try {
        if (GRAPHQL_URL.test(urlOf(input))) {
          promise
            .then((response) => (response && response.ok ? response.clone().json() : null))
            .then(publish)
            .catch(() => {});
        }
      } catch (_) {
        // never affect X's request
      }
      return promise;
    };
  }

  // --- XMLHttpRequest -------------------------------------------------------
  const XHR = window.XMLHttpRequest;
  if (typeof XHR === 'function') {
    const requestUrl = new WeakMap();
    const originalOpen = XHR.prototype.open;
    const originalSend = XHR.prototype.send;

    XHR.prototype.open = function open(_method, url) {
      try {
        requestUrl.set(this, String(url));
      } catch (_) {
        // ignore
      }
      return originalOpen.apply(this, arguments);
    };

    XHR.prototype.send = function send() {
      try {
        if (GRAPHQL_URL.test(requestUrl.get(this) || '')) {
          this.addEventListener('load', () => {
            try {
              if (this.status < 200 || this.status >= 300) return;
              if (this.responseType === '' || this.responseType === 'text') {
                publish(JSON.parse(this.responseText));
              } else if (this.responseType === 'json') {
                publish(this.response);
              }
            } catch (_) {
              // not JSON – ignore
            }
          });
        }
      } catch (_) {
        // never affect X's request
      }
      return originalSend.apply(this, arguments);
    };
  }

  // --- SSR hydration (TanStack Start $_TSR) ---------------------------------
  // On direct post loads / refreshes, X embeds initial GraphQL responses in
  // $_TSR.router.dehydratedData.messagesBeforeDehydration and streams further
  // ones (e.g. TweetDetail) through a seroval stream in $R.tsr, then deletes
  // $_TSR once hydration finishes.
  const watchedStreams = new WeakSet();

  function publishRelayMessage(msg) {
    try {
      const value = msg && msg.result && msg.result.value;
      if (typeof value === 'string' && value.includes('media_entities2')) {
        publish(JSON.parse(value));
      }
    } catch (_) {
      // not GraphQL JSON – ignore
    }
  }

  function watchSerovalStreams() {
    try {
      const tsr = self.$R && self.$R.tsr;
      if (!Array.isArray(tsr)) return;
      for (const entry of tsr) {
        if (
          entry &&
          entry.__SEROVAL_STREAM__ === true &&
          typeof entry.on === 'function' &&
          !watchedStreams.has(entry)
        ) {
          watchedStreams.add(entry);
          entry.on({ next: publishRelayMessage, throw() {}, return() {} });
        }
      }
    } catch (_) {
      // never affect X's hydration
    }
  }

  function inspectRouter(router) {
    try {
      const dehydrated = router && router.dehydratedData;
      const messages = dehydrated && dehydrated.messagesBeforeDehydration;
      if (Array.isArray(messages)) {
        for (const msg of messages) publishRelayMessage(msg);
      }
    } catch (_) {
      // ignore
    }
    watchSerovalStreams();
  }

  function watchTsrObject(tsr) {
    if (!tsr || typeof tsr !== 'object') return;
    if (tsr.router) inspectRouter(tsr.router);
    try {
      let currentRouter = tsr.router;
      Object.defineProperty(tsr, 'router', {
        configurable: true,
        enumerable: true,
        get() {
          return currentRouter;
        },
        set(value) {
          currentRouter = value;
          inspectRouter(value);
        },
      });
    } catch (_) {
      // non-configurable or frozen – ignore
    }
  }

  try {
    let currentTsr = window.$_TSR;
    if (currentTsr) watchTsrObject(currentTsr);
    Object.defineProperty(window, '$_TSR', {
      configurable: true,
      enumerable: false,
      get() {
        return currentTsr;
      },
      set(value) {
        currentTsr = value;
        watchTsrObject(value);
      },
    });
  } catch (_) {
    // never affect X
  }
})();
