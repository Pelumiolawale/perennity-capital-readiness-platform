import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MENA_COUNTRIES, COOLING_TECHNOLOGIES, CERTIFICATIONS } from '../constants/regulatoryData.js';

// Perennity brand colours
const TEAL = [15, 118, 110];
const DARK_TEAL = [6, 78, 59];
const SLATE = [30, 41, 59];
const LIGHT = [248, 250, 252];
const MID = [100, 116, 139];

function scoreColor(score) {
  if (score >= 70) return [5, 150, 105];   // emerald
  if (score >= 50) return [217, 119, 6];   // amber
  return [220, 38, 38];                     // red
}

function addHeader(doc, title, subtitle, projectName, date, assessmentId) {
  // Gradient header block
  doc.setFillColor(...DARK_TEAL);
  doc.rect(0, 0, 210, 50, 'F');
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, 210, 44, 'F');

  // Wordmark
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('PERENNITY', 14, 16);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Green Finance Compliance', 14, 22);

  // Title
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 32);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, 14, 38);

  // Right side — project & date
  doc.setFontSize(8);
  doc.text(projectName, 196, 16, { align: 'right' });
  doc.text(date, 196, 22, { align: 'right' });
  doc.text(`Assessment ID: ${assessmentId}`, 196, 28, { align: 'right' });

  doc.setTextColor(...SLATE);
}

function addFooter(doc, pageNum, totalPages) {
  const y = 290;
  doc.setDrawColor(226, 232, 240);
  doc.line(14, y, 196, y);
  doc.setFontSize(7);
  doc.setTextColor(...MID);
  doc.text('Perennity Ltd — For informational purposes only. Not legal or regulatory advice.', 14, y + 5);
  doc.text(`Page ${pageNum} of ${totalPages}`, 196, y + 5, { align: 'right' });
}

function scoreCircle(doc, x, y, r, score, label) {
  const color = scoreColor(score);
  // outer ring
  doc.setDrawColor(...color);
  doc.setLineWidth(2.5);
  doc.circle(x, y, r, 'S');
  // fill
  doc.setFillColor(240, 253, 244);
  doc.circle(x, y, r - 1.5, 'F');
  // score text
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...color);
  doc.text(`${score}%`, x, y + 2, { align: 'center' });
  // label
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MID);
  doc.text(label, x, y + 8, { align: 'center' });
}

export async function downloadPdf(formData, results, assessmentId) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const projectName = formData.projectName || 'Data Centre Project';
  const countryName = MENA_COUNTRIES.find(c => c.code === formData.country)?.name || formData.country || '';

  // ===== PAGE 1: COVER =====
  addHeader(doc, 'Green Finance Compliance Assessment', 'SFDR · EU Taxonomy · UK SDR · CSRD', projectName, date, assessmentId);

  let y = 60;

  // Score circle
  scoreCircle(doc, 35, y + 15, 16, results.overall, 'Overall Score');

  // Summary cards (right of circle)
  const cards = [
    { label: 'SFDR', value: results.sfdr.classification, sub: results.sfdr.label },
    { label: 'EU Taxonomy', value: results.taxonomy.aligned ? 'Aligned' : 'Not Aligned', sub: results.taxonomy.aligned ? 'All DNSH criteria met' : 'Gaps identified' },
    { label: 'UK SDR', value: results.sdr.filter(s => s.eligible).map(s => s.label.split(' ')[0]).join('/') || 'None', sub: 'Eligible label(s)' }
  ];

  let cx = 65;
  cards.forEach(card => {
    doc.setFillColor(...LIGHT);
    doc.roundedRect(cx, y, 42, 28, 3, 3, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, y, 42, 28, 3, 3, 'S');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MID);
    doc.text(card.label, cx + 4, y + 7);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEAL);
    doc.text(card.value, cx + 4, y + 15);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MID);
    doc.text(card.sub, cx + 4, y + 22);

    cx += 45;
  });

  y += 45;

  // Category score bars
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...SLATE);
  doc.text('Category Breakdown', 14, y);
  y += 5;

  const cats = [
    ['Energy Efficiency', results.categories.energy.score],
    ['Water Management', results.categories.water.score],
    ['Circular Economy', results.categories.circularEconomy.score],
    ['Climate Risk & TCFD', results.categories.climateRisk.score]
  ];

  cats.forEach(([label, score]) => {
    y += 8;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...SLATE);
    doc.text(label, 14, y);
    doc.text(`${score}%`, 196, y, { align: 'right' });

    // bar track
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(14, y + 2, 178, 3, 1.5, 1.5, 'F');
    // bar fill
    doc.setFillColor(...scoreColor(score));
    doc.roundedRect(14, y + 2, 178 * score / 100, 3, 1.5, 1.5, 'F');
  });

  y += 18;

  // Project specs table
  autoTable(doc, {
    startY: y,
    head: [['Project Specification', 'Value']],
    body: [
      ['Project Name', projectName],
      ['Location', countryName],
      ['Power Capacity', `${formData.powerCapacity || 'N/A'} MW`],
      ['Build Type', formData.isNewBuild ? 'New Build' : 'Existing / Retrofit'],
      ['PUE Target', formData.pueTarget || 'N/A'],
      ['Renewable Energy', `${formData.renewablePercent || 0}%`],
      ['Cooling Technology', COOLING_TECHNOLOGIES.find(c => c.id === formData.coolingType)?.name || 'N/A'],
      ['WUE Metric', `${formData.wueMetric || 'N/A'} L/kWh`],
      ['Certifications', (formData.certifications || []).map(c => CERTIFICATIONS.find(cert => cert.id === c)?.name).filter(Boolean).join(', ') || 'None']
    ],
    theme: 'striped',
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
    tableWidth: 182
  });

  // ===== PAGE 2: DETAILED ANALYSIS =====
  doc.addPage();
  addHeader(doc, 'Detailed Compliance Analysis', 'EU Taxonomy · SFDR · UK SDR', projectName, date, assessmentId);
  y = 60;

  // EU Taxonomy substantial contribution
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...SLATE);
  doc.text('EU Taxonomy — Activity 8.1: Data Centres', 14, y);
  y += 4;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MID);
  doc.text('Substantial Contribution — Climate Change Mitigation (DA 2021/2139)', 14, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [['Technical Criterion', 'Status']],
    body: results.taxonomy.substantialContribution.criteria.map(c => [
      c.name,
      c.met ? '✓ Met' : '✗ Not Met'
    ]),
    theme: 'grid',
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: {
      1: {
        halign: 'center',
        cellCallback: (cell, data) => {
          cell.styles.textColor = data.cell.raw.startsWith('✓') ? [5, 150, 105] : [220, 38, 38];
        }
      }
    },
    margin: { left: 14, right: 14 },
    tableWidth: 182
  });

  y = doc.lastAutoTable.finalY + 8;

  // DNSH
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...SLATE);
  doc.text('Do No Significant Harm (DNSH) Checklist', 14, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [['Environmental Objective', 'Status', 'Notes']],
    body: Object.values(results.taxonomy.dnsh).map(d => [
      d.label,
      d.met ? '✓ Compliant' : '✗ Gap',
      d.notes || (d.met ? 'Requirements satisfied' : 'Action required')
    ]),
    theme: 'striped',
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 1: { halign: 'center', cellWidth: 26 }, 2: { cellWidth: 80 } },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
    tableWidth: 182
  });

  y = doc.lastAutoTable.finalY + 8;

  // SFDR
  if (y > 230) { doc.addPage(); addHeader(doc, 'Detailed Compliance Analysis', 'SFDR · UK SDR', projectName, date, assessmentId); y = 60; }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...SLATE);
  doc.text(`SFDR Classification: ${results.sfdr.classification} — ${results.sfdr.label}`, 14, y);
  y += 5;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MID);
  const sfdrLines = doc.splitTextToSize(results.sfdr.description || '', 182);
  doc.text(sfdrLines, 14, y);
  y += sfdrLines.length * 4 + 5;

  // UK SDR
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...SLATE);
  doc.text('UK SDR Fund Label Eligibility', 14, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [['Label Category', 'Eligible', 'Notes / Gap']],
    body: results.sdr.map(s => [
      s.label,
      s.eligible ? '✓ Eligible' : '✗ Not Eligible',
      s.eligible ? (s.description || '') : (s.gap || '')
    ]),
    theme: 'striped',
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 1: { halign: 'center', cellWidth: 26 } },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
    tableWidth: 182
  });

  // ===== PAGE 3: CSRD + GAPS =====
  doc.addPage();
  addHeader(doc, 'CSRD Readiness & Gap Analysis', 'ESRS E1 · E3 · E5 · Remediation Roadmap', projectName, date, assessmentId);
  y = 60;

  if (results.csrd) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...SLATE);
    doc.text(`CSRD Readiness: ${results.csrd.overallScore}% — ${results.csrd.label}`, 14, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [['ESRS Standard', 'Score', 'Key Gaps']],
      body: [results.csrd.esrsE1, results.csrd.esrsE3, results.csrd.esrsE5].map(e => [
        e.standard,
        `${e.score}%`,
        e.gaps.slice(0, 2).join('\n') || 'None identified'
      ]),
      theme: 'striped',
      headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontSize: 9 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 1: { halign: 'center', cellWidth: 18 }, 2: { cellWidth: 110 } },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
      tableWidth: 182
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // Gap analysis
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...SLATE);
  doc.text('Prioritised Gap Analysis', 14, y);
  y += 4;

  const allGaps = [
    ...results.categories.energy.gaps,
    ...results.categories.water.gaps,
    ...results.categories.circularEconomy.gaps,
    ...results.categories.climateRisk.gaps
  ].sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0)).slice(0, 12);

  autoTable(doc, {
    startY: y,
    head: [['Gap', 'Severity', 'Score Impact', 'Remediation']],
    body: allGaps.map(g => [
      g.gap,
      g.severity,
      `+${g.impactOnScore || '?'}pts`,
      g.recommendation || g.action || '—'
    ]),
    theme: 'striped',
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 1: { halign: 'center', cellWidth: 22 }, 2: { halign: 'center', cellWidth: 22 } },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
    tableWidth: 182
  });

  // ===== PAGE 4: REMEDIATION ROADMAP =====
  doc.addPage();
  addHeader(doc, 'Remediation Roadmap', 'Priority Actions & Implementation Timeline', projectName, date, assessmentId);
  y = 60;

  results.recommendations.forEach((rec, i) => {
    if (y > 250) {
      doc.addPage();
      addHeader(doc, 'Remediation Roadmap (cont.)', '', projectName, date, assessmentId);
      y = 60;
    }

    const priorityColor = rec.priority === 'High' ? [220, 38, 38] : rec.priority === 'Medium' ? [217, 119, 6] : [5, 150, 105];

    doc.setFillColor(...LIGHT);
    doc.roundedRect(14, y, 182, 28, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, y, 182, 28, 2, 2, 'S');

    // Priority badge
    doc.setFillColor(...priorityColor);
    doc.roundedRect(14, y, 30, 8, 1, 1, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(`${rec.priority} Priority`, 17, y + 5.5);

    // Timeline badge
    doc.setFillColor(...TEAL);
    doc.roundedRect(46, y, 40, 8, 1, 1, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(rec.timeline, 49, y + 5.5);

    // Title
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...SLATE);
    doc.text(rec.action, 14, y + 14);

    // Impact
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEAL);
    doc.text(rec.impact, 14, y + 20);

    // Details
    doc.setTextColor(...MID);
    doc.setFontSize(7.5);
    const detailText = rec.details.slice(0, 2).join(' | ');
    const lines = doc.splitTextToSize(detailText, 178);
    doc.text(lines[0] || '', 14, y + 26);

    y += 33;
  });

  // ===== FOOTER ON ALL PAGES =====
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages);
  }

  // ===== SAVE =====
  const safeName = (formData.projectName || 'report').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  doc.save(`perennity-${safeName}-${assessmentId}.pdf`);
}
