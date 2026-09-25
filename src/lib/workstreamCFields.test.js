// @ts-check
//
// Workstream C (25 Sep 2026): four engine inputs that no Airtable field fed.
//
//   item 6  c10  per_pai[n].methodology_ref       every PAI with a value needs
//                                                one, or c10 is not_aligned —
//                                                so c10 could never pass
//   item 7  c9   evidence_pack.pai_data_file_ref  a missing data file is a
//                                                missing c9 component
//   item 8  c8   si_objective.sub_case_a.*        Environmental / Mixed maps to
//                                                climate mitigation, which needs
//                                                SBTi / CTB-PAB / IEA NZE
//                                                evidence; with none sent, a
//                                                fully evidenced objective fell
//                                                through to not_aligned
//   item 9  UK SDR Improvers c8                   verification_method, without
//           kpi_reporting_commitment             which c8 caps at partial
//
// Each is tested at both ends of the path: the Airtable cell reaches the
// engagement object, and the engagement reaches the engine input — and each
// blank stays absent rather than becoming an answer (CLAUDE.md rule 2).

import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchEngagement, FID, CHILD_FIDS } from "./airtableEngagement.js";
import { buildSFDRInputs } from "./sfdrInputAdapter.js";
import { buildUKSDRInputs } from "./ukSDRInputAdapter.js";

const REF = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";
const CONFIG = { pat: "pat_test", baseId: "app_test", tableId: "tbl_test" };

afterEach(() => vi.restoreAllMocks());

/** @param {Record<string, unknown>} fields */
async function engagementFrom(fields) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const isParent = String(url).includes("/tbl_test");
    const records = isParent
      ? [{ id: "recTEST", fields: { [FID.STATUS]: "active", ...fields } }]
      : [];
    return /** @type {any} */ ({ ok: true, status: 200, json: async () => ({ records }) });
  });
  const r = await fetchEngagement(REF, CONFIG);
  if (!r.ok) throw new Error(`fetch refused: ${JSON.stringify(r)}`);
  return /** @type {any} */ (r.engagement);
}

/** A PAI Data child row. */
function paiRow(n, extra = {}) {
  return {
    id: `recPAI${n}`,
    fields: {
      [CHILD_FIDS.PROJECT_PAI_DATA.PAI_NUMBER]: n,
      [CHILD_FIDS.PROJECT_PAI_DATA.VALUE]: 1.5,
      ...extra,
    },
  };
}

// The minimum that opens the SI-objective block: a named, mitigation-mapped
// objective.
const SI_OBJECTIVE = {
  sfdr_si_objective: "Grid-decarbonising load shifting",
  sfdr_si_objective_category: "Environmental",
};

describe("item 6: per-PAI methodology reference (c10)", () => {
  it("a filled cell reaches per_pai as methodology_ref", () => {
    const out = buildSFDRInputs({
      project_pai_data: [
        paiRow(1, { [CHILD_FIDS.PROJECT_PAI_DATA.METHODOLOGY_REF]: "GHG Protocol S2 market-based" }),
      ],
    });
    expect(out.art9.pai_data.per_pai["1"].methodology_ref).toBe("GHG Protocol S2 market-based");
  });

  it("a blank cell leaves the key absent", () => {
    const out = buildSFDRInputs({ project_pai_data: [paiRow(2)] });
    expect("methodology_ref" in out.art9.pai_data.per_pai["2"]).toBe(false);
  });
});

describe("item 7: PAI data file reference (c9)", () => {
  it("is read from Airtable and reaches the evidence pack", async () => {
    const e = await engagementFrom({
      [FID.SFDR_ASSURANCE_TIER]: "limited_big4",
      [FID.C9_PAI_DATA_FILE_REF]: "dataroom/pai/2026-q2.csv",
    });
    expect(e.c9_pai_data_file_ref).toBe("dataroom/pai/2026-q2.csv");
    expect(buildSFDRInputs(e).art9.evidence_pack.pai_data_file_ref).toBe("dataroom/pai/2026-q2.csv");
  });

  it("blank stays absent", () => {
    const out = buildSFDRInputs({ sfdr_assurance_tier: "limited_big4" });
    expect("pai_data_file_ref" in out.art9.evidence_pack).toBe(false);
  });
});

describe("item 8: climate-mitigation sub-case (a) evidence (c8)", () => {
  it("ticked boxes are read from Airtable and reach sub_case_a", async () => {
    const e = await engagementFrom({
      [FID.C8_SBTI_VALIDATED_1_5C]: true,
      [FID.C8_SBTI_INCLUDES_NET_ZERO]: true,
    });
    const out = buildSFDRInputs({ ...e, ...SI_OBJECTIVE });
    expect(out.art9.si_objective.sub_case_a).toEqual({
      sbti_validated_1_5c: true,
      sbti_includes_net_zero: true,
    });
  });

  it("each of the other two routes reaches the engine key it is named for", () => {
    const out = buildSFDRInputs({
      ...SI_OBJECTIVE,
      c8_eu_ctb_or_pab_aligned: true,
      c8_iea_nze_compatible: true,
    });
    expect(out.art9.si_objective.sub_case_a).toEqual({
      eu_ctb_or_pab_aligned_at_project_level: true,
      iea_nze_2050_compatible_with_trajectory: true,
    });
  });

  it("no ticked box means no sub_case_a at all, not an object of falses", async () => {
    const e = await engagementFrom({});
    const out = buildSFDRInputs({ ...e, ...SI_OBJECTIVE });
    expect("sub_case_a" in out.art9.si_objective).toBe(false);
  });

  it("a tick alone does not conjure an SI objective", () => {
    // sub_case_a is evidence FOR an objective; with none declared there is
    // nothing for it to qualify, and c8 must stay insufficient_evidence.
    const out = buildSFDRInputs({ c8_sbti_validated_1_5c: true, c8_sbti_includes_net_zero: true });
    expect(out?.art9?.si_objective?.objective).toBeUndefined();
  });
});

describe("item 9: UK SDR verification method (Improvers c8)", () => {
  it("is read from Airtable and reaches kpi_reporting_commitment", async () => {
    const e = await engagementFrom({
      [FID.UK_SDR_KPIS_COMMITTED]: ["pue", "wue"],
      [FID.UK_SDR_VERIFICATION_METHOD]: "third_party_audit",
    });
    expect(e.uk_sdr_verification_method).toBe("third_party_audit");
    expect(buildUKSDRInputs(e)?.kpi_reporting_commitment?.verification_method).toBe(
      "third_party_audit",
    );
  });

  it("on its own it is still an answer, and is not dropped", () => {
    expect(
      buildUKSDRInputs({ uk_sdr_verification_method: "internal" })?.kpi_reporting_commitment,
    ).toEqual({ verification_method: "internal" });
  });

  it("blank stays absent", () => {
    const out = buildUKSDRInputs({ uk_sdr_kpis_committed: ["pue"] });
    expect("verification_method" in (out?.kpi_reporting_commitment ?? {})).toBe(false);
  });
});
