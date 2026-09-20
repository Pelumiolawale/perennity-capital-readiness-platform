// @ts-check
//
// The renderer must not answer a question the engine declined to answer.
//
// `filterConclusionsNarrative` used to derive a headline verdict with:
//
//   hasNotAligned ? "not aligned" : hasPartial ? "partially aligned" : "aligned"
//
// `insufficient_evidence` is in neither test, so it fell through to "aligned".
// A framework whose every criterion resolved to insufficient evidence printed
// "overall verdict aligned" into a paying client's Conclusions — and that is
// the state of a newly created engagement before anyone fills anything in.
//
// It also derived an "indicative score" from a weighting (aligned 1,
// partially_aligned 0.5) that appears in no methodology document, while the
// engine's own RenderContract types overall_verdict as the literal
// "calibration_pending".
//
// The first test in the second block is the one that matters.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  generateReportPDF,
  summariseCriterionVerdicts,
  FRAMEWORK_FINDING_ACTIVITY_IDS,
} from "./reportPDF.js";

vi.mock("./reportTypography.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, embedPBFonts: async () => {} };
});

const LOGO = readFileSync(resolve(process.cwd(), "src/assets/pb_cover_logo.png"));
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      LOGO.buffer.slice(LOGO.byteOffset, LOGO.byteOffset + LOGO.byteLength),
  }));
});
afterEach(() => vi.restoreAllMocks());

const crit = (verdict, n = 1) =>
  Array.from({ length: n }, (_, i) => ({
    criterion_id: `c${i}`,
    criterion_label: `Criterion ${i}`,
    verdict,
    band_rationale: "r",
    evidence_refs: [],
    inputs_used: {},
  }));

function outputFixture() {
  return {
    run_id: "run-1",
    engagement_reference: "b464da15-f122-4043-aa6d-f5720a0cc7f6",
    methodology_version: "v3.5",
    generated_at: "2026-09-20T09:00:00.000Z",
    sections: [
      { section_id: "situation", heading: "Situation", narrative: "S." },
      { section_id: "frameworks_applied", heading: "Frameworks Applied", narrative: "F." },
      { section_id: "evidence_presented", heading: "Evidence Presented", narrative: "E." },
      { section_id: "conclusions", heading: "Conclusions", narrative: "Engine narrative." },
      { section_id: "residual_disclosure", heading: "Residual Disclosure", narrative: "R." },
    ],
    disclaimer: "Scoping caveat.",
    signatory: { name: "Dolapo Faseun", title: "CEO", signature_block_uri: "x" },
    knowledge_base_hash: "sha256:abc",
    engine_commit_sha: "deadbeef",
    evidence_log: [],
    ic_defence_pack: { pack_version: "v1", questions: [] },
  };
}

/**
 * Render with a product-label contract and return the document's text with
 * wrapping undone.
 *
 * jsPDF emits each visual line as its own `(…) Tj` in the content stream, and
 * splitTextToSize breaks at word boundaries — so a sentence long enough to
 * wrap is split across several of them. Pulling the parenthesised strings out
 * and rejoining with a space reconstructs the prose, which is what these
 * assertions are actually about. Asserting on the raw stream instead would
 * mean quietly weakening any assertion whose phrase happens to straddle a
 * line break.
 */
async function renderWith(criteria, frameworkVerdicts) {
  const contract = {
    framework_findings: [{ framework: "sfdr_art8", criteria }],
  };
  const doc = await generateReportPDF(
    outputFixture(),
    { target_label: "sfdr_article_8" },
    contract,
    frameworkVerdicts,
  );
  const raw = [];
  for (let n = 1; n <= doc.internal.getNumberOfPages(); n++) {
    raw.push((doc.internal.pages[n] || []).join("\n"));
  }
  return [...raw.join("\n").matchAll(/\((.*?)\) Tj/g)]
    .map((m) => m[1])
    .join(" ");
}

describe("summariseCriterionVerdicts", () => {
  it("counts each verdict in reporting order", () => {
    expect(
      summariseCriterionVerdicts([
        ...crit("aligned", 3),
        ...crit("not_aligned", 1),
        ...crit("partially_aligned", 2),
      ]),
    ).toBe("3 aligned, 2 partially aligned, 1 not aligned");
  });

  it("names insufficient evidence rather than silently absorbing it", () => {
    expect(summariseCriterionVerdicts(crit("insufficient_evidence", 7))).toBe(
      "7 insufficient evidence",
    );
  });

  it("omits verdicts with a zero count", () => {
    expect(summariseCriterionVerdicts(crit("aligned", 2))).toBe("2 aligned");
  });

  it("flags a verdict the report version does not know", () => {
    // The engine growing a sixth band must not vanish into a default arm.
    expect(summariseCriterionVerdicts(crit("not_implemented", 1))).toMatch(
      /not recognised by this report version/,
    );
  });

  it("says so when there are no criteria at all", () => {
    expect(summariseCriterionVerdicts([])).toBe("no criteria assessed");
  });
});

describe("the Conclusions page states no invented verdict (principle 3)", () => {
  it("an all-insufficient framework is NOT called aligned", async () => {
    const text = await renderWith(crit("insufficient_evidence", 7));
    expect(text).toContain("7 insufficient evidence");
    expect(text).not.toMatch(/overall verdict aligned/);
    expect(text).not.toMatch(/verdict aligned/);
  });

  it("a genuinely aligned framework is reported as such, by count", async () => {
    const text = await renderWith(crit("aligned", 7));
    expect(text).toContain("7 aligned");
  });

  it("no indicative score is printed for a product label", async () => {
    const text = await renderWith([...crit("aligned", 3), ...crit("not_aligned", 1)]);
    expect(text).not.toMatch(/indicative score/);
  });

  it("the SCORE is described as pending — not the verdict", async () => {
    // Only indicative_score is calibration-pending. The engine does compute a
    // per-framework verdict, so claiming the verdict is pending would be a
    // false statement about our own methodology.
    const text = await renderWith(crit("aligned", 4));
    expect(text).toMatch(/calibrated numerical score/);
    expect(text).toMatch(/pending/);
    expect(text).not.toMatch(/verdict .{0,20}pending/);
  });

  it("a mixed framework reports every band it contains", async () => {
    const text = await renderWith([
      ...crit("aligned", 2),
      ...crit("partially_aligned", 1),
      ...crit("not_aligned", 1),
      ...crit("insufficient_evidence", 2),
      ...crit("not_applicable", 1),
    ]);
    for (const fragment of [
      "2 aligned",
      "1 partially aligned",
      "1 not aligned",
      "2 insufficient evidence",
      "1 not applicable",
    ]) {
      expect(text, fragment).toContain(fragment);
    }
  });
});

describe("the verdict comes from the engine, never from the renderer", () => {
  // The engine's aggregateProductLabelVerdict already ranks the bands, and it
  // handles insufficient_evidence explicitly. The renderer's own copy of that
  // ladder was missing exactly that rung, which is what produced the false
  // "aligned". So the renderer no longer ranks anything — it reports what the
  // engine decided.
  it("prints the engine's verdict when one is supplied", async () => {
    const text = await renderWith(crit("aligned", 7), {
      sfdr_v1_article_8: "aligned",
    });
    expect(text).toMatch(/overall verdict aligned/);
    expect(text).toContain("7 aligned");
  });

  it("prints insufficient evidence when that is what the engine said", async () => {
    // The exact case the old ternary turned into "aligned".
    const text = await renderWith(crit("insufficient_evidence", 7), {
      sfdr_v1_article_8: "insufficient_evidence",
    });
    expect(text).toMatch(/overall verdict insufficient evidence/);
    expect(text).not.toMatch(/verdict aligned/);
  });

  it("does not contradict the engine when criteria and verdict differ", async () => {
    // A not_aligned framework whose criteria are mostly aligned must still
    // report not_aligned — the engine's cascade rules are not re-litigated
    // here.
    const text = await renderWith(
      [...crit("aligned", 6), ...crit("not_aligned", 1)],
      { sfdr_v1_article_8: "not_aligned" },
    );
    expect(text).toMatch(/overall verdict not aligned/);
  });

  it("states no verdict at all when the engine supplied none", async () => {
    const text = await renderWith(crit("aligned", 3), undefined);
    expect(text).toContain("3 aligned");
    expect(text).not.toMatch(/overall verdict/);
  });

  it("passes an unknown band through verbatim rather than reshaping it", async () => {
    const text = await renderWith(crit("aligned", 2), {
      sfdr_v1_article_8: "some_future_band",
    });
    expect(text).toMatch(/overall verdict some_future_band/);
  });

  it("every framework the contract can emit has an activity id to join on", () => {
    // If the engine gains a framework and only one of the two maps is updated,
    // that framework silently loses its verdict. Fail here instead.
    expect(Object.keys(FRAMEWORK_FINDING_ACTIVITY_IDS).sort()).toEqual(
      ["sfdr_art8", "sfdr_art9", "uk_sdr_focus", "uk_sdr_impact", "uk_sdr_improvers"].sort(),
    );
    for (const id of Object.values(FRAMEWORK_FINDING_ACTIVITY_IDS)) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    }
  });
});
