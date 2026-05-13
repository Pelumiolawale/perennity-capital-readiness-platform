import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Day 3 — skip pre-bundling jspdf because it dynamically imports the optional
  // peer `canvg` that's never installed. esbuild's dep optimization fails on
  // that unresolved import even though jspdf's own code wraps it in .catch().
  // Day 4 deletes pdfExport.js (the only consumer of jspdf in the app), at
  // which point this exclude can be removed.
  optimizeDeps: {
    exclude: ['jspdf'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  }
})
