// @ts-check
//
// A logo that fails to load costs the logo, not the report.
//
// loadLogoBase64 ran inside the Promise.all that opens generateReportPDF, with
// no try and no status check. A network failure rejected the whole generation,
// so the client clicked Download PDF and got nothing — for a decorative image
// the cover already has a guard for (`if (logoBase64)`). A 404 was worse in a
// different way: the error page was base64-encoded and handed to addImage as a
// PNG.

import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateReportPDF } from "./reportPDF.js";

vi.mock("./reportTypography.js", async (importOriginal) => {
  const actual = /** @type {any} */ (await importOriginal());
  return { ...actual, embedPBFonts: async () => {} };
});

afterEach(() => vi.restoreAllMocks());

const LOGO = readFileSync(resolve(process.cwd(), "src/assets/pb_cover_logo.png"));

function output() {
  return {
    run_id: "RUN-LOGO-TEST",
    engagement_reference: "abc12345-f122-4043-aa6d-f5720a0cc7f6",
    methodology_version: "v3.5",
    disclaimer: "Not an Article 26 assurance.",
    knowledge_base_hash: "sha256:kb",
    engine_commit_sha: "sha",
    generated_at: "2026-09-25T09:00:00.000Z",
    sections: [
      { section_id: "situation", heading: "Situation", narrative: "S." },
      { section_id: "frameworks_applied", heading: "Frameworks Applied", narrative: "F." },
      { section_id: "evidence_presented", heading: "Evidence Presented", narrative: "E." },
      { section_id: "conclusions", heading: "Conclusions", narrative: "C." },
      { section_id: "residual_disclosure", heading: "Residual Disclosure", narrative: "R." },
    ],
    signatory: { name: "Dolapo Faseun", title: "Chief Executive Officer" },
    evidence_log: [],
    ic_defence_pack: { pack_version: "v1", questions: [] },
  };
}

/** @param {any} doc */
const imageCount = (doc) =>
  (doc.output().match(/\/Subtype \/Image/g) ?? []).length;

describe("the cover logo", () => {
  it("a network failure still produces the report, without the logo", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const doc = await generateReportPDF(output(), {}, null);
    expect(doc.internal.getNumberOfPages()).toBeGreaterThan(1);
    expect(imageCount(doc)).toBe(0);
  });

  it("a 404 still produces the report, and never embeds the error page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      /** @type {any} */ ({
        ok: false,
        status: 404,
        arrayBuffer: async () => new TextEncoder().encode("<html>Not Found</html>").buffer,
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const doc = await generateReportPDF(output(), {}, null);
    expect(doc.internal.getNumberOfPages()).toBeGreaterThan(1);
    expect(imageCount(doc)).toBe(0);
  });

  it("a good fetch still draws it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      /** @type {any} */ ({
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          LOGO.buffer.slice(LOGO.byteOffset, LOGO.byteOffset + LOGO.byteLength),
      }),
    );
    const doc = await generateReportPDF(output(), {}, null);
    expect(imageCount(doc)).toBe(1);
  });
});
