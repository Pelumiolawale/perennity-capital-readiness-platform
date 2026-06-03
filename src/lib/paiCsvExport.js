// @ts-check
// Paid-flow only — see CLAUDE.md. Do not import from /assessment/snapshot or any free-tier component.
//
// FMP-ready PAI CSV serialiser. Takes the PAIDataFile object from
// `RenderContract.pai_data_file` and produces an RFC 4180 CSV string
// suitable for direct download. The CSV mirrors SFDR 2022/1288 Annex I
// Table 1 — drop-in for FMP ingestion into existing Art 9 fund PAI
// portfolio integration.
//
// RFC 4180 conformance:
//   - CRLF line endings between rows (including after the last row).
//   - Header row required, present as the first line.
//   - Fields containing comma, double-quote, or CR/LF are double-quoted.
//   - Embedded double-quotes are escaped by doubling them.
//   - Numeric values render as their plain JSON representation — no
//     locale-specific separators, no thousands-grouping.
//   - Null values render as the empty string (not the literal "null",
//     not "N/A", not "-").
//
// Column order is fixed and matches the 1.4c spec exactly:
//   PAI Number, Indicator Name, Metric Definition, Value, Unit,
//   Data Source, Methodology Note, Verification Status, Applicability,
//   Applicability Rationale, Data Unavailable Rationale

/** @typedef {import("../types/renderContract.js").PAIDataFile} PAIDataFile */
/** @typedef {import("../types/renderContract.js").PAIRow} PAIRow */

/**
 * Fixed CSV column order. Header text matches the column key derivation
 * one-to-one — changing either side without the other is a contract
 * break for FMP analysts ingesting the file.
 *
 * @type {readonly { header: string, get: (row: PAIRow) => unknown }[]}
 */
const COLUMNS = Object.freeze([
  { header: "PAI Number", get: (row) => row.pai_number },
  { header: "Indicator Name", get: (row) => row.indicator_name },
  { header: "Metric Definition", get: (row) => row.metric_definition },
  { header: "Value", get: (row) => row.value },
  { header: "Unit", get: (row) => row.unit },
  { header: "Data Source", get: (row) => row.data_source },
  { header: "Methodology Note", get: (row) => row.methodology_note },
  { header: "Verification Status", get: (row) => row.verification_status },
  { header: "Applicability", get: (row) => row.applicability },
  {
    header: "Applicability Rationale",
    get: (row) => row.applicability_rationale,
  },
  {
    header: "Data Unavailable Rationale",
    get: (row) => row.data_unavailable_rationale,
  },
]);

/**
 * Render a single cell value as an RFC 4180 CSV field.
 *
 * Null / undefined → empty string. Numbers → plain JSON form. Strings
 * containing comma, double-quote, CR, or LF are double-quoted with any
 * embedded double-quotes doubled.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeCell(value) {
  if (value === null || value === undefined) return "";
  const str = typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : String(value);
  if (str.length === 0) return "";
  const needsQuoting = /[",\r\n]/.test(str);
  if (!needsQuoting) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Serialise a PAIDataFile to an RFC 4180 CSV string. Header row first,
 * then one row per PAI in the order the source file presents them
 * (which the engine builder fixes at 1, 2, 4, 5, 7, 8, 9, 10, 11, 13).
 *
 * @param {PAIDataFile} paiDataFile
 * @returns {string}
 */
export function serialisePAIDataFile(paiDataFile) {
  if (!paiDataFile || !Array.isArray(paiDataFile.rows)) {
    throw new Error(
      "serialisePAIDataFile: invalid PAIDataFile — `rows` array missing.",
    );
  }
  const lines = [];
  lines.push(COLUMNS.map((c) => escapeCell(c.header)).join(","));
  for (const row of paiDataFile.rows) {
    lines.push(COLUMNS.map((c) => escapeCell(c.get(row))).join(","));
  }
  // RFC 4180 §2.1 — CRLF between records. We use a trailing CRLF too so
  // round-tripping through line-based parsers (which split on CRLF) yields
  // exactly N+1 segments (N rows + one empty trailing segment); both the
  // empty trailing and the N data rows are well-formed.
  return lines.join("\r\n") + "\r\n";
}

/**
 * Convenience: derive a filename for the CSV download from a project
 * identifier. Sanitises to lowercase alphanumeric + dash, falls back to
 * a generic name if the input is missing or empty after sanitisation.
 *
 * @param {string | null | undefined} projectIdOrName
 * @returns {string}
 */
export function paiCsvFilename(projectIdOrName) {
  const raw = (projectIdOrName ?? "").toString().trim();
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const safeSlug = slug.length > 0 ? slug : "project";
  return `pai-data-${safeSlug}.csv`;
}
