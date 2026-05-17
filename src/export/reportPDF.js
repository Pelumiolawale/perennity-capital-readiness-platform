// @ts-check
/**
 * @typedef {import('@perennity/engine').ReportOutput} ReportOutput
 * @typedef {import('@perennity/engine').ReportSection} ReportSection
 * @typedef {import('@perennity/engine').PUESummary} PUESummary
 */

const AUTHORITY_LABELS = {
  1: "Regulatory",
  2: "Perennity Bridge methodology",
  3: "Informational",
};

import { jsPDF } from "jspdf";

// ----------------------------------------------------------------------------
// Day 5 Commit 3 — Report PDF generator (paid tier).
//
// 6–9 page defence-brief structured document. Consumes ReportOutput from the
// engine's ReportRenderer.render(). All primitives, brand palette and helper
// shape mirror snapshotPDF.js — consistency is load-bearing for future
// maintainers.
//
// Three placeholders are deliberately deferred to a later commit:
//   1. Signature image embed (rendered as a labelled placeholder zone).
//   2. Engine-side [VERBATIM TEXT TO BE INSERTED] excerpts (engine concern).
//   3. IC Defence Pack questions[] when the engine's Q&A builder ships
//      (renders an "in development" placeholder when the array is empty).
//
// Unlike SnapshotOutput, ReportOutput exposes methodology_version,
// engine_commit_sha and knowledge_base_hash directly (paid-tier exposable),
// so the provenance triple is read from `output` rather than from the
// engine module.
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
const FONT_TITLE = 20;
const FONT_SECTION = 14;
const FONT_BODY = 10;
const FONT_FOOTNOTE = 8;

// Reserved vertical band at the bottom of every page for the footer (top
// row + wrapped Article 26 disclaimer). Content rendering must stop at
// PAGE_HEIGHT_MM - MARGIN_MM - FOOTER_BAND_HEIGHT_MM and addPage() to
// continue.
const FOOTER_BAND_HEIGHT_MM = 22;

/**
 * Generate the paid-tier Report PDF. Returns the jsPDF instance — caller
 * invokes .save() to trigger download. Side-effect-free for future
 * alternative dispositions (server upload, email attach).
 *
 * @param {ReportOutput} output
 * @param {{
 *   client_name?: string | null,
 *   project_name?: string | null,
 *   project_id?: string | null,
 *   engagement_letter_signed?: boolean | null,
 *   engagement_letter_date?: string | null,
 * } | null | undefined} engagementMetadata
 * @returns {jsPDF}
 */
export function generateReportPDF(output, engagementMetadata) {
  // Defensive field checks — ReportOutput is not gated by a closed
  // allowlist (unlike SnapshotOutput), but we still fail loudly on missing
  // fields rather than producing a garbled audit-bearing artifact.
  requireField(output, "run_id");
  requireField(output, "engagement_reference");
  requireField(output, "methodology_version");
  requireField(output, "sections");
  if (!Array.isArray(output.sections)) {
    throw new Error(
      "Cannot generate Report PDF: ReportOutput.sections is not an array.",
    );
  }
  requireField(output, "disclaimer");
  requireField(output, "signatory");
  requireField(output, "knowledge_base_hash");
  requireField(output, "engine_commit_sha");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const meta = engagementMetadata || {};

  // Find sections by section_id (engine emits all five in fixed order, but
  // route by ID rather than index in case the engine ever changes order).
  const findSection = (id) =>
    output.sections.find((s) => s.section_id === id) || null;
  const situation = findSection("situation");
  const frameworks = findSection("frameworks_applied");
  const evidence = findSection("evidence_presented");
  const conclusions = findSection("conclusions");
  const residual = findSection("residual_disclosure");

  // Page 1 — cover
  drawCoverPage(doc, output, meta);

  // Pages 2-6 — five narrative sections. Each section may overflow into a
  // continuation page (handled internally by drawSectionPage).
  doc.addPage();
  drawSectionPage(doc, situation, "Situation", { showReferences: false });

  doc.addPage();
  drawSectionPage(doc, frameworks, "Frameworks Applied", { showReferences: true });

  if (output.pue_summary) {
    doc.addPage();
    drawPueSummaryPage(doc, output.pue_summary);
  }

  doc.addPage();
  drawSectionPage(doc, evidence, "Evidence Presented", { showReferences: true });

  doc.addPage();
  drawSectionPage(doc, conclusions, "Conclusions", { showReferences: true });

  doc.addPage();
  drawSectionPage(doc, residual, "Residual Disclosure", { showReferences: false });

  // Page 7 — evidence log
  doc.addPage();
  drawEvidenceLogPage(doc, output.evidence_log || []);

  // Page 8 — IC Defence Pack + provenance block at bottom
  doc.addPage();
  drawIcDefencePackPage(doc, output);

  // Footers on every page (now that totalPages is known).
  const totalPages = doc.internal.getNumberOfPages();
  for (let n = 1; n <= totalPages; n++) {
    doc.setPage(n);
    renderFooter(doc, output, n, totalPages);
  }

  return doc;
}

/* -------------------------------------------------------------------------- */
/* Page 1 — cover                                                              */
/* -------------------------------------------------------------------------- */

function drawCoverPage(
  /** @type {jsPDF} */ doc,
  /** @type {ReportOutput} */ output,
  /** @type {Record<string, unknown>} */ meta,
) {
  let y = MARGIN_MM;

  // Wordmark header
  y = drawWordmark(doc, y);

  // Title
  y += 18;
  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_TITLE);
  doc.text("Project Readiness Report", MARGIN_MM, y);
  y += 4;
  setText(doc, MUTED_GREY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_FOOTNOTE);
  doc.text("Investor-grade — signed", MARGIN_MM, y);
  y += 14;

  // Engagement reference block (audit-bearing — full UUID)
  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_BODY);
  doc.text("Engagement reference", MARGIN_MM, y);
  y += 5;
  setText(doc, NAVY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_BODY);
  doc.text(output.engagement_reference, MARGIN_MM, y);
  y += 10;

  // Client / project block
  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_BODY);
  doc.text("Client", MARGIN_MM, y);
  y += 5;
  setText(doc, NAVY);
  doc.setFont("helvetica", "normal");
  doc.text(coalesce(meta.client_name), MARGIN_MM, y);
  y += 8;

  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.text("Project", MARGIN_MM, y);
  y += 5;
  setText(doc, NAVY);
  doc.setFont("helvetica", "normal");
  doc.text(coalesce(meta.project_name), MARGIN_MM, y);
  y += 4;
  setText(doc, MUTED_GREY);
  doc.setFontSize(FONT_FOOTNOTE);
  doc.text(`Project ID: ${coalesce(meta.project_id)}`, MARGIN_MM, y);
  y += 8;

  // Engagement letter status
  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_BODY);
  doc.text("Engagement letter", MARGIN_MM, y);
  y += 5;
  setText(doc, NAVY);
  doc.setFont("helvetica", "normal");
  const signedLabel = boolLabel(meta.engagement_letter_signed);
  const dateLabel = coalesce(meta.engagement_letter_date);
  doc.text(`Signed: ${signedLabel}    Date: ${dateLabel}`, MARGIN_MM, y);
  y += 8;

  // Generated date (ISO → render the date portion only)
  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.text("Generated", MARGIN_MM, y);
  y += 5;
  setText(doc, NAVY);
  doc.setFont("helvetica", "normal");
  doc.text(isoToDate(output.generated_at), MARGIN_MM, y);

  // Signatory block — positioned in the lower third of the cover, well
  // above the footer band.
  const signatoryTopY = PAGE_HEIGHT_MM - MARGIN_MM - FOOTER_BAND_HEIGHT_MM - 50;
  let sy = signatoryTopY;

  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_BODY);
  doc.text("Signed", MARGIN_MM, sy);
  sy += 7;

  // Name
  setText(doc, NAVY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_BODY);
  doc.text(coalesce(output.signatory.name), MARGIN_MM, sy);
  sy += 5;

  // Title
  setText(doc, MUTED_GREY);
  doc.setFontSize(FONT_FOOTNOTE);
  doc.text(coalesce(output.signatory.title), MARGIN_MM, sy);
  sy += 8;

  // Signature block placeholder zone
  setFill(doc, WARM_WHITE);
  doc.rect(MARGIN_MM, sy, CONTENT_WIDTH_MM, 14, "F");
  setText(doc, MUTED_GREY);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(FONT_FOOTNOTE);
  doc.text(
    "[signature block — to be embedded]",
    MARGIN_MM + CONTENT_WIDTH_MM / 2,
    sy + 8.5,
    { align: "center" },
  );
}

/* -------------------------------------------------------------------------- */
/* Sections (pages 2-6) — narrative with optional references list             */
/* -------------------------------------------------------------------------- */

function drawSectionPage(
  /** @type {jsPDF} */ doc,
  /** @type {ReportSection | null} */ section,
  /** @type {string} */ fallbackHeading,
  /** @type {{ showReferences: boolean }} */ opts,
) {
  let y = MARGIN_MM;
  y = drawWordmark(doc, y);
  y += 8;

  if (!section) {
    // Engine omitted this section — surface, don't silently skip.
    setText(doc, NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(FONT_SECTION);
    doc.text(fallbackHeading, MARGIN_MM, y);
    y += 8;
    setText(doc, MUTED_GREY);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(FONT_BODY);
    doc.text("Section omitted by the engine.", MARGIN_MM, y);
    return;
  }

  // Heading
  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_SECTION);
  doc.text(section.heading || fallbackHeading, MARGIN_MM, y);
  y += 8;

  // Narrative
  setText(doc, NAVY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_BODY);
  const narrativeLines = doc.splitTextToSize(
    section.narrative || "",
    CONTENT_WIDTH_MM,
  );
  doc.text(narrativeLines, MARGIN_MM, y);
  y += narrativeLines.length * 5 + 6;

  // References
  if (opts.showReferences && Array.isArray(section.references)) {
    for (const ref of section.references) {
      // Estimate the block height needed: ~4mm framework + ~4mm sub-ref +
      // wrapped excerpt + spacing. Compute the wrap up front so we can
      // overflow-check accurately.
      const excerptLines = doc.splitTextToSize(
        ref.source_text_excerpt || "",
        CONTENT_WIDTH_MM,
      );
      const blockHeight = 5 + 4 + excerptLines.length * 5 + 5;

      if (y + blockHeight > PAGE_HEIGHT_MM - MARGIN_MM - FOOTER_BAND_HEIGHT_MM) {
        doc.addPage();
        y = MARGIN_MM;
        y = drawWordmark(doc, y);
        y += 8;
      }

      // Framework name (bold navy)
      setText(doc, NAVY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(FONT_BODY);
      doc.text(ref.framework || "", MARGIN_MM, y);
      y += 5;

      // source_reference (italic muted)
      setText(doc, MUTED_GREY);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(FONT_FOOTNOTE);
      doc.text(ref.source_reference || "", MARGIN_MM, y);
      y += 4;

      // Verbatim excerpt
      setText(doc, NAVY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(FONT_BODY);
      doc.text(excerptLines, MARGIN_MM, y);
      y += excerptLines.length * 5 + 5;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* PUE measurement compliance — side-by-side declared vs verdict              */
/* -------------------------------------------------------------------------- */

function drawPueSummaryPage(
  /** @type {jsPDF} */ doc,
  /** @type {PUESummary} */ pue,
) {
  let y = MARGIN_MM;
  y = drawWordmark(doc, y);
  y += 8;

  // Heading
  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_SECTION);
  doc.text("PUE Measurement Compliance", MARGIN_MM, y);
  y += 8;

  const GUTTER = 6;
  const colWidth = (CONTENT_WIDTH_MM - GUTTER) / 2;
  const leftX = MARGIN_MM;
  const rightX = MARGIN_MM + colWidth + GUTTER;
  const headerHeight = 9;
  const declaredAuthority = pue.verdict?.authority_level;

  // Left header — Declared (intake)
  setFill(doc, NAVY);
  doc.rect(leftX, y, colWidth, headerHeight, "F");
  setText(doc, WARM_WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_BODY);
  doc.text("Declared (intake)", leftX + 3, y + 6);
  if (declaredAuthority) {
    drawAuthorityBadge(doc, leftX + colWidth - 3, y + headerHeight / 2, declaredAuthority, "right");
  }

  // Right header — Verdict (engine)
  setFill(doc, NAVY);
  doc.rect(rightX, y, colWidth, headerHeight, "F");
  setText(doc, WARM_WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_BODY);
  doc.text("Verdict (engine)", rightX + 3, y + 6);
  if (declaredAuthority) {
    drawAuthorityBadge(doc, rightX + colWidth - 3, y + headerHeight / 2, declaredAuthority, "right");
  }

  y += headerHeight;

  // Body backgrounds
  const bodyTopY = y;
  const bodyPad = 4;
  let leftY = y + bodyPad + 4;
  let rightY = y + bodyPad + 4;

  // Left body content
  setText(doc, NAVY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_BODY);
  leftY = drawStatLine(doc, leftX + bodyPad, leftY, colWidth - 2 * bodyPad, "Methodology", humanise(pue.declared.methodology));
  leftY = drawStatLine(doc, leftX + bodyPad, leftY, colWidth - 2 * bodyPad, "Category", humanise(pue.declared.category));
  leftY = drawStatLine(doc, leftX + bodyPad, leftY, colWidth - 2 * bodyPad, "Boundary documented", boolLabel(pue.declared.boundary_documented));
  leftY = drawStatLine(doc, leftX + bodyPad, leftY, colWidth - 2 * bodyPad, "Reporting basis", humanise(pue.declared.reporting_basis));

  // Right body content — verdict label, gap_summary, missing_items, evidence count
  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_BODY);
  doc.text("Verdict:", rightX + bodyPad, rightY);
  setText(doc, verdictColour(pue.verdict.label));
  doc.text(humanise(pue.verdict.label), rightX + bodyPad + 18, rightY);
  rightY += 6;

  setText(doc, NAVY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_BODY);
  const gapLines = doc.splitTextToSize(pue.verdict.gap_summary || "—", colWidth - 2 * bodyPad);
  doc.text(gapLines, rightX + bodyPad, rightY);
  rightY += gapLines.length * 5 + 4;

  if (Array.isArray(pue.verdict.missing_items) && pue.verdict.missing_items.length > 0) {
    setText(doc, MUTED_GREY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(FONT_FOOTNOTE);
    doc.text("Missing:", rightX + bodyPad, rightY);
    rightY += 4;
    doc.setFont("helvetica", "normal");
    for (const item of pue.verdict.missing_items) {
      const itemLines = doc.splitTextToSize(`• ${humanise(item)}`, colWidth - 2 * bodyPad - 2);
      doc.text(itemLines, rightX + bodyPad + 2, rightY);
      rightY += itemLines.length * 4;
    }
    rightY += 2;
  }

  setText(doc, MUTED_GREY);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(FONT_FOOTNOTE);
  doc.text(
    `Evidence references: ${pue.verdict.evidence_refs_count}`,
    rightX + bodyPad,
    rightY,
  );
  rightY += 4;

  // Draw the body backgrounds (after content so we know how tall they are).
  // jsPDF doesn't draw behind existing content, so we use unfilled borders.
  const bodyHeight = Math.max(leftY - bodyTopY, rightY - bodyTopY) + bodyPad;
  setText(doc, NAVY); // no-op; clears any leftover colour
  doc.setDrawColor(221, 213, 202); // border #DDD5CA
  doc.setLineWidth(0.2);
  doc.rect(leftX, bodyTopY, colWidth, bodyHeight, "S");
  doc.rect(rightX, bodyTopY, colWidth, bodyHeight, "S");
}

function drawStatLine(
  /** @type {jsPDF} */ doc,
  /** @type {number} */ x,
  /** @type {number} */ y,
  /** @type {number} */ width,
  /** @type {string} */ label,
  /** @type {string} */ value,
) {
  setText(doc, MUTED_GREY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_FOOTNOTE);
  doc.text(label, x, y);
  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_BODY);
  const valueLines = doc.splitTextToSize(value, width);
  doc.text(valueLines, x, y + 4);
  return y + 4 + valueLines.length * 5 + 3;
}

function drawAuthorityBadge(
  /** @type {jsPDF} */ doc,
  /** @type {number} */ x,
  /** @type {number} */ centerY,
  /** @type {1 | 2 | 3} */ level,
  /** @type {"left" | "right"} */ align,
) {
  const label = AUTHORITY_LABELS[level];
  if (!label) return;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_FOOTNOTE);
  const textW = doc.getTextWidth(label);
  const padX = 2;
  const padY = 1.2;
  const w = textW + 2 * padX;
  const h = 4.5;
  const rectX = align === "right" ? x - w : x;
  const rectY = centerY - h / 2;
  doc.setDrawColor(248, 246, 242); // warm-white border on navy bg
  doc.setLineWidth(0.2);
  doc.setFillColor(248, 246, 242);
  doc.roundedRect(rectX, rectY, w, h, 1, 1, "FD");
  setText(doc, NAVY);
  doc.text(label, rectX + padX, rectY + h - padY);
}

// Turn snake_case engine values like "EN_50600_4_2" or "data_missing" into
// human-readable strings. Leaves already-spaced strings alone.
function humanise(/** @type {string | null | undefined} */ value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replace(/_/g, " ");
}

/* -------------------------------------------------------------------------- */
/* Page 7 — Evidence Log                                                       */
/* -------------------------------------------------------------------------- */

function drawEvidenceLogPage(
  /** @type {jsPDF} */ doc,
  /** @type {any[]} */ evidenceLog,
) {
  let y = MARGIN_MM;
  y = drawWordmark(doc, y);
  y += 8;

  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_SECTION);
  doc.text("Evidence Log", MARGIN_MM, y);
  y += 8;

  if (!Array.isArray(evidenceLog) || evidenceLog.length === 0) {
    setText(doc, MUTED_GREY);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(FONT_BODY);
    doc.text("No evidence documents on file.", MARGIN_MM, y);
    return;
  }

  for (const entry of evidenceLog) {
    // Overflow guard — each entry is ~4 lines.
    if (y + 20 > PAGE_HEIGHT_MM - MARGIN_MM - FOOTER_BAND_HEIGHT_MM) {
      doc.addPage();
      y = MARGIN_MM;
      y = drawWordmark(doc, y);
      y += 8;
    }

    // document_id (bold)
    setText(doc, NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(FONT_BODY);
    doc.text(coalesce(entry.document_id), MARGIN_MM, y);
    y += 5;

    // sha256 (truncated, muted)
    setText(doc, MUTED_GREY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(FONT_FOOTNOTE);
    const shaTrunc = truncate12(entry.document_sha256);
    doc.text(`sha256: ${shaTrunc}`, MARGIN_MM, y);
    y += 4;

    // fields_supported (joined, or em-dash)
    const fields = Array.isArray(entry.fields_supported)
      ? entry.fields_supported
      : [];
    const supportsLabel = fields.length > 0 ? fields.join(", ") : "—";
    doc.text(`Supports: ${supportsLabel}`, MARGIN_MM, y);
    y += 4;

    // ingested_at
    doc.text(`Ingested: ${coalesce(entry.ingested_at)}`, MARGIN_MM, y);
    y += 8; // spacing between entries
  }
}

/* -------------------------------------------------------------------------- */
/* Page 8 — IC Defence Pack + provenance                                       */
/* -------------------------------------------------------------------------- */

function drawIcDefencePackPage(
  /** @type {jsPDF} */ doc,
  /** @type {ReportOutput} */ output,
) {
  let y = MARGIN_MM;
  y = drawWordmark(doc, y);
  y += 8;

  // Heading
  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_SECTION);
  doc.text("IC Defence Pack — Q&A", MARGIN_MM, y);
  y += 8;

  const pack = output.ic_defence_pack || { pack_version: "", questions: [] };

  // Pack version subheading
  setText(doc, MUTED_GREY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_FOOTNOTE);
  doc.text(`Pack version: ${coalesce(pack.pack_version)}`, MARGIN_MM, y);
  y += 8;

  const questions = Array.isArray(pack.questions) ? pack.questions : [];

  if (questions.length === 0) {
    setText(doc, MUTED_GREY);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(FONT_BODY);
    const placeholder =
      "IC Defence Pack — Q&A library in development. See engine repo for status.";
    const lines = doc.splitTextToSize(placeholder, CONTENT_WIDTH_MM);
    doc.text(lines, MARGIN_MM, y);
    y += lines.length * 5 + 4;
  } else {
    for (const q of questions) {
      // Pre-compute heights for overflow check.
      const questionLines = doc.splitTextToSize(
        q.question || "",
        CONTENT_WIDTH_MM,
      );
      const answerLines = doc.splitTextToSize(
        q.answer || "",
        CONTENT_WIDTH_MM - 6,
      );
      const blockHeight =
        6 + questionLines.length * 5 + 4 + answerLines.length * 5 + 8;

      if (y + blockHeight > PAGE_HEIGHT_MM - MARGIN_MM - FOOTER_BAND_HEIGHT_MM - 30) {
        doc.addPage();
        y = MARGIN_MM;
        y = drawWordmark(doc, y);
        y += 8;
      }

      // q_id + ic_voice tag
      setText(doc, NAVY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(FONT_BODY);
      const voiceTag = (q.ic_voice || "").toUpperCase();
      doc.text(`${coalesce(q.q_id)}  [${voiceTag}]`, MARGIN_MM, y);
      y += 5;

      // Question
      doc.setFont("helvetica", "normal");
      doc.text(questionLines, MARGIN_MM, y);
      y += questionLines.length * 5 + 3;

      // Answer (indented)
      setText(doc, MUTED_GREY);
      doc.setFont("helvetica", "bold");
      doc.text("Answer:", MARGIN_MM, y);
      y += 4;
      setText(doc, NAVY);
      doc.setFont("helvetica", "normal");
      doc.text(answerLines, MARGIN_MM + 6, y);
      y += answerLines.length * 5 + 3;

      // Evidence refs + template ref (muted)
      setText(doc, MUTED_GREY);
      doc.setFontSize(FONT_FOOTNOTE);
      const evRefs = Array.isArray(q.evidence_refs) ? q.evidence_refs : [];
      const evRefsLabel = evRefs.length > 0 ? evRefs.join(", ") : "—";
      doc.text(`Evidence: ${evRefsLabel}`, MARGIN_MM, y);
      y += 4;
      doc.text(`Template: ${coalesce(q.template_ref)}`, MARGIN_MM, y);
      y += 8;
    }
  }

  // Provenance block — audit-bearing per CLAUDE.md. Reserve room above
  // the footer; if not enough, push to a new page.
  const provBlockHeight = 6 + 4 + 4 + 4;
  if (y + provBlockHeight > PAGE_HEIGHT_MM - MARGIN_MM - FOOTER_BAND_HEIGHT_MM) {
    doc.addPage();
    y = MARGIN_MM;
    y = drawWordmark(doc, y);
    y += 8;
  } else {
    y += 6;
  }

  setText(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_SECTION);
  doc.text("Provenance", MARGIN_MM, y);
  y += 6;

  setText(doc, MUTED_GREY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_FOOTNOTE);
  doc.text(`Methodology version: ${output.methodology_version}`, MARGIN_MM, y);
  y += 4;
  doc.text(`Engine commit: ${output.engine_commit_sha}`, MARGIN_MM, y);
  y += 4;
  doc.text(`Knowledge base hash: ${output.knowledge_base_hash}`, MARGIN_MM, y);
}

/* -------------------------------------------------------------------------- */
/* Footer (every page)                                                         */
/* -------------------------------------------------------------------------- */

function renderFooter(
  /** @type {jsPDF} */ doc,
  /** @type {ReportOutput} */ output,
  /** @type {number} */ pageNum,
  /** @type {number} */ totalPages,
) {
  setText(doc, MUTED_GREY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_FOOTNOTE);

  // Top row at FOOTER_BAND_HEIGHT_MM above page bottom: engagement |
  // methodology | page n of N. Engagement is truncated to first 8 chars +
  // ellipsis in the footer (the full UUID is on the cover page) to keep the
  // three-column layout from colliding at 8pt — the full reference is
  // audit-bearing only on the cover. The 8-char short form also matches the
  // filename short-ref so the footer stamp, filename, and ?ref= URL param
  // read as one identifier across surfaces.
  const rowY = PAGE_HEIGHT_MM - FOOTER_BAND_HEIGHT_MM;
  const engShort = String(output.engagement_reference || "").slice(0, 8);
  doc.text(
    `Engagement: ${engShort}…`,
    MARGIN_MM,
    rowY,
  );
  // METHODOLOGY_VERSION already includes the "v" prefix (e.g. "v3.1-2026-04"),
  // so don't double it.
  doc.text(
    `Methodology ${output.methodology_version}`,
    PAGE_WIDTH_MM / 2,
    rowY,
    { align: "center" },
  );
  doc.text(
    `Page ${pageNum} of ${totalPages}`,
    PAGE_WIDTH_MM - MARGIN_MM,
    rowY,
    { align: "right" },
  );

  // Article 26 disclaimer below the top row, wrapped.
  const disclaimerLines = doc.splitTextToSize(
    output.disclaimer,
    CONTENT_WIDTH_MM,
  );
  doc.text(disclaimerLines, MARGIN_MM, rowY + 5);
}

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
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

function setText(/** @type {jsPDF} */ doc, /** @type {number[]} */ rgb) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function setFill(/** @type {jsPDF} */ doc, /** @type {number[]} */ rgb) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

function verdictColour(/** @type {string} */ verdict) {
  if (verdict === "pass") return PASS_GREEN;
  if (verdict === "fail") return FAIL_RED;
  return PARTIAL_AMBER;
}

function requireField(
  /** @type {Record<string, unknown>} */ output,
  /** @type {string} */ field,
) {
  if (output[field] === undefined || output[field] === null) {
    throw new Error(
      `Cannot generate Report PDF: ReportOutput.${field} is missing or empty.`,
    );
  }
}

// Render null/undefined/empty as em-dash. Otherwise stringify.
function coalesce(value) {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

// Render booleans as Yes/No; nulls as em-dash.
function boolLabel(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

// Truncate a sha256 hex string to first 12 chars + ellipsis. Tolerates
// the "sha256:" prefix the engine sometimes emits.
function truncate12(value) {
  if (!value || typeof value !== "string") return "—";
  const stripped = value.startsWith("sha256:") ? value.slice(7) : value;
  if (stripped.length <= 12) return stripped;
  return `${stripped.slice(0, 12)}…`;
}

// Strip the time portion of an ISO 8601 string, returning YYYY-MM-DD.
// Falls back to the original string if it doesn't look like ISO.
function isoToDate(value) {
  if (!value || typeof value !== "string") return "—";
  const tIndex = value.indexOf("T");
  return tIndex > 0 ? value.slice(0, tIndex) : value;
}

// TEAL still reserved for future use (IC Defence Pack verdict pills).
void TEAL;
