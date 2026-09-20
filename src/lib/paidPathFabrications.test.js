// @ts-check
//
// The blank-input guard for the PAID path's SFDR and entity adapters.
//
// src/lib/blankRecordGuard.test.js already proves that an engagement with
// nothing filled in produces no answers. It cannot reach these adapters,
// though: on a blank record buildSFDRInputs and buildEntityInputs both return
// undefined before any of their internals run. So every fabrication that only
// fires once an engagement has *some* SFDR data sat outside that guard, which
// is exactly where they were found.
//
// What was there, and what each one did:
//
//   operational_doc_age_months: 6      the engine's c9 recency gate needs at
//                                     least one doc-age value present and
//                                     within threshold. Hardcoding 6 passed
//                                     that gate on every engagement, forever,
//                                     from a number nobody supplied.
//   material_qualifications_present:   Tier 2 (limited_big4) counts as strong
//     false                           assurance only with no material
//                                     qualifications. Hardcoding false scored
//                                     a qualified Tier 2 pack as unqualified,
//                                     and printed "no material qualifications"
//                                     beside the tier in the report.
//   data_recency_months: 6            submitted a twenty-month-old PAI dataset
//                                     to the engine as a six-month-old one.
//   name: "Sustainable investment      the engine quotes the objective name
//     objective"                      verbatim into the c8 rationale, so a
//                                     report could carry a named SI objective
//                                     in quotation marks that nobody wrote.
//   entity_id: "unknown_entity",      not read by any engine code, so not
//   legal_name: "Developer entity",   moving a verdict — but still three
//   jurisdiction: "unknown"           sentences written on the developer's
//                                     behalf into an audit-bearing input.
//
// This test pins what a minimally-populated engagement produces. It fails if
// the list grows, so a new fabrication cannot be added quietly, and it fails
// if the list shrinks without being updated, so closing one has to be
// deliberate. Same contract as blankRecordGuard's EXPECTED_RESIDUE.

import { describe, it, expect } from "vitest";
import { buildSFDRInputs } from "./sfdrInputAdapter.js";
import { buildEntityInputs } from "./entityInputAdapter.js";

/** Every leaf value in an object, with the path that reached it. */
function leaves(node, path = "", out = []) {
  if (node === null || typeof node !== "object") {
    out.push([path, node]);
    return out;
  }
  for (const [k, v] of Object.entries(node)) {
    leaves(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

describe("the SFDR adapter invents nothing for an engagement that supplies one field", () => {
  it("an assurance tier alone produces an evidence pack of exactly that tier", () => {
    const out = buildSFDRInputs({ sfdr_assurance_tier: "limited_big4" });
    expect(leaves(out.art9.evidence_pack)).toEqual([
      ["assurance_tier", "limited_big4"],
    ]);
  });

  it("PAI child rows alone produce no recency claim", () => {
    const out = buildSFDRInputs({
      project_pai_data: [{ fields: { [`fldgZ8FouYtABzADT`]: 1, [`fldn95DR7ajVDYkc0`]: 12 } }],
    });
    if (out?.art9?.pai_data) {
      expect("data_recency_months" in out.art9.pai_data).toBe(false);
    }
  });

  it("an SI objective category with no name declares no objective", () => {
    // SFDR Article 9 turns on a NAMED objective. An unnamed one is a gap in
    // the evidence, not something for the adapter to paper over — and the
    // engine quotes this name back into the report.
    const out = buildSFDRInputs({ sfdr_si_objective_category: "Environmental" });
    expect(out?.art9?.si_objective?.objective).toBeUndefined();
  });

  it("a named SI objective is passed through exactly as written", () => {
    const out = buildSFDRInputs({
      sfdr_si_objective: "Grid decarbonisation of the Nordic interconnect",
      sfdr_si_objective_category: "Environmental",
    });
    expect(out.art9.si_objective.objective.name).toBe(
      "Grid decarbonisation of the Nordic interconnect",
    );
  });

  it("no leaf of the built SFDR input is one of the retired constants", () => {
    const out = buildSFDRInputs({
      sfdr_assurance_tier: "limited_big4",
      sfdr_si_objective: "A real objective",
      sfdr_si_objective_category: "Environmental",
    });
    const values = leaves(out).map(([, v]) => v);
    expect(values).not.toContain("Sustainable investment objective");
    // 6 was the hardcoded month count in three places. It is a legitimate
    // value if an operator types it, but nothing here supplied one.
    expect(leaves(out).filter(([p]) => p.endsWith("_months"))).toEqual([]);
  });
});

describe("the entity adapter invents no identity", () => {
  const MINIMAL = {
    run_id: "b464da15-f122-4043-aa6d-f5720a0cc7f6",
    c2_tax_policy_published: true,
  };

  it("omits identity fields it was not given, rather than naming them", () => {
    const out = buildEntityInputs({ ...MINIMAL, run_id: undefined });
    expect(out, "the fixture must actually build an entity input").toBeTruthy();
    const values = leaves(out).map(([, v]) => v);
    for (const invented of ["unknown_entity", "Developer entity", "unknown"]) {
      expect(values, invented).not.toContain(invented);
    }
    expect("entity_id" in out).toBe(false);
    expect("legal_name" in out).toBe(false);
  });

  it("passes through the identity it does have", () => {
    const out = buildEntityInputs(MINIMAL);
    expect(out.entity_id).toBe("b464da15-f122-4043-aa6d-f5720a0cc7f6");
  });
});

describe("the c9 evidence pack carries what the operator supplied", () => {
  it("a definite 'no material qualifications' survives, an absent one does not", () => {
    // false is an answer — the assurance report was read — and omitBlanks
    // strips only undefined, null and "". Absent is a different claim.
    const answered = buildSFDRInputs({
      sfdr_assurance_tier: "limited_big4",
      c9_material_qualifications_present: false,
    });
    expect(answered.art9.evidence_pack.material_qualifications_present).toBe(false);

    const silent = buildSFDRInputs({ sfdr_assurance_tier: "limited_big4" });
    expect("material_qualifications_present" in silent.art9.evidence_pack).toBe(false);
  });

  it("both doc ages reach the engine when both are given", () => {
    const out = buildSFDRInputs({
      sfdr_assurance_tier: "reasonable_big4",
      c9_operational_doc_age_months: 9,
      c9_design_stage_doc_age_months: 20,
    });
    expect(out.art9.evidence_pack.operational_doc_age_months).toBe(9);
    expect(out.art9.evidence_pack.design_stage_doc_age_months).toBe(20);
  });
});
