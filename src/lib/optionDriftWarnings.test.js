// @ts-check
//
// ITEM-17, B4 and B5 — a value that is present but unrecognised.
//
// Every "is this missing?" guard in the adapter passes such a value through:
// it is not undefined, not null, not empty. But it matches no branch inside
// the engine either. `c7_operational_status` is the sharp one — the engine
// tests `=== "operational"`, so "Operational" silently takes the
// pre-operational evidence path and nothing surfaces.
//
// The accepted lists come from airtableSchemaContract.js, the same file the
// parity test checks, so the runtime guard and the test cannot disagree about
// what "accepted" means.

import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchEngagement, FID } from "./airtableEngagement.js";
import { acceptedOptionsFor } from "./airtableSchemaContract.js";
import { isRoutableTargetLabel } from "./engineClient.js";

const REF = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";
const CONFIG = { pat: "pat_test", baseId: "app_test", tableId: "tbl_test" };

function mockAirtable(fields) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const isParent = String(url).includes("/tbl_test");
    return /** @type {any} */ ({
      ok: true,
      status: 200,
      json: async () => ({
        records: isParent
          ? [{ id: "recTEST", fields: { [FID.STATUS]: "active", ...fields } }]
          : [],
      }),
    });
  });
}

async function warningsFor(fields) {
  mockAirtable(fields);
  const r = await fetchEngagement(REF, CONFIG);
  expect(r.ok).toBe(true);
  return r.engagement.schema_warnings ?? [];
}

describe("acceptedOptionsFor", () => {
  it("knows the contracted fields", () => {
    expect(acceptedOptionsFor(FID.C6_METHODOLOGY)).toEqual([
      "capex",
      "opex",
      "revenue",
    ]);
    expect(acceptedOptionsFor(FID.C7_OPERATIONAL_STATUS)).toEqual([
      "operational",
      "pre_operational",
    ]);
  });

  it("knows the tri-states without listing each one twice", () => {
    expect(acceptedOptionsFor("fldkrdg8HKAB8jAUf")).toEqual([
      "Yes",
      "No",
      "Unknown",
    ]);
  });

  it("returns null for a field not under contract", () => {
    expect(acceptedOptionsFor(FID.CLIENT_NAME)).toBeNull();
  });
});

describe("a renamed option is caught rather than forwarded (B4)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a tidied c7 status is named, with the value and the accepted list", async () => {
    const warnings = await warningsFor({
      [FID.C7_OPERATIONAL_STATUS]: "Operational",
    });
    expect(warnings.join("\n")).toMatch(/c7 operational status/);
    expect(warnings.join("\n")).toMatch(/Operational/);
    expect(warnings.join("\n")).toMatch(/operational, pre_operational/);
  });

  it("a tidied c6 methodology is caught", async () => {
    const warnings = await warningsFor({ [FID.C6_METHODOLOGY]: "CapEx" });
    expect(warnings.join("\n")).toMatch(/c6 methodology/);
  });

  it("a recased water-stress bucket is caught", async () => {
    // dnsh_water only applies the WUE threshold to High / Extremely High, so
    // a rename here stops a water-stressed site being tested at all.
    const warnings = await warningsFor({
      [FID.SITE_WATER_STRESS]: "Extremely high",
    });
    expect(warnings.join("\n")).toMatch(/Site Water Stress/);
  });

  it("recognised values raise nothing", async () => {
    const warnings = await warningsFor({
      [FID.C7_OPERATIONAL_STATUS]: "operational",
      [FID.C6_METHODOLOGY]: "capex",
      [FID.SITE_WATER_STRESS]: "Extremely High",
      [FID.FACILITY_STATUS]: "operational",
      [FID.C7_COMMISSIONING_DATE]: "2024-01-01",
    });
    expect(warnings).toEqual([]);
  });

  it("a blank cell raises nothing — absence is not drift", async () => {
    expect(await warningsFor({})).toEqual([]);
  });

  it("a blank c7 status with a commissioning date is called out", async () => {
    // entityInputAdapter defaults it to pre_operational. Scoring-neutral today,
    // because the engine tests `=== "operational"` either way — but it puts a
    // claim in the input shape nobody made, and hides that nobody answered.
    const warnings = await warningsFor({
      [FID.C7_COMMISSIONING_DATE]: "2024-01-01",
    });
    expect(warnings.join("\n")).toMatch(/pre-operational path, which nobody has stated/);
  });
});

describe("an unroutable target label fails legibly (B5)", () => {
  it("the six built labels route", () => {
    for (const label of [
      "eu_taxonomy_aligned_8_1",
      "sfdr_article_8",
      "sfdr_article_9",
      "uk_sdr_focus",
      "uk_sdr_improvers",
      "uk_sdr_impact",
    ]) {
      expect(isRoutableTargetLabel(label), label).toBe(true);
    }
  });

  it("uk_sdr_mixed_goals does not — it is selectable in Airtable but not built", () => {
    expect(isRoutableTargetLabel("uk_sdr_mixed_goals")).toBe(false);
  });

  it("an unknown or empty label does not route", () => {
    expect(isRoutableTargetLabel("sfdr_art_9")).toBe(false);
    expect(isRoutableTargetLabel(null)).toBe(false);
    expect(isRoutableTargetLabel(undefined)).toBe(false);
  });
});
