// @ts-check
/**
 * @typedef {import('@perennity/engine').ProjectInput} ProjectInput
 * @typedef {import('@perennity/engine').SnapshotOutput} SnapshotOutput
 */
import {
  DeterministicEngine,
  SnapshotRenderer,
  BUNDLED_ACTIVITIES,
  METHODOLOGY_VERSION,
  computeKnowledgeBaseHash,
} from "@perennity/engine";

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
 * @param {ProjectInput} input
 * @returns {Promise<SnapshotOutput>}
 */
export async function runSnapshot(input) {
  const engine = new DeterministicEngine({
    engine_commit_sha: ENGINE_COMMIT_SHA,
    knowledge_base_hash: KB_HASH,
    methodology_version: METHODOLOGY_VERSION,
  });
  const renderer = new SnapshotRenderer({ disclaimer: DISCLAIMER });
  const run = await engine.run(input, BUNDLED_ACTIVITIES);
  return renderer.render(run);
}
