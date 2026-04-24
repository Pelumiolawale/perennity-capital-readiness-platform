import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FINANCING_LABELS, getApplicableFrameworks } from '../regulations/frameworks/financing-labels.js';
import {
  getRegulatoryBasis,
  PILLAR_DISPLAY_NAMES,
  PAI_MAPPING_ROWS,
} from './regulatoryBasisByLabel.js';
import { planExportPages, KIND } from './exportPlan.js';

// ============================================================
// PERENNITY BRIDGE — LABEL-DRIVEN PDF REPORT GENERATOR
//
// Variable page count (6–9) driven by target_financing_label:
//   EU Taxonomy 8.1   → 8 pages (no separate DNSH page — criteria
//                       breakdown already groups DNSH)
//   SFDR Art 8 / 9    → 9 pages
//   UK SDR (4 labels) → 6 pages (no DNSH, no PAI)
//   Unsupported label → 3-page fallback
// ============================================================

const NAVY = [11, 31, 42];       // #0B1F2A
const TEAL = [78, 205, 164];     // #4ECDA4
const WARM = [248, 246, 242];    // #F8F6F2
const WHITE = [255, 255, 255];
const AMBER = [197, 160, 40];    // #C5A028
const SLATE = [46, 64, 87];      // #2E4057
const MUTED_RED = [180, 60, 60];
const GREY = [240, 240, 240];
const MID_GREY = [160, 160, 160];
const DARK_GREY = [80, 80, 80];
const GREEN = [27, 107, 74];
const RED = [166, 61, 47];

const PW = 210;        // page width mm
const PH = 297;        // page height mm
const M = 14;          // margin
const CW = PW - 2 * M; // content width

// ── Banding / colouring ──────────────────────────────────────

function bandInfo(score) {
  if (score >= 75) return { label: 'CAPITAL READY', color: TEAL };
  if (score >= 55) return { label: 'CONDITIONALLY READY', color: AMBER };
  if (score >= 35) return { label: 'DEVELOPMENT STAGE', color: SLATE };
  return { label: 'PRE-DEVELOPMENT', color: MUTED_RED };
}

function dotColor(score) {
  if (score >= 65) return GREEN;
  if (score >= 40) return AMBER;
  return RED;
}

function badgeInfo(score) {
  if (score >= 65) return { label: 'PASS', color: GREEN };
  if (score >= 40) return { label: 'CONDITIONAL', color: AMBER };
  return { label: 'FAIL', color: RED };
}

function verdictColor(verdict) {
  if (verdict === 'PASS') return GREEN;
  if (verdict === 'CONDITIONAL') return AMBER;
  return RED;
}

function fmtDate() {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function stageLabel(stage) {
  const map = { concept: 'New Build (Concept)', site_shortlisted: 'New Build', site_selected: 'New Build', pre_permitting: 'New Build', permitted: 'Existing / Permitted', shovel_ready: 'Existing / Shovel Ready' };
  return map[stage] || stage || 'N/A';
}

// ── Drawing helpers ─────────────────────────────────────────

function footer(doc, pillarName, pageNum, totalPages) {
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MID_GREY);
  doc.text(`Perennity Bridge v3.1 · ${pillarName} · Page ${pageNum} of ${totalPages}`, M, PH - 8);
}

function sectionHead(doc, title, y) {
  doc.setFillColor(...TEAL);
  doc.rect(M, y, 3, 10, 'F');
  doc.setTextColor(...NAVY);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(title, M + 8, y + 7.5);
  return y + 15;
}

function tbl(doc, headers, rows, y, widths) {
  autoTable(doc, {
    startY: y,
    head: [headers],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8.5, font: 'helvetica', fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: DARK_GREY },
    alternateRowStyles: { fillColor: GREY },
    columnStyles: widths ? Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w }])) : {},
    margin: { left: M, right: M },
    tableWidth: CW,
  });
  return doc.lastAutoTable.finalY + 6;
}

function wrap(doc, text, x, y, maxW, lineH) {
  const lines = doc.splitTextToSize(text, maxW);
  lines.forEach(line => { if (y < PH - 15) { doc.text(line, x, y); y += lineH; } });
  return y;
}

function statusGlyph(status) {
  // Unicode glyphs with a short text equivalent (not colour-alone).
  switch (status) {
    case 'PASS':                return '✓ PASS';
    case 'FAIL':                return '✗ FAIL';
    case 'PARTIAL':             return '◐ PARTIAL';
    case 'EVIDENCE_INCOMPLETE': return '? EVIDENCE INCOMPLETE';
    default:                    return status || '—';
  }
}

function statusColor(status) {
  switch (status) {
    case 'PASS':                return GREEN;
    case 'FAIL':                return RED;
    case 'PARTIAL':             return AMBER;
    case 'EVIDENCE_INCOMPLETE': return DARK_GREY;
    default:                    return DARK_GREY;
  }
}

// ============================================================
// PAGE 1 — COVER
// ============================================================
function drawCover(doc, project, assessment, id, totalPages) {
  const le = assessment.labelEvaluation;
  const band = bandInfo(assessment.capitalReadinessScore);
  // Prefer label verdict for the cover badge when available;
  // fall back to the pillar-weighted readiness band otherwise.
  const cover = le
    ? { label: le.verdict, color: verdictColor(le.verdict) }
    : { label: band.label, color: band.color };
  const date = fmtDate();
  const name = project.project_name || 'Untitled Project';

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PW, PH, 'F');

  // Brand
  doc.setTextColor(...TEAL);
  doc.setFontSize(28);
  doc.setFont('times', 'bold');
  doc.text('PERENNITY BRIDGE', M, 38);

  doc.setTextColor(...WARM);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('Capital Readiness Assessment', M, 50);

  // Teal rule
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(1.5);
  doc.line(M, 58, PW - M, 58);

  // Project name
  doc.setTextColor(...WARM);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  const nameLines = doc.splitTextToSize(name, CW);
  let ny = 115;
  nameLines.forEach(l => { doc.text(l, PW / 2, ny, { align: 'center' }); ny += 11; });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MID_GREY);
  doc.text(`${project.country || project.projectRegionGroup || assessment.region || 'N/A'}  |  ${stageLabel(project.development_stage)}  |  ${date}`, PW / 2, ny + 8, { align: 'center' });

  const parts = [];
  if (project.planned_capacity_mw) parts.push(`${project.planned_capacity_mw} MW planned`);
  if (project.it_load_mw) parts.push(`${project.it_load_mw} MW IT load`);
  if (project.expected_commissioning_date) {
    const ecd = new Date(project.expected_commissioning_date);
    if (!isNaN(ecd)) parts.push(`commissioning ${ecd.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`);
  }
  if (parts.length > 0) {
    doc.setFontSize(9);
    doc.text(parts.join('  ·  '), PW / 2, ny + 15, { align: 'center' });
  }

  // Label name (below metadata)
  if (le) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...WARM);
    doc.text(`Target Label: ${le.labelName}`, PW / 2, ny + 24, { align: 'center' });
  }

  // Bottom-left: verdict badge (label-driven if available)
  const by = PH - 52;
  doc.setFillColor(...cover.color);
  doc.roundedRect(M, by, 88, 20, 3, 3, 'F');
  doc.setTextColor(...(cover.color === AMBER ? NAVY : WHITE));
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(cover.label, M + 44, by + 13, { align: 'center' });

  // Bottom-right: score (retained as secondary signal)
  doc.setTextColor(...WARM);
  doc.setFontSize(40);
  doc.setFont('helvetica', 'bold');
  doc.text(`${assessment.capitalReadinessScore}`, PW - M - 28, by + 5, { align: 'center' });
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('/ 100', PW - M - 6, by + 5);

  // Footer
  doc.setTextColor(...MID_GREY);
  doc.setFontSize(7);
  doc.text(`Perennity Bridge v3.1 · Methodology vintage April 2026 · Page 1 of ${totalPages}`, M, PH - 10);
}

// ============================================================
// PAGE 2 — EXECUTIVE SUMMARY
// ============================================================
function drawExecutiveSummary(doc, project, assessment, pageNum, totalPages) {
  const le = assessment.labelEvaluation;
  doc.addPage();
  let y = M;
  y = sectionHead(doc, 'Executive Summary', y);

  // Verdict banner (label-driven) — full width, above pillar grid.
  if (le) {
    const vc = verdictColor(le.verdict);
    doc.setFillColor(...vc);
    doc.roundedRect(M, y, 30, 10, 2, 2, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(le.verdict, M + 15, y + 6.5, { align: 'center' });

    doc.setTextColor(...NAVY);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(le.labelName, M + 34, y + 4);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK_GREY);
    const summaryLines = doc.splitTextToSize(le.summary || '', CW - 36);
    summaryLines.slice(0, 2).forEach((ln, i) => {
      doc.text(ln, M + 34, y + 8 + (i * 4));
    });
    if (le.hardStopOverride) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...RED);
      doc.setFontSize(8);
      doc.text('Hard-stop override — verdict forced to FAIL.', M + 34, y + 16);
      doc.setTextColor(...DARK_GREY);
      doc.setFont('helvetica', 'normal');
      y += 4;
    }
    y += 16;
  }

  // Score gauge
  const band = bandInfo(assessment.capitalReadinessScore);
  const gw = CW;
  doc.setFillColor(...GREY);
  doc.roundedRect(M, y, gw, 9, 2, 2, 'F');
  doc.setFillColor(...band.color);
  doc.roundedRect(M, y, Math.max(5, (assessment.capitalReadinessScore / 100) * gw), 9, 2, 2, 'F');
  doc.setTextColor(...NAVY);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`${assessment.capitalReadinessScore} / 100 — ${band.label}`, M + Math.max(5, (assessment.capitalReadinessScore / 100) * gw) + 4, y + 6.5);
  y += 16;

  // Five pillar cards (cosmetic — always render all 5 on exec summary
  // so readers see the full scoring picture regardless of label).
  const pillars = getPillarList(assessment);
  const cardW = (CW - 16) / 5;
  pillars.forEach((p, i) => {
    const cx = M + i * (cardW + 4);
    doc.setFillColor(...GREY);
    doc.roundedRect(cx, y, cardW, 30, 2, 2, 'F');

    const dc = dotColor(p.score);
    doc.setFillColor(...dc);
    doc.circle(cx + cardW - 5, y + 5, 2, 'F');

    doc.setTextColor(...NAVY);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    const nl = doc.splitTextToSize(p.name, cardW - 8);
    doc.text(nl, cx + 3, y + 9);

    doc.setFontSize(13);
    doc.text(`${p.score}`, cx + 3, y + 24);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('/ 100', cx + 3 + doc.getTextWidth(`${p.score}`) + 1, y + 24);
  });
  y += 38;

  // Two columns: strengths (by score) + priority gaps (criteria-driven if label available).
  const colW = (CW - 8) / 2;
  doc.setTextColor(...GREEN);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Key strengths', M, y);
  let sy = y + 6;
  doc.setTextColor(...DARK_GREY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const strengths = pillars.filter(p => p.score >= 65).sort((a, b) => b.score - a.score).slice(0, 3);
  if (strengths.length === 0) { doc.text('No pillars scoring ≥ 65.', M + 2, sy); sy += 5; }
  else strengths.forEach(p => { doc.text(`• ${p.name} (${p.score}/100)`, M + 2, sy); sy += 5; });

  doc.setTextColor(...RED);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Priority gaps', M + colW + 8, y);
  let gy = y + 6;
  doc.setTextColor(...DARK_GREY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  // Label-driven: surface failing / incomplete criteria rather than low-score pillars.
  const gapItems = le
    ? le.criteria.filter(c => c.status !== 'PASS').slice(0, 4).map(c => `• ${c.title}`)
    : pillars.filter(p => p.score < 55).map(p => `• ${p.name} (${p.score}/100) — ${p.gapNote}`);
  if (gapItems.length === 0) { doc.text('No critical gaps identified.', M + colW + 10, gy); gy += 5; }
  else gapItems.forEach(item => {
    const lines = doc.splitTextToSize(item, colW - 4);
    lines.forEach(l => { doc.text(l, M + colW + 10, gy); gy += 4.5; });
  });

  y = Math.max(sy, gy) + 8;

  // Target label block
  const labelVal = le ? le.labelName : (FINANCING_LABELS[project.target_financing_label] || project.target_financing_label || 'Not specified');
  doc.setFillColor(232, 245, 239);
  doc.roundedRect(M, y, CW, 13, 2, 2, 'F');
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, y, CW, 13, 2, 2, 'S');
  doc.setTextColor(...NAVY);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Target label: ', M + 5, y + 8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(labelVal, M + 5 + doc.getTextWidth('Target label: '), y + 8.5);
  y += 18;

  // Applicable Regulatory Frameworks
  const fw = getApplicableFrameworks(project.target_financing_label);
  const allFw = [...fw.primary, ...fw.secondary];
  if (allFw.length > 0) {
    const blockH = 10 + (fw.primary.length * 5) + (fw.primary.length && fw.secondary.length ? 5 : 0) + (fw.secondary.length * 5) + 2;
    doc.setFillColor(232, 245, 239);
    doc.roundedRect(M, y, CW, blockH, 2, 2, 'F');
    doc.setDrawColor(...TEAL);
    doc.setLineWidth(0.4);
    doc.roundedRect(M, y, CW, blockH, 2, 2, 'S');
    doc.setTextColor(...NAVY);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Applicable regulatory frameworks', M + 5, y + 5);
    let ry = y + 10;
    doc.setFontSize(7.5);
    if (fw.primary.length > 0) {
      doc.setTextColor(...NAVY);
      doc.setFont('helvetica', 'bold');
      doc.text('Primary:', M + 7, ry);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK_GREY);
      fw.primary.forEach(f => { doc.text(`• ${f}`, M + 22, ry); ry += 5; });
    }
    if (fw.secondary.length > 0) {
      doc.setTextColor(...NAVY);
      doc.setFont('helvetica', 'bold');
      doc.text(fw.labelSelected ? 'Cross-check:' : 'Consider:', M + 7, ry);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK_GREY);
      fw.secondary.forEach(f => { doc.text(`• ${f}`, M + 28, ry); ry += 5; });
    }
    y += blockH + 2;
  }
  y += 4;

  // Disclaimer
  doc.setFillColor(...GREY);
  doc.roundedRect(M, y, CW, 22, 2, 2, 'F');
  doc.setTextColor(...DARK_GREY);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'italic');
  const disc = 'This assessment is indicative only. It does not constitute legal, financial, or regulatory advice. Outputs should be verified by qualified legal and sustainability professionals before use in formal regulatory filings. Methodology v3.1 — April 2026.';
  doc.text(doc.splitTextToSize(disc, CW - 10), M + 5, y + 6);

  footer(doc, 'Executive Summary', pageNum, totalPages);
}

// ============================================================
// PAGE 3 — LABEL CRITERIA BREAKDOWN (new, label-driven)
// ============================================================
function drawLabelCriteria(doc, project, assessment, pageNum, totalPages) {
  const le = assessment.labelEvaluation;
  doc.addPage();
  let y = M;
  y = sectionHead(doc, `${le.labelName} — Criteria Assessment`, y);

  // Citation sub-heading
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...DARK_GREY);
  const subhead = labelCriteriaSubhead(le.label);
  y = wrap(doc, subhead, M, y, CW, 4.5);
  y += 2;

  // For EU Taxonomy, split criteria into 3 sections.
  const isEuTax = le.label === 'eu_taxonomy_8_1';
  if (isEuTax) {
    const groups = [
      {
        title: `Substantial Contribution — ${le.substantialContributionObjectiveName || 'Climate Change Mitigation'}`,
        items: le.criteria.filter(c => c.id === 'substantial_contribution'),
      },
      {
        title: 'Do No Significant Harm (other 5 objectives)',
        items: le.criteria.filter(c => c.id.startsWith('dnsh_')),
      },
      {
        title: 'Minimum Social Safeguards (Art 18)',
        items: le.criteria.filter(c => c.id === 'minimum_safeguards'),
      },
    ];
    groups.forEach(grp => {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...TEAL);
      doc.text(grp.title, M, y);
      y += 4;
      y = drawCriteriaTable(doc, grp.items, y);
      y += 2;
    });
  } else {
    y = drawCriteriaTable(doc, le.criteria, y);
  }

  footer(doc, 'Label Criteria', pageNum, totalPages);
}

function labelCriteriaSubhead(label) {
  const map = {
    eu_taxonomy_8_1:  'Per EU Regulation 2020/852 Art 3 + 17 and Climate Delegated Regulation (EU) 2021/2139 Annex I Activity 8.1.',
    sfdr_article_8:   'Per SFDR 2019/2088 Art 8 and Commission Delegated Regulation (EU) 2022/1288.',
    sfdr_article_9:   'Per SFDR 2019/2088 Art 9 and Commission Delegated Regulation (EU) 2022/1288 Art 16 (DNSH cross-reference).',
    uk_sdr_focus:     'Per FCA PS23/16 ESG 5.3.2R — Sustainability Focus qualifying criteria.',
    uk_sdr_improvers: 'Per FCA PS23/16 ESG 5.3.3R — Sustainability Improvers qualifying criteria.',
    uk_sdr_impact:    'Per FCA PS23/16 ESG 5.3.4R — Sustainability Impact qualifying criteria.',
    uk_sdr_mixed:     'Per FCA PS23/16 ESG 5.3.5R — Sustainability Mixed Goals qualifying criteria.',
  };
  return map[label] || '';
}

function drawCriteriaTable(doc, criteria, y) {
  const rows = criteria.map(c => [
    c.title + (c.weight === 'critical' ? '  [CRITICAL]' : ''),
    statusGlyph(c.status),
    c.detail || '',
    c.citation || '',
  ]);
  autoTable(doc, {
    startY: y,
    head: [['Criterion', 'Status', 'Detail', 'Citation']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: DARK_GREY },
    alternateRowStyles: { fillColor: GREY },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 28, fontStyle: 'bold' },
      2: { cellWidth: 58 },
      3: { cellWidth: CW - 138 },
    },
    margin: { left: M, right: M },
    tableWidth: CW,
    // Colour the status cell per status code (still readable in B&W via the glyph).
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 1) {
        const status = criteria[data.row.index]?.status;
        const col = statusColor(status);
        data.cell.styles.textColor = col;
      }
      if (data.section === 'body' && data.column.index === 0) {
        const weight = criteria[data.row.index]?.weight;
        if (weight === 'critical') {
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });
  return doc.lastAutoTable.finalY + 4;
}

// ============================================================
// PILLAR PAGES (conditional per label × pillar)
// ============================================================
function getPillarList(assessment) {
  const a = assessment;
  // Pillars are framed generically; the regulatory basis block on each
  // pillar page is swapped in per label via getRegulatoryBasis().
  // Inputs come from the pillar's own explanations so cross-pillar
  // drift (e.g. renewable-tier lines appearing on the EPV page) is
  // avoided — each page reads only its own pillarDetails slice.
  return [
    {
      key: 'sa',  name: PILLAR_DISPLAY_NAMES.sa,
      score: a.subscores.sa,
      gapNote: 'Reduce PUE to meet the applicable threshold.',
      inputs: pillarInputs(a.pillarDetails?.sa, 3, 3),
    },
    {
      key: 'wre', name: PILLAR_DISPLAY_NAMES.wre,
      score: a.subscores.wre,
      gapNote: 'Bring WUE within the CNDCP target.',
      inputs: pillarInputs(a.pillarDetails?.wre, 3, 2),
    },
    {
      key: 'epv', name: PILLAR_DISPLAY_NAMES.epv,
      score: a.subscores.epv,
      gapNote: 'Upgrade renewable source quality or increase the renewable share.',
      inputs: pillarInputs(a.pillarDetails?.epv, 3, 2),
    },
    {
      key: 'csr', name: PILLAR_DISPLAY_NAMES.csr,
      score: a.subscores.csr,
      gapNote: 'Complete the minimum safeguards and DNSH checklist.',
      inputs: pillarInputs(a.pillarDetails?.csr, 3, 2),
    },
    {
      key: 'dfr', name: PILLAR_DISPLAY_NAMES.dfr,
      score: a.subscores.dfr,
      gapNote: 'Secure site control, advance permitting, identify EPC, finalise financing strategy.',
      inputs: pillarInputs(a.pillarDetails?.dfr, 3, 2),
    },
  ];
}

function pillarInputs(pillarDetails, posN, negN) {
  if (!pillarDetails?.explanations) return [];
  const positives = (pillarDetails.explanations.positive || []).slice(0, posN).map(e => [e, '', '']);
  const negatives = (pillarDetails.explanations.negative || []).slice(0, negN).map(e => [e, '', '']);
  return [...positives, ...negatives];
}

function drawPillarPage(doc, pillar, assessment, label, pageNum, totalPages) {
  const basis = getRegulatoryBasis(pillar.key, label);
  if (!basis) return false; // page omitted

  doc.addPage();

  // Header bar
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, PW, 20, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(pillar.name, M, 13.5);

  // Score badge
  const bi = badgeInfo(pillar.score);
  doc.setFillColor(...bi.color);
  doc.roundedRect(PW - M - 32, 4, 32, 12, 2, 2, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(9);
  doc.text(`${pillar.score}/100`, PW - M - 16, 12, { align: 'center' });

  let y = 28;

  // Section 1 — Regulatory basis (label-driven)
  const baseBlockH = basis.paiMapping ? 32 : 26;
  doc.setFillColor(...GREY);
  doc.roundedRect(M, y, CW, baseBlockH, 2, 2, 'F');
  doc.setTextColor(...NAVY);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Regulatory basis', M + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...DARK_GREY);
  let ry = y + 12;
  const primaryLines = doc.splitTextToSize(`Primary regime: ${basis.primaryRegime}`, CW - 10);
  primaryLines.forEach(ln => { doc.text(ln, M + 4, ry); ry += 4; });
  const objLines = doc.splitTextToSize(`Objective / category: ${basis.objectiveOrCategory}`, CW - 10);
  objLines.forEach(ln => { doc.text(ln, M + 4, ry); ry += 4; });
  if (basis.paiMapping) {
    const paiLines = doc.splitTextToSize(`SFDR PAI: ${basis.paiMapping}`, CW - 10);
    paiLines.forEach(ln => { doc.text(ln, M + 4, ry); ry += 4; });
  }
  const srcLines = doc.splitTextToSize(`Sources: ${basis.sources.join('; ')}`, CW - 10);
  srcLines.forEach(ln => { doc.text(ln, M + 4, ry); ry += 4; });
  y = ry + 3;

  // Section 2 — Threshold applied
  doc.setTextColor(...NAVY);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const threshHeading = basis.framing === 'evidence' ? 'Evidence standard' : basis.framing === 'indicative' ? 'Indicative benchmarks' : 'Threshold applied';
  doc.text(threshHeading, M, y);
  y += 4;
  const threshRows = basis.thresholdTable.map(r => [r.threshold, r.value, r.source]);
  y = tbl(doc, ['Threshold', 'Value', 'Source'], threshRows, y, [60, 42, CW - 102]);

  // Footnote for non-passfail framing
  if (basis.footnote) {
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...DARK_GREY);
    const fLines = doc.splitTextToSize(basis.footnote, CW);
    fLines.forEach(ln => { doc.text(ln, M, y); y += 3.5; });
    y += 2;
  }

  // Section 3 — Your project
  if (pillar.inputs.length > 0) {
    doc.setTextColor(...NAVY);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Your project', M, y);
    y += 4;
    y = tbl(doc, ['Driver / Factor', 'Detail', 'Impact'], pillar.inputs, y, [95, 45, CW - 140]);
  }

  // Section 4 — Assessment
  doc.setTextColor(...NAVY);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Assessment', M, y);
  y += 5;

  doc.setFillColor(...bi.color);
  doc.roundedRect(M, y, 28, 8, 2, 2, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(bi.label, M + 14, y + 5.5, { align: 'center' });

  y += 13;
  doc.setTextColor(...DARK_GREY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const assessText = pillar.score >= 65
    ? `This pillar scores ${pillar.score}/100 and meets the applicable threshold. Performance aligns with ${basis.primaryRegime}.`
    : `This pillar scores ${pillar.score}/100, which is below the capital readiness threshold. Remediation is required to meet ${basis.primaryRegime} requirements.`;
  y = wrap(doc, assessText, M, y, CW, 4.5);
  y += 2;

  footer(doc, pillar.name, pageNum, totalPages);
  return true;
}

// ============================================================
// DNSH EVIDENCE PAGE (SFDR Art 8 informational / SFDR Art 9 pass-fail)
// Not rendered for EU Taxonomy (criteria page already groups DNSH)
// or UK SDR labels (DNSH not applicable).
// ============================================================
function drawDnshEvidence(doc, assessment, label, pageNum, totalPages) {
  const le = assessment.labelEvaluation;
  const informational = le?.dnshTreatment === 'informational';
  doc.addPage();
  let y = M;
  y = sectionHead(doc, 'DNSH & Minimum Safeguards — Evidence', y);

  doc.setTextColor(...DARK_GREY);
  doc.setFontSize(8);
  doc.setFont('helvetica', informational ? 'italic' : 'normal');
  const note = informational
    ? (le?.dnshInfoNote || 'DNSH applies at the per-sustainable-investment level under Article 8. This block is advisory context only.')
    : (label === 'sfdr_article_9'
        ? 'DNSH applies to the sustainable investments within this Article 9 product. Evidence items below map intake fields to each DNSH objective per EU 2020/852 Art 17 cross-reference.'
        : 'Evidence items map intake fields to each DNSH objective per EU 2020/852 Art 17.');
  y = wrap(doc, note, M, y, CW, 4.5);
  y += 3;

  if (informational) {
    // Badge it as informational
    doc.setFillColor(...GREY);
    doc.roundedRect(M, y, 40, 8, 2, 2, 'F');
    doc.setTextColor(...DARK_GREY);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORMATIONAL', M + 20, y + 5.5, { align: 'center' });
    y += 12;
  }

  // Evidence rows come from the scoring engine's dnsh.details.
  const rows = (assessment.dnsh?.details || []).map(d => [
    d.label,
    informational ? 'Advisory' : (d.met ? '✓ Confirmed' : '✗ Not confirmed'),
    d.citation,
  ]);
  y = tbl(doc, ['DNSH / Minimum-safeguards evidence', 'Status', 'Citation'], rows, y, [80, 28, CW - 108]);

  footer(doc, 'DNSH Evidence', pageNum, totalPages);
}

// ============================================================
// SFDR PAI MAPPING PAGE (EU Tax + SFDR only)
// PAI 13 labelled without "(supplementary)" per RTS 2022/1288.
// ============================================================
function drawPaiMapping(doc, pageNum, totalPages) {
  doc.addPage();
  let y = M;
  y = sectionHead(doc, 'SFDR Principal Adverse Impact Indicator Mapping', y);

  doc.setTextColor(...DARK_GREY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  y = wrap(doc, 'The following PAI indicators (Commission Delegated Regulation (EU) 2022/1288, Annex I, Table 1) are addressed by this assessment:', M, y, CW, 4.5);
  y += 3;

  y = tbl(doc, ['PAI Number', 'Indicator name', 'Assessment pillar'], PAI_MAPPING_ROWS, y, [24, 78, CW - 102]);

  doc.setFillColor(...GREY);
  doc.roundedRect(M, y, CW, 22, 2, 2, 'F');
  doc.setTextColor(...DARK_GREY);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'italic');
  const note = 'PAI indicators not addressed by this tool: PAI 3 (GHG intensity), PAI 4 (fossil fuel sector exposure), PAI 6 (energy consumption by sector), PAI 12 (gender pay gap), PAI 14 (controversial weapons). These apply at portfolio/investee-company level rather than data-centre project level.';
  doc.text(doc.splitTextToSize(note, CW - 10), M + 5, y + 5);

  footer(doc, 'SFDR PAI Mapping', pageNum, totalPages);
}

// ============================================================
// ACTION PLAN PAGE — criteria-driven when label is evaluated.
// ============================================================
function drawActionPlan(doc, project, assessment, pageNum, totalPages) {
  const le = assessment.labelEvaluation;
  const name = project.project_name || 'Untitled Project';
  const date = fmtDate();
  doc.addPage();
  let y = M;

  y = sectionHead(doc, 'Prioritised Actions', y);

  doc.setTextColor(...DARK_GREY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const intro = le
    ? `The following actions are recommended to meet the qualifying criteria for ${le.labelName}:`
    : 'The following actions are recommended to improve capital readiness, listed in priority order:';
  doc.text(intro, M, y);
  y += 7;

  // Criteria-driven actions
  const actionItems = le
    ? le.criteria.filter(c => c.status !== 'PASS')
    : [];

  if (le && actionItems.length === 0) {
    doc.setTextColor(...GREEN);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`All ${le.labelName} qualifying criteria met. No critical actions required.`, M, y + 4);
    y += 14;
  } else if (le) {
    actionItems.forEach((c, idx) => {
      if (y > PH - 48) return;

      doc.setFillColor(...(idx % 2 === 0 ? GREY : WHITE));
      doc.roundedRect(M, y, CW, 28, 2, 2, 'F');

      // Number badge
      doc.setFillColor(...NAVY);
      doc.roundedRect(M + 4, y + 4, 9, 9, 2, 2, 'F');
      doc.setTextColor(...WHITE);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`${idx + 1}`, M + 8.5, y + 10.5, { align: 'center' });

      // Title + status
      doc.setTextColor(...NAVY);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      const titleLines = doc.splitTextToSize(c.title, CW - 50);
      doc.text(titleLines[0], M + 17, y + 8);

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...statusColor(c.status));
      doc.text(statusGlyph(c.status), PW - M - 4, y + 8, { align: 'right' });

      // Detail + citation
      doc.setTextColor(...DARK_GREY);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      const detail = c.detail ? doc.splitTextToSize(`Action: ${c.detail.replace(/^Unmet: /, 'Provide evidence — ')}`, CW - 22)[0] || '' : '';
      doc.text(detail, M + 17, y + 15);

      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...MID_GREY);
      doc.text(`Ref: ${c.citation || ''}`, M + 17, y + 22);

      y += 32;
    });
  } else {
    // No label evaluation → legacy pillar-driven actions.
    const pillars = getPillarList(assessment);
    const items = pillars.filter(p => p.score < 75).sort((a, b) => a.score - b.score);
    if (items.length === 0) {
      doc.setTextColor(...GREEN);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('All pillars score ≥75. No critical actions required.', M, y + 4);
      y += 14;
    } else {
      items.forEach((p, idx) => {
        if (y > PH - 48) return;
        doc.setFillColor(...(idx % 2 === 0 ? GREY : WHITE));
        doc.roundedRect(M, y, CW, 24, 2, 2, 'F');
        doc.setTextColor(...NAVY);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`${idx + 1}. ${p.name} (${p.score}/100)`, M + 4, y + 8);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...DARK_GREY);
        doc.text(p.gapNote, M + 4, y + 15);
        y += 28;
      });
    }
  }

  // CTA — clamp tightened to leave room for the relocated CONFIDENTIAL
  // notice (prev bug: notice and standard footer both rendered at PH-8).
  y = Math.max(y, PH - 48);
  doc.setFillColor(...TEAL);
  doc.roundedRect(M, y, CW, 11, 2, 2, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Next step: contact Perennity Bridge for advisory support — hello@perennitybridge.com', M + 5, y + 7.5);

  // Confidential notice — moved above the standard footer at PH-14 so
  // the two strings no longer overlay each other on the bottom-left.
  doc.setTextColor(...MID_GREY);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'italic');
  doc.text(`CONFIDENTIAL — Prepared by Perennity Bridge for ${name} — ${date} — Not for distribution without the written consent of Perennity Bridge.`, M, PH - 14);

  footer(doc, 'Action Plan', pageNum, totalPages);
}

// ============================================================
// FALLBACK NOTICE PAGE — unsupported label.
// ============================================================
function drawFallbackNotice(doc, project, pageNum, totalPages) {
  doc.addPage();
  let y = M;
  y = sectionHead(doc, 'Export — Label Not Yet Supported', y);

  doc.setTextColor(...DARK_GREY);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const labelName = FINANCING_LABELS[project.target_financing_label] || project.target_financing_label || '(no label selected)';
  const notice = `The target financing label "${labelName}" is not currently supported for detailed regulatory export. Pillar scores on the previous page are shown for indicative purposes only and are not tied to the regulatory framework of this label.`;
  y = wrap(doc, notice, M, y, CW, 5);
  y += 8;

  doc.setFillColor(...GREY);
  doc.roundedRect(M, y, CW, 22, 2, 2, 'F');
  doc.setTextColor(...NAVY);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Supported labels for detailed export:', M + 5, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...DARK_GREY);
  doc.text('EU Taxonomy 8.1 · SFDR Article 8 · SFDR Article 9 · UK SDR Focus / Improvers / Impact / Mixed Goals', M + 5, y + 13);
  doc.text('For bespoke regulatory assessment on other labels, contact hello@perennitybridge.com.', M + 5, y + 18);

  footer(doc, 'Notice', pageNum, totalPages);
}

// ============================================================
// MAIN ENTRY
// ============================================================
export function downloadPdf(project, assessment, assessmentId) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pages = planExportPages(project, assessment);
  const totalPages = pages.length;
  const pillarList = getPillarList(assessment);
  const label = project.target_financing_label;

  pages.forEach((p, idx) => {
    const pageNum = idx + 1;
    switch (p.kind) {
      case KIND.COVER:
        drawCover(doc, project, assessment, assessmentId, totalPages);
        break;
      case KIND.EXEC_SUMMARY:
        drawExecutiveSummary(doc, project, assessment, pageNum, totalPages);
        break;
      case KIND.LABEL_CRITERIA:
        drawLabelCriteria(doc, project, assessment, pageNum, totalPages);
        break;
      case KIND.PILLAR: {
        const pillar = pillarList.find(pp => pp.key === p.pillarKey);
        if (pillar) drawPillarPage(doc, pillar, assessment, label, pageNum, totalPages);
        break;
      }
      case KIND.DNSH_EVIDENCE:
        drawDnshEvidence(doc, assessment, label, pageNum, totalPages);
        break;
      case KIND.PAI_MAPPING:
        drawPaiMapping(doc, pageNum, totalPages);
        break;
      case KIND.ACTION_PLAN:
        drawActionPlan(doc, project, assessment, pageNum, totalPages);
        break;
      case KIND.FALLBACK_NOTICE:
        drawFallbackNotice(doc, project, pageNum, totalPages);
        break;
      default:
        break;
    }
  });

  const safeName = (project.project_name || 'report').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  doc.save(`perennity-${safeName}-${assessmentId}.pdf`);
}
