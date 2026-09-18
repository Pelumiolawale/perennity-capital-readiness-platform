// @ts-check
//
// BUG-01: c2 booleans are tri-state. The Yes / No / Unknown single-select wins;
// otherwise the legacy checkbox counts only when ticked. Blank must map to
// undefined (not known), never to false.

import { describe, it, expect, vi, afterEach } from "vitest";
import { triState, fetchEngagement, FID } from "./airtableEngagement.js";

describe("triState", () => {
  it.each([
    ["Yes", undefined, true],
    ["No", undefined, false],
    ["No", true, false], // a definite No overrides a stale tick
    ["Yes", undefined, true],
    [{ name: "Yes" }, undefined, true],
    ["Unknown", undefined, undefined],
    ["Unknown", true, true], // falls back to the tick
    [undefined, true, true],
    [undefined, undefined, undefined],
    [undefined, false, undefined],
  ])("select %j + checkbox %j → %j", (sel, box, expected) => {
    expect(triState(sel, box)).toBe(expected);
  });
});

describe("fetchEngagement c2 mapping", () => {
  afterEach(() => vi.restoreAllMocks());

  const REF = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";
  const CONFIG = { pat: "pat_test", baseId: "app_test", tableId: "tbl_test" };

  /** @param {Record<string, unknown>} fields */
  function mockAirtable(fields) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const isParent = String(url).includes("/tbl_test");
      const records = isParent
        ? [{ id: "recTEST", fields: { [FID.STATUS]: "active", ...fields } }]
        : [];
      return /** @type {any} */ ({ ok: true, status: 200, json: async () => ({ records }) });
    });
  }

  it("maps Yes / No / blank / legacy tick correctly", async () => {
    mockAirtable({
      [FID.C2_TAX_POLICY_PUBLISHED_TRI]: "No",
      [FID.C2_TERMS_OF_REFERENCE_DOCUMENTED_TRI]: "Yes",
      [FID.C2_CEO_CHAIR_SEPARATED]: true, // legacy tick, no select value
      // grievance: neither set → unknown
    });
    const r = await fetchEngagement(REF, CONFIG);
    expect(r.ok).toBe(true);
    const e = /** @type {any} */ (r).engagement;
    expect(e.c2_tax_policy_published).toBe(false);
    expect(e.c2_terms_of_reference_documented).toBe(true);
    expect(e.c2_ceo_chair_separated).toBe(true);
    expect(e.c2_grievance_mechanism_documented).toBeUndefined();
    expect(e.c2_ungc_violations_5yr_count).toBeUndefined();
  });
});
