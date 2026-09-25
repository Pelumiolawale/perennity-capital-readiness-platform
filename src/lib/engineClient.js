// @ts-check
/**
 * @typedef {import('@perennity/engine').ProjectInput} ProjectInput
 * @typedef {import('@perennity/engine').SnapshotOutput} SnapshotOutput
 * @typedef {import('@perennity/engine').AnyFramework} AnyFramework
 * @typedef {import('./targetLabels.js').TargetLabel} TargetLabel
 */
import {
  DeterministicEngine,
  SnapshotRenderer,
  BUNDLED_ACTIVITIES,
  METHODOLOGY_VERSION,
  computeKnowledgeBaseHash,
} from "@perennity/engine";
import { frameworksForLabel } from "./frameworkSets.js";

// Label → framework-set routing lives in frameworkSets.js, which is free of
// import.meta.env so Node scripts can load it. Re-exported so application code
// has one place to import engine concerns from.
export { frameworksForLabel, isRoutableTargetLabel } from "./frameworkSets.js";

// engine_commit_sha is audit-bearing and must always be defined at build time.
// vite.config.js parses it from package-lock.json's @perennity/engine entry
// and exposes it via define. No silent fallback — a missing SHA in a built
// artifact would be an audit regression and must fail loudly.
const ENGINE_COMMIT_SHA = import.meta.env.VITE_ENGINE_COMMIT_SHA;
if (!ENGINE_COMMIT_SHA) {
  throw new Error(
    "VITE_ENGINE_COMMIT_SHA not defined. Check vite.config.js — this is an " +
      "audit-bearing field and must always be set at build time.",
  );
}

// Pre-compute the KB hash once at module load. Stable for the lifetime of
// the page; refreshed on next reload (and on engine version bumps via the
// pinned dependency).
const KB_HASH = computeKnowledgeBaseHash(BUNDLED_ACTIVITIES);

const DISCLAIMER =
  "This output is not a regulated Article 26 assurance. It is an indicative " +
  "diagnostic intended to support decisions on whether to commission a " +
  "Project Readiness Report.";

/**
 * Run the deterministic engine and snapshot renderer against a ProjectInput.
 * Single entry point for the application to consume the engine — keeps the
 * structural gate (SnapshotOutput allowlist) at one boundary file.
 *
 * Snapshot honours `input.target_label` and loads the framework set via
 * frameworksForLabel(). SFDR labels surface SFDR criterion cells in the
 * heatmap; entity-axis criteria (c2/c3/c5/c7) resolve to insufficient_evidence
 * because the free Snapshot does NOT pass EntityInput — the gap is deliberate
 * "contact us for the paid Report" signalling on the diagnostic tier. The
 * allowlist gate in SnapshotOutput continues to protect against any
 * paid-tier content leaking.
 *
 * Falls back to EU Tax 8.1 only when target_label is omitted (back-compat for
 * any caller not yet threading target_label).
 *
 * @param {ProjectInput & { target_label?: string }} input
 * @returns {Promise<SnapshotOutput>}
 */
export async function runSnapshot(input) {
  const engine = new DeterministicEngine({
    engine_commit_sha: ENGINE_COMMIT_SHA,
    knowledge_base_hash: KB_HASH,
    methodology_version: METHODOLOGY_VERSION,
  });
  const renderer = new SnapshotRenderer({ disclaimer: DISCLAIMER });
  const frameworks = input.target_label
    ? frameworksForLabel(input.target_label)
    : BUNDLED_ACTIVITIES;
  const run = await engine.run(input, frameworks);
  return renderer.render(run);
}

// The audit-bearing engine constants, for the paid Report route. ReportRoute
// takes these from here and hands them to runReport (src/lib/reportRun.js),
// which is the paid path's engine entry point — so no route constructs the
// engine itself. reportRun.js is a separate, paid-only module because this file
// is imported by the free Snapshot (CLAUDE.md rule 1), and because it must not
// read import.meta.env: scripts/rescore.mjs runs it under plain Node.
export { ENGINE_COMMIT_SHA, KB_HASH, METHODOLOGY_VERSION, BUNDLED_ACTIVITIES };
