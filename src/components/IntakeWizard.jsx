// @ts-check
/** @typedef {import('@perennity/engine').ProjectInput} ProjectInput */
import { useState } from "react";

// DAY 3 SCOPE NOTE: This wizard collects only the Activity 8.1-relevant
// inputs needed to drive the engine end-to-end. The full ~70-field legacy
// intake (LegacyAppShell, src/App.jsx) is preserved untouched at /. When the
// legacy is deleted on Day 4+, the broader intake scope (label-specific
// branching, multi-tab field set) will be re-evaluated and ported here.
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
  });

  const update = (k) => (e) => {
    const v =
      e.target.type === "checkbox"
        ? e.target.checked
        : e.target.type === "number"
        ? Number(e.target.value)
        : e.target.value;
    setForm((s) => ({ ...s, [k]: v }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    /** @type {ProjectInput} */
    const input = {
      project_id: form.project_id || "PB-NEW-001",
      intake_timestamp: new Date().toISOString(),
      facility_type: form.facility_type,
      jurisdiction: form.jurisdiction,
      facility_status: form.facility_status,
      build_completion_year: form.build_completion_year,
      data_points: {
        annualised_pue: form.annualised_pue,
        wue_annualised: form.wue_annualised,
        site_water_stress_classification: form.site_water_stress_classification,
        climate_risk_assessment_completed: form.climate_risk_assessment_completed,
        climate_risk_assessment_methodology:
          form.climate_risk_assessment_methodology,
        // Day 3 not yet collected — engine returns "data_missing" for these.
        ecocc_practices_implemented: [],
      },
      evidence_documents: [],
    };
    onSubmit(input);
  };

  return (
    <div className="max-w-2xl mx-auto my-10 px-8 font-sans text-[#0B1F2A]">
      <h1 className="text-2xl font-bold mb-2">Capital Alignment Snapshot</h1>
      <p className="text-sm text-[#5C6B5C] mb-8">
        Day 3 scaffold — Activity 8.1 inputs only. Full intake field set lands when LegacyAppShell is retired.
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
