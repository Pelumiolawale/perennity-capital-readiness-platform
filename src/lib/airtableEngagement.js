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

  const engagement = {
    run_id: engagementReference,
    project_input,
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
