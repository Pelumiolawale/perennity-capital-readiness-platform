// @ts-check
import { describe, it, expect } from "vitest";
import { airtableConfigFromEnv } from "./listEngagements.js";

describe("airtableConfigFromEnv", () => {
  it("reads the unprefixed AIRTABLE_* names", () => {
    expect(
      airtableConfigFromEnv({
        AIRTABLE_PAT: "new",
        AIRTABLE_BASE_ID: "app_new",
        AIRTABLE_ENGAGEMENTS_TABLE_ID: "tbl_new",
      }),
    ).toEqual({ pat: "new", baseId: "app_new", tableId: "tbl_new" });
  });

  it("REFUSES the legacy VITE_* names rather than falling back to them", () => {
    // This replaces a test asserting the opposite. The fallback accepted the
    // one spelling vite.config.js fails the build on — the guard exists because
    // the PAT shipped in the public bundle under VITE_AIRTABLE_PAT. A reader
    // that quietly accepted the forbidden name kept it alive as a plausible
    // thing to configure, and the error told the operator to go and set it.
    expect(() =>
      airtableConfigFromEnv({
        VITE_AIRTABLE_PAT: "old",
        VITE_AIRTABLE_BASE_ID: "app_old",
        VITE_AIRTABLE_ENGAGEMENTS_TABLE_ID: "tbl_old",
      }),
    ).toThrow(/AIRTABLE_PAT/);
  });

  it("ignores a VITE_ value even when the correct name is also set", () => {
    expect(
      airtableConfigFromEnv({
        AIRTABLE_PAT: "correct",
        VITE_AIRTABLE_PAT: "forbidden",
        AIRTABLE_BASE_ID: "app",
        AIRTABLE_ENGAGEMENTS_TABLE_ID: "tbl",
      }).pat,
    ).toBe("correct");
  });

  it("throws naming the missing variables, never their values", () => {
    expect(() => airtableConfigFromEnv({ AIRTABLE_BASE_ID: "app_x" })).toThrow(
      /AIRTABLE_PAT, AIRTABLE_ENGAGEMENTS_TABLE_ID/,
    );
  });
});
