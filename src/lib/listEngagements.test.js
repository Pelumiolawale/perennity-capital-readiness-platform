// @ts-check
import { describe, it, expect } from "vitest";
import { airtableConfigFromEnv } from "./listEngagements.js";

describe("airtableConfigFromEnv", () => {
  it("prefers the unprefixed AIRTABLE_* names", () => {
    expect(
      airtableConfigFromEnv({
        AIRTABLE_PAT: "new",
        VITE_AIRTABLE_PAT: "old",
        AIRTABLE_BASE_ID: "app_new",
        VITE_AIRTABLE_BASE_ID: "app_old",
        AIRTABLE_ENGAGEMENTS_TABLE_ID: "tbl_new",
        VITE_AIRTABLE_ENGAGEMENTS_TABLE_ID: "tbl_old",
      }),
    ).toEqual({ pat: "new", baseId: "app_new", tableId: "tbl_new" });
  });

  it("falls back to the legacy VITE_* names", () => {
    expect(
      airtableConfigFromEnv({
        VITE_AIRTABLE_PAT: "old",
        VITE_AIRTABLE_BASE_ID: "app_old",
        VITE_AIRTABLE_ENGAGEMENTS_TABLE_ID: "tbl_old",
      }),
    ).toEqual({ pat: "old", baseId: "app_old", tableId: "tbl_old" });
  });

  it("throws naming the missing variables, never their values", () => {
    expect(() => airtableConfigFromEnv({ AIRTABLE_BASE_ID: "app_x" })).toThrow(
      /AIRTABLE_PAT, AIRTABLE_ENGAGEMENTS_TABLE_ID/,
    );
  });
});
