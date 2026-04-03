import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Brand colours
const TEAL   = [27, 107, 74];
const DARK   = [13, 32, 48];
const SLATE  = [26, 46, 26];
const MID    = [92, 107, 92];
const LIGHT  = [246, 241, 235];
const WHITE  = [255, 255, 255];

function bandColor(score) {
  if (score >= 80) return TEAL;
  if (score >= 60) return [184, 134, 11];
  return [166, 61, 47];
}

function addHeader(doc, projectName, date, assessmentId, pageTitle) {
  doc.setFillColor(...DARK);
  doc.rect(0, 0, 210, 42, 'F');

  doc.setTextColor(...WHITE);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('PERENNITY', 14, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Capital Readiness Platform', 14, 18);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(pageTitle, 14, 30);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(projectName, 196, 12, { align: 'right' });
  doc.text(date, 196, 18, { align: 'right' });
  doc.text(`ID: ${assessmentId}`, 196, 24, { align: 'right' });

  doc.setTextColor(...SLATE);
}

function addFooter(doc, page, total) {
  doc.setDrawColor(221, 213, 202);
  doc.setLineWidth(0.3);
  doc.line(14, 286, 196, 286);
  doc.setFontSize(7);
  doc.setTextColor(...MID);
  doc.text('Perennity Ltd — For informational purposes only. Not investment or legal advice.', 14, 291);
  doc.text(`Page ${page} of ${total}`, 196, 291, { align: 'right' });
}

function scoreRing(doc, cx, cy, r, score) {
  const color = bandColor(score);
  doc.setDrawColor(...color);
  doc.setLineWidth(2.5);
  doc.circle(cx, cy, r, 'S');
  doc.setFillColor(240, 253, 244);
  doc.circle(cx, cy, r - 2, 'F');
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...color);
  doc.text(`${score}`, cx, cy + 2, { align: 'center' });
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MID);
  doc.text('/ 100', cx, cy + 8, { align: 'center' });
}

export function downloadPdf(project, assessment, assessmentId) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const name = project.project_name || 'Untitled Project';

  // ── PAGE 1: COVER ─────────────────────────────────────────
  addHeader(doc, name, date, assessmentId, 'Capital Readiness Assessment');

  let y = 52;

  // Score ring
  scoreRing(doc, 35, y + 18, 17, assessment.capitalReadinessScore);

  // Band + confidence
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...bandColor(assessment.capitalReadinessScore));
  doc.text(assessment.band.label, 62, y + 10);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MID);
  doc.text(`Confidence: ${assessment.confidenceScore}%  ·  Region: ${assessment.region}  ·  Assessed: ${new Date(assessment.assessedAt).toLocaleDateString('en-GB')}`, 62, y + 17);

  // SFDR + Taxonomy badges
  if (assessment.sfdr) {
    const sfdrColor = assessment.sfdr.classification === 'Article 9' ? [5, 150, 105] : assessment.sfdr.classification === 'Article 8' ? [37, 99, 235] : MID;
    doc.setFillColor(...sfdrColor);
    doc.roundedRect(62, y + 22, 52, 8, 2, 2, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`SFDR ${assessment.sfdr.classification}`, 88, y + 27.5, { align: 'center' });

    const taxColor = assessment.taxonomy?.aligned ? TEAL : [166, 61, 47];
    doc.setFillColor(...taxColor);
    doc.roundedRect(118, y + 22, 52, 8, 2, 2, 'F');
    doc.text(assessment.taxonomy?.aligned ? 'EU Taxonomy Aligned' : 'Taxonomy Gap', 144, y + 27.5, { align: 'center' });
    doc.setTextColor(...SLATE);
  }

  y += 44;

  // Pillar score bars
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...SLATE);
  doc.text('Pillar Breakdown', 14, y);
  y += 5;

  const pillars = [
    ['Sustainability Alignment', assessment.subscores.sa, assessment.weights.sa],
    ['Energy & Power Viability', assessment.subscores.epv, assessment.weights.epv],
    ['Water & Resource Efficiency', assessment.subscores.wre, assessment.weights.wre],
    ['Climate & Site Resilience', assessment.subscores.csr, assessment.weights.csr],
    ['Delivery & Funding Readiness', assessment.subscores.dfr, assessment.weights.dfr],
  ];

  pillars.forEach(([label, score, weight]) => {
    y += 9;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...SLATE);
    doc.text(`${label} (${Math.round(weight * 100)}%)`, 14, y);
    doc.text(`${score}`, 196, y, { align: 'right' });
    doc.setFillColor(221, 213, 202);
    doc.roundedRect(14, y + 1.5, 178, 3, 1.5, 1.5, 'F');
    doc.setFillColor(...bandColor(score));
    doc.roundedRect(14, y + 1.5, 178 * score / 100, 3, 1.5, 1.5, 'F');
  });

  y += 14;

  if (assessment.hardStopTriggered) {
    doc.setFillColor(253, 232, 232);
    doc.roundedRect(14, y, 182, 12, 2, 2, 'F');
    doc.setTextColor(166, 61, 47);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Hard-Stop Triggered:', 18, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(assessment.hardStopReason || '', 18, y + 10);
    doc.setTextColor(...SLATE);
    y += 18;
  }

  // Project specs
  autoTable(doc, {
    startY: y,
    head: [['Project Specification', 'Value']],
    body: [
      ['Project Name', project.project_name || '—'],
      ['Region', project.region || '—'],
      ['Country', project.country || '—'],
      ['Development Stage', (project.development_stage || '—').replace(/_/g, ' ')],
      ['Planned Capacity', project.planned_capacity_mw ? `${project.planned_capacity_mw} MW` : '—'],
      ['PUE', project.pue || '—'],
      ['Cooling Type', project.cooling_type || '—'],
      ['Renewable Energy', project.renewable_energy_share_pct ? `${project.renewable_energy_share_pct}%` : '—'],
      ['PPA Secured', project.ppa_secured ? 'Yes' : 'No'],
      ['Grid Status', (project.grid_connection_status || '—').replace(/_/g, ' ')],
      ['WUE', project.wue || '—'],
      ['Backup Power', project.backup_power_type || '—'],
    ],
    theme: 'striped',
    headStyles: { fillColor: DARK, textColor: WHITE, fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    alternateRowStyles: { fillColor: LIGHT },
    margin: { left: 14, right: 14 },
    tableWidth: 182,
  });

  // ── PAGE 2: RISKS + RECOMMENDATIONS ──────────────────────
  doc.addPage();
  addHeader(doc, name, date, assessmentId, 'Risks & Recommendations');
  y = 52;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...SLATE);
  doc.text('Top Risks Identified', 14, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Risk Factor']],
    body: assessment.risks.length > 0 ? assessment.risks.map(r => [r]) : [['No critical risks identified']],
    theme: 'grid',
    headStyles: { fillColor: [166, 61, 47], textColor: WHITE, fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    margin: { left: 14, right: 14 },
    tableWidth: 182,
  });

  y = doc.lastAutoTable.finalY + 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...SLATE);
  doc.text('Priority Recommendations', 14, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Action', 'Pillar', 'Impact', 'Difficulty', 'Est. Uplift']],
    body: assessment.recommendations.map(r => [r.action, r.pillar, r.impact, r.difficulty, `+${r.uplift} pts`]),
    theme: 'striped',
    headStyles: { fillColor: DARK, textColor: WHITE, fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: { 4: { halign: 'center' } },
    margin: { left: 14, right: 14 },
    tableWidth: 182,
  });

  y = doc.lastAutoTable.finalY + 10;

  // Positive drivers
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...SLATE);
  doc.text('Positive Drivers', 14, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Positive Factor']],
    body: assessment.explanations.positive.length > 0 ? assessment.explanations.positive.map(e => [e]) : [['No positive factors recorded']],
    theme: 'grid',
    headStyles: { fillColor: TEAL, textColor: WHITE, fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    margin: { left: 14, right: 14 },
    tableWidth: 182,
  });

  // ── PAGE 3: REGULATORY FRAMEWORK ─────────────────────────
  doc.addPage();
  addHeader(doc, name, date, assessmentId, 'Regulatory Framework Analysis');
  y = 52;

  // SFDR
  if (assessment.sfdr) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...SLATE);
    doc.text(`SFDR Classification: ${assessment.sfdr.classification} — ${assessment.sfdr.label}`, 14, y);
    y += 5;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MID);
    const lines = doc.splitTextToSize(assessment.sfdr.description || '', 182);
    doc.text(lines, 14, y);
    y += lines.length * 4.5 + 8;
  }

  // EU Taxonomy
  if (assessment.taxonomy) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...SLATE);
    doc.text(`EU Taxonomy: ${assessment.taxonomy.aligned ? 'Aligned' : 'Not Aligned'}`, 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['Criterion', 'Status']],
      body: assessment.taxonomy.criteria.map(c => [c.name, c.met ? '✓ Met' : '✗ Not Met']),
      theme: 'striped',
      headStyles: { fillColor: DARK, textColor: WHITE, fontSize: 9 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 1: { halign: 'center', cellWidth: 28 } },
      alternateRowStyles: { fillColor: LIGHT },
      margin: { left: 14, right: 14 },
      tableWidth: 182,
    });

    y = doc.lastAutoTable.finalY + 6;

    autoTable(doc, {
      startY: y,
      head: [['DNSH Objective', 'Status']],
      body: Object.values(assessment.taxonomy.dnsh).map(d => [d.label, d.met ? '✓ Compliant' : '✗ Gap']),
      theme: 'striped',
      headStyles: { fillColor: TEAL, textColor: WHITE, fontSize: 9 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 1: { halign: 'center', cellWidth: 28 } },
      alternateRowStyles: { fillColor: LIGHT },
      margin: { left: 14, right: 14 },
      tableWidth: 182,
    });

    y = doc.lastAutoTable.finalY + 6;
  }

  // UK SDR
  if (assessment.sdr && assessment.sdr.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...SLATE);
    doc.text('UK SDR Fund Label Eligibility', 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['Label', 'Eligible', 'Notes']],
      body: assessment.sdr.map(s => [s.label, s.eligible ? 'Yes' : 'No', s.eligible ? s.description : s.gap]),
      theme: 'striped',
      headStyles: { fillColor: DARK, textColor: WHITE, fontSize: 9 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 1: { halign: 'center', cellWidth: 18 } },
      alternateRowStyles: { fillColor: LIGHT },
      margin: { left: 14, right: 14 },
      tableWidth: 182,
    });
  }

  // ── ADD FOOTERS ───────────────────────────────────────────
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    addFooter(doc, i, total);
  }

  const safeName = (project.project_name || 'report').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  doc.save(`perennity-${safeName}-${assessmentId}.pdf`);
}
