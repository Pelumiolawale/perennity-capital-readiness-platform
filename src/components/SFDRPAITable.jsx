// @ts-check
// Paid-flow only — see CLAUDE.md. Do not import from /assessment/snapshot or any free-tier component.
//
// SFDR PAI Table — 10-row PAI data provision input for SFDR Articles 8/9.
//
// Mirrors SFDR 2022/1288 Annex I Table 1 mandatory indicator scope:
//   PAI 1  GHG emissions
//   PAI 2  Carbon footprint
//   PAI 4  Fossil fuel sector exposure  (always not_applicable for DC projects)
//   PAI 5  Non-renewable energy
//   PAI 7  Biodiversity-sensitive areas
//   PAI 8  Emissions to water
//   PAI 9  Hazardous waste
//   PAI 10 UNGC violations
//   PAI 11 Lack of UNGC monitoring processes
//   PAI 13 Board gender diversity
//
// Per row the assessor supplies: value, unit, verifier identity (optional),
// assurance status (single-select). PAI 4 is read-only and prefilled with
// applicability=not_applicable + rationale.

import { useMemo } from "react";

/**
 * @typedef {Object} PAIRow
 * @property {number} pai_number
 * @property {string | number | null} [value]
 * @property {string} [unit]
 * @property {string} [verifier_identity]
 * @property {"Third-party assured" | "Management attested" | "Unverified" | "Not applicable"} [assurance_status]
 * @property {"applicable" | "not_applicable"} [applicability]
 * @property {string} [applicability_rationale]
 */

const PAI_DEFINITIONS = Object.freeze([
  { pai_number: 1, indicator_name: "GHG emissions", default_unit: "tCO2e" },
  { pai_number: 2, indicator_name: "Carbon footprint", default_unit: "tCO2e/EURm" },
  {
    pai_number: 4,
    indicator_name: "Fossil-fuel sector exposure",
    default_unit: "%",
    fixed_not_applicable: true,
    applicability_rationale:
      "Fossil-fuel sector exposure — not applicable to data-centre projects, per Annex I Table 1 mandatory indicator scope.",
  },
  { pai_number: 5, indicator_name: "Non-renewable energy share", default_unit: "%" },
  { pai_number: 7, indicator_name: "Biodiversity-sensitive areas", default_unit: "negative-effect flag" },
  { pai_number: 8, indicator_name: "Emissions to water", default_unit: "tonnes/EURm" },
  { pai_number: 9, indicator_name: "Hazardous waste ratio", default_unit: "tonnes/EURm" },
  { pai_number: 10, indicator_name: "UNGC violations", default_unit: "violations (5y)" },
  { pai_number: 11, indicator_name: "Lack of UNGC monitoring processes", default_unit: "%" },
  { pai_number: 13, indicator_name: "Board gender diversity", default_unit: "% women on board" },
]);

const ASSURANCE_OPTIONS = Object.freeze([
  "Third-party assured",
  "Management attested",
  "Unverified",
  "Not applicable",
]);

/**
 * Initial-state factory for the 10-row table. PAI 4 prefilled as
 * not_applicable; other rows blank with default unit.
 *
 * @returns {PAIRow[]}
 */
export function emptyPAIRows() {
  return PAI_DEFINITIONS.map((def) => {
    if (def.fixed_not_applicable) {
      return {
        pai_number: def.pai_number,
        value: null,
        unit: def.default_unit,
        verifier_identity: "",
        assurance_status: "Not applicable",
        applicability: "not_applicable",
        applicability_rationale: def.applicability_rationale,
      };
    }
    return {
      pai_number: def.pai_number,
      value: "",
      unit: def.default_unit,
      verifier_identity: "",
      assurance_status: "Unverified",
      applicability: "applicable",
    };
  });
}

/**
 * @param {{ rows: PAIRow[], onChange: (rows: PAIRow[]) => void }} props
 */
export function SFDRPAITable({ rows, onChange }) {
  const definitions = useMemo(() => PAI_DEFINITIONS, []);

  function updateRow(paiNumber, field, value) {
    // Defensive guard: if a parent passes rows=undefined (e.g. wizard form
    // state lost the field through a stale draft load before the fix in
    // IntakeWizard.jsx:120 landed), seed an empty array so .map doesn't
    // throw. Belt-and-braces alongside the primary draft-load merge fix.
    onChange(
      (rows ?? []).map((row) =>
        row.pai_number === paiNumber ? { ...row, [field]: value } : row,
      ),
    );
  }

  return (
    <div className="overflow-x-auto border border-[#D8DCDF] rounded">
      <table className="w-full text-sm" data-testid="sfdr-pai-table">
        <thead>
          <tr className="bg-[#F1EEE8] text-[#4A5760]">
            <th className="text-left px-3 py-2 text-xs uppercase tracking-wider font-medium" style={{ width: "10%" }}>
              PAI #
            </th>
            <th className="text-left px-3 py-2 text-xs uppercase tracking-wider font-medium" style={{ width: "26%" }}>
              Indicator
            </th>
            <th className="text-right px-3 py-2 text-xs uppercase tracking-wider font-medium" style={{ width: "14%" }}>
              Value
            </th>
            <th className="text-left px-3 py-2 text-xs uppercase tracking-wider font-medium" style={{ width: "16%" }}>
              Unit
            </th>
            <th className="text-left px-3 py-2 text-xs uppercase tracking-wider font-medium" style={{ width: "16%" }}>
              Verifier
            </th>
            <th className="text-left px-3 py-2 text-xs uppercase tracking-wider font-medium" style={{ width: "18%" }}>
              Assurance status
            </th>
          </tr>
        </thead>
        <tbody>
          {definitions.map((def) => {
            // Defensive guard: see updateRow note. The .find() below is
            // where the live v0.5.0 blank-page crash originated when a
            // stale saved draft left form.sfdr_pai_rows undefined.
            const row = (rows ?? []).find((r) => r.pai_number === def.pai_number) ?? {
              pai_number: def.pai_number,
              value: "",
              unit: def.default_unit,
              verifier_identity: "",
              assurance_status: "Unverified",
            };
            const readOnly = Boolean(def.fixed_not_applicable);
            return (
              <tr
                key={def.pai_number}
                className="border-t border-[#D8DCDF] bg-[#F8F6F2]"
                data-pai={def.pai_number}
              >
                <td className="px-3 py-2 text-[#0B1F2A] font-medium tabular-nums">
                  {def.pai_number}
                </td>
                <td className="px-3 py-2 text-[#0B1F2A]">
                  {def.indicator_name}
                  {readOnly && (
                    <span className="block text-[11px] text-[#4A5760] mt-1">
                      Not applicable to data-centre projects.
                    </span>
                  )}
                </td>
                <td className="px-3 py-1 text-right tabular-nums">
                  <input
                    type="text"
                    value={readOnly ? "" : (row.value ?? "")}
                    onChange={(e) => updateRow(def.pai_number, "value", e.target.value)}
                    disabled={readOnly}
                    className="w-full px-2 py-1 text-right tabular-nums bg-white border border-[#D8DCDF] rounded disabled:bg-transparent disabled:border-transparent disabled:text-[#8A949B]"
                    placeholder={readOnly ? "—" : ""}
                  />
                </td>
                <td className="px-3 py-1">
                  <input
                    type="text"
                    value={row.unit ?? def.default_unit}
                    onChange={(e) => updateRow(def.pai_number, "unit", e.target.value)}
                    disabled={readOnly}
                    className="w-full px-2 py-1 bg-white border border-[#D8DCDF] rounded disabled:bg-transparent disabled:border-transparent disabled:text-[#8A949B]"
                  />
                </td>
                <td className="px-3 py-1">
                  <input
                    type="text"
                    value={row.verifier_identity ?? ""}
                    onChange={(e) => updateRow(def.pai_number, "verifier_identity", e.target.value)}
                    disabled={readOnly}
                    className="w-full px-2 py-1 bg-white border border-[#D8DCDF] rounded disabled:bg-transparent disabled:border-transparent disabled:text-[#8A949B]"
                    placeholder="Optional"
                  />
                </td>
                <td className="px-3 py-1">
                  <select
                    value={row.assurance_status ?? "Unverified"}
                    onChange={(e) => updateRow(def.pai_number, "assurance_status", e.target.value)}
                    disabled={readOnly}
                    className="w-full px-2 py-1 bg-white border border-[#D8DCDF] rounded disabled:bg-transparent disabled:border-transparent disabled:text-[#8A949B]"
                  >
                    {ASSURANCE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
