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
  });

  const showSFDRSection =
    form.target_label === "sfdr_article_8" || form.target_label === "sfdr_article_9";

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

    /** @type {ProjectInput} */
    const input = {
      project_id: form.project_id || "PB-NEW-001",
      intake_timestamp: new Date().toISOString(),
      facility_type: form.facility_type,
      jurisdiction: form.jurisdiction,
      facility_status: form.facility_status,
      build_completion_year: form.build_completion_year,
      data_points,
      evidence_documents: [],
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
