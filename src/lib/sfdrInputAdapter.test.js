// @ts-check
//
// sfdrInputAdapter tests — engagement SFDR fields → engine ProjectSFDRInputs.
//
// The adapter is the load-bearing seam between the Airtable Engagements
// mirror and the v3.5 engine input shape. Tests lock the structural
// invariants: undefined when nothing populated; correct nesting at
// art9.si_objective / art9.pai_data / art9.evidence_pack; defensive
// behaviour on malformed JSON.

import { describe, it, expect } from "vitest";
import { buildSFDRInputs } from "./sfdrInputAdapter.js";

describe("buildSFDRInputs — empty / undefined inputs", () => {
  it("returns undefined when no SFDR fields are populated", () => {
    expect(buildSFDRInputs({})).toBeUndefined();
    expect(buildSFDRInputs(/** @type {any} */ (null))).toBeUndefined();
    expect(buildSFDRInputs(/** @type {any} */ (undefined))).toBeUndefined();
  });

  it("returns undefined when all SFDR fields are empty strings", () => {
    expect(
      buildSFDRInputs({
        sfdr_si_objective: "",
        sfdr_dominance_test: "",
        sfdr_es_characteristic: "",
        sfdr_pai_data: "",
      }),
    ).toBeUndefined();
  });
});

describe("buildSFDRInputs — single-field populate", () => {
  it("populates only disclosures.es_characteristics when only sfdr_es_characteristic is set", () => {
    const result = buildSFDRInputs({
      sfdr_es_characteristic: "Operational energy efficiency at PUE ≤1.2",
    });
    expect(result).toEqual({
      disclosures: {
        es_characteristics: [
          {
            name: "Operational energy efficiency at PUE ≤1.2",
            category: "environmental",
          },
        ],
      },
    });
    expect(result.art9).toBeUndefined();
  });

  it("populates art9.evidence_pack when only sfdr_assurance_tier is set", () => {
    const result = buildSFDRInputs({
      sfdr_assurance_tier: "limited_big4",
    });
    expect(result.art9.evidence_pack).toEqual({
      assurance_tier: "limited_big4",
      material_qualifications_present: false,
      operational_doc_age_months: 6,
    });
    expect(result.art9.si_objective).toBeUndefined();
    expect(result.art9.pai_data).toBeUndefined();
  });
});

describe("buildSFDRInputs — SI objective + dominance", () => {
  it("maps Environmental category to environmental_climate_mitigation with climate_change_mitigation taxonomy", () => {
    const result = buildSFDRInputs({
      sfdr_si_objective: "Decarbonisation of hyperscale operations",
      sfdr_si_objective_category: "Environmental",
    });
    expect(result.art9.si_objective.objective).toEqual({
      name: "Decarbonisation of hyperscale operations",
      category: "environmental_climate_mitigation",
      taxonomy_mapping: "climate_change_mitigation",
      social_taxonomy_mapping: null,
    });
  });

  it("maps Social category to social_other_recognised", () => {
    const result = buildSFDRInputs({
      sfdr_si_objective: "Community job creation",
      sfdr_si_objective_category: "Social",
    });
    expect(result.art9.si_objective.objective.category).toBe("social_other_recognised");
    expect(result.art9.si_objective.objective.taxonomy_mapping).toBeNull();
    expect(result.art9.si_objective.objective.social_taxonomy_mapping).toBe(
      "recognised_social_objective",
    );
  });

  it("maps Mixed category to environmental_climate_mitigation primary with social taxonomy also set", () => {
    const result = buildSFDRInputs({
      sfdr_si_objective: "Decarbonisation plus community uplift",
      sfdr_si_objective_category: "Mixed",
    });
    expect(result.art9.si_objective.objective.category).toBe(
      "environmental_climate_mitigation",
    );
    expect(result.art9.si_objective.objective.taxonomy_mapping).toBe(
      "climate_change_mitigation",
    );
    expect(result.art9.si_objective.objective.social_taxonomy_mapping).toBe(
      "recognised_social_objective",
    );
  });

  it("parses dominance test JSON into DominanceEvidence shape with explicit booleans", () => {
    const result = buildSFDRInputs({
      sfdr_si_objective: "x",
      sfdr_dominance_test: JSON.stringify({
        named_in_investment_memorandum: true,
        economic_rationale_depends_on_si: true,
        marketing_leads_with_si: false,
      }),
    });
    expect(result.art9.si_objective.dominance).toEqual({
      named_in_investment_memorandum: true,
      economic_rationale_depends_on_si: true,
      marketing_leads_with_si: false,
    });
  });

  it("does not throw on malformed dominance JSON; dominance is omitted", () => {
    const result = buildSFDRInputs({
      sfdr_si_objective: "x",
      sfdr_dominance_test: "{not valid json",
    });
    expect(result.art9.si_objective.objective.name).toBe("x");
    expect(result.art9.si_objective.dominance).toBeUndefined();
  });
});

describe("buildSFDRInputs — PAI data", () => {
  it("converts engagement PAI rows into per_pai record keyed by PAI number", () => {
    const paiRows = [
      {
        pai_number: 1,
        value: "150",
        unit: "tCO2e",
        verifier_identity: "KPMG",
        assurance_status: "Third-party assured",
      },
      {
        pai_number: 13,
        value: "35",
        unit: "% women on board",
        assurance_status: "Management attested",
      },
    ];
    const result = buildSFDRInputs({
      sfdr_pai_data: JSON.stringify(paiRows),
    });
    expect(result.art9.pai_data.per_pai["1"]).toEqual({
      third_party_verified: true,
      value: 150,
      unit: "tCO2e",
      verifier_name: "KPMG",
      assurance_level: "limited",
    });
    expect(result.art9.pai_data.per_pai["13"]).toEqual({
      third_party_verified: false,
      value: 35,
      unit: "% women on board",
    });
    expect(result.art9.pai_data.data_recency_months).toBe(6);
  });

  it("skips rows with missing pai_number or value; coerces numeric strings to numbers", () => {
    const paiRows = [
      { pai_number: 1, value: "1234.5" },
      { value: 42 }, // missing pai_number — skipped
      { pai_number: 7, value: "low" }, // non-numeric value retained as string (TNFD LEAP label)
    ];
    const result = buildSFDRInputs({
      sfdr_pai_data: JSON.stringify(paiRows),
    });
    expect(result.art9.pai_data.per_pai["1"].value).toBe(1234.5);
    expect(result.art9.pai_data.per_pai["7"].value).toBe("low");
    expect(Object.keys(result.art9.pai_data.per_pai).sort()).toEqual(["1", "7"]);
  });

  it("returns empty per_pai when sfdr_pai_data is malformed JSON; does not throw", () => {
    const result = buildSFDRInputs({
      sfdr_pai_data: "{not json",
    });
    expect(result.art9.pai_data.per_pai).toEqual({});
  });
});

describe("buildSFDRInputs — full population (paid-flow happy path)", () => {
  it("produces a complete ProjectSFDRInputs object with all branches populated", () => {
    const result = buildSFDRInputs({
      sfdr_si_objective: "Decarbonisation of hyperscale operations",
      sfdr_si_objective_category: "Environmental",
      sfdr_dominance_test: JSON.stringify({
        named_in_investment_memorandum: true,
        economic_rationale_depends_on_si: true,
        marketing_leads_with_si: true,
      }),
      sfdr_es_characteristic: "Operational energy efficiency at PUE ≤1.2",
      sfdr_pai_data: JSON.stringify([
        { pai_number: 1, value: 100, unit: "tCO2e", assurance_status: "Third-party assured" },
        { pai_number: 13, value: 35, unit: "%", assurance_status: "Management attested" },
      ]),
      sfdr_assurance_tier: "limited_big4",
    });
    expect(result.disclosures.es_characteristics).toHaveLength(1);
    expect(result.art9.si_objective.objective.name).toBe("Decarbonisation of hyperscale operations");
    expect(result.art9.si_objective.dominance.named_in_investment_memorandum).toBe(true);
    expect(result.art9.pai_data.per_pai["1"].value).toBe(100);
    expect(result.art9.evidence_pack.assurance_tier).toBe("limited_big4");
  });
});
