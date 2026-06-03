import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom gives us localStorage, crypto (node's Web Crypto), and a
    // DOM so React imports don't blow up in tests that don't touch
    // the browser. IndexedDB is polyfilled per-test via the
    // test-setup file (fake-indexeddb/auto).
    environment: 'jsdom',
    // jsdom disables localStorage for opaque origins — provide a URL
    // so storage APIs work inside the auth + session tests.
    environmentOptions: {
      jsdom: { url: 'http://localhost/' },
    },
    setupFiles: ['./src/test/setup.js'],
    globals: false,
  },
  // Stub the build-time-injected engine SHA so engineClient.js (which
  // throws at module load if VITE_ENGINE_COMMIT_SHA is undefined) can be
  // imported by unit tests. In production this value is parsed from
  // package-lock.json by vite.config.js's define block; in tests we just
  // need a non-empty string.
  define: {
    'import.meta.env.VITE_ENGINE_COMMIT_SHA': JSON.stringify('test-sha-vitest'),
  },
});
