// @ts-check
//
// ITEM-17, the last place in the app where position stood in for identity.
//
// Evidence documents are typed by hand into a long-text cell, one per line,
// five pipe-separated fields in a fixed order:
//
//     document_id | document_type | uri | uploaded_at | sha256
//
// Position 2 is what sc_8_1_1 matches on to find the independent audit report
// for EU Taxonomy Activity 8.1. Transpose two fields and the audit document
// becomes invisible — the criterion reports "No independent audit document in
// submitted evidence" against evidence sitting in the cell.
//
// The old check counted fields and nothing else: it caught a line with four,
// and was blind to a line with five in the wrong order. That is both the more
// likely mistake and the silent one. It also wrote its warning onto the entry
// object, where nothing ever read it.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DeterministicEngine,
  BUNDLED_ACTIVITIES,
  METHODOLOGY_VERSION,
} from "@perennity/engine";
import { fetchEngagement, FID } from "./airtableEngagement.js";

const REF = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";
const CONFIG = { pat: "pat_test", baseId: "app_test", tableId: "tbl_test" };

const GOOD =
  "doc-003 | audit_report | https://drive.google.com/x/doc-003 | 2026-05-10T10:10:00Z | 7d865e959b2466918c9863";
// The same five values, with document_type and uri swapped — one slip.
const TRANSPOSED =
  "doc-003 | https://drive.google.com/x/doc-003 | audit_report | 2026-05-10T10:10:00Z | 7d865e959b2466918c9863";

function mock(evidence) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => ({
    ok: true,
    status: 200,
    json: async () => ({
      records: String(url).includes("/tbl_test")
        ? [
            {
              id: "recTEST",
              fields: {
                [FID.STATUS]: "active",
                [FID.EVIDENCE_DOCUMENTS]: evidence,
                [FID.ECOCC_PRACTICES_JSON]: JSON.stringify(["a", "b", "c"]),
              },
            },
          ]
        : [],
    }),
  }));
}

async function load(evidence) {
  mock(evidence);
  const r = await fetchEngagement(REF, CONFIG);
  expect(r.ok).toBe(true);
  return /** @type {any} */ (r).engagement;
}

describe("a well-formed evidence line is accepted silently", () => {
  afterEach(() => vi.restoreAllMocks());

  it("parses into the five fields and warns about nothing", async () => {
    const e = await load(GOOD);
    expect(e.project_input.evidence_documents).toHaveLength(1);
    expect(e.project_input.evidence_documents[0]).toMatchObject({
      document_id: "doc-003",
      document_type: "audit_report",
      uploaded_at: "2026-05-10T10:10:00Z",
    });
    expect(e.schema_warnings).toBeUndefined();
  });

  it("accepts the truncated hashes the live records actually carry", async () => {
    // Live data holds 11-22 hex characters, not 64. A stricter check would
    // flag every real record, which is how a warning becomes noise and then
    // gets ignored.
    const e = await load(
      "doc-002 | audit_report | https://x.test/a.pdf | 2022-09-15T00:00:00Z | b1c2d3e4f50",
    );
    expect(e.schema_warnings).toBeUndefined();
  });

  it("accepts a document type the engine never consults", async () => {
    const e = await load(
      "doc-001 | engineering_design | https://x.test/a.pdf | 2026-05-10T10:00:00Z | e3b0c44298fc1c14",
    );
    expect(e.schema_warnings).toBeUndefined();
  });
});

describe("a mis-ordered line is caught and named", () => {
  afterEach(() => vi.restoreAllMocks());

  it("two swapped fields are flagged — the case the count check could not see", async () => {
    const e = await load(TRANSPOSED);
    const warnings = (e.schema_warnings ?? []).join("\n");
    expect(warnings).toMatch(/line 1/);
    expect(warnings).toMatch(/document_type should be/);
    expect(warnings).toMatch(/uri should be a URL/);
  });

  it("says what it costs when it is the document_type slot", async () => {
    // "field 2 looks odd" does not convey that the audit evidence is about to
    // disappear from the flagship criterion.
    const e = await load(TRANSPOSED);
    expect((e.schema_warnings ?? []).join("\n")).toMatch(
      /cannot be recognised as an independent audit/,
    );
  });

  it("names the line number when several are present", async () => {
    const e = await load([GOOD, GOOD, TRANSPOSED].join("\n"));
    expect((e.schema_warnings ?? []).join("\n")).toMatch(/line 3/);
  });

  it("still flags a short line, as before", async () => {
    const e = await load("doc-003 | audit_report | https://x.test/a.pdf");
    expect((e.schema_warnings ?? []).join("\n")).toMatch(/3 pipe-separated fields, not 5/);
  });

  it("the warning reaches the engagement instead of a field nobody reads", async () => {
    // The old code set entry.parse_warning, which was written and never read
    // anywhere in the codebase — the same "built but never rendered" shape as
    // the Article 26 footnote.
    const e = await load(TRANSPOSED);
    expect(Array.isArray(e.schema_warnings)).toBe(true);
    expect(e.schema_warnings.length).toBeGreaterThan(0);
  });
});

describe("what a transposition actually costs (the harm, not the guard)", () => {
  afterEach(() => vi.restoreAllMocks());

  async function ecoccVerdict(evidence) {
    const e = await load(evidence);
    const engine = new DeterministicEngine({
      engine_commit_sha: "test",
      knowledge_base_hash: "test",
      methodology_version: METHODOLOGY_VERSION,
    });
    const run = await engine.run(e.project_input, [BUNDLED_ACTIVITIES[0]]);
    for (const fw of run.framework_results ?? []) {
      for (const [k, v] of Object.entries(fw)) {
        if (!k.endsWith("_results") || !Array.isArray(v)) continue;
        for (const c of v) if (String(c.criterion_id).includes("ecocc")) return c;
      }
    }
    throw new Error("no ecocc criterion");
  }

  it("a correct line lets sc_8_1_1 find the audit report", async () => {
    const c = await ecoccVerdict(GOOD);
    expect(c.gap_summary).not.toMatch(/No independent audit document/);
  });

  it("a transposed line makes the audit evidence vanish", async () => {
    // Identical evidence, one slip in the ordering, and the flagship criterion
    // reports that nothing was supplied. This is why the warning is worth
    // having and why it names the consequence.
    const c = await ecoccVerdict(TRANSPOSED);
    expect(c.gap_summary).toMatch(/No independent audit document/);
  });
});
