// @ts-check
//
// End-to-end regression harness for the "blank cell read as a real answer"
// class of bug (operations manual, known-limitations items 1, 3 and 4).
//
// These are not unit tests of the mapper — they drive a mocked Airtable
// record all the way through fetchEngagement → DeterministicEngine and assert
// on the VERDICT the client would see. That is the only level at which these
// bugs are visible: every one of them mapped cleanly at the boundary and then
// turned into a false answer inside the engine, because the engine treats
// `undefined` as "no input" and anything else — including null — as an answer.
//
//   item 1  blank WUE  → Number(null) === 0 → 0 <= 0.4 → pass
//           blank PUE  → same shape in sc_8_1_2, currently dormant (that
//           logic fn is not wired into the bundled Activity 8.1)
//   item 3  blank ECoCC list → practiceCount 0 → fail (not data_missing)
//   item 4  unticked climate-risk checkbox → Boolean(undefined) === false
//           → "has not been completed" fail, on silence
//
// If any of these ever regress, the assertion that breaks is a verdict, not
// an internal shape — which is what actually matters to a paying client.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DeterministicEngine,
  BUNDLED_ACTIVITIES,
  METHODOLOGY_VERSION,
} from "@perennity/engine";
import { fetchEngagement, FID } from "./airtableEngagement.js";

const REF = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";
const CONFIG = { pat: "pat_test", baseId: "app_test", tableId: "tbl_test" };

/**
 * Mock the Airtable REST calls fetchEngagement makes. The parent table
 * returns one active record carrying `fields`; every child table is empty.
 * @param {Record<string, unknown>} fields
 */
function mockAirtable(fields) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const isParent = String(url).includes("/tbl_test");
    const records = isParent
      ? [{ id: "recTEST", fields: { [FID.STATUS]: "active", ...fields } }]
      : [];
    return /** @type {any} */ ({
      ok: true,
      status: 200,
      json: async () => ({ records }),
    });
  });
}

/** Run the EU Taxonomy 8.1 framework over a mocked engagement. */
async function scoreEUTax(fields) {
  mockAirtable(fields);
  const r = await fetchEngagement(REF, CONFIG);
  expect(r.ok).toBe(true);
  const engagement = /** @type {any} */ (r).engagement;
  const engine = new DeterministicEngine({
    engine_commit_sha: "test",
    knowledge_base_hash: "test",
    methodology_version: METHODOLOGY_VERSION,
  });
  const run = await engine.run(engagement.project_input, [BUNDLED_ACTIVITIES[0]]);
  return { engagement, run };
}

/**
 * Pull one criterion result out of a run by the substring in its id. Results
 * are split across per-section arrays on each framework result (sc_results,
 * dnsh_results, ...), so collect every array whose name ends in `_results`
 * rather than hard-coding the section names.
 */
function criterion(run, idFragment) {
  const all = [];
  for (const fw of run.framework_results ?? []) {
    for (const [key, value] of Object.entries(fw)) {
      if (!key.endsWith("_results") || !Array.isArray(value)) continue;
      for (const c of value) if (c && c.criterion_id) all.push(c);
    }
  }
  const hit = all.find((c) => String(c.criterion_id).includes(idFragment));
  if (!hit) {
    throw new Error(
      `No criterion matching "${idFragment}". Saw: ${all.map((c) => c.criterion_id).join(", ")}`,
    );
  }
  return hit;
}

describe("blank numeric cells never read as zero (item 1)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a water-stressed site with NO WUE figure is data_missing, not a pass", async () => {
    const { engagement, run } = await scoreEUTax({
      [FID.SITE_WATER_STRESS]: "Extremely High",
      // WUE deliberately absent — this is the bug.
    });

    // The verdict is asserted first, because the verdict is the harm: before
    // the fix this read "pass" on a water-stressed site with no WUE evidence.
    const water = criterion(run, "water");
    expect(water.verdict).toBe("data_missing");

    // And the mechanism: the key must not reach the engine at all, because
    // `null` is an answer and absence is not. Fails if anyone reinstates
    // `?? null` on a numeric data point.
    expect("wue_annualised" in engagement.project_input.data_points).toBe(false);
  });

  it("a real WUE figure still scores normally", async () => {
    const { run } = await scoreEUTax({
      [FID.SITE_WATER_STRESS]: "Extremely High",
      [FID.WUE_ANNUALISED]: 0.18,
    });
    const water = criterion(run, "water");
    expect(water.verdict).toBe("pass");
    expect(water.observed_value).toBe(0.18);
  });

  it("a WUE figure above the threshold still fails", async () => {
    const { run } = await scoreEUTax({
      [FID.SITE_WATER_STRESS]: "Extremely High",
      [FID.WUE_ANNUALISED]: 1.9,
    });
    expect(criterion(run, "water").verdict).toBe("fail");
  });

  it("an explicit zero WUE is preserved — 0 is a legitimate reading", async () => {
    const { engagement } = await scoreEUTax({
      [FID.SITE_WATER_STRESS]: "Extremely High",
      [FID.WUE_ANNUALISED]: 0,
    });
    expect(engagement.project_input.data_points.wue_annualised).toBe(0);
  });

  // PUE is defensive hardening, not a live false pass today: sc_8_1_2.ts has
  // exactly the same Number(null) === 0 shape as dnsh_water.ts, but it is not
  // among the criteria the bundled Activity 8.1 currently scores (only
  // sc_8_1_2_pue_measurement_compliance is). So there is no verdict to assert
  // here — only that the blank cell never reaches the engine as a number. If
  // the activity ever wires sc_8_1_2 in, this is already correct.
  it("a blank PUE never reaches the engine as a value", async () => {
    const { engagement } = await scoreEUTax({
      [FID.FACILITY_STATUS]: "operational",
      [FID.BUILD_COMPLETION_YEAR]: 2024,
      // PUE deliberately absent.
    });
    expect("annualised_pue" in engagement.project_input.data_points).toBe(false);
  });

  it("a real PUE figure is still passed through", async () => {
    const { engagement } = await scoreEUTax({
      [FID.FACILITY_STATUS]: "operational",
      [FID.BUILD_COMPLETION_YEAR]: 2024,
      [FID.ANNUALISED_PUE]: 1.22,
    });
    expect(engagement.project_input.data_points.annualised_pue).toBe(1.22);
  });
});
