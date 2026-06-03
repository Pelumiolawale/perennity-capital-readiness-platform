// @ts-check
/**
 * Day 2 wiring proof — proves @perennity/engine can be imported,
 * a DeterministicEngine.run() round-trips a ProjectInput, and
 * SnapshotRenderer.render() produces a SnapshotOutput whose fields
 * match the closed allowlist.
 *
 * This is throwaway. It will be deleted Day 3 when the Snapshot route
 * is wired up properly. Its only job is to prove the wiring works
 * before any UI code depends on it.
 */
import {
  DeterministicEngine,
  SnapshotRenderer,
  loadKnowledgeBase,
  computeKnowledgeBaseHash,
  METHODOLOGY_VERSION,
} from '@perennity/engine';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Resolve the bundled regulatory-knowledge/ path inside the installed engine
// package — no hardcoded /Users paths. createRequire is needed because
// import.meta.resolve doesn't return a filesystem path directly in all Node
// versions and we need the package.json location to walk back to the package
// root.
const require = createRequire(import.meta.url);
const enginePkgJson = require.resolve('@perennity/engine/package.json');
const knowledgeBasePath = join(dirname(enginePkgJson), 'regulatory-knowledge');

// loadKnowledgeBase signature confirmed against
//   node_modules/@perennity/engine/dist/knowledge/load.d.ts
//   loadKnowledgeBase(opts?: { rootDir?: string; schemaPath?: string; glob?: string }): Promise<KnowledgeBase>
// `rootDir` is the correct option name. The function accepts a path argument
// — no internal resolution-magic needed.
const kb = await loadKnowledgeBase({ rootDir: knowledgeBasePath });

// computeKnowledgeBaseHash takes Activity[], not the full KB object —
// adjusted from the spec's `computeKnowledgeBaseHash(kb)` per the .d.ts:
//   computeKnowledgeBaseHash(activities: Activity[]): string
// The KB object also carries kb.knowledge_base_hash already; this call
// reproduces the same value and exercises the named import explicitly.
const kb_hash = computeKnowledgeBaseHash(kb.activities);

// Activities live at kb.activities (Activity[]); kb.byId is a parallel
// Map<string, Activity> keyed by activity id. Using byId.get(...) is more
// explicit about which activity is being scored.
const activity_8_1 = kb.byId.get('eu_tax_climate_8_1');
if (!activity_8_1) {
  throw new Error('Activity eu_tax_climate_8_1 not found in installed knowledge base');
}

// Copied verbatim from eval/fixtures/hyperscale_frankfurt/input.json
// at engine commit a2f9bae4e2907d0cbd8fda2c54c72be1be082d06.
// Simplest happy-path fixture: all Activity 8.1 criteria pass or n/a,
// zero gaps, no estimation flags.
/** @type {import('@perennity/engine').ProjectInput} */
const projectInput = {
  project_id: 'PB-FX-001',
  intake_timestamp: '2026-05-01T09:30:00Z',
  facility_type: 'hyperscale',
  jurisdiction: 'DE',
  facility_status: 'operational',
  build_completion_year: 2020,
  data_points: {
    ecocc_practices_implemented: [
      'airflow_management',
      'free_cooling',
      'heat_reuse',
      'high_efficiency_ups',
    ],
    last_independent_audit_date: 'doc-audit-frankfurt-2024',
    annualised_pue: 1.32,
    climate_risk_assessment_completed: true,
    climate_risk_assessment_methodology:
      'TCFD-aligned scenario analysis using IPCC AR6 RCP 8.5',
    site_water_stress_classification: 'Low',
    wue_annualised: 0.25,
  },
  evidence_documents: [
    {
      document_id: 'doc-audit-frankfurt-2024',
      document_type: 'independent_audit',
      uri: 'https://evidence.test/audit-frankfurt-2024.pdf',
      uploaded_at: '2024-06-15T00:00:00Z',
      sha256: '1111111111111111111111111111111111111111111111111111111111111111',
    },
  ],
};

// methodology_version sourced from the engine's exported constant, which is
// the canonical home for audit-bearing IP version strings. The app never
// invents this value on its own. Paired with engine_commit_sha (the resolved
// SHA pinned in package-lock.json) and knowledge_base_hash to form the full
// provenance triple.
const engine = new DeterministicEngine({
  engine_commit_sha: 'a2f9bae4e2907d0cbd8fda2c54c72be1be082d06',
  knowledge_base_hash: kb_hash,
  methodology_version: METHODOLOGY_VERSION,
});

const run = await engine.run(projectInput, [activity_8_1]);

/** @type {import('@perennity/engine').SnapshotOutput} */
const snapshot = await new SnapshotRenderer({
  disclaimer:
    'This output is not a regulated Article 26 assurance. ' +
    'It is an indicative diagnostic intended to support decisions on ' +
    'whether to commission a Project Readiness Report.',
}).render(run);

console.log(JSON.stringify(snapshot, null, 2));

console.error('---');
console.error('run.run_id:', run.run_id);
console.error('snapshot.cta:', snapshot.cta);
console.error('snapshot.gap_list.length:', snapshot.gap_list.length);
console.error('snapshot.indicative_band:', snapshot.indicative_band);
