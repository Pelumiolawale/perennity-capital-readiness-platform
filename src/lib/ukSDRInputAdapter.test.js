// @ts-check
//
// ukSDRInputAdapter tests — engagement UK SDR fields → engine
// ProjectUKSDRInputs.
//
// The adapter is the load-bearing seam between the Airtable Engagements
// mirror and the v3.5 engine input shape (ProjectUKSDRInputs). Tests lock
// the structural invariants: undefined when nothing populated; correct
// nesting at improvement_plan / impact_plan; defensive behaviour on
// malformed JSON.

import { describe, it, expect } from "vitest";
import { buildUKSDRInputs } from "./ukSDRInputAdapter.js";

describe("buildUKSDRInputs — empty / undefined inputs", () => {
  it("returns undefined when raw is undefined", () => {
    expect(buildUKSDRInputs(undefined)).toBeUndefined();
  });

  it("returns undefined when raw is null", () => {
    expect(buildUKSDRInputs(/** @type {any} */ (null))).toBeUndefined();
  });

  it("returns undefined when raw is an empty object", () => {
    expect(buildUKSDRInputs({})).toBeUndefined();
  });

  it("returns undefined when all UK SDR fields are absent", () => {
    expect(
      buildUKSDRInputs({
        // Other (non-UK-SDR) keys present on the engagement row — adapter
        // must ignore them and still return undefined when no uk_sdr_*
        // fields are populated.
        sfdr_si_objective: "Reduce emissions",
        project_id: "PB-123",
      }),
    ).toBeUndefined();
  });
});

describe("buildUKSDRInputs — single-field paths", () => {
  it("populates only sustainability_standard_claimed when only that field is set", () => {
    const result = buildUKSDRInputs({
      uk_sdr_standard_claimed: "eu_taxonomy_8_1",
    });
    expect(result).toEqual({
      sustainability_standard_claimed: "eu_taxonomy_8_1",
    });
    expect(result.kpi_reporting_commitment).toBeUndefined();
    expect(result.improvement_plan).toBeUndefined();
    expect(result.impact_plan).toBeUndefined();
  });

  it("populates kpi_reporting_commitment when only kpis_committed is set", () => {
    const result = buildUKSDRInputs({
      uk_sdr_kpis_committed: ["pue", "renewable_energy_pct"],
    });
    expect(result).toEqual({
      kpi_reporting_commitment: {
        kpis_committed: ["pue", "renewable_energy_pct"],
      },
    });
  });

  it("populates kpi_reporting_commitment when only reporting_frequency is set", () => {
    const result = buildUKSDRInputs({
      uk_sdr_reporting_frequency: "annual",
    });
    expect(result).toEqual({
      kpi_reporting_commitment: { reporting_frequency: "annual" },
    });
  });

  it("merges kpis_committed + reporting_frequency into one kpi_reporting_commitment", () => {
    const result = buildUKSDRInputs({
      uk_sdr_kpis_committed: ["pue", "ghg_emissions"],
      uk_sdr_reporting_frequency: "annual",
    });
    expect(result.kpi_reporting_commitment).toEqual({
      kpis_committed: ["pue", "ghg_emissions"],
      reporting_frequency: "annual",
    });
  });
});

describe("buildUKSDRInputs — improvement_plan JSON parsing", () => {
  it("parses valid JSON improvement plan", () => {
    const plan = {
      baseline_metrics: { pue_current: 1.4, renewable_pct_current: 60 },
      strategy: { timeline_years: 3, actions: ["a", "b", "c"] },
      targets: { pue_target: 1.2, renewable_pct_target: 80 },
    };
    const result = buildUKSDRInputs({
      uk_sdr_improvement_plan: JSON.stringify(plan),
    });
    expect(result.improvement_plan).toEqual(plan);
  });

  it("returns object without improvement_plan when JSON is malformed (does not throw)", () => {
    const result = buildUKSDRInputs({
      uk_sdr_standard_claimed: "eu_taxonomy_8_1",
      uk_sdr_improvement_plan: "{ this is not valid json",
    });
    expect(result).toEqual({
      sustainability_standard_claimed: "eu_taxonomy_8_1",
    });
    expect(result.improvement_plan).toBeUndefined();
  });

  it("returns undefined when only field is malformed JSON", () => {
    expect(
      buildUKSDRInputs({ uk_sdr_improvement_plan: "{ broken" }),
    ).toBeUndefined();
  });
});

describe("buildUKSDRInputs — impact_plan JSON parsing", () => {
  it("parses valid JSON impact plan", () => {
    const plan = {
      impact_objective: "Reduce Sub-Saharan DC emissions",
      objective_category: "environmental_climate_mitigation",
      declared_in: "investment_memorandum",
      theory_of_change: "Renewable PPAs displace grid emissions.",
      quantified_indicators: [
        { name: "Scope 1+2", baseline: 8000, target: 5000, unit: "tCO2e/yr" },
      ],
      additionality_evidence: "Counterfactual: no other DC in this market would build under PPA terms.",
      reporting_commitment: {
        annual_cadence: true,
        reports_against_indicators: true,
        outcome_level_reporting: true,
        verification_method: "third_party_audit",
      },
    };
    const result = buildUKSDRInputs({
      uk_sdr_impact_plan: JSON.stringify(plan),
    });
    expect(result.impact_plan).toEqual(plan);
  });

  it("returns object without impact_plan when JSON is malformed", () => {
    const result = buildUKSDRInputs({
      uk_sdr_standard_claimed: "eu_taxonomy_8_1",
      uk_sdr_impact_plan: "not json",
    });
    expect(result).toEqual({
      sustainability_standard_claimed: "eu_taxonomy_8_1",
    });
    expect(result.impact_plan).toBeUndefined();
  });
});

describe("buildUKSDRInputs — full happy path", () => {
  it("builds the complete ProjectUKSDRInputs shape from all four populated fields", () => {
    const improvement = {
      baseline_metrics: {
        pue_current: 1.45,
        renewable_pct_current: 55,
        ghg_current: 8500,
        wue_current: 0.55,
      },
      strategy: {
        timeline_years: 3,
        actions: [
          "Switch to renewable PPAs for 100% of grid demand",
          "Deploy liquid cooling on next refresh cycle",
          "Site-level water recycling at 50% target",
        ],
        verification_method: "third_party_audit",
      },
      targets: {
        pue_target: 1.25,
        renewable_pct_target: 90,
        ghg_reduction_pct: 40,
        wue_target: 0.4,
      },
    };
    const impact = {
      impact_objective: "50% Scope 1+2 reduction across MENA DC footprint",
      objective_category: "environmental_climate_mitigation",
      declared_in: "Investment memorandum dated 2026-03-15",
      theory_of_change:
        "Renewable PPAs + efficient cooling displace grid emissions; absent this financing, project would not meet the climate-mitigation threshold for fund inclusion.",
      quantified_indicators: [
        { name: "Scope 1+2 emissions", baseline: 8500, target: 4250, unit: "tCO2e/yr" },
        { name: "PUE", baseline: 1.45, target: 1.25, unit: "ratio" },
        { name: "Renewable %", baseline: 55, target: 90, unit: "%" },
      ],
      additionality_evidence:
        "This project enables a step-change in regional DC carbon intensity. Counterfactual analysis (see IM Annex C) shows no comparable PPA-anchored DC would have been built absent sustainability-linked capital structure tying coupon to PUE achievement.",
      reporting_commitment: {
        annual_cadence: true,
        reports_against_indicators: true,
        outcome_level_reporting: true,
        verification_method: "third_party_audit",
      },
    };
    const result = buildUKSDRInputs({
      uk_sdr_standard_claimed: "eu_taxonomy_8_1",
      uk_sdr_kpis_committed: ["pue", "renewable_energy_pct", "ghg_emissions", "wue"],
      uk_sdr_reporting_frequency: "annual",
      uk_sdr_improvement_plan: JSON.stringify(improvement),
      uk_sdr_impact_plan: JSON.stringify(impact),
    });

    expect(result).toEqual({
      sustainability_standard_claimed: "eu_taxonomy_8_1",
      kpi_reporting_commitment: {
        kpis_committed: ["pue", "renewable_energy_pct", "ghg_emissions", "wue"],
        reporting_frequency: "annual",
      },
      improvement_plan: improvement,
      impact_plan: impact,
    });
  });
});

describe("buildUKSDRInputs — defensive shape handling", () => {
  it("ignores non-array kpis_committed (treats as undefined)", () => {
    const result = buildUKSDRInputs({
      uk_sdr_kpis_committed: /** @type {any} */ ("pue,renewable"),
      uk_sdr_reporting_frequency: "annual",
    });
    expect(result.kpi_reporting_commitment).toEqual({
      reporting_frequency: "annual",
    });
    expect(result.kpi_reporting_commitment.kpis_committed).toBeUndefined();
  });

  it("ignores non-string JSON blob fields (defensive)", () => {
    const result = buildUKSDRInputs({
      uk_sdr_standard_claimed: "eu_taxonomy_8_1",
      uk_sdr_improvement_plan: /** @type {any} */ ({ already: "an object" }),
    });
    expect(result).toEqual({
      sustainability_standard_claimed: "eu_taxonomy_8_1",
    });
  });
});
