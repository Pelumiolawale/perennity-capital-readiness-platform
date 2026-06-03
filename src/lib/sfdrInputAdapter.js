// @ts-check
// Paid-flow only — see CLAUDE.md. Do not import from /assessment/snapshot or any free-tier component.
import { CHILD_FIDS } from "./airtableEngagement.js";
//
// SFDR Input Adapter — maps Airtable engagement SFDR fields onto the v3.5
// engine input shape (ProjectSFDRInputs / ProjectArt9Inputs).
//
// The 6 Airtable SFDR Specifics fields landed in 1.5a Phase B-2:
//   - sfdr_si_objective         (string)        → art9.si_objective.objective.name
//   - sfdr_si_objective_category (Env|Soc|Mix)  → art9.si_objective.objective.category + taxonomy_mapping
//   - sfdr_dominance_test       (JSON object)   → art9.si_objective.dominance (DominanceEvidence)
//   - sfdr_es_characteristic    (string)        → disclosures.es_characteristics[0]
//   - sfdr_pai_data             (JSON array)    → art9.pai_data.per_pai (Record<paiNum, ProjectPAIDatum>)
//   - sfdr_assurance_tier       (AssuranceTier) → art9.evidence_pack.assurance_tier
//
// The 1.5a prompt's B-2.4 mapping referenced engine input keys that don't
// exist (project.sfdr.art9.si_objective.named, project.sfdr.art8.e_s_characteristic.named).
// The actual v3.5 paths are deeper-nested per src/sfdr/types.ts in the
// engine repo; this adapter uses the real shape.

/** @typedef {"Environmental" | "Social" | "Mixed"} EngagementSICategory */
/** @typedef {"reasonable_big4" | "limited_big4" | "limited_partial" | "management_only"} AssuranceTier */

/**
 * @typedef {Object} EngagementSFDRRaw
 * @property {string} [sfdr_si_objective]
 * @property {EngagementSICategory} [sfdr_si_objective_category]
 * @property {string} [sfdr_dominance_test]
 * @property {string} [sfdr_es_characteristic]
 * @property {string} [sfdr_pai_data]
 * @property {AssuranceTier} [sfdr_assurance_tier]
 */

/**
 * Coarse SI-category → engine SIObjectiveCategory mapping. The wizard
 * collects three buckets (Environmental / Social / Mixed); the engine's
 * SIObjectiveCategory enum has ten finer-grained values. Default mapping:
 *   Environmental → environmental_climate_mitigation (DC default — most
 *     data-centre SI objectives are GHG-reduction framed)
 *   Social → social_other_recognised
 *   Mixed → environmental_climate_mitigation (primary; mixed treated as
 *     environmental-anchored)
 *
 * @param {string | null | undefined} engagementCategory
 * @returns {{ category: string, taxonomy_mapping: string | null, social_taxonomy_mapping: string | null }}
 */
function mapSICategory(engagementCategory) {
  switch (engagementCategory) {
    case "Social":
      return {
        category: "social_other_recognised",
        taxonomy_mapping: null,
        social_taxonomy_mapping: "recognised_social_objective",
      };
    case "Mixed":
      return {
        category: "environmental_climate_mitigation",
        taxonomy_mapping: "climate_change_mitigation",
        social_taxonomy_mapping: "recognised_social_objective",
      };
    case "Environmental":
    default:
      return {
        category: "environmental_climate_mitigation",
        taxonomy_mapping: "climate_change_mitigation",
        social_taxonomy_mapping: null,
      };
  }
}

/**
 * Safely parse a JSON-encoded string. Returns the fallback on any
 * parse failure rather than throwing — the adapter must never break the
 * paid Report flow because of malformed Airtable cell content.
 *
 * @template T
 * @param {string | null | undefined} raw
 * @param {T} fallback
 * @returns {T}
 */
function tryParseJSON(raw, fallback) {
  if (typeof raw !== "string" || raw.trim().length === 0) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Convert the 10-row engagement PAI table into the engine's per-PAI record
 * shape. Engagement rows look like:
 *   { pai_number, value, unit, verifier_identity, assurance_status }
 * Engine record shape (ProjectPAIDatum):
 *   { value?, unit?, methodology_ref?, third_party_verified, verifier_name?,
 *     assurance_level?, is_projected? }
 *
 * @param {Array<{pai_number: number, value?: any, unit?: string, verifier_identity?: string, assurance_status?: string}>} rows
 * @returns {Record<string, object>}
 */
function buildPerPaiRecord(rows) {
  if (!Array.isArray(rows)) return {};
  const out = {};
  for (const row of rows) {
    if (!row || typeof row.pai_number !== "number") continue;
    const verified =
      row.assurance_status === "Third-party assured" ||
      row.assurance_status === "third_party_assured";
    const datum = {
      third_party_verified: verified,
    };
    if (row.value !== undefined && row.value !== null && row.value !== "") {
      datum.value = typeof row.value === "string"
        ? (Number.isFinite(Number(row.value)) ? Number(row.value) : row.value)
        : row.value;
    }
    if (row.unit) datum.unit = row.unit;
    if (row.verifier_identity) datum.verifier_name = row.verifier_identity;
    if (row.assurance_status === "Third-party assured" || row.assurance_status === "third_party_assured") {
      datum.assurance_level = "limited";
    }
    out[String(row.pai_number)] = datum;
  }
  return out;
}

/**
 * Compose the engine's ProjectArt9PAIData.per_pai shape from the SFDR
 * Project PAI Data linked child table (PR A4). Each row is one indicator
 * keyed by pai_number.
 *
 * @param {Array<{id: string, fields: Record<string, unknown>}>} rows
 * @returns {Record<string, object>}
 */
function buildPerPaiRecordFromChildRows(rows) {
  const out = {};
  for (const row of rows) {
    const f = row.fields || {};
    const paiNumber = f[CHILD_FIDS.PROJECT_PAI_DATA.PAI_NUMBER];
    if (typeof paiNumber !== "number") continue;
    const assuranceStatus = singleSelectFieldValue(f[CHILD_FIDS.PROJECT_PAI_DATA.ASSURANCE_STATUS]);
    const verified = assuranceStatus === "Third-party assured";
    const datum = { third_party_verified: verified };
    const numericValue = f[CHILD_FIDS.PROJECT_PAI_DATA.VALUE];
    const textValue = f[CHILD_FIDS.PROJECT_PAI_DATA.VALUE_TEXT];
    if (typeof numericValue === "number") datum.value = numericValue;
    else if (typeof textValue === "string" && textValue.length > 0) datum.value = textValue;
    if (f[CHILD_FIDS.PROJECT_PAI_DATA.UNIT]) datum.unit = f[CHILD_FIDS.PROJECT_PAI_DATA.UNIT];
    if (f[CHILD_FIDS.PROJECT_PAI_DATA.VERIFIER_IDENTITY]) datum.verifier_name = f[CHILD_FIDS.PROJECT_PAI_DATA.VERIFIER_IDENTITY];
    if (verified) datum.assurance_level = "limited";
    out[String(paiNumber)] = datum;
  }
  return out;
}

/**
 * Compose ES characteristics array from the SFDR ES Characteristics linked
 * child table (PR A2). Each row is one named characteristic; ordering follows
 * the `slot` field ascending.
 *
 * @param {Array<{id: string, fields: Record<string, unknown>}>} rows
 * @returns {Array<object>}
 */
function buildESCharacteristicsFromChildRows(rows) {
  const fids = CHILD_FIDS.ES_CHARACTERISTICS;
  const sorted = [...rows].sort((a, b) => {
    const sa = (a.fields?.[fids.SLOT] ?? Number.POSITIVE_INFINITY);
    const sb = (b.fields?.[fids.SLOT] ?? Number.POSITIVE_INFINITY);
    return sa - sb;
  });
  const out = [];
  for (const row of sorted) {
    const f = row.fields || {};
    const name = f[fids.NAME];
    if (typeof name !== "string" || name.length === 0) continue;
    const entry = {
      name,
      category: "environmental", // legacy ESCharacteristic.category (env|social) — kept for back-compat
    };
    const category = singleSelectFieldValue(f[fids.CATEGORY]);
    if (category) entry.sector_material_category = category;
    const metric = f[fids.METRIC];
    const targetValue = f[fids.TARGET_VALUE];
    const targetYear = f[fids.TARGET_YEAR];
    if (typeof metric === "string" && metric.length > 0 && typeof targetValue === "number" && typeof targetYear === "number") {
      entry.indicator = {
        metric,
        target_value: targetValue,
        target_year: targetYear,
      };
    }
    if (f[fids.PUBLIC_SOURCE]) entry.public_source = f[fids.PUBLIC_SOURCE];
    out.push(entry);
  }
  return out;
}

/**
 * Derive c8 quantified contribution indicators from the ES Characteristics
 * child rows. Only rows with `indicator_source` set contribute — the rest
 * are c1-only characteristics without a regulatory-source tag.
 *
 * @param {Array<{id: string, fields: Record<string, unknown>}>} rows
 * @returns {Array<object>}
 */
function buildQuantifiedIndicatorsFromChildRows(rows) {
  const fids = CHILD_FIDS.ES_CHARACTERISTICS;
  const out = [];
  for (const row of rows) {
    const f = row.fields || {};
    const source = singleSelectFieldValue(f[fids.INDICATOR_SOURCE]);
    if (!source) continue;
    const metric = f[fids.METRIC];
    if (typeof metric !== "string" || metric.length === 0) continue;
    out.push({
      source,
      indicator_name: metric,
      baseline: typeof f[fids.BASELINE_VALUE] === "number" ? f[fids.BASELINE_VALUE] : undefined,
      target: typeof f[fids.TARGET_VALUE] === "number" ? f[fids.TARGET_VALUE] : undefined,
    });
  }
  return out;
}

function singleSelectFieldValue(raw) {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && typeof raw.name === "string") return raw.name;
  return undefined;
}

/**
 * Map an Airtable engagement record's SFDR fields onto the v3.5 engine
 * ProjectSFDRInputs shape. Returns undefined when no SFDR fields are
 * populated — caller should leave `project.sfdr` unset in that case so
 * the engine resolves every SFDR criterion to insufficient_evidence
 * cleanly.
 *
 * Defensive: every field is optional; partial population produces a
 * partial input shape. Malformed JSON in dominance_test / pai_data falls
 * back to undefined / empty without throwing.
 *
 * @param {EngagementSFDRRaw} engagement
 * @returns {object | undefined}
 */
export function buildSFDRInputs(engagement) {
  if (!engagement) return undefined;

  const esCharRows = Array.isArray(engagement.es_characteristics) ? engagement.es_characteristics : [];
  const paiDataRows = Array.isArray(engagement.project_pai_data) ? engagement.project_pai_data : [];

  const hasAny =
    engagement.sfdr_si_objective ||
    engagement.sfdr_si_objective_category ||
    engagement.sfdr_dominance_test ||
    engagement.sfdr_es_characteristic ||
    engagement.sfdr_pai_data ||
    engagement.sfdr_assurance_tier ||
    esCharRows.length > 0 ||
    paiDataRows.length > 0 ||
    engagement.c6_taxonomy_claim_made;
  if (!hasAny) return undefined;

  const sfdrInputs = {};

  // Art 8 c1 — disclosures.es_characteristics
  // PR A2: prefer the SFDR ES Characteristics linked child table (multiple
  // rows with quantified indicator + sector-material category). Falls back
  // to the legacy sfdr_es_characteristic single-text field, which maps to
  // ONE unquantified characteristic and can only reach not_aligned in c1.
  const esCharsFromChildTable = buildESCharacteristicsFromChildRows(esCharRows);
  if (esCharsFromChildTable.length > 0) {
    sfdrInputs.disclosures = { es_characteristics: esCharsFromChildTable };
  } else if (engagement.sfdr_es_characteristic) {
    sfdrInputs.disclosures = {
      es_characteristics: [
        {
          name: engagement.sfdr_es_characteristic,
          category: "environmental",
        },
      ],
    };
  }

  // Art 8 c6 — taxonomy_claim (PR A3: discrete columns).
  // Only construct the claim object when c6_taxonomy_claim_made is true.
  // When false (the common case for Article 8 light-green positioning),
  // omit taxonomy_claim entirely — engine returns not_applicable with
  // the regulatorily-correct "no Taxonomy claim is permitted" rationale.
  if (engagement.c6_taxonomy_claim_made) {
    const claim = {
      claimed_percentage: engagement.c6_claimed_percentage ?? 0,
      methodology: engagement.c6_methodology ?? "capex",
      minimum_safeguards_attestation: Boolean(engagement.c6_minimum_safeguards_attestation),
      published_date: engagement.c6_published_date ?? new Date().toISOString().slice(0, 10),
    };
    const breakdown = {};
    if (engagement.c6_breakdown_climate_mitigation_pct !== undefined) breakdown.climate_mitigation = engagement.c6_breakdown_climate_mitigation_pct;
    if (engagement.c6_breakdown_climate_adaptation_pct !== undefined) breakdown.climate_adaptation = engagement.c6_breakdown_climate_adaptation_pct;
    if (engagement.c6_breakdown_water_pct !== undefined) breakdown.water = engagement.c6_breakdown_water_pct;
    if (engagement.c6_breakdown_circular_economy_pct !== undefined) breakdown.circular_economy = engagement.c6_breakdown_circular_economy_pct;
    if (engagement.c6_breakdown_pollution_pct !== undefined) breakdown.pollution = engagement.c6_breakdown_pollution_pct;
    if (engagement.c6_breakdown_biodiversity_pct !== undefined) breakdown.biodiversity = engagement.c6_breakdown_biodiversity_pct;
    if (Object.keys(breakdown).length > 0) {
      claim.six_objective_breakdown = breakdown;
    }
    sfdrInputs.taxonomy_claim = claim;
  }

  // Art 9 inputs
  const art9 = {};
  let hasArt9 = false;

  // c8 — si_objective
  if (
    engagement.sfdr_si_objective ||
    engagement.sfdr_si_objective_category ||
    engagement.sfdr_dominance_test
  ) {
    const siObjective = {};
    if (engagement.sfdr_si_objective || engagement.sfdr_si_objective_category) {
      const categoryMap = mapSICategory(engagement.sfdr_si_objective_category);
      siObjective.objective = {
        name: engagement.sfdr_si_objective || "Sustainable investment objective",
        category: categoryMap.category,
        taxonomy_mapping: categoryMap.taxonomy_mapping,
        social_taxonomy_mapping: categoryMap.social_taxonomy_mapping,
      };
    }
    const dominanceParsed = tryParseJSON(engagement.sfdr_dominance_test, null);
    if (dominanceParsed && typeof dominanceParsed === "object") {
      siObjective.dominance = {
        named_in_investment_memorandum: Boolean(
          dominanceParsed.named_in_investment_memorandum,
        ),
        economic_rationale_depends_on_si: Boolean(
          dominanceParsed.economic_rationale_depends_on_si,
        ),
        marketing_leads_with_si: Boolean(dominanceParsed.marketing_leads_with_si),
      };
    }
    // c8 quantified_indicators: derive from ES Characteristics child rows
    // that have indicator_source set. The same characteristic rows that feed
    // c1 also serve as c8 contribution indicators when the regulatory source
    // is populated. Avoids a separate child table for what is conceptually
    // the same data.
    const quantifiedIndicators = buildQuantifiedIndicatorsFromChildRows(esCharRows);
    if (quantifiedIndicators.length > 0) {
      siObjective.quantified_indicators = quantifiedIndicators;
    }

    art9.si_objective = siObjective;
    hasArt9 = true;
  }

  // c10 — pai_data
  // PR A4: prefer the SFDR Project PAI Data child table. Falls back to the
  // legacy sfdr_pai_data JSON blob.
  if (paiDataRows.length > 0) {
    art9.pai_data = {
      per_pai: buildPerPaiRecordFromChildRows(paiDataRows),
      data_recency_months: 6,
    };
    hasArt9 = true;
  } else if (engagement.sfdr_pai_data) {
    const paiRows = tryParseJSON(engagement.sfdr_pai_data, []);
    art9.pai_data = {
      per_pai: buildPerPaiRecord(paiRows),
      data_recency_months: 6,
    };
    hasArt9 = true;
  }

  // c9 — evidence_pack
  if (engagement.sfdr_assurance_tier) {
    art9.evidence_pack = {
      assurance_tier: engagement.sfdr_assurance_tier,
      material_qualifications_present: false,
      operational_doc_age_months: 6,
    };
    hasArt9 = true;
  }

  if (hasArt9) {
    sfdrInputs.art9 = art9;
  }

  return sfdrInputs;
}
