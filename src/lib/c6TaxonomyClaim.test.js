// @ts-check
//
// ITEM-05 — the c6 Taxonomy claim no longer invents the details it is missing.
//
// The tick (`c6 Taxonomy Claim Made`) used to be enough on its own: a blank
// claimed percentage became 0, a blank methodology became "capex", and a blank
// publication date became today. The date was the damaging one — art8_c6
// requires daysSince(published_date) <= 365 to reach aligned, so a claim with
// no publication date on record passed the recency test automatically, every
// day, forever.
//
// The test that matters is the last one in the first block: the same record,
// otherwise complete, must NOT be able to reach `aligned` on an invented date.

import { describe, it, expect } from "vitest";
import { DeterministicEngine, METHODOLOGY_VERSION } from "@perennity/engine";
import { frameworksForLabel } from "./engineClient.js";
import {
  buildSFDRInputs,
  c6ClaimIncompleteWarning,
  c6ClaimIsQuantified,
} from "./sfdrInputAdapter.js";

/**
 * An engagement whose EU Taxonomy 8.1 evidence is strong enough for the
 * cross-framework corroboration c6 depends on, so the only thing moving
 * between cases is the claim itself.
 */
function engagementWithClaim(claimFields) {
  return {
    run_id: "22222222-2222-4222-8222-222222222222",
    c6_taxonomy_claim_made: true,
    c6_minimum_safeguards_attestation: true,
    c6_breakdown_climate_mitigation_pct: 60,
    c6_breakdown_water_pct: 40,
    ...claimFields,
  };
}

// An Activity 8.1 input that scores a clean pass at 100. c6 corroborates its
// claim against the EU Taxonomy result, and can only reach `aligned` when that
// result is itself aligned — so without this, every "cannot reach aligned"
// assertion below would pass for the wrong reason.
const PASSING_EU_TAX_DATA_POINTS = {
  ecocc_practices_implemented: [
    "cooling_efficiency",
    "server_utilisation",
    "monitoring_and_reporting",
  ],
  last_independent_audit_date: "2026-06-01",
  annualised_pue: 1.15,
  pue_actual: 1.15,
  country_code: "DE",
  climate_risk_assessment_completed: true,
  climate_risk_assessment_methodology:
    "TCFD-aligned scenario analysis (RCP 4.5 / 8.5)",
  wue_annualised: 0.18,
  site_water_stress_classification: "low",
  pue_measurement_methodology_declared: "EN_50600_4_2",
  pue_measurement_category: "category_3",
  pue_measurement_boundary_documented: true,
  pue_reporting_basis: "annualised",
  human_rights_compliance_items: [
    "human_rights_policy_published",
    "due_diligence_process_operational",
    "grievance_mechanism_operational",
    "ilo_core_conventions_compliance",
    "no_ungc_violations_24m",
  ],
  bribery_corruption_compliance_items: [
    "anti_bribery_policy_published",
    "anti_bribery_training_programme",
    "no_bribery_convictions_24m",
  ],
  taxation_compliance_items: [
    "tax_governance_policy_published",
    "no_tax_evasion_findings_24m",
    "country_by_country_reporting_or_below_threshold",
  ],
  fair_competition_compliance_items: [
    "competition_policy_published",
    "no_competition_law_breaches_24m",
  ],
  circular_economy_compliance_items: [
    "ecodesign_2009_125",
    "rohs_2011_65",
    "waste_management_plan",
    "weee_endoflife_2012_19",
  ],
};

async function scoreC6(claimFields) {
  const engagement = engagementWithClaim(claimFields);
  const sfdr = buildSFDRInputs(engagement);
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
      build_completion_year: 2022,
      data_points: PASSING_EU_TAX_DATA_POINTS,
      evidence_documents: [
        {
          document_id: "audit-2026-06",
          document_type: "independent_audit",
          uri: "https://evidence.test/audit-2026-06.pdf",
          uploaded_at: "2026-06-15T00:00:00Z",
          sha256: "0".repeat(64),
        },
      ],
      ...(sfdr ? { sfdr } : {}),
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
  const euTax = (run.framework_results ?? []).find(
    (fw) => fw.activity_id === "eu_tax_climate_8_1",
  );
  const c6 = results.find((c) => String(c.criterion_id).includes("taxonomy"));
  if (!c6) {
    throw new Error(
      `No c6 criterion. Saw: ${results.map((c) => c.criterion_id).join(", ")}`,
    );
  }
  return { sfdr, c6, euTax };
}

describe("c6 never invents the claim's details (item 5)", () => {
  it("the base input really does score a clean EU Taxonomy pass", async () => {
    // Without this, "cannot reach aligned" below would be vacuous.
    const { euTax } = await scoreC6({
      c6_claimed_percentage: 40,
      c6_published_date: "2026-09-01",
    });
    expect(euTax.overall_verdict).toBe("pass");
    expect(euTax.indicative_score).toBe(100);
  });

  it("a recent, quantified claim DOES reach aligned", async () => {
    const { c6 } = await scoreC6({
      c6_claimed_percentage: 40,
      c6_methodology: "capex",
      c6_published_date: "2026-09-01",
    });
    expect(c6.verdict).toBe("aligned");
  });

  it("a blank publication date is not today", async () => {
    const { sfdr } = await scoreC6({ c6_claimed_percentage: 40 });
    expect("published_date" in sfdr.taxonomy_claim).toBe(false);
  });

  it("a blank methodology is not asserted as capex", async () => {
    const { sfdr } = await scoreC6({ c6_claimed_percentage: 40 });
    expect("methodology" in sfdr.taxonomy_claim).toBe(false);
  });

  it("real values are passed through untouched", async () => {
    const { sfdr } = await scoreC6({
      c6_claimed_percentage: 60,
      c6_methodology: "opex",
      c6_published_date: "2026-04-13",
    });
    expect(sfdr.taxonomy_claim).toMatchObject({
      claimed_percentage: 60,
      methodology: "opex",
      published_date: "2026-04-13",
      minimum_safeguards_attestation: true,
    });
  });

  it("an explicit 0% claim is still a 0% claim", async () => {
    const { sfdr } = await scoreC6({
      c6_claimed_percentage: 0,
      c6_published_date: "2026-04-13",
    });
    expect(sfdr.taxonomy_claim.claimed_percentage).toBe(0);
  });

  // The point of the whole item.
  it("a claim with no publication date can no longer reach aligned", async () => {
    const { c6 } = await scoreC6({ c6_claimed_percentage: 40 });
    expect(c6.verdict).not.toBe("aligned");
  });

  it("a stale publication date still cannot reach aligned", async () => {
    const { c6 } = await scoreC6({
      c6_claimed_percentage: 40,
      c6_published_date: "2019-01-01",
    });
    expect(c6.verdict).not.toBe("aligned");
  });
});

describe("a ticked but unquantified claim is held back, not guessed", () => {
  it("no claim object is sent to the engine", async () => {
    const { sfdr } = await scoreC6({});
    expect(sfdr?.taxonomy_claim).toBeUndefined();
  });

  it("nothing non-schema is smuggled into the engine's input", async () => {
    const { sfdr } = await scoreC6({});
    for (const key of Object.keys(sfdr ?? {})) {
      expect(key).not.toMatch(/warning/i);
    }
  });

  // The engine copies rationale_text into band_rationale and reportPDF prints
  // it verbatim. Leaving claimed_percentage out would put "undefined%" and
  // "NaNpp" in a paying client's document — so this asserts on the text.
  it("no NaN or undefined reaches the client-facing rationale", async () => {
    const { c6 } = await scoreC6({});
    const text = `${c6.rationale_text ?? ""} ${c6.gap_summary ?? ""}`;
    expect(text).not.toMatch(/undefined/);
    expect(text).not.toMatch(/NaN/);
  });

  it("the operator gets a banner telling them which cell to fill", () => {
    const warning = c6ClaimIncompleteWarning(engagementWithClaim({}));
    expect(warning).toMatch(/c6 Claimed Percentage/);
    expect(warning).toMatch(/re-issue/);
  });

  it("no banner once the claim is quantified", () => {
    const e = engagementWithClaim({ c6_claimed_percentage: 40 });
    expect(c6ClaimIsQuantified(e)).toBe(true);
    expect(c6ClaimIncompleteWarning(e)).toBeNull();
  });

  it("no banner when no claim is made at all", () => {
    expect(c6ClaimIncompleteWarning({ c6_taxonomy_claim_made: false })).toBeNull();
    expect(c6ClaimIncompleteWarning({})).toBeNull();
  });

  it("an explicit 0% claim counts as quantified", () => {
    expect(c6ClaimIsQuantified({ c6_claimed_percentage: 0 })).toBe(true);
    expect(
      c6ClaimIncompleteWarning(engagementWithClaim({ c6_claimed_percentage: 0 })),
    ).toBeNull();
  });
});
