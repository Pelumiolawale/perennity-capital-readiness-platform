// ============================================================
// EXPORT PLAN — deterministic list of pages/sheets to render for
// a given assessment, driven by the target financing label.
//
// Pure function (no side-effects, no jsPDF/xlsx). Called by both
// pdfExport and excelExport so the two stay structurally aligned,
// and imported by the contract tests.
// ============================================================

import {
  SUPPORTED_EXPORT_LABELS,
  getApplicablePillars,
  shouldRenderPaiPage,
  shouldRenderDnshEvidencePage,
} from './regulatoryBasisByLabel.js';

// Page / sheet kinds — stable identifiers the renderers switch on.
export const KIND = {
  COVER: 'cover',
  EXEC_SUMMARY: 'exec_summary',
  LABEL_CRITERIA: 'label_criteria',
  PILLAR: 'pillar',                 // has `pillarKey`
  DNSH_EVIDENCE: 'dnsh_evidence',   // SFDR Art 8 / 9 only
  PAI_MAPPING: 'pai_mapping',       // EU Tax / SFDR only
  ACTION_PLAN: 'action_plan',
  FALLBACK_NOTICE: 'fallback_notice',
};

/**
 * Returns an ordered list of pages for the PDF (same list drives
 * Excel sheet order, minus the cover / action-plan visual pages
 * which fold into the Summary sheet).
 *
 * Shape per item: { kind: KIND.*, pillarKey?: 'sa'|'wre'|... }
 */
export function planExportPages(project, assessment) {
  const label = project?.target_financing_label;

  // Unsupported label → 3-page fallback (cover, exec summary, notice).
  if (!label || !SUPPORTED_EXPORT_LABELS.includes(label)) {
    return [
      { kind: KIND.COVER },
      { kind: KIND.EXEC_SUMMARY },
      { kind: KIND.FALLBACK_NOTICE },
    ];
  }

  const pages = [
    { kind: KIND.COVER },
    { kind: KIND.EXEC_SUMMARY },
    { kind: KIND.LABEL_CRITERIA },
  ];
  getApplicablePillars(label).forEach(pk => {
    pages.push({ kind: KIND.PILLAR, pillarKey: pk });
  });
  if (shouldRenderDnshEvidencePage(label)) {
    pages.push({ kind: KIND.DNSH_EVIDENCE });
  }
  if (shouldRenderPaiPage(label)) {
    pages.push({ kind: KIND.PAI_MAPPING });
  }
  pages.push({ kind: KIND.ACTION_PLAN });
  return pages;
}

export function planExportSheets(project, assessment) {
  const label = project?.target_financing_label;
  // Fallback: Summary + notice.
  if (!label || !SUPPORTED_EXPORT_LABELS.includes(label)) {
    return [
      { kind: KIND.EXEC_SUMMARY, name: 'Summary' },
      { kind: KIND.FALLBACK_NOTICE, name: 'Notice' },
    ];
  }
  const sheets = [
    { kind: KIND.EXEC_SUMMARY,   name: 'Summary' },
    { kind: KIND.LABEL_CRITERIA, name: 'Criteria' },
    { kind: KIND.PILLAR,         name: 'Pillars' }, // single combined sheet; rows = applicable pillars
  ];
  if (shouldRenderDnshEvidencePage(label)) {
    sheets.push({ kind: KIND.DNSH_EVIDENCE, name: 'DNSH Evidence' });
  }
  if (shouldRenderPaiPage(label)) {
    sheets.push({ kind: KIND.PAI_MAPPING, name: 'SFDR PAI' });
  }
  sheets.push({ kind: KIND.ACTION_PLAN, name: 'Actions' });
  return sheets;
}

export function getExportLabelSupport(label) {
  return SUPPORTED_EXPORT_LABELS.includes(label);
}
