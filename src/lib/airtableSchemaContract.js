// @ts-check
//
// The contract between Airtable's single-select / multi-select OPTION NAMES
// and the engine's enum strings.
//
// Why this file exists. Airtable option names are not labels — they are code
// values. `fetchEngagement` passes most of them to the engine verbatim, and
// the engine compares them against string literals. Renaming an option in the
// Airtable UI is therefore a code change made by someone who is not looking at
// code, and almost none of it fails loudly:
//
//   - `Status` renamed from "active"        → every engagement in the base
//                                             becomes un-renderable at once.
//   - a c2 tri-state renamed from "No"      → a recorded, definite "No" is
//                                             read as "not known", so a real
//                                             finding is laundered into a data
//                                             gap in an investor-facing report.
//   - `c6_methodology` renamed to "CapEx"   → forwarded to the engine as a
//                                             valid-shaped but unrecognised
//                                             methodology; the verdict moves
//                                             with no warning anywhere.
//   - a safeguards item renamed             → the attestation silently drops
//                                             and the pillar reports
//                                             data_missing.
//
// Several of those degrade in the direction that flatters the client, which is
// the worst possible direction for an assurance deliverable.
//
// The runbook used to say renaming a field was safe and renaming an option was
// not. Half right, and not enforced by anything. This file plus
// airtableSchemaParity.test.js turns "remember not to rename things" into a
// test that fails.
//
// HOW IT IS CHECKED. Two directions, both in the parity test:
//
//   1. Against a committed snapshot of the Airtable schema
//      (src/__fixtures__/airtable-schema-snapshot.json). Runs offline, always,
//      and catches a contract edit or an engine enum change.
//   2. Against LIVE Airtable, when a PAT with the `schema.bases:read` scope is
//      available. This is the direction that catches an operator rename, and
//      it is the one that matters most. The current production PAT does NOT
//      carry that scope, so the live check skips — see the test file.
//
// WHERE THE EXPECTED VALUES COME FROM. Anything the engine publishes in its
// regulatory-knowledge JSON is read from disk at test time rather than copied
// (see readEngineConstant in the test). The rest lives only in engine TypeScript
// and is mirrored here with a file reference; the snapshot is what locks those.

/**
 * @typedef {Object} FieldContract
 * @property {string} table       Airtable table ID
 * @property {string} field       Airtable field ID
 * @property {string} label       Human name, for test output
 * @property {string[]} required  Option names that MUST exist, verbatim
 * @property {"exact"|"superset"} mode
 *   "exact"    — the option list must be exactly `required`, no more, no less.
 *   "superset" — every name in `required` must exist; extra options are
 *                tolerated (legacy vocabularies, or values the app ignores).
 * @property {string} consumer    Where the value is read, and what breaks
 */

import recognisedStandards from "@perennity/engine/regulatory-knowledge/constants/recognised_sustainability_standards.json" with { type: "json" };
import sectorCategories from "@perennity/engine/regulatory-knowledge/constants/data_centre_sector_material_categories.json" with { type: "json" };

// Read from the engine, not copied from it.
//
// These two lists used to be typed out below, in the `required` arrays, as a
// mirror of constants the engine publishes — and the parity test existed
// partly to notice when the copy drifted. The engine now exports its
// regulatory-knowledge directory as a subpath (4.0.0-alpha.2), so the copy can
// go: there is one list, it lives in the engine, and drift is no longer a
// thing that can happen rather than a thing a test catches.
//
// The `with { type: "json" }` attribute is required, not decorative. This
// module is loaded by api/engagement.js under Node ESM, which refuses a JSON
// import without it; Vite and vitest accept it happily. All three were checked
// before this was written.
const RECOGNISED_STANDARD_IDS = Object.freeze(
  recognisedStandards.standards.map((s) => s.id),
);
const SECTOR_MATERIAL_CATEGORY_IDS = Object.freeze(
  sectorCategories.categories.map((c) => c.id),
);

const ENGAGEMENTS = "tblRnd8BdQ65kuaej";
const ES_CHARACTERISTICS = "tbl5bnYyE8aMkOmXj";
const ANNEX_II_COVERAGE = "tblmZcN78oQutgsyS";
const PROJECT_PAI_DATA = "tblLF40OS1rLZ7Dgj";

/** The Yes / No / Unknown vocabulary read by triState(). */
export const TRI_STATE_OPTIONS = ["Yes", "No", "Unknown"];

/**
 * Every c2 tri-state, plus the climate-risk one added under ITEM-04. All read
 * through triState(), all with the same failure mode: a renamed "No" silently
 * becomes "not answered".
 */
export const TRI_STATE_FIELDS = [
  ["fldEyhNIThlbB4I2G", "c2 Terms of reference documented (Y/N/?)"],
  ["fldKet7AlpF1Tfwfd", "c2 CEO/Chair separated (Y/N/?)"],
  ["fld7amd191pUsqv2I", "c2 Lead independent director designated (Y/N/?)"],
  ["fldKJdixJ5jmEAcRx", "c2 Executive committee published (Y/N/?)"],
  ["fldhcrC3nBtyBxARu", "c2 UNGP-aligned policy published (Y/N/?)"],
  ["fldFgwYltnGbCNCy9", "c2 Grievance mechanism documented (Y/N/?)"],
  ["fldp3FLhBjp8zUT9K", "c2 Labour law compliance attested (Y/N/?)"],
  ["fldkFOwp0xa582adT", "c2 Remuneration policy published (Y/N/?)"],
  ["fldD9c8w5vDNXgtmi", "c2 CEO-to-median ratio disclosed (Y/N/?)"],
  ["fldUyZSyGFiS9OOw1", "c2 ESG-linked variable pay (Y/N/?)"],
  ["fld0BctdyUmTPIqj0", "c2 Tax policy published (Y/N/?)"],
  ["fldkrdg8HKAB8jAUf", "Climate Risk Completed (Y/N/?)"],
];

/** @type {FieldContract[]} */
export const FIELD_CONTRACTS = [
  {
    table: ENGAGEMENTS,
    field: "fldX4ynEolKL4BnKX",
    label: "Status",
    required: ["active"],
    mode: "superset",
    consumer:
      'airtableEngagement.js — `fields[FID.STATUS] !== "active"` returns not_active. ' +
      "Rename this one and EVERY engagement in the base stops rendering at once.",
  },
  {
    table: ENGAGEMENTS,
    field: "fldDYxT0PxmhhJrsW",
    label: "Target Label",
    required: [
      "eu_taxonomy_aligned_8_1",
      "sfdr_article_8",
      "sfdr_article_9",
      "uk_sdr_focus",
      "uk_sdr_improvers",
      "uk_sdr_impact",
    ],
    mode: "superset", // uk_sdr_mixed_goals is deliberately present but unrouted
    consumer:
      "engineClient.js frameworksForLabel() — a switch over these literals that " +
      "throws on anything else. Fails loudly, but takes out every engagement " +
      "on the renamed label.",
  },
  {
    table: ENGAGEMENTS,
    field: "fldTgr6vvCqioE5Zc",
    label: "c7 operational status",
    required: ["operational", "pre_operational"],
    mode: "exact",
    consumer:
      "entityInputAdapter.js buildReportingFromDiscrete — forwarded verbatim. " +
      "A renamed option is valid-shaped but unrecognised; c7 takes neither branch " +
      "predictably. Silent.",
  },
  {
    table: ENGAGEMENTS,
    field: "fld1LdHxujbiGgiyu",
    label: "c6 methodology",
    required: ["capex", "opex", "revenue"],
    mode: "exact",
    consumer:
      "sfdrInputAdapter.js — forwarded to the engine unvalidated. Silent verdict change.",
  },
  {
    table: ENGAGEMENTS,
    field: "fldLFXTGOM5n7fETe",
    label: "SFDR Assurance Tier",
    required: [
      "reasonable_big4",
      "limited_big4",
      "limited_partial",
      "management_only",
    ],
    mode: "exact",
    consumer:
      "art9 c9 evidence pack, and paiDataFile.ts derives every CSV row's " +
      "verification_status from it. Engine: src/sfdr/types.ts AssuranceTier.",
  },
  {
    table: ENGAGEMENTS,
    field: "fldJSLW9dBx0YM4ZC",
    label: "c7 reporting named standard",
    required: RECOGNISED_STANDARD_IDS,
    mode: "exact",
    consumer:
      "SFDR c5 and c7. Engine: RECOGNISED_STANDARDS, published in " +
      "regulatory-knowledge/constants/recognised_sustainability_standards.json.",
  },
  {
    table: ENGAGEMENTS,
    field: "fldTD5iMXyPxojoIy",
    label: "Site Water Stress Classification",
    required: ["Low", "Low - Medium", "Medium - High", "High", "Extremely High"],
    mode: "exact",
    consumer:
      "dnsh_water.ts isWaterStressed() — only High / Extremely High trigger the " +
      "WUE threshold. Rename those two and a water-stressed site stops being " +
      "tested at all. Silent, and in the client's favour.",
  },
  {
    table: ENGAGEMENTS,
    field: "fldhlCI68cqPZyzvb",
    label: "Human Rights Compliance Items",
    required: [
      "human_rights_policy_published",
      "due_diligence_process_operational",
      "grievance_mechanism_operational",
      "ilo_core_conventions_compliance",
      "no_ungc_violations_24m",
    ],
    mode: "exact",
    consumer: "Engine: src/logic/safeguards_human_rights.ts REQUIRED_ITEMS.",
  },
  {
    table: ENGAGEMENTS,
    field: "fldk44Pyugc1Rwv4X",
    label: "Bribery Corruption Compliance Items",
    required: [
      "anti_bribery_policy_published",
      "anti_bribery_training_programme",
      "no_bribery_convictions_24m",
    ],
    mode: "exact",
    consumer: "Engine: src/logic/safeguards_bribery_corruption.ts REQUIRED_ITEMS.",
  },
  {
    table: ENGAGEMENTS,
    field: "fldOvqxo1JYDtqGIu",
    label: "Taxation Compliance Items",
    required: [
      "tax_governance_policy_published",
      "no_tax_evasion_findings_24m",
      "country_by_country_reporting_or_below_threshold",
    ],
    mode: "exact",
    consumer: "Engine: src/logic/safeguards_taxation.ts REQUIRED_ITEMS.",
  },
  {
    table: ENGAGEMENTS,
    field: "fldq23xLBmqgSyNDZ",
    label: "Fair Competition Compliance Items",
    required: ["competition_policy_published", "no_competition_law_breaches_24m"],
    mode: "exact",
    consumer: "Engine: src/logic/safeguards_fair_competition.ts REQUIRED_ITEMS.",
  },
  {
    table: ENGAGEMENTS,
    field: "fldQWCWDGXyOhZKMM",
    label: "Circular Economy Compliance Items",
    required: [
      "ecodesign_2009_125",
      "rohs_2011_65",
      "waste_management_plan",
      "weee_endoflife_2012_19",
    ],
    mode: "exact",
    consumer: "Engine: src/logic/dnsh_8_1_circular_economy.ts REQUIRED_ITEMS.",
  },
  {
    table: ENGAGEMENTS,
    field: "fldt3uBF2X9fTA8Ew",
    label: "PUE Measurement Methodology Declared",
    required: ["EN_50600_4_2", "ISO_IEC_30134_2", "other_with_documentation"],
    mode: "superset", // "unspecified" is an operator convenience the engine rejects
    consumer: "Engine: src/logic/sc_8_1_2_pue_measurement_compliance.ts PUE_METHODOLOGIES.",
  },
  {
    table: ENGAGEMENTS,
    field: "fldLR3EglrPW8km09",
    label: "PUE Measurement Category",
    required: ["category_1", "category_2", "category_3"],
    mode: "superset", // ditto "unspecified"
    consumer: "Engine: src/logic/sc_8_1_2_pue_measurement_compliance.ts PUE_CATEGORIES.",
  },
  {
    table: ENGAGEMENTS,
    field: "fldv4ouVCZS1RaBin",
    label: "PUE Reporting Basis",
    required: ["annualised", "design_point_only"],
    mode: "exact",
    consumer:
      'sc_8_1_2_pue_measurement_compliance.ts — only "annualised" passes the basis check.',
  },
  {
    table: ENGAGEMENTS,
    field: "fldqCCE6k8C0zyGdR",
    label: "Facility Type",
    required: ["hyperscale", "colocation", "edge", "enterprise"],
    mode: "exact",
    consumer: "project_input.facility_type, forwarded verbatim.",
  },
  {
    table: ENGAGEMENTS,
    field: "fldJEyPQoovMd8bC1",
    label: "Facility Status",
    required: ["design", "construction", "operational"],
    mode: "exact",
    consumer:
      "metricsCore.ts toAssetStage() — an unrecognised status changes which " +
      "PUE figure is treated as operational vs design.",
  },
  {
    table: ENGAGEMENTS,
    field: "fld771ulYlnwmZZbT",
    label: "uk_sdr_reporting_frequency",
    required: ["annual", "semi_annual", "quarterly"],
    mode: "exact",
    consumer:
      'uk_sdr_c8_progress_monitoring — only "annual" can reach aligned.',
  },
  {
    table: ENGAGEMENTS,
    field: "fldMHcQV5YWYuMfZP",
    label: "uk_sdr_standard_claimed",
    required: ["eu_taxonomy_8_1", "leed_platinum", "sbti", "other"],
    mode: "exact",
    consumer:
      'UK SDR c2 — "other" deliberately scores not_aligned, so a rename can ' +
      "silently convert a rejection into an acceptance or vice versa.",
  },
  {
    table: ES_CHARACTERISTICS,
    field: "fldDZcacqTnser8uP",
    label: "ES Characteristics — category",
    required: SECTOR_MATERIAL_CATEGORY_IDS,
    mode: "exact",
    consumer:
      "SFDR c1 sector-material count. Engine: SECTOR_MATERIAL_CATEGORIES, published in " +
      "regulatory-knowledge/constants/data_centre_sector_material_categories.json.",
  },
  {
    table: ANNEX_II_COVERAGE,
    field: "fldVbdnEcmD6sesAd",
    label: "Annex II — coverage",
    required: ["covered_specific", "covered_generic", "absent"],
    mode: "exact",
    consumer: "SFDR c5 — aligned requires >=7 elements covered_specific.",
  },
  {
    table: ANNEX_II_COVERAGE,
    field: "fld5L3pQEGrKgh91v",
    label: "Annex II — named_framework",
    required: RECOGNISED_STANDARD_IDS,
    mode: "exact",
    consumer: "SFDR c5 elements 4 and 6. Same RECOGNISED_STANDARDS set.",
  },
  {
    table: PROJECT_PAI_DATA,
    field: "fld7QbaJ5zn0ezpsS",
    label: "Project PAI Data — applicability",
    required: ["applicable", "not_applicable"],
    mode: "exact",
    consumer: "SFDR c10 — PAI 4 is always not_applicable for data centres.",
  },
];

/**
 * Known contract gaps. These are deliberate, documented and asserted on, so
 * that closing one of them has to be a conscious edit to this file rather
 * than a silent change in behaviour.
 *
 * @type {{field: string, label: string, missing: string[], why: string}[]}
 */
export const KNOWN_GAPS = [
  {
    field: "fldntLJtw5b4TnNUN",
    label: "ES Characteristics — indicator_source",
    missing: ["bespoke"],
    why:
      "QuantifiedIndicatorSource has three values; the field offers two. A bespoke " +
      "indicator therefore cannot be tagged at all, so it never counts toward the " +
      "engine's designated 'partially_aligned — bespoke metrics' path for Art 9 c8. " +
      "Scheduled with the c8 sub-case work.",
  },
  {
    field: "fldJ01YejLamlwxN2",
    label: "uk_sdr_kpis_committed",
    missing: [],
    why:
      'Has TWO options named "pue" and one with an empty name. Scoring dedupes ' +
      "through a Set so no verdict is corrupted, but an operator can tick the second " +
      "'pue' believing it a fourth KPI and score 3/4. Not fixed here: deleting a " +
      "select option strips it from every record using it, and the data API returns " +
      "option names rather than ids, so the two are indistinguishable from outside " +
      "the Airtable UI. Must be merged by hand in the editor, which shows usage.",
  },
];

/**
 * The option names accepted for a field, or null when the field is not under
 * contract. Used at runtime by airtableEngagement.js to catch a value that is
 * valid-shaped but unrecognised, rather than forwarding it to the engine —
 * the same list the parity test checks, so the guard and the test can never
 * disagree about what "accepted" means.
 *
 * @param {string} fieldId
 * @returns {string[] | null}
 */
export function acceptedOptionsFor(fieldId) {
  const contract = FIELD_CONTRACTS.find((c) => c.field === fieldId);
  if (contract) return contract.required;
  if (TRI_STATE_FIELDS.some(([id]) => id === fieldId)) return TRI_STATE_OPTIONS;
  return null;
}
