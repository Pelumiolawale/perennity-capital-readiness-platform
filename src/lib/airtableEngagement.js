// @ts-check
// Entitlement client for the gated /assessment/report route.
// Zero side effects at import time — all work happens inside fetchEngagement.
//
// SERVER-SIDE ONLY for fetching (Sep 2026). The browser calls
// api/engagement.js (via src/lib/engagementApi.js), which calls
// fetchEngagement here with explicit config from airtableConfigFromEnv().
// The VITE_* fallback reads below are kept for back-compat but resolve to
// undefined in production: the PAT previously shipped in the public bundle
// through VITE_AIRTABLE_PAT, and vite.config.js now refuses to build if that
// variable is set. The FID / CHILD_FIDS maps are still imported by browser
// code (entity adapters); they are field IDs, not secrets.

import { acceptedOptionsFor } from "./airtableSchemaContract.js";

// UUID v4 strict format — variant bit forced to one of 8/9/a/b.
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Field IDs from the Engagements table in base appasxX7eC3QsmxeM.
// We request `returnFieldsByFieldId=true` so renames in the Airtable UI
// don't silently break the parser — field IDs are immutable.
// Exported so the server-side lister can read the same immutable field IDs
// rather than keeping a second copy that drifts. See listEngagements.js.
export const FID = {
  ENGAGEMENT_REF: "fldiwINotrRmo7EQ3",
  STATUS: "fldX4ynEolKL4BnKX",
  ISSUED_AT: "fldHMab6pBtJ25i0R",
  EXPIRES_AT: "fldv7xhqzcWQE0up5",
  CLIENT_NAME: "fldkrOYerYWFSu21O",
  PROJECT_NAME: "fldjKsziDEQDkPwJM",
  PROJECT_ID: "fldEz7HRUGVtoGvvg",
  ENGAGEMENT_LETTER_SIGNED: "fldQYH3u8F46SlNhB",
  ENGAGEMENT_LETTER_DATE: "fld0u55O1k44M3MrA",
  FACILITY_TYPE: "fldqCCE6k8C0zyGdR",
  JURISDICTION: "fldai1BfwsJOXtzMI",
  FACILITY_STATUS: "fldJEyPQoovMd8bC1",
  BUILD_COMPLETION_YEAR: "fldVQYpATONr5GiDW",
  ECOCC_PRACTICES_JSON: "fldasjZgK9L7XFE5k",
  LAST_INDEPENDENT_AUDIT_DATE: "fldPdSduYAx7WOSw7",
  ANNUALISED_PUE: "fldchEW30UY1Pucd0",
  CLIMATE_RISK_COMPLETED: "fld8T86YqHN3y0bMZ",
  CLIMATE_RISK_METHODOLOGY: "fld1JdsMPiuevVIXR",
  WUE_ANNUALISED: "fld7ioUkoZN6jpMHU",
  SITE_WATER_STRESS: "fldTD5iMXyPxojoIy",
  EVIDENCE_DOCUMENTS: "fldwz4Gcfx35bXxzy",
  SIGNATORY_NAME: "fldLkslrH9GckfPIf",
  SIGNATORY_TITLE: "fld4Or0uEUFg5xG3o",
  SIGNATORY_SIG_URI: "fldRYnapeizVC4Hd5",
  // Methodology v3.2: a single multilineText column carries every new
  // data_point as one JSON object. Future v3.x keys are added inside that
  // blob without touching the Airtable schema.
  V32_DATA_POINTS_JSON: "fldw55DbhicnyNjEM",
  // v3.2 explicit columns. Created against table tblRnd8BdQ65kuaej. Option
  // names match the engine's expected string values verbatim — do not rename
  // in the Airtable UI without bumping the engine's EXPECTED_*_ITEMS arrays
  // and PUE_METHODOLOGIES/PUE_CATEGORIES at src/logic/safeguards_*.ts and
  // src/logic/sc_8_1_2_pue_measurement_compliance.ts in the engine repo.
  PUE_MEASUREMENT_METHODOLOGY: "fldt3uBF2X9fTA8Ew",
  PUE_MEASUREMENT_CATEGORY: "fldLR3EglrPW8km09",
  PUE_MEASUREMENT_BOUNDARY: "fldgoN1r6KYX6YgXW",
  PUE_REPORTING_BASIS: "fldv4ouVCZS1RaBin",
  HUMAN_RIGHTS_ITEMS: "fldhlCI68cqPZyzvb",
  BRIBERY_CORRUPTION_ITEMS: "fldk44Pyugc1Rwv4X",
  TAXATION_ITEMS: "fldOvqxo1JYDtqGIu",
  FAIR_COMPETITION_ITEMS: "fldq23xLBmqgSyNDZ",
  // v0.5.0+ (Bug 2 follow-up, S1): EU Taxonomy 8.1 DNSH (4) circular economy
  // compliance items. Option names match the engine's REQUIRED_ITEMS in
  // dnsh_8_1_circular_economy: ecodesign_2009_125, rohs_2011_65,
  // waste_management_plan, weee_endoflife_2012_19.
  CIRCULAR_ECONOMY_ITEMS: "fldQWCWDGXyOhZKMM",
  // v0.5.0-alpha.7+ (Phase 1, commit 1.5a Phase B-1): regulatory framework
  // this engagement is assessed against. Drives which framework set
  // engineClient.frameworksForLabel resolves. Single-select with 7 option
  // names — see src/lib/targetLabels.js for the canonical option list.
  // Existing engagements were stamped "eu_taxonomy_aligned_8_1" by the
  // Phase 1 backfill (see commit message).
  TARGET_LABEL: "fldDYxT0PxmhhJrsW",
  // v0.5.0-alpha.8+ (Phase 1, commit 1.5a Phase B-2): SFDR Specifics
  // intake mirror. Six fields populated by Dolapo in the Airtable UI
  // (mirroring whatever the wizard would have collected). Mapped into
  // ProjectSFDRInputs via src/lib/sfdrInputAdapter.js. All fields are
  // optional; absent fields resolve SFDR criteria to insufficient_evidence.
  SFDR_SI_OBJECTIVE: "fldvtQNN3XWkeiNgI",
  SFDR_SI_OBJECTIVE_CATEGORY: "fldVPq9x6wuULQ0id",
  SFDR_DOMINANCE_TEST: "fldGPJ7DOeiwGiEqE",
  SFDR_ES_CHARACTERISTIC: "fldEmeTn2w8BkAu8Z",
  SFDR_PAI_DATA: "fldxHa9zdFmANwZwA",
  SFDR_ASSURANCE_TIER: "fldLFXTGOM5n7fETe",
  // JSON blob carrying entity-level attestations for SFDR criteria c2/c3/
  // c5/c7. LEGACY — superseded by the c2_*/c3_*/c5_*/c7_* discrete columns
  // and the SFDR_* linked child tables below. Kept on the schema as a
  // fallback (entityInputAdapter prefers discrete columns when present).
  SFDR_ENTITY_DISCLOSURES: "fldoSVNknmEavH7Bh",

  // ── UK SDR Specifics (v0.6.0 / Phase 2) ──────────────────────────────
  // Five Airtable columns mirroring whatever the wizard collects for UK SDR
  // Focus / Improvers / Impact engagements. Mapped into ProjectUKSDRInputs
  // via src/lib/ukSDRInputAdapter.js. All fields are optional; absent
  // fields resolve UK SDR criteria to insufficient_evidence per the engine's
  // fail-soft pattern.
  UK_SDR_STANDARD_CLAIMED: "fldMHcQV5YWYuMfZP",
  UK_SDR_KPIS_COMMITTED: "fldJ01YejLamlwxN2",
  UK_SDR_REPORTING_FREQUENCY: "fld771ulYlnwmZZbT",
  UK_SDR_IMPROVEMENT_PLAN: "fldugUZ2qX710zK9g",
  UK_SDR_IMPACT_PLAN: "fldBgf9Wr6ioPdkNu",

  // ── PR A1 — discrete entity scalars (c2 / c3 / c7) ──────────────────
  // c2 governance — domain A (board structure)
  C2_INDEPENDENT_NED_COUNT: "fldJPtegliI4lHXRX",
  C2_TERMS_OF_REFERENCE_DOCUMENTED: "fldgH49EkrqB7tagy",
  C2_CEO_CHAIR_SEPARATED: "fld7690x3sY6C5rOy",
  C2_LEAD_INDEPENDENT_DIRECTOR_DESIGNATED: "fldIomLtkP15kwidO",
  C2_EXECUTIVE_COMMITTEE_PUBLISHED: "fld5fa8O9esBAoDuK",
  // c2 governance — domain B (employee relations)
  C2_UNGC_VIOLATIONS_5YR_COUNT: "fldtb9r3zLMTuXybX",
  C2_UNGP_ALIGNED_POLICY_PUBLISHED: "fldVYPWfAYsgNf66s",
  C2_GRIEVANCE_MECHANISM_DOCUMENTED: "fldJ32M03W7NuggUS",
  C2_LABOUR_LAW_COMPLIANCE_ATTESTED: "fld6SDCU4VijvVDSC",
  // c2 governance — domain C (remuneration)
  C2_REMUNERATION_POLICY_PUBLISHED: "fldKmeppe62DYEaoY",
  C2_CEO_TO_MEDIAN_RATIO_DISCLOSED: "fldrqSBEaqojWnfMZ",
  C2_CEO_TO_MEDIAN_RATIO_VALUE: "fldyeL10mKogwPnsT",
  C2_ESG_LINKED_VARIABLE_PAY: "fldNhgbYFlTiPzzgE",
  // c2 governance — domain D (tax compliance)
  C2_TAX_POLICY_PUBLISHED: "fldv21PJcqP0EQcg8",
  C2_TAX_JURISDICTIONS_USED: "fldUJf7KbM07UBkgG",
  C2_CBCR_JURISDICTION_COUNT: "fldZBIG3h1ex937hv",
  C2_UNRESOLVED_TAX_DISPUTES_EUR_MAX: "fld1Wqu4NuFdamzgK",
  // c3 PAI policy — entity-level scalars (per-PAI coverage in child table)
  C3_STATEMENT_URL: "fldJ8ffkihsDokUw7",
  C3_STATEMENT_PUBLISHED_DATE: "fldbmYuT5phWjRhwB",
  C3_ART_4_EXPLICIT_REFERENCE: "fld4lun18zlJQpUzD",
  // c7 reporting — operational scalars (reports in child tables)
  C7_OPERATIONAL_STATUS: "fldTgr6vvCqioE5Zc",
  C7_COMMISSIONING_DATE: "fldeOrOsLRaYLqmDc",
  C7_SPECIFIES_INDICATORS: "fldu2L8EYHf07AjpL",
  C7_SPECIFIES_ANNUAL_CADENCE: "fld0w2xxvpFtgQOlJ",
  C7_SPECIFIES_ASSURANCE: "fldn3fXTvGl8gciFm",
  C7_REPORTING_NAMED_STANDARD: "fldJSLW9dBx0YM4ZC",

  // ── PR A3 — discrete c6 Taxonomy claim scalars ──────────────────────
  C6_TAXONOMY_CLAIM_MADE: "fldZof3buzHeCIMJC",
  C6_CLAIMED_PERCENTAGE: "fld9bOCmePEWMBGvA",
  C6_METHODOLOGY: "fld1LdHxujbiGgiyu",
  C6_MINIMUM_SAFEGUARDS_ATTESTATION: "fldXxHlUoFRKJcV6h",
  C6_PUBLISHED_DATE: "fld2FSLCYaw27Vz5S",
  C6_BREAKDOWN_CLIMATE_MITIGATION_PCT: "fldZaUVd2DQB6P9ei",
  C6_BREAKDOWN_CLIMATE_ADAPTATION_PCT: "fldOqqE0u9Ffunhbi",
  C6_BREAKDOWN_WATER_PCT: "fldKpPGgThSdPq5wg",
  C6_BREAKDOWN_CIRCULAR_ECONOMY_PCT: "fld9Ej88PRbdHpxGZ",
  C6_BREAKDOWN_POLLUTION_PCT: "fldmkpuBW5Hhoh1cG",
  C6_BREAKDOWN_BIODIVERSITY_PCT: "fldua2rh4wkqk3JZh",

  // ── BUG-01 (Sep 2026) — c2 tri-state single-selects (Yes / No / Unknown)
  // A checkbox can't tell "No" from "not answered", so a half-filled c2 row
  // scored false fails. These single-selects supersede the C2_* checkboxes
  // above; the checkboxes stay as a fallback (ticked = Yes, unticked =
  // unknown). Migrated 18 Sep 2026: ticked → Yes, unticked left blank.
  C2_TERMS_OF_REFERENCE_DOCUMENTED_TRI: "fldEyhNIThlbB4I2G",
  C2_CEO_CHAIR_SEPARATED_TRI: "fldKet7AlpF1Tfwfd",
  C2_LEAD_INDEPENDENT_DIRECTOR_DESIGNATED_TRI: "fld7amd191pUsqv2I",
  C2_EXECUTIVE_COMMITTEE_PUBLISHED_TRI: "fldKJdixJ5jmEAcRx",
  C2_UNGP_ALIGNED_POLICY_PUBLISHED_TRI: "fldhcrC3nBtyBxARu",
  C2_GRIEVANCE_MECHANISM_DOCUMENTED_TRI: "fldFgwYltnGbCNCy9",
  C2_LABOUR_LAW_COMPLIANCE_ATTESTED_TRI: "fldp3FLhBjp8zUT9K",
  C2_REMUNERATION_POLICY_PUBLISHED_TRI: "fldkFOwp0xa582adT",
  C2_CEO_TO_MEDIAN_RATIO_DISCLOSED_TRI: "fldD9c8w5vDNXgtmi",
  C2_ESG_LINKED_VARIABLE_PAY_TRI: "fldUyZSyGFiS9OOw1",
  C2_TAX_POLICY_PUBLISHED_TRI: "fld0BctdyUmTPIqj0",

  // ── ITEM-04 (Sep 2026) — climate-risk tri-state ─────────────────────
  // Same root cause as BUG-01, one criterion over: a checkbox cannot tell
  // "No, no assessment was done" from "nobody has answered yet", and
  // dnsh_adaptation treats a definite false as a FAIL. Created 20 Sep 2026;
  // the legacy CLIMATE_RISK_COMPLETED checkbox stays as a fallback.
  CLIMATE_RISK_COMPLETED_TRI: "fldkrdg8HKAB8jAUf",
};

// Parent-side linked-record fields, one per child table (ITEM-17 / ITEM-18).
//
// These sit on the Engagements record itself and hold an array of the linked
// child record ids, so the parent we have already fetched tells us exactly how
// many rows each child fetch OUGHT to return. That is the only independent
// check available on a lookup that otherwise cannot fail visibly — see
// assertChildRowIntegrity.
export const CHILD_LINK_FIDS = {
  ES_CHARACTERISTICS: "fldyzlPWUeJeKMSwd",
  PAI_COVERAGE: "fldPmiMmXOhkkOoYa",
  ANNEX_II_COVERAGE: "fldIpTKLhkHo6vvN1",
  PROJECT_REPORTS: "fldQm9vAXnsjDZ6ia",
  PARENT_PORTFOLIO_REPORTS: "fldkJcz3s7t9mtoqt",
  PROJECT_PAI_DATA: "fld0ap3OJxeT2zPUa",
};

// Child table IDs (PR A2 + A4). Each engagement record can have N linked
// rows in each table. fetchEngagement issues parallel filterByFormula
// queries against these tables to retrieve the rows for the engagement
// being loaded, then surfaces them as arrays on the engagement object.
export const CHILD_TABLES = {
  ES_CHARACTERISTICS: "tbl5bnYyE8aMkOmXj",       // c1
  PAI_COVERAGE: "tblUDykO4OjwW4Thy",             // c3
  ANNEX_II_COVERAGE: "tblmZcN78oQutgsyS",        // c5
  PROJECT_REPORTS: "tbldOhfgFHFtkKOrR",          // c7 operational
  PARENT_PORTFOLIO_REPORTS: "tblMTihs1RBrCOaUL", // c7 pre-operational
  PROJECT_PAI_DATA: "tblLF40OS1rLZ7Dgj",         // c10 (Art 9)
};

// Per-child-table field IDs used by the adapters. Mirrors FID for child
// table fields so renames in the Airtable UI don't silently break parsing.
export const CHILD_FIDS = {
  ES_CHARACTERISTICS: {
    NAME: "fldXEZ7jAKFccdPWi",
    SLOT: "fldRmWc5pI7tYiPuh",
    METRIC: "fldlv7qXPH3F1KZZj",
    TARGET_VALUE: "fldIqbt7bflJQJWDh",
    TARGET_YEAR: "fld7JnlNfswNVqpmV",
    CATEGORY: "fldDZcacqTnser8uP",
    PUBLIC_SOURCE: "fldo6xM3E8w2HecMZ",
    INDICATOR_SOURCE: "fldntLJtw5b4TnNUN",
    BASELINE_VALUE: "fldMixRtB53TMzF84",
  },
  PAI_COVERAGE: {
    PAI_NUMBER: "fldd5bXCdsauLMYkf",
    DATA_DISCLOSED: "fldmtR5an2p87dSfm",
    TARGET_DISCLOSED: "fld2RL7fJI8GU8IDX",
    MITIGATION_DOCUMENTED: "fld89HjIOSss2RhLE",
  },
  ANNEX_II_COVERAGE: {
    ELEMENT_NUMBER: "fldV4umeCGyjq5XpM",
    COVERAGE: "fldVbdnEcmD6sesAd",
    NAMED_FRAMEWORK: "fld5L3pQEGrKgh91v",
  },
  PROJECT_REPORTS: {
    YEAR: "fldrZAYpwq9Dl5Hih",
    URL: "fld6GtVWZ8mTEZ5C3",
    INDICATOR_NAMES: "fldy29baeIsCOIV2X",
    NAMED_STANDARD: "fldp38BIUg0y5uytW",
  },
  PARENT_PORTFOLIO_REPORTS: {
    YEAR: "fldQGNAk3AfGHF6ql",
    URL: "fld0BHX6O8VmAbJ0M",
    INDICATOR_NAMES: "fldbKrBQaTwQA7TRZ",
    NAMED_STANDARD: "fldUFQTj0RfEsUdYB",
  },
  PROJECT_PAI_DATA: {
    PAI_NUMBER: "fldgZ8FouYtABzADT",
    VALUE: "fldn95DR7ajVDYkc0",
    VALUE_TEXT: "fldX1kLiflltOYWdK",
    UNIT: "fld5JtYMR0Eqn517W",
    VERIFIER_IDENTITY: "fldBAB4NuIqoA6N0p",
    ASSURANCE_STATUS: "fldroOPT2etcTjJLP",
    APPLICABILITY: "fld7QbaJ5zn0ezpsS",
    APPLICABILITY_RATIONALE: "fldPjkp4S8eAyWR0Z",
  },
};

// Spread an { key: value } pair only when value is meaningful. Suppresses
// undefined, null, and empty arrays so the engine treats absence as
// "no input" rather than "explicit false/empty".
function optionalKey(key, value) {
  if (value === undefined || value === null) return {};
  if (Array.isArray(value) && value.length === 0) return {};
  return { [key]: value };
}

/**
 * Strip keys whose value is blank, so a cell nobody filled in never reaches the
 * engine as an answer.
 *
 * THE RULE, IN ONE PLACE. The engine treats `undefined` as "no input" and every
 * other value as an answer. That single fact has produced the same defect over
 * and over — a blank WUE read as 0 and passing a regulated water threshold, a
 * blank ECoCC list read as a finding of zero practices, an unticked checkbox
 * read as a definite No — and each time it was fixed by remembering to use
 * optionalKey at one more call site. That is discipline, not design: it works
 * until somebody adds a field and does not know the rule.
 *
 * Applying this once to the finished object makes forgetting harmless.
 *
 * WHAT IT STRIPS: `undefined`, `null`, and `""`. Airtable returns null or omits
 * a cell entirely when it is empty, and an empty string is never a meaningful
 * answer here.
 *
 * WHAT IT DELIBERATELY DOES NOT STRIP: empty arrays. `[]` is genuinely
 * ambiguous — for a multi-select the operator may have looked at five
 * safeguards items and ticked none, which is a real answer the engine should
 * score as such. Where an empty array means "not collected" rather than "none",
 * that has to be decided at the field, as it is for ECoCC practices above.
 *
 * Nor does it strip `false` or `0`. Both are answers.
 *
 * @template {Record<string, unknown>} T
 * @param {T} obj
 * @returns {Partial<T>}
 */
export function omitBlanks(obj) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = value;
  }
  return /** @type {Partial<T>} */ (out);
}

// Airtable checkbox semantics: true when ticked, undefined when not.
// We need an explicit boolean only when the cell has been touched, since
// undefined here means "leave the key out and let the engine return
// data_missing" rather than "the boundary is not documented".
function coerceCheckbox(value) {
  if (value === true) return true;
  return undefined;
}

// c2 tri-state (BUG-01). The Yes / No / Unknown single-select wins when it
// holds a definite answer; otherwise fall back to the legacy checkbox via
// coerceCheckbox (ticked → true, unticked → undefined). Returns undefined
// for "not known", which entityInputAdapter turns into insufficient_evidence
// for that governance domain instead of a false fail.
export function triState(selectRaw, legacyCheckbox) {
  const v =
    typeof selectRaw === "string"
      ? selectRaw
      : selectRaw && typeof selectRaw === "object" && typeof selectRaw.name === "string"
        ? selectRaw.name
        : undefined;
  if (v === "Yes") return true;
  if (v === "No") return false;
  return coerceCheckbox(legacyCheckbox);
}

/**
 * Check a single-select value against the option names the code actually
 * accepts, and record a warning when it is neither empty nor recognised.
 *
 * ITEM-17 (B4). Several selects are forwarded to the engine verbatim. Rename
 * `capex` to `CapEx`, or `operational` to `Operational`, and the value is not
 * undefined — so every "is it missing?" guard passes it through — but it
 * matches no branch inside the engine either. c7 in particular tests
 * `operational_status === "operational"` and silently takes the
 * pre-operational evidence path for anything else. Nothing surfaces.
 *
 * Deliberately a warning rather than a hard failure: the rest of the report is
 * sound, and refusing it would be disproportionate to one drifted cell. The
 * operator gets a banner naming the field and the value. The accepted list
 * comes from the same contract the parity test uses, so the two cannot drift
 * apart.
 *
 * @param {string} fieldId
 * @param {string} label human name for the banner
 * @param {unknown} value
 * @param {string[]} warnings collected, mutated
 */
function warnOnUnrecognisedOption(fieldId, label, value, warnings) {
  if (value === undefined || value === null || value === "") return;
  const accepted = acceptedOptionsFor(fieldId);
  if (!accepted || accepted.includes(String(value))) return;
  warnings.push(
    `"${label}" holds "${value}", which is not one of the values this report ` +
      `understands (${accepted.join(", ")}). The option has probably been renamed ` +
      `in Airtable. Airtable option names are code values, so the criterion fed ` +
      `by this field is not being scored as intended.`,
  );
}

// What each position in an evidence line should look like. Used to catch a
// line whose fields are in the wrong ORDER — the failure the old count-only
// check could not see.
//
// Deliberately loose. These are shape checks, not content validation: a
// truncated sha256 (the live records carry 11-22 hex characters, not 64) must
// not be flagged, and a document_type the engine does not happen to consult
// must not be either. They only need to be tight enough that two transposed
// fields cannot both still look right.
const EVIDENCE_FIELD_SHAPES = [
  {
    key: "document_id",
    // Anything non-empty. The weakest slot, and the least consequential.
    ok: (v) => v.length > 0,
    expected: "a document identifier",
  },
  {
    key: "document_type",
    ok: (v) => /^[a-z][a-z0-9_]*$/.test(v),
    expected: "a lower_snake_case type such as audit_report",
  },
  {
    key: "uri",
    ok: (v) => v.includes("://"),
    expected: "a URL",
  },
  {
    key: "uploaded_at",
    ok: (v) => /^\d{4}-\d{2}-\d{2}/.test(v),
    expected: "an ISO date, e.g. 2026-05-10T10:00:00Z",
  },
  {
    key: "sha256",
    ok: (v) => /^[0-9a-f]+$/i.test(v),
    expected: "a hex digest",
  },
];

/**
 * Parse the Evidence Documents cell: one document per line, five
 * pipe-separated fields, positional.
 *
 * ITEM-17. Position is not identity, and this is the last place in the app
 * that relies on one. The order is `document_id | document_type | uri |
 * uploaded_at | sha256`, typed by hand into a long-text cell, and position 2
 * is what sc_8_1_1 matches on to find the independent audit report for EU
 * Taxonomy Activity 8.1. Transpose two fields and the audit document becomes
 * invisible: the criterion reports "No independent audit document in submitted
 * evidence" against evidence that was supplied and is sitting in the cell.
 *
 * The old check counted the fields and nothing else, so it caught a line with
 * four fields and was blind to a line with five in the wrong order — the more
 * likely mistake, and the silent one.
 *
 * The format is NOT changed. Operators type this by hand and the runbook
 * documents it; changing it would break every existing record and need the
 * documentation to move in lockstep. Instead each position is checked for the
 * SHAPE it should have, which catches transposition without asking anyone to
 * retype anything. Verified against all 12 live evidence lines: none is
 * flagged, so the warning only fires on genuine drift.
 *
 * @param {unknown} raw
 * @returns {{documents: Array<Record<string, string|null>>, warnings: string[]}}
 */
function parseEvidenceDocuments(raw) {
  if (!raw || typeof raw !== "string") return { documents: [], warnings: [] };

  /** @type {string[]} */
  const warnings = [];
  const documents = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, i) => {
      const lineNo = i + 1;
      const parts = line.split(" | ").map((p) => p.trim());
      const [document_id, document_type, uri, uploaded_at, sha256] = parts;
      const entry = {
        document_id: document_id ?? null,
        document_type: document_type ?? null,
        uri: uri ?? null,
        uploaded_at: uploaded_at ?? null,
        sha256: sha256 ?? null,
      };

      if (parts.length !== 5) {
        warnings.push(
          `Evidence Documents line ${lineNo} has ${parts.length} pipe-separated ` +
            "fields, not 5. Expected: document_id | document_type | uri | " +
            "uploaded_at | sha256.",
        );
        return entry;
      }

      const wrong = EVIDENCE_FIELD_SHAPES.filter(
        ({ key, ok }) => !ok(String(entry[key] ?? "")),
      );
      if (wrong.length > 0) {
        const detail = wrong
          .map(({ key, expected }) => `${key} should be ${expected}, got "${entry[key]}"`)
          .join("; ");
        // Name the consequence when it is the slot that matters, because
        // "field 2 looks odd" does not convey that the audit evidence is
        // about to disappear from the flagship criterion.
        const consequence = wrong.some((w) => w.key === "document_type")
          ? " Until this is corrected, this document cannot be recognised as an " +
            "independent audit, and EU Taxonomy criterion sc_8_1_1 will report " +
            "that no audit evidence was supplied."
          : "";
        warnings.push(
          `Evidence Documents line ${lineNo} looks mis-ordered: ${detail}. ` +
            `The fields are positional — document_id | document_type | uri | ` +
            `uploaded_at | sha256.${consequence}`,
        );
      }
      return entry;
    });

  return { documents, warnings };
}

function normalizeSignatoryOverrides(fields) {
  const name = fields[FID.SIGNATORY_NAME] || null;
  const title = fields[FID.SIGNATORY_TITLE] || null;
  const signature_block_uri = fields[FID.SIGNATORY_SIG_URI] || null;
  if (!name && !title && !signature_block_uri) return null;
  return { name, title, signature_block_uri };
}

/**
 * Cross-check each child fetch against the parent's own link arrays.
 *
 * ITEM-17, the dangerous half. fetchChildRows matches rows with
 * `SEARCH(<ref>, ARRAYJOIN({engagement}))`, and ARRAYJOIN on a linked-record
 * field yields the PRIMARY FIELD of the linked records. That is correct only
 * while `Engagement Reference` remains the primary field on Engagements.
 * Re-order the table in the Airtable UI so that, say, Client Name becomes
 * primary, and every SEARCH silently misses: all six calls return `[]` with
 * HTTP 200, the report renders perfectly well, and SFDR c1, c3, c5, c7 and c10
 * quietly drop to insufficient_evidence. A wrong opinion gets signed and sent
 * and nothing anywhere complains.
 *
 * The parent record is the independent witness. Its linked-record fields hold
 * the ids of exactly the rows that link back to it, so they say how many rows
 * each fetch should have returned — and they arrive in the parent call we
 * already make, for free.
 *
 * The same check catches two other defects for nothing:
 *   - a renamed `engagement` link field on a child table, when Airtable
 *     answers 200 rather than 422;
 *   - ITEM-18, where fetchChildRows discards Airtable's `offset` token and
 *     silently truncates at 100 rows. Expected 140, got 100.
 *
 * A shortfall is never benign: it means rows we know exist were not read, so
 * the report would understate the evidence. That is refused rather than
 * rendered — an absent report is recoverable, a signed and understated one is
 * not.
 *
 * @param {Record<string, unknown>} fields Parent record fields, by field ID
 * @param {Record<string, Array<unknown>>} fetched Child rows, keyed as CHILD_LINK_FIDS
 * @returns {{ table: string, expected: number, actual: number }[]} shortfalls
 */
export function findChildRowShortfalls(fields, fetched) {
  const shortfalls = [];
  for (const [table, linkFid] of Object.entries(CHILD_LINK_FIDS)) {
    const linked = fields[linkFid];
    const expected = Array.isArray(linked) ? linked.length : 0;
    const actual = Array.isArray(fetched[table]) ? fetched[table].length : 0;
    if (actual < expected) shortfalls.push({ table, expected, actual });
  }
  return shortfalls;
}

/**
 * Fetch all rows from a child Airtable table linked to the given engagement
 * record. Returns the raw `fields` object per row (keyed by field ID since we
 * pass returnFieldsByFieldId=true). Empty array when the link has no rows.
 *
 * Used by fetchEngagement to pull ES Characteristics, PAI Coverage, Annex II
 * Coverage, Project Reports, Parent Portfolio Reports, and Project PAI Data
 * for the engagement being loaded. Six tables → six API calls. We issue them
 * via Promise.all so they parallelise.
 *
 * Throws on network / API failures (caller catches at the route boundary).
 *
 * @param {string} baseId
 * @param {string} childTableId
 * @param {string} engagementRecordId  e.g. "reccILCx0VfYGFBl5"
 * @param {string} pat
 * @returns {Promise<Array<{id: string, fields: Record<string, unknown>}>>}
 */
// Paging guard for the fallback scan below. Mirrors listEngagements.js, which
// already scans this table the robust way.
const SCAN_PAGE_SIZE = 100;
const SCAN_MAX_PAGES = 100;

/**
 * Find an engagement by scanning the table and matching on FIELD ID.
 *
 * ITEM-17, the last name dependency. `filterByFormula` is the one thing in
 * Airtable's API that cannot address a field by id — it only takes display
 * names — so the fast path names `{Engagement Reference}`, and renaming that
 * column takes EVERY client's report down at once.
 *
 * It cannot be designed away, so it degrades instead. When Airtable rejects
 * the formula (422, which for this formula means exactly one thing), this
 * scans the table and matches `fields[FID.ENGAGEMENT_REF]` — a field id, which
 * nobody can rename. Slower, and only ever runs when the fast path is already
 * broken, so it costs nothing when healthy.
 *
 * Deliberately not silent. The caller attaches a warning banner, because a
 * fallback that quietly works forever is how a rename never gets fixed.
 *
 * @param {string} baseId
 * @param {string} tableId
 * @param {string} engagementReference
 * @param {string} pat
 * @returns {Promise<Array<{id: string, fields: Record<string, unknown>}>>}
 */
async function scanForEngagementByFieldId(baseId, tableId, engagementReference, pat) {
  const matches = [];
  let offset;
  let page = 0;

  do {
    if (page >= SCAN_MAX_PAGES) {
      throw new Error(
        `Engagement scan exceeded ${SCAN_MAX_PAGES} pages — aborting rather than looping.`,
      );
    }
    page += 1;

    const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`);
    url.searchParams.set("pageSize", String(SCAN_PAGE_SIZE));
    url.searchParams.set("returnFieldsByFieldId", "true");
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${pat}` },
    });
    if (!res.ok) {
      throw new Error(`Airtable API error scanning engagements: ${res.status}`);
    }
    const body = await res.json();
    for (const record of (body && body.records) || []) {
      if ((record.fields || {})[FID.ENGAGEMENT_REF] === engagementReference) {
        matches.push(record);
      }
    }
    offset = body && body.offset;
  } while (offset);

  return matches;
}

// Airtable returns at most 100 records per page. Requesting 50 ids at a time
// guarantees at most 50 records come back, so a chunk can never be truncated
// and no `offset` token can ever be dropped — which is how ITEM-18 stops being
// a defect that needs detecting and becomes one that cannot occur. 50 ids is
// also a ~1.6 KB formula; 120 ids (5.4 KB) was verified to work, so this is
// well inside what Airtable accepts.
const CHILD_ID_CHUNK = 50;

/**
 * Fetch child rows BY RECORD ID.
 *
 * This replaces `SEARCH(<ref>, ARRAYJOIN({engagement}))`, and the difference
 * is the whole point of ITEM-17.
 *
 * That formula named two things a non-developer can change in the Airtable UI:
 * the child table's `engagement` link field, by display name; and — less
 * obviously — the Engagements table's PRIMARY field, because ARRAYJOIN on a
 * linked-record field returns the primary field values of the linked records.
 * Drag a different column to first position and every SEARCH silently missed:
 * six calls returning [] with HTTP 200, a report that rendered and signed
 * cleanly, and five SFDR criteria reported as unevidenced while their evidence
 * sat in Airtable, fully populated.
 *
 * `RECORD_ID()` is a built-in. It names no field, so neither rename nor
 * re-order can reach it. The guard added alongside the previous fix
 * (findChildRowShortfalls) is kept, but it now watches this function rather
 * than Airtable's behaviour.
 *
 * The ids come from the parent record's own linked-record fields, which arrive
 * in the call we already make — so this costs no extra request. It saves them:
 * a table the engagement links nothing in is not queried at all, and most
 * engagements link nothing in any of the six.
 *
 * @param {string} baseId
 * @param {string} childTableId
 * @param {string[]} recordIds  ids from the parent's linked-record field
 * @param {string} pat
 * @returns {Promise<Array<{id: string, fields: Record<string, unknown>}>>}
 */
async function fetchChildRowsByIds(baseId, childTableId, recordIds, pat) {
  if (!Array.isArray(recordIds) || recordIds.length === 0) return [];

  /** @type {Array<{id: string, fields: Record<string, unknown>}>} */
  const rows = [];
  for (let i = 0; i < recordIds.length; i += CHILD_ID_CHUNK) {
    const chunk = recordIds.slice(i, i + CHILD_ID_CHUNK);
    const formula = `OR(${chunk.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${childTableId}`);
    url.searchParams.set("filterByFormula", formula);
    url.searchParams.set("returnFieldsByFieldId", "true");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${pat}` },
    });
    if (!res.ok) {
      throw new Error(
        `Airtable API error fetching child table ${childTableId}: ${res.status}`,
      );
    }
    const body = await res.json();
    for (const record of (body && body.records) || []) rows.push(record);
  }
  return rows;
}

/**
 * Fetch and validate an engagement record by its Engagement Reference (UUID v4).
 *
 * Return shape:
 *   { ok: false, reason: "invalid_format" | "not_found" | "not_active" | "expired"
 *                        | "child_data_incomplete" | "duplicate_reference" }
 *   { ok: true, engagement: <normalized object> }
 *
 * Throws on env misconfiguration or network/API failure. The caller (route)
 * catches throws and renders the opaque entitlement-error UI.
 *
 * @param {string} engagementReference
 * @param {{pat?: string, baseId?: string, tableId?: string}} [config]
 *   Required. Supplied by api/engagement.js from server-side env vars; there
 *   is no browser path and no VITE_* fallback, deliberately. See
 *   listEngagements.js and airtableConfigFromEnv.
 * @returns {Promise<
 *   | { ok: false, reason: "invalid_format" | "not_found" | "not_active" | "expired" }
 *   | { ok: false, reason: "child_data_incomplete", shortfalls: {table: string, expected: number, actual: number}[] }
 *   | { ok: true, engagement: object }
 * >}
 */
export async function fetchEngagement(engagementReference, config) {
  // 1. Format validation — never call Airtable on a malformed reference.
  if (!engagementReference || !UUID_V4_RE.test(engagementReference)) {
    return { ok: false, reason: "invalid_format" };
  }

  // 2. Env preconditions — misconfiguration, throw loudly.
  //
  // DELETED (Sep 2026): a `?? import.meta.env.VITE_AIRTABLE_*` fallback on each
  // of these three. It was dead — api/engagement.js has injected config
  // explicitly since the token moved server-side — and actively harmful,
  // because the error it raised named the VITE_ variables and told the
  // operator to "set these in .env.local". Doing that is now the one action
  // guaranteed to break the build: vite.config.js refuses to compile when a
  // secret-looking VITE_ variable is set, which is the guard that exists
  // because the PAT once shipped in the public bundle through exactly that
  // name. The error message was instructing people to reintroduce the leak.
  const { pat, baseId, tableId } = config ?? {};
  if (!pat || !baseId || !tableId) {
    const missing = [
      ["AIRTABLE_PAT", pat],
      ["AIRTABLE_BASE_ID", baseId],
      ["AIRTABLE_ENGAGEMENTS_TABLE_ID", tableId],
    ]
      .filter(([, v]) => !v)
      .map(([k]) => k)
      .join(", ");
    throw new Error(
      `Airtable config missing: ${missing}. These are server-side env vars, ` +
        "read by the /api functions — never prefix them with VITE_, which " +
        "would inline them into the public bundle. This is a build/deploy " +
        "misconfiguration, not a runtime user error.",
    );
  }

  // 3. List-records call with filterByFormula on the primary field.
  // returnFieldsByFieldId=true gives us field IDs (stable) instead of names.
  //
  // ITEM-17: note the asymmetry the comment above glosses over. The READ is by
  // immutable field ID, deliberately — but this FORMULA addresses the field by
  // its DISPLAY NAME, because that is the only thing filterByFormula accepts.
  // Rename `Engagement Reference` in the Airtable UI and every paid report for
  // every client stops rendering at the same moment. The rule is stated
  // correctly in listEngagements.js:83-86; this line is the exception to it,
  // and it cannot be removed without giving up server-side filtering
  // altogether. What it can do is fail legibly — see the 422 branch below.
  const formula = `{Engagement Reference}='${engagementReference}'`;
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`);
  url.searchParams.set("filterByFormula", formula);
  // ITEM-17: two, not one. Airtable does not enforce uniqueness on a text
  // primary field, so two records can carry the same Engagement Reference.
  // Under maxRecords=1 the report was silently drawn from whichever Airtable
  // returned first — a coin toss between two clients' data, with nothing to
  // notice. Asking for two costs nothing and makes the collision visible.
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("returnFieldsByFieldId", "true");

  let lookupDegraded = false;
  let res;
  try {
    res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${pat}` },
    });
  } catch (e) {
    throw new Error(
      `Airtable network failure: ${e && e.message ? e.message : String(e)}`,
    );
  }

  if (!res.ok) {
    // Includes 4xx (auth/permission) and 5xx (upstream). Neither maps to a
    // user-distinguishable reason — surface as a generic API error to the
    // route, which renders the opaque entitlement copy.
    //
    // ITEM-17: except 422, which is specific and worth naming. Airtable
    // returns it when a formula references a field that does not exist, and
    // the only field this formula names is `Engagement Reference`. The old
    // generic message sent the operator to the runbook's failure table, which
    // told them to check the UUID — a dead end, because the UUID is fine.
    if (res.status !== 422) {
      throw new Error(`Airtable API error: ${res.status}`);
    }
    // 422 on this formula means one thing: the only field it names,
    // `Engagement Reference`, no longer exists under that name. Degrade to a
    // field-id scan rather than take every client's report down, and make
    // sure somebody is told — see scanForEngagementByFieldId.
    lookupDegraded = true;
  }

  let records;
  if (lookupDegraded) {
    records = await scanForEngagementByFieldId(
      baseId,
      tableId,
      engagementReference,
      pat,
    );
  } else {

    let body;
    try {
      body = await res.json();
    } catch (e) {
      throw new Error(
        `Airtable returned malformed JSON: ${e && e.message ? e.message : String(e)}`,
      );
    }
    records = (body && body.records) || [];
  }

  // 4. Response routing.
  if (records.length === 0) {
    return { ok: false, reason: "not_found" };
  }

  if (records.length > 1) {
    // Never silently pick one. Whichever we chose could be the wrong client's
    // engagement, and the report would render perfectly.
    return { ok: false, reason: "duplicate_reference" };
  }

  const record = records[0];
  const fields = record.fields || {};

  if (fields[FID.STATUS] !== "active") {
    return { ok: false, reason: "not_active" };
  }

  const expiresAt = fields[FID.EXPIRES_AT];
  if (expiresAt) {
    const expiresMs = Date.parse(expiresAt);
    if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
      return { ok: false, reason: "expired" };
    }
  }

  // 5. Normalize.

  // ECoCC: structured_list serialised as a JSON array in a multilineText
  // column. Parse safely; on failure, surface a top-level warning the route
  // can render as a banner without blocking the rest of the report.
  //
  // ITEM-03 (Sep 2026): sc_8_1_1 reports data_missing only for `undefined`,
  // and treats anything else as an answer — a non-array (or an empty array)
  // becomes practiceCount 0, which is a `fail`: "No European Code of Conduct
  // practices recorded as implemented." A blank cell therefore made the paid
  // report ASSERT a failure against the developer where the honest statement
  // is that we were never given the evidence. That is a materially different
  // sentence to put in front of an investment committee.
  //
  // So the key now reaches the engine only when the cell decoded to a
  // non-empty array of practices. Anything else — blank, malformed JSON, or
  // valid JSON that is not a list (`{}`, `"none"`, `null`) — leaves the key
  // out and the engine says data_missing. Content that failed to decode also
  // raises the banner warning, so an operator sees that their cell was
  // ignored rather than silently reading a "no evidence" report.
  let ecoccValue = undefined;
  let ecoccParseWarning = null;
  const ecoccRaw = fields[FID.ECOCC_PRACTICES_JSON];
  if (ecoccRaw && typeof ecoccRaw === "string" && ecoccRaw.trim().length > 0) {
    let parsed;
    try {
      parsed = JSON.parse(ecoccRaw);
    } catch (e) {
      ecoccParseWarning = e && e.message ? e.message : "JSON.parse failed.";
    }
    if (ecoccParseWarning === null) {
      if (Array.isArray(parsed) && parsed.length > 0) {
        ecoccValue = parsed;
      } else if (Array.isArray(parsed)) {
        ecoccParseWarning =
          "ECoCC Practices JSON decoded to an empty list; no practices were recorded, so the criterion is reported as evidence missing.";
      } else {
        ecoccParseWarning =
          "ECoCC Practices JSON must decode to a JSON array of practices.";
      }
    }
  }

  // Methodology v3.2 data points live in a single JSON blob column. Parse
  // safely; on failure, surface a top-level warning the route can render as a
  // banner without blocking the rest of the report (same pattern as ECoCC).
  // The blob's keys are merged into data_points after the v3.1 keys, so an
  // explicit v3.2 value wins over any v3.1 default with the same key.
  let v32Value = null;
  let v32ParseWarning = null;
  const v32Raw = fields[FID.V32_DATA_POINTS_JSON];
  if (v32Raw && typeof v32Raw === "string" && v32Raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(v32Raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        v32Value = parsed;
      } else {
        v32ParseWarning = "v3.2 Data Points (JSON) must decode to a JSON object.";
      }
    } catch (e) {
      v32ParseWarning = e && e.message ? e.message : "JSON.parse failed.";
    }
  }

  // Airtable returns true for checked, undefined (not false) for unchecked.
  //
  // ITEM-01 (Sep 2026): the engine signals "no input" with `=== undefined`
  // ONLY — see sc_8_1_2.ts and dnsh_water.ts, which both fall through to
  // `Number(raw)` for anything else. A blank numeric cell used to arrive as
  // null, and Number(null) is 0, which sits under every efficiency threshold
  // in the methodology. A blank annualised WUE therefore PASSED the DNSH
  // water test on a water-stressed site, and a blank PUE passed sc_8_1_2 —
  // false passes on regulated thresholds. Both now go through optionalKey so
  // an empty cell leaves the key out and the engine reports data_missing.
  const data_points = {
    ...optionalKey("ecocc_practices_implemented", ecoccValue),
    last_independent_audit_date: fields[FID.LAST_INDEPENDENT_AUDIT_DATE] ?? null,
    ...optionalKey("annualised_pue", fields[FID.ANNUALISED_PUE]),
    // ITEM-04: dnsh_adaptation has three distinct paths — undefined is
    // data_missing, an explicit false is a FAIL ("Climate risk vulnerability
    // assessment has not been completed"), and true passes or partials.
    // Boolean(undefined) collapsed the first two, so an unticked box — which
    // is the state of every record nobody has got to yet — published a DNSH
    // adaptation failure against the developer on no evidence at all. The
    // tri-state select now carries a real No when there is one; blank stays
    // blank. Same shape as triState() for the c2 fields under BUG-01.
    ...optionalKey(
      "climate_risk_assessment_completed",
      triState(fields[FID.CLIMATE_RISK_COMPLETED_TRI], fields[FID.CLIMATE_RISK_COMPLETED]),
    ),
    ...optionalKey(
      "climate_risk_assessment_methodology",
      fields[FID.CLIMATE_RISK_METHODOLOGY],
    ),
    ...optionalKey("wue_annualised", fields[FID.WUE_ANNUALISED]),
    site_water_stress_classification: fields[FID.SITE_WATER_STRESS] ?? null,
    ...(v32Value ?? {}),
    // v3.2 explicit columns — override the v32 JSON blob when present. Each
    // key is omitted if the Airtable cell is empty, so the engine's
    // "data_missing" path fires honestly for unpopulated fields.
    ...optionalKey("pue_measurement_methodology_declared", fields[FID.PUE_MEASUREMENT_METHODOLOGY]),
    ...optionalKey("pue_measurement_category", fields[FID.PUE_MEASUREMENT_CATEGORY]),
    ...optionalKey("pue_measurement_boundary_documented", coerceCheckbox(fields[FID.PUE_MEASUREMENT_BOUNDARY])),
    ...optionalKey("pue_reporting_basis", fields[FID.PUE_REPORTING_BASIS]),
    ...optionalKey("human_rights_compliance_items", fields[FID.HUMAN_RIGHTS_ITEMS]),
    ...optionalKey("bribery_corruption_compliance_items", fields[FID.BRIBERY_CORRUPTION_ITEMS]),
    ...optionalKey("taxation_compliance_items", fields[FID.TAXATION_ITEMS]),
    ...optionalKey("fair_competition_compliance_items", fields[FID.FAIR_COMPETITION_ITEMS]),
    ...optionalKey("circular_economy_compliance_items", fields[FID.CIRCULAR_ECONOMY_ITEMS]),
  };

  // The rule applied once, rather than remembered at each field above. Two
  // keys still reached the engine as null after the ITEM-01 sweep —
  // last_independent_audit_date and site_water_stress_classification — and
  // both are removed by this without anyone having had to notice them. See
  // omitBlanks.
  //
  // Scoped to data_points deliberately. project_input's own scalars are left
  // alone here because project_id feeds the benchmark's asset hash, and
  // changing it from null to absent would change that hash — a new identity
  // for an existing series in an append-only table. That belongs with the
  // ITEM-15 fix, which has to decide the hashing question properly.
  const cleaned_data_points = omitBlanks(data_points);

  const { documents: evidence_documents, warnings: evidenceWarnings } =
    parseEvidenceDocuments(fields[FID.EVIDENCE_DOCUMENTS] ?? "");

  const project_input = {
    project_id: fields[FID.PROJECT_ID] ?? null,
    intake_timestamp: fields[FID.ISSUED_AT] ?? new Date().toISOString(),
    facility_type: fields[FID.FACILITY_TYPE] ?? null,
    jurisdiction: fields[FID.JURISDICTION] ?? null,
    facility_status: fields[FID.FACILITY_STATUS] ?? null,
    build_completion_year: fields[FID.BUILD_COMPLETION_YEAR] ?? undefined,
    data_points: cleaned_data_points,
    evidence_documents,
  };

  // Airtable returns singleSelect fields as an object {id, name, color}
  // when not using returnFieldsByFieldId — but with returnFieldsByFieldId=true
  // (which this client passes), the value comes through as the plain option
  // name string. Fall back defensively in case Airtable behaviour shifts.
  function singleSelectValue(raw, fallback) {
    if (typeof raw === "string") return raw;
    if (raw && typeof raw === "object" && typeof raw.name === "string") return raw.name;
    return fallback;
  }
  const target_label = singleSelectValue(fields[FID.TARGET_LABEL], "eu_taxonomy_aligned_8_1");

  // v0.5.0-alpha.8 (Phase 1, commit 1.5a Phase B-2): SFDR Specifics raw
  // fields surfaced onto the engagement object. Mapped into the engine
  // ProjectSFDRInputs shape by sfdrInputAdapter.buildSFDRInputs at the
  // engine-call boundary in ReportRoute. Empty / undefined is OK — the
  // adapter falls back to undefined when nothing is populated.
  const sfdr_si_objective = fields[FID.SFDR_SI_OBJECTIVE] ?? undefined;
  const sfdr_si_objective_category = singleSelectValue(
    fields[FID.SFDR_SI_OBJECTIVE_CATEGORY],
    undefined,
  );
  const sfdr_dominance_test = fields[FID.SFDR_DOMINANCE_TEST] ?? undefined;
  const sfdr_es_characteristic = fields[FID.SFDR_ES_CHARACTERISTIC] ?? undefined;
  const sfdr_pai_data = fields[FID.SFDR_PAI_DATA] ?? undefined;
  const sfdr_assurance_tier = singleSelectValue(
    fields[FID.SFDR_ASSURANCE_TIER],
    undefined,
  );
  // Entity-level attestations JSON blob (legacy). entityInputAdapter prefers
  // the discrete c2_* / c3_* / c5_* / c7_* columns over this blob when they
  // are populated, falling back to the blob only when the discrete columns
  // are empty (transitional back-compat path for engagements seeded before
  // PR A1/A4).
  const sfdr_entity_disclosures = fields[FID.SFDR_ENTITY_DISCLOSURES] ?? undefined;

  // ── UK SDR (v0.6.0) — raw cell values, adapter assembles ProjectUKSDRInputs.
  // Single-select fields go through singleSelectValue; multi-select is read
  // directly (Airtable returns string[] which ukSDRInputAdapter's defensive
  // Array.isArray check handles); long-text JSON blobs are passed as strings
  // for the adapter's safeJsonParse to handle.
  const uk_sdr_standard_claimed = singleSelectValue(
    fields[FID.UK_SDR_STANDARD_CLAIMED],
    undefined,
  );
  const uk_sdr_kpis_committed = fields[FID.UK_SDR_KPIS_COMMITTED] ?? undefined;
  const uk_sdr_reporting_frequency = singleSelectValue(
    fields[FID.UK_SDR_REPORTING_FREQUENCY],
    undefined,
  );
  const uk_sdr_improvement_plan = fields[FID.UK_SDR_IMPROVEMENT_PLAN] ?? undefined;
  const uk_sdr_impact_plan = fields[FID.UK_SDR_IMPACT_PLAN] ?? undefined;

  // ── PR A2 + A4 — fetch linked child tables in parallel ──────────────
  // Six API calls in parallel. Each child table is filtered by the engagement
  // reference UUID (NOT the Airtable record.id). ARRAYJOIN({engagement}) on a
  // linked-record field returns the primary field values of the linked records
  // — which for the Engagements table is the "Engagement Reference" UUID. So
  // the SEARCH formula must use the UUID, not the rec... record ID.
  // The parent record carries the ids of its own child rows, so fetch those
  // directly rather than searching each table for rows that point back. See
  // fetchChildRowsByIds. A table the engagement links nothing in is not
  // queried at all — on current data that is six requests saved for most
  // engagements, and it is why this is faster as well as safer.
  const linkedIds = (name) => {
    const v = fields[CHILD_LINK_FIDS[name]];
    return Array.isArray(v) ? v : [];
  };
  const [
    es_characteristics_records,
    pai_coverage_records,
    annex_ii_coverage_records,
    project_reports_records,
    parent_portfolio_reports_records,
    project_pai_data_records,
  ] = await Promise.all([
    fetchChildRowsByIds(baseId, CHILD_TABLES.ES_CHARACTERISTICS, linkedIds("ES_CHARACTERISTICS"), pat),
    fetchChildRowsByIds(baseId, CHILD_TABLES.PAI_COVERAGE, linkedIds("PAI_COVERAGE"), pat),
    fetchChildRowsByIds(baseId, CHILD_TABLES.ANNEX_II_COVERAGE, linkedIds("ANNEX_II_COVERAGE"), pat),
    fetchChildRowsByIds(baseId, CHILD_TABLES.PROJECT_REPORTS, linkedIds("PROJECT_REPORTS"), pat),
    fetchChildRowsByIds(baseId, CHILD_TABLES.PARENT_PORTFOLIO_REPORTS, linkedIds("PARENT_PORTFOLIO_REPORTS"), pat),
    fetchChildRowsByIds(baseId, CHILD_TABLES.PROJECT_PAI_DATA, linkedIds("PROJECT_PAI_DATA"), pat),
  ]);

  // ITEM-17 / ITEM-18: the parent's own link arrays say how many rows each of
  // those calls should have returned. A shortfall means rows we know exist
  // were not read, so every criterion fed by that table would understate the
  // evidence. Refuse the report rather than issue an understated opinion —
  // see findChildRowShortfalls for why this is the only available check.
  const childShortfalls = findChildRowShortfalls(fields, {
    ES_CHARACTERISTICS: es_characteristics_records,
    PAI_COVERAGE: pai_coverage_records,
    ANNEX_II_COVERAGE: annex_ii_coverage_records,
    PROJECT_REPORTS: project_reports_records,
    PARENT_PORTFOLIO_REPORTS: parent_portfolio_reports_records,
    PROJECT_PAI_DATA: project_pai_data_records,
  });
  if (childShortfalls.length > 0) {
    return { ok: false, reason: "child_data_incomplete", shortfalls: childShortfalls };
  }

  // ITEM-17 (B4): catch select values that are present but unrecognised, which
  // every "is it missing?" guard waves through. Also flag a blank c7 status:
  // entityInputAdapter defaults it to "pre_operational", which is
  // scoring-neutral today (the engine tests `=== "operational"`, so undefined
  // and "pre_operational" behave alike) but still puts a claim in the input
  // shape that nobody made, and hides the fact that nobody answered.
  /** @type {string[]} */
  const schemaWarnings = [...evidenceWarnings];
  if (lookupDegraded) {
    schemaWarnings.push(
      "The `Engagement Reference` field appears to have been renamed in " +
        "Airtable. Report lookup has fallen back to a slower scan that matches " +
        "on the immutable field id, so reports still work — but restore the " +
        "field name, because filterByFormula can only address fields by " +
        "display name and this is the one place that cannot be made " +
        "rename-proof.",
    );
  }
  const c7StatusRaw = singleSelectValue(fields[FID.C7_OPERATIONAL_STATUS], undefined);
  for (const [fid, label] of [
    [FID.C6_METHODOLOGY, "c6 methodology"],
    [FID.C7_OPERATIONAL_STATUS, "c7 operational status"],
    [FID.TARGET_LABEL, "Target Label"],
    [FID.SITE_WATER_STRESS, "Site Water Stress Classification"],
    [FID.FACILITY_STATUS, "Facility Status"],
    [FID.FACILITY_TYPE, "Facility Type"],
    [FID.SFDR_ASSURANCE_TIER, "SFDR Assurance Tier"],
    [FID.C7_REPORTING_NAMED_STANDARD, "c7 reporting named standard"],
    [FID.UK_SDR_REPORTING_FREQUENCY, "UK SDR reporting frequency"],
    [FID.UK_SDR_STANDARD_CLAIMED, "UK SDR standard claimed"],
  ]) {
    warnOnUnrecognisedOption(
      fid,
      label,
      singleSelectValue(fields[fid], undefined),
      schemaWarnings,
    );
  }
  if (c7StatusRaw === undefined && fields[FID.C7_COMMISSIONING_DATE]) {
    schemaWarnings.push(
      '"c7 operational status" is blank although a commissioning date is recorded. ' +
        "Criterion 7 is being scored on the pre-operational path, which nobody has " +
        "stated. Set it to operational or pre_operational.",
    );
  }

  const engagement = {
    run_id: engagementReference,
    project_input,
    target_label,
    sfdr_si_objective,
    sfdr_si_objective_category,
    sfdr_dominance_test,
    sfdr_es_characteristic,
    sfdr_pai_data,
    sfdr_assurance_tier,
    sfdr_entity_disclosures,
    // v0.6.0 (UK SDR Phase 2): five raw Airtable fields, consumed by
    // ukSDRInputAdapter.buildUKSDRInputs() in the paid Report flow.
    uk_sdr_standard_claimed,
    uk_sdr_kpis_committed,
    uk_sdr_reporting_frequency,
    uk_sdr_improvement_plan,
    uk_sdr_impact_plan,
    // PR A1 — c2/c3/c7 discrete entity scalars (raw cell values; adapter
    // composes the EntityInput shape from these).
    // c2 booleans are tri-state (true / false / undefined = not known), see
    // triState() and BUG-01.
    c2_independent_ned_count: fields[FID.C2_INDEPENDENT_NED_COUNT] ?? undefined,
    c2_terms_of_reference_documented: triState(fields[FID.C2_TERMS_OF_REFERENCE_DOCUMENTED_TRI], fields[FID.C2_TERMS_OF_REFERENCE_DOCUMENTED]),
    c2_ceo_chair_separated: triState(fields[FID.C2_CEO_CHAIR_SEPARATED_TRI], fields[FID.C2_CEO_CHAIR_SEPARATED]),
    c2_lead_independent_director_designated: triState(fields[FID.C2_LEAD_INDEPENDENT_DIRECTOR_DESIGNATED_TRI], fields[FID.C2_LEAD_INDEPENDENT_DIRECTOR_DESIGNATED]),
    c2_executive_committee_published: triState(fields[FID.C2_EXECUTIVE_COMMITTEE_PUBLISHED_TRI], fields[FID.C2_EXECUTIVE_COMMITTEE_PUBLISHED]),
    c2_ungc_violations_5yr_count: fields[FID.C2_UNGC_VIOLATIONS_5YR_COUNT] ?? undefined,
    c2_ungp_aligned_policy_published: triState(fields[FID.C2_UNGP_ALIGNED_POLICY_PUBLISHED_TRI], fields[FID.C2_UNGP_ALIGNED_POLICY_PUBLISHED]),
    c2_grievance_mechanism_documented: triState(fields[FID.C2_GRIEVANCE_MECHANISM_DOCUMENTED_TRI], fields[FID.C2_GRIEVANCE_MECHANISM_DOCUMENTED]),
    c2_labour_law_compliance_attested: triState(fields[FID.C2_LABOUR_LAW_COMPLIANCE_ATTESTED_TRI], fields[FID.C2_LABOUR_LAW_COMPLIANCE_ATTESTED]),
    c2_remuneration_policy_published: triState(fields[FID.C2_REMUNERATION_POLICY_PUBLISHED_TRI], fields[FID.C2_REMUNERATION_POLICY_PUBLISHED]),
    c2_ceo_to_median_ratio_disclosed: triState(fields[FID.C2_CEO_TO_MEDIAN_RATIO_DISCLOSED_TRI], fields[FID.C2_CEO_TO_MEDIAN_RATIO_DISCLOSED]),
    c2_ceo_to_median_ratio_value: fields[FID.C2_CEO_TO_MEDIAN_RATIO_VALUE] ?? undefined,
    c2_esg_linked_variable_pay: triState(fields[FID.C2_ESG_LINKED_VARIABLE_PAY_TRI], fields[FID.C2_ESG_LINKED_VARIABLE_PAY]),
    c2_tax_policy_published: triState(fields[FID.C2_TAX_POLICY_PUBLISHED_TRI], fields[FID.C2_TAX_POLICY_PUBLISHED]),
    c2_tax_jurisdictions_used: fields[FID.C2_TAX_JURISDICTIONS_USED] ?? undefined,
    c2_cbcr_jurisdiction_count: fields[FID.C2_CBCR_JURISDICTION_COUNT] ?? undefined,
    c2_unresolved_tax_disputes_eur_max: fields[FID.C2_UNRESOLVED_TAX_DISPUTES_EUR_MAX] ?? undefined,
    c3_statement_url: fields[FID.C3_STATEMENT_URL] ?? undefined,
    c3_statement_published_date: fields[FID.C3_STATEMENT_PUBLISHED_DATE] ?? undefined,
    c3_art_4_explicit_reference: Boolean(fields[FID.C3_ART_4_EXPLICIT_REFERENCE]),
    c7_operational_status: singleSelectValue(fields[FID.C7_OPERATIONAL_STATUS], undefined),
    c7_commissioning_date: fields[FID.C7_COMMISSIONING_DATE] ?? undefined,
    c7_specifies_indicators: Boolean(fields[FID.C7_SPECIFIES_INDICATORS]),
    c7_specifies_annual_cadence: Boolean(fields[FID.C7_SPECIFIES_ANNUAL_CADENCE]),
    c7_specifies_assurance: Boolean(fields[FID.C7_SPECIFIES_ASSURANCE]),
    c7_reporting_named_standard: singleSelectValue(fields[FID.C7_REPORTING_NAMED_STANDARD], undefined),
    // PR A3 — c6 taxonomy claim discrete columns
    c6_taxonomy_claim_made: Boolean(fields[FID.C6_TAXONOMY_CLAIM_MADE]),
    c6_claimed_percentage: fields[FID.C6_CLAIMED_PERCENTAGE] ?? undefined,
    c6_methodology: singleSelectValue(fields[FID.C6_METHODOLOGY], undefined),
    c6_minimum_safeguards_attestation: Boolean(fields[FID.C6_MINIMUM_SAFEGUARDS_ATTESTATION]),
    c6_published_date: fields[FID.C6_PUBLISHED_DATE] ?? undefined,
    c6_breakdown_climate_mitigation_pct: fields[FID.C6_BREAKDOWN_CLIMATE_MITIGATION_PCT] ?? undefined,
    c6_breakdown_climate_adaptation_pct: fields[FID.C6_BREAKDOWN_CLIMATE_ADAPTATION_PCT] ?? undefined,
    c6_breakdown_water_pct: fields[FID.C6_BREAKDOWN_WATER_PCT] ?? undefined,
    c6_breakdown_circular_economy_pct: fields[FID.C6_BREAKDOWN_CIRCULAR_ECONOMY_PCT] ?? undefined,
    c6_breakdown_pollution_pct: fields[FID.C6_BREAKDOWN_POLLUTION_PCT] ?? undefined,
    c6_breakdown_biodiversity_pct: fields[FID.C6_BREAKDOWN_BIODIVERSITY_PCT] ?? undefined,
    // PR A2 + A4 — linked child rows (raw arrays; adapters destructure
    // per-row fields via CHILD_FIDS). Sorted client-side where order
    // matters (e.g. ES characteristics by slot).
    es_characteristics: es_characteristics_records,
    pai_coverage: pai_coverage_records,
    annex_ii_coverage: annex_ii_coverage_records,
    project_reports: project_reports_records,
    parent_portfolio_reports: parent_portfolio_reports_records,
    project_pai_data: project_pai_data_records,
    evidence_references: evidence_documents,
    signatory_overrides: normalizeSignatoryOverrides(fields),
    report_metadata: {
      client_name: fields[FID.CLIENT_NAME] ?? null,
      project_name: fields[FID.PROJECT_NAME] ?? null,
      project_id: fields[FID.PROJECT_ID] ?? null,
      engagement_letter_signed: Boolean(fields[FID.ENGAGEMENT_LETTER_SIGNED]),
      engagement_letter_date: fields[FID.ENGAGEMENT_LETTER_DATE] ?? null,
    },
  };

  if (ecoccParseWarning) {
    engagement.ecocc_parse_warning = ecoccParseWarning;
  }
  if (v32ParseWarning) {
    engagement.v32_parse_warning = v32ParseWarning;
  }
  if (schemaWarnings.length > 0) {
    engagement.schema_warnings = schemaWarnings;
  }

  return { ok: true, engagement };
}
