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

const osShimPath = resolve(__dirname, 'src/lib/os-shim.js')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // @perennity/engine's KB loader transitively pulls in fast-glob, which
      // calls os.platform()/os.cpus()/path.posix.dirname at MODULE INIT.
      // Vite externalizes Node built-ins in browser builds to {}, so init
      // throws "platform is not a function" and React never mounts (blank
      // page). Aliasing os/path to a tiny shim lets module init succeed; the
      // downstream fast-glob runtime is dead in the browser code path (we
      // consume the engine's statically-bundled BUNDLED_ACTIVITIES, not its
      // filesystem KB loader). See src/lib/os-shim.js for the shim surface.
      'os': osShimPath,
      'node:os': osShimPath,
      'path': osShimPath,
      'node:path': osShimPath,
    },
  },
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

    // Shim Node-environment APIs that browser-bundled libs occasionally probe
    // during module init. jspdf calls process.platform inside a Node-branch
    // check; without these defines the production Rollup bundle ships the
    // unshimmed reference, throws "t.platform is not a function" at runtime,
    // and React never mounts (blank page). The dev-server case is handled
    // separately by optimizeDeps.exclude: ['jspdf'] above — different parts of
    // the build pipeline (dev = esbuild pre-bundling, prod = Rollup), each
    // needs its own fix.
    'process.platform': JSON.stringify(''),
    'process.env': JSON.stringify({}),
    'global': 'globalThis',
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      // jspdf does a `import("canvg").catch(...)` for optional SVG rendering;
      // canvg is jspdf's optional peer and is skipped on macOS/x64 by npm.
      // The optimizeDeps.exclude above handles the dev-server (esbuild) side;
      // this entry handles the prod-build (Rollup) side. Symmetric fix:
      // Rollup leaves the dynamic import unresolved and jspdf's runtime
      // .catch() handles the missing module. snapshotPDF.js uses only text/
      // rect primitives — never the SVG path.
      external: ['canvg'],
    },
  },
})
