import jsPDF from 'jspdf';

// ============================================
// PERENNITY BRIDGE — PDF REPORT GENERATOR
// ============================================

const COLORS = {
  navy: [11, 31, 42],       // #0B1F2A
  teal: [78, 205, 164],     // #4ECDA4
  warmWhite: [248, 246, 242], // #F8F6F2
  white: [255, 255, 255],
  amber: [197, 160, 40],    // #C5A028
  slate: [46, 64, 87],      // #2E4057
  mutedRed: [180, 60, 60],
  lightGrey: [240, 240, 240],
  mediumGrey: [180, 180, 180],
  darkGrey: [80, 80, 80],
  green: [34, 139, 94],
  red: [200, 60, 60],
};

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
  eib: 'EIB green finance',
  ifc: 'IFC / World Bank green finance',
  ebrd: 'EBRD green finance',
  afdb: 'AfDB green finance',
};

const MENA_COUNTRIES_MAP = {
  UAE: 'United Arab Emirates', KSA: 'Saudi Arabia', QAT: 'Qatar',
  KWT: 'Kuwait', BHR: 'Bahrain', OMN: 'Oman',
  JOR: 'Jordan', EGY: 'Egypt', MAR: 'Morocco', TUN: 'Tunisia',
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 20;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const TOTAL_PAGES = 9;

function getReadinessBand(score) {
  if (score >= 75) return { label: 'CAPITAL READY', color: COLORS.teal };
  if (score >= 55) return { label: 'CONDITIONALLY READY', color: COLORS.amber };
  if (score >= 35) return { label: 'DEVELOPMENT STAGE', color: COLORS.slate };
  return { label: 'PRE-DEVELOPMENT', color: COLORS.mutedRed };
}

function getPillarDotColor(score) {
  if (score >= 65) return COLORS.green;
  if (score >= 40) return COLORS.amber;
  return COLORS.red;
}

function getPillarBadge(score) {
  if (score >= 65) return { label: 'PASS', color: COLORS.green };
  if (score >= 40) return { label: 'CONDITIONAL', color: COLORS.amber };
  return { label: 'FAIL', color: COLORS.red };
}

function formatDate() {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ============================================
// DRAWING HELPERS
// ============================================

function setColor(doc, rgb) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function setFill(doc, rgb) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

function setDraw(doc, rgb) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

function drawPageFooter(doc, pillarName, pageNum) {
  setColor(doc, COLORS.mediumGrey);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  const footerText = `Perennity Bridge v3.1 · ${pillarName} · Page ${pageNum} of ${TOTAL_PAGES}`;
  doc.text(footerText, MARGIN, PAGE_H - 10);
}

function drawSectionHeader(doc, title, y) {
  setFill(doc, COLORS.teal);
  doc.rect(MARGIN, y, 3, 10, 'F');
  setColor(doc, COLORS.navy);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, MARGIN + 8, y + 7.5);
  return y + 16;
}

function drawTable(doc, headers, rows, y, colWidths) {
  const rowH = 8;
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const startX = MARGIN;

  // Header row
  setFill(doc, COLORS.navy);
  doc.rect(startX, y, totalW, rowH, 'F');
  setColor(doc, COLORS.warmWhite);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  let xPos = startX + 3;
  headers.forEach((h, i) => {
    doc.text(h, xPos, y + 5.5);
    xPos += colWidths[i];
  });
  y += rowH;

  // Data rows
  doc.setFont('helvetica', 'normal');
  rows.forEach((row, rowIdx) => {
    if (y > PAGE_H - 25) return; // safety

    if (rowIdx % 2 === 0) {
      setFill(doc, COLORS.lightGrey);
      doc.rect(startX, y, totalW, rowH, 'F');
    }
    setColor(doc, COLORS.darkGrey);
    doc.setFontSize(7.5);
    xPos = startX + 3;
    row.forEach((cell, i) => {
      const text = String(cell);
      const maxW = colWidths[i] - 6;
      const lines = doc.splitTextToSize(text, maxW);
      doc.text(lines[0] || '', xPos, y + 5.5);
      xPos += colWidths[i];
    });
    y += rowH;
  });

  return y + 4;
}

function wrapText(doc, text, x, y, maxW, lineH) {
  const lines = doc.splitTextToSize(text, maxW);
  lines.forEach((line) => {
    if (y > PAGE_H - 20) return;
    doc.text(line, x, y);
    y += lineH;
  });
  return y;
}

// ============================================
// PAGE 1 — COVER
// ============================================

function drawCover(doc, formData, results) {
  const band = getReadinessBand(results.overall);
  const date = formatDate();
  const projectName = formData.projectName || 'Data Centre Project';
  const region = MENA_COUNTRIES_MAP[formData.country] || formData.country || 'MENA Region';
  const facilityType = formData.facilityType === 'new' ? 'New Build' : 'Existing Facility';

  // Navy background
  setFill(doc, COLORS.navy);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

  // Top-left brand
  setColor(doc, COLORS.teal);
  doc.setFontSize(28);
  doc.setFont('times', 'bold');
  doc.text('PERENNITY BRIDGE', MARGIN, 40);

  setColor(doc, COLORS.warmWhite);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('Capital Readiness Assessment', MARGIN, 52);

  // Teal rule
  setDraw(doc, COLORS.teal);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, 60, PAGE_W - MARGIN, 60);

  // Centre: project name
  setColor(doc, COLORS.warmWhite);
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  const nameLines = doc.splitTextToSize(projectName, CONTENT_W);
  let nameY = 120;
  nameLines.forEach((line) => {
    doc.text(line, PAGE_W / 2, nameY, { align: 'center' });
    nameY += 12;
  });

  // Sub-info
  setColor(doc, COLORS.mediumGrey);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`${region}  |  ${facilityType}  |  ${date}`, PAGE_W / 2, nameY + 8, { align: 'center' });

  // Bottom-left: readiness badge
  const badgeY = PAGE_H - 55;
  setFill(doc, band.color);
  doc.roundedRect(MARGIN, badgeY, 90, 22, 3, 3, 'F');
  setColor(doc, band.color === COLORS.amber ? COLORS.navy : COLORS.white);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(band.label, MARGIN + 45, badgeY + 14, { align: 'center' });

  // Bottom-right: score
  setColor(doc, COLORS.warmWhite);
  doc.setFontSize(42);
  doc.setFont('helvetica', 'bold');
  doc.text(`${results.overall}`, PAGE_W - MARGIN - 30, badgeY + 6, { align: 'center' });
  doc.setFontSize(16);
  doc.setFont('helvetica', 'normal');
  doc.text('/ 100', PAGE_W - MARGIN - 8, badgeY + 6, { align: 'left' });

  // Footer
  setColor(doc, COLORS.mediumGrey);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Perennity Bridge v3.1 · Methodology vintage April 2026 · perennitybridge.com', MARGIN, PAGE_H - 12);
}

// ============================================
// PAGE 2 — EXECUTIVE SUMMARY
// ============================================

function drawExecutiveSummary(doc, formData, results) {
  doc.addPage();
  let y = MARGIN;

  y = drawSectionHeader(doc, 'Executive Summary', y);

  // Score gauge bar
  const gaugeY = y + 2;
  const gaugeW = CONTENT_W;
  const gaugeH = 10;
  const band = getReadinessBand(results.overall);

  setFill(doc, COLORS.lightGrey);
  doc.roundedRect(MARGIN, gaugeY, gaugeW, gaugeH, 2, 2, 'F');
  setFill(doc, band.color);
  const fillW = Math.max(5, (results.overall / 100) * gaugeW);
  doc.roundedRect(MARGIN, gaugeY, fillW, gaugeH, 2, 2, 'F');
  setColor(doc, COLORS.navy);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`${results.overall} / 100 — ${band.label}`, MARGIN + fillW + 4, gaugeY + 7);
  y = gaugeY + gaugeH + 10;

  // Five pillar cards
  const pillars = getPillarData(formData, results);
  const cardW = (CONTENT_W - 16) / 5;
  const cardH = 32;

  pillars.forEach((p, i) => {
    const cx = MARGIN + i * (cardW + 4);
    setFill(doc, COLORS.lightGrey);
    doc.roundedRect(cx, y, cardW, cardH, 2, 2, 'F');

    // Dot
    const dotColor = getPillarDotColor(p.score);
    setFill(doc, dotColor);
    doc.circle(cx + cardW - 6, y + 6, 2.5, 'F');

    // Name
    setColor(doc, COLORS.navy);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    const nameLines = doc.splitTextToSize(p.name, cardW - 8);
    doc.text(nameLines, cx + 4, y + 10);

    // Score
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${p.score}`, cx + 4, y + 26);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('/ 100', cx + 4 + doc.getTextWidth(`${p.score}`) + 1, y + 26);
  });
  y += cardH + 12;

  // Two-column: strengths + gaps
  const colW = (CONTENT_W - 8) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + 8;

  // Strengths
  setColor(doc, COLORS.green);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Key strengths', leftX, y);
  let sy = y + 6;
  setColor(doc, COLORS.darkGrey);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  pillars.filter(p => p.score >= 65).forEach(p => {
    doc.text(`• ${p.name} (${p.score}/100)`, leftX + 2, sy);
    sy += 5;
  });
  if (pillars.filter(p => p.score >= 65).length === 0) {
    doc.text('• No pillars scoring ≥ 65.', leftX + 2, sy);
    sy += 5;
  }

  // Gaps
  setColor(doc, COLORS.red);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Priority gaps', rightX, y);
  let gy = y + 6;
  setColor(doc, COLORS.darkGrey);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  pillars.filter(p => p.score < 55).forEach(p => {
    const lines = doc.splitTextToSize(`• ${p.name} (${p.score}/100) — ${p.gapNote}`, colW - 4);
    lines.forEach(line => {
      doc.text(line, rightX + 2, gy);
      gy += 5;
    });
  });
  if (pillars.filter(p => p.score < 55).length === 0) {
    doc.text('• No critical gaps identified.', rightX + 2, gy);
    gy += 5;
  }

  y = Math.max(sy, gy) + 8;

  // Financing label box
  const labelValue = FINANCING_LABELS[formData.targetFinancingLabel] || 'Not specified';
  setFill(doc, [232, 245, 239]);
  doc.roundedRect(MARGIN, y, CONTENT_W, 14, 2, 2, 'F');
  setDraw(doc, COLORS.teal);
  doc.setLineWidth(0.5);
  doc.roundedRect(MARGIN, y, CONTENT_W, 14, 2, 2, 'S');
  setColor(doc, COLORS.navy);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Target label: ', MARGIN + 5, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.text(labelValue, MARGIN + 5 + doc.getTextWidth('Target label: '), y + 9);
  y += 22;

  // Disclaimer
  setFill(doc, COLORS.lightGrey);
  doc.roundedRect(MARGIN, y, CONTENT_W, 24, 2, 2, 'F');
  setColor(doc, COLORS.darkGrey);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'italic');
  const disclaimer = 'This assessment is indicative only. It does not constitute legal, financial, or regulatory advice. Outputs should be verified by qualified legal and sustainability professionals before use in formal regulatory filings. Methodology v3.1 — April 2026.';
  const dLines = doc.splitTextToSize(disclaimer, CONTENT_W - 10);
  doc.text(dLines, MARGIN + 5, y + 6);

  drawPageFooter(doc, 'Executive Summary', 2);
}

// ============================================
// PILLAR DATA HELPER
// ============================================

function getPillarData(formData, results) {
  const pue = parseFloat(formData.pueTarget) || 1.8;
  const wue = parseFloat(formData.wueMetric) || 2.0;
  const renewable = parseFloat(formData.renewablePercent) || 0;

  return [
    {
      key: 'energy',
      name: 'Energy Efficiency (PUE)',
      score: results.categories.energy.score,
      gapNote: pue > 1.5 ? 'Reduce PUE to ≤ 1.3 (new build) or ≤ 1.5 (existing).' : 'On track.',
      regulatoryBasis: {
        objective: 'Climate change mitigation (Objective 1)',
        sfdrPai: 'PAI 5 — Non-renewable energy consumption share',
        source: 'EU Climate Delegated Regulation (EU) 2021/2139, Annex I, Activity 8.1',
      },
      thresholds: formData.facilityType === 'existing'
        ? [
            ['Existing DC PUE', '≤ 1.5', 'EU 2021/2139 Annex I Activity 8.1'],
            ['Existing DC PUE (conditional)', '≤ 1.8', 'EU 2021/2139 — improvement plan required'],
          ]
        : [
            ['New build PUE (post-2025)', '≤ 1.2', 'EU 2021/2139 Annex I Activity 8.1'],
            ['New build PUE (2021–2025)', '≤ 1.3', 'EU 2021/2139 / CNDCP target'],
            ['Existing DC threshold', '≤ 1.5', 'EU 2021/2139 Annex I Activity 8.1'],
          ],
      inputs: [
        ['Target PUE', pue.toString(), results.categories.energy.details?.find(d => d.metric === 'PUE')?.message || ''],
        ['Facility type', formData.facilityType === 'new' ? 'New Build' : 'Existing', ''],
        ['Renewable energy %', `${renewable}%`, ''],
        ['On-site generation %', `${formData.onsiteGeneration || 0}%`, ''],
      ],
      assessment: getAssessmentText('energy', results.categories.energy, pue, formData),
      actions: getActions('energy', results.categories.energy.score, pue, formData),
    },
    {
      key: 'water',
      name: 'Water Efficiency (WUE)',
      score: results.categories.water.score,
      gapNote: results.categories.water.score < 55 ? 'Reduce WUE to meet the CNDCP WUEmax target.' : 'On track.',
      regulatoryBasis: {
        objective: 'Sustainable use of water and marine resources (Objective 3)',
        sfdrPai: 'PAI 8 — Emissions to water',
        source: 'EUDCA White Paper (October 2024) — CNDCP WUEmax formula',
      },
      thresholds: [
        ['WUEmax formula', '0.4 × K1 × K2 × K3', 'EUDCA White Paper / CNDCP'],
        ['Excellent', '≤ WUEmax × 0.8', 'Exceeds CNDCP target'],
        ['Compliant', '≤ WUEmax', 'Meets CNDCP target'],
        ['Marginal', '≤ WUEmax × 1.2', 'Remediation required'],
      ],
      inputs: [
        ['Actual WUE', `${wue} m³/MWh`, results.categories.water.details?.find(d => d.metric === 'WUE')?.message || ''],
        ['Calculated WUEmax', results.categories.water.details?.find(d => d.metric === 'WUEmax (CNDCP)')?.value || 'N/A', ''],
        ['K1 (climate)', formData.k1Climate || 'default', ''],
        ['K2 (water stress)', formData.k2Stress || 'default', ''],
        ['K3 (water source)', formData.k3Water || 'default', ''],
      ],
      assessment: getAssessmentText('water', results.categories.water, wue, formData),
      actions: getActions('water', results.categories.water.score, wue, formData),
    },
    {
      key: 'renewable',
      name: 'Renewable Energy',
      score: getRenewableScore(results),
      gapNote: renewable < 75 ? 'Increase the renewable share and upgrade the source-quality tier.' : 'On track.',
      regulatoryBasis: {
        objective: 'Climate change mitigation (Objective 1)',
        sfdrPai: 'PAI 1, 2, 5 — GHG emissions and non-renewable energy',
        source: 'GHG Protocol Scope 2 Guidance (2015); EU Taxonomy Climate Delegated Act Activity 8.1',
      },
      thresholds: [
        ['Tier 1 — 100% renewable', '90–100', 'Matched PPA / on-site generation'],
        ['Tier 1 — 75–99%', '70–89', 'Matched PPA / on-site generation'],
        ['Tier 2 — 100% (GOs/RECs)', '65–79', 'Guarantees of Origin / RECs'],
        ['Tier 3 — any %', 'Capped at 40', 'Utility green tariff — does not meet additionality'],
      ],
      inputs: [
        ['Renewable %', `${renewable}%`, ''],
        ['Source tier', `Tier ${formData.renewableSourceTier || '1'}`, ''],
        ['On-site generation', `${formData.onsiteGeneration || 0}%`, ''],
      ],
      assessment: getAssessmentText('renewable', { score: getRenewableScore(results) }, renewable, formData),
      actions: getActions('renewable', getRenewableScore(results), renewable, formData),
    },
    {
      key: 'governance',
      name: 'Governance & Minimum Safeguards',
      score: results.categories.governance.score,
      gapNote: results.categories.governance.score < 55 ? 'Complete the DNSH checklist items and social safeguards.' : 'On track.',
      regulatoryBasis: {
        objective: 'DNSH Objectives 2, 4, 5, 6 + Article 18 Minimum Social Safeguards',
        sfdrPai: 'PAI 7, 10, 11 — Biodiversity, UNGC/OECD compliance',
        source: 'EU Taxonomy Regulation (EU) 2020/852, Article 18; EU F-Gas Regulation (EU) 517/2014; WEEE Directive 2012/19/EU',
      },
      thresholds: [
        ['Climate vulnerability assessment', 'Yes — 2 pts', 'DNSH Obj 2 / IPCC risk taxonomy'],
        ['Protected areas exclusion', 'Yes — 2 pts', 'DNSH Obj 6 / Natura 2000, UNESCO, KBAs'],
        ['Low-GWP refrigerants', 'Yes — 1 pt', 'DNSH Obj 5 / EU F-Gas Reg 517/2014'],
        ['WEEE end-of-life plan', 'Yes — 1 pt', 'DNSH Obj 4 / WEEE Directive 2012/19/EU'],
        ['Human rights due diligence', 'Yes — 2 pts', 'Art 18 / UNGPs + OECD Guidelines'],
        ['Supply chain labour policy', 'Yes — 1 pt', 'Art 18 Minimum Social Safeguards'],
      ],
      inputs: [
        ['Climate vulnerability', formData.dnshClimateVulnerability ? 'Yes' : 'No', ''],
        ['Protected areas', formData.dnshProtectedAreas ? 'Yes' : 'No', ''],
        ['Low-GWP refrigerants', formData.dnshLowGwpRefrigerants ? 'Yes' : 'No', ''],
        ['WEEE compliance', formData.dnshWeeeCompliance ? 'Yes' : 'No', ''],
        ['Human rights DD', formData.dnshHumanRightsDueDiligence ? 'Yes' : 'No', ''],
        ['Supply chain labour', formData.dnshSupplyChainLabour ? 'Yes' : 'No', ''],
      ],
      assessment: getAssessmentText('governance', results.categories.governance, 0, formData),
      actions: getActions('governance', results.categories.governance.score, 0, formData),
    },
    {
      key: 'circular',
      name: 'Circular Economy & Waste',
      score: results.categories.circularEconomy.score,
      gapNote: results.categories.circularEconomy.score < 55 ? 'Establish a certified e-waste programme and extend server lifecycles.' : 'On track.',
      regulatoryBasis: {
        objective: 'Transition to a circular economy (Objective 4)',
        sfdrPai: 'PAI 9 — Hazardous waste ratio',
        source: 'EU Taxonomy Climate Delegated Act; WEEE Directive 2012/19/EU',
      },
      thresholds: [
        ['Comprehensive e-waste program', '35 pts', 'Full lifecycle management'],
        ['Certified recycling partners', '28 pts', 'R2/e-Stewards certified'],
        ['Server lifecycle ≥5 years', '25 pts', 'Extended lifecycle'],
        ['Equipment reuse program', '20 pts', 'Refurbishment and resale'],
      ],
      inputs: [
        ['E-waste program', formData.ewasteProgram || 'None', ''],
        ['Server lifecycle', `${formData.serverLifecycle || 'N/A'} years`, ''],
        ['Equipment reuse', formData.equipmentReuse ? 'Yes' : 'No', ''],
        ['Sustainable procurement', formData.sustainableProcurement ? 'Yes' : 'No', ''],
      ],
      assessment: getAssessmentText('circular', results.categories.circularEconomy, 0, formData),
      actions: getActions('circular', results.categories.circularEconomy.score, 0, formData),
    },
  ];
}

function getRenewableScore(results) {
  // Extract renewable-specific score from energy details
  const detail = results.categories.energy.details?.find(d => d.metric === 'Renewable Energy');
  if (detail) {
    const match = detail.message?.match(/score (\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return Math.min(100, Math.round(results.categories.energy.score * 0.6));
}

function getAssessmentText(pillar, category, value, formData) {
  const score = category.score;
  const badge = getPillarBadge(score);

  const texts = {
    energy: score >= 65
      ? `This facility meets the EU Taxonomy energy-efficiency requirements for data centres. The PUE target of ${value} is within acceptable thresholds for ${formData.facilityType === 'new' ? 'new-build' : 'existing'} facilities.`
      : `The current PUE target of ${value} does not meet the EU Taxonomy threshold. Improvements to cooling infrastructure, containment, and operational efficiency are required to achieve compliance.`,
    water: score >= 65
      ? 'Water usage effectiveness meets or exceeds the CNDCP WUEmax formula target for this climate zone and water-stress level. The facility demonstrates responsible water stewardship.'
      : 'Water usage exceeds the calculated CNDCP WUEmax target. A transition to lower water-intensity cooling technologies or alternative water sources is recommended.',
    renewable: score >= 65
      ? 'Renewable energy sourcing meets the requirements for EU Taxonomy alignment and SFDR disclosure. Source quality is adequate for regulatory purposes.'
      : 'The renewable energy share or source quality is insufficient. Upgrade to matched PPAs or on-site generation to meet the additionality requirements under the EU Taxonomy.',
    governance: score >= 65
      ? 'The organisation demonstrates compliance with DNSH requirements and minimum social safeguards under EU Taxonomy Article 18. All checklist items are substantially addressed.'
      : 'Gaps exist in DNSH compliance or minimum social safeguards. Complete the outstanding checklist items to achieve EU Taxonomy alignment.',
    circular: score >= 65
      ? 'Circular economy practices meet the DNSH requirements for the transition to a circular economy objective. E-waste management and equipment lifecycle practices are adequate.'
      : 'Circular economy practices require improvement. Establish certified e-waste management, extend server lifecycles, and implement equipment reuse programmes.',
  };

  return { badge, text: texts[pillar] || '' };
}

function getActions(pillar, score, value, formData) {
  if (score >= 75) return [];
  const actions = {
    energy: [
      'Implement hot/cold aisle containment and variable-speed drives to reduce PUE.',
      'Deploy AI-based cooling optimisation to dynamically adjust cooling parameters.',
      'Increase temperature setpoints in line with ASHRAE A1/A2 expanded ranges.',
    ],
    water: [
      'Transition to air-cooled or liquid-cooling systems to reduce water dependency.',
      'Implement greywater recycling for cooling-tower make-up water.',
      'Evaluate treated seawater or wastewater as alternative water sources.',
    ],
    renewable: [
      'Negotiate matched Power Purchase Agreements (PPAs) with new-build renewable generation.',
      'Install on-site solar PV arrays to increase Tier 1 sourcing.',
      'Replace utility green tariffs with Guarantees of Origin (GOs) to meet additionality requirements.',
    ],
    governance: [
      'Complete a climate vulnerability assessment per IPCC risk taxonomy for DNSH Objective 2.',
      'Implement a human rights due diligence policy aligned to the UNGPs and OECD Guidelines.',
      'Adopt EU F-Gas Regulation compliant refrigerants (low-GWP) for cooling systems.',
    ],
    circular: [
      'Partner with R2 or e-Stewards certified recyclers for e-waste management.',
      'Extend the server refresh cycle to ≥ 5 years with a refurbishment programme.',
      'Implement a sustainable procurement policy with ESG supplier criteria.',
    ],
  };
  return actions[pillar] || [];
}

// ============================================
// PAGES 3–7 — PILLAR PAGES
// ============================================

function drawPillarPage(doc, pillar, pageNum) {
  doc.addPage();

  // Header bar
  setFill(doc, COLORS.teal);
  doc.rect(0, 0, PAGE_W, 22, 'F');
  setColor(doc, COLORS.white);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(pillar.name, MARGIN, 15);

  // Score badge top-right
  const badge = getPillarBadge(pillar.score);
  setFill(doc, badge.color);
  doc.roundedRect(PAGE_W - MARGIN - 35, 4, 35, 14, 2, 2, 'F');
  setColor(doc, COLORS.white);
  doc.setFontSize(10);
  doc.text(`${pillar.score}/100`, PAGE_W - MARGIN - 17.5, 13, { align: 'center' });

  let y = 32;

  // Section 1 — Regulatory basis
  setFill(doc, COLORS.lightGrey);
  doc.roundedRect(MARGIN, y, CONTENT_W, 28, 2, 2, 'F');
  setColor(doc, COLORS.navy);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Regulatory basis', MARGIN + 5, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setColor(doc, COLORS.darkGrey);
  doc.text(`EU Taxonomy objective: ${pillar.regulatoryBasis.objective}`, MARGIN + 5, y + 14);
  doc.text(`SFDR PAI mapped: ${pillar.regulatoryBasis.sfdrPai}`, MARGIN + 5, y + 19.5);
  doc.text(`Source: ${pillar.regulatoryBasis.source}`, MARGIN + 5, y + 25);
  y += 34;

  // Section 2 — Threshold applied
  setColor(doc, COLORS.navy);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Threshold applied', MARGIN, y + 5);
  y += 10;
  y = drawTable(doc, ['Threshold', 'Value', 'Source'], pillar.thresholds, y, [60, 45, CONTENT_W - 105]);

  // Section 3 — Your project
  setColor(doc, COLORS.navy);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Your project', MARGIN, y + 5);
  y += 10;
  y = drawTable(doc, ['Input', 'Value you provided', 'Result'], pillar.inputs, y, [50, 55, CONTENT_W - 105]);

  // Section 4 — Assessment
  setColor(doc, COLORS.navy);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Assessment', MARGIN, y + 5);
  y += 10;

  // Badge
  const ab = pillar.assessment.badge;
  setFill(doc, ab.color);
  doc.roundedRect(MARGIN, y, 30, 9, 2, 2, 'F');
  setColor(doc, COLORS.white);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(ab.label, MARGIN + 15, y + 6, { align: 'center' });

  setColor(doc, COLORS.darkGrey);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  y += 14;
  y = wrapText(doc, pillar.assessment.text, MARGIN, y, CONTENT_W, 4.5);
  y += 4;

  // Section 5 — Recommended actions (if score < 75)
  if (pillar.actions.length > 0) {
    setColor(doc, COLORS.navy);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Recommended actions', MARGIN, y + 5);
    y += 10;
    setColor(doc, COLORS.darkGrey);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    pillar.actions.forEach(action => {
      const lines = doc.splitTextToSize(`• ${action}`, CONTENT_W - 5);
      lines.forEach(line => {
        if (y < PAGE_H - 20) {
          doc.text(line, MARGIN + 2, y);
          y += 5;
        }
      });
    });
  }

  drawPageFooter(doc, pillar.name, pageNum);
}

// ============================================
// PAGE 8 — SFDR PAI INDICATOR MAPPING
// ============================================

function drawPaiMapping(doc) {
  doc.addPage();
  let y = MARGIN;

  y = drawSectionHeader(doc, 'SFDR Principal Adverse Impact Indicator Mapping', y);

  setColor(doc, COLORS.darkGrey);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const intro = 'The following PAI indicators (Commission Delegated Regulation (EU) 2022/1288, Annex I, Table 1) are addressed by this assessment:';
  y = wrapText(doc, intro, MARGIN, y, CONTENT_W, 4.5);
  y += 4;

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

  y = drawTable(doc, ['PAI Number', 'Indicator name', 'Assessment pillar'], paiRows, y, [25, 80, CONTENT_W - 105]);
  y += 6;

  // Note
  setFill(doc, COLORS.lightGrey);
  doc.roundedRect(MARGIN, y, CONTENT_W, 22, 2, 2, 'F');
  setColor(doc, COLORS.darkGrey);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  const note = 'PAI indicators not addressed by this tool: PAI 3 (GHG intensity), PAI 4 (fossil fuel sector exposure), PAI 6 (energy consumption by sector), PAI 12 (gender pay gap), PAI 14 (controversial weapons). These are not material to data centre project-level assessments.';
  const nLines = doc.splitTextToSize(note, CONTENT_W - 10);
  doc.text(nLines, MARGIN + 5, y + 6);

  drawPageFooter(doc, 'SFDR PAI Mapping', 8);
}

// ============================================
// PAGE 9 — PRIORITISED ACTION PLAN
// ============================================

function drawActionPlan(doc, formData, results) {
  doc.addPage();
  let y = MARGIN;
  const projectName = formData.projectName || 'Data Centre Project';
  const date = formatDate();

  y = drawSectionHeader(doc, 'Prioritised Actions', y);

  setColor(doc, COLORS.darkGrey);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('The following actions are recommended to improve capital readiness, listed in priority order:', MARGIN, y);
  y += 8;

  const pillars = getPillarData(formData, results);
  const actionItems = pillars
    .filter(p => p.score < 75)
    .sort((a, b) => a.score - b.score);

  if (actionItems.length === 0) {
    setColor(doc, COLORS.green);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('All pillars score ≥75. No critical actions required.', MARGIN, y + 5);
    y += 15;
  } else {
    actionItems.forEach((p, idx) => {
      if (y > PAGE_H - 50) return;

      // Action card
      setFill(doc, idx % 2 === 0 ? COLORS.lightGrey : COLORS.white);
      doc.roundedRect(MARGIN, y, CONTENT_W, 32, 2, 2, 'F');

      // Number badge
      setFill(doc, COLORS.navy);
      doc.roundedRect(MARGIN + 4, y + 4, 10, 10, 2, 2, 'F');
      setColor(doc, COLORS.white);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`${idx + 1}`, MARGIN + 9, y + 11, { align: 'center' });

      // Content
      setColor(doc, COLORS.navy);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(p.name, MARGIN + 18, y + 8);

      setColor(doc, COLORS.darkGrey);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`Current score: ${p.score}/100  |  Target score: 75/100`, MARGIN + 18, y + 14);

      const actionText = p.actions[0] || 'Improve practices to meet regulatory thresholds.';
      const actionLines = doc.splitTextToSize(actionText, CONTENT_W - 22);
      doc.text(actionLines[0] || '', MARGIN + 18, y + 20);

      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'italic');
      setColor(doc, COLORS.mediumGrey);
      doc.text(`Ref: ${p.regulatoryBasis.source}`, MARGIN + 18, y + 26);

      y += 36;
    });
  }

  // Next step
  y = Math.max(y, PAGE_H - 50);
  setFill(doc, COLORS.teal);
  doc.roundedRect(MARGIN, y, CONTENT_W, 12, 2, 2, 'F');
  setColor(doc, COLORS.white);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Next step: contact Perennity for advisory support — hello@perennitybridge.com', MARGIN + 5, y + 8);
  y += 18;

  // Confidential footer
  setColor(doc, COLORS.mediumGrey);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'italic');
  doc.text(`CONFIDENTIAL — Prepared by Perennity Bridge for ${projectName} — ${date} — Not for distribution without the written consent of Perennity.`, MARGIN, PAGE_H - 10);

  drawPageFooter(doc, 'Action Plan', 9);
}

// ============================================
// MAIN EXPORT
// ============================================

export default function generatePDFReport(formData, results) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Page 1 — Cover
  drawCover(doc, formData, results);

  // Page 2 — Executive Summary
  drawExecutiveSummary(doc, formData, results);

  // Pages 3–7 — Pillar pages
  const pillars = getPillarData(formData, results);
  pillars.forEach((pillar, i) => {
    drawPillarPage(doc, pillar, i + 3);
  });

  // Page 8 — SFDR PAI Mapping
  drawPaiMapping(doc);

  // Page 9 — Prioritised Action Plan
  drawActionPlan(doc, formData, results);

  // Save
  const filename = `perennity-assessment-${(formData.projectName || 'report').replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}
