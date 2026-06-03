// @ts-check
//
// entityInputAdapter tests — engagement sfdr_entity_disclosures JSON blob
// → engine EntityInput shape. Covers defensive guards (absent / empty /
// malformed) and per-sub-shape pass-through (governance, pai_disclosures,
// disclosures, reporting).

import { describe, it, expect, vi } from "vitest";
import { buildEntityInputs } from "./entityInputAdapter.js";

const ENGAGEMENT_BASE = {
  run_id: "test-engagement-uuid",
  legal_name: "Test Developer Ltd",
  jurisdiction: "DE",
  project_input: { jurisdiction: "DE" },
  report_metadata: { client_name: "Test Client" },
};

describe("buildEntityInputs — defensive guards", () => {
  it("returns undefined when engagement is null or undefined", () => {
    expect(buildEntityInputs(/** @type {any} */ (null))).toBeUndefined();
    expect(buildEntityInputs(/** @type {any} */ (undefined))).toBeUndefined();
  });

  it("returns undefined when sfdr_entity_disclosures field is absent", () => {
    expect(buildEntityInputs(ENGAGEMENT_BASE)).toBeUndefined();
  });

  it("returns undefined when sfdr_entity_disclosures is an empty string", () => {
    expect(
      buildEntityInputs({ ...ENGAGEMENT_BASE, sfdr_entity_disclosures: "" }),
    ).toBeUndefined();
  });

  it("returns undefined and warns when JSON is malformed (no throw)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = buildEntityInputs({
        ...ENGAGEMENT_BASE,
        sfdr_entity_disclosures: "{ not: valid json",
      });
      expect(result).toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("returns undefined when the parsed blob has no recognised sub-shapes", () => {
    expect(
      buildEntityInputs({
        ...ENGAGEMENT_BASE,
        sfdr_entity_disclosures: JSON.stringify({ unknown_key: "value" }),
      }),
    ).toBeUndefined();
  });
});

describe("buildEntityInputs — identity resolution", () => {
  it("populates entity_id from engagement.run_id", () => {
    const result = buildEntityInputs({
      ...ENGAGEMENT_BASE,
      sfdr_entity_disclosures: JSON.stringify({
        governance: { board_structure: {} },
      }),
    });
    expect(result?.entity_id).toBe("test-engagement-uuid");
  });

  it("populates legal_name from report_metadata.client_name when present", () => {
    const result = buildEntityInputs({
      ...ENGAGEMENT_BASE,
      sfdr_entity_disclosures: JSON.stringify({
        governance: { board_structure: {} },
      }),
    });
    expect(result?.legal_name).toBe("Test Client");
  });

  it("populates jurisdiction from project_input.jurisdiction", () => {
    const result = buildEntityInputs({
      ...ENGAGEMENT_BASE,
      project_input: { jurisdiction: "AE" },
      sfdr_entity_disclosures: JSON.stringify({
        governance: { board_structure: {} },
      }),
    });
    expect(result?.jurisdiction).toBe("AE");
  });
});

describe("buildEntityInputs — sub-shape pass-through", () => {
  it("passes governance sub-shape through to sfdr.governance", () => {
    const governance = {
      board_structure: {
        independent_ned_count: 3,
        terms_of_reference_documented: true,
        ceo_chair_separated: true,
        lead_independent_director_designated: false,
        executive_committee_published: true,
      },
      employee_relations: {
        ungc_violations_5yr_count: 0,
        ungp_aligned_policy_published: true,
        grievance_mechanism_documented: true,
        labour_law_compliance_attested: true,
      },
      remuneration: {
        policy_published: true,
        ceo_to_median_ratio_disclosed: true,
        ceo_to_median_ratio_value: 75,
        esg_linked_variable_pay: true,
      },
      tax_compliance: {
        tax_policy_published: true,
        jurisdictions_used: ["DE", "AE"],
        cbcr_jurisdiction_count: 2,
        unresolved_tax_disputes_eur_max: 0,
      },
    };
    const result = buildEntityInputs({
      ...ENGAGEMENT_BASE,
      sfdr_entity_disclosures: JSON.stringify({ governance }),
    });
    expect(result?.sfdr?.governance).toEqual(governance);
  });

  it("passes pai_disclosures sub-shape through (c3)", () => {
    const pai_disclosures = {
      statement_url: "https://example.com/pai-policy.pdf",
      statement_published_date: "2026-01-15",
      art_4_explicit_reference: true,
      pai_coverage: {
        1: { data_disclosed: true, target_disclosed: true, mitigation_documented: true },
        2: { data_disclosed: true, target_disclosed: false, mitigation_documented: true },
      },
    };
    const result = buildEntityInputs({
      ...ENGAGEMENT_BASE,
      sfdr_entity_disclosures: JSON.stringify({ pai_disclosures }),
    });
    expect(result?.sfdr?.pai_disclosures).toEqual(pai_disclosures);
  });

  it("passes disclosures.annex_ii_coverage sub-shape through (c5)", () => {
    const disclosures = {
      annex_ii_coverage: {
        1: { coverage: "covered_specific" },
        2: { coverage: "covered_specific" },
        4: { coverage: "covered_specific", named_framework: "TCFD" },
      },
    };
    const result = buildEntityInputs({
      ...ENGAGEMENT_BASE,
      sfdr_entity_disclosures: JSON.stringify({ disclosures }),
    });
    expect(result?.sfdr?.disclosures).toEqual(disclosures);
  });

  it("passes reporting sub-shape through (c7)", () => {
    const reporting = {
      operational_status: "operational",
      reporting_framework_commitment: {
        specifies_indicators: true,
        specifies_annual_cadence: true,
        specifies_assurance: false,
        named_standard: "GRI",
      },
    };
    const result = buildEntityInputs({
      ...ENGAGEMENT_BASE,
      sfdr_entity_disclosures: JSON.stringify({ reporting }),
    });
    expect(result?.sfdr?.reporting).toEqual(reporting);
  });

  it("composes all four sub-shapes when all present", () => {
    const result = buildEntityInputs({
      ...ENGAGEMENT_BASE,
      sfdr_entity_disclosures: JSON.stringify({
        governance: { board_structure: { independent_ned_count: 1 } },
        pai_disclosures: { art_4_explicit_reference: true, pai_coverage: {} },
        disclosures: { annex_ii_coverage: { 1: { coverage: "covered_specific" } } },
        reporting: { operational_status: "operational" },
      }),
    });
    expect(result?.sfdr?.governance).toBeDefined();
    expect(result?.sfdr?.pai_disclosures).toBeDefined();
    expect(result?.sfdr?.disclosures).toBeDefined();
    expect(result?.sfdr?.reporting).toBeDefined();
  });
});
