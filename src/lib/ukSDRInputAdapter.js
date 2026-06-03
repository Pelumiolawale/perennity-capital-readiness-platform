// @ts-check
// Paid-flow only — see CLAUDE.md. Do not import from /assessment/snapshot or
// any free-tier component.
//
// UK SDR Input Adapter — maps Airtable engagement UK SDR fields onto the
// v3.5 engine input shape (ProjectUKSDRInputs).
//
// Status: Phase 2 / v0.6.0 ships the engine UK SDR scoring path and the
// label routing in engineClient.js. Airtable intake columns for UK SDR
// (uk_sdr_standard_claimed, uk_sdr_kpis_committed, uk_sdr_improvement_plan,
// uk_sdr_impact_plan) are NOT yet provisioned — that lands in a follow-up
// "UK SDR Specifics" commit alongside the wizard intake fields.
//
// In the interim, UK SDR engagements that route through this adapter return
// `undefined`, which the engine treats as insufficient_evidence at every
// UK SDR criterion (the same default as SFDR before the Airtable columns
// landed). The framework_results still surface in the heatmap with full
// per-criterion rationale, so the paid PDF renders informatively even
// without intake data populated.
//
// The shape returned matches @perennity/engine's ProjectUKSDRInputs export;
// when Airtable columns land, this adapter wires raw values straight in.

/** @typedef {import('@perennity/engine').ProjectUKSDRInputs} ProjectUKSDRInputs */
/** @typedef {import('@perennity/engine').UKSDRClaimedStandard} UKSDRClaimedStandard */
/** @typedef {import('@perennity/engine').UKSDRKPIName} UKSDRKPIName */
/** @typedef {import('@perennity/engine').UKSDRReportingFrequency} UKSDRReportingFrequency */

/**
 * @typedef {Object} EngagementUKSDRRaw
 * @property {UKSDRClaimedStandard} [uk_sdr_standard_claimed]
 * @property {UKSDRKPIName[]} [uk_sdr_kpis_committed]
 * @property {UKSDRReportingFrequency} [uk_sdr_reporting_frequency]
 * @property {string} [uk_sdr_improvement_plan] - JSON string (parsed below)
 * @property {string} [uk_sdr_impact_plan] - JSON string (parsed below)
 */

/**
 * Safe JSON.parse — returns undefined on any parse error rather than
 * throwing. The engine treats undefined nested fields as insufficient
 * evidence; better to surface that signal than to halt the paid PDF render
 * on a malformed Airtable JSON blob.
 *
 * @template T
 * @param {string | undefined} raw
 * @returns {T | undefined}
 */
function safeJsonParse(raw) {
  if (!raw || typeof raw !== "string") return undefined;
  try {
    return /** @type {T} */ (JSON.parse(raw));
  } catch {
    return undefined;
  }
}

/**
 * Build the ProjectUKSDRInputs shape the engine consumes from a (future)
 * Airtable engagement row. Returns undefined when no UK SDR fields are
 * populated — the engine then resolves every UK SDR criterion to
 * insufficient_evidence, which is the correct signal for an engagement
 * that has not yet completed UK SDR intake.
 *
 * @param {EngagementUKSDRRaw | undefined | null} raw
 * @returns {ProjectUKSDRInputs | undefined}
 */
export function buildUKSDRInputs(raw) {
  if (!raw) return undefined;
  const standard = raw.uk_sdr_standard_claimed;
  const kpis = Array.isArray(raw.uk_sdr_kpis_committed)
    ? raw.uk_sdr_kpis_committed
    : undefined;
  const freq = raw.uk_sdr_reporting_frequency;
  const improvement = safeJsonParse(raw.uk_sdr_improvement_plan);
  const impact = safeJsonParse(raw.uk_sdr_impact_plan);

  // If every field is empty, return undefined so the engine takes the
  // insufficient_evidence path uniformly rather than carrying an empty
  // ProjectUKSDRInputs object.
  if (!standard && !kpis && !freq && !improvement && !impact) {
    return undefined;
  }

  /** @type {ProjectUKSDRInputs} */
  const out = {};
  if (standard) out.sustainability_standard_claimed = standard;
  if (kpis || freq) {
    out.kpi_reporting_commitment = {
      ...(kpis ? { kpis_committed: kpis } : {}),
      ...(freq ? { reporting_frequency: freq } : {}),
    };
  }
  if (improvement) out.improvement_plan = /** @type {any} */ (improvement);
  if (impact) out.impact_plan = /** @type {any} */ (impact);
  return out;
}
