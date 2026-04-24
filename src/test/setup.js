// Vitest global test setup.
//
// - fake-indexeddb polyfill: jsdom does not expose indexedDB; the
//   auth + assessment stores need a working implementation. Using
//   the `auto` subpath installs the polyfill onto the global scope
//   for every test.
// - Web Crypto: Node 20+ exposes crypto.subtle natively, so no
//   shim is needed.
// - localStorage: provided by jsdom.

import 'fake-indexeddb/auto';

// Reset indexedDB between tests so persistence from one test
// does not leak into another. Each test gets a clean DB.
import { IDBFactory } from 'fake-indexeddb';
import { afterEach } from 'vitest';

// jsdom 29 under vitest 4 + Node 25 exposes localStorage as `{}`
// rather than a working Storage instance (likely a --localstorage-file
// CLI arg collision). Provide a minimal in-memory polyfill so the
// auth session layer can round-trip reliably in tests.
function installLocalStoragePolyfill() {
  const store = new Map();
  const ls = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(String(k), String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
    key(i) { return [...store.keys()][i] ?? null; },
    get length() { return store.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: ls, writable: true, configurable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: ls, writable: true, configurable: true,
    });
  }
}
installLocalStoragePolyfill();

afterEach(() => {
  globalThis.indexedDB = new IDBFactory();
  try { localStorage.clear(); } catch {}
});
