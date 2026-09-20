// @ts-check
//
// If a field is REQUIRED, it must be RENDERED.
//
// Two defects this session were the same shape: a field the generator refused
// to run without, which then appeared on no page.
//
//   - `output.signatory` — requireField enforced it since the first version
//     of this generator, and nothing drew it. The report page promised
//     "Investor-grade. Signed." and handed over an unsigned document.
//   - the Article 26 disclaimer — registered as a fixed footnote, rendered on
//     no page of any report, because only one of six body-render functions
//     told the footnote engine which page it was on.
//
// Both were invisible to unit tests, because every unit involved was correct
// in isolation. Neither was caught by a human reading the code, twice.
//
// So this tests the invariant instead of the instances: give every required
// field a distinctive value, generate the PDF, and assert each one reaches the
// page. A field that is demanded and never drawn fails here.
//
// The inverse matters too and is tested below: a field that is DRAWN should be
// REQUIRED, or a missing one prints something meaningless into an
// audit-bearing document with no error.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateReportPDF } from "./reportPDF.js";

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

/**
 * Every field reportPDF demands, the distinctive value to give it, and the
 * fragment that must reach the page.
 *
 * `expect` differs from `value` where the document legitimately shows only
 * part of it — the cover prints the first eight characters of the engagement
 * reference, uppercased. Structured fields (sections, signatory) are checked
 * through their contents, since there is no single string to look for.
 */
const REQUIRED_FIELDS = [
  {
    field: "run_id",
    value: "RUNID7X2-sentinel-do-not-remove",
    expect: "RUNID7X2",
    why: "the engine's per-render serial; belongs in Provenance so a PDF can be matched to a run",
  },
  {
    field: "engagement_reference",
    value: "abc12345-f122-4043-aa6d-f5720a0cc7f6",
    expect: "ABC12345",
    why: "the audit-bearing Airtable key a reader cross-references",
  },
  {
    field: "methodology_version",
    value: "vSENTINEL9.9",
    expect: "vSENTINEL9.9",
    why: "stamped in the folio band on every page",
  },
  {
    field: "disclaimer",
    value: "SENTINELCAVEAT: this assessment does not constitute assurance.",
    expect: "SENTINELCAVEAT",
    why: "the Article 26 scoping caveat — footnote 1 on every non-cover page",
  },
  {
    field: "knowledge_base_hash",
    value: "sha256:KBHASHSENTINEL0001",
    expect: "KBHASHSENTINEL0001",
    why: "provenance; lets a run be reproduced",
  },
  {
    field: "engine_commit_sha",
    value: "ENGINESHASENTINEL",
    expect: "ENGINESHASENTINEL",
    why: "provenance; names the code that produced the verdicts",
  },
  {
    field: "generated_at",
    value: "2026-09-20T09:00:00.000Z",
    expect: "2026-09-20",
    why: "the date of issue, printed on the cover and beside the signature",
  },
];

function outputFixture(overrides = {}) {
  /** @type {Record<string, any>} */
  const out = {
    sections: [
      { section_id: "situation", heading: "Situation", narrative: "SITUATIONSENTINEL." },
      { section_id: "frameworks_applied", heading: "Frameworks Applied", narrative: "FRAMEWORKSENTINEL." },
      { section_id: "evidence_presented", heading: "Evidence Presented", narrative: "EVIDENCESENTINEL." },
      { section_id: "conclusions", heading: "Conclusions", narrative: "CONCLUSIONSENTINEL." },
      { section_id: "residual_disclosure", heading: "Residual Disclosure", narrative: "RESIDUALSENTINEL." },
    ],
    signatory: {
      name: "SIGNATORYNAMESENTINEL",
      title: "SIGNATORYTITLESENTINEL",
      signature_block_uri: "PLACEHOLDER_DEFER_TO_COMMIT_3",
    },
    evidence_log: [],
    ic_defence_pack: { pack_version: "v1", questions: [] },
  };
  for (const { field, value } of REQUIRED_FIELDS) out[field] = value;
  return { ...out, ...overrides };
}

/**
 * Render and return the document's text with jsPDF's line wrapping undone —
 * each visual line is its own `(…) Tj`, so a wrapped sentence would otherwise
 * defeat a correct assertion.
 */
async function renderText(output, meta = {}) {
  const doc = await generateReportPDF(output, meta, null);
  const raw = [];
  for (let n = 1; n <= doc.internal.getNumberOfPages(); n++) {
    raw.push((doc.internal.pages[n] || []).join("\n"));
  }
  return [...raw.join("\n").matchAll(/\((.*?)\) Tj/g)].map((m) => m[1]).join(" ");
}

describe("every required field reaches the page", () => {
  it.each(REQUIRED_FIELDS.map((f) => [f.field, f]))(
    "%s",
    async (_name, { expect: fragment, why }) => {
      const text = await renderText(outputFixture());
      expect(
        text.includes(fragment),
        `"${_name}" is required by requireField but does not appear in the rendered PDF.\n` +
          `  Expected to find: ${fragment}\n` +
          `  Why it matters:   ${why}\n` +
          `  Either draw it, or stop requiring it — a field demanded and never\n` +
          `  rendered is the shape of the signatory and Article 26 defects.`,
      ).toBe(true);
    },
  );

  it("the structured fields reach the page through their contents", async () => {
    const text = await renderText(outputFixture());
    // sections
    for (const fragment of [
      "SITUATIONSENTINEL",
      "CONCLUSIONSENTINEL",
      "RESIDUALSENTINEL",
    ]) {
      expect(text, fragment).toContain(fragment);
    }
    // signatory
    expect(text).toContain("SIGNATORYNAMESENTINEL");
    expect(text).toContain("SIGNATORYTITLESENTINEL");
  });
});

describe("every field that is drawn is also required", () => {
  // The inverse of the invariant above, and the reason it matters: a drawn
  // field that nothing requires prints something meaningless when it is
  // missing, on a document that carries a signature.
  /**
   * Returns the error message when generating without `field`, or null if it
   * generated anyway. Catching explicitly rather than using rejects.toThrow:
   * on failure that matcher prints the RESOLVED value, which here is a whole
   * jsPDF document — 100KB of binary into the test output, burying the one
   * line that matters.
   */
  async function refusalFor(field) {
    const output = outputFixture();
    delete output[field];
    try {
      await generateReportPDF(output, {}, null);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  it("a missing generated_at is refused, not printed as an invalid date", async () => {
    const message = await refusalFor("generated_at");
    expect(
      message,
      "generated_at is drawn on the cover and beside the signature; a missing " +
        "one printed an invalid date onto a signed document with no error",
    ).toMatch(/generated_at/);
  });

  it.each(REQUIRED_FIELDS.map((f) => [f.field]))(
    "%s is refused when absent",
    async (field) => {
      expect(await refusalFor(field), `${field} generated anyway`).toMatch(
        new RegExp(field),
      );
    },
  );
});
