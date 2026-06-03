// @ts-check
/** @typedef {import('@perennity/engine').ProjectInput} ProjectInput */
import { useState, useEffect } from "react";
import { saveDraft, loadDraft } from "../hooks/useAssessmentStore";
import {
  TARGET_LABEL_OPTIONS,
  DEFAULT_TARGET_LABEL,
} from "../lib/targetLabels.js";
import { SFDRPAITable, emptyPAIRows } from "./SFDRPAITable.jsx";

// v3.2 safeguards canonical item identifiers. Must match the engine's
// EXPECTED_*_ITEMS arrays at src/logic/safeguards_*.ts in the engine repo
// (Perennity_Bridge_V2). Bump in lockstep with engine v3.x changes.
const HUMAN_RIGHTS_ITEMS = [
  { id: "human_rights_policy_published", label: "Published human rights policy" },
  { id: "due_diligence_process_operational", label: "Operational due diligence process" },
  { id: "grievance_mechanism_operational", label: "Operational grievance mechanism" },
  { id: "ilo_core_conventions_compliance", label: "Compliance with ILO core conventions" },
  { id: "no_ungc_violations_24m", label: "No UN Global Compact violations in past 24 months" },
];
const BRIBERY_CORRUPTION_ITEMS = [
  { id: "anti_bribery_policy_published", label: "Published anti-bribery policy" },
  { id: "anti_bribery_training_programme", label: "Operational anti-bribery training programme" },
  { id: "no_bribery_convictions_24m", label: "No bribery convictions in past 24 months" },
];
const TAXATION_ITEMS = [
  { id: "tax_governance_policy_published", label: "Published tax governance policy" },
  { id: "no_tax_evasion_findings_24m", label: "No tax evasion findings in past 24 months" },
  { id: "country_by_country_reporting_or_below_threshold", label: "Active country-by-country reporting (or attestation of being below threshold)" },
];
const FAIR_COMPETITION_ITEMS = [
  { id: "competition_policy_published", label: "Published competition policy" },
  { id: "no_competition_law_breaches_24m", label: "No competition law breaches in past 24 months" },
];

// SCOPE NOTE: This wizard collects inputs for EU Taxonomy, SFDR (Art 8/9),
// and UK SDR scoring. Framework-specific branching is driven by the
// target_label dropdown. EU GBS and ICMA GBP are engine-side and not yet
// surfaced in this intake.
//
// Inputs we don't yet collect (and the engine handles gracefully with
// "data_missing" verdicts) are flagged below.

/** @type {ProjectInput} */
const HARDCODED_FIXTURE = {
  project_id: "PB-FX-001",
  intake_timestamp: "2026-05-01T09:30:00Z",
  facility_type: "hyperscale",
  jurisdiction: "DE",
  facility_status: "operational",
  build_completion_year: 2020,
  data_points: {
    ecocc_practices_implemented: [
      "airflow_management",
      "free_cooling",
      "heat_reuse",
      "high_efficiency_ups",
    ],
    last_independent_audit_date: "doc-audit-frankfurt-2024",
    annualised_pue: 1.32,
    climate_risk_assessment_completed: true,
    climate_risk_assessment_methodology:
      "TCFD-aligned scenario analysis using IPCC AR6 RCP 8.5",
    site_water_stress_classification: "Low",
    wue_annualised: 0.25,
  },
  evidence_documents: [
    {
      document_id: "doc-audit-frankfurt-2024",
      document_type: "independent_audit",
      uri: "https://evidence.test/audit-frankfurt-2024.pdf",
      uploaded_at: "2024-06-15T00:00:00Z",
      sha256: "1111111111111111111111111111111111111111111111111111111111111111",
    },
  ],
};

/**
 * @param {{ onSubmit: (input: ProjectInput) => void }} props
 */
export function IntakeWizard({ onSubmit }) {
  const [form, setForm] = useState({
    target_label: DEFAULT_TARGET_LABEL,
    project_id: "",
    facility_type: "hyperscale",
    jurisdiction: "DE",
    facility_status: "operational",
    build_completion_year: 2020,
    annualised_pue: 1.4,
    wue_annualised: 0.3,
    site_water_stress_classification: "Low",
    climate_risk_assessment_completed: false,
    climate_risk_assessment_methodology: "",
    pue_measurement_compliance_attested: false,
    human_rights_compliance_items: HUMAN_RIGHTS_ITEMS.map((i) => i.id),
    bribery_corruption_compliance_items: BRIBERY_CORRUPTION_ITEMS.map((i) => i.id),
    taxation_compliance_items: TAXATION_ITEMS.map((i) => i.id),
    fair_competition_compliance_items: FAIR_COMPETITION_ITEMS.map((i) => i.id),
    // v0.5.0-alpha.8 (Phase 1, commit 1.5a Phase B-2): SFDR Specifics
    // section. Rendered conditionally based on target_label. The free
    // Snapshot path's runSnapshot() ignores these fields; the paid
    // flow's SFDR pickup happens via Airtable mirror columns Dolapo
    // populates separately.
    sfdr_si_objective: "",
    sfdr_si_objective_category: "Environmental",
    sfdr_dominance_named_in_im: false,
    sfdr_dominance_economic_depends: false,
    sfdr_dominance_marketing_leads: false,
    sfdr_es_characteristic: "",
    sfdr_pai_rows: emptyPAIRows(),
    sfdr_assurance_tier: "limited_big4",
    // v0.6.0 (UK SDR Phase 2): flat form keys; ukSDRInputAdapter assembles
    // them into ProjectUKSDRInputs. Always-shown for any uk_sdr_* label;
    // sub-section visibility for improvers/impact is conditioned in JSX.
    uk_sdr_standard_claimed: "eu_taxonomy_8_1",
    uk_sdr_kpis_pue: true,
    uk_sdr_kpis_renewable: true,
    uk_sdr_kpis_ghg: true,
    uk_sdr_kpis_wue: true,
    uk_sdr_reporting_frequency: "annual",
    // Improvers — baseline + strategy + targets
    uk_sdr_baseline_pue: "",
    uk_sdr_baseline_renewable_pct: "",
    uk_sdr_baseline_ghg: "",
    uk_sdr_baseline_wue: "",
    uk_sdr_strategy_timeline_years: "3",
    uk_sdr_strategy_actions: "",
    uk_sdr_strategy_verification: "third_party_audit",
    uk_sdr_target_pue: "",
    uk_sdr_target_renewable_pct: "",
    uk_sdr_target_ghg_reduction_pct: "",
    uk_sdr_target_wue: "",
    // Impact — objective + theory of change + additionality + reporting
    uk_sdr_impact_objective: "",
    uk_sdr_impact_objective_category: "environmental_climate_mitigation",
    uk_sdr_impact_declared_in: "",
    uk_sdr_impact_theory_of_change: "",
    uk_sdr_impact_indicators: "",
    uk_sdr_impact_additionality: "",
    uk_sdr_impact_annual_cadence: true,
    uk_sdr_impact_reports_against_indicators: true,
    uk_sdr_impact_outcome_level: true,
    uk_sdr_impact_verification: "third_party_audit",
  });

  const showSFDRSection =
    form.target_label === "sfdr_article_8" || form.target_label === "sfdr_article_9";
  const showUKSDRSection =
    form.target_label === "uk_sdr_focus" ||
    form.target_label === "uk_sdr_improvers" ||
    form.target_label === "uk_sdr_impact";
  const showUKSDRImproversBlock = form.target_label === "uk_sdr_improvers";
  const showUKSDRImpactBlock = form.target_label === "uk_sdr_impact";

  useEffect(() => {
    const draft = loadDraft();
    if (draft?.wizardData) {
      // Merge saved draft OVER current defaults instead of replacing the
      // whole state. Any field present in the draft overrides the default;
      // any field missing from the draft (e.g. SFDR Specifics fields added
      // in 1.5a Phase B-2 for a user with an older saved draft) keeps its
      // default value. Forward-compatible — protects every future addition
      // of new wizard fields from this same regression.
      setForm((current) => ({ ...current, ...draft.wizardData }));
    }
  }, []);

  useEffect(() => {
    saveDraft(form);
  }, [form]);

  const update = (k) => (e) => {
    const v =
      e.target.type === "checkbox"
        ? e.target.checked
        : e.target.type === "number"
        ? Number(e.target.value)
        : e.target.value;
    setForm((s) => ({ ...s, [k]: v }));
  };

  const toggleItem = (key, id) => () => {
    setForm((s) => {
      const arr = s[key];
      return {
        ...s,
        [key]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id],
      };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data_points = {
      annualised_pue: form.annualised_pue,
      wue_annualised: form.wue_annualised,
      site_water_stress_classification: form.site_water_stress_classification,
      climate_risk_assessment_completed: form.climate_risk_assessment_completed,
      climate_risk_assessment_methodology:
        form.climate_risk_assessment_methodology,
      // Day 3 not yet collected — engine returns "data_missing" for these.
      ecocc_practices_implemented: [],
      human_rights_compliance_items: form.human_rights_compliance_items,
      bribery_corruption_compliance_items: form.bribery_corruption_compliance_items,
      taxation_compliance_items: form.taxation_compliance_items,
      fair_competition_compliance_items: form.fair_competition_compliance_items,
    };

    // PUE measurement: only populate keys when attested. Unchecked = no claim =
    // data_missing (the engine's correct verdict; we don't fabricate failure).
    if (form.pue_measurement_compliance_attested) {
      data_points.pue_measurement_methodology_declared = "EN_50600_4_2";
      data_points.pue_measurement_category = "category_2";
      data_points.pue_measurement_boundary_documented = true;
      data_points.pue_reporting_basis = "annualised";
    }

    /** @type {ProjectInput & { target_label?: string }} */
    const input = {
      project_id: form.project_id || "PB-NEW-001",
      intake_timestamp: new Date().toISOString(),
      facility_type: form.facility_type,
      jurisdiction: form.jurisdiction,
      facility_status: form.facility_status,
      build_completion_year: form.build_completion_year,
      data_points,
      evidence_documents: [],
      // v0.6.0: surface target_label so runSnapshot's frameworksForLabel()
      // can route SFDR / UK SDR engagements to the right framework set.
      // Without this, runSnapshot falls back to BUNDLED_ACTIVITIES (EU Tax
      // 8.1 only) regardless of the wizard's framework dropdown.
      target_label: form.target_label,
    };
    onSubmit(input);
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="mx-auto max-w-[780px] px-6 py-12 text-[#0B1F2A]">
        <header className="mb-12">
          <p className="font-['Source_Sans_3'] text-[12px] leading-[16px] font-medium uppercase tracking-[0.08em] text-[#4A5760] mb-3">
            Perennity Bridge
          </p>
          <h1 className="font-['Source_Sans_3'] text-[32px] leading-[40px] font-semibold tracking-tight text-[#0B1F2A] mb-3">
            Capital Alignment Snapshot
          </h1>
          <p className="font-['Source_Serif_4'] text-[16px] leading-[24px] text-[#4A5760]">
            Project inputs for a deterministic readiness assessment against EU Taxonomy, SFDR, and UK SDR criteria.
          </p>
        </header>

        <form onSubmit={handleSubmit}>
          <section className="mb-8 border border-[#D8DCDF] rounded-[6px] bg-white">
            <div className="px-8 py-7">
              <h2 className="font-['Source_Sans_3'] text-[18px] leading-[24px] font-semibold text-[#0B1F2A] mb-2">
                Project basics
              </h2>
              <p className="font-['Source_Serif_4'] text-[14px] leading-[20px] text-[#4A5760] mb-6">
                Framework selection drives downstream scoring. Operational and water metrics inform the DNSH assessment.
              </p>
              <Field
          label="Target framework"
          helper="Select the regulatory framework this project will be assessed against. Drives which criteria are scored and which sections appear in the final Report."
        >
          <select
            value={form.target_label}
            onChange={update("target_label")}
            className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]"
            data-testid="target-label-select"
          >
            {TARGET_LABEL_OPTIONS.filter((o) => o.enabled).map((o) => (
              <option key={o.value} value={o.value}>
                {o.display}
              </option>
            ))}
            <option disabled value="__separator__">
              ──────────
            </option>
            {TARGET_LABEL_OPTIONS.filter((o) => !o.enabled).map((o) => (
              <option key={o.value} value={o.value} disabled>
                {o.display} — Coming soon
              </option>
            ))}
          </select>
        </Field>

        {showSFDRSection && (
          <section
            className="border-t border-[#D8DCDF] pt-8 mt-8 space-y-4"
            data-testid="sfdr-specifics-section"
          >
            <h2 className="text-base font-semibold text-[#0B1F2A]">
              SFDR Specifics
            </h2>
            <p className="text-xs text-[#4A5760] leading-relaxed">
              Additional inputs collected when the target framework is SFDR Article 8 or 9. These inputs are captured here but are not scored in the free Snapshot — they support the signed Sustainability Readiness Report.
            </p>
            <Field
              label="Sustainable investment objective"
              helper={'The named environmental or social objective this project pursues. Example: "Reduction of operational GHG emissions through renewable-energy-matched data centre infrastructure."'}
            >
              <textarea
                value={form.sfdr_si_objective}
                onChange={update("sfdr_si_objective")}
                maxLength={200}
                rows={3}
                className="w-full px-3 py-2 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] placeholder:text-[#8A949B] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A] resize-vertical"
              />
            </Field>
            <Field label="SI objective category">
              <select
                value={form.sfdr_si_objective_category}
                onChange={update("sfdr_si_objective_category")}
                className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]"
              >
                <option value="Environmental">Environmental</option>
                <option value="Social">Social</option>
                <option value="Mixed">Mixed (environmental + social)</option>
              </select>
            </Field>
            <Field
              label="Dominance test (Article 9 load-bearing requirement)"
              helper="Check all that apply. All three must be true for the SI objective to satisfy the v3.5 dominance test under SFDR Article 9 (would the project exist absent the SI objective?)."
            >
              <div className="space-y-1">
                <label className="flex items-start gap-3 py-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.sfdr_dominance_named_in_im}
                    onChange={update("sfdr_dominance_named_in_im")}
                    className="mt-0.5 w-4 h-4 rounded-[2px] border border-[#D8DCDF] bg-[#F8F6F2] checked:bg-[#0B1F2A] checked:border-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-1 cursor-pointer appearance-none relative checked:after:content-['✓'] checked:after:text-[#F8F6F2] checked:after:text-[11px] checked:after:absolute checked:after:top-[-2px] checked:after:left-[2px]"
                  />
                  <span className="font-['Source_Serif_4'] text-[14px] leading-[20px] text-[#1A2329]">
                    Named in investment memorandum as the deal thesis
                  </span>
                </label>
                <label className="flex items-start gap-3 py-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.sfdr_dominance_economic_depends}
                    onChange={update("sfdr_dominance_economic_depends")}
                    className="mt-0.5 w-4 h-4 rounded-[2px] border border-[#D8DCDF] bg-[#F8F6F2] checked:bg-[#0B1F2A] checked:border-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-1 cursor-pointer appearance-none relative checked:after:content-['✓'] checked:after:text-[#F8F6F2] checked:after:text-[11px] checked:after:absolute checked:after:top-[-2px] checked:after:left-[2px]"
                  />
                  <span className="font-['Source_Serif_4'] text-[14px] leading-[20px] text-[#1A2329]">
                    Project economics materially depend on the SI contribution
                  </span>
                </label>
                <label className="flex items-start gap-3 py-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.sfdr_dominance_marketing_leads}
                    onChange={update("sfdr_dominance_marketing_leads")}
                    className="mt-0.5 w-4 h-4 rounded-[2px] border border-[#D8DCDF] bg-[#F8F6F2] checked:bg-[#0B1F2A] checked:border-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-1 cursor-pointer appearance-none relative checked:after:content-['✓'] checked:after:text-[#F8F6F2] checked:after:text-[11px] checked:after:absolute checked:after:top-[-2px] checked:after:left-[2px]"
                  />
                  <span className="font-['Source_Serif_4'] text-[14px] leading-[20px] text-[#1A2329]">
                    Marketing / disclosure leads with the SI objective
                  </span>
                </label>
              </div>
            </Field>
            <Field
              label="Environmental or social characteristic promoted"
              helper={'Required for SFDR Article 8 compliance. Example: "Operational energy efficiency at PUE ≤1.2."'}
            >
              <textarea
                value={form.sfdr_es_characteristic}
                onChange={update("sfdr_es_characteristic")}
                maxLength={200}
                rows={3}
                className="w-full px-3 py-2 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] placeholder:text-[#8A949B] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A] resize-vertical"
              />
            </Field>
            <Field
              label="Principal Adverse Impact data provision"
              helper="For each PAI indicator, supply value, unit, optional verifier, and assurance status. Skip rows you don't have data for (defaults to Unverified). PAI 4 is pre-marked not_applicable for data-centre projects."
            >
              <SFDRPAITable
                rows={form.sfdr_pai_rows}
                onChange={(rows) => setForm((s) => ({ ...s, sfdr_pai_rows: rows }))}
              />
            </Field>
            <Field
              label="Overall assurance tier for project ESG disclosures"
              helper="The highest assurance tier applied to the ESG data being disclosed for this project. Drives SFDR criterion 9 and 10 verification scoring."
            >
              <select
                value={form.sfdr_assurance_tier}
                onChange={update("sfdr_assurance_tier")}
                className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]"
              >
                <option value="reasonable_big4">Reasonable assurance, Big 4</option>
                <option value="limited_big4">Limited assurance, Big 4</option>
                <option value="limited_partial">Limited assurance, other / partial scope</option>
                <option value="management_only">Management-only attestation</option>
              </select>
            </Field>
          </section>
        )}

        {showUKSDRSection && (
          <section
            className="border-t border-[#D8DCDF] pt-8 mt-8 space-y-4"
            data-testid="uk-sdr-specifics-section"
          >
            <h2 className="text-base font-semibold text-[#0B1F2A]">
              UK SDR Specifics
            </h2>
            <p className="text-xs text-[#4A5760] leading-relaxed">
              Additional inputs collected when the target framework is UK SDR Sustainability Focus, Improvers, or Impact. These inputs are captured here but are not scored in the free Snapshot — they support the signed Sustainability Readiness Report.
            </p>
            <Field
              label="Sustainability standard claimed"
              helper="Per PB methodology v3.5, EU Taxonomy 8.1 is the preferred credible standard for data centres. LEED Platinum (with Energy & Atmosphere prerequisites met) is also recognised; SBTi gives partial standing for Focus but is suitable for Improvers / Impact."
            >
              <select
                value={form.uk_sdr_standard_claimed}
                onChange={update("uk_sdr_standard_claimed")}
                className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]"
              >
                <option value="eu_taxonomy_8_1">EU Taxonomy Activity 8.1</option>
                <option value="leed_platinum">LEED Platinum (E&A prerequisites met)</option>
                <option value="sbti">SBTi validation</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field
              label="KPIs committed to annual disclosure"
              helper="PB methodology v3.5 requires PUE, renewable energy %, GHG Scope 1+2, and WUE for the Sustainability Focus label. All four are pre-checked; untick any the developer does not commit to reporting annually."
            >
              <div className="space-y-1">
                {[
                  { key: "uk_sdr_kpis_pue", label: "PUE (Power Usage Effectiveness)" },
                  { key: "uk_sdr_kpis_renewable", label: "Renewable energy procurement %" },
                  { key: "uk_sdr_kpis_ghg", label: "GHG emissions (Scope 1+2)" },
                  { key: "uk_sdr_kpis_wue", label: "WUE (Water Usage Effectiveness)" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-start gap-3 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form[key]}
                      onChange={update(key)}
                      className="mt-0.5 w-4 h-4 rounded-[2px] border border-[#D8DCDF] bg-[#F8F6F2] checked:bg-[#0B1F2A] checked:border-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-1 cursor-pointer appearance-none relative checked:after:content-['✓'] checked:after:text-[#F8F6F2] checked:after:text-[11px] checked:after:absolute checked:after:top-[-2px] checked:after:left-[2px]"
                    />
                    <span className="font-['Source_Serif_4'] text-[14px] leading-[20px] text-[#1A2329]">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Reporting frequency">
              <select
                value={form.uk_sdr_reporting_frequency}
                onChange={update("uk_sdr_reporting_frequency")}
                className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]"
              >
                <option value="annual">Annual</option>
                <option value="semi_annual">Semi-annual</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </Field>

            {showUKSDRImproversBlock && (
              <div className="space-y-4 border-l-2 border-[#D8DCDF] pl-4 mt-4">
                <h3 className="text-sm font-semibold text-[#0B1F2A]">Improvers — baseline, strategy, targets</h3>
                <Field label="Current PUE (baseline)">
                  <input type="number" step="0.01" value={form.uk_sdr_baseline_pue} onChange={update("uk_sdr_baseline_pue")} className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]" />
                </Field>
                <Field label="Current renewable energy % (baseline)">
                  <input type="number" step="1" value={form.uk_sdr_baseline_renewable_pct} onChange={update("uk_sdr_baseline_renewable_pct")} className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]" />
                </Field>
                <Field label="Current GHG emissions, Scope 1+2 (tonnes CO2e/year)">
                  <input type="number" step="1" value={form.uk_sdr_baseline_ghg} onChange={update("uk_sdr_baseline_ghg")} className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]" />
                </Field>
                <Field label="Current WUE (baseline)" helper="Optional. Required for water-stressed sites.">
                  <input type="number" step="0.01" value={form.uk_sdr_baseline_wue} onChange={update("uk_sdr_baseline_wue")} className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]" />
                </Field>
                <Field label="Improvement timeline (years)" helper="PB methodology v3.5 aligned tier expects ≤3 years; ≤5 acceptable with justification.">
                  <input type="number" min="1" max="10" value={form.uk_sdr_strategy_timeline_years} onChange={update("uk_sdr_strategy_timeline_years")} className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]" />
                </Field>
                <Field label="Improvement actions" helper="One action per line. PB methodology v3.5 aligned tier requires ≥3 specific actions.">
                  <textarea value={form.uk_sdr_strategy_actions} onChange={update("uk_sdr_strategy_actions")} rows={4} className="w-full px-3 py-2 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] placeholder:text-[#8A949B] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A] resize-vertical" />
                </Field>
                <Field label="Verification method for improvement reporting">
                  <select value={form.uk_sdr_strategy_verification} onChange={update("uk_sdr_strategy_verification")} className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]">
                    <option value="third_party_audit">Third-party audit</option>
                    <option value="internal">Internal only</option>
                    <option value="none">None stated</option>
                  </select>
                </Field>
                <Field label="Target PUE">
                  <input type="number" step="0.01" value={form.uk_sdr_target_pue} onChange={update("uk_sdr_target_pue")} className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]" />
                </Field>
                <Field label="Target renewable energy %">
                  <input type="number" step="1" value={form.uk_sdr_target_renewable_pct} onChange={update("uk_sdr_target_renewable_pct")} className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]" />
                </Field>
                <Field label="Target GHG reduction (%)">
                  <input type="number" step="1" value={form.uk_sdr_target_ghg_reduction_pct} onChange={update("uk_sdr_target_ghg_reduction_pct")} className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]" />
                </Field>
                <Field label="Target WUE" helper="Optional. Required for water-stressed sites.">
                  <input type="number" step="0.01" value={form.uk_sdr_target_wue} onChange={update("uk_sdr_target_wue")} className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]" />
                </Field>
              </div>
            )}

            {showUKSDRImpactBlock && (
              <div className="space-y-4 border-l-2 border-[#D8DCDF] pl-4 mt-4">
                <h3 className="text-sm font-semibold text-[#0B1F2A]">Impact — objective, theory of change, additionality, reporting</h3>
                <Field label="Impact objective" helper='The specific positive sustainability outcome the asset is intended to deliver. Example: "Reduce data-centre Scope 1+2 emissions by 50% in Sub-Saharan African markets."'>
                  <textarea value={form.uk_sdr_impact_objective} onChange={update("uk_sdr_impact_objective")} maxLength={400} rows={3} className="w-full px-3 py-2 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] placeholder:text-[#8A949B] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A] resize-vertical" />
                </Field>
                <Field label="Objective category" helper="Mapping to a recognised taxonomy of environmental / social outcomes (engine SIObjectiveCategory enum).">
                  <select value={form.uk_sdr_impact_objective_category} onChange={update("uk_sdr_impact_objective_category")} className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]">
                    <option value="environmental_climate_mitigation">Environmental — climate mitigation</option>
                    <option value="environmental_climate_adaptation">Environmental — climate adaptation</option>
                    <option value="environmental_water_marine">Environmental — water & marine</option>
                    <option value="environmental_circular_economy">Environmental — circular economy</option>
                    <option value="environmental_pollution_prevention">Environmental — pollution prevention</option>
                    <option value="environmental_biodiversity">Environmental — biodiversity</option>
                    <option value="social_decent_work">Social — decent work</option>
                    <option value="social_adequate_standards_of_living">Social — adequate standards of living</option>
                    <option value="social_inclusive_communities">Social — inclusive communities</option>
                    <option value="social_other_recognised">Social — other recognised</option>
                  </select>
                </Field>
                <Field label="Declared in" helper='Deal-defining documentation that names the objective. Example: "Investment memorandum dated 2026-03-15".'>
                  <input type="text" value={form.uk_sdr_impact_declared_in} onChange={update("uk_sdr_impact_declared_in")} className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] placeholder:text-[#8A949B] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]" />
                </Field>
                <Field label="Theory of change" helper="Causal chain from the asset's activities to the impact outcome. PB methodology v3.5 aligned tier requires a written ToC plus ≥3 quantified indicators below.">
                  <textarea value={form.uk_sdr_impact_theory_of_change} onChange={update("uk_sdr_impact_theory_of_change")} rows={4} className="w-full px-3 py-2 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] placeholder:text-[#8A949B] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A] resize-vertical" />
                </Field>
                <Field label="Quantified indicators (JSON)" helper='Array of {name, baseline, target, unit, source?}. Example: [{"name":"Scope 1+2","baseline":8000,"target":5000,"unit":"tCO2e/yr"}].'>
                  <textarea value={form.uk_sdr_impact_indicators} onChange={update("uk_sdr_impact_indicators")} rows={5} className="w-full px-3 py-2 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Sans_3'] text-[13px] text-[#0B1F2A] placeholder:text-[#8A949B] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A] resize-vertical" />
                </Field>
                <Field label="Additionality evidence" helper="Would this outcome have happened without this asset/financing? PB methodology v3.5 aligned tier requires substantive narrative (≥200 characters).">
                  <textarea value={form.uk_sdr_impact_additionality} onChange={update("uk_sdr_impact_additionality")} rows={4} className="w-full px-3 py-2 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] placeholder:text-[#8A949B] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A] resize-vertical" />
                </Field>
                <Field label="Impact reporting commitment" helper="PB methodology v3.5 aligned tier requires all four: annual cadence, reports against the quantified indicators, outcome-level (not activity-only), and stated verification.">
                  <div className="space-y-1">
                    {[
                      { key: "uk_sdr_impact_annual_cadence", label: "Annual cadence" },
                      { key: "uk_sdr_impact_reports_against_indicators", label: "Reports against quantified indicators" },
                      { key: "uk_sdr_impact_outcome_level", label: "Outcome-level reporting (not activity-only)" },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-start gap-3 py-1.5 cursor-pointer">
                        <input type="checkbox" checked={form[key]} onChange={update(key)} className="mt-0.5 w-4 h-4 rounded-[2px] border border-[#D8DCDF] bg-[#F8F6F2] checked:bg-[#0B1F2A] checked:border-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-1 cursor-pointer appearance-none relative checked:after:content-['✓'] checked:after:text-[#F8F6F2] checked:after:text-[11px] checked:after:absolute checked:after:top-[-2px] checked:after:left-[2px]" />
                        <span className="font-['Source_Serif_4'] text-[14px] leading-[20px] text-[#1A2329]">{label}</span>
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Impact reporting verification method">
                  <select value={form.uk_sdr_impact_verification} onChange={update("uk_sdr_impact_verification")} className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]">
                    <option value="third_party_audit">Third-party impact verification / assurance</option>
                    <option value="internal">Internal only</option>
                    <option value="none">None stated</option>
                  </select>
                </Field>
              </div>
            )}
          </section>
        )}

        <Field label="Project ID">
          <input
            type="text"
            value={form.project_id}
            onChange={update("project_id")}
            placeholder="PB-..."
            className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] placeholder:text-[#8A949B] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]"
          />
        </Field>
        <Field label="Facility type">
          <select
            value={form.facility_type}
            onChange={update("facility_type")}
            className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] placeholder:text-[#8A949B] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]"
          >
            <option value="hyperscale">Hyperscale</option>
            <option value="colocation">Colocation</option>
            <option value="edge">Edge</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </Field>
        <Field label="Jurisdiction (ISO 2-letter code)">
          <input
            type="text"
            value={form.jurisdiction}
            onChange={update("jurisdiction")}
            maxLength={2}
            className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] placeholder:text-[#8A949B] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]"
          />
        </Field>
        <Field label="Facility status">
          <select
            value={form.facility_status}
            onChange={update("facility_status")}
            className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] placeholder:text-[#8A949B] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]"
          >
            <option value="operational">Operational</option>
            <option value="construction">Construction</option>
            <option value="design">Design</option>
          </select>
        </Field>
        <Field label="Build completion year">
          <input
            type="number"
            value={form.build_completion_year}
            onChange={update("build_completion_year")}
            className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] placeholder:text-[#8A949B] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]"
          />
        </Field>
        <Field label="Annualised PUE">
          <input
            type="number"
            step="0.01"
            value={form.annualised_pue}
            onChange={update("annualised_pue")}
            className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] placeholder:text-[#8A949B] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]"
          />
        </Field>
        <Field label="Annualised WUE (litres / kWh)">
          <input
            type="number"
            step="0.01"
            value={form.wue_annualised}
            onChange={update("wue_annualised")}
            className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] placeholder:text-[#8A949B] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]"
          />
        </Field>
        <Field label="Site water-stress classification (WRI Aqueduct 4.0)">
          <select
            value={form.site_water_stress_classification}
            onChange={update("site_water_stress_classification")}
            className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] placeholder:text-[#8A949B] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]"
          >
            <option value="Low">Low</option>
            <option value="Low-Medium">Low-Medium</option>
            <option value="Medium-High">Medium-High</option>
            <option value="High">High</option>
            <option value="Extremely High">Extremely High</option>
          </select>
        </Field>
        <Field label="Climate-risk vulnerability assessment completed?">
          <label className="flex items-start gap-3 py-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.climate_risk_assessment_completed}
              onChange={update("climate_risk_assessment_completed")}
              className="mt-0.5 w-4 h-4 rounded-[2px] border border-[#D8DCDF] bg-[#F8F6F2] checked:bg-[#0B1F2A] checked:border-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-1 cursor-pointer appearance-none relative checked:after:content-['✓'] checked:after:text-[#F8F6F2] checked:after:text-[11px] checked:after:absolute checked:after:top-[-2px] checked:after:left-[2px]"
            />
            <span className="font-['Source_Serif_4'] text-[14px] leading-[20px] text-[#1A2329]">
              Yes — completed.
            </span>
          </label>
        </Field>
        <Field label="Climate-risk assessment methodology (free text)">
          <textarea
            rows={3}
            value={form.climate_risk_assessment_methodology}
            onChange={update("climate_risk_assessment_methodology")}
            className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-[#F8F6F2] font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] placeholder:text-[#8A949B] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-0 focus:border-[#0B1F2A]"
          />
        </Field>

            </div>
          </section>

          <section className="mb-8 border border-[#D8DCDF] rounded-[6px] bg-white">
            <div className="px-8 py-7">
              <h2 className="font-['Source_Sans_3'] text-[18px] leading-[24px] font-semibold text-[#0B1F2A] mb-2">
                PUE measurement compliance
              </h2>
              <p className="font-['Source_Serif_4'] text-[14px] leading-[20px] text-[#4A5760] mb-6">
                Single attestation for snapshot; the underlying methodology, category, boundary, and reporting basis are captured individually in the paid Project Readiness Report session.
              </p>
              <label className="flex items-start gap-3 py-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.pue_measurement_compliance_attested}
                  onChange={update("pue_measurement_compliance_attested")}
                  className="mt-0.5 w-4 h-4 rounded-[2px] border border-[#D8DCDF] bg-[#F8F6F2] checked:bg-[#0B1F2A] checked:border-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-1 cursor-pointer appearance-none relative checked:after:content-['✓'] checked:after:text-[#F8F6F2] checked:after:text-[11px] checked:after:absolute checked:after:top-[-2px] checked:after:left-[2px]"
                />
                <span className="font-['Source_Serif_4'] text-[14px] leading-[20px] text-[#1A2329]">
                  PUE measured per EN 50600-4-2, Category 2, with documented boundary and annualised reporting.
                </span>
              </label>
            </div>
          </section>

          <section className="mb-8 border border-[#D8DCDF] rounded-[6px] bg-white">
            <div className="px-8 py-7">
              <h2 className="font-['Source_Sans_3'] text-[18px] leading-[24px] font-semibold text-[#0B1F2A] mb-2">
                Minimum safeguards (Article 18)
              </h2>
              <p className="font-['Source_Serif_4'] text-[14px] leading-[20px] text-[#4A5760] mb-6">
                Pre-checked attestations. Un-tick any item that does not apply to your organisation. The snapshot heatmap renders the rollup verdict only; the paid Report surfaces each pillar individually.
              </p>

              <SafeguardsPillar
                title="Human rights"
                items={HUMAN_RIGHTS_ITEMS}
                selected={form.human_rights_compliance_items}
                onToggle={(id) => toggleItem("human_rights_compliance_items", id)}
              />
              <SafeguardsPillar
                title="Bribery & corruption"
                items={BRIBERY_CORRUPTION_ITEMS}
                selected={form.bribery_corruption_compliance_items}
                onToggle={(id) => toggleItem("bribery_corruption_compliance_items", id)}
              />
              <SafeguardsPillar
                title="Taxation"
                items={TAXATION_ITEMS}
                selected={form.taxation_compliance_items}
                onToggle={(id) => toggleItem("taxation_compliance_items", id)}
              />
              <SafeguardsPillar
                title="Fair competition"
                items={FAIR_COMPETITION_ITEMS}
                selected={form.fair_competition_compliance_items}
                onToggle={(id) => toggleItem("fair_competition_compliance_items", id)}
              />
            </div>
          </section>

          <div className="flex justify-end items-center mt-10 mb-6">
            <button
              type="submit"
              className="inline-flex items-center justify-center px-6 py-3 font-['Source_Sans_3'] text-[15px] leading-[22px] font-semibold text-[#F8F6F2] bg-[#0B1F2A] rounded-[6px] hover:bg-[#163040] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-2 transition-colors cursor-pointer"
            >
              Run Snapshot
            </button>
          </div>

          {/* Demoted developer-convenience affordance. The hardcoded fixture
              accelerates internal verification; surfaces as a small ink-faint
              text link below the form rather than the prominent teal panel
              the pre-1.4d wizard exposed above the fields. */}
          <p className="text-center mb-12">
            <button
              type="button"
              onClick={() => onSubmit(HARDCODED_FIXTURE)}
              className="font-['Source_Sans_3'] text-[12px] text-[#8A949B] underline underline-offset-4 hover:text-[#4A5760] cursor-pointer bg-transparent border-0"
            >
              Or run with the hyperscale_frankfurt fixture
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({ label, helper, children }) {
  return (
    <label className="block mb-5">
      <span className="block font-['Source_Sans_3'] text-[14px] leading-[20px] font-semibold text-[#0B1F2A] mb-1">
        {label}
      </span>
      {helper && (
        <span className="block font-['Source_Serif_4'] text-[13px] leading-[18px] text-[#4A5760] mb-2">
          {helper}
        </span>
      )}
      {children}
    </label>
  );
}

function SafeguardsPillar({ title, items, selected, onToggle }) {
  return (
    <div className="mb-6">
      <h3 className="font-['Source_Sans_3'] text-[12px] leading-[16px] font-semibold uppercase tracking-[0.06em] text-[#4A5760] mb-3">
        {title}
      </h3>
      <div className="space-y-1">
        {items.map((item) => (
          <label key={item.id} className="flex items-start gap-3 py-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={onToggle(item.id)}
              className="mt-0.5 w-4 h-4 rounded-[2px] border border-[#D8DCDF] bg-[#F8F6F2] checked:bg-[#0B1F2A] checked:border-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] focus:ring-offset-1 cursor-pointer appearance-none relative checked:after:content-['✓'] checked:after:text-[#F8F6F2] checked:after:text-[11px] checked:after:absolute checked:after:top-[-2px] checked:after:left-[2px]"
            />
            <span className="font-['Source_Serif_4'] text-[14px] leading-[20px] text-[#1A2329]">
              {item.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
