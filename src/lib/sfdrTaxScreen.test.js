// @ts-check
//
// ITEM-02, end to end.
//
// taxJurisdictions.test.js proves the translation in isolation. This proves
// the thing that actually matters: an entity whose tax footprint includes an
// EU Annex I non-cooperative jurisdiction now FAILS SFDR criterion 2, and one
// whose footprint is ordinary still passes. Before the fix both scored the
// same, because "RU" was compared against "Russian Federation".

import { describe, it, expect } from "vitest";
import {
  DeterministicEngine,
  METHODOLOGY_VERSION,
} from "@perennity/engine";
import { frameworksForLabel } from "./engineClient.js";
import { buildEntityInputs } from "./entityInputAdapter.js";

/**
 * A c2 record with all four governance domains complete and clean, so the
 * only thing moving between cases is the tax footprint.
 * @param {string} jurisdictions
 */
function engagementWithJurisdictions(jurisdictions) {
  return {
    run_id: "11111111-1111-4111-8111-111111111111",
    legal_name: "Test Developer GmbH",
    jurisdiction: "DE",
    project_input: { jurisdiction: "DE" },
    // Domain A — board structure
    c2_independent_ned_count: 3,
    c2_terms_of_reference_documented: true,
    c2_ceo_chair_separated: true,
    c2_lead_independent_director_designated: true,
    c2_executive_committee_published: true,
    // Domain B — employee relations
    c2_ungc_violations_5yr_count: 0,
    c2_ungp_aligned_policy_published: true,
    c2_grievance_mechanism_documented: true,
    c2_labour_law_compliance_attested: true,
    // Domain C — remuneration
    c2_remuneration_policy_published: true,
    c2_ceo_to_median_ratio_disclosed: true,
    c2_ceo_to_median_ratio_value: 12,
    c2_esg_linked_variable_pay: true,
    // Domain D — tax compliance
    c2_tax_policy_published: true,
    c2_tax_jurisdictions_used: jurisdictions,
    c2_cbcr_jurisdiction_count: 5,
    c2_unresolved_tax_disputes_eur_max: 0,
  };
}

async function scoreC2(jurisdictions) {
  const entity = buildEntityInputs(engagementWithJurisdictions(jurisdictions));
  expect(entity?.sfdr?.governance?.tax_compliance).toBeDefined();

  const engine = new DeterministicEngine({
    engine_commit_sha: "test",
    knowledge_base_hash: "test",
    methodology_version: METHODOLOGY_VERSION,
  });
  const run = await engine.run(
    {
      project: {
        project_id: "p",
        intake_timestamp: "2026-09-20T00:00:00.000Z",
        facility_type: "colocation",
        jurisdiction: "DE",
        facility_status: "operational",
        data_points: {},
        evidence_documents: [],
      },
      entity,
    },
    frameworksForLabel("sfdr_article_8"),
  );

  const results = [];
  for (const fw of run.framework_results ?? []) {
    for (const [key, value] of Object.entries(fw)) {
      if (!key.endsWith("_results") || !Array.isArray(value)) continue;
      for (const c of value) if (c && c.criterion_id) results.push(c);
    }
  }
  const c2 = results.find((c) =>
    String(c.criterion_id).includes("good_governance"),
  );
  if (!c2) {
    throw new Error(
      `No c2 criterion. Saw: ${results.map((c) => c.criterion_id).join(", ")}`,
    );
  }
  // The c2 rationale names each domain's verdict; Domain D is "Tax
  // compliance". Asserting on that substring pins the fix to the screen that
  // was broken, rather than to the criterion's overall verdict, which several
  // unrelated domains also move.
  const taxDomain = /Tax compliance: (\w+)/.exec(c2.rationale_text ?? "")?.[1];
  return { entity, c2, taxDomain };
}

describe("SFDR c2 Annex I tax screen (item 2)", () => {
  it("an ordinary EU footprint still passes Domain D and reaches aligned", async () => {
    const { entity, c2, taxDomain } = await scoreC2("DE, NL, FR");
    expect(entity.sfdr.governance.tax_compliance.jurisdictions_used).toEqual([
      "DE",
      "NL",
      "FR",
    ]);
    expect(taxDomain).toBe("Pass");
    expect(c2.verdict).toBe("aligned");
  });

  it("an ISO code for a listed jurisdiction now trips the screen", async () => {
    const { entity, c2, taxDomain } = await scoreC2("DE, NL, RU");
    // The mechanism: translated into the engine's vocabulary on the way in.
    expect(entity.sfdr.governance.tax_compliance.jurisdictions_used).toContain(
      "Russian Federation",
    );
    // The consequence, which is the point of the fix. Before it, this record
    // was indistinguishable from the clean one above.
    expect(taxDomain).toBe("Fail");
    expect(c2.verdict).toBe("not_aligned");
  });

  it.each(["PA", "VU", "VN", "TC", "VI", "AS", "AI", "GU", "PW"])(
    "the ISO code %s also trips the screen",
    async (code) => {
      const { taxDomain } = await scoreC2(`DE, ${code}`);
      expect(taxDomain).toBe("Fail");
    },
  );

  it("a long-form name typed directly still trips the screen", async () => {
    const { taxDomain } = await scoreC2("DE, Russian Federation");
    expect(taxDomain).toBe("Fail");
  });
});
