// @ts-check
//
// Target labels — pure constants shared between the intake wizard and
// the framework-loading code path.
//
// The label values must match the Airtable Engagements.Target Label
// single-select option names exactly (the Airtable mapper writes back the
// raw value). The display labels are the human-readable strings rendered
// in the wizard dropdown and on engagement summary surfaces.
//
// Six labels are enabled: EU Taxonomy Aligned (Activity 8.1), SFDR
// Article 8, SFDR Article 9, plus UK SDR Focus / Improvers / Impact
// (enabled in v0.6.0 / Phase 2). UK SDR Mixed Goals remains disabled —
// no engine framework yet (would require a multi-label aggregation path
// that is not in v0.6.0 scope).

/**
 * @typedef {"eu_taxonomy_aligned_8_1" | "sfdr_article_8" | "sfdr_article_9" | "uk_sdr_focus" | "uk_sdr_improvers" | "uk_sdr_impact" | "uk_sdr_mixed_goals"} TargetLabel
 */

/**
 * @typedef {Object} TargetLabelOption
 * @property {TargetLabel} value
 * @property {string} display
 * @property {boolean} enabled
 */

/** @type {readonly TargetLabelOption[]} */
export const TARGET_LABEL_OPTIONS = Object.freeze([
  {
    value: "eu_taxonomy_aligned_8_1",
    display: "EU Taxonomy Aligned (Activity 8.1)",
    enabled: true,
  },
  { value: "sfdr_article_8", display: "SFDR Article 8", enabled: true },
  { value: "sfdr_article_9", display: "SFDR Article 9", enabled: true },
  { value: "uk_sdr_focus", display: "UK SDR Focus", enabled: true },
  { value: "uk_sdr_improvers", display: "UK SDR Improvers", enabled: true },
  { value: "uk_sdr_impact", display: "UK SDR Impact", enabled: true },
  {
    value: "uk_sdr_mixed_goals",
    display: "UK SDR Mixed Goals",
    enabled: false,
  },
]);

/** @type {TargetLabel} */
export const DEFAULT_TARGET_LABEL = "eu_taxonomy_aligned_8_1";

/**
 * Human-readable label for a target label value. Falls back to the raw
 * value if the input is unknown — defensive against future Airtable
 * options the SPA hasn't picked up yet.
 *
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function targetLabelDisplay(value) {
  const option = TARGET_LABEL_OPTIONS.find((o) => o.value === value);
  return option ? option.display : (value ?? "");
}

/**
 * The three labels that resolve to a real framework set in the engine.
 * Anything outside this set should throw from frameworksForLabel.
 *
 * @type {readonly TargetLabel[]}
 */
export const ENABLED_TARGET_LABELS = Object.freeze(
  TARGET_LABEL_OPTIONS.filter((o) => o.enabled).map((o) => o.value),
);
