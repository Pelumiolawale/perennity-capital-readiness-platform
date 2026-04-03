import * as XLSX from 'xlsx';
import { MENA_COUNTRIES, COOLING_TECHNOLOGIES, CERTIFICATIONS } from '../constants/regulatoryData.js';

function ws(rows) {
  return XLSX.utils.aoa_to_sheet(rows);
}

function setColWidths(worksheet, widths) {
  worksheet['!cols'] = widths.map(w => ({ wch: w }));
}

export function downloadExcel(formData, results, assessmentId) {
  const wb = XLSX.utils.book_new();
  const date = new Date().toLocaleDateString('en-GB');
  const projectName = formData.projectName || 'Data Centre Project';

  // ── SHEET 1: Summary ──────────────────────────────────────────────
  const summaryRows = [
    ['PERENNITY — Green Finance Compliance Assessment'],
    [],
    ['Project', projectName],
    ['Location', MENA_COUNTRIES.find(c => c.code === formData.country)?.name || formData.country || ''],
    ['Date', date],
    ['Assessment ID', assessmentId],
    [],
    ['OVERALL COMPLIANCE SCORE', `${results.overall}%`],
    [],
    ['Framework', 'Result', 'Notes'],
    ['SFDR Classification', results.sfdr.classification, results.sfdr.label],
    ['EU Taxonomy', results.taxonomy.aligned ? 'Aligned' : 'Not Aligned', results.taxonomy.aligned ? 'All DNSH criteria met' : 'Gaps in technical screening'],
    ['UK SDR Labels', results.sdr.filter(s => s.eligible).map(s => s.label).join(', ') || 'None eligible', ''],
    results.csrd ? ['CSRD Readiness', `${results.csrd.overallScore}%`, results.csrd.label] : [],
    [],
    ['Category', 'Score', 'Status'],
    ['Energy Efficiency', `${results.categories.energy.score}%`, results.categories.energy.score >= 70 ? 'Compliant' : results.categories.energy.score >= 50 ? 'Partial' : 'Non-Compliant'],
    ['Water Management', `${results.categories.water.score}%`, results.categories.water.score >= 70 ? 'Compliant' : results.categories.water.score >= 50 ? 'Partial' : 'Non-Compliant'],
    ['Circular Economy', `${results.categories.circularEconomy.score}%`, results.categories.circularEconomy.score >= 70 ? 'Compliant' : results.categories.circularEconomy.score >= 50 ? 'Partial' : 'Non-Compliant'],
    ['Climate Risk & TCFD', `${results.categories.climateRisk.score}%`, results.categories.climateRisk.score >= 70 ? 'Compliant' : results.categories.climateRisk.score >= 50 ? 'Partial' : 'Non-Compliant']
  ].filter(r => r.length > 0);

  const wsSummary = ws(summaryRows);
  setColWidths(wsSummary, [36, 30, 55]);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // ── SHEET 2: Category Scores & Gaps ──────────────────────────────
  const gapRows = [
    ['Category', 'Score', 'Gap Description', 'Severity', 'Score Impact', 'Remediation', 'Priority Score'],
    ...['energy', 'water', 'circularEconomy', 'climateRisk'].flatMap(key => {
      const cat = results.categories[key];
      const label = { energy: 'Energy', water: 'Water', circularEconomy: 'Circular', climateRisk: 'Climate' }[key];
      if (cat.gaps.length === 0) {
        return [[label, `${cat.score}%`, 'No gaps identified', '', '', '', '']];
      }
      return cat.gaps.map((g, i) => [
        i === 0 ? label : '',
        i === 0 ? `${cat.score}%` : '',
        g.gap,
        g.severity || '',
        g.impactOnScore ? `+${g.impactOnScore} pts` : '',
        g.recommendation || '',
        g.priorityScore ? g.priorityScore.toFixed(1) : ''
      ]);
    })
  ];

  const wsGaps = ws(gapRows);
  setColWidths(wsGaps, [14, 10, 52, 12, 14, 55, 14]);
  XLSX.utils.book_append_sheet(wb, wsGaps, 'Category Scores & Gaps');

  // ── SHEET 3: EU Taxonomy ──────────────────────────────────────────
  const taxRows = [
    ['EU TAXONOMY — Activity 8.1: Data Centres (DA 2021/2139)'],
    [],
    ['SUBSTANTIAL CONTRIBUTION — Climate Change Mitigation'],
    ['Criterion', 'Status'],
    ...results.taxonomy.substantialContribution.criteria.map(c => [c.name, c.met ? '✓ Met' : '✗ Not Met']),
    [],
    ['DO NO SIGNIFICANT HARM (DNSH)'],
    ['Environmental Objective', 'Status', 'Notes'],
    ...Object.values(results.taxonomy.dnsh).map(d => [
      d.label,
      d.met ? '✓ Compliant' : '✗ Gap Identified',
      d.notes || (d.met ? 'Requirements satisfied' : 'Action required')
    ])
  ];

  const wsTax = ws(taxRows);
  setColWidths(wsTax, [52, 18, 60]);
  XLSX.utils.book_append_sheet(wb, wsTax, 'EU Taxonomy');

  // ── SHEET 4: SFDR & UK SDR ────────────────────────────────────────
  const sfdrRows = [
    ['SFDR CLASSIFICATION'],
    ['Classification', results.sfdr.classification],
    ['Label', results.sfdr.label],
    ['Description', results.sfdr.description || ''],
    [],
    ['UK SDR FUND LABEL ELIGIBILITY'],
    ['Label', 'Eligible', 'Description / Gap'],
    ...results.sdr.map(s => [s.label, s.eligible ? 'Yes' : 'No', s.eligible ? (s.description || '') : (s.gap || '')])
  ];

  const wsSfdr = ws(sfdrRows);
  setColWidths(wsSfdr, [36, 20, 70]);
  XLSX.utils.book_append_sheet(wb, wsSfdr, 'SFDR & UK SDR');

  // ── SHEET 5: CSRD Readiness ───────────────────────────────────────
  if (results.csrd) {
    const csrdRows = [
      ['CSRD READINESS ASSESSMENT'],
      ['Overall Score', `${results.csrd.overallScore}%`, results.csrd.label],
      [],
      ['ESRS Standard', 'Score', 'Gap Description'],
      ...[results.csrd.esrsE1, results.csrd.esrsE3, results.csrd.esrsE5].flatMap(e => {
        if (e.gaps.length === 0) return [[e.standard, `${e.score}%`, 'All disclosures covered']];
        return e.gaps.map((g, i) => [i === 0 ? e.standard : '', i === 0 ? `${e.score}%` : '', g]);
      })
    ];

    const wsCsrd = ws(csrdRows);
    setColWidths(wsCsrd, [42, 12, 70]);
    XLSX.utils.book_append_sheet(wb, wsCsrd, 'CSRD Readiness');
  }

  // ── SHEET 6: Recommendations ──────────────────────────────────────
  const recRows = [
    ['Action', 'Priority', 'Timeline', 'Impact', 'Details'],
    ...results.recommendations.map(r => [
      r.action,
      r.priority,
      r.timeline,
      r.impact,
      r.details.join(' | ')
    ])
  ];

  const wsRec = ws(recRows);
  setColWidths(wsRec, [44, 12, 24, 44, 90]);
  XLSX.utils.book_append_sheet(wb, wsRec, 'Recommendations');

  // ── SHEET 7: Input Data ───────────────────────────────────────────
  const inputRows = [
    ['Field', 'Value'],
    ['Project Name', formData.projectName || ''],
    ['Country', MENA_COUNTRIES.find(c => c.code === formData.country)?.name || formData.country || ''],
    ['Project Type', formData.projectType || ''],
    ['Is New Build', formData.isNewBuild ? 'Yes' : 'No'],
    ['Power Capacity (MW)', formData.powerCapacity || ''],
    ['PUE Target', formData.pueTarget || ''],
    ['Renewable Energy (%)', formData.renewablePercent || ''],
    ['Renewable Type', Array.isArray(formData.renewableType) ? formData.renewableType.join(', ') : (formData.renewableType || '')],
    ['PPA Signed', formData.ppaSigned ? 'Yes' : 'No'],
    ['Cooling Type', COOLING_TECHNOLOGIES.find(c => c.id === formData.coolingType)?.name || formData.coolingType || ''],
    ['WUE Metric (L/kWh)', formData.wueMetric || ''],
    ['Recycled Water Level', formData.recycledWaterLevel || ''],
    ['Water Recycling', formData.waterRecycling ? 'Yes' : 'No'],
    ['Alternative Water Source', formData.alternativeWaterSource ? 'Yes' : 'No'],
    ['Certifications', (formData.certifications || []).map(c => CERTIFICATIONS.find(cert => cert.id === c)?.name).filter(Boolean).join(', ') || 'None'],
    ['E-Waste Programme', formData.ewasteProgram || ''],
    ['Equipment Reuse', formData.equipmentReuse ? 'Yes' : 'No'],
    ['Server Lifecycle (years)', formData.serverLifecycle || ''],
    ['Pollution Prevention', formData.pollutionPrevention || ''],
    ['Biodiversity Assessment', formData.biodiversityAssessment ? 'Yes' : 'No'],
    ['TCFD Governance', formData.tcfdGovernance ? 'Yes' : 'No'],
    ['TCFD Strategy', formData.tcfdStrategy ? 'Yes' : 'No'],
    ['TCFD Risk Management', formData.tcfdRiskManagement ? 'Yes' : 'No'],
    ['TCFD Metrics & Targets', formData.tcfdMetrics ? 'Yes' : 'No'],
    ['TCFD Scenarios', formData.tcfdScenarios || ''],
    ['Scope 1 Emissions (tCO2e)', formData.scope1Emissions || ''],
    ['Scope 2 Market-Based (tCO2e)', formData.scope2EmissionsMarket || ''],
    ['Scope 2 Location-Based (tCO2e)', formData.scope2EmissionsLocation || ''],
    ['Total Energy (MWh)', formData.totalEnergyMwh || ''],
    ['Water Withdrawal (m³)', formData.waterWithdrawal || ''],
    ['Waste Generated (tonnes)', formData.wasteGenerated || ''],
    ['Waste Recovery Rate (%)', formData.wasteRecoveryRate || '']
  ];

  const wsInputs = ws(inputRows);
  setColWidths(wsInputs, [36, 40]);
  XLSX.utils.book_append_sheet(wb, wsInputs, 'Input Data');

  // ── WRITE FILE ────────────────────────────────────────────────────
  const safeName = (formData.projectName || 'report').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  XLSX.writeFile(wb, `perennity-${safeName}-${assessmentId}.xlsx`);
}
