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
});
