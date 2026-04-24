import * as XLSX from 'xlsx';
import { FINANCING_LABELS, getApplicableFrameworks } from '../regulations/frameworks/financing-labels.js';
import {
  getRegulatoryBasis,
  getApplicablePillars,
  shouldRenderPaiPage,
  shouldRenderDnshEvidencePage,
  PILLAR_DISPLAY_NAMES,
  PAI_MAPPING_ROWS,
  SUPPORTED_EXPORT_LABELS,
} from './regulatoryBasisByLabel.js';

// ============================================================
// PERENNITY BRIDGE — LABEL-DRIVEN EXCEL REPORT GENERATOR
// Mirrors the PDF page plan across sheets. Conditional sheets
// (DNSH Evidence, SFDR PAI) are omitted entirely rather than
// rendered blank, matching the PDF's variable page count.
// ============================================================

function ws(rows) { return XLSX.utils.aoa_to_sheet(rows); }
function widths(arr) { return arr.map(w => ({ wch: w })); }

function labelSupportsExport(label) {
  return SUPPORTED_EXPORT_LABELS.includes(label);
}

// ── Summary sheet ───────────────────────────────────────────
function buildSummarySheet(project, assessment, assessmentId, date) {
  const le = assessment.labelEvaluation;
  const fw = getApplicableFrameworks(project.target_financing_label);
  const rows = [
    ['PERENNITY — Capital Readiness Assessment'],
    [],
    ['Project', project.project_name || '—'],
    ['Region', project.region || '—'],
    ['Country', project.country || '—'],
    ['Target Financing Label', FINANCING_LABELS[project.target_financing_label] || '—'],
    ['Assessed', date],
    ['Assessment ID', assessmentId],
    [],
    ['LABEL VERDICT', le ? le.verdict : '(not evaluated)', le ? (le.summary || '') : ''],
    ['CAPITAL READINESS SCORE', `${assessment.capitalReadinessScore} / 100`, assessment.band?.label || ''],
    ['Confidence', `${assessment.confidenceScore}%`, ''],
    [],
    ['Pillar', 'Score', 'Weight'],
    ['Energy Efficiency (PUE)',             assessment.subscores.sa,  `${Math.round((assessment.weights.sa  || 0) * 100)}%`],
    ['Renewable Energy',                    assessment.subscores.epv, `${Math.round((assessment.weights.epv || 0) * 100)}%`],
    ['Water Efficiency (WUE)',              assessment.subscores.wre, `${Math.round((assessment.weights.wre || 0) * 100)}%`],
    ['Governance & Minimum Safeguards',     assessment.subscores.csr, `${Math.round((assessment.weights.csr || 0) * 100)}%`],
    ['Delivery & Funding Readiness',        assessment.subscores.dfr, `${Math.round((assessment.weights.dfr || 0) * 100)}%`],
    [],
    ['APPLICABLE REGULATORY FRAMEWORKS'],
    ...fw.primary.map(f => ['Primary', f]),
    ...fw.secondary.map(f => [fw.labelSelected ? 'Cross-check' : 'Consider', f]),
    ...(assessment.hardStopTriggered ? [[], ['HARD STOP', assessment.hardStopReason || '']] : []),
  ];
  const sheet = ws(rows);
  sheet['!cols'] = widths([36, 28, 60]);
  return sheet;
}

// ── Criteria sheet ──────────────────────────────────────────
function buildCriteriaSheet(assessment) {
  const le = assessment.labelEvaluation;
  if (!le) return null;
  const rows = [
    ['LABEL CRITERIA ASSESSMENT'],
    ['Label', le.labelName],
    ['Verdict', le.verdict],
    ['Summary', le.summary || ''],
    [],
    ['ID', 'Title', 'Status', 'Detail', 'Citation', 'Weight', 'Group'],
  ];
  const groupFor = (c) => {
    if (le.label !== 'eu_taxonomy_8_1') return '';
    if (c.id === 'substantial_contribution') return 'Substantial Contribution';
    if (c.id.startsWith('dnsh_')) return 'DNSH (other 5 objectives)';
    if (c.id === 'minimum_safeguards') return 'Minimum Safeguards';
    return '';
  };
  le.criteria.forEach(c => {
    rows.push([c.id, c.title, c.status, c.detail || '', c.citation || '', c.weight || '', groupFor(c)]);
  });
  const sheet = ws(rows);
  sheet['!cols'] = widths([28, 48, 22, 56, 48, 14, 28]);
  // Enable autofilter over the table header + body.
  const tableStartRow = 5; // 0-indexed
  const tableEndRow = tableStartRow + le.criteria.length;
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: tableStartRow }, e: { c: 6, r: tableEndRow } }) };
  return sheet;
}

// ── Pillars sheet ───────────────────────────────────────────
function buildPillarsSheet(project, assessment) {
  const label = project.target_financing_label;
  const applicable = getApplicablePillars(label);
  const rows = [
    ['PILLAR SCORES & REGULATORY BASIS'],
    ['Label', FINANCING_LABELS[label] || '—'],
    [],
    ['Pillar', 'Score', 'Primary Regime', 'Objective / Category', 'PAI Mapping', 'Sources', 'Thresholds Applied', 'Your Project Detail', 'Assessment'],
  ];
  applicable.forEach(key => {
    const basis = getRegulatoryBasis(key, label);
    if (!basis) return;
    const score = assessment.subscores[key];
    const thresholds = basis.thresholdTable.map(t => `${t.threshold}: ${t.value} (${t.source})`).join(' | ');
    const details = assessment.pillarDetails?.[key]?.explanations;
    const inputs = details
      ? [...(details.positive || []).slice(0, 3), ...(details.negative || []).slice(0, 2)].join(' | ')
      : '';
    const verdict = score >= 65 ? 'PASS' : score >= 40 ? 'CONDITIONAL' : 'FAIL';
    rows.push([
      PILLAR_DISPLAY_NAMES[key] || key,
      score,
      basis.primaryRegime,
      basis.objectiveOrCategory,
      basis.paiMapping || '(n/a)',
      basis.sources.join('; '),
      thresholds,
      inputs,
      verdict,
    ]);
  });
  const sheet = ws(rows);
  sheet['!cols'] = widths([32, 10, 48, 48, 40, 48, 60, 60, 16]);
  return sheet;
}

// ── DNSH Evidence sheet (SFDR Art 8 / 9) ────────────────────
function buildDnshEvidenceSheet(assessment) {
  const le = assessment.labelEvaluation;
  const informational = le?.dnshTreatment === 'informational';
  const rows = [
    ['DNSH & MINIMUM SAFEGUARDS — EVIDENCE'],
    ['Label', le?.labelName || '—'],
    ['Treatment', informational ? 'Informational (Art 8 — applies per-investment)' : 'Pass/Fail'],
    [],
    ['Evidence item', 'Status', 'Citation'],
    ...((assessment.dnsh?.details || []).map(d => [
      d.label,
      informational ? 'Advisory' : (d.met ? '✓ Confirmed' : '✗ Not confirmed'),
      d.citation,
    ])),
  ];
  const sheet = ws(rows);
  sheet['!cols'] = widths([60, 26, 70]);
  return sheet;
}

// ── SFDR PAI sheet (EU Tax + SFDR only) ─────────────────────
function buildPaiSheet() {
  const rows = [
    ['SFDR PRINCIPAL ADVERSE IMPACT INDICATOR MAPPING'],
    ['Source: Commission Delegated Regulation (EU) 2022/1288, Annex I, Table 1'],
    [],
    ['PAI Number', 'Indicator name', 'Assessment pillar'],
    ...PAI_MAPPING_ROWS,
    [],
    ['Note', 'PAI 3, 4, 6, 12, 14 are not addressed (apply at portfolio/investee-company level rather than data-centre project level).'],
  ];
  const sheet = ws(rows);
  sheet['!cols'] = widths([16, 58, 40]);
  return sheet;
}

// ── Actions sheet ───────────────────────────────────────────
function buildActionsSheet(assessment) {
  const le = assessment.labelEvaluation;
  if (!le) {
    // Legacy fallback: pillar-driven
    const rows = [
      ['Action', 'Pillar', 'Impact', 'Difficulty', 'Est. Uplift (pts)', 'Reason'],
      ...(assessment.recommendations || []).map(r => [r.action, r.pillar, r.impact, r.difficulty, r.uplift, r.reason]),
    ];
    const sheet = ws(rows);
    sheet['!cols'] = widths([42, 32, 14, 14, 18, 60]);
    return sheet;
  }
  const failing = le.criteria.filter(c => c.status !== 'PASS');
  const rows = [
    ['PRIORITISED ACTIONS'],
    ['Label', le.labelName],
    [],
    ['Criterion', 'Status', 'Weight', 'Remediation note', 'Citation'],
    ...failing.map(c => [
      c.title,
      c.status,
      c.weight || '',
      c.detail ? `Provide evidence — ${c.detail.replace(/^Unmet: /, '')}` : '',
      c.citation || '',
    ]),
  ];
  if (failing.length === 0) {
    rows.push(['All criteria met', 'PASS', '', 'No critical actions required.', '']);
  }
  const sheet = ws(rows);
  sheet['!cols'] = widths([50, 24, 16, 60, 40]);
  return sheet;
}

// ── Fallback notice sheet ───────────────────────────────────
function buildFallbackNoticeSheet(project) {
  const labelName = FINANCING_LABELS[project.target_financing_label] || project.target_financing_label || '(no label selected)';
  const rows = [
    ['NOTICE — Label not supported for detailed export'],
    [],
    ['Target label', labelName],
    [],
    ['Message', `The target financing label "${labelName}" is not currently supported for detailed regulatory export. The Summary sheet shows pillar scores for indicative purposes only.`],
    [],
    ['Supported labels', 'EU Taxonomy 8.1 · SFDR Article 8 · SFDR Article 9 · UK SDR Focus / Improvers / Impact / Mixed Goals'],
    ['Contact', 'hello@perennitybridge.com — for bespoke regulatory assessment on other labels.'],
  ];
  const sheet = ws(rows);
  sheet['!cols'] = widths([22, 90]);
  return sheet;
}

// ── Input Data sheet (always included — useful archive) ─────
function buildInputsSheet(project) {
  return ws([
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
    ['K1 — Climate Zone', project.k1_climate || ''],
    ['K2 — Water Stress Level', project.k2_stress || ''],
    ['K3 — Water Source', project.k3_water || ''],
    ['Water Recycling', project.water_recycling_included ? 'Yes' : 'No'],
    ['Waste Heat Recovery', project.waste_heat_recovery ? 'Yes' : 'No'],
    ['Flood Risk Score', project.flood_risk_score || ''],
    ['Extreme Heat Risk Score', project.extreme_heat_risk_score || ''],
    ['Storm Risk Score', project.storm_risk_score || ''],
    ['Adaptation Measures', project.adaptation_measures_present ? 'Yes' : 'No'],
    ['Business Continuity Plan', project.business_continuity_plan_ready ? 'Yes' : 'No'],
    ['Target Financing Label', project.target_financing_label || ''],
    ['Substantial Contribution Objective', project.substantial_contribution_objective || ''],
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
}

// ── Main ────────────────────────────────────────────────────
export function downloadExcel(project, assessment, assessmentId) {
  const wb = XLSX.utils.book_new();
  const date = new Date().toLocaleDateString('en-GB');
  const label = project.target_financing_label;

  // Sheet 1 — Summary (always present)
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(project, assessment, assessmentId, date), 'Summary');

  if (!labelSupportsExport(label)) {
    // Fallback: Summary + Notice + Inputs (kept as data archive).
    XLSX.utils.book_append_sheet(wb, buildFallbackNoticeSheet(project), 'Notice');
    const inputs = buildInputsSheet(project);
    inputs['!cols'] = widths([38, 40]);
    XLSX.utils.book_append_sheet(wb, inputs, 'Input Data');
  } else {
    // Sheet 2 — Label criteria
    const crit = buildCriteriaSheet(assessment);
    if (crit) XLSX.utils.book_append_sheet(wb, crit, 'Criteria');

    // Sheet 3 — Pillars
    XLSX.utils.book_append_sheet(wb, buildPillarsSheet(project, assessment), 'Pillars');

    // Sheet 4 — DNSH Evidence (conditional)
    if (shouldRenderDnshEvidencePage(label)) {
      XLSX.utils.book_append_sheet(wb, buildDnshEvidenceSheet(assessment), 'DNSH Evidence');
    }

    // Sheet 5 — SFDR PAI (conditional)
    if (shouldRenderPaiPage(label)) {
      XLSX.utils.book_append_sheet(wb, buildPaiSheet(), 'SFDR PAI');
    }

    // Sheet 6 — Actions
    XLSX.utils.book_append_sheet(wb, buildActionsSheet(assessment), 'Actions');

    // Sheet 7 — Input Data (always useful archive)
    const inputs = buildInputsSheet(project);
    inputs['!cols'] = widths([38, 40]);
    XLSX.utils.book_append_sheet(wb, inputs, 'Input Data');
  }

  const safeName = (project.project_name || 'report').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  XLSX.writeFile(wb, `perennity-${safeName}-${assessmentId}.xlsx`);
}
