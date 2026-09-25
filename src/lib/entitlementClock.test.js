// @ts-check
//
// fetchEngagement's expiry check reads a clock, and the clock is injectable.
//
// scripts/rescore.mjs has to score every engagement in the base, including test
// fixtures whose 90-day window has lapsed. The alternative to an injectable
// clock was a flag that skips the expiry check, which is a switch on the
// entitlement path that someone could one day pass from the API. A clock
// cannot grant access to anything: it only changes what "now" means, and the
// API never supplies one.

import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchEngagement, FID } from "./airtableEngagement.js";

const REF = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";
const CONFIG = { pat: "pat_test", baseId: "app_test", tableId: "tbl_test" };

function mockExpiredRecord() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const isParent = String(url).includes("/tbl_test");
    const records = isParent
      ? [
          {
            id: "recTEST",
            fields: {
              [FID.STATUS]: "active",
              [FID.EXPIRES_AT]: "2026-09-03T00:00:00.000Z",
              [FID.TARGET_LABEL]: "eu_taxonomy_aligned_8_1",
            },
          },
        ]
      : [];
    return /** @type {any} */ ({ ok: true, status: 200, json: async () => ({ records }) });
  });
}

afterEach(() => vi.restoreAllMocks());

describe("the entitlement clock", () => {
  it("refuses a lapsed engagement against the real clock", async () => {
    mockExpiredRecord();
    expect(await fetchEngagement(REF, CONFIG)).toEqual({ ok: false, reason: "expired" });
  });

  it("scores a lapsed engagement when the caller supplies an earlier now", async () => {
    mockExpiredRecord();
    const r = await fetchEngagement(REF, { ...CONFIG, now: Date.parse("2026-09-01") });
    expect(r.ok).toBe(true);
  });

  it("the API handler never supplies a clock", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "api/engagement.js"), "utf8");
    expect(src).not.toMatch(/\bnow\s*:/);
  });
});
