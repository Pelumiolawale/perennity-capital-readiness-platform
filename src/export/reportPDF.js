// @ts-check
/**
 * @typedef {import('@perennity/engine').ReportOutput} ReportOutput
 * @typedef {import('@perennity/engine').ReportSection} ReportSection
 * @typedef {import('@perennity/engine').PUESummary} PUESummary
 * @typedef {import('../types/renderContract.js').RenderContract} RenderContract
 * @typedef {import('../types/renderContract.js').FrameworkFinding} FrameworkFinding
 * @typedef {import('../types/renderContract.js').CriterionVerdict} CriterionVerdict
 */

const AUTHORITY_LABELS = {
  1: "Regulatory",
  2: "Perennity Bridge methodology",
  3: "Informational",
};

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { snapshotPhraseFor } from "../lib/snapshotPhrases.js";
import { embedPBFonts, applyType, TYPE, INK } from "./reportTypography.js";
import logoUrl from "../assets/pb_cover_logo.png";
import {
  prependFixedFootnote,
  processBodyText,
  setCurrentPage,
  flushCurrentPage,
  renderFootnotesForPage,
  _resetAllForTests as resetFootnoteEngine,
} from "./footnoteEngine.js";

// Shared table style block per pb-product-design report-design.md.
// Applied to drawSFDRSectionPage + drawPueSummaryPage. Reads directly from
// the canonical TYPE / INK tokens — autotable wants plain RGB arrays and
// string font names rather than the applyType() helper, so the mapping is
// done inline at module load.
//
// jsPDF-autotable freezes the style object internally on first use, so we
// spread INK.* arrays into mutable copies; autotable mutates `lineColor`
// on row borders.
function rgb(token) { return [token[0], token[1], token[2]]; }

const TABLE_STYLE = {
  theme: "plain",
  headStyles: {
    fillColor: rgb(INK.surfaceTint),
    textColor: rgb(INK.inkMuted),
    font: TYPE.tableHeader.font,
    fontStyle: TYPE.tableHeader.weight,
    fontSize: TYPE.tableHeader.size,
    cellPadding: { top: 2.2, right: 2.5, bottom: 2.2, left: 2.5 },
    halign: "left",
    lineColor: rgb(INK.hairline),
    lineWidth: 0.5,
  },
  bodyStyles: {
    font: TYPE.tableBody.font,
    fontStyle: TYPE.tableBody.weight,
    fontSize: TYPE.tableBody.size,
    textColor: rgb(INK.navy),
    cellPadding: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
    lineColor: rgb(INK.hairline),
    lineWidth: 0.5,
    valign: "top",
  },
  styles: {
    lineColor: rgb(INK.hairline),
    lineWidth: 0.5,
    overflow: "linebreak",
  },
};

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

// Brand colours and type scale read from INK.* / TYPE.* — the canonical
// tokens in reportTypography.js. No shadowed constants here: a font-size
// bump in the spec must propagate to every call site, and the only way to
// guarantee that is to make this file read-through to the token module.

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
 * As of v0.5.0-alpha.8 (Phase 1, commit 1.5a Phase B-3) this function
 * accepts an optional `renderContract` arg. When present and carrying
 * SFDR framework_findings, the PDF inserts one SFDR section per finding
 * (Art 8 with 7 rows, Art 9 with 10 rows) between the existing
 * "Frameworks Applied" / PUE summary pages and the "Evidence Presented"
 * page. The existing EU Tax 8.1 narrative sections continue to read from
 * `output` (ReportOutput shape) unchanged.
 *
 * As of v0.5.0 (Phase 1 commit 1.4d typography redesign) this function is
 * async — embedPBFonts loads Source Serif 4 + Source Sans 3 from the
 * Vite asset pipeline and registers them into jsPDF's font registry
 * before any drawing begins. Callers must await the Promise<jsPDF>.
 *
 * @param {ReportOutput} output
 * @param {{
 *   client_name?: string | null,
 *   project_name?: string | null,
 *   project_id?: string | null,
 *   engagement_letter_signed?: boolean | null,
 *   engagement_letter_date?: string | null,
 *   target_label?: string | null,
 * } | null | undefined} engagementMetadata
 * @param {RenderContract | null | undefined} [renderContract] Optional v3.5 SFDR contract.
 * @returns {Promise<jsPDF>}
 */
export async function generateReportPDF(output, engagementMetadata, renderContract) {
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
  // 1.4d: embed Source Serif 4 (body) and Source Sans 3 (headings, exposed
  // as PB-Serif / PB-Sans inside the jsPDF font registry) before any
  // drawing. All downstream setFont calls reference PB-Serif / PB-Sans.
  const [, logoBase64] = await Promise.all([
    embedPBFonts(doc),
    loadLogoBase64(),
  ]);
  // 1.4e: reset the footnote engine for this generation pass and register
  // the Article 26 disclaimer as a fixed footnote that re-fires on every
  // non-cover page as footnote 1. The disclaimer is the institutional
  // regulatory-scoping caveat and belongs at the bottom of every body page.
  resetFootnoteEngine();
  // The disclaimer text already contains "Article 26 of Regulation (EU)
  // 2020/852" inline (see src/lib/disclaimers.js ARTICLE_26_DISCLAIMER) —
  // do NOT re-append the citation parenthetical, that produces a duplicate
  // at the end of footnote 1. The auto-citation registry in footnoteEngine
  // also has a pattern entry for "Article 26 of Regulation (EU) 2020/852"
  // for body text that mentions it; the fixed footnote here is the
  // institutional regulatory-scoping caveat and stands on its own.
  prependFixedFootnote(output.disclaimer);
  const meta = engagementMetadata || {};

  // product_label-only target labels (SFDR Art 8/9, UK SDR Focus/
  // Improvers/Impact) skip the legacy "Frameworks Applied" / "PUE
  // summary" / "Evidence Presented" pages because those sections are
  // populated from the engine's legacy ReportRenderer output, which
  // enumerates EVERY framework_result — including EU Tax 8.1, which is
  // always loaded as a baseline for product_label scopes. For an
  // engagement scoped to a product_label only, the customer-facing PDF
  // should not surface EU-Tax-specific narrative pages; the
  // framework_findings section pages (rendered from the RenderContract)
  // cover the equivalent role. eu_taxonomy_aligned_8_1 keeps current
  // behaviour.
  const productLabelOnly = isProductLabelOnlyLabel(meta.target_label);

  // Find sections by section_id (engine emits all five in fixed order, but
  // route by ID rather than index in case the engine ever changes order).
  const findSection = (id) =>
    output.sections.find((s) => s.section_id === id) || null;
  const situation = findSection("situation");
  const frameworks = findSection("frameworks_applied");
  const evidence = findSection("evidence_presented");
  const conclusions = findSection("conclusions");
  const residual = findSection("residual_disclosure");

  // Per-page section name registry. Each section records the page on which
  // it started; renderFooter looks up the section name for any given page
  // by finding the largest startPage ≤ pageNumber. Section continuation
  // pages (from doc.addPage() calls inside the body of drawSectionPage)
  // inherit the same section name automatically.
  /** @type {Array<{ startPage: number, name: string }>} */
  const pageSections = [];
  const stampSection = (name) => {
    pageSections.push({
      startPage: doc.internal.getCurrentPageInfo().pageNumber,
      name,
    });
  };

  // Page 1 — cover
  drawCoverPage(doc, output, meta, logoBase64);

  // Pages 2-6 — five narrative sections. Each section may overflow into a
  // continuation page (handled internally by drawSectionPage).
  doc.addPage();
  stampSection("Situation");
  drawSectionPage(doc, situation, "Situation", { showReferences: false });

  if (!productLabelOnly) {
    doc.addPage();
    stampSection("Frameworks Applied");
    drawSectionPage(doc, frameworks, "Frameworks Applied", { showReferences: true });

    if (output.pue_summary) {
      doc.addPage();
      stampSection("PUE Measurement Compliance");
      drawPueSummaryPage(doc, output.pue_summary);
    }
  }

  // product_label section pages — render conditionally per the loaded
  // framework set. Inserts AFTER "Frameworks Applied" (and PUE summary
  // if present) and BEFORE "Evidence Presented" so the regulatory-regime
  // finding pages group together in the reader's mental model.
  if (renderContract && Array.isArray(renderContract.framework_findings)) {
    for (const finding of renderContract.framework_findings) {
      doc.addPage();
      stampSection(
        FRAMEWORK_FINDING_HEADINGS[finding.framework] || finding.framework,
      );
      drawSFDRSectionPage(doc, finding);
    }
  }

  if (!productLabelOnly) {
    doc.addPage();
    stampSection("Evidence Presented");
    drawSectionPage(doc, evidence, "Evidence Presented", { showReferences: true });
  }

  const filteredConclusions = conclusions ? {
    ...conclusions,
    narrative: filterConclusionsNarrative(conclusions.narrative, meta.target_label, renderContract),
  } : conclusions;
  doc.addPage();
  stampSection("Conclusions");
  drawSectionPage(doc, filteredConclusions, "Conclusions", { showReferences: true });

  doc.addPage();
  stampSection("Residual Disclosure");
  drawSectionPage(doc, residual, "Residual Disclosure", { showReferences: false });

  // Page 7 — evidence log
  doc.addPage();
  stampSection("Evidence Log");
  drawEvidenceLogPage(doc, output.evidence_log || []);

  // Page 8 — IC Defence Pack + provenance block at bottom
  doc.addPage();
  stampSection("IC Defence Pack");
  drawIcDefencePackPage(doc, output);

  // 1.4e: flush the in-flight footnote accumulator into the page-keyed
  // map so the last page's citations are captured before the footer pass
  // runs (the footer post-pass reads from the page-keyed map, not the
  // current accumulator).
  flushCurrentPage();

  // Footers on every page (now that totalPages is known).
  const totalPages = doc.internal.getNumberOfPages();
  for (let n = 1; n <= totalPages; n++) {
    doc.setPage(n);
    renderFooter(doc, output, n, totalPages, {
      // output.engagement_reference is the Airtable engagement UUID
      // (ReportRoute injects it via engagement_reference_for), distinct
      // from output.run_id which is the engine's internal per-render
      // serial. The engagement UUID is what an institutional reader will
      // cross-reference against the engagement letter.
      engagementRef: output.engagement_reference || "",
      sectionName: lookupSectionName(pageSections, n),
    });
  }

  return doc;
}

/**
 * Find the section name for a given page number. Returns the name of the
 * most recently started section whose startPage ≤ pageNumber.
 *
 * @param {Array<{ startPage: number, name: string }>} pageSections
 * @param {number} pageNumber
 * @returns {string}
 */
function lookupSectionName(pageSections, pageNumber) {
  let current = "";
  for (const entry of pageSections) {
    if (entry.startPage <= pageNumber) current = entry.name;
    else break;
  }
  return current;
}

/* -------------------------------------------------------------------------- */
/* Page 1 — cover                                                              */
/* -------------------------------------------------------------------------- */

function drawCoverPage(
  /** @type {jsPDF} */ doc,
  /** @type {ReportOutput} */ output,
  /** @type {Record<string, unknown>} */ meta,
  /** @type {string} */ logoBase64,
) {
  // 1.4d Phase B.1 — restrained cover per report-design.md.
  //
  // Layout:
  //   Top third    (0 – 99mm): empty.
  //   Middle third (99 – 198mm): project name (cover-title, centred),
  //                              target label (cover-subtitle, centred),
  //                              methodology version (caption, centred).
  //   Bottom third (198 – 275mm): wordmark, report date, report reference.
  //
  // No imagery, no marketing copy, no signatory block (signatory moves to
  // the Executive Summary signature line per spec). The audit-bearing
  // engagement reference UUID + client metadata are surfaced in the
  // Project Profile / Situation sections on body pages — preserving
  // audit traceability while keeping the cover restrained.

  const centerX = PAGE_WIDTH_MM / 2;

  // TOP THIRD — logo centred at ~45mm. The logo has a dark navy background
  // so we draw a navy band across the full page width first.
  if (logoBase64) {
    const logoW = 70;
    const logoH = 35; // ~2:1 aspect ratio
    const logoX = centerX - logoW / 2;
    const logoY = 38;
    const bandPad = 8;
    setFill(doc, INK.navy);
    doc.rect(0, logoY - bandPad, PAGE_WIDTH_MM, logoH + 2 * bandPad, "F");
    doc.addImage(logoBase64, "PNG", logoX, logoY, logoW, logoH);
  }

  const projectName = coalesce(meta.project_name) || "Project Readiness Report";
  const targetLabel = humaniseTargetLabel(meta.target_label) ||
    "EU Taxonomy — Activity 8.1";
  const methodologyLine = `Methodology ${output.methodology_version}`;

  // MIDDLE THIRD — project name at 110mm, target label at 130mm, methodology at 145mm.
  setText(doc, INK.navy);
  applyType(doc, TYPE.coverTitle);
  // Wrap long project names to two lines if needed.
  const projectNameLines = doc.splitTextToSize(projectName, CONTENT_WIDTH_MM);
  let titleY = 110;
  for (const line of projectNameLines.slice(0, 2)) {
    doc.text(line, centerX, titleY, { align: "center" });
    titleY += 10;
  }

  setText(doc, INK.inkMuted);
  applyType(doc, TYPE.coverSubtitle);
  doc.text(targetLabel, centerX, titleY + 8, { align: "center" });

  setText(doc, INK.inkMuted);
  applyType(doc, TYPE.caption);
  doc.text(methodologyLine, centerX, titleY + 18, { align: "center" });

  // BOTTOM THIRD — date + reference centred (wordmark now in the logo above).
  setText(doc, INK.inkMuted);
  applyType(doc, TYPE.caption);
  doc.text(isoToDate(output.generated_at), centerX, 268, { align: "center" });

  // Reference number — short form for legibility at the cover scale.
  // Full UUID lives in the Engagements record and on body pages.
  const refShort = String(output.engagement_reference || "").slice(0, 8);
  doc.text(
    `Reference  ${refShort.toUpperCase()}`,
    centerX,
    273,
    { align: "center" },
  );
}

/**
 * Map an internal target_label snake_case value to a human-readable
 * sub-title for the cover. Defaults to the EU Taxonomy framing for the
 * pre-target_label engagements (the cover sub-title needs SOMETHING).
 *
 * @param {string | null | undefined} value
 */
function humaniseTargetLabel(value) {
  switch (value) {
    case "eu_taxonomy_aligned_8_1":
      return "EU Taxonomy — Activity 8.1";
    case "sfdr_article_8":
      return "SFDR Article 8";
    case "sfdr_article_9":
      return "SFDR Article 9";
    case "uk_sdr_focus":
      return "UK SDR — Sustainability Focus";
    case "uk_sdr_improvers":
      return "UK SDR — Sustainability Improvers";
    case "uk_sdr_impact":
      return "UK SDR — Sustainability Impact";
    default:
      return null;
  }
}

/**
 * True when the engagement's target_label is a product_label-only label
 * (SFDR Article 8/9 or UK SDR Focus/Improvers/Impact). Used to skip the
 * legacy "Frameworks Applied" / "Evidence Presented" / PUE summary
 * sections that surface EU Tax narrative regardless of scope — for
 * product_label-only scopes, the framework_findings pages cover the
 * equivalent role. eu_taxonomy_aligned_8_1 keeps the legacy section
 * rendering.
 *
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
function isProductLabelOnlyLabel(value) {
  return (
    value === "sfdr_article_8" ||
    value === "sfdr_article_9" ||
    value === "uk_sdr_focus" ||
    value === "uk_sdr_improvers" ||
    value === "uk_sdr_impact"
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
    setText(doc, INK.navy);
    applyType(doc, TYPE.sectionHead);
    doc.text(fallbackHeading, MARGIN_MM, y);
    y += 8;
    setText(doc, INK.inkMuted);
    applyType(doc, TYPE.body);
    doc.text("Section omitted by the engine.", MARGIN_MM, y);
    return;
  }

  // Heading
  setText(doc, INK.navy);
  applyType(doc, TYPE.sectionHead);
  doc.text(section.heading || fallbackHeading, MARGIN_MM, y);
  y += 8;

  // Narrative
  setText(doc, INK.navy);
  applyType(doc, TYPE.body);
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
      setText(doc, INK.navy);
      applyType(doc, TYPE.bodyLabel);
      doc.text(ref.framework || "", MARGIN_MM, y);
      y += 5;

      // source_reference (italic muted)
      setText(doc, INK.inkMuted);
      applyType(doc, TYPE.footnote);
      doc.text(ref.source_reference || "", MARGIN_MM, y);
      y += 4;

      // Verbatim excerpt
      setText(doc, INK.navy);
      applyType(doc, TYPE.body);
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
  setText(doc, INK.navy);
  applyType(doc, TYPE.sectionHead);
  doc.text("PUE Measurement Compliance", MARGIN_MM, y);
  y += 8;

  const GUTTER = 6;
  const colWidth = (CONTENT_WIDTH_MM - GUTTER) / 2;
  const leftX = MARGIN_MM;
  const rightX = MARGIN_MM + colWidth + GUTTER;
  const headerHeight = 9;
  const declaredAuthority = pue.verdict?.authority_level;

  // Left header — Declared (intake)
  setFill(doc, INK.navy);
  doc.rect(leftX, y, colWidth, headerHeight, "F");
  setText(doc, INK.warmWhite);
  applyType(doc, TYPE.bodyLabel);
  doc.text("Declared (intake)", leftX + 3, y + 6);
  if (declaredAuthority) {
    drawAuthorityBadge(doc, leftX + colWidth - 3, y + headerHeight / 2, declaredAuthority, "right");
  }

  // Right header — Verdict (engine)
  setFill(doc, INK.navy);
  doc.rect(rightX, y, colWidth, headerHeight, "F");
  setText(doc, INK.warmWhite);
  applyType(doc, TYPE.bodyLabel);
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
  setText(doc, INK.navy);
  applyType(doc, TYPE.body);
  leftY = drawStatLine(doc, leftX + bodyPad, leftY, colWidth - 2 * bodyPad, "Methodology", humanise(pue.declared.methodology));
  leftY = drawStatLine(doc, leftX + bodyPad, leftY, colWidth - 2 * bodyPad, "Category", humanise(pue.declared.category));
  leftY = drawStatLine(doc, leftX + bodyPad, leftY, colWidth - 2 * bodyPad, "Boundary documented", boolLabel(pue.declared.boundary_documented));
  leftY = drawStatLine(doc, leftX + bodyPad, leftY, colWidth - 2 * bodyPad, "Reporting basis", humanise(pue.declared.reporting_basis));

  // Right body content — verdict label, gap_summary, missing_items, evidence count
  setText(doc, INK.navy);
  applyType(doc, TYPE.bodyLabel);
  doc.text("Verdict:", rightX + bodyPad, rightY);
  setText(doc, verdictColour(pue.verdict.label));
  doc.text(humanise(pue.verdict.label), rightX + bodyPad + 18, rightY);
  rightY += 6;

  setText(doc, INK.navy);
  applyType(doc, TYPE.body);
  const gapLines = doc.splitTextToSize(pue.verdict.gap_summary || "—", colWidth - 2 * bodyPad);
  doc.text(gapLines, rightX + bodyPad, rightY);
  rightY += gapLines.length * 5 + 4;

  if (Array.isArray(pue.verdict.missing_items) && pue.verdict.missing_items.length > 0) {
    setText(doc, INK.inkMuted);
    applyType(doc, TYPE.captionEmphasis);
    doc.text("Missing:", rightX + bodyPad, rightY);
    rightY += 4;
    applyType(doc, TYPE.footnote);
    for (const item of pue.verdict.missing_items) {
      const itemLines = doc.splitTextToSize(`• ${humanise(item)}`, colWidth - 2 * bodyPad - 2);
      doc.text(itemLines, rightX + bodyPad + 2, rightY);
      rightY += itemLines.length * 4;
    }
    rightY += 2;
  }

  setText(doc, INK.inkMuted);
  applyType(doc, TYPE.footnote);
  doc.text(
    `Evidence references: ${pue.verdict.evidence_refs_count}`,
    rightX + bodyPad,
    rightY,
  );
  rightY += 4;

  // Draw the body backgrounds (after content so we know how tall they are).
  // jsPDF doesn't draw behind existing content, so we use unfilled borders.
  const bodyHeight = Math.max(leftY - bodyTopY, rightY - bodyTopY) + bodyPad;
  setText(doc, INK.navy); // no-op; clears any leftover colour
  doc.setDrawColor(INK.hairline[0], INK.hairline[1], INK.hairline[2]);
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
  setText(doc, INK.inkMuted);
  applyType(doc, TYPE.footnote);
  doc.text(label, x, y);
  setText(doc, INK.navy);
  applyType(doc, TYPE.bodyLabel);
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
  applyType(doc, TYPE.footnote);
  const textW = doc.getTextWidth(label);
  const padX = 2;
  const padY = 1.2;
  const w = textW + 2 * padX;
  const h = 4.5;
  const rectX = align === "right" ? x - w : x;
  const rectY = centerY - h / 2;
  doc.setDrawColor(INK.warmWhite[0], INK.warmWhite[1], INK.warmWhite[2]);
  doc.setLineWidth(0.2);
  doc.setFillColor(248, 246, 242);
  doc.roundedRect(rectX, rectY, w, h, 1, 1, "FD");
  setText(doc, INK.navy);
  doc.text(label, rectX + padX, rectY + h - padY);
}

// Turn snake_case engine values like "EN_50600_4_2" or "data_missing" into
// human-readable strings. Leaves already-spaced strings alone.
function humanise(/** @type {string | null | undefined} */ value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replace(/_/g, " ");
}

/* -------------------------------------------------------------------------- */
/* SFDR section page — Phase 1, commit 1.5a Phase B-3                          */
/* -------------------------------------------------------------------------- */
//
// Renders one SFDR FrameworkFinding as a single PDF section: heading,
// criterion table (7 rows for Art 8, 10 for Art 9), entity-axis
// insufficient_evidence callouts. Uses word + symbol status indicators
// per pb-product-design report-design.md (Aligned ●, Conditional ◐,
// Not aligned ○, N/A —, Insufficient ⊘). Rationale cells populated via
// snapshotPhraseFor from src/lib/snapshotPhrases.js.

const FRAMEWORK_FINDING_HEADINGS = {
  sfdr_art8: "SFDR Article 8 — Promotion of Environmental or Social Characteristics",
  sfdr_art9: "SFDR Article 9 — Sustainable Investment Objective",
  uk_sdr_focus: "UK SDR Sustainability Focus — per-criterion findings",
  uk_sdr_improvers: "UK SDR Sustainability Improvers — per-criterion findings",
  uk_sdr_impact: "UK SDR Sustainability Impact — per-criterion findings",
};

// Criteria 2, 3, 5, 7 read entity-axis inputs. When these resolve to
// insufficient_evidence, the SPA can't currently collect the underlying
// entity disclosures (corporate-parent governance, PAI policy, Annex II
// disclosure scaffolding) via Dolapo's Airtable flow — so the inline
// callout points the institutional reader at the follow-up engagement
// scope expansion path.
const ENTITY_AXIS_CRITERIA = new Set([
  "sfdr_v1_good_governance_attestation",
  "sfdr_v1_pai_consideration_policy",
  "sfdr_v1_pre_contractual_disclosure",
  "sfdr_v1_periodic_reporting_commitment",
]);

function verdictDisplay(verdict) {
  switch (verdict) {
    case "aligned":
      return { label: "Aligned", symbol: "●", rgb: INK.pass };
    case "partially_aligned":
      return { label: "Conditional", symbol: "◐", rgb: INK.partial };
    case "not_aligned":
      return { label: "Not aligned", symbol: "○", rgb: INK.fail };
    case "not_applicable":
      return { label: "N/A", symbol: "—", rgb: INK.inkMuted };
    case "insufficient_evidence":
    default:
      return { label: "Insufficient", symbol: "⊘", rgb: INK.inkMuted };
  }
}

function drawSFDRSectionPage(
  /** @type {jsPDF} */ doc,
  /** @type {FrameworkFinding} */ finding,
) {
  // 1.4e: signal the footnote engine which page this body draws on so
  // citations encountered in rationale cells get bucketed to the right
  // page for the footer post-pass.
  setCurrentPage(doc.internal.getCurrentPageInfo().pageNumber);

  let y = MARGIN_MM;

  // Section heading
  setText(doc, INK.navy);
  applyType(doc, TYPE.sectionHead);
  const heading = FRAMEWORK_FINDING_HEADINGS[finding.framework] || finding.framework;
  const wrappedHeading = doc.splitTextToSize(heading, CONTENT_WIDTH_MM);
  doc.text(wrappedHeading, MARGIN_MM, y);
  y += 6 * wrappedHeading.length + 4;

  // Sub-heading (criterion count + methodology line)
  const criteria = finding.criteria || [];
  setText(doc, INK.inkMuted);
  applyType(doc, TYPE.footnote);
  doc.text(
    `${criteria.length} criterion${criteria.length === 1 ? "" : "a"} assessed under methodology v3.5.`,
    MARGIN_MM,
    y,
  );
  y += 8;

  // Build the autotable body: one row per criterion + an inline callout row
  // (colSpan: 4) for entity-axis insufficient_evidence verdicts. The
  // callout becomes its own table row so autotable handles the layout
  // natively instead of us hand-calculating extra row heights.
  const tableBody = [];
  for (const verdict of criteria) {
    const rationaleRaw = snapshotPhraseFor(verdict) || verdict.band_rationale || "";
    // Pipe rationale through the footnote engine — citation patterns get
    // superscript markers + accumulate into the page's footer footnote zone.
    const { text: rationale } = processBodyText(rationaleRaw);
    const evCount = Array.isArray(verdict.evidence_refs)
      ? verdict.evidence_refs.length
      : 0;
    const vd = verdictDisplay(verdict.verdict);
    tableBody.push([
      verdict.criterion_label || verdict.criterion_id,
      {
        content: `${vd.label} ${vd.symbol}`,
        styles: { textColor: vd.rgb, fontStyle: "bold" },
      },
      rationale,
      { content: String(evCount), styles: { halign: "right", textColor: rgb(INK.inkMuted) } },
    ]);

    const isEntityAxis =
      ENTITY_AXIS_CRITERIA.has(verdict.criterion_id) &&
      verdict.verdict === "insufficient_evidence";
    if (isEntityAxis) {
      tableBody.push([
        {
          content:
            "ENTITY-LEVEL DISCLOSURE REQUIRED. AVAILABLE IN A FOLLOW-UP ENGAGEMENT SCOPE EXPANSION.",
          colSpan: 4,
          styles: {
            fontSize: 7,
            font: TYPE.runningHead.font,
            fontStyle: "normal",
            textColor: rgb(INK.inkMuted),
            cellPadding: { top: 0, bottom: 3, left: 6, right: 2.5 },
            lineWidth: { top: 0, right: 0, bottom: 0.5, left: 0 },
            lineColor: rgb(INK.hairline),
          },
        },
      ]);
    }
  }

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN_MM, right: MARGIN_MM, bottom: 50 },
    head: [["Criterion", "Verdict", "Rationale", "Ev"]],
    body: tableBody,
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 28 },
      2: { cellWidth: CONTENT_WIDTH_MM - 60 - 28 - 12 },
      3: { cellWidth: 12, halign: "right" },
    },
    ...TABLE_STYLE,
    // 1.4e: keep body content above the page-bottom footnote zone (30mm)
    // + the folio band. tableBottom = pageHeight - bottomMargin - footnoteZone - folio.
    pageBreak: "auto",
    rowPageBreak: "avoid",
    showHead: "firstPage",
  });
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

  setText(doc, INK.navy);
  applyType(doc, TYPE.sectionHead);
  doc.text("Evidence Log", MARGIN_MM, y);
  y += 8;

  if (!Array.isArray(evidenceLog) || evidenceLog.length === 0) {
    setText(doc, INK.inkMuted);
    applyType(doc, TYPE.body);
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
    setText(doc, INK.navy);
    applyType(doc, TYPE.bodyLabel);
    doc.text(coalesce(entry.document_id), MARGIN_MM, y);
    y += 5;

    // sha256 (truncated, muted)
    setText(doc, INK.inkMuted);
    applyType(doc, TYPE.footnote);
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
  setText(doc, INK.navy);
  applyType(doc, TYPE.sectionHead);
  doc.text("IC Defence Pack — Q&A", MARGIN_MM, y);
  y += 8;

  const pack = output.ic_defence_pack || { pack_version: "", questions: [] };

  // Pack version subheading
  setText(doc, INK.inkMuted);
  applyType(doc, TYPE.footnote);
  doc.text(`Pack version: ${coalesce(pack.pack_version)}`, MARGIN_MM, y);
  y += 8;

  const questions = Array.isArray(pack.questions) ? pack.questions : [];

  if (questions.length === 0) {
    setText(doc, INK.inkMuted);
    applyType(doc, TYPE.body);
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
      setText(doc, INK.navy);
      applyType(doc, TYPE.bodyLabel);
      const voiceTag = (q.ic_voice || "").toUpperCase();
      doc.text(`${coalesce(q.q_id)}  [${voiceTag}]`, MARGIN_MM, y);
      y += 5;

      // Question
      applyType(doc, TYPE.body);
      doc.text(questionLines, MARGIN_MM, y);
      y += questionLines.length * 5 + 3;

      // Answer (indented)
      setText(doc, INK.inkMuted);
      applyType(doc, TYPE.bodyLabel);
      doc.text("Answer:", MARGIN_MM, y);
      y += 4;
      setText(doc, INK.navy);
      applyType(doc, TYPE.body);
      doc.text(answerLines, MARGIN_MM + 6, y);
      y += answerLines.length * 5 + 3;

      // Evidence refs + template ref (muted)
      setText(doc, INK.inkMuted);
      applyType(doc, TYPE.footnote);
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

  setText(doc, INK.navy);
  applyType(doc, TYPE.sectionHead);
  doc.text("Provenance", MARGIN_MM, y);
  y += 6;

  setText(doc, INK.inkMuted);
  applyType(doc, TYPE.footnote);
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
  /** @type {{ engagementRef: string, sectionName: string }} */ furniture,
) {
  // 1.4d Phase B.5 — running header (top) + folio (bottom).
  //
  // Both rendered in PB-Sans 8pt ink-muted per the report-design.md spec.
  // Skip on the cover page (pageNum === 1) — the cover composition stands
  // on its own, no running header/folio chrome.

  if (pageNum === 1) {
    // Cover stands alone — no chrome, no footnotes. The Article 26
    // disclaimer fires as footnote 1 on every non-cover page via the
    // footnote engine; the cover itself is the institutional "title
    // page" register and doesn't carry running chrome.
    return;
  }

  // 1.4e: render this page's accumulated footnotes BEFORE the folio.
  // The footnote zone sits above the folio and the Article 26
  // disclaimer line. Position: page height (297) − folio (~8 from
  // bottom) − disclaimer band − 30mm footnote zone reservation.
  // Hairline rule drawn at the top of the zone.
  renderFootnotesForPage(doc, pageNum, PAGE_HEIGHT_MM - 14 - 30, {
    contentLeft: MARGIN_MM,
    contentRight: PAGE_WIDTH_MM - MARGIN_MM,
  });

  // RUNNING HEADER — top of page, baseline at 14mm.
  // Left: engagement reference UUID (uppercase). This is the
  // engagement.run_id surfaced via ReportRoute.engagement_reference_for —
  // the audit-bearing Airtable record key, NOT the engine's internal
  // per-render serial (output.run_id). A reader cross-referencing the
  // PDF to an Airtable record uses this value.
  // Right: section name (e.g. "Frameworks Applied", "UK SDR Sustainability
  // Focus — per-criterion findings"). Methodology version is shown in
  // the folio band below — no need to duplicate it here.
  setText(doc, INK.inkMuted);
  applyType(doc, TYPE.runningHead);
  const refTag = String(furniture.engagementRef || "PERENNITY BRIDGE REPORT")
    .toUpperCase();
  // Truncate to 40 chars for header — full UUID is on the cover.
  const refTagTrunc = refTag.length > 40
    ? refTag.slice(0, 40) + "…"
    : refTag;
  doc.text(refTagTrunc, MARGIN_MM, 14);
  if (furniture.sectionName) {
    // Truncate long section names so they don't collide with the left tag.
    const sectionTrunc = furniture.sectionName.length > 60
      ? furniture.sectionName.slice(0, 60) + "…"
      : furniture.sectionName;
    doc.text(sectionTrunc, PAGE_WIDTH_MM - MARGIN_MM, 14, { align: "right" });
  }
  // Hairline rule below the running header.
  doc.setDrawColor(INK.hairline[0], INK.hairline[1], INK.hairline[2]);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_MM, 16, PAGE_WIDTH_MM - MARGIN_MM, 16);

  // FOLIO — bottom of page.
  // Left: "Perennity Bridge | Methodology vX.Y"; right: "Page N of M".
  setText(doc, INK.inkMuted);
  applyType(doc, TYPE.folio);
  doc.text(
    `Perennity Bridge  |  Methodology ${output.methodology_version}`,
    MARGIN_MM,
    PAGE_HEIGHT_MM - 8,
  );
  doc.text(
    `Page ${pageNum} of ${totalPages}`,
    PAGE_WIDTH_MM - MARGIN_MM,
    PAGE_HEIGHT_MM - 8,
    { align: "right" },
  );

  // 1.4e: the Article 26 disclaimer used to render inline above the
  // folio. It's now footnote 1 on every page (registered as a fixed
  // footnote at generateReportPDF init + emitted via the footnote zone
  // above). The inline disclaimer band is removed; the regulatory
  // scoping caveat is preserved at the institutional-citation register.
}

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
/* -------------------------------------------------------------------------- */

function drawWordmark(/** @type {jsPDF} */ doc, /** @type {number} */ y) {
  setText(doc, INK.navy);
  applyType(doc, TYPE.sectionHead);
  doc.text("PERENNITY BRIDGE", MARGIN_MM, y);
  setText(doc, INK.inkMuted);
  applyType(doc, TYPE.footnote);
  doc.text("Capital Readiness Platform", MARGIN_MM, y + 4);
  return y + 8;
}

function setText(/** @type {jsPDF} */ doc, /** @type {readonly number[]} */ colour) {
  doc.setTextColor(colour[0], colour[1], colour[2]);
}

function setFill(/** @type {jsPDF} */ doc, /** @type {readonly number[]} */ colour) {
  doc.setFillColor(colour[0], colour[1], colour[2]);
}

function verdictColour(/** @type {string} */ verdict) {
  if (verdict === "pass") return INK.pass;
  if (verdict === "fail") return INK.fail;
  return INK.partial;
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

/**
 * Compute an indicative score from product_label criterion verdicts. The
 * engine hardcodes indicative_score=0 for product_label frameworks (SFDR
 * Art 8/9, UK SDR Focus/Improvers/Impact — calibration pending), so we
 * derive a percentage here from the criterion-level verdicts.
 *
 * @param {CriterionVerdict[]} criteria
 * @returns {number} 0–100
 */
function computeProductLabelScore(criteria) {
  const scored = criteria.filter((c) => c.verdict !== "not_applicable");
  if (scored.length === 0) return 0;
  const points = scored.reduce((sum, c) => {
    if (c.verdict === "aligned") return sum + 1;
    if (c.verdict === "partially_aligned") return sum + 0.5;
    return sum;
  }, 0);
  return Math.round((points / scored.length) * 100);
}

/**
 * Build a conclusions narrative filtered to the target framework. For SFDR
 * labels the engine's indicative_score is always 0 (calibration pending), so
 * we recompute it from the renderContract's criterion verdicts.
 *
 * @param {string} narrative
 * @param {string | null | undefined} targetLabel
 * @param {RenderContract | null | undefined} renderContract
 * @returns {string}
 */
function filterConclusionsNarrative(narrative, targetLabel, renderContract) {
  if (!narrative || !targetLabel) return narrative || "";

  if (
    isProductLabelOnlyLabel(targetLabel) &&
    renderContract &&
    Array.isArray(renderContract.framework_findings)
  ) {
    const lines = renderContract.framework_findings.map((f) => {
      const score = computeProductLabelScore(f.criteria || []);
      const heading = FRAMEWORK_FINDING_HEADINGS[f.framework] || f.framework;
      const verdicts = (f.criteria || []).map((c) => c.verdict);
      const hasNotAligned = verdicts.includes("not_aligned");
      const hasPartial = verdicts.includes("partially_aligned");
      const overall = hasNotAligned ? "not aligned" : hasPartial ? "partially aligned" : "aligned";
      return `${heading}: overall verdict ${overall}, indicative score ${score}.`;
    });
    return lines.join(" ");
  }

  if (targetLabel === "eu_taxonomy_aligned_8_1") {
    const sentences = narrative.split(/(?<=\.)\s+/).filter(Boolean);
    const filtered = sentences.filter((s) => s.includes("EU_TAXONOMY"));
    return filtered.length > 0 ? filtered.join(" ") : narrative;
  }

  return narrative;
}

/**
 * Fetch the logo PNG from the Vite-resolved URL and return a base64
 * data-URI string suitable for jsPDF addImage().
 *
 * @returns {Promise<string>}
 */
async function loadLogoBase64() {
  const resp = await fetch(logoUrl);
  const buf = await resp.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

