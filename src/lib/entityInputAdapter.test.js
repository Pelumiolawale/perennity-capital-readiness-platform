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

// ---------------------------------------------------------------------------
// BUG-01: discrete c2 columns. Blank / unknown inputs must never be coerced to
// failing (false / 0) or passing (0 violations) values. A governance domain is
// emitted only when every input it needs is known; otherwise the engine
// reports insufficient_evidence for it.
// ---------------------------------------------------------------------------

import { SFDR_REGISTRY } from "@perennity/engine";

/** All four domains fully answered (mirrors recW0n22jOOEfbFY6). */
const C2_FULL = {
  c2_independent_ned_count: 5,
  c2_terms_of_reference_documented: true,
  c2_ceo_chair_separated: true,
  c2_lead_independent_director_designated: true,
  c2_executive_committee_published: true,
  c2_ungc_violations_5yr_count: 0,
  c2_ungp_aligned_policy_published: true,
  c2_grievance_mechanism_documented: true,
  c2_labour_law_compliance_attested: true,
  c2_remuneration_policy_published: true,
  c2_ceo_to_median_ratio_disclosed: true,
  c2_ceo_to_median_ratio_value: 42,
  c2_esg_linked_variable_pay: true,
  c2_tax_policy_published: true,
  c2_tax_jurisdictions_used: "DE, NL, FR",
  c2_cbcr_jurisdiction_count: 3,
  c2_unresolved_tax_disputes_eur_max: 0,
};

/** The live bug case (recIvrhfXcc8mZI0w): most checkboxes blank. */
const C2_PARTIAL_REPRO = {
  c2_independent_ned_count: 1,
  c2_ungc_violations_5yr_count: 0,
  c2_ungp_aligned_policy_published: true,
  c2_labour_law_compliance_attested: true,
  c2_tax_jurisdictions_used: "DE, NL",
  c2_cbcr_jurisdiction_count: 1,
  c2_unresolved_tax_disputes_eur_max: 15000000,
};

const scoreC2 = /** @type {any} */ (SFDR_REGISTRY.get("sfdr_v1_good_governance_attestation"));

/** @param {object} fields */
function c2Band(fields) {
  const entity = buildEntityInputs({ ...ENGAGEMENT_BASE, ...fields });
  return scoreC2({ project: {}, entity }).band;
}

describe("buildEntityInputs — c2 discrete columns (BUG-01)", () => {
  it("emits all four domains, unchanged, when every input is known", () => {
    const gov = buildEntityInputs({ ...ENGAGEMENT_BASE, ...C2_FULL })?.sfdr?.governance;
    expect(gov).toEqual({
      board_structure: {
        independent_ned_count: 5,
        terms_of_reference_documented: true,
        ceo_chair_separated: true,
        lead_independent_director_designated: true,
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
        ceo_to_median_ratio_value: 42,
        esg_linked_variable_pay: true,
      },
      tax_compliance: {
        tax_policy_published: true,
        jurisdictions_used: ["DE", "NL", "FR"],
        cbcr_jurisdiction_count: 3,
        unresolved_tax_disputes_eur_max: 0,
      },
    });
  });

  it.each([
    ["board_structure", "c2_ceo_chair_separated"],
    ["board_structure", "c2_independent_ned_count"],
    ["employee_relations", "c2_grievance_mechanism_documented"],
    ["employee_relations", "c2_ungc_violations_5yr_count"],
    ["remuneration", "c2_esg_linked_variable_pay"],
    ["tax_compliance", "c2_tax_policy_published"],
    ["tax_compliance", "c2_unresolved_tax_disputes_eur_max"],
    ["tax_compliance", "c2_tax_jurisdictions_used"],
  ])("omits %s when %s is unknown, and keeps the other domains", (domain, field) => {
    const gov = buildEntityInputs({ ...ENGAGEMENT_BASE, ...C2_FULL, [field]: undefined })
      ?.sfdr?.governance;
    expect(gov).not.toHaveProperty(domain);
    expect(Object.keys(gov ?? {})).toHaveLength(3);
  });

  it("keeps a definite No (false) as a known answer", () => {
    const gov = buildEntityInputs({
      ...ENGAGEMENT_BASE,
      ...C2_FULL,
      c2_tax_policy_published: false,
    })?.sfdr?.governance;
    expect(gov?.tax_compliance?.tax_policy_published).toBe(false);
  });

  it("never turns a blank count into 0", () => {
    const gov = buildEntityInputs({
      ...ENGAGEMENT_BASE,
      ...C2_FULL,
      c2_ungc_violations_5yr_count: undefined,
      c2_unresolved_tax_disputes_eur_max: undefined,
    })?.sfdr?.governance;
    expect(gov).not.toHaveProperty("employee_relations");
    expect(gov).not.toHaveProperty("tax_compliance");
  });

  it("treats the ratio value as optional for remuneration", () => {
    const gov = buildEntityInputs({
      ...ENGAGEMENT_BASE,
      ...C2_FULL,
      c2_ceo_to_median_ratio_value: undefined,
    })?.sfdr?.governance;
    expect(gov).toHaveProperty("remuneration");
  });

  it("returns an empty governance object when c2 data exists but no domain is complete", () => {
    const gov = buildEntityInputs({ ...ENGAGEMENT_BASE, ...C2_PARTIAL_REPRO })?.sfdr?.governance;
    expect(gov).toEqual({});
  });

  it("returns undefined when no c2 field is populated", () => {
    expect(buildEntityInputs({ ...ENGAGEMENT_BASE })).toBeUndefined();
  });

  it("still falls back to the legacy JSON blob when no discrete column is set", () => {
    const governance = { board_structure: { independent_ned_count: 2 } };
    const result = buildEntityInputs({
      ...ENGAGEMENT_BASE,
      sfdr_entity_disclosures: JSON.stringify({ governance }),
    });
    expect(result?.sfdr?.governance).toEqual(governance);
  });
});

describe("c2 end to end through the engine scorer (BUG-01)", () => {
  it("repro: the partially filled live row is insufficient_evidence, not not_aligned", () => {
    expect(c2Band(C2_PARTIAL_REPRO)).toBe("insufficient_evidence");
  });

  it("a fully answered all-Yes row is aligned", () => {
    expect(c2Band(C2_FULL)).toBe("aligned");
  });

  it("one unknown field makes c2 insufficient_evidence", () => {
    expect(c2Band({ ...C2_FULL, c2_lead_independent_director_designated: undefined })).toBe(
      "insufficient_evidence",
    );
  });

  it("a definite No still scores (not_aligned when it fails a domain)", () => {
    expect(c2Band({ ...C2_FULL, c2_tax_policy_published: false })).toBe("not_aligned");
  });
});
