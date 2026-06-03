// @ts-check
// Paid-flow only — see CLAUDE.md.
//
// Entity Input Adapter — composes the engine's EntityInput shape from the
// engagement record's discrete c2_* / c3_* / c5_* / c7_* columns and the
// linked child tables (PAI Coverage, Annex II Coverage, Project Reports,
// Parent Portfolio Reports). Drives the four entity-axis SFDR criteria:
//
//   - c2 sfdr_v1_good_governance_attestation         (reads gov.*)
//   - c3 sfdr_v1_pai_consideration_policy            (reads pai_disclosures.*)
//   - c5 sfdr_v1_pre_contractual_disclosure          (reads disclosures.annex_ii_coverage)
//   - c7 sfdr_v1_periodic_reporting_commitment       (reads reporting.*)
//
// History: pre-PR-A1, this adapter parsed a single sfdr_entity_disclosures
// JSON blob. PR A1 migrated entity scalars to discrete Airtable columns
// (one cell per boolean / number) so Dolapo can edit them in the grid
// without JSON syntax. PR A4 migrated the repeating shapes (PAI coverage,
// Annex II coverage, reports) to linked child tables. The legacy JSON
// blob is retained as a back-compat fallback when no discrete columns
// are populated — gives engagements seeded under the old schema a clean
// migration path.

import { CHILD_FIDS } from "./airtableEngagement.js";

/**
 * @typedef {Object} EngagementEntityRaw
 * @property {string} [run_id]
 * @property {string} [legal_name]
 * @property {string} [jurisdiction]
 * @property {Object} [report_metadata]
 * @property {string} [sfdr_entity_disclosures]
 * @property {number} [c2_independent_ned_count]
 * @property {boolean} [c2_terms_of_reference_documented]
 * @property {boolean} [c2_ceo_chair_separated]
 * @property {boolean} [c2_lead_independent_director_designated]
 * @property {boolean} [c2_executive_committee_published]
 * @property {number} [c2_ungc_violations_5yr_count]
 * @property {boolean} [c2_ungp_aligned_policy_published]
 * @property {boolean} [c2_grievance_mechanism_documented]
 * @property {boolean} [c2_labour_law_compliance_attested]
 * @property {boolean} [c2_remuneration_policy_published]
 * @property {boolean} [c2_ceo_to_median_ratio_disclosed]
 * @property {number} [c2_ceo_to_median_ratio_value]
 * @property {boolean} [c2_esg_linked_variable_pay]
 * @property {boolean} [c2_tax_policy_published]
 * @property {string} [c2_tax_jurisdictions_used]
 * @property {number} [c2_cbcr_jurisdiction_count]
 * @property {number} [c2_unresolved_tax_disputes_eur_max]
 * @property {string} [c3_statement_url]
 * @property {string} [c3_statement_published_date]
 * @property {boolean} [c3_art_4_explicit_reference]
 * @property {string} [c7_operational_status]
 * @property {string} [c7_commissioning_date]
 * @property {boolean} [c7_specifies_indicators]
 * @property {boolean} [c7_specifies_annual_cadence]
 * @property {boolean} [c7_specifies_assurance]
 * @property {string} [c7_reporting_named_standard]
 * @property {Array<{id: string, fields: Record<string, unknown>}>} [pai_coverage]
 * @property {Array<{id: string, fields: Record<string, unknown>}>} [annex_ii_coverage]
 * @property {Array<{id: string, fields: Record<string, unknown>}>} [project_reports]
 * @property {Array<{id: string, fields: Record<string, unknown>}>} [parent_portfolio_reports]
 */

function tryParseJSON(raw, fallback) {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[entityInputAdapter] JSON parse failed:", err);
    return fallback;
  }
}

function resolveEntityIdentity(engagement) {
  const projectInput = /** @type {any} */ (engagement).project_input ?? {};
  return {
    entity_id: engagement.run_id ?? "unknown_entity",
    legal_name:
      engagement.report_metadata?.client_name ??
      engagement.legal_name ??
      "Developer entity",
    jurisdiction:
      projectInput.jurisdiction ?? engagement.jurisdiction ?? "unknown",
  };
}

/**
 * Compose the engine's EntityGovernance shape from discrete c2_* columns.
 * Returns undefined when NONE of the c2_* fields are populated (signals
 * "no entity governance data" to the caller; engine returns
 * insufficient_evidence on c2). Returns partial sub-shape when some
 * domains are populated — engine will surface per-domain partial verdicts.
 */
function buildGovernanceFromDiscrete(engagement) {
  const anyC2 =
    engagement.c2_independent_ned_count !== undefined ||
    engagement.c2_terms_of_reference_documented ||
    engagement.c2_ceo_chair_separated ||
    engagement.c2_lead_independent_director_designated ||
    engagement.c2_executive_committee_published ||
    engagement.c2_ungc_violations_5yr_count !== undefined ||
    engagement.c2_ungp_aligned_policy_published ||
    engagement.c2_grievance_mechanism_documented ||
    engagement.c2_labour_law_compliance_attested ||
    engagement.c2_remuneration_policy_published ||
    engagement.c2_ceo_to_median_ratio_disclosed ||
    engagement.c2_ceo_to_median_ratio_value !== undefined ||
    engagement.c2_esg_linked_variable_pay ||
    engagement.c2_tax_policy_published ||
    engagement.c2_tax_jurisdictions_used ||
    engagement.c2_cbcr_jurisdiction_count !== undefined ||
    engagement.c2_unresolved_tax_disputes_eur_max !== undefined;
  if (!anyC2) return undefined;

  const jurisdictionsRaw = engagement.c2_tax_jurisdictions_used;
  const jurisdictions_used = typeof jurisdictionsRaw === "string"
    ? jurisdictionsRaw.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
    : [];

  return {
    board_structure: {
      independent_ned_count: engagement.c2_independent_ned_count ?? 0,
      terms_of_reference_documented: Boolean(engagement.c2_terms_of_reference_documented),
      ceo_chair_separated: Boolean(engagement.c2_ceo_chair_separated),
      lead_independent_director_designated: Boolean(engagement.c2_lead_independent_director_designated),
      executive_committee_published: Boolean(engagement.c2_executive_committee_published),
    },
    employee_relations: {
      ungc_violations_5yr_count: engagement.c2_ungc_violations_5yr_count ?? 0,
      ungp_aligned_policy_published: Boolean(engagement.c2_ungp_aligned_policy_published),
      grievance_mechanism_documented: Boolean(engagement.c2_grievance_mechanism_documented),
      labour_law_compliance_attested: Boolean(engagement.c2_labour_law_compliance_attested),
    },
    remuneration: {
      policy_published: Boolean(engagement.c2_remuneration_policy_published),
      ceo_to_median_ratio_disclosed: Boolean(engagement.c2_ceo_to_median_ratio_disclosed),
      ceo_to_median_ratio_value: engagement.c2_ceo_to_median_ratio_value,
      esg_linked_variable_pay: Boolean(engagement.c2_esg_linked_variable_pay),
    },
    tax_compliance: {
      tax_policy_published: Boolean(engagement.c2_tax_policy_published),
      jurisdictions_used,
      cbcr_jurisdiction_count: engagement.c2_cbcr_jurisdiction_count ?? 0,
      unresolved_tax_disputes_eur_max: engagement.c2_unresolved_tax_disputes_eur_max ?? 0,
    },
  };
}

/**
 * Compose EntityPAIDisclosures from c3_* scalars + the SFDR PAI Coverage
 * child table. Returns undefined when no c3 inputs are present.
 */
function buildPAIDisclosuresFromDiscrete(engagement) {
  const paiCoverage = Array.isArray(engagement.pai_coverage)
    ? engagement.pai_coverage
    : [];
  const hasUrl = typeof engagement.c3_statement_url === "string" && engagement.c3_statement_url.length > 0;
  if (!hasUrl && paiCoverage.length === 0) return undefined;

  const pai_coverage = {};
  for (const row of paiCoverage) {
    const f = row.fields || {};
    const paiNumber = f[CHILD_FIDS.PAI_COVERAGE.PAI_NUMBER];
    if (typeof paiNumber !== "number") continue;
    pai_coverage[String(paiNumber)] = {
      data_disclosed: Boolean(f[CHILD_FIDS.PAI_COVERAGE.DATA_DISCLOSED]),
      target_disclosed: Boolean(f[CHILD_FIDS.PAI_COVERAGE.TARGET_DISCLOSED]),
      mitigation_documented: Boolean(f[CHILD_FIDS.PAI_COVERAGE.MITIGATION_DOCUMENTED]),
    };
  }

  return {
    statement_url: engagement.c3_statement_url,
    statement_published_date: engagement.c3_statement_published_date,
    art_4_explicit_reference: Boolean(engagement.c3_art_4_explicit_reference),
    pai_coverage,
  };
}

/**
 * Compose EntityDisclosures (Annex II coverage) from the linked child table.
 * Returns undefined when no rows are linked.
 */
function buildDisclosuresFromDiscrete(engagement) {
  const annexCoverage = Array.isArray(engagement.annex_ii_coverage)
    ? engagement.annex_ii_coverage
    : [];
  if (annexCoverage.length === 0) return undefined;

  const annex_ii_coverage = {};
  for (const row of annexCoverage) {
    const f = row.fields || {};
    const elementNumber = f[CHILD_FIDS.ANNEX_II_COVERAGE.ELEMENT_NUMBER];
    if (typeof elementNumber !== "number") continue;
    const entry = {
      coverage: singleSelectValue(f[CHILD_FIDS.ANNEX_II_COVERAGE.COVERAGE]),
    };
    const namedFw = singleSelectValue(f[CHILD_FIDS.ANNEX_II_COVERAGE.NAMED_FRAMEWORK]);
    if (namedFw) entry.named_framework = namedFw;
    annex_ii_coverage[String(elementNumber)] = entry;
  }

  return { annex_ii_coverage };
}

/**
 * Compose EntityReporting from c7_* scalars + Project Reports + Parent
 * Portfolio Reports child tables. Returns undefined when no c7 data present.
 */
function buildReportingFromDiscrete(engagement) {
  const opStatus = engagement.c7_operational_status;
  const projectReports = Array.isArray(engagement.project_reports) ? engagement.project_reports : [];
  const parentReports = Array.isArray(engagement.parent_portfolio_reports) ? engagement.parent_portfolio_reports : [];
  const hasFwCommitment =
    engagement.c7_specifies_indicators ||
    engagement.c7_specifies_annual_cadence ||
    engagement.c7_specifies_assurance ||
    engagement.c7_reporting_named_standard;
  if (!opStatus && projectReports.length === 0 && parentReports.length === 0 && !hasFwCommitment) {
    return undefined;
  }

  const reporting = {
    operational_status: opStatus ?? "pre_operational",
  };
  if (engagement.c7_commissioning_date) {
    reporting.commissioning_date = engagement.c7_commissioning_date;
  }
  if (hasFwCommitment) {
    reporting.reporting_framework_commitment = {
      specifies_indicators: Boolean(engagement.c7_specifies_indicators),
      specifies_annual_cadence: Boolean(engagement.c7_specifies_annual_cadence),
      specifies_assurance: Boolean(engagement.c7_specifies_assurance),
      ...(engagement.c7_reporting_named_standard
        ? { named_standard: engagement.c7_reporting_named_standard }
        : {}),
    };
  }
  if (projectReports.length > 0) {
    reporting.project_reports = projectReports.map((r) => mapReportRow(r, CHILD_FIDS.PROJECT_REPORTS));
  }
  if (parentReports.length > 0) {
    reporting.parent_portfolio_reports = parentReports.map((r) => mapReportRow(r, CHILD_FIDS.PARENT_PORTFOLIO_REPORTS));
  }
  return reporting;
}

function mapReportRow(row, fids) {
  const f = row.fields || {};
  const indicator_names_raw = f[fids.INDICATOR_NAMES];
  const indicator_names = typeof indicator_names_raw === "string"
    ? indicator_names_raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
    : [];
  const out = {
    year: f[fids.YEAR],
    indicator_names,
  };
  if (f[fids.URL]) out.url = f[fids.URL];
  const namedStd = singleSelectValue(f[fids.NAMED_STANDARD]);
  if (namedStd) out.named_standard = namedStd;
  return out;
}

function singleSelectValue(raw) {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && typeof raw.name === "string") return raw.name;
  return undefined;
}

/**
 * Build the engine's EntityInput from an engagement record. Prefers the
 * discrete c2_* / c3_* / c5_* / c7_* columns + linked child tables. When
 * none of those produce a sub-shape, falls back to parsing the legacy
 * sfdr_entity_disclosures JSON blob — preserves back-compat for engagements
 * seeded under the pre-PR-A1 schema.
 *
 * Returns undefined when NEITHER path yields any populated sub-shape;
 * engine then returns insufficient_evidence on the entity-axis criteria,
 * and the paid Report PDF renders the existing "ENTITY-LEVEL DISCLOSURE
 * REQUIRED" callout.
 *
 * @param {EngagementEntityRaw} engagement
 * @returns {object | undefined}
 */
export function buildEntityInputs(engagement) {
  if (!engagement) return undefined;

  const sfdr = {};
  let hasAny = false;

  const gov = buildGovernanceFromDiscrete(engagement);
  if (gov) { sfdr.governance = gov; hasAny = true; }

  const pai = buildPAIDisclosuresFromDiscrete(engagement);
  if (pai) { sfdr.pai_disclosures = pai; hasAny = true; }

  const disclosures = buildDisclosuresFromDiscrete(engagement);
  if (disclosures) { sfdr.disclosures = disclosures; hasAny = true; }

  const reporting = buildReportingFromDiscrete(engagement);
  if (reporting) { sfdr.reporting = reporting; hasAny = true; }

  // Fallback: parse the legacy JSON blob when discrete columns produced
  // nothing. Mirrors the pre-PR-A1 adapter behaviour.
  if (!hasAny) {
    const parsed = tryParseJSON(engagement.sfdr_entity_disclosures, null);
    if (parsed && typeof parsed === "object") {
      if (parsed.governance && typeof parsed.governance === "object") {
        sfdr.governance = parsed.governance;
        hasAny = true;
      }
      if (parsed.pai_disclosures && typeof parsed.pai_disclosures === "object") {
        sfdr.pai_disclosures = parsed.pai_disclosures;
        hasAny = true;
      }
      if (parsed.disclosures && typeof parsed.disclosures === "object") {
        sfdr.disclosures = parsed.disclosures;
        hasAny = true;
      }
      if (parsed.reporting && typeof parsed.reporting === "object") {
        sfdr.reporting = parsed.reporting;
        hasAny = true;
      }
    }
  }

  if (!hasAny) return undefined;

  const identity = resolveEntityIdentity(engagement);
  return {
    entity_id: identity.entity_id,
    legal_name: identity.legal_name,
    jurisdiction: identity.jurisdiction,
    sfdr,
  };
}
