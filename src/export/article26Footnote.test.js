// @ts-check
//
// The Article 26 scoping caveat must appear on every non-cover page.
//
// It did not appear on ANY page. `prependFixedFootnote(output.disclaimer)` is
// called at PDF init and the whole point of the fixed-footnote registry is
// that its contents re-fire on every page — but renderFootnotesForPage read a
// page-keyed map and returned early for pages with no entry, and a page only
// got an entry if a body-render function called setCurrentPage(). Exactly one
// did. So the caveat reached SFDR framework-finding pages and nothing else,
// and on an engagement with no SFDR findings it was absent from the entire
// document.
//
// This is the caveat that scopes what the report is and is not — that it is
// not Article 26 assurance. These tests count its occurrences per page,
// because "it renders somewhere" was never the property that mattered.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateReportPDF } from "./reportPDF.js";

vi.mock("./reportTypography.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, embedPBFonts: async () => {} };
});

const LOGO_BYTES = readFileSync(
  resolve(process.cwd(), "src/assets/pb_cover_logo.png"),
);
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      LOGO_BYTES.buffer.slice(
        LOGO_BYTES.byteOffset,
        LOGO_BYTES.byteOffset + LOGO_BYTES.byteLength,
      ),
  }));
});
afterEach(() => vi.restoreAllMocks());

// A phrase short enough to survive splitTextToSize without wrapping.
const DISCLAIMER =
  "This assessment does not constitute assurance under Article 26.";
const NEEDLE = "does not constitute assurance";

function outputFixture(overrides = {}) {
  return {
    run_id: "run-1",
    engagement_reference: "b464da15-f122-4043-aa6d-f5720a0cc7f6",
    methodology_version: "v3.5",
    generated_at: "2026-09-20T09:00:00.000Z",
    sections: [
      { section_id: "situation", heading: "Situation", narrative: "Situation text." },
      { section_id: "frameworks_applied", heading: "Frameworks Applied", narrative: "Frameworks text." },
      { section_id: "evidence_presented", heading: "Evidence Presented", narrative: "Evidence text." },
      { section_id: "conclusions", heading: "Conclusions", narrative: "Conclusions text." },
      { section_id: "residual_disclosure", heading: "Residual Disclosure", narrative: "Residual text." },
    ],
    disclaimer: DISCLAIMER,
    signatory: {
      name: "Dolapo Faseun",
      title: "Chief Executive Officer, Perennity Bridge",
      signature_block_uri: "PLACEHOLDER_DEFER_TO_COMMIT_3",
    },
    knowledge_base_hash: "sha256:abc",
    engine_commit_sha: "deadbeef",
    evidence_log: [],
    ic_defence_pack: { pack_version: "v1", questions: [] },
    ...overrides,
  };
}

async function renderPages(output, meta = {}, contract = null) {
  const doc = await generateReportPDF(output, meta, contract);
  const total = doc.internal.getNumberOfPages();
  const pages = [];
  for (let n = 1; n <= total; n++) {
    pages.push((doc.internal.pages[n] || []).join("\n"));
  }
  return { pages, total };
}

describe("the Article 26 caveat reaches every page", () => {
  it("is on every non-cover page of an EU Taxonomy report", async () => {
    const { pages, total } = await renderPages(outputFixture(), {
      target_label: "eu_taxonomy_aligned_8_1",
    });
    expect(total).toBeGreaterThan(3);
    for (let n = 2; n <= total; n++) {
      expect(
        pages[n - 1].includes(NEEDLE),
        `page ${n} of ${total} is missing the Article 26 caveat`,
      ).toBe(true);
    }
  });

  it("is on every non-cover page of an SFDR Article 8 report", async () => {
    const { pages, total } = await renderPages(outputFixture(), {
      target_label: "sfdr_article_8",
    });
    for (let n = 2; n <= total; n++) {
      expect(
        pages[n - 1].includes(NEEDLE),
        `page ${n} of ${total} is missing the Article 26 caveat`,
      ).toBe(true);
    }
  });

  it("is not on the cover, which carries no running chrome", async () => {
    const { pages } = await renderPages(outputFixture());
    expect(pages[0].includes(NEEDLE)).toBe(false);
  });

  it("appears exactly once per page — the fallback never doubles it", async () => {
    const { pages, total } = await renderPages(outputFixture());
    for (let n = 2; n <= total; n++) {
      const occurrences = pages[n - 1].split(NEEDLE).length - 1;
      expect(occurrences, `page ${n} of ${total}`).toBe(1);
    }
  });

  it("still reaches every page when SFDR finding pages are present", async () => {
    // Those pages register themselves via setCurrentPage and are seeded with
    // the fixed footnotes; the rest now come from the fallback. Both paths
    // must produce exactly one caveat.
    const contract = {
      framework_findings: [
        {
          framework: "SFDR",
          criteria: [
            {
              criterion_id: "sfdr_v1_good_governance_attestation",
              band: "aligned",
              band_rationale: "Domain verdicts all pass.",
            },
          ],
        },
      ],
    };
    const { pages, total } = await renderPages(
      outputFixture(),
      { target_label: "sfdr_article_8" },
      contract,
    );
    for (let n = 2; n <= total; n++) {
      const occurrences = pages[n - 1].split(NEEDLE).length - 1;
      expect(occurrences, `page ${n} of ${total}`).toBe(1);
    }
  });
});
