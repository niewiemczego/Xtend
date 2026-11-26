// A tiny test runner for DOM tests – no dependencies.
// Serve the repo root (python3 -m http.server) and open /tests/browser/.
// Results are shown on the page, in the console and in window.__results.

/* exported test, assert, fixtures, run */

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

const assert = {
  equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(
        `${message ? message + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      );
    }
  },
  ok(value, message) {
    if (!value) throw new Error(message || `expected a truthy value, got ${JSON.stringify(value)}`);
  },
  deepEqual(actual, expected, message) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) throw new Error(`${message ? message + ': ' : ''}expected ${b}, got ${a}`);
  },
};

const fixtureCache = new Map();

/**
 * Loads HTML fixtures into one inert document (no images or videos are fetched,
 * no scripts run) and returns it. Several fixtures can share a document, e.g. a post
 * and the Share menu it opened.
 */
async function fixtures(...names) {
  const doc = document.implementation.createHTMLDocument('fixture');
  for (const name of names) {
    if (!fixtureCache.has(name)) {
      const response = await fetch(`../fixtures/html/${name}`);
      if (!response.ok) throw new Error(`fixture not found: ${name}`);
      fixtureCache.set(name, await response.text());
    }
    const box = doc.createElement('div');
    box.dataset.fixture = name;
    box.innerHTML = fixtureCache.get(name);
    doc.body.appendChild(box);
  }
  return doc;
}

async function run() {
  const list = document.getElementById('results');
  const results = [];
  for (const { name, fn } of tests) {
    const item = document.createElement('li');
    try {
      await fn();
      results.push({ name, ok: true });
      item.className = 'pass';
      item.textContent = `✓ ${name}`;
    } catch (error) {
      results.push({ name, ok: false, error: String(error && error.message) });
      item.className = 'fail';
      item.textContent = `✗ ${name}`;
      const pre = document.createElement('pre');
      pre.textContent = String((error && error.stack) || error);
      item.appendChild(pre);
      console.error(`✗ ${name}`, error);
    }
    list.appendChild(item);
  }
  const failed = results.filter((r) => !r.ok).length;
  const summary = document.getElementById('summary');
  summary.className = failed ? 'fail' : 'pass';
  summary.textContent = `${results.length - failed} passed, ${failed} failed`;
  document.title = `${failed ? '✗' : '✓'} Xtend DOM tests`;
  console.log(`[xtend tests] ${summary.textContent}`);
  window.__results = { passed: results.length - failed, failed, results };
}
