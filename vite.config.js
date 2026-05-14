import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Read the engine commit SHA from package-lock.json at config-evaluation
// time and expose it as VITE_ENGINE_COMMIT_SHA. Audit-bearing field — fail
// loudly if missing rather than silently defaulting to a placeholder. The
// SHA flows into EngineDeps.engine_commit_sha and therefore into
// SnapshotOutput / ReportOutput / RunManifest provenance.
function readEngineCommitSha() {
  let lockfile
  try {
    lockfile = JSON.parse(
      readFileSync(resolve(__dirname, 'package-lock.json'), 'utf8'),
    )
  } catch (e) {
    throw new Error(
      `vite.config: failed to read package-lock.json — ${e.message}`,
    )
  }
  const entry = lockfile.packages?.['node_modules/@perennity/engine']
  if (!entry?.resolved) {
    throw new Error(
      'vite.config: cannot find @perennity/engine entry in package-lock.json. ' +
        'engine_commit_sha is audit-bearing — refusing to build without it.',
    )
  }
  const m = entry.resolved.match(/#([a-f0-9]{40})$/)
  if (!m) {
    throw new Error(
      `vite.config: cannot parse SHA from @perennity/engine resolved URL: ${entry.resolved}. ` +
        'Expected full 40-char hash at end of git URL.',
    )
  }
  return m[1]
}

const ENGINE_COMMIT_SHA = readEngineCommitSha()

export default defineConfig({
  plugins: [react()],
  // jspdf dynamically imports the optional peer `canvg` (for SVG rendering)
  // which is never installed. The dynamic import is wrapped in .catch() so
  // it's harmless at runtime, but esbuild's pre-bundling fails on the
  // unresolved import. Excluding jspdf from optimizeDeps skips pre-bundling
  // and lets the .catch() handle the missing dep at runtime. snapshotPDF.js
  // uses only text/rect primitives — never the SVG path.
  optimizeDeps: {
    exclude: ['jspdf'],
  },
  define: {
    'import.meta.env.VITE_ENGINE_COMMIT_SHA': JSON.stringify(ENGINE_COMMIT_SHA),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
