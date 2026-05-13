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

// engine_commit_sha: a real SHA should come from the lockfile or a build-time
// injected env var on Day 4+. "dev" is intentionally non-production-looking
// so any run produced by this build cannot be mistaken for audit-bearing
// output.
const ENGINE_COMMIT_SHA = import.meta.env.VITE_ENGINE_COMMIT_SHA ?? "dev";

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
