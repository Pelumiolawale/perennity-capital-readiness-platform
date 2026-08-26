// @ts-check
//
// Engine v4.0 adapter tests (Task 4).
//
// The load-bearing test in this file is the EQUIVALENCE one: the same inputs
// through the old path and the new path must render identical user-facing
// results. Everything else supports that claim.
//
// If someone later changes the adapter so that v4 drives the display, these
// tests fail — which is correct. Turning v4 on for customers is a gated product
// decision, and it should not be possible to do it accidentally.

import { describe, it, expect } from "vitest";
import { runSnapshot } from "./engineClient.js";
import {
  runSnapshotV4,
  runAssessmentV4,
  lensVerdictsToDisplayContract,
  isUserFacingEquivalent,
} from "./v4Adapter.js";
import v31Fixture from "../__fixtures__/v3.1-assessment.json";

/**
 * The standard test cases. One per target label the SPA supports, so the
 * equivalence claim covers every framework routing path rather than just the
 * happy one.
 */
const STANDARD_CASES = [
  { name: "EU Taxonomy 8.1 only", target_label: "eu_taxonomy_aligned_8_1" },
  { name: "SFDR Article 8", target_label: "sfdr_article_8" },
  { name: "SFDR Article 9", target_label: "sfdr_article_9" },
  { name: "UK SDR Focus", target_label: "uk_sdr_focus" },
  { name: "UK SDR Improvers", target_label: "uk_sdr_improvers" },
  { name: "UK SDR Impact", target_label: "uk_sdr_impact" },
];

/** @param {string} [targetLabel] */
function input(targetLabel) {
  const base = structuredClone(v31Fixture.projectInput);
  return targetLabel ? { ...base, target_label: targetLabel } : base;
}

// ---------------------------------------------------------------------------
// The acceptance criterion
// ---------------------------------------------------------------------------

describe("user-facing equivalence: old path vs new path", () => {
  for (const testCase of STANDARD_CASES) {
    it(`${testCase.name} — renders identical user-facing output`, async () => {
      const viaOldPath = await runSnapshot(input(testCase.target_label));
      const viaNewPath = await runSnapshotV4(input(testCase.target_label));

      expect(isUserFacingEquivalent(viaOldPath, viaNewPath)).toBe(true);

      // Spelled out explicitly too — a helper returning true is less
      // convincing than the fields themselves matching.
      expect(viaNewPath.heatmap).toEqual(viaOldPath.heatmap);
      expect(viaNewPath.gap_list).toEqual(viaOldPath.gap_list);
      expect(viaNewPath.indicative_score).toBe(viaOldPath.indicative_score);
      expect(viaNewPath.indicative_band).toBe(viaOldPath.indicative_band);
      expect(viaNewPath.disclaimer).toBe(viaOldPath.disclaimer);
      expect(viaNewPath.cta).toBe(viaOldPath.cta);
    });
  }

  it("no target_label (back-compat path) — renders identical output", async () => {
    const viaOldPath = await runSnapshot(input());
    const viaNewPath = await runSnapshotV4(input());
    expect(isUserFacingEquivalent(viaOldPath, viaNewPath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The v4 surface runs additively
// ---------------------------------------------------------------------------

describe("runAssessmentV4 — v4 runs alongside without disturbing the display", () => {
  it("returns a snapshot identical to the legacy path", async () => {
    const legacy = await runSnapshot(input("sfdr_article_8"));
    const { snapshot } = await runAssessmentV4(input("sfdr_article_8"));
    expect(isUserFacingEquivalent(legacy, snapshot)).toBe(true);
  });

  it("produces v4 lens verdicts on a separate channel", async () => {
    const result = await runAssessmentV4(input("sfdr_article_8"));
    const lensIds = result.lensVerdicts.map((v) => v.lensId).sort();
    expect(lensIds).toEqual(["eu_sfdr_2_0", "uk_sdr"]);
  });

  it("surfaces the US stub as an isolated error, not a crash", async () => {
    const result = await runAssessmentV4(input("sfdr_article_8"));
    expect(result.lensErrors.some((e) => e.lensId === "us_social_license")).toBe(true);
  });

  it("builds a benchmark record", async () => {
    const result = await runAssessmentV4(input("sfdr_article_8"));
    expect(result.benchmark).not.toBeNull();
    expect(result.benchmark.schemaVersion).toBe("1.0.0");
  });

  it("does NOT resolve a salt in the browser — server-side only", async () => {
    // If this ever reports "env" or "explicit", the salt has reached the
    // client bundle and that is a security regression, not a feature.
    const result = await runAssessmentV4(input("sfdr_article_8"));
    expect(result.benchmarkSaltSource).toBe("none");
  });

  it("carries no raw project identifier in the benchmark record", async () => {
    const result = await runAssessmentV4(input("sfdr_article_8"));
    const serialised = JSON.stringify(result.benchmark);
    expect(serialised).not.toContain("v31-regression-fixture");
  });
});

// ---------------------------------------------------------------------------
// The translation layer itself
// ---------------------------------------------------------------------------

describe("lensVerdictsToDisplayContract", () => {
  it("projects v4 lens output into renderable HeatmapCells", async () => {
    const result = await runAssessmentV4(input("sfdr_article_8"));
    expect(Array.isArray(result.v4DisplayCells)).toBe(true);
    expect(result.v4DisplayCells.length).toBeGreaterThan(0);
  });

  it("produces cells conforming to the SAME display contract as today", async () => {
    const legacy = await runSnapshot(input("sfdr_article_8"));
    const result = await runAssessmentV4(input("sfdr_article_8"));

    // Every key a v4 cell carries must already be a key the current renderer
    // emits. If v4 introduced a new key, the existing components would need
    // changing — which is exactly what "the SPA's rendering code must not
    // change" forbids.
    const legacyKeys = new Set(legacy.heatmap.flatMap((c) => Object.keys(c)));
    const v4Keys = new Set(result.v4DisplayCells.flatMap((c) => Object.keys(c)));
    const novel = [...v4Keys].filter((k) => !legacyKeys.has(k));
    expect(novel).toEqual([]);
  });

  it("returns cells with the required display fields populated", async () => {
    const result = await runAssessmentV4(input("uk_sdr_focus"));
    for (const cell of result.v4DisplayCells) {
      expect(cell).toHaveProperty("framework");
      expect(cell).toHaveProperty("verdict");
      expect(typeof cell.verdict).toBe("string");
    }
  });

  it("is callable directly, independent of runAssessmentV4", async () => {
    const result = await runAssessmentV4(input("sfdr_article_9"));
    const cells = await lensVerdictsToDisplayContract(
      result.legacyFrameworkResults,
      input("sfdr_article_9"),
    );
    expect(cells).toEqual(result.v4DisplayCells);
  });

  it("returns an empty projection for no framework results, without throwing", async () => {
    const cells = await lensVerdictsToDisplayContract([], input("sfdr_article_8"));
    expect(cells).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Free/paid boundary — the v4 path must not widen the leak surface
// ---------------------------------------------------------------------------

describe("free-tier discipline holds on the v4 path", () => {
  const DISALLOWED_KEYS = [
    "source_text",
    "threshold_value",
    "narrative",
    "methodology_version",
    "signatory",
    "evidence_log",
    "gap_summary",
    "scoring_logic_ref",
    "regulatory_citations",
  ];

  it("no disallowed key appears anywhere in the v4-rendered snapshot", async () => {
    const { snapshot } = await runAssessmentV4(input("sfdr_article_8"));
    const walk = (node) => {
      if (node === null || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(walk);
      for (const key of Object.keys(node)) {
        expect(DISALLOWED_KEYS).not.toContain(key);
        walk(node[key]);
      }
    };
    walk(snapshot);
  });

  it("no disallowed key appears in the projected v4 display cells", async () => {
    const result = await runAssessmentV4(input("sfdr_article_8"));
    for (const cell of result.v4DisplayCells) {
      for (const key of Object.keys(cell)) {
        expect(DISALLOWED_KEYS).not.toContain(key);
      }
    }
  });
});
