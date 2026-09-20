// @ts-check
//
// ITEM-11 / ITEM-12 / ITEM-13.
//
// The bug in item 11 was that `output.signatory` was a REQUIRED field that
// was never drawn on any page. No unit test could have caught that, because
// every unit involved was correct in isolation. So these tests generate the
// actual PDF and read the text back out of it.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  generateReportPDF,
  signatureBlockIsReal,
  icDefencePackHasContent,
} from "./reportPDF.js";
import { resolveSignatory, hasRealSignatureBlock } from "../routes/ReportRoute.jsx";

// The font embedder fetches TTFs through the Vite asset pipeline, which is
// not available under vitest's node environment. Stub it; nothing under test
// here depends on which typeface is registered.
vi.mock("./reportTypography.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, embedPBFonts: async () => {} };
});

// The cover logo is fetched from a Vite-resolved asset URL, which does not
// resolve under node's fetch. Serve the real file off disk so jsPDF's PNG
// decoder gets something it can actually decode.
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

function minimalOutput(overrides = {}) {
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
    disclaimer: "Article 26 scoping caveat.",
    signatory: {
      name: "Test Signatory",
      title: "Test Title, Perennity Bridge",
      signature_block_uri: "PLACEHOLDER_DEFER_TO_COMMIT_3",
    },
    knowledge_base_hash: "sha256:abc",
    engine_commit_sha: "deadbeef",
    evidence_log: [],
    ic_defence_pack: { pack_version: "v1", questions: [] },
    ...overrides,
  };
}

/** Render and return every text run in the document, joined per page. */
async function renderText(output, meta = {}) {
  const doc = await generateReportPDF(output, meta, null);
  const pages = [];
  const total = doc.internal.getNumberOfPages();
  for (let n = 1; n <= total; n++) {
    // jsPDF keeps each page's content stream on internal.pages[n].
    pages.push((doc.internal.pages[n] || []).join("\n"));
  }
  return { doc, pages, all: pages.join("\n"), total };
}

describe("the signature block is actually drawn (item 11)", () => {
  it("the signatory's name and title appear in the PDF", async () => {
    const { all } = await renderText(minimalOutput());
    expect(all).toContain("Test Signatory");
    expect(all).toContain("Test Title, Perennity Bridge");
  });

  it("the document says who it is signed on behalf of", async () => {
    const { all } = await renderText(minimalOutput());
    expect(all).toContain("Signed for and on behalf of Perennity Bridge");
  });

  it("the engagement reference is on the signature page", async () => {
    const { all } = await renderText(minimalOutput());
    expect(all).toContain("Engagement reference");
  });

  it("an unsigned report says so, unmistakably", async () => {
    const { all } = await renderText(minimalOutput());
    expect(all).toContain("NOT YET COUNTERSIGNED");
    // The explanatory note is wrapped by splitTextToSize, so assert on a
    // fragment that survives on a single line.
    expect(all).toContain("relied upon by a third party until it is signed");
  });

  it("the raw placeholder token never reaches the page", async () => {
    const { all } = await renderText(minimalOutput());
    expect(all).not.toContain("PLACEHOLDER_DEFER_TO_COMMIT_3");
  });

  it("a real signature asset suppresses the pending notice", async () => {
    const output = minimalOutput({
      signatory: {
        name: "Test Signatory",
        title: "Test Title",
        // 1x1 transparent PNG.
        signature_block_uri:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      },
    });
    const { all } = await renderText(output);
    expect(all).not.toContain("NOT YET COUNTERSIGNED");
  });

  it("signatureBlockIsReal distinguishes the placeholder from an asset", () => {
    expect(signatureBlockIsReal({ signature_block_uri: "PLACEHOLDER_DEFER_TO_COMMIT_3" })).toBe(false);
    expect(signatureBlockIsReal({ signature_block_uri: "" })).toBe(false);
    expect(signatureBlockIsReal({ signature_block_uri: null })).toBe(false);
    expect(signatureBlockIsReal(null)).toBe(false);
    expect(signatureBlockIsReal({ signature_block_uri: "data:image/png;base64,AAAA" })).toBe(true);
  });
});

describe("signatory overrides fall back field by field (item 13)", () => {
  it("a title-only override keeps the default name", () => {
    const s = resolveSignatory({ name: null, title: "Managing Director", signature_block_uri: null });
    expect(s.title).toBe("Managing Director");
    expect(s.name).toBeTruthy();
    expect(s.name).not.toBeNull();
  });

  it("a name-only override keeps the default title", () => {
    const s = resolveSignatory({ name: "A. Person", title: null, signature_block_uri: null });
    expect(s.name).toBe("A. Person");
    expect(s.title).toBeTruthy();
  });

  it("no overrides at all yields the complete default", () => {
    const s = resolveSignatory(null);
    expect(s.name).toBeTruthy();
    expect(s.title).toBeTruthy();
    expect(s.signature_block_uri).toBeTruthy();
  });

  it("every field of a full override is honoured", () => {
    const s = resolveSignatory({
      name: "A. Person",
      title: "Director",
      signature_block_uri: "data:image/png;base64,AAAA",
    });
    expect(s).toEqual({
      name: "A. Person",
      title: "Director",
      signature_block_uri: "data:image/png;base64,AAAA",
    });
  });

  it("the default signatory is not treated as signed", () => {
    expect(hasRealSignatureBlock(resolveSignatory(null))).toBe(false);
  });
});

describe("an empty IC Defence Pack is not published (item 12)", () => {
  it("no empty section heading, and no pointer at our own repo", async () => {
    const { all } = await renderText(minimalOutput());
    expect(all).not.toContain("See engine repo");
    expect(all).not.toContain("IC Defence Pack");
  });

  it("provenance still reaches the document", async () => {
    const { all } = await renderText(minimalOutput());
    expect(all).toContain("Provenance");
    expect(all).toContain("deadbeef");
  });

  it("the section returns by itself once the engine emits questions", async () => {
    const output = minimalOutput({
      ic_defence_pack: {
        pack_version: "v1",
        questions: [
          {
            q_id: "Q1",
            ic_voice: "sceptic",
            question: "How is the WUE figure corroborated?",
            answer: "Independently audited, see evidence log.",
            evidence_refs: ["audit-2026-06"],
            template_ref: "T-01",
          },
        ],
      },
    });
    const { all } = await renderText(output);
    expect(all).toContain("IC Defence Pack");
    expect(all).toContain("How is the WUE figure corroborated?");
  });

  it("icDefencePackHasContent reads the pack correctly", () => {
    expect(icDefencePackHasContent(minimalOutput())).toBe(false);
    expect(icDefencePackHasContent({ ic_defence_pack: { questions: [{}] } })).toBe(true);
    expect(icDefencePackHasContent({})).toBe(false);
  });
});
