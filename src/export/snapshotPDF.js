// @ts-check
/**
 * @typedef {import('@perennity/engine').SnapshotOutput} SnapshotOutput
 */

import { jsPDF } from "jspdf";
import {
  METHODOLOGY_VERSION,
  BUNDLED_ACTIVITIES,
  computeKnowledgeBaseHash,
} from "@perennity/engine";

// ----------------------------------------------------------------------------
// Day 4 commit 2 — Snapshot PDF generator.
//
// Two pages, A4 portrait, plain jspdf primitives only. Deliberately lower
// production value than the future Report tier: no DOM rasterisation, no
// SVG, no logo image, no charts.
//
// Provenance-triple source note: SnapshotOutput (the closed allowlist
// enforced by snapshot.gate.test.ts) does NOT expose methodology_version,
// engine_commit_sha, or knowledge_base_hash. Those are gated out of the
// Snapshot tier by design. The PDF still carries the audit triple, but
// sources them from the engine module (METHODOLOGY_VERSION export +
// computeKnowledgeBaseHash over BUNDLED_ACTIVITIES) and the build-time
// env (VITE_ENGINE_COMMIT_SHA). These are module-load invariants — they
// reflect the actual engine code running in this build, which is what the
// audit triple needs to capture.
// ----------------------------------------------------------------------------

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 20;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - 2 * MARGIN_MM;

// Brand colours
const NAVY = [11, 31, 42];
const TEAL = [78, 205, 164];
const WARM_WHITE = [248, 246, 242];
const MUTED_GREY = [128, 128, 128];
const PASS_GREEN = [34, 139, 34];
const FAIL_RED = [178, 34, 52];
const PARTIAL_AMBER = [201, 138, 4];

const FONT_HEADLINE = 24;
const FONT_SECTION = 14;
const FONT_BODY = 10;
const FONT_FOOTNOTE = 8;

const ARTICLE_26 =
  "This output is advisory and does not constitute regulatory assurance " +
  "under Article 26 of Regulation (EU) 2020/852.";

const SAFEGUARDS_FOOTNOTE =
  "Minimum safeguards assessment (Article 18, EU Taxonomy Regulation) is " +
  "conducted at the Report tier and is not included in this diagnostic Snapshot.";

/**
 * Generate the Snapshot PDF. Returns the jsPDF instance — caller invokes .save()
 * to trigger download. Side-effect-free for future alternative dispositions
 * (email attach, server upload).
 *
 * @param {SnapshotOutput} output
 * @returns {jsPDF}
 */
export function generateSnapshotPDF(output) {
  // Defensive field checks — the allowlist is the contract, but we fail loudly
  // rather than producing a garbled PDF on a malformed engine output.
  requireField(output, "run_id");
  requireField(output, "indicative_score");
  requireField(output, "indicative_band");
  requireField(output, "heatmap");
  if (!Array.isArray(output.heatmap)) {
    throw new Error("Cannot generate Snapshot PDF: SnapshotOutput.heatmap is not an array.");
  }
  requireField(output, "gap_list");
  if (!Array.isArray(output.gap_list)) {
    throw new Error("Cannot generate Snapshot PDF: SnapshotOutput.gap_list is not an array.");
  }
  requireField(output, "generated_at");

  const doc = new jsPDF({ unit: "mm", format: "a4" });

  drawPageOne(doc, output);
  doc.addPage();
  drawPageTwo(doc, output);

  return doc;
}

/* -------------------------------------------------------------------------- */

function drawPageOne(/** @type {jsPDF} */ doc, /** @type {SnapshotOutput} */ output) {
  let y = MARGIN_MM;

  // (a) Wordmark header
  y = drawWordmark(doc, y);

  // (b) "DIAGNOSTIC SNAPSHOT" banner
  y += 4;
  setFill(doc, NAVY);
  doc.rect(MARGIN_MM, y, CONTENT_WIDTH_MM, 8, "F");
  setText(doc, WARM_WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_BODY);
  doc.text("DIAGNOSTIC SNAPSHOT — NOT INVESTOR-GRADE", MARGIN_MM + 4, y + 5.5);
  y += 12;

  // (c) Run ID + Generated. NOTE: SnapshotOutput allowlist does not include
  // project_id (it's stripped by the gate). run_id is the equivalent stable
  // identifier and is on the allowlist.
  setText(doc, MUTED_GREY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_FOOTNOTE);
  doc.text(`Run ID: ${output.run_id}`, MARGIN_MM, y);
  doc.text(`Generated: ${output.generated_at}`, MARGIN_MM, y + 4);
  y += 12;

  // (d) Headline: indicative score + band pill
  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_HEADLINE);
  doc.text(`${output.indicative_score} / 100`, MARGIN_MM, y + 6);

  // Band pill
  const bandRGB = bandColour(output.indicative_band);
  const pillX = MARGIN_MM + 50;
  const pillY = y;
  const pillW = 28;
  const pillH = 9;
  setFill(doc, bandRGB);
  doc.rect(pillX, pillY, pillW, pillH, "F");
  setText(doc, WARM_WHITE);
  doc.setFontSize(FONT_BODY);
  doc.text(output.indicative_band, pillX + pillW / 2, pillY + 6, { align: "center" });
  y += 16;

  // (e) Heatmap section
  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_SECTION);
  doc.text("Framework Assessment", MARGIN_MM, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_BODY);

  if (output.heatmap.length === 0) {
    setText(doc, MUTED_GREY);
    doc.text("No frameworks scored.", MARGIN_MM, y);
    y += 6;
  } else {
    const rowH = 8;
    const verdictPillW = 26;
    const verdictPillH = 6;
    for (const cell of output.heatmap) {
      // Row background (subtle)
      setFill(doc, [248, 246, 242]); // warm white
      doc.rect(MARGIN_MM, y, CONTENT_WIDTH_MM, rowH, "F");

      // Framework name (left)
      setText(doc, NAVY);
      doc.text(cell.framework, MARGIN_MM + 3, y + 5.5);

      // Verdict pill (right)
      const vRGB = verdictColour(cell.verdict);
      const vX = MARGIN_MM + CONTENT_WIDTH_MM - verdictPillW - 3;
      const vY = y + (rowH - verdictPillH) / 2;
      setFill(doc, vRGB);
      doc.rect(vX, vY, verdictPillW, verdictPillH, "F");
      setText(doc, WARM_WHITE);
      doc.setFontSize(FONT_FOOTNOTE);
      doc.text(cell.verdict, vX + verdictPillW / 2, vY + 4.2, { align: "center" });
      doc.setFontSize(FONT_BODY);

      y += rowH + 2;
    }
  }

  // (f) Safeguards footnote — NOT a heatmap row
  y += 4;
  setText(doc, MUTED_GREY);
  doc.setFontSize(FONT_FOOTNOTE);
  doc.setFont("helvetica", "italic");
  const safeguardsLines = doc.splitTextToSize(SAFEGUARDS_FOOTNOTE, CONTENT_WIDTH_MM);
  doc.text(safeguardsLines, MARGIN_MM, y);
  y += safeguardsLines.length * 3.5;
  doc.setFont("helvetica", "normal");

  // (g) Gap list section
  y += 6;
  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_SECTION);
  doc.text("Identified Gaps", MARGIN_MM, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_BODY);

  if (output.gap_list.length === 0) {
    const emptyText =
      "No gaps identified at Snapshot level. The Report tier assesses depth, " +
      "safeguards, and evidence quality.";
    const lines = doc.splitTextToSize(emptyText, CONTENT_WIDTH_MM);
    doc.text(lines, MARGIN_MM, y);
    y += lines.length * 5;
  } else {
    let gapNum = 1;
    for (const gap of output.gap_list) {
      const desc = gap.one_sentence_description ?? "(no description)";
      const numText = `${gapNum}.`;
      doc.text(numText, MARGIN_MM, y);
      const lines = doc.splitTextToSize(desc, CONTENT_WIDTH_MM - 8);
      doc.text(lines, MARGIN_MM + 8, y);
      y += lines.length * 5 + 1;
      gapNum += 1;
    }
  }

  // (h) Article 26 disclaimer footer
  drawArticle26Footer(doc);
}

/* -------------------------------------------------------------------------- */

function drawPageTwo(/** @type {jsPDF} */ doc, /** @type {SnapshotOutput} */ _output) {
  let y = MARGIN_MM;

  // (a) Wordmark header
  y = drawWordmark(doc, y);
  y += 6;

  // (b) "WHAT THE REPORT TIER DELIVERS" section
  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_SECTION);
  doc.text("What the Report tier delivers", MARGIN_MM, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_BODY);

  const intro =
    "The Capital Readiness Report is an investor-grade assessment designed " +
    "for inclusion in capital raise documentation. It is prepared and signed " +
    "by the Perennity Bridge CEO and includes:";
  const introLines = doc.splitTextToSize(intro, CONTENT_WIDTH_MM);
  doc.text(introLines, MARGIN_MM, y);
  y += introLines.length * 5 + 4;

  const bullets = [
    "A full minimum safeguards assessment under Article 18, including UNGC, OECD MNE Guidelines, and ILO core convention alignment.",
    "Substantive evidence review of declared metrics, not just threshold checks.",
    "A DNSH narrative addressing each environmental objective with regulatory citations.",
    "An IC Defence Pack: the rebuttal framing a sustainability-focused investment committee will require.",
    "Methodology version and engine commit SHA on every artifact for full audit traceability.",
  ];
  for (const bullet of bullets) {
    doc.text("•", MARGIN_MM, y);
    const lines = doc.splitTextToSize(bullet, CONTENT_WIDTH_MM - 6);
    doc.text(lines, MARGIN_MM + 5, y);
    y += lines.length * 5 + 1;
  }

  y += 3;
  const closing =
    "Single-project Reports are scoped to a defined assessment window and " +
    "engagement reference. Contact Perennity Bridge to initiate.";
  const closingLines = doc.splitTextToSize(closing, CONTENT_WIDTH_MM);
  doc.text(closingLines, MARGIN_MM, y);
  y += closingLines.length * 5;

  // (c) Provenance block — sourced from engine module, NOT from output
  // (SnapshotOutput's allowlist excludes the triple by design).
  y += 8;
  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_SECTION);
  doc.text("Provenance", MARGIN_MM, y);
  y += 6;

  const engineCommitSha = readEngineCommitSha();
  const kbHash = computeKnowledgeBaseHash(BUNDLED_ACTIVITIES);

  setText(doc, MUTED_GREY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_FOOTNOTE);
  doc.text(`Methodology version: ${METHODOLOGY_VERSION}`, MARGIN_MM, y);
  y += 4;
  doc.text(`Engine commit: ${engineCommitSha}`, MARGIN_MM, y);
  y += 4;
  doc.text(`Knowledge base hash: ${kbHash}`, MARGIN_MM, y);
  y += 4;

  // (d) Contact block
  y += 6;
  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_SECTION);
  doc.text("Contact", MARGIN_MM, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_BODY);
  doc.text("hello@perennitybridge.com", MARGIN_MM, y);
  y += 5;
  doc.text("perennitybridge.com", MARGIN_MM, y);

  // (e) Article 26 disclaimer footer
  drawArticle26Footer(doc);
}

/* -------------------------------------------------------------------------- */

function drawWordmark(/** @type {jsPDF} */ doc, /** @type {number} */ y) {
  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_SECTION);
  doc.text("PERENNITY BRIDGE", MARGIN_MM, y);
  setText(doc, MUTED_GREY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_FOOTNOTE);
  doc.text("Capital Readiness Platform", MARGIN_MM, y + 4);
  return y + 8;
}

function drawArticle26Footer(/** @type {jsPDF} */ doc) {
  setText(doc, MUTED_GREY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_FOOTNOTE);
  const lines = doc.splitTextToSize(ARTICLE_26, CONTENT_WIDTH_MM);
  const footerY = PAGE_HEIGHT_MM - MARGIN_MM;
  doc.text(lines, MARGIN_MM, footerY);
}

function bandColour(/** @type {string} */ band) {
  if (band === "Green") return PASS_GREEN;
  if (band === "Amber") return PARTIAL_AMBER;
  if (band === "Red") return FAIL_RED;
  return MUTED_GREY;
}

function verdictColour(/** @type {string} */ verdict) {
  if (verdict === "pass") return PASS_GREEN;
  if (verdict === "fail") return FAIL_RED;
  // partial, data_missing, anything else → amber
  return PARTIAL_AMBER;
}

function setText(/** @type {jsPDF} */ doc, /** @type {number[]} */ rgb) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function setFill(/** @type {jsPDF} */ doc, /** @type {number[]} */ rgb) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

function requireField(
  /** @type {Record<string, unknown>} */ output,
  /** @type {string} */ field,
) {
  if (output[field] === undefined || output[field] === null) {
    throw new Error(
      `Cannot generate Snapshot PDF: SnapshotOutput.${field} is missing or empty.`,
    );
  }
}

function readEngineCommitSha() {
  // Set by vite.config.js define(); falls back to a clear marker if missing.
  // engineClient.js throws on missing in production; here we render the marker
  // so a faulty build is visible in the PDF rather than silently rendering ''.
  // The typeof-guard is needed for node-side test contexts where
  // import.meta.env is undefined (no Vite to substitute it).
  const env =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env
      : undefined;
  const sha = env && env.VITE_ENGINE_COMMIT_SHA;
  return typeof sha === "string" && sha.length > 0 ? sha : "(unset)";
}
