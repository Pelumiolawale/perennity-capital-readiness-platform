// @ts-check
//
// paiCsvExport tests — RFC 4180 conformance + structural invariants.
//
// The CSV is the FMP-ingestion deliverable. Structural drift here breaks
// downstream PAI portfolio integration, so the tests lock the contract
// hard: PAI-number row order, PAI 4 always present as not_applicable,
// null → empty, quoting and escape rules per RFC 4180, CRLF endings,
// header row presence.

import { describe, it, expect } from "vitest";
import { serialisePAIDataFile, paiCsvFilename } from "./paiCsvExport.js";

/** @typedef {import("../types/renderContract.js").PAIDataFile} PAIDataFile */
/** @typedef {import("../types/renderContract.js").PAIRow} PAIRow */

const PAI_NUMBERS_IN_ORDER = [1, 2, 4, 5, 7, 8, 9, 10, 11, 13];

/** @returns {PAIRow} */
function row(pai_number, overrides = {}) {
  return {
    pai_number,
    indicator_name: `Indicator ${pai_number}`,
    metric_definition: `Metric definition ${pai_number}`,
    value: 42,
    unit: "tCO2e",
    data_source: "Project disclosure",
    methodology_note: "GHG Protocol",
    verification_status: "third_party_assured",
    applicability: "applicable",
    ...overrides,
  };
}

/** @returns {PAIDataFile} */
function fixture(overrides = {}) {
  return {
    schema_source: "SFDR_2022_1288_Annex_I_Table_1",
    reporting_period: "FY2025",
    rows: PAI_NUMBERS_IN_ORDER.map((n) =>
      n === 4
        ? row(4, {
            value: null,
            unit: "%",
            data_source: "n/a",
            methodology_note: "Not applicable for data-centre projects.",
            verification_status: "not_applicable",
            applicability: "not_applicable",
            applicability_rationale: "Data-centre projects do not have fossil-fuel exposure.",
          })
        : row(n),
    ),
    ...overrides,
  };
}

describe("serialisePAIDataFile — structural invariants", () => {
  it("emits 10 rows in PAI-number order: 1, 2, 4, 5, 7, 8, 9, 10, 11, 13", () => {
    const csv = serialisePAIDataFile(fixture());
    const lines = csv.split("\r\n").filter(Boolean);
    // 1 header + 10 data rows = 11 lines
    expect(lines).toHaveLength(11);
    // Skip header, read first column of each data row
    const paiNumbersInCSV = lines.slice(1).map((line) => Number(line.split(",")[0]));
    expect(paiNumbersInCSV).toEqual(PAI_NUMBERS_IN_ORDER);
  });

  it("emits PAI 4 row with Applicability = not_applicable", () => {
    const csv = serialisePAIDataFile(fixture());
    const lines = csv.split("\r\n");
    // Find the line that begins "4,"
    const pai4Line = lines.find((l) => l.startsWith("4,"));
    expect(pai4Line).toBeDefined();
    // Applicability column is the 9th (0-indexed 8th). Split on commas is
    // safe here because the fixture's PAI 4 fields contain no embedded
    // commas (the rationale text uses a period as separator).
    const cols = pai4Line.split(",");
    expect(cols[8]).toBe("not_applicable");
  });
});

describe("serialisePAIDataFile — RFC 4180 conformance", () => {
  it("renders null values as empty string (not 'null', not 'N/A')", () => {
    const csv = serialisePAIDataFile(fixture());
    const pai4Line = csv.split("\r\n").find((l) => l.startsWith("4,"));
    // PAI 4 Value column (4th, 0-indexed 3rd) is null in the fixture.
    const cols = pai4Line.split(",");
    expect(cols[3]).toBe(""); // empty, not "null"
    expect(cols[3]).not.toMatch(/null/i);
    expect(cols[3]).not.toMatch(/n\/a/i);
  });

  it("double-quotes fields containing a comma", () => {
    const fx = fixture();
    // Override PAI 1's methodology_note to include a comma
    fx.rows[0].methodology_note = "GHG Protocol, scope 2 location-based";
    const csv = serialisePAIDataFile(fx);
    expect(csv).toMatch(/"GHG Protocol, scope 2 location-based"/);
  });

  it("escapes embedded double-quotes by doubling them", () => {
    const fx = fixture();
    // Inject a value with an embedded double-quote
    fx.rows[0].methodology_note = 'Per the "Scope 2 Guidance" Annex';
    const csv = serialisePAIDataFile(fx);
    // RFC 4180 §2.7: each embedded " becomes "", whole field is quoted
    expect(csv).toMatch(/"Per the ""Scope 2 Guidance"" Annex"/);
  });

  it("uses CRLF line endings and emits a header row first", () => {
    const csv = serialisePAIDataFile(fixture());
    // Header is the first line
    expect(csv.startsWith("PAI Number,Indicator Name,Metric Definition,")).toBe(true);
    // CRLF separator (every line break is \r\n, not just \n)
    expect(csv).toMatch(/\r\n/);
    expect(csv).not.toMatch(/(?<!\r)\n/); // no orphan \n
    // Trailing CRLF after the last data row (per implementation contract)
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("renders numeric values as plain JSON form (no locale separators)", () => {
    const fx = fixture();
    fx.rows[0].value = 1234567.89;
    const csv = serialisePAIDataFile(fx);
    const pai1Line = csv.split("\r\n").find((l) => l.startsWith("1,"));
    const valueCol = pai1Line.split(",")[3];
    // No thousands separator, no locale-specific decimal mark
    expect(valueCol).toBe("1234567.89");
    expect(valueCol).not.toMatch(/[,\s]/);
  });
});

describe("serialisePAIDataFile — defensive", () => {
  it("throws on a malformed PAIDataFile (no rows array)", () => {
    expect(() => serialisePAIDataFile(/** @type {any} */ ({}))).toThrow();
    expect(() => serialisePAIDataFile(/** @type {any} */ (null))).toThrow();
  });
});

describe("paiCsvFilename — slug derivation", () => {
  it("sanitises project IDs to lowercase alphanumeric + dash", () => {
    expect(paiCsvFilename("Frankfurt DC-01")).toBe("pai-data-frankfurt-dc-01.csv");
    expect(paiCsvFilename("AirTrunk SYD42 (proposed)")).toBe(
      "pai-data-airtrunk-syd42-proposed.csv",
    );
  });

  it("falls back to 'project' for empty or missing input", () => {
    expect(paiCsvFilename(null)).toBe("pai-data-project.csv");
    expect(paiCsvFilename(undefined)).toBe("pai-data-project.csv");
    expect(paiCsvFilename("")).toBe("pai-data-project.csv");
    expect(paiCsvFilename("   ")).toBe("pai-data-project.csv");
    // String that sanitises to empty also falls back
    expect(paiCsvFilename("!!!")).toBe("pai-data-project.csv");
  });
});
