// @ts-check
/** @typedef {import('@perennity/engine').ProjectInput} ProjectInput */
import { useState, useEffect } from "react";
import { saveDraft, loadDraft } from "../hooks/useAssessmentStore";

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

// SCOPE NOTE: This wizard collects only the Activity 8.1-relevant inputs
// needed to drive the engine end-to-end. The broader intake scope (label-
// specific branching, multi-tab field set from the original prototype) will
// be re-evaluated and ported here when the Snapshot route grows past
// Activity 8.1 coverage.
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
  });

  useEffect(() => {
    const draft = loadDraft();
    if (draft?.wizardData) setForm(draft.wizardData);
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
    <div className="max-w-2xl mx-auto my-10 px-8 font-sans text-[#0B1F2A]">
      <h1 className="text-2xl font-bold mb-2">Capital Alignment Snapshot</h1>
      <p className="text-sm text-[#5C6B5C] mb-8">
        Activity 8.1 inputs. A broader intake field set will land as Snapshot coverage expands.
      </p>

      <div className="mb-6 p-4 bg-[rgba(78,205,164,0.08)] border border-[#4ECDA4] rounded">
        <p className="text-sm mb-2 font-semibold">Quick-test:</p>
        <button
          type="button"
          onClick={() => onSubmit(HARDCODED_FIXTURE)}
          className="bg-[#4ECDA4] text-[#0B1F2A] px-4 py-2 rounded text-sm font-semibold cursor-pointer"
        >
          Run engine with hyperscale_frankfurt fixture
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Project ID">
          <input
            type="text"
            value={form.project_id}
            onChange={update("project_id")}
            placeholder="PB-..."
            className="w-full px-3 py-2 border border-[#DDD5CA] rounded bg-white"
          />
        </Field>
        <Field label="Facility type">
          <select
            value={form.facility_type}
            onChange={update("facility_type")}
            className="w-full px-3 py-2 border border-[#DDD5CA] rounded bg-white"
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
            className="w-full px-3 py-2 border border-[#DDD5CA] rounded bg-white"
          />
        </Field>
        <Field label="Facility status">
          <select
            value={form.facility_status}
            onChange={update("facility_status")}
            className="w-full px-3 py-2 border border-[#DDD5CA] rounded bg-white"
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
            className="w-full px-3 py-2 border border-[#DDD5CA] rounded bg-white"
          />
        </Field>
        <Field label="Annualised PUE">
          <input
            type="number"
            step="0.01"
            value={form.annualised_pue}
            onChange={update("annualised_pue")}
            className="w-full px-3 py-2 border border-[#DDD5CA] rounded bg-white"
          />
        </Field>
        <Field label="Annualised WUE (litres / kWh)">
          <input
            type="number"
            step="0.01"
            value={form.wue_annualised}
            onChange={update("wue_annualised")}
            className="w-full px-3 py-2 border border-[#DDD5CA] rounded bg-white"
          />
        </Field>
        <Field label="Site water-stress classification (WRI Aqueduct 4.0)">
          <select
            value={form.site_water_stress_classification}
            onChange={update("site_water_stress_classification")}
            className="w-full px-3 py-2 border border-[#DDD5CA] rounded bg-white"
          >
            <option value="Low">Low</option>
            <option value="Low-Medium">Low-Medium</option>
            <option value="Medium-High">Medium-High</option>
            <option value="High">High</option>
            <option value="Extremely High">Extremely High</option>
          </select>
        </Field>
        <Field label="Climate-risk vulnerability assessment completed?">
          <input
            type="checkbox"
            checked={form.climate_risk_assessment_completed}
            onChange={update("climate_risk_assessment_completed")}
          />
        </Field>
        <Field label="Climate-risk assessment methodology (free text)">
          <textarea
            rows={3}
            value={form.climate_risk_assessment_methodology}
            onChange={update("climate_risk_assessment_methodology")}
            className="w-full px-3 py-2 border border-[#DDD5CA] rounded bg-white"
          />
        </Field>

        <div className="pt-4 mt-2 border-t border-[#DDD5CA]">
          <h2 className="text-lg font-semibold mb-1">PUE measurement compliance</h2>
          <p className="text-sm text-[#5C6B5C] mb-3">
            Single attestation for snapshot; the underlying methodology, category, boundary, and reporting basis are captured individually in the paid Project Readiness Report session.
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={form.pue_measurement_compliance_attested}
              onChange={update("pue_measurement_compliance_attested")}
              className="mt-1"
            />
            <span className="text-sm">
              PUE measured per EN 50600-4-2, Category 2, with documented boundary and annualised reporting.
            </span>
          </label>
        </div>

        <div className="pt-4 mt-2 border-t border-[#DDD5CA]">
          <h2 className="text-lg font-semibold mb-1">Minimum safeguards (Article 18)</h2>
          <p className="text-sm text-[#5C6B5C] mb-4">
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

        <button
          type="submit"
          className="bg-[#0B1F2A] text-[#F8F6F2] px-7 py-3 rounded text-base font-semibold cursor-pointer mt-4"
        >
          Run Snapshot
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-[#5C6B5C] mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function SafeguardsPillar({ title, items, selected, onToggle }) {
  return (
    <div className="mb-3 p-3 border border-[#DDD5CA] rounded bg-white">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="space-y-1.5">
        {items.map((item) => (
          <label key={item.id} className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={onToggle(item.id)}
              className="mt-1"
            />
            <span className="text-sm">{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
