import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============================================================
// PERENNITY BRIDGE — 9-PAGE PDF REPORT GENERATOR
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

const PW = 210; // page width mm
const PH = 297;
const M = 14;   // margin
const CW = PW - 2 * M; // content width
const TOTAL_PAGES = 9;

const FINANCING_LABELS = {
  sfdr_article_8: 'SFDR Article 8 — promotes environmental/social characteristics',
  sfdr_article_9: 'SFDR Article 9 — sustainable investment objective',
  eu_taxonomy_8_1: 'EU Taxonomy aligned — Activity 8.1 (climate change mitigation)',
  eugbs: 'European Green Bond (EuGBS) — Regulation (EU) 2023/2631',
  icma_green_bond: 'ICMA Green Bond Principles',
  icma_slb: 'ICMA Sustainability-Linked Bond Principles',
  icma_social_bond: 'ICMA Social Bond Principles',
  uk_sdr_focus: 'UK SDR — Sustainability Focus',
  uk_sdr_improvers: 'UK SDR — Sustainability Improvers',
  uk_sdr_impact: 'UK SDR — Sustainability Impact',
  uk_sdr_mixed: 'UK SDR — Sustainability Mixed Goals',
  eib: 'EIB green finance', ifc: 'IFC / World Bank green finance',
  ebrd: 'EBRD green finance', afdb: 'AfDB green finance',
  green: 'Green', sustainable: 'Sustainable', conventional: 'Conventional',
  article_8_9: 'Article 8/9 Style',
};

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

function fmtDate() {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function stageLabel(stage) {
  const map = { concept: 'New Build (Concept)', site_shortlisted: 'New Build', site_selected: 'New Build', pre_permitting: 'New Build', permitted: 'Existing / Permitted', shovel_ready: 'Existing / Shovel Ready' };
  return map[stage] || stage || 'N/A';
}

// ── Drawing helpers ─────────────────────────────────────────
function footer(doc, pillarName, page) {
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MID_GREY);
  doc.text(`Perennity Bridge v3.1 · ${pillarName} · Page ${page} of ${TOTAL_PAGES}`, M, PH - 8);
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

// ============================================================
// PAGE 1 — COVER
// ============================================================
function drawCover(doc, project, assessment, id) {
  const band = bandInfo(assessment.capitalReadinessScore);
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

  // Project name centred
  doc.setTextColor(...WARM);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  const nameLines = doc.splitTextToSize(name, CW);
  let ny = 115;
  nameLines.forEach(l => { doc.text(l, PW / 2, ny, { align: 'center' }); ny += 11; });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MID_GREY);
  doc.text(`${assessment.region || 'N/A'}  |  ${stageLabel(project.development_stage)}  |  ${date}`, PW / 2, ny + 8, { align: 'center' });

  // Bottom-left: readiness badge
  const by = PH - 52;
  doc.setFillColor(...band.color);
  doc.roundedRect(M, by, 88, 20, 3, 3, 'F');
  doc.setTextColor(...(band.color === AMBER ? NAVY : WHITE));
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(band.label, M + 44, by + 13, { align: 'center' });

  // Bottom-right: score
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
  doc.text('Perennity Bridge v3.1 · Methodology vintage April 2026 · sustainabledatacenter.ai', M, PH - 10);
}

// ============================================================
// PAGE 2 — EXECUTIVE SUMMARY
// ============================================================
function drawExecutiveSummary(doc, project, assessment) {
  doc.addPage();
  let y = M;
  y = sectionHead(doc, 'Executive Summary', y);

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
  doc.text(`${assessment.capitalReadinessScore} / 100 — ${band.label}`, M + gw + 2 > PW - M ? M + 4 : M + Math.max(5, (assessment.capitalReadinessScore / 100) * gw) + 4, y + 6.5);
  y += 16;

  // Five pillar cards
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

  // Two columns: strengths + gaps
  const colW = (CW - 8) / 2;
  doc.setTextColor(...GREEN);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Key strengths', M, y);
  let sy = y + 6;
  doc.setTextColor(...DARK_GREY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const strengths = pillars.filter(p => p.score >= 65);
  if (strengths.length === 0) { doc.text('No pillars scoring ≥65', M + 2, sy); sy += 5; }
  else strengths.forEach(p => { doc.text(`• ${p.name} (${p.score}/100)`, M + 2, sy); sy += 5; });

  doc.setTextColor(...RED);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Priority gaps', M + colW + 8, y);
  let gy = y + 6;
  doc.setTextColor(...DARK_GREY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const gaps = pillars.filter(p => p.score < 55);
  if (gaps.length === 0) { doc.text('No critical gaps', M + colW + 10, gy); gy += 5; }
  else gaps.forEach(p => {
    const lines = doc.splitTextToSize(`• ${p.name} (${p.score}/100) — ${p.gapNote}`, colW - 4);
    lines.forEach(l => { doc.text(l, M + colW + 10, gy); gy += 4.5; });
  });

  y = Math.max(sy, gy) + 8;

  // Financing label
  const labelVal = FINANCING_LABELS[project.target_financing_label] || project.target_financing_label || 'Not specified';
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
  y += 20;

  // Disclaimer
  doc.setFillColor(...GREY);
  doc.roundedRect(M, y, CW, 22, 2, 2, 'F');
  doc.setTextColor(...DARK_GREY);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'italic');
  const disc = 'This assessment is indicative only. It does not constitute legal, financial or regulatory advice. Outputs should be verified by qualified legal and sustainability professionals before use in formal regulatory filings. Methodology v3.1 — April 2026.';
  doc.text(doc.splitTextToSize(disc, CW - 10), M + 5, y + 6);

  footer(doc, 'Executive Summary', 2);
}

// ============================================================
// PILLAR DATA
// ============================================================
function getPillarList(assessment) {
  const a = assessment;
  return [
    {
      key: 'sa', name: 'Energy Efficiency (PUE)', score: a.subscores.sa,
      gapNote: 'Reduce PUE to meet EU Taxonomy threshold',
      regulatoryBasis: { objective: 'Climate change mitigation (Objective 1)', sfdrPai: 'PAI 5 — Non-renewable energy consumption share', source: 'EU Climate Delegated Regulation (EU) 2021/2139, Annex I, Activity 8.1' },
      thresholds: [['New build PUE (post-2025)', '≤ 1.2', 'EU 2021/2139 Annex I Activity 8.1'], ['New build PUE (2021–2025)', '≤ 1.3', 'EU 2021/2139 / CNDCP target'], ['Existing DC threshold', '≤ 1.5', 'EU 2021/2139 Annex I Activity 8.1']],
      inputs: a.pillarDetails?.sa?.explanations ? [...a.pillarDetails.sa.explanations.positive.slice(0, 3).map(e => [e, '', '']), ...a.pillarDetails.sa.explanations.negative.slice(0, 3).map(e => [e, '', ''])] : [],
    },
    {
      key: 'wre', name: 'Water Efficiency (WUE)', score: a.subscores.wre,
      gapNote: 'Reduce WUE to meet CNDCP WUEmax target',
      regulatoryBasis: { objective: 'Sustainable use of water and marine resources (Objective 3)', sfdrPai: 'PAI 8 — Emissions to water', source: 'EUDCA White Paper (October 2024) — CNDCP WUEmax formula' },
      thresholds: [['WUEmax formula', '0.4 × K1 × K2 × K3', 'EUDCA / CNDCP'], ['Excellent', '≤ WUEmax × 0.8', 'Exceeds CNDCP target'], ['Compliant', '≤ WUEmax', 'Meets CNDCP target']],
      inputs: a.pillarDetails?.wre?.explanations ? [...a.pillarDetails.wre.explanations.positive.slice(0, 3).map(e => [e, '', '']), ...a.pillarDetails.wre.explanations.negative.slice(0, 2).map(e => [e, '', ''])] : [],
    },
    {
      key: 'epv', name: 'Renewable Energy', score: a.subscores.epv,
      gapNote: 'Increase renewable % and upgrade source quality tier',
      regulatoryBasis: { objective: 'Climate change mitigation (Objective 1)', sfdrPai: 'PAI 1, 2, 5 — GHG emissions and non-renewable energy', source: 'GHG Protocol Scope 2 Guidance (2015); EU Taxonomy Climate Delegated Act Activity 8.1' },
      thresholds: [['Tier 1 — 100%', '90–100', 'Matched PPA / on-site'], ['Tier 2 — 100% (GOs/RECs)', '65–79', 'Guarantees of Origin'], ['Tier 3 — any %', 'Capped at 40', 'Utility green tariff — no additionality']],
      inputs: a.pillarDetails?.epv?.explanations ? [...a.pillarDetails.epv.explanations.positive.slice(0, 3).map(e => [e, '', '']), ...a.pillarDetails.epv.explanations.negative.slice(0, 2).map(e => [e, '', ''])] : [],
    },
    {
      key: 'csr', name: 'Governance & Minimum Safeguards', score: a.subscores.csr,
      gapNote: 'Complete DNSH checklist and social safeguards',
      regulatoryBasis: { objective: 'DNSH Objectives 2, 4, 5, 6 + Article 18', sfdrPai: 'PAI 7, 10, 11 — Biodiversity, UNGC/OECD', source: 'EU Taxonomy Regulation (EU) 2020/852, Article 18' },
      thresholds: [['Climate vulnerability', '2 pts', 'DNSH Obj 2'], ['Protected areas exclusion', '2 pts', 'DNSH Obj 6'], ['Human rights DD', '2 pts', 'Art 18 / UNGPs']],
      inputs: a.pillarDetails?.csr?.explanations ? [...a.pillarDetails.csr.explanations.positive.slice(0, 3).map(e => [e, '', '']), ...a.pillarDetails.csr.explanations.negative.slice(0, 2).map(e => [e, '', ''])] : [],
    },
    {
      key: 'dfr', name: 'Circular Economy & Waste', score: a.subscores.dfr,
      gapNote: 'Establish certified e-waste program and extend server lifecycle',
      regulatoryBasis: { objective: 'Transition to a circular economy (Objective 4)', sfdrPai: 'PAI 9 — Hazardous waste ratio', source: 'EU Taxonomy Climate Delegated Act; WEEE Directive 2012/19/EU' },
      thresholds: [['E-waste management', 'Required', 'WEEE Directive'], ['Equipment lifecycle', '≥ 5 years', 'Best practice'], ['Sustainable procurement', 'Required', 'ESG criteria']],
      inputs: a.pillarDetails?.dfr?.explanations ? [...a.pillarDetails.dfr.explanations.positive.slice(0, 3).map(e => [e, '', '']), ...a.pillarDetails.dfr.explanations.negative.slice(0, 2).map(e => [e, '', ''])] : [],
    },
  ];
}

function getActions(pillar, assessment) {
  const recs = assessment.recommendations || [];
  return recs.filter(r => r.pillar && (
    (pillar.key === 'sa' && r.pillar.includes('Sustainability')) ||
    (pillar.key === 'epv' && (r.pillar.includes('Energy') || r.pillar.includes('Renewable'))) ||
    (pillar.key === 'wre' && r.pillar.includes('Water')) ||
    (pillar.key === 'csr' && r.pillar.includes('Climate')) ||
    (pillar.key === 'dfr' && (r.pillar.includes('Delivery') || r.pillar.includes('Funding')))
  )).slice(0, 3).map(r => r.action);
}

// ============================================================
// PAGES 3–7 — PILLAR PAGES
// ============================================================
function drawPillarPage(doc, pillar, assessment, pageNum) {
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

  // Section 1 — Regulatory basis
  doc.setFillColor(...GREY);
  doc.roundedRect(M, y, CW, 26, 2, 2, 'F');
  doc.setTextColor(...NAVY);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Regulatory basis', M + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...DARK_GREY);
  doc.text(`EU Taxonomy objective: ${pillar.regulatoryBasis.objective}`, M + 4, y + 13);
  doc.text(`SFDR PAI mapped: ${pillar.regulatoryBasis.sfdrPai}`, M + 4, y + 18);
  doc.text(`Source: ${pillar.regulatoryBasis.source}`, M + 4, y + 23);
  y += 32;

  // Section 2 — Threshold applied
  doc.setTextColor(...NAVY);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Threshold applied', M, y);
  y += 4;
  y = tbl(doc, ['Threshold', 'Value', 'Source'], pillar.thresholds, y, [55, 40, CW - 95]);

  // Section 3 — Your project
  if (pillar.inputs.length > 0) {
    doc.setTextColor(...NAVY);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Your project', M, y);
    y += 4;
    y = tbl(doc, ['Driver / Factor', 'Detail', 'Impact'], pillar.inputs, y, [90, 45, CW - 135]);
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
    ? `This pillar scores ${pillar.score}/100, meeting the threshold for capital readiness. Performance aligns with EU Taxonomy and SFDR requirements for this category.`
    : `This pillar scores ${pillar.score}/100, below the capital readiness threshold. Remediation is required to meet regulatory expectations and improve financing eligibility.`;
  y = wrap(doc, assessText, M, y, CW, 4.5);
  y += 4;

  // Section 5 — Recommended actions
  const actions = getActions(pillar, assessment);
  if (pillar.score < 75 && actions.length > 0) {
    doc.setTextColor(...NAVY);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Recommended actions', M, y);
    y += 5;
    doc.setTextColor(...DARK_GREY);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    actions.forEach(action => {
      const lines = doc.splitTextToSize(`• ${action}`, CW - 4);
      lines.forEach(l => { if (y < PH - 18) { doc.text(l, M + 2, y); y += 4.5; } });
    });
  }

  footer(doc, pillar.name, pageNum);
}

// ============================================================
// PAGE 8 — SFDR PAI INDICATOR MAPPING
// ============================================================
function drawPaiMapping(doc) {
  doc.addPage();
  let y = M;
  y = sectionHead(doc, 'SFDR Principal Adverse Impact Indicator Mapping', y);

  doc.setTextColor(...DARK_GREY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  y = wrap(doc, 'The following PAI indicators (Commission Delegated Regulation (EU) 2022/1288, Annex I, Table 1) are addressed by this assessment:', M, y, CW, 4.5);
  y += 3;

  const paiRows = [
    ['PAI 1', 'GHG emissions (Scope 1, 2, 3)', 'Energy Efficiency + Renewable Energy'],
    ['PAI 2', 'Carbon footprint', 'Energy Efficiency + Renewable Energy'],
    ['PAI 5', 'Non-renewable energy consumption', 'Energy Efficiency + Renewable Energy'],
    ['PAI 7', 'Activities affecting biodiversity-sensitive areas', 'Governance & Social'],
    ['PAI 8', 'Emissions to water', 'Water Efficiency'],
    ['PAI 9', 'Hazardous waste ratio', 'Circular Economy'],
    ['PAI 10', 'UNGC/OECD violations', 'Governance & Social'],
    ['PAI 11', 'UNGC compliance processes', 'Governance & Social'],
    ['PAI 13', 'Board gender diversity', 'Governance & Social (supplementary)'],
  ];

  y = tbl(doc, ['PAI Number', 'Indicator name', 'Assessment pillar'], paiRows, y, [22, 78, CW - 100]);

  doc.setFillColor(...GREY);
  doc.roundedRect(M, y, CW, 20, 2, 2, 'F');
  doc.setTextColor(...DARK_GREY);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'italic');
  const note = 'PAI indicators not addressed by this tool: PAI 3 (GHG intensity), PAI 4 (fossil fuel sector exposure), PAI 6 (energy consumption by sector), PAI 12 (gender pay gap), PAI 14 (controversial weapons). These are not material to data centre project-level assessments.';
  doc.text(doc.splitTextToSize(note, CW - 10), M + 5, y + 5);

  footer(doc, 'SFDR PAI Mapping', 8);
}

// ============================================================
// PAGE 9 — PRIORITISED ACTION PLAN
// ============================================================
function drawActionPlan(doc, project, assessment) {
  doc.addPage();
  const name = project.project_name || 'Untitled Project';
  const date = fmtDate();
  let y = M;

  y = sectionHead(doc, 'Prioritised Actions', y);

  doc.setTextColor(...DARK_GREY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('The following actions are recommended to improve capital readiness, listed in priority order:', M, y);
  y += 7;

  const pillars = getPillarList(assessment);
  const actionItems = pillars.filter(p => p.score < 75).sort((a, b) => a.score - b.score);

  if (actionItems.length === 0) {
    doc.setTextColor(...GREEN);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('All pillars score ≥75. No critical actions required.', M, y + 4);
    y += 14;
  } else {
    actionItems.forEach((p, idx) => {
      if (y > PH - 48) return;

      doc.setFillColor(idx % 2 === 0 ? GREY : WHITE);
      doc.roundedRect(M, y, CW, 30, 2, 2, 'F');

      // Number badge
      doc.setFillColor(...NAVY);
      doc.roundedRect(M + 4, y + 4, 9, 9, 2, 2, 'F');
      doc.setTextColor(...WHITE);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`${idx + 1}`, M + 8.5, y + 10.5, { align: 'center' });

      doc.setTextColor(...NAVY);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(p.name, M + 17, y + 8);

      doc.setTextColor(...DARK_GREY);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`Current: ${p.score}/100  |  Target: 75/100`, M + 17, y + 13.5);

      const recs = getActions(p, assessment);
      const actionText = recs[0] || p.gapNote;
      doc.text(doc.splitTextToSize(actionText, CW - 22)[0] || '', M + 17, y + 19);

      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...MID_GREY);
      doc.text(`Ref: ${p.regulatoryBasis.source}`, M + 17, y + 25);

      y += 34;
    });
  }

  // CTA
  y = Math.max(y, PH - 45);
  doc.setFillColor(...TEAL);
  doc.roundedRect(M, y, CW, 11, 2, 2, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Next step: contact Perennity for advisory support — hello@sustainabledatacenter.ai', M + 5, y + 7.5);

  // Confidential footer
  doc.setTextColor(...MID_GREY);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'italic');
  doc.text(`CONFIDENTIAL — prepared by Perennity Bridge for ${name} — ${date} — Not for distribution without Perennity written consent`, M, PH - 8);

  footer(doc, 'Action Plan', 9);
}

// ============================================================
// MAIN EXPORT
// ============================================================
export function downloadPdf(project, assessment, assessmentId) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Page 1 — Cover
  drawCover(doc, project, assessment, assessmentId);

  // Page 2 — Executive Summary
  drawExecutiveSummary(doc, project, assessment);

  // Pages 3–7 — Pillar pages
  const pillars = getPillarList(assessment);
  pillars.forEach((pillar, i) => {
    drawPillarPage(doc, pillar, assessment, i + 3);
  });

  // Page 8 — SFDR PAI Mapping
  drawPaiMapping(doc);

  // Page 9 — Action Plan
  drawActionPlan(doc, project, assessment);

  const safeName = (project.project_name || 'report').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  doc.save(`perennity-${safeName}-${assessmentId}.pdf`);
}
