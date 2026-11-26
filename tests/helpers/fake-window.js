// Minimal stand-in for a browser window, just enough to run the extension's scripts
// in a Node `vm` context without any dependencies.

const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const EXT = join(__dirname, '..', '..', 'extension');
const ORIGIN = 'https://x.com';

/** A fresh XMLHttpRequest class per window, so patches don't leak between tests. */
function createXHRClass() {
  return class FakeXHR {
    constructor() {
      this.listeners = {};
      this.responseType = '';
      this.status = 0;
      this.responseText = '';
      this.response = null;
      this.sent = false;
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    send() {
      this.sent = true;
    }
    addEventListener(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    }
    /** Test helper: finish the request and fire `load`. */
    respond(status, body, responseType = '') {
      this.status = status;
      this.responseType = responseType;
      if (responseType === 'json') this.response = body;
      else this.responseText = typeof body === 'string' ? body : JSON.stringify(body);
      for (const fn of this.listeners.load || []) fn.call(this);
    }
  };
}

/**
 * @param {{ fetch?: Function, deliverMessages?: boolean }} options
 *   deliverMessages: postMessage dispatches a `message` event to this window's listeners
 */
function createWindow({ fetch, deliverMessages = false } = {}) {
  const listeners = {};
  const win = {
    location: { origin: ORIGIN },
    localStorage: { getItem: () => null },
    console,
    posted: [],
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    dispatchEvent(type, event) {
      for (const fn of listeners[type] || []) fn(event);
    },
    postMessage(data, targetOrigin) {
      win.posted.push({ data, targetOrigin });
      if (deliverMessages) win.dispatchEvent('message', { source: win.global, origin: ORIGIN, data });
    },
    XMLHttpRequest: createXHRClass(),
  };
  if (fetch) win.fetch = fetch;
  win.window = win;
  win.self = win;
  vm.createContext(win);
  // Inside the context `window` is V8's global proxy, not `win` itself – this is the
  // object scripts compare `event.source` against.
  Object.defineProperty(win, 'global', { value: vm.runInContext('globalThis', win) });
  return win;
}

/** Runs extension files (paths relative to extension/) in the window, in order. */
function load(win, ...files) {
  for (const file of files) {
    vm.runInContext(readFileSync(join(EXT, file), 'utf8'), win, { filename: file });
  }
  return win;
}

/** Lets pending promise callbacks run. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Plain copy of a value created inside the vm context (for deepEqual across realms). */
const plain = (value) => JSON.parse(JSON.stringify(value));

module.exports = { createWindow, load, flush, plain, ORIGIN };
