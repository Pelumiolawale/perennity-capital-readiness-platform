// @ts-check
/**
 * Engine v4.0 adapter — translation layer, NOT a rewrite.
 *
 * Decision 2 (12 Aug 2026): the SPA integrates Engine v4.0 via an adapter.
 * This file is that adapter, and it is the ONLY file that knows v4 exists.
 *
 * ============================================================================
 * WHAT THIS DOES — and, more importantly, what it deliberately does not
 * ============================================================================
 *
 * Engine v4.0 adds a lens architecture (SFDR 2.0 categories, UK SDR label fit)
 * that answers DIFFERENT regulatory questions from the v3.5 path the SPA renders
 * today. v4's EU lens assesses the PROPOSED SFDR 2.0 category regime; the
 * shipping SFDR Art 8/9 scorers assess the regime that is actually in force.
 * Both are correct. They are not interchangeable, and swapping one for the other
 * would silently change what customers are told they were assessed against.
 *
 * So this adapter is deliberately conservative:
 *
 *   - The USER-FACING display path is unchanged. `runSnapshotV4` returns a
 *     SnapshotOutput that is deep-equal to `runSnapshot`'s, because it renders
 *     the same legacy engine run through the same renderer. That equivalence is
 *     locked by test, not by good intentions.
 *
 *   - The v4 surface runs ALONGSIDE it, additively. Its output is returned on a
 *     separate channel that no current component reads, and it is what makes
 *     benchmark records accrue from day one (Decision 3).
 *
 *   - `lensVerdictsToDisplayContract` is the actual translation: it projects v4
 *     lens verdicts into the SAME HeatmapCell display contract the SPA already
 *     renders. It exists and is tested now, so that turning v4 on later is a
 *     surface flip rather than a rendering rewrite.
 *
 * Customer-facing release stays gated. Nothing here changes what a user sees.
 *
 * @typedef {import('@perennity/engine').ProjectInput} ProjectInput
 * @typedef {import('@perennity/engine').SnapshotOutput} SnapshotOutput
 * @typedef {import('@perennity/engine').HeatmapCell} HeatmapCell
 */

import { SnapshotRenderer } from "@perennity/engine";
import { assess } from "@perennity/engine/v4";
import {
  ENGINE_COMMIT_SHA,
  KB_HASH,
  METHODOLOGY_VERSION,
  runSnapshot,
} from "./engineClient.js";

/**
 * Must match engineClient.js's DISCLAIMER exactly. Duplicated rather than
 * exported-and-shared because engineClient.js is the single engine import
 * boundary (CLAUDE.md non-negotiable) and widening its export surface for a
 * string is a worse trade than this comment plus the equivalence test that
 * would fail immediately if they ever drift.
 */
const DISCLAIMER =
  "This output is not a regulated Article 26 assurance. It is an indicative " +
  "diagnostic intended to support decisions on whether to commission a " +
  "Project Readiness Report.";

/**
 * Drop-in replacement for `runSnapshot`. Returns the SAME user-facing output.
 *
 * This is the function a route would swap to in order to adopt v4 without any
 * visible change. It is intentionally boring: it delegates the display path
 * wholesale to the existing implementation.
 *
 * @param {ProjectInput & { target_label?: string }} input
 * @returns {Promise<SnapshotOutput>}
 */
export async function runSnapshotV4(input) {
  return runSnapshot(input);
}

/**
 * @typedef {object} V4AssessmentResult
 * @property {SnapshotOutput} snapshot   User-facing output. Unchanged from today.
 * @property {object[]} lensVerdicts     v4 lens verdicts. Not rendered yet.
 * @property {object[]} lensErrors       Failure-isolated lens errors (US stub lands here).
 * @property {HeatmapCell[]} v4DisplayCells  v4 verdicts projected into the display contract.
 * @property {object[]} legacyFrameworkResults  v3.5-shaped projection of each lens verdict.
 * @property {object} canonical          Canonical metrics snapshot.
 * @property {object|null} benchmark     Anonymised benchmark record, or null if unavailable.
 * @property {string} benchmarkSaltSource "env" | "explicit" | "none".
 */

/**
 * Run BOTH surfaces: the legacy display path (authoritative for what the user
 * sees) and the v4 lens path (additive).
 *
 * A v4 failure must never break a snapshot. The v4 half is wrapped so that any
 * error degrades to "no v4 data" rather than taking down a customer-facing
 * page — the same discipline the engine applies to benchmark emission.
 *
 * @param {ProjectInput & { target_label?: string }} input
 * @returns {Promise<V4AssessmentResult>}
 */
export async function runAssessmentV4(input) {
  const snapshot = await runSnapshot(input);

  /** @type {V4AssessmentResult} */
  const result = {
    snapshot,
    lensVerdicts: [],
    lensErrors: [],
    v4DisplayCells: [],
    legacyFrameworkResults: [],
    canonical: {},
    benchmark: null,
    benchmarkSaltSource: "none",
  };

  try {
    // No storageAdapter and no salt in the browser — by design. The salt is
    // server-side only (it would be public in a bundle), so the browser builds
    // the record and a serverless route is what persists it. See the engine's
    // ENGINE-REFERENCE.md § "Where the salt lives".
    const v4 = await assess(input, { benchmarkLogger: () => {} });
    result.lensVerdicts = v4.verdicts;
    result.lensErrors = v4.lensErrors;
    result.canonical = v4.canonical;
    result.benchmark = v4.benchmarkRecord;
    result.benchmarkSaltSource = v4.benchmarkSaltSource;
    result.legacyFrameworkResults = v4.legacyFrameworkResults;
    result.v4DisplayCells = await lensVerdictsToDisplayContract(
      v4.legacyFrameworkResults,
      input,
    );
  } catch (err) {
    // Deliberately swallowed. v4 is not yet load-bearing for anything the user
    // sees; a failure here must not degrade the snapshot.
    result.lensErrors = [
      { lensId: "v4_adapter", message: err instanceof Error ? err.message : String(err) },
    ];
  }

  return result;
}

/**
 * THE TRANSLATION LAYER.
 *
 * Projects v4 lens output — already shaped as v3.5 `FrameworkResult`s by the
 * engine's legacy adapter — into the HeatmapCell display contract the SPA
 * renders today. Runs the real `SnapshotRenderer`, so the cells are produced by
 * the same code path that produces today's cells: if this returns cells, the
 * existing components can render them with no changes.
 *
 * Note this is a STRUCTURAL bridge, not a semantic one. The cells describe SFDR
 * 2.0 categories and UK SDR label fit — different questions from the current
 * output. Rendering them to customers is a product decision, gated separately.
 *
 * @param {object[]} legacyFrameworkResults From `assess().legacyFrameworkResults`.
 * @param {ProjectInput} input
 * @returns {Promise<HeatmapCell[]>}
 */
export async function lensVerdictsToDisplayContract(legacyFrameworkResults, input) {
  const renderer = new SnapshotRenderer({ disclaimer: DISCLAIMER });
  const run = {
    run_id: "v4-adapter-projection",
    run_timestamp: input.intake_timestamp,
    methodology_version: METHODOLOGY_VERSION,
    engine_commit_sha: ENGINE_COMMIT_SHA,
    knowledge_base_hash: KB_HASH,
    project_input: input,
    framework_results: legacyFrameworkResults,
    gap_list: [],
  };
  // SnapshotRenderer.render is async — awaiting is not optional.
  // @ts-expect-error — structural EngineRun assembled for projection only.
  const rendered = await renderer.render(run);
  return rendered.heatmap;
}

/**
 * True when two snapshots are identical in everything a user can see.
 *
 * `run_id` and `generated_at` are excluded: they are per-run identifiers, not
 * user-facing content, and comparing them would make every equivalence check
 * fail for the wrong reason.
 *
 * @param {SnapshotOutput} a
 * @param {SnapshotOutput} b
 * @returns {boolean}
 */
export function isUserFacingEquivalent(a, b) {
  return (
    JSON.stringify(stripVolatile(a)) === JSON.stringify(stripVolatile(b))
  );
}

/**
 * @param {SnapshotOutput} s
 * @returns {Omit<SnapshotOutput, "run_id" | "generated_at">}
 */
function stripVolatile(s) {
  const { run_id: _runId, generated_at: _generatedAt, ...rest } = s;
  return rest;
}
