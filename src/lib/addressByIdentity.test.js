// @ts-check
//
// ITEM-17, the remaining instances: places where correctness rested on a NAME
// or a POSITION rather than an identity.
//
// Names and positions are things a non-developer can change in a UI, or that
// an upstream package can change in a release. Identities are not.

import { describe, it, expect, vi, afterEach } from "vitest";
import { BUNDLED_ACTIVITIES } from "@perennity/engine";
import { frameworksForLabel } from "./engineClient.js";
import { fetchEngagement, FID } from "./airtableEngagement.js";
import { LEADS_TABLE, LEAD_FIELD_IDS, toAirtableFields } from "../../api/leads.js";

const REF = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";
const CONFIG = { pat: "pat_test", baseId: "app_test", tableId: "tbl_test" };

describe("the EU Taxonomy activity is chosen by id, not array position", () => {
  it("resolves the activity every framework set is built on", () => {
    const [euTax] = frameworksForLabel("eu_taxonomy_aligned_8_1");
    expect(euTax.id).toBe("eu_tax_climate_8_1");
  });

  it("still resolves it when the engine bundles something else first", () => {
    // The scenario BUNDLED_ACTIVITIES[0] could not survive, reproduced for
    // real rather than by mocking `find` — mocking the method the fix happens
    // to use would make this pass against the old code too, which would prove
    // nothing. The array is a plain mutable array, so put a decoy in front of
    // it and put it back afterwards.
    const decoy = { id: "some_future_activity", activity_code: "9.9" };
    BUNDLED_ACTIVITIES.unshift(decoy);
    try {
      const [euTax] = frameworksForLabel("sfdr_article_8");
      expect(euTax.id).toBe("eu_tax_climate_8_1");
      expect(euTax.id).not.toBe("some_future_activity");
    } finally {
      BUNDLED_ACTIVITIES.shift();
      expect(BUNDLED_ACTIVITIES[0].id).toBe("eu_tax_climate_8_1");
    }
  });

  it("refuses to guess if Activity 8.1 is not bundled at all", () => {
    const removed = BUNDLED_ACTIVITIES.splice(0, BUNDLED_ACTIVITIES.length);
    try {
      expect(() => frameworksForLabel("eu_taxonomy_aligned_8_1")).toThrow(
        /does not bundle activity/,
      );
    } finally {
      BUNDLED_ACTIVITIES.push(...removed);
    }
  });
});

describe("a duplicated engagement reference is refused, not guessed", () => {
  afterEach(() => vi.restoreAllMocks());

  /** @param {number} count how many parent records Airtable returns */
  function mockParents(count) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => ({
      ok: true,
      status: 200,
      json: async () => ({
        records: String(url).includes("/tbl_test")
          ? Array.from({ length: count }, (_, i) => ({
              id: `recDUP${i}`,
              fields: { [FID.STATUS]: "active", [FID.CLIENT_NAME]: `Client ${i}` },
            }))
          : [],
      }),
    }));
  }

  it("one record is scored as normal", async () => {
    mockParents(1);
    const r = await fetchEngagement(REF, CONFIG);
    expect(r.ok).toBe(true);
  });

  it("two records refuse rather than pick whichever came first", async () => {
    // Airtable does not enforce uniqueness on a text primary field. Under
    // maxRecords=1 this was a coin toss between two clients' data, and the
    // report rendered perfectly either way.
    mockParents(2);
    const r = await fetchEngagement(REF, CONFIG);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("duplicate_reference");
  });

  it("no record is still not_found, not a duplicate", async () => {
    mockParents(0);
    const r = await fetchEngagement(REF, CONFIG);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_found");
  });
});

describe("leads are written by identity", () => {
  it("the table is a tbl… id", () => {
    expect(LEADS_TABLE).toMatch(/^tbl[A-Za-z0-9]{14}$/);
  });

  it("every mapped field is a fld… id", () => {
    for (const [key, id] of Object.entries(LEAD_FIELD_IDS)) {
      expect(id, key).toMatch(/^fld[A-Za-z0-9]{14}$/);
    }
  });

  it("no two payload keys share a field id", () => {
    const ids = Object.values(LEAD_FIELD_IDS);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("translation emits ids only, never display names", () => {
    const out = toAirtableFields({ name: "A", email: "b@c.d", status: "new" });
    for (const key of Object.keys(out)) {
      expect(key).toMatch(/^fld[A-Za-z0-9]{14}$/);
    }
  });
});
