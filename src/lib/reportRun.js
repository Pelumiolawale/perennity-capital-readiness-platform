// @ts-check
// Paid-flow only. Import from /assessment/report and its children, and from
// scripts/ — never from the free Snapshot path (CLAUDE.md rule 1).
//
// The paid Report's engine entry point: one engagement in, one engine run out.
//
// This used to be inline in src/routes/ReportRoute.jsx, which constructed
// DeterministicEngine itself. That had two costs. The route bypassed the engine
// boundary that engineClient.js claimed to be. And nothing outside the route
// could reproduce a report's inputs, so "rescore every engagement before and
// after" (CLAUDE.md) had no tool behind it — the one attempt at a harness passed
// project_input alone, skipped the SFDR merge, and would have reported "no
// change" whatever the change was. The route and scripts/rescore.mjs now share
// this function, so the harness cannot drift from what clients receive.
//
// No import.meta.env here: the audit-bearing constants are injected. The route
// takes them from engineClient.js; the script supplies its own.

import {
  DeterministicEngine,
  ReportRenderer,
  BUNDLED_ACTIVITIES,
  buildRenderContract,
} from "@perennity/engine";
import { frameworksForLabel } from "./frameworkSets.js";
import { buildSFDRInputs } from "./sfdrInputAdapter.js";
import { buildUKSDRInputs } from "./ukSDRInputAdapter.js";
import { buildEntityInputs } from "./entityInputAdapter.js";

/**
 * Build the engine input for an engagement: project_input with the SFDR and
 * UK SDR blocks merged on, wrapped with the entity block when there is one.
 *
 * @param {any} engagement A normalised engagement from fetchEngagement().
 * @returns {any}
 */
export function assembleRunInput(engagement) {
  // Merge SFDR inputs onto project_input when the engagement carries
  // SFDR Specifics fields. Undefined when no SFDR fields populated —
  // the engine cleanly resolves every SFDR criterion to
  // insufficient_evidence in that case.
  const sfdrInputs = buildSFDRInputs(engagement);
  // v0.6.0 (UK SDR Phase 2): merge UK SDR inputs onto project_input
  // when the engagement carries UK SDR Specifics fields. Undefined
  // when no UK SDR fields populated — engine resolves every UK SDR
  // criterion to insufficient_evidence in that case.
  const ukSDRInputs = buildUKSDRInputs(engagement);
  const projectInput = {
    ...engagement.project_input,
    ...(sfdrInputs ? { sfdr: sfdrInputs } : {}),
    ...(ukSDRInputs ? { uk_sdr: ukSDRInputs } : {}),
  };
  // Entity-level inputs from the sfdr_entity_disclosures JSON blob field.
  // Undefined when the field is missing / empty / not recognised, in which
  // case the engine resolves c2/c3/c5/c7 to insufficient_evidence and
  // reportPDF surfaces the "ENTITY-LEVEL DISCLOSURE REQUIRED" callout for
  // those rows.
  const entityInput = buildEntityInputs(engagement);
  return entityInput ? { project: projectInput, entity: entityInput } : projectInput;
}

/**
 * Run the engine and renderer for one engagement.
 *
 * Throws on an unroutable or blank target_label (via frameworksForLabel). It
 * deliberately does NOT default a blank label to eu_taxonomy_aligned_8_1: that
 * default is how an unscoped engagement used to get a signed report against a
 * framework the client never chose. Callers that want a friendly refusal check
 * isRoutableTargetLabel first, as ReportRoute does.
 *
 * @param {any} engagement A normalised engagement from fetchEngagement().
 * @param {{
 *   engine_commit_sha: string,
 *   knowledge_base_hash: string,
 *   methodology_version: string,
 *   signatory: {name: string, title: string},
 *   disclaimer: string,
 * }} deps
 */
export async function runReport(engagement, deps) {
  const engine = new DeterministicEngine({
    engine_commit_sha: deps.engine_commit_sha,
    knowledge_base_hash: deps.knowledge_base_hash,
    methodology_version: deps.methodology_version,
  });
  const renderer = new ReportRenderer({
    activities: BUNDLED_ACTIVITIES,
    signatory: deps.signatory,
    disclaimer: deps.disclaimer,
    // Deliberately ignore the engine's run_id arg: the engine generates a
    // fresh UUID per render (useful internal serial for replay/debug),
    // but the public engagement_reference must be the stable Airtable
    // UUID Dolapo issued — the same value the customer typed in ?ref=
    // and the primary key of the Engagements row.
    engagement_reference_for: () => engagement.run_id,
    ic_defence_pack_version: "v1",
  });
  const frameworks = frameworksForLabel(engagement.target_label);
  const run = await engine.run(assembleRunInput(engagement), frameworks);
  const output = await renderer.render(run);
  // Build the v3.5 RenderContract alongside the legacy ReportOutput.
  // The PDF generator reads ReportOutput for the EU Tax 8.1 sections
  // (existing path) and the RenderContract for SFDR sections (new
  // path). When no SFDR frameworks are loaded, framework_findings
  // is empty and the SFDR section pages don't render.
  const contract = buildRenderContract(run, {
    project: {
      project_name: engagement?.report_metadata?.project_name ?? undefined,
    },
  });
  // The engine's own per-framework overall_verdict, keyed by activity_id.
  // The PDF must report the engine's verdict rather than derive one —
  // deriving it is what produced the false "aligned".
  const frameworkVerdicts = Object.fromEntries(
    (run.framework_results ?? [])
      .filter((f) => f && f.activity_id)
      .map((f) => [f.activity_id, f.overall_verdict]),
  );
  return { run, output, contract, frameworkVerdicts };
}
