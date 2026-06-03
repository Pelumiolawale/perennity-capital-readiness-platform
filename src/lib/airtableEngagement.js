// @ts-check
// Entitlement client for the gated /assessment/report route.
// Zero side effects at import time — all work happens inside fetchEngagement.
//
// Reads three VITE_* env vars at call time. Note that VITE_ prefix exposes
// these to the production bundle; the PAT is therefore visible to anyone
// who views source. This is acceptable for the Phase 1 entitlement model
// per CLAUDE.md — Dolapo issues engagement references manually and the
// table is narrowly scoped. A serverless proxy is the right move when the
// blast radius justifies it.

// UUID v4 strict format — variant bit forced to one of 8/9/a/b.
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Field IDs from the Engagements table in base appasxX7eC3QsmxeM.
// We request `returnFieldsByFieldId=true` so renames in the Airtable UI
// don't silently break the parser — field IDs are immutable.
const FID = {
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

// Airtable checkbox semantics: true when ticked, undefined when not.
// We need an explicit boolean only when the cell has been touched, since
// undefined here means "leave the key out and let the engine return
// data_missing" rather than "the boundary is not documented".
function coerceCheckbox(value) {
  if (value === true) return true;
  return undefined;
}

function parseEvidenceDocuments(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split(" | ");
      const [document_id, document_type, uri, uploaded_at, sha256] = parts;
      const entry = {
        document_id: document_id ?? null,
        document_type: document_type ?? null,
        uri: uri ?? null,
        uploaded_at: uploaded_at ?? null,
        sha256: sha256 ?? null,
      };
      if (parts.length < 5) {
        entry.parse_warning = `Expected 5 pipe-separated fields, got ${parts.length}.`;
      }
      return entry;
    });
}

function normalizeSignatoryOverrides(fields) {
  const name = fields[FID.SIGNATORY_NAME] || null;
  const title = fields[FID.SIGNATORY_TITLE] || null;
  const signature_block_uri = fields[FID.SIGNATORY_SIG_URI] || null;
  if (!name && !title && !signature_block_uri) return null;
  return { name, title, signature_block_uri };
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
async function fetchChildRows(baseId, childTableId, engagementRecordId, pat) {
  // Filter by the linked engagement record. SEARCH({rec...}, ARRAYJOIN({engagement}))
  // is the canonical way to match a single linked record from the parent side.
  const formula = `SEARCH('${engagementRecordId}', ARRAYJOIN({engagement}))`;
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
  return (body && body.records) || [];
}

/**
 * Fetch and validate an engagement record by its Engagement Reference (UUID v4).
 *
 * Return shape:
 *   { ok: false, reason: "invalid_format" | "not_found" | "not_active" | "expired" }
 *   { ok: true, engagement: <normalized object> }
 *
 * Throws on env misconfiguration or network/API failure. The caller (route)
 * catches throws and renders the opaque entitlement-error UI.
 *
 * @param {string} engagementReference
 * @returns {Promise<
 *   | { ok: false, reason: "invalid_format" | "not_found" | "not_active" | "expired" }
 *   | { ok: true, engagement: object }
 * >}
 */
export async function fetchEngagement(engagementReference) {
  // 1. Format validation — never call Airtable on a malformed reference.
  if (!engagementReference || !UUID_V4_RE.test(engagementReference)) {
    return { ok: false, reason: "invalid_format" };
  }

  // 2. Env preconditions — misconfiguration, throw loudly.
  const pat = import.meta.env.VITE_AIRTABLE_PAT;
  const baseId = import.meta.env.VITE_AIRTABLE_BASE_ID;
  const tableId = import.meta.env.VITE_AIRTABLE_ENGAGEMENTS_TABLE_ID;
  if (!pat || !baseId || !tableId) {
    const missing = [
      ["VITE_AIRTABLE_PAT", pat],
      ["VITE_AIRTABLE_BASE_ID", baseId],
      ["VITE_AIRTABLE_ENGAGEMENTS_TABLE_ID", tableId],
    ]
      .filter(([, v]) => !v)
      .map(([k]) => k)
      .join(", ");
    throw new Error(
      `Airtable env vars missing: ${missing}. Set these in .env.local. ` +
        "This is a build/deploy misconfiguration, not a runtime user error.",
    );
  }

  // 3. List-records call with filterByFormula on the primary field.
  // returnFieldsByFieldId=true gives us field IDs (stable) instead of names.
  const formula = `{Engagement Reference}='${engagementReference}'`;
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`);
  url.searchParams.set("filterByFormula", formula);
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("returnFieldsByFieldId", "true");

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
    throw new Error(`Airtable API error: ${res.status}`);
  }

  let body;
  try {
    body = await res.json();
  } catch (e) {
    throw new Error(
      `Airtable returned malformed JSON: ${e && e.message ? e.message : String(e)}`,
    );
  }

  const records = (body && body.records) || [];

  // 4. Response routing.
  if (records.length === 0) {
    return { ok: false, reason: "not_found" };
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
  let ecoccValue = null;
  let ecoccParseWarning = null;
  const ecoccRaw = fields[FID.ECOCC_PRACTICES_JSON];
  if (ecoccRaw && typeof ecoccRaw === "string" && ecoccRaw.trim().length > 0) {
    try {
      ecoccValue = JSON.parse(ecoccRaw);
    } catch (e) {
      ecoccValue = null;
      ecoccParseWarning = e && e.message ? e.message : "JSON.parse failed.";
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
  const data_points = {
    ecocc_practices_implemented: ecoccValue,
    last_independent_audit_date: fields[FID.LAST_INDEPENDENT_AUDIT_DATE] ?? null,
    annualised_pue: fields[FID.ANNUALISED_PUE] ?? null,
    climate_risk_assessment_completed: Boolean(fields[FID.CLIMATE_RISK_COMPLETED]),
    climate_risk_assessment_methodology:
      fields[FID.CLIMATE_RISK_METHODOLOGY] ?? null,
    wue_annualised: fields[FID.WUE_ANNUALISED] ?? null,
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

  const evidence_documents = parseEvidenceDocuments(
    fields[FID.EVIDENCE_DOCUMENTS] ?? "",
  );

  const project_input = {
    project_id: fields[FID.PROJECT_ID] ?? null,
    intake_timestamp: fields[FID.ISSUED_AT] ?? new Date().toISOString(),
    facility_type: fields[FID.FACILITY_TYPE] ?? null,
    jurisdiction: fields[FID.JURISDICTION] ?? null,
    facility_status: fields[FID.FACILITY_STATUS] ?? null,
    build_completion_year: fields[FID.BUILD_COMPLETION_YEAR] ?? undefined,
    data_points,
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

  // ── PR A2 + A4 — fetch linked child tables in parallel ──────────────
  // Six API calls in parallel. Each child table is filtered by the engagement
  // reference UUID (NOT the Airtable record.id). ARRAYJOIN({engagement}) on a
  // linked-record field returns the primary field values of the linked records
  // — which for the Engagements table is the "Engagement Reference" UUID. So
  // the SEARCH formula must use the UUID, not the rec... record ID.
  const [
    es_characteristics_records,
    pai_coverage_records,
    annex_ii_coverage_records,
    project_reports_records,
    parent_portfolio_reports_records,
    project_pai_data_records,
  ] = await Promise.all([
    fetchChildRows(baseId, CHILD_TABLES.ES_CHARACTERISTICS, engagementReference, pat),
    fetchChildRows(baseId, CHILD_TABLES.PAI_COVERAGE, engagementReference, pat),
    fetchChildRows(baseId, CHILD_TABLES.ANNEX_II_COVERAGE, engagementReference, pat),
    fetchChildRows(baseId, CHILD_TABLES.PROJECT_REPORTS, engagementReference, pat),
    fetchChildRows(baseId, CHILD_TABLES.PARENT_PORTFOLIO_REPORTS, engagementReference, pat),
    fetchChildRows(baseId, CHILD_TABLES.PROJECT_PAI_DATA, engagementReference, pat),
  ]);

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
    // PR A1 — c2/c3/c7 discrete entity scalars (raw cell values; adapter
    // composes the EntityInput shape from these).
    c2_independent_ned_count: fields[FID.C2_INDEPENDENT_NED_COUNT] ?? undefined,
    c2_terms_of_reference_documented: Boolean(fields[FID.C2_TERMS_OF_REFERENCE_DOCUMENTED]),
    c2_ceo_chair_separated: Boolean(fields[FID.C2_CEO_CHAIR_SEPARATED]),
    c2_lead_independent_director_designated: Boolean(fields[FID.C2_LEAD_INDEPENDENT_DIRECTOR_DESIGNATED]),
    c2_executive_committee_published: Boolean(fields[FID.C2_EXECUTIVE_COMMITTEE_PUBLISHED]),
    c2_ungc_violations_5yr_count: fields[FID.C2_UNGC_VIOLATIONS_5YR_COUNT] ?? undefined,
    c2_ungp_aligned_policy_published: Boolean(fields[FID.C2_UNGP_ALIGNED_POLICY_PUBLISHED]),
    c2_grievance_mechanism_documented: Boolean(fields[FID.C2_GRIEVANCE_MECHANISM_DOCUMENTED]),
    c2_labour_law_compliance_attested: Boolean(fields[FID.C2_LABOUR_LAW_COMPLIANCE_ATTESTED]),
    c2_remuneration_policy_published: Boolean(fields[FID.C2_REMUNERATION_POLICY_PUBLISHED]),
    c2_ceo_to_median_ratio_disclosed: Boolean(fields[FID.C2_CEO_TO_MEDIAN_RATIO_DISCLOSED]),
    c2_ceo_to_median_ratio_value: fields[FID.C2_CEO_TO_MEDIAN_RATIO_VALUE] ?? undefined,
    c2_esg_linked_variable_pay: Boolean(fields[FID.C2_ESG_LINKED_VARIABLE_PAY]),
    c2_tax_policy_published: Boolean(fields[FID.C2_TAX_POLICY_PUBLISHED]),
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

  return { ok: true, engagement };
}
