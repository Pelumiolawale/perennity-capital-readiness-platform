// @ts-check
//
// ITEM-03 and ITEM-04, on the free path.
//
// Both were fixed on the paid path and never swept here. The engine treats
// `undefined` as "no input" and anything else as an answer, so the wizard's
// two placeholder values were not placeholders at all:
//
//   ecocc_practices_implemented: []          -> "No European Code of Conduct
//                                               practices recorded as
//                                               implemented."  (fail)
//   climate_risk_assessment_completed: false -> "Climate risk vulnerability
//                                               assessment has not been
//                                               completed."    (fail)
//
// Every prospect who ran a free snapshot was handed two asserted failures they
// had never been asked about, in the document meant to open a commercial
// conversation.
//
// These tests drive the wizard's own builder through the real engine, because
// the defect is only visible as a verdict — the submitted object looked
// perfectly reasonable. Note they call buildSnapshotDataPoints rather than
// reimplementing it: the first draft of this file copied the logic, which
// would have gone green against a regressed wizard. That is the same mirror
// defect being removed elsewhere in the codebase, and it does not get a pass
// for being in a test.

import { describe, it, expect } from "vitest";
import {
  DeterministicEngine,
  BUNDLED_ACTIVITIES,
  METHODOLOGY_VERSION,
} from "@perennity/engine";
import {
  buildSnapshotDataPoints as wizardDataPoints,
  PUE_ATTESTATION_CLAIMS,
  INITIAL_INTAKE_ANSWERS,
  SAFEGUARDS_KEYS,
} from "../lib/snapshotIntakeInputs.js";

/**
 * An untouched wizard: the state a prospect gets before typing anything.
 *
 * Imported, not restated. An earlier version of this file hardcoded the
 * defaults it expected — which meant it would have passed against a wizard
 * that had drifted, since the constant and the component could disagree
 * freely. INITIAL_INTAKE_ANSWERS is the object the component actually spreads
 * into its own state.
 */
const UNTOUCHED = { ...INITIAL_INTAKE_ANSWERS };

async function score(form) {
  const engine = new DeterministicEngine({
    engine_commit_sha: "test",
    knowledge_base_hash: "test",
    methodology_version: METHODOLOGY_VERSION,
  });
  const run = await engine.run(
    {
      project_id: "p",
      intake_timestamp: "2026-09-20T00:00:00.000Z",
      facility_type: "hyperscale",
      jurisdiction: "DE",
      facility_status: "operational",
      build_completion_year: 2020,
      data_points: wizardDataPoints(form),
      evidence_documents: [],
    },
    [BUNDLED_ACTIVITIES[0]],
  );
  const byFragment = (frag) => {
    for (const fw of run.framework_results ?? []) {
      for (const [k, v] of Object.entries(fw)) {
        if (!k.endsWith("_results") || !Array.isArray(v)) continue;
        for (const c of v) if (String(c.criterion_id).includes(frag)) return c;
      }
    }
    throw new Error(`no criterion matching ${frag}`);
  };
  return byFragment;
}

describe("an untouched free-tier form asserts nothing (items 3 and 4)", () => {
  it("does not claim the prospect implements no ECoCC practices", async () => {
    const at = await score(UNTOUCHED);
    const ecocc = at("ecocc");
    expect(ecocc.verdict).toBe("data_missing");
    expect(ecocc.gap_summary).not.toMatch(/No European Code of Conduct practices/);
  });

  it("does not claim the climate risk assessment was never done", async () => {
    const at = await score(UNTOUCHED);
    const adaptation = at("adaptation");
    expect(adaptation.verdict).toBe("data_missing");
    expect(adaptation.gap_summary).not.toMatch(/has not been completed/);
  });

  it("sends neither key at all — absence, not a value", () => {
    const dp = wizardDataPoints(UNTOUCHED);
    expect("ecocc_practices_implemented" in dp).toBe(false);
    expect("climate_risk_assessment_completed" in dp).toBe(false);
    expect("climate_risk_assessment_methodology" in dp).toBe(false);
  });
});

describe("an untouched form asserts no passes either — the mirror defect", () => {
  // The sweep that produced these tests found the opposite of items 3 and 4
  // sitting in the same component. The wizard was not only asserting failures
  // nobody stated, it was asserting PASSES nobody stated: all four safeguards
  // groups opened with every box ticked, and PUE, WUE and water stress came
  // pre-filled with values that clear their thresholds.
  //
  // On a free lead-generation tool that is worse than a wrong answer. It is
  // the number the prospect remembers, and we would be the ones who made it up.

  it("sends nothing at all — the form makes no claims on the prospect's behalf", () => {
    expect(wizardDataPoints(UNTOUCHED)).toEqual({});
  });

  it("does not tick the thirteen safeguards items for them", () => {
    const dp = wizardDataPoints(UNTOUCHED);
    for (const key of SAFEGUARDS_KEYS) {
      expect(key in dp, key).toBe(false);
    }
  });

  it("does not invent a PUE, a WUE or a water-stress classification", () => {
    const dp = wizardDataPoints(UNTOUCHED);
    for (const key of [
      "annualised_pue",
      "wue_annualised",
      "site_water_stress_classification",
    ]) {
      expect(key in dp, key).toBe(false);
    }
  });

  it("scores the safeguards as unevidenced rather than compliant", async () => {
    const at = await score(UNTOUCHED);
    for (const fragment of ["human_rights", "bribery", "taxation", "competition"]) {
      const c = at(fragment);
      expect(c.verdict, fragment).toBe("data_missing");
    }
  });

  it("clearing a number box is not a reading of zero", () => {
    // Number("") is 0, and 0 sits under every efficiency threshold in the
    // methodology. This is the same defect as the blank WUE that passed the
    // DNSH water test on the paid path, reached by a different route.
    const dp = wizardDataPoints({ ...UNTOUCHED, annualised_pue: "", wue_annualised: "" });
    expect("annualised_pue" in dp).toBe(false);
    expect("wue_annualised" in dp).toBe(false);
    expect(Object.values(dp)).not.toContain(0);
  });
});

describe("a prospect who does answer is scored on what they said", () => {
  it("a typed PUE and WUE are sent as given", () => {
    const dp = wizardDataPoints({
      ...UNTOUCHED,
      annualised_pue: 1.62,
      wue_annualised: 0.55,
      site_water_stress_classification: "High",
    });
    expect(dp.annualised_pue).toBe(1.62);
    expect(dp.wue_annualised).toBe(0.55);
    expect(dp.site_water_stress_classification).toBe("High");
  });

  it("a group worked through and left empty means 'none of these', and is sent", () => {
    // The distinction the undefined/[] split exists for. Untouched is not an
    // answer; ticked-then-cleared is one, and the prospect is entitled to have
    // it scored rather than quietly dropped.
    const dp = wizardDataPoints({ ...UNTOUCHED, human_rights_compliance_items: [] });
    expect(dp.human_rights_compliance_items).toEqual([]);
    expect("bribery_corruption_compliance_items" in dp).toBe(false);
  });

  it("a partially ticked group is sent exactly as ticked", () => {
    const dp = wizardDataPoints({
      ...UNTOUCHED,
      taxation_compliance_items: ["tax_governance_policy_published"],
    });
    expect(dp.taxation_compliance_items).toEqual(["tax_governance_policy_published"]);
  });

  it("'none of these' scores differently from 'not answered'", async () => {
    const answeredNone = await score({ ...UNTOUCHED, human_rights_compliance_items: [] });
    const notAnswered = await score(UNTOUCHED);
    expect(notAnswered("human_rights").verdict).toBe("data_missing");
    expect(answeredNone("human_rights").verdict).not.toBe("data_missing");
  });
});

describe("a prospect who does attest still gets scored on it", () => {
  it("ticking climate risk with a methodology passes", async () => {
    const at = await score({
      ...UNTOUCHED,
      climate_risk_assessment_completed: true,
      climate_risk_assessment_methodology: "TCFD scenario analysis, RCP 8.5",
    });
    expect(at("adaptation").verdict).toBe("pass");
  });

  it("ticking climate risk without a methodology is partial, not a fail", async () => {
    const at = await score({
      ...UNTOUCHED,
      climate_risk_assessment_completed: true,
    });
    expect(at("adaptation").verdict).toBe("partial");
  });

  it("whitespace in the methodology box counts as not answered", async () => {
    const dp = wizardDataPoints({
      ...UNTOUCHED,
      climate_risk_assessment_completed: true,
      climate_risk_assessment_methodology: "   ",
    });
    expect(dp.climate_risk_assessment_completed).toBe(true);
    expect("climate_risk_assessment_methodology" in dp).toBe(false);
  });
});

describe("the PUE attestation stays a faithful reading of its own label", () => {
  // The checkbox reads: "PUE measured per EN 50600-4-2, Category 2, with
  // documented boundary and annualised reporting." These four values are that
  // sentence, not an invention — but they are only defensible while the label
  // still says it. If the label changes and these do not, the tick starts
  // meaning something the user was never shown.
  it("sends nothing when the box is unticked", () => {
    const dp = wizardDataPoints(UNTOUCHED);
    for (const k of [
      "pue_measurement_methodology_declared",
      "pue_measurement_category",
      "pue_measurement_boundary_documented",
      "pue_reporting_basis",
    ]) {
      expect(k in dp, k).toBe(false);
    }
  });

  it("sends exactly the four claims the label makes when ticked", () => {
    const dp = wizardDataPoints({
      ...UNTOUCHED,
      pue_measurement_compliance_attested: true,
    });
    expect(dp).toMatchObject(PUE_ATTESTATION_CLAIMS);
    // And spelled out, so a change to the constant cannot silently redefine
    // what the checkbox's label is taken to mean.
    expect(PUE_ATTESTATION_CLAIMS).toEqual({
      pue_measurement_methodology_declared: "EN_50600_4_2",
      pue_measurement_category: "category_2",
      pue_measurement_boundary_documented: true,
      pue_reporting_basis: "annualised",
    });
  });

  it("an unticked box leaves the criterion as evidence missing, not failed", async () => {
    const at = await score(UNTOUCHED);
    expect(at("pue_measurement_compliance").verdict).toBe("data_missing");
  });
});
