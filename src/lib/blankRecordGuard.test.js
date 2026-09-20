// @ts-check
//
// The generalised guard for one bug class: a blank cell becoming an answer.
//
// This class has been fixed five separate times — blank WUE read as 0 and
// passing a regulated water threshold, blank PUE the same, a blank ECoCC list
// read as a finding of zero practices, an unticked checkbox read as a definite
// No, a c6 claim given an invented percentage, basis and publication date —
// and each fix was "remember optionalKey at one more call site". The sixth
// instance was then found in the free-tier wizard, where it had survived two
// sweeps behind a comment asserting the opposite.
//
// So rather than test the six known instances, this tests the property: an
// engagement where NOBODY HAS FILLED ANYTHING IN must produce no answers.
//
// Anyone adding a field with `?? null`, `?? 0`, `Boolean(...)` or a literal
// default will fail here, on arrival, whether or not they knew the rule.

import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchEngagement, omitBlanks, FID } from "./airtableEngagement.js";
import { buildSFDRInputs } from "./sfdrInputAdapter.js";
import { buildUKSDRInputs } from "./ukSDRInputAdapter.js";
import { buildEntityInputs } from "./entityInputAdapter.js";

const REF = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";
const CONFIG = { pat: "pat_test", baseId: "app_test", tableId: "tbl_test" };

/** An engagement that exists and is active, and has nothing else filled in. */
function mockEmptyRecord() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => ({
    ok: true,
    status: 200,
    json: async () => ({
      records: String(url).includes("/tbl_test")
        ? [{ id: "recEMPTY", fields: { [FID.STATUS]: "active" } }]
        : [],
    }),
  }));
}

async function emptyEngagement() {
  mockEmptyRecord();
  const r = await fetchEngagement(REF, CONFIG);
  expect(r.ok).toBe(true);
  return /** @type {any} */ (r).engagement;
}

describe("omitBlanks", () => {
  it("strips undefined, null and empty string", () => {
    expect(omitBlanks({ a: undefined, b: null, c: "", d: 1 })).toEqual({ d: 1 });
  });

  it("keeps false and zero — both are answers", () => {
    expect(omitBlanks({ a: false, b: 0 })).toEqual({ a: false, b: 0 });
  });

  it("keeps an empty array — the operator may have ticked none", () => {
    // Deliberate. For a multi-select, [] can be a real answer. Where it means
    // "not collected" instead, that has to be decided at the field.
    expect(omitBlanks({ a: [] })).toEqual({ a: [] });
  });

  it("does not mutate its input", () => {
    const input = { a: null, b: 1 };
    omitBlanks(input);
    expect(input).toEqual({ a: null, b: 1 });
  });
});

describe("an engagement with nothing filled in produces no answers", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends the engine no data points at all", async () => {
    const e = await emptyEngagement();
    // Not "mostly empty" — empty. Every key here would be a claim about a
    // developer who has told us nothing.
    expect(e.project_input.data_points).toEqual({});
  });

  it("builds no SFDR, UK SDR or entity inputs", async () => {
    const e = await emptyEngagement();
    expect(buildSFDRInputs(e)).toBeUndefined();
    expect(buildUKSDRInputs(e)).toBeUndefined();
    expect(buildEntityInputs(e)).toBeUndefined();
  });

  it("carries no numeric zero anywhere in the engine input", async () => {
    const e = await emptyEngagement();
    // 0 is the value a blank number becomes when it is coerced, and it sits
    // under every efficiency threshold in the methodology. That is exactly how
    // a blank WUE came to pass the DNSH water test.
    const zeros = [];
    const walk = (node, path) => {
      if (node === 0) zeros.push(path);
      else if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`));
      else if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
      }
    };
    walk(e.project_input, "");
    expect(zeros).toEqual([]);
  });
});

describe("the fabrications that remain are pinned, not forgotten", () => {
  afterEach(() => vi.restoreAllMocks());

  // These are the keys an EMPTY record still puts a value on. Each one is a
  // claim about a developer who has told us nothing, and each is listed here
  // with why it is still outstanding. The test fails if the list grows — a new
  // fabrication cannot be added quietly — and it fails if the list shrinks
  // without being updated, so closing one has to be deliberate.
  const EXPECTED_RESIDUE = {
    // Genuinely derived, not fabricated:
    run_id: "the reference the caller asked for",
    project_input: "the input shape itself",
    evidence_references: "empty array, parsed from an empty cell",
    report_metadata: "object of nulls, for the PDF cover — never scored",
    es_characteristics: "empty array from the child fetch",
    pai_coverage: "empty array from the child fetch",
    annex_ii_coverage: "empty array from the child fetch",
    project_reports: "empty array from the child fetch",
    parent_portfolio_reports: "empty array from the child fetch",
    project_pai_data: "empty array from the child fetch",

    // Outstanding, each with a reason:
    c3_art_4_explicit_reference:
      "Boolean() of a blank checkbox. Harmless — no engine code reads it; " +
      "v3.5 removed it from the aligned gate.",
    c6_taxonomy_claim_made:
      "Boolean() of a blank checkbox, and correct: this is a documented " +
      "master gate whose unchecked state means no Taxonomy claim is made.",
    c6_minimum_safeguards_attestation:
      "Boolean() of a blank checkbox. Reaches the engine only when a claim " +
      "is made, and a claim requires a quantified percentage.",
  };

  // Closed on 20 Sep 2026, listed so the shrinkage is on the record:
  //
  //   target_label      defaulted to eu_taxonomy_aligned_8_1 when blank, so an
  //                     unscoped engagement was silently scoped to EU Taxonomy
  //                     and a signed report issued against a framework the
  //                     client never chose. Now undefined, which
  //                     isRoutableTargetLabel rejects — the route refuses
  //                     rather than guessing.
  //
  //   c7_specifies_*    Boolean() of a blank checkbox asserted that a
  //                     commitment does not specify indicators / cadence /
  //                     assurance, from an untouched box. Now coerceCheckbox,
  //                     so unticked is undefined. Deliberately NOT given the
  //                     tri-state treatment: the engine reads all three only
  //                     through `allSpecifiers`, which needs every one true,
  //                     so a definite No scores identically to a blank. That
  //                     is the opposite of c2, where a definite No is the
  //                     difference between failing a domain and returning
  //                     insufficient evidence.

  it("nothing new has started fabricating a value", async () => {
    const e = await emptyEngagement();
    const withValue = Object.entries(e)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k]) => k)
      .sort();
    expect(withValue).toEqual(Object.keys(EXPECTED_RESIDUE).sort());
  });

  it("every entry in the list says why it is there", () => {
    for (const [key, reason] of Object.entries(EXPECTED_RESIDUE)) {
      expect(typeof reason, key).toBe("string");
      expect(reason.length, key).toBeGreaterThan(20);
    }
  });
});

describe("an unscoped engagement is refused, not silently scoped", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a blank Target Label yields no target_label at all", async () => {
    // It used to default to eu_taxonomy_aligned_8_1. An engagement nobody had
    // scoped was therefore scored against EU Taxonomy, and a signed £85k
    // report issued against a framework the client had never chosen — the most
    // expensive possible version of a blank becoming an answer.
    const e = await emptyEngagement();
    expect(e.target_label).toBeUndefined();
  });

  it("and the route's own guard rejects that, so it cannot reach the engine", async () => {
    const { isRoutableTargetLabel } = await import("./engineClient.js");
    expect(isRoutableTargetLabel(undefined)).toBe(false);
    // Sanity: the guard is not simply rejecting everything.
    expect(isRoutableTargetLabel("eu_taxonomy_aligned_8_1")).toBe(true);
  });

  it("the c7 specifiers are absent rather than denied", async () => {
    // Boolean() of an untouched checkbox asserted that the developer's
    // reporting commitment does NOT specify indicators, cadence or assurance.
    const e = await emptyEngagement();
    for (const k of [
      "c7_specifies_indicators",
      "c7_specifies_annual_cadence",
      "c7_specifies_assurance",
    ]) {
      expect(e[k], k).toBeUndefined();
    }
  });
});
