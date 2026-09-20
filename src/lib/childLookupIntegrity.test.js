// @ts-check
//
// ITEM-17 / ITEM-18 — the child-row lookup cannot fail visibly on its own.
//
// fetchChildRows matches rows with `SEARCH(<ref>, ARRAYJOIN({engagement}))`.
// ARRAYJOIN on a linked-record field returns the PRIMARY FIELD of the linked
// records, so the whole mechanism rests on `Engagement Reference` still being
// the primary field on Engagements. Re-order the table in the Airtable UI and
// every SEARCH misses: six calls return `[]` with HTTP 200, the report renders
// cleanly, and SFDR c1, c3, c5, c7 and c10 drop to insufficient_evidence with
// nothing anywhere complaining. A wrong opinion gets signed and sent.
//
// The parent record is the independent witness — its link arrays say how many
// rows each fetch should have returned. These tests drive that end to end:
// a mocked Airtable where the parent links rows the child tables refuse to
// return, exactly as a primary-field change would look from the outside.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DeterministicEngine,
  METHODOLOGY_VERSION,
} from "@perennity/engine";
import {
  fetchEngagement,
  findChildRowShortfalls,
  FID,
  CHILD_LINK_FIDS,
  CHILD_TABLES,
} from "./airtableEngagement.js";
import { frameworksForLabel } from "./engineClient.js";
import { buildSFDRInputs } from "./sfdrInputAdapter.js";
import { buildEntityInputs } from "./entityInputAdapter.js";

const REF = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";
const CONFIG = { pat: "pat_test", baseId: "app_test", tableId: "tbl_test" };

/**
 * @param {Record<string, unknown>} fields parent record fields
 * @param {Record<string, number>} childCounts rows each child table returns,
 *   keyed by table ID; omitted tables return none
 */
function mockAirtable(fields, childCounts = {}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const href = String(url);
    if (href.includes("/tbl_test")) {
      return /** @type {any} */ ({
        ok: true,
        status: 200,
        json: async () => ({
          records: [{ id: "recTEST", fields: { [FID.STATUS]: "active", ...fields } }],
        }),
      });
    }
    const tableId = Object.values(CHILD_TABLES).find((t) => href.includes(`/${t}`));
    const n = (tableId && childCounts[tableId]) || 0;
    return /** @type {any} */ ({
      ok: true,
      status: 200,
      json: async () => ({
        records: Array.from({ length: n }, (_, i) => ({
          id: `recCHILD${i}`,
          fields: {},
        })),
      }),
    });
  });
}

/** Parent link arrays of the given lengths, keyed by CHILD_LINK_FIDS name. */
function links(counts) {
  const out = {};
  for (const [name, count] of Object.entries(counts)) {
    out[CHILD_LINK_FIDS[name]] = Array.from({ length: count }, (_, i) => `recL${i}`);
  }
  return out;
}

describe("findChildRowShortfalls", () => {
  it("reports nothing when every fetch matched the parent's links", () => {
    const fields = links({ PAI_COVERAGE: 11, ES_CHARACTERISTICS: 3 });
    expect(
      findChildRowShortfalls(fields, {
        PAI_COVERAGE: new Array(11),
        ES_CHARACTERISTICS: new Array(3),
      }),
    ).toEqual([]);
  });

  it("reports nothing when the parent links no rows at all", () => {
    // Airtable omits an empty linked-record field entirely, like a checkbox.
    expect(findChildRowShortfalls({}, { PAI_COVERAGE: [] })).toEqual([]);
  });

  it("names the table, the expected count and what arrived", () => {
    const fields = links({ PAI_COVERAGE: 11 });
    expect(findChildRowShortfalls(fields, { PAI_COVERAGE: [] })).toEqual([
      { table: "PAI_COVERAGE", expected: 11, actual: 0 },
    ]);
  });

  it("catches a partial read, not just a total one — this is ITEM-18", () => {
    // fetchChildRows discards Airtable's `offset` token, so a table with more
    // than 100 linked rows silently truncates.
    const fields = links({ PROJECT_PAI_DATA: 140 });
    expect(findChildRowShortfalls(fields, { PROJECT_PAI_DATA: new Array(100) })).toEqual(
      [{ table: "PROJECT_PAI_DATA", expected: 140, actual: 100 }],
    );
  });

  it("does not complain when more rows arrive than expected", () => {
    // Not a shortfall: no evidence has been lost, so it must not block a report.
    const fields = links({ PAI_COVERAGE: 2 });
    expect(findChildRowShortfalls(fields, { PAI_COVERAGE: new Array(3) })).toEqual([]);
  });
});

describe("a broken child lookup refuses the report (item 17)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("the primary-field failure mode is caught, not rendered", async () => {
    // Exactly what a re-ordered Engagements table looks like from outside:
    // the parent links rows, every child SEARCH misses, HTTP 200 throughout.
    mockAirtable(links({ PAI_COVERAGE: 11, ANNEX_II_COVERAGE: 9, PROJECT_PAI_DATA: 10 }));

    const r = await fetchEngagement(REF, CONFIG);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("child_data_incomplete");
    expect(r.shortfalls).toEqual(
      expect.arrayContaining([
        { table: "PAI_COVERAGE", expected: 11, actual: 0 },
        { table: "ANNEX_II_COVERAGE", expected: 9, actual: 0 },
        { table: "PROJECT_PAI_DATA", expected: 10, actual: 0 },
      ]),
    );
  });

  it("a healthy engagement is unaffected", async () => {
    mockAirtable(links({ PAI_COVERAGE: 2, ES_CHARACTERISTICS: 3 }), {
      [CHILD_TABLES.PAI_COVERAGE]: 2,
      [CHILD_TABLES.ES_CHARACTERISTICS]: 3,
    });
    const r = await fetchEngagement(REF, CONFIG);
    expect(r.ok).toBe(true);
    expect(r.engagement.pai_coverage).toHaveLength(2);
    expect(r.engagement.es_characteristics).toHaveLength(3);
  });

  it("an engagement with no child rows at all still renders", async () => {
    // UK SDR and plain EU Taxonomy engagements use no child tables. They must
    // not be caught by a check aimed at SFDR.
    mockAirtable({});
    const r = await fetchEngagement(REF, CONFIG);
    expect(r.ok).toBe(true);
  });

  it("one short table is enough to refuse — evidence is not partially issued", async () => {
    mockAirtable(links({ PAI_COVERAGE: 11, ES_CHARACTERISTICS: 3 }), {
      [CHILD_TABLES.PAI_COVERAGE]: 11,
      [CHILD_TABLES.ES_CHARACTERISTICS]: 1,
    });
    const r = await fetchEngagement(REF, CONFIG);
    expect(r.ok).toBe(false);
    expect(r.shortfalls).toEqual([
      { table: "ES_CHARACTERISTICS", expected: 3, actual: 1 },
    ]);
  });
});

describe("a renamed lookup field fails legibly (item 17, the loud half)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a 422 on the parent lookup names the field, not just the status", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => ({
      ok: false,
      status: 422,
      json: async () => ({}),
    }));
    await expect(fetchEngagement(REF, CONFIG)).rejects.toThrow(
      /Engagement Reference.*renamed/s,
    );
  });

  // There used to be a test here asserting that a 422 on a CHILD lookup named
  // the renamed link field. It has been replaced rather than deleted, because
  // the failure it pinned can no longer happen: child rows are fetched by
  // RECORD_ID(), which names no field, so renaming the child table's
  // `engagement` link cannot produce a 422 or anything else. The replacement
  // asserts that structural property directly — it is strictly stronger than
  // asserting a good error message for a failure that is now unreachable.
  it("no child request references a field by name — nothing to rename", async () => {
    const urls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      urls.push(String(url));
      const isParent = String(url).includes("/tbl_test");
      return /** @type {any} */ ({
        ok: true,
        status: 200,
        json: async () => ({
          records: isParent
            ? [
                {
                  id: "recTEST",
                  fields: {
                    [FID.STATUS]: "active",
                    ...links({ PAI_COVERAGE: 2, ES_CHARACTERISTICS: 1 }),
                  },
                },
              ]
            : [{ id: "recCHILD0", fields: {} }, { id: "recCHILD1", fields: {} }],
        }),
      });
    });
    await fetchEngagement(REF, CONFIG);

    const childUrls = urls.filter((u) => !u.includes("/tbl_test"));
    expect(childUrls.length).toBeGreaterThan(0);
    for (const u of childUrls) {
      const decoded = decodeURIComponent(u);
      expect(decoded, u).toContain("RECORD_ID()");
      // The two names the old formula depended on.
      expect(decoded, u).not.toContain("ARRAYJOIN");
      expect(decoded, u).not.toContain("{engagement}");
    }
  });

  it("a table the engagement links nothing in is not queried at all", async () => {
    const urls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      urls.push(String(url));
      const isParent = String(url).includes("/tbl_test");
      return /** @type {any} */ ({
        ok: true,
        status: 200,
        json: async () => ({
          records: isParent
            ? [
                {
                  id: "recTEST",
                  fields: { [FID.STATUS]: "active", ...links({ PAI_COVERAGE: 1 }) },
                },
              ]
            : [{ id: "recCHILD0", fields: {} }],
        }),
      });
    });
    await fetchEngagement(REF, CONFIG);

    // One parent call plus exactly one child call, not one parent plus six.
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain(CHILD_TABLES.PAI_COVERAGE);
  });

  it("an engagement linking no child rows makes one request in total", async () => {
    const urls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      urls.push(String(url));
      return /** @type {any} */ ({
        ok: true,
        status: 200,
        json: async () => ({
          records: [{ id: "recTEST", fields: { [FID.STATUS]: "active" } }],
        }),
      });
    });
    await fetchEngagement(REF, CONFIG);
    expect(urls).toHaveLength(1);
  });

  it("more than 50 linked rows are chunked, and none is dropped", async () => {
    // ITEM-18 by construction rather than by detection: 50 ids per request can
    // never return more than 50 records, so Airtable's 100-record page limit is
    // unreachable and no `offset` token can go missing.
    const ids = Array.from({ length: 120 }, (_, i) => `recBULK${i}`);
    const seen = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes("/tbl_test")) {
        return /** @type {any} */ ({
          ok: true,
          status: 200,
          json: async () => ({
            records: [
              {
                id: "recTEST",
                fields: {
                  [FID.STATUS]: "active",
                  [CHILD_LINK_FIDS.PROJECT_PAI_DATA]: ids,
                },
              },
            ],
          }),
        });
      }
      const formula = decodeURIComponent(href);
      const matched = ids.filter((id) => formula.includes(`'${id}'`));
      seen.push(matched.length);
      return /** @type {any} */ ({
        ok: true,
        status: 200,
        json: async () => ({
          records: matched.map((id) => ({ id, fields: {} })),
        }),
      });
    });

    const r = await fetchEngagement(REF, CONFIG);
    expect(r.ok).toBe(true);
    expect(seen).toEqual([50, 50, 20]);
    expect(r.engagement.project_pai_data).toHaveLength(120);
  });

  it("other statuses keep the generic message", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }));
    await expect(fetchEngagement(REF, CONFIG)).rejects.toThrow(/Airtable API error: 500/);
  });
});

describe("what the guard prevents", () => {
  // Not a test of the guard — a test of the harm. If someone later decides the
  // shortfall check is over-cautious and removes it, this spells out what
  // silently ships in its place: a report that renders perfectly, signs
  // perfectly, and asserts "insufficient evidence" against five criteria whose
  // evidence is sitting in Airtable, fully populated.
  it("empty child tables degrade five SFDR criteria to insufficient_evidence", async () => {
    const engagement = {
      run_id: REF,
      target_label: "sfdr_article_8",
      // Every child array empty — the shape a missed SEARCH produces.
      es_characteristics: [],
      pai_coverage: [],
      annex_ii_coverage: [],
      project_reports: [],
      parent_portfolio_reports: [],
      project_pai_data: [],
      project_input: { jurisdiction: "DE" },
    };

    const engine = new DeterministicEngine({
      engine_commit_sha: "test",
      knowledge_base_hash: "test",
      methodology_version: METHODOLOGY_VERSION,
    });
    const sfdr = buildSFDRInputs(engagement);
    const entity = buildEntityInputs(engagement);
    const project = {
      project_id: "p",
      intake_timestamp: "2026-09-20T00:00:00.000Z",
      facility_type: "colocation",
      jurisdiction: "DE",
      facility_status: "operational",
      data_points: {},
      evidence_documents: [],
      ...(sfdr ? { sfdr } : {}),
    };
    const run = await engine.run(
      entity ? { project, entity } : project,
      frameworksForLabel("sfdr_article_8"),
    );

    const byId = new Map();
    for (const fw of run.framework_results ?? []) {
      for (const [key, value] of Object.entries(fw)) {
        if (!key.endsWith("_results") || !Array.isArray(value)) continue;
        for (const c of value) if (c?.criterion_id) byId.set(c.criterion_id, c);
      }
    }

    // c1, c3, c5 and c7 are fed entirely by child tables.
    for (const id of [
      "sfdr_v1_e_s_characteristics_promotion",
      "sfdr_v1_pai_consideration_policy",
      "sfdr_v1_pre_contractual_disclosure",
      "sfdr_v1_periodic_reporting_commitment",
    ]) {
      expect(byId.get(id)?.verdict, id).toBe("insufficient_evidence");
    }

    // And the run completes cleanly. No error, no warning, nothing to notice.
    expect(run.framework_results.length).toBeGreaterThan(0);
  });
});
