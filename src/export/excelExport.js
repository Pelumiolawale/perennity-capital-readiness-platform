import * as XLSX from 'xlsx';
import { FINANCING_LABELS, getApplicableFrameworks } from '../regulations/frameworks/financing-labels.js';

function ws(rows) { return XLSX.utils.aoa_to_sheet(rows); }
function widths(arr) { return arr.map(w => ({ wch: w })); }

export function downloadExcel(project, assessment, assessmentId) {
  const wb = XLSX.utils.book_new();
  const date = new Date().toLocaleDateString('en-GB');
  const fw = getApplicableFrameworks(project.target_financing_label);

  // ── Summary ───────────────────────────────────────────────
  const wsSummary = ws([
    ['PERENNITY — Capital Readiness Assessment'],
    [],
    ['Project', project.project_name || '—'],
    ['Region', project.region || '—'],
    ['Country', project.country || '—'],
    ['Target Financing Label', FINANCING_LABELS[project.target_financing_label] || '—'],
    ['Assessed', date],
    ['Assessment ID', assessmentId],
    [],
    ['CAPITAL READINESS SCORE', `${assessment.capitalReadinessScore} / 100`],
    ['Band', assessment.band?.label || '—'],
    ['Confidence', `${assessment.confidenceScore}%`],
    [],
    ['SFDR Classification', assessment.sfdr?.classification || '—', assessment.sfdr?.label || '—'],
    ['EU Taxonomy', assessment.taxonomy?.aligned ? 'Aligned' : 'Not Aligned', ''],
    [],
    ['Pillar', 'Score', 'Weight'],
    ['Sustainability Alignment', assessment.subscores.sa, `${Math.round((assessment.weights.sa || 0) * 100)}%`],
    ['Energy & Power Viability', assessment.subscores.epv, `${Math.round((assessment.weights.epv || 0) * 100)}%`],
    ['Water & Resource Efficiency', assessment.subscores.wre, `${Math.round((assessment.weights.wre || 0) * 100)}%`],
    ['Climate & Site Resilience', assessment.subscores.csr, `${Math.round((assessment.weights.csr || 0) * 100)}%`],
    ['Delivery & Funding Readiness', assessment.subscores.dfr, `${Math.round((assessment.weights.dfr || 0) * 100)}%`],
    [],
    ...(assessment.hardStopTriggered ? [['HARD STOP', assessment.hardStopReason || '']] : []),
  ]);
  wsSummary['!cols'] = widths([36, 28, 50]);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // ── Recommendations ───────────────────────────────────────
  const wsRec = ws([
    ['Action', 'Pillar', 'Impact', 'Difficulty', 'Est. Uplift (pts)', 'Reason'],
    ...assessment.recommendations.map(r => [r.action, r.pillar, r.impact, r.difficulty, r.uplift, r.reason]),
  ]);
  wsRec['!cols'] = widths([40, 32, 12, 14, 16, 60]);
  XLSX.utils.book_append_sheet(wb, wsRec, 'Recommendations');

  // ── Regulatory Analysis ───────────────────────────────────
  const regRows = [
    ['APPLICABLE REGULATORY FRAMEWORKS'],
    ['Target Financing Label', fw.labelSelected ? fw.labelName : '(not selected)'],
    [],
    ['Tier', 'Framework'],
    ...fw.primary.map(f => ['Primary', f]),
    ...fw.secondary.map(f => [fw.labelSelected ? 'Cross-check' : 'Consider', f]),
    [],
    ['SFDR CLASSIFICATION'],
    ['Classification', assessment.sfdr?.classification || '—'],
    ['Label', assessment.sfdr?.label || '—'],
    ['Description', assessment.sfdr?.description || '—'],
    [],
    ['EU TAXONOMY'],
    ['Overall', assessment.taxonomy?.aligned ? 'Aligned' : 'Not Aligned'],
    [],
    ['Criterion', 'Status'],
    ...(assessment.taxonomy?.criteria || []).map(c => [c.name, c.met ? '✓ Met' : '✗ Not Met']),
    [],
    ['DNSH Objective', 'Status'],
    ...Object.values(assessment.taxonomy?.dnsh || {}).map(d => [d.label, d.met ? '✓ Compliant' : '✗ Gap']),
  ];

  if (assessment.sdr && assessment.sdr.length > 0) {
    regRows.push([], ['UK SDR FUND LABEL ELIGIBILITY'], ['Label', 'Eligible', 'Notes / Gap']);
    assessment.sdr.forEach(s => regRows.push([s.label, s.eligible ? 'Yes' : 'No', s.eligible ? s.description : s.gap]));
  }

  const wsReg = ws(regRows);
  wsReg['!cols'] = widths([40, 20, 70]);
  XLSX.utils.book_append_sheet(wb, wsReg, 'Regulatory Analysis');

  // ── Input Data ────────────────────────────────────────────
  const wsInputs = ws([
    ['Field', 'Value'],
    ['Project Name', project.project_name || ''],
    ['Region', project.region || ''],
    ['Country', project.country || ''],
    ['City', project.city || ''],
    ['Development Stage', project.development_stage || ''],
    ['Expected Commissioning', project.expected_commissioning_date || ''],
    ['Planned Capacity (MW)', project.planned_capacity_mw || ''],
    ['IT Load (MW)', project.it_load_mw || ''],
    ['PUE', project.pue || ''],
    ['WUE', project.wue || ''],
    ['Cooling Type', project.cooling_type || ''],
    ['Backup Power Type', project.backup_power_type || ''],
    ['Battery Storage (MWh)', project.battery_storage_mwh || ''],
    ['Grid Connection Status', project.grid_connection_status || ''],
    ['Interconnection Timeline (months)', project.interconnection_timeline_months || ''],
    ['Renewable Energy %', project.renewable_energy_share_pct || ''],
    ['Renewable Source', project.renewable_energy_source || ''],
    ['PPA Secured', project.ppa_secured ? 'Yes' : 'No'],
    ['Annual Water Demand (m³)', project.annual_water_demand_m3 || ''],
    ['Water Recycling', project.water_recycling_included ? 'Yes' : 'No'],
    ['Waste Heat Recovery', project.waste_heat_recovery ? 'Yes' : 'No'],
    ['Water Stress Index', project.water_stress_index || ''],
    ['Flood Risk Score', project.flood_risk_score || ''],
    ['Extreme Heat Risk Score', project.extreme_heat_risk_score || ''],
    ['Storm Risk Score', project.storm_risk_score || ''],
    ['Adaptation Measures', project.adaptation_measures_present ? 'Yes' : 'No'],
    ['Business Continuity Plan', project.business_continuity_plan_ready ? 'Yes' : 'No'],
    ['Target Financing Label', project.target_financing_label || ''],
    ['Taxonomy Alignment Claimed', project.taxonomy_alignment_claimed ? 'Yes' : 'No'],
    ['Net-Zero Commitment', project.net_zero_commitment_present ? 'Yes' : 'No'],
    ['Sustainability Disclosures Ready', project.sustainability_disclosures_ready ? 'Yes' : 'No'],
    ['Carbon Reduction Strategy', project.carbon_reduction_strategy_present ? 'Yes' : 'No'],
    ['Financing Strategy Defined', project.financing_strategy_defined ? 'Yes' : 'No'],
    ['Investment Memo Ready', project.investment_memo_ready ? 'Yes' : 'No'],
    ['Site Control Secured', project.site_control_secured ? 'Yes' : 'No'],
    ['Permitting Status', project.permitting_status || ''],
    ['EPC / Contractor Identified', project.contractor_or_epc_identified ? 'Yes' : 'No'],
    ['Schedule Confidence', project.schedule_confidence_level || ''],
  ]);
  wsInputs['!cols'] = widths([38, 40]);
  XLSX.utils.book_append_sheet(wb, wsInputs, 'Input Data');

  const safeName = (project.project_name || 'report').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  XLSX.writeFile(wb, `perennity-${safeName}-${assessmentId}.xlsx`);
}
