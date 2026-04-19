// ============================================================
// LABEL EVALUATION — pass/fail verdict per target_financing_label
//
// Driven by the Tab 5 "Target Financing Label" selection. The
// Results page renders the verdict banner + criteria breakdown
// from this output; scoring thresholds (PUE bands, renewables,
// DNSH gates) are NOT changed here — this module only
// INTERPRETS the existing assessment + intake for the label's
// regulatory framework.
//
// Scope: 6 labels (EU Taxonomy 8.1 + SFDR Art 8 + SFDR Art 9 +
// 4 UK SDR labels). All other labels return null → Results page
// falls back to generic view.
// ============================================================

import { FINANCING_LABELS } from '../regulations/frameworks/financing-labels.js';

// Status codes per criterion.
const STATUS = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  PARTIAL: 'PARTIAL',
  EVIDENCE_INCOMPLETE: 'EVIDENCE_INCOMPLETE',
};

// Weights determine how a criterion's status rolls up into the
// overall verdict. Critical must PASS for overall PASS; Required
// must PASS for overall PASS (CONDITIONAL allowed if supporting
// incomplete); Supporting drives CONDITIONAL only.
const WEIGHT = {
  CRITICAL: 'critical',
  REQUIRED: 'required',
  SUPPORTING: 'supporting',
};

// The 6 EU Taxonomy environmental objectives per Reg 2020/852
// Art 9. Activity 8.1 prescribes Climate Change Mitigation (CCM)
// as the substantial contribution objective per EU 2021/2139
// Annex I — alternatives are reserved for future DC activities.
export const EU_TAXONOMY_OBJECTIVES = {
  ccm: 'Climate Change Mitigation',
  cca: 'Climate Change Adaptation',
  water: 'Sustainable Use and Protection of Water and Marine Resources',
  circular: 'Transition to a Circular Economy',
  pollution: 'Pollution Prevention and Control',
  biodiversity: 'Protection and Restoration of Biodiversity and Ecosystems',
};

// Single entry point. Returns null for labels outside scope.
export function evaluateLabel(assessment, intake) {
  const label = intake?.target_financing_label;
  if (!label) return null;

  switch (label) {
    case 'eu_taxonomy_8_1':  return evaluateEuTaxonomy(assessment, intake);
    case 'sfdr_article_8':   return evaluateSfdrArticle8(assessment, intake);
    case 'sfdr_article_9':   return evaluateSfdrArticle9(assessment, intake);
    case 'uk_sdr_focus':     return evaluateUkSdrFocus(assessment, intake);
    case 'uk_sdr_improvers': return evaluateUkSdrImprovers(assessment, intake);
    case 'uk_sdr_impact':    return evaluateUkSdrImpact(assessment, intake);
    case 'uk_sdr_mixed':     return evaluateUkSdrMixed(assessment, intake);
    default:
      return null;
  }
}

// Rolls up a criteria list into PASS / FAIL / CONDITIONAL.
function rollupVerdict(criteria, { conditionalOnSupporting = true } = {}) {
  const critical = criteria.filter(c => c.weight === WEIGHT.CRITICAL);
  const required = criteria.filter(c => c.weight === WEIGHT.REQUIRED);
  const supporting = criteria.filter(c => c.weight === WEIGHT.SUPPORTING);

  const anyFail = (list) => list.some(c => c.status === STATUS.FAIL);
  const anyNotPass = (list) => list.some(c => c.status !== STATUS.PASS);

  if (anyFail(critical) || anyFail(required)) return 'FAIL';
  if (anyNotPass(critical)) return 'FAIL';
  if (anyNotPass(required)) {
    // No critical failures, but some required not PASS (PARTIAL / EVIDENCE_INCOMPLETE)
    return 'FAIL';
  }
  if (conditionalOnSupporting && supporting.some(c => c.status !== STATUS.PASS)) {
    return 'CONDITIONAL';
  }
  return 'PASS';
}

function summarise(labelName, verdict, criteria) {
  const total = criteria.length;
  const passed = criteria.filter(c => c.status === STATUS.PASS).length;
  const critUnmet = criteria.filter(
    c => c.weight === WEIGHT.CRITICAL && c.status !== STATUS.PASS,
  );
  if (verdict === 'PASS') {
    return `Meets all ${total} ${labelName} criteria.`;
  }
  if (verdict === 'CONDITIONAL') {
    return `Meets ${passed} of ${total} criteria. Evidence gaps on supporting items.`;
  }
  if (critUnmet.length > 0) {
    return `Meets ${passed} of ${total} criteria. Critical gap: ${critUnmet[0].title}.`;
  }
  return `Meets ${passed} of ${total} criteria.`;
}

// ── EU Taxonomy Activity 8.1 ────────────────────────────────
// EU 2020/852 Art 3 + 17: substantial contribution to ≥1 obj +
// DNSH to the other 5 + minimum safeguards (Art 18) + TSC.
// Activity 8.1 → substantial contribution is CCM per 2021/2139.
function evaluateEuTaxonomy(assessment, intake) {
  const tax = assessment?.taxonomy;
  const objective = intake?.substantial_contribution_objective || 'ccm';
  const objectiveName = EU_TAXONOMY_OBJECTIVES[objective] || EU_TAXONOMY_OBJECTIVES.ccm;
  const criteria = [];

  // 1. Substantial contribution — derived from the TSC criteria
  // already computed in determineEuTaxonomyAlignment. All four
  // sub-criteria (PUE, renewables, waste heat, climate risk
  // assessment) must be met.
  const scDetails = tax?.criteria || [];
  const scMet = scDetails.length > 0 && scDetails.every(c => c.met);
  const scUnmet = scDetails.filter(c => !c.met).map(c => c.name);
  criteria.push({
    id: 'substantial_contribution',
    title: `Substantial contribution to ${objectiveName}`,
    status: scMet ? STATUS.PASS : STATUS.FAIL,
    detail: scMet
      ? `Meets Activity 8.1 TSC (${scDetails.length} criteria)`
      : `Unmet: ${scUnmet.join('; ')}`,
    citation: 'EU 2021/2139 Annex I §8.1',
    weight: WEIGHT.CRITICAL,
  });

  // 2. DNSH to the 5 OTHER objectives. When SC = CCM, DNSH
  // applies to CCA, Water, Circular, Pollution, Biodiversity.
  const dnshMap = {
    cca: { key: 'climate', obj: EU_TAXONOMY_OBJECTIVES.cca, citation: 'EU 2020/852 Art 17 + Annex II' },
    water: { key: 'water', obj: EU_TAXONOMY_OBJECTIVES.water, citation: 'EU 2020/852 Art 17 + Annex III' },
    circular: { key: 'circular', obj: EU_TAXONOMY_OBJECTIVES.circular, citation: 'EU 2020/852 Art 17 + Annex IV' },
    pollution: { key: 'pollution', obj: EU_TAXONOMY_OBJECTIVES.pollution, citation: 'EU 2020/852 Art 17 + Annex V' },
    biodiversity: { key: 'biodiversity', obj: EU_TAXONOMY_OBJECTIVES.biodiversity, citation: 'EU 2020/852 Art 17 + Annex VI' },
    ccm: { key: 'mitigation', obj: EU_TAXONOMY_OBJECTIVES.ccm, citation: 'EU 2020/852 Art 17 + Annex I' },
  };
  // All objectives except the one being substantially contributed to.
  const dnshObjectives = Object.keys(dnshMap).filter(k => k !== objective);
  dnshObjectives.forEach(objKey => {
    const m = dnshMap[objKey];
    const node = tax?.dnsh?.[m.key];
    const met = !!node?.met;
    criteria.push({
      id: `dnsh_${objKey}`,
      title: `DNSH — ${m.obj}`,
      status: met ? STATUS.PASS : STATUS.FAIL,
      detail: node?.label || m.obj,
      citation: m.citation,
      weight: WEIGHT.CRITICAL,
    });
  });

  // 3. Minimum safeguards (Art 18) — both sub-items must be met.
  const ms = tax?.minimumSafeguards || {};
  const msItems = [ms.humanRights, ms.labour].filter(Boolean);
  const msMet = msItems.length > 0 && msItems.every(i => i.met);
  const msUnmet = msItems.filter(i => !i.met).map(i => i.label);
  criteria.push({
    id: 'minimum_safeguards',
    title: 'Minimum social safeguards',
    status: msMet ? STATUS.PASS : STATUS.FAIL,
    detail: msMet
      ? 'Human rights DD + supply chain labour policy confirmed'
      : `Unmet: ${msUnmet.join('; ') || 'Safeguards not confirmed'}`,
    citation: 'EU 2020/852 Art 18 — UNGPs / OECD MNEs / ILO',
    weight: WEIGHT.CRITICAL,
  });

  const verdict = rollupVerdict(criteria, { conditionalOnSupporting: false });
  return {
    label: 'eu_taxonomy_8_1',
    labelName: FINANCING_LABELS.eu_taxonomy_8_1,
    verdict,
    criteria,
    dnshApplicable: true,
    showsDnsh: true,
    dnshTreatment: 'passfail',
    substantialContributionObjective: objective,
    substantialContributionObjectiveName: objectiveName,
    summary: summarise('EU Taxonomy Activity 8.1', verdict, criteria),
  };
}

// ── SFDR Article 8 ──────────────────────────────────────────
// Product promotes environmental/social characteristics. DNSH
// applies per-sustainable-investment, not at product level — so
// we show DNSH as informational here rather than pass/fail.
function evaluateSfdrArticle8(assessment, intake) {
  const criteria = [];

  const disclosures = !!intake?.sustainability_disclosures_ready;
  criteria.push({
    id: 'es_characteristics',
    title: 'Environmental/social characteristics promoted',
    status: disclosures ? STATUS.PASS : STATUS.FAIL,
    detail: disclosures
      ? 'Sustainability disclosures ready — E/S characteristics documented'
      : 'Sustainability disclosures not ready',
    citation: 'SFDR 2019/2088 Art 8 + RTS 2022/1288',
    weight: WEIGHT.REQUIRED,
  });

  // PAI consideration — uses PAI 7/10/11 proxies from intake
  const paiMet = !!intake?.dnsh_protected_areas && !!intake?.dnsh_human_rights_dd;
  criteria.push({
    id: 'pai_consideration',
    title: 'Principal Adverse Impact (PAI) consideration',
    status: paiMet ? STATUS.PASS : STATUS.FAIL,
    detail: paiMet
      ? 'Biodiversity (PAI 7) + UNGC/OECD (PAI 10) policies confirmed'
      : 'PAI 7 (biodiversity) and/or PAI 10 (UNGC/OECD) evidence missing',
    citation: 'SFDR 2019/2088 Art 4 + RTS Annex I',
    weight: WEIGHT.REQUIRED,
  });

  const governance = !!intake?.dnsh_human_rights_dd && !!intake?.dnsh_supply_chain_labour;
  criteria.push({
    id: 'good_governance',
    title: 'Good governance practices',
    status: governance ? STATUS.PASS : STATUS.FAIL,
    detail: governance
      ? 'Human rights DD + supply chain labour policy confirmed'
      : 'Good governance evidence incomplete',
    citation: 'SFDR 2019/2088 Art 2(17)',
    weight: WEIGHT.REQUIRED,
  });

  const website = !!intake?.sustainability_disclosures_ready;
  criteria.push({
    id: 'website_disclosure',
    title: 'Website disclosure (pre-contractual + periodic)',
    status: website ? STATUS.PASS : STATUS.EVIDENCE_INCOMPLETE,
    detail: website
      ? 'Disclosure templates prepared'
      : 'Website disclosure evidence not provided',
    citation: 'SFDR 2019/2088 Art 10 + RTS 2022/1288',
    weight: WEIGHT.SUPPORTING,
  });

  const verdict = rollupVerdict(criteria);
  return {
    label: 'sfdr_article_8',
    labelName: FINANCING_LABELS.sfdr_article_8,
    verdict,
    criteria,
    dnshApplicable: false,
    showsDnsh: true,
    dnshTreatment: 'informational',
    dnshInfoNote: 'DNSH applies to the sustainable investments WITHIN this Article 8 product, not the product as a whole. Assess per-investment.',
    summary: summarise('SFDR Article 8', verdict, criteria),
  };
}

// ── SFDR Article 9 ──────────────────────────────────────────
// Product has sustainable investment as its objective. DNSH
// applies at the sustainable-investment level and is required.
function evaluateSfdrArticle9(assessment, intake) {
  const criteria = [];

  const siObj = !!intake?.net_zero_commitment_present && !!intake?.taxonomy_alignment_claimed;
  criteria.push({
    id: 'si_objective',
    title: 'Sustainable investment objective defined',
    status: siObj ? STATUS.PASS : STATUS.FAIL,
    detail: siObj
      ? 'Net-zero commitment + Taxonomy alignment claim in place'
      : 'Sustainable investment objective not fully established',
    citation: 'SFDR 2019/2088 Art 9(1)–(3) + RTS 2022/1288',
    weight: WEIGHT.REQUIRED,
  });

  // DNSH on sustainable investments — reuse engine output.
  const dnshScore = assessment?.dnsh?.score ?? 0;
  const dnshDetails = assessment?.dnsh?.details || [];
  const dnshCore = dnshDetails.filter(d => !['dnsh_human_rights_dd', 'dnsh_supply_chain_labour'].includes(d.key));
  const dnshMet = dnshCore.length > 0 && dnshCore.every(d => d.met);
  criteria.push({
    id: 'dnsh_sustainable_investments',
    title: 'DNSH on sustainable investments',
    status: dnshMet ? STATUS.PASS : STATUS.FAIL,
    detail: dnshMet
      ? `All DNSH core items confirmed (score ${dnshScore}/100)`
      : `DNSH gaps (score ${dnshScore}/100)`,
    citation: 'SFDR 2019/2088 Art 2(17) + RTS Art 16',
    weight: WEIGHT.REQUIRED,
  });

  const governance = !!intake?.dnsh_human_rights_dd && !!intake?.dnsh_supply_chain_labour;
  criteria.push({
    id: 'good_governance',
    title: 'Good governance practices',
    status: governance ? STATUS.PASS : STATUS.FAIL,
    detail: governance
      ? 'Human rights DD + supply chain labour policy confirmed'
      : 'Good governance evidence incomplete',
    citation: 'SFDR 2019/2088 Art 2(17)',
    weight: WEIGHT.REQUIRED,
  });

  const paiMet = !!intake?.dnsh_protected_areas && !!intake?.dnsh_climate_vulnerability;
  criteria.push({
    id: 'pai_consideration',
    title: 'Principal Adverse Impact (PAI) consideration',
    status: paiMet ? STATUS.PASS : STATUS.FAIL,
    detail: paiMet
      ? 'Biodiversity (PAI 7) + climate adaptation (PAI 14 proxy) confirmed'
      : 'PAI evidence incomplete',
    citation: 'SFDR 2019/2088 Art 7 + RTS Annex I',
    weight: WEIGHT.REQUIRED,
  });

  const benchmark = !!intake?.sustainability_disclosures_ready;
  criteria.push({
    id: 'reference_benchmark',
    title: 'Reference benchmark or explanation (if designated)',
    status: benchmark ? STATUS.PASS : STATUS.EVIDENCE_INCOMPLETE,
    detail: benchmark
      ? 'Disclosure ready — reference benchmark documented'
      : 'Benchmark documentation not provided',
    citation: 'SFDR 2019/2088 Art 9(1)(b)',
    weight: WEIGHT.SUPPORTING,
  });

  const website = !!intake?.sustainability_disclosures_ready;
  criteria.push({
    id: 'website_disclosure',
    title: 'Website disclosure (pre-contractual + periodic)',
    status: website ? STATUS.PASS : STATUS.EVIDENCE_INCOMPLETE,
    detail: website ? 'Disclosure templates prepared' : 'Website disclosure evidence not provided',
    citation: 'SFDR 2019/2088 Art 10 + RTS 2022/1288',
    weight: WEIGHT.SUPPORTING,
  });

  const verdict = rollupVerdict(criteria);
  return {
    label: 'sfdr_article_9',
    labelName: FINANCING_LABELS.sfdr_article_9,
    verdict,
    criteria,
    dnshApplicable: true,
    showsDnsh: true,
    dnshTreatment: 'passfail',
    summary: summarise('SFDR Article 9', verdict, criteria),
  };
}

// ── UK SDR — FCA PS23/16 labels ─────────────────────────────
// DNSH is NOT a UK SDR concept. All UK SDR labels hide the DNSH
// section on the Results page.

function ukSdrGeneralCriteria(intake) {
  const stewardship = !!intake?.sustainability_disclosures_ready;
  const escalation = !!intake?.carbon_reduction_strategy_present || !!intake?.sustainability_disclosures_ready;
  return [
    {
      id: 'stewardship_strategy',
      title: 'Investor stewardship strategy',
      status: stewardship ? STATUS.PASS : STATUS.FAIL,
      detail: stewardship
        ? 'Sustainability disclosures ready — stewardship approach documented'
        : 'Stewardship strategy evidence incomplete',
      citation: 'FCA PS23/16 ESG 5.3.1R — general criteria',
      weight: WEIGHT.REQUIRED,
    },
    {
      id: 'escalation_plan',
      title: 'Escalation plan',
      status: escalation ? STATUS.PASS : STATUS.FAIL,
      detail: escalation
        ? 'Carbon reduction strategy or disclosures provide escalation basis'
        : 'Escalation plan not documented',
      citation: 'FCA PS23/16 ESG 5.3.1R — general criteria',
      weight: WEIGHT.REQUIRED,
    },
  ];
}

// UK SDR Sustainability Focus — ≥70% of assets meet a robust
// standard of sustainability (PS23/16 ESG 5.3.2R).
function evaluateUkSdrFocus(assessment, intake) {
  const criteria = [];

  const objectiveMet = !!intake?.net_zero_commitment_present || !!intake?.carbon_reduction_strategy_present;
  criteria.push({
    id: 'sustainability_objective',
    title: 'Sustainability objective defined (environmental and/or social)',
    status: objectiveMet ? STATUS.PASS : STATUS.FAIL,
    detail: objectiveMet
      ? 'Net-zero or carbon reduction objective in place'
      : 'No environmental/social objective established',
    citation: 'FCA PS23/16 ESG 5.3.2R(1)',
    weight: WEIGHT.REQUIRED,
  });

  const pctRaw = intake?.sdr_focus_alignment_pct;
  const pct = pctRaw === '' || pctRaw === null || pctRaw === undefined ? null : parseFloat(pctRaw);
  let pctStatus, pctDetail;
  if (pct === null || !isFinite(pct)) {
    pctStatus = STATUS.EVIDENCE_INCOMPLETE;
    pctDetail = 'Sustainable-asset alignment % not provided';
  } else if (pct >= 70) {
    pctStatus = STATUS.PASS;
    pctDetail = `${pct}% of assets meet the sustainability standard (≥70% threshold)`;
  } else {
    pctStatus = STATUS.FAIL;
    pctDetail = `${pct}% of assets meet the sustainability standard (<70% threshold)`;
  }
  criteria.push({
    id: 'min_sustainable_assets',
    title: '≥70% of assets meet a robust, evidence-based, absolute standard',
    status: pctStatus,
    detail: pctDetail,
    citation: 'FCA PS23/16 ESG 5.3.2R(2)',
    weight: WEIGHT.CRITICAL,
  });

  const nonConflict = !!intake?.sustainability_disclosures_ready;
  criteria.push({
    id: 'non_conflicting_remainder',
    title: 'Non-conflicting remaining assets',
    status: nonConflict ? STATUS.PASS : STATUS.FAIL,
    detail: nonConflict
      ? 'Disclosures confirm remaining assets do not conflict with the objective'
      : 'Non-conflict evidence for remaining assets not provided',
    citation: 'FCA PS23/16 ESG 5.3.2R(3)',
    weight: WEIGHT.REQUIRED,
  });

  const independent = !!intake?.third_party_certification_target && intake.third_party_certification_target !== 'none' && intake.third_party_certification_target !== '';
  criteria.push({
    id: 'independent_assessment',
    title: 'Independent assessment of the sustainability standard',
    status: independent ? STATUS.PASS : STATUS.FAIL,
    detail: independent
      ? `${intake.third_party_certification_target.toUpperCase()} certification targeted`
      : 'No third-party certification target — independent assessment not evidenced',
    citation: 'FCA PS23/16 ESG 5.3.2R(4)',
    weight: WEIGHT.REQUIRED,
  });

  const kpis = !!intake?.sustainability_disclosures_ready;
  criteria.push({
    id: 'kpis_defined',
    title: 'KPIs defined to track performance towards objective',
    status: kpis ? STATUS.PASS : STATUS.FAIL,
    detail: kpis ? 'KPIs documented in disclosure pack' : 'KPI documentation incomplete',
    citation: 'FCA PS23/16 ESG 5.3.2R(5)',
    weight: WEIGHT.REQUIRED,
  });

  criteria.push(...ukSdrGeneralCriteria(intake));

  const verdict = rollupVerdict(criteria, { conditionalOnSupporting: false });
  return {
    label: 'uk_sdr_focus',
    labelName: FINANCING_LABELS.uk_sdr_focus,
    verdict,
    criteria,
    dnshApplicable: false,
    showsDnsh: false,
    summary: summarise('UK SDR Sustainability Focus', verdict, criteria),
  };
}

// UK SDR Sustainability Improvers — assets have potential to
// improve sustainability profile over time (PS23/16 ESG 5.3.3R).
function evaluateUkSdrImprovers(assessment, intake) {
  const criteria = [];

  const objectiveMet = !!intake?.carbon_reduction_strategy_present;
  criteria.push({
    id: 'sustainability_objective',
    title: 'Sustainability objective defined',
    status: objectiveMet ? STATUS.PASS : STATUS.FAIL,
    detail: objectiveMet
      ? 'Carbon reduction strategy documents the objective'
      : 'Objective not defined',
    citation: 'FCA PS23/16 ESG 5.3.3R(1)',
    weight: WEIGHT.REQUIRED,
  });

  const improvementPotential = !!intake?.sdr_improvers_evidence_provided;
  criteria.push({
    id: 'improvement_potential',
    title: 'Potential to meet an absolute standard over time',
    status: improvementPotential ? STATUS.PASS : STATUS.EVIDENCE_INCOMPLETE,
    detail: improvementPotential
      ? 'Evidence of improvement pathway provided'
      : 'Improvement-potential evidence not provided',
    citation: 'FCA PS23/16 ESG 5.3.3R(2)',
    weight: WEIGHT.CRITICAL,
  });

  const targets = !!intake?.carbon_reduction_strategy_present && !!intake?.net_zero_commitment_present;
  criteria.push({
    id: 'improvement_targets',
    title: 'Short- and medium-term improvement targets',
    status: targets ? STATUS.PASS : STATUS.FAIL,
    detail: targets
      ? 'Net-zero commitment + carbon reduction strategy define targets'
      : 'Improvement targets not fully defined',
    citation: 'FCA PS23/16 ESG 5.3.3R(3)',
    weight: WEIGHT.CRITICAL,
  });

  const kpis = !!intake?.sustainability_disclosures_ready;
  criteria.push({
    id: 'kpis_defined',
    title: 'KPIs relevant to objective defined',
    status: kpis ? STATUS.PASS : STATUS.FAIL,
    detail: kpis ? 'KPIs documented in disclosure pack' : 'KPI documentation incomplete',
    citation: 'FCA PS23/16 ESG 5.3.3R(4)',
    weight: WEIGHT.REQUIRED,
  });

  criteria.push(...ukSdrGeneralCriteria(intake));

  const verdict = rollupVerdict(criteria, { conditionalOnSupporting: false });
  return {
    label: 'uk_sdr_improvers',
    labelName: FINANCING_LABELS.uk_sdr_improvers,
    verdict,
    criteria,
    dnshApplicable: false,
    showsDnsh: false,
    summary: summarise('UK SDR Sustainability Improvers', verdict, criteria),
  };
}

// UK SDR Sustainability Impact — positive, measurable impact
// (PS23/16 ESG 5.3.4R).
function evaluateUkSdrImpact(assessment, intake) {
  const criteria = [];

  const objectiveMet = !!intake?.net_zero_commitment_present && !!intake?.taxonomy_alignment_claimed;
  criteria.push({
    id: 'impact_objective',
    title: 'Sustainability objective with measurable positive contribution',
    status: objectiveMet ? STATUS.PASS : STATUS.FAIL,
    detail: objectiveMet
      ? 'Net-zero + Taxonomy alignment claim establish positive objective'
      : 'Measurable positive objective not fully established',
    citation: 'FCA PS23/16 ESG 5.3.4R(1)',
    weight: WEIGHT.REQUIRED,
  });

  const theoryOfChange = !!intake?.sdr_impact_theory_of_change;
  criteria.push({
    id: 'theory_of_change',
    title: 'Theory of change documented',
    status: theoryOfChange ? STATUS.PASS : STATUS.EVIDENCE_INCOMPLETE,
    detail: theoryOfChange
      ? 'Theory of change documented'
      : 'Theory of change not documented',
    citation: 'FCA PS23/16 ESG 5.3.4R(2)',
    weight: WEIGHT.CRITICAL,
  });

  const measurementMethod = !!intake?.sdr_impact_measurement_method;
  criteria.push({
    id: 'measurement_method',
    title: 'Method to measure and demonstrate impact',
    status: measurementMethod ? STATUS.PASS : STATUS.EVIDENCE_INCOMPLETE,
    detail: measurementMethod
      ? 'Impact measurement methodology defined'
      : 'Impact measurement method not defined',
    citation: 'FCA PS23/16 ESG 5.3.4R(3)',
    weight: WEIGHT.CRITICAL,
  });

  const additionality = !!intake?.sdr_impact_investor_additionality;
  criteria.push({
    id: 'investor_additionality',
    title: 'Investor contribution / additionality identified',
    status: additionality ? STATUS.PASS : STATUS.EVIDENCE_INCOMPLETE,
    detail: additionality
      ? 'Investor additionality documented'
      : 'Investor additionality not documented',
    citation: 'FCA PS23/16 ESG 5.3.4R(4)',
    weight: WEIGHT.CRITICAL,
  });

  const kpis = !!intake?.sustainability_disclosures_ready;
  criteria.push({
    id: 'kpis_defined',
    title: 'KPIs relevant to impact objective',
    status: kpis ? STATUS.PASS : STATUS.FAIL,
    detail: kpis ? 'KPIs documented in disclosure pack' : 'KPI documentation incomplete',
    citation: 'FCA PS23/16 ESG 5.3.4R(5)',
    weight: WEIGHT.REQUIRED,
  });

  criteria.push(...ukSdrGeneralCriteria(intake));

  const verdict = rollupVerdict(criteria, { conditionalOnSupporting: false });
  return {
    label: 'uk_sdr_impact',
    labelName: FINANCING_LABELS.uk_sdr_impact,
    verdict,
    criteria,
    dnshApplicable: false,
    showsDnsh: false,
    summary: summarise('UK SDR Sustainability Impact', verdict, criteria),
  };
}

// UK SDR Sustainability Mixed Goals — qualifies for ≥2 of the
// other 3 labels for different parts of the portfolio
// (PS23/16 ESG 5.3.5R).
function evaluateUkSdrMixed(assessment, intake) {
  const criteria = [];

  // Delegate to the other three evaluators.
  const focusResult = evaluateUkSdrFocus(assessment, intake);
  const improversResult = evaluateUkSdrImprovers(assessment, intake);
  const impactResult = evaluateUkSdrImpact(assessment, intake);
  const passingLabels = [focusResult, improversResult, impactResult].filter(r => r.verdict === 'PASS');
  const qualifyingCount = passingLabels.length;

  const qualifies = qualifyingCount >= 2;
  criteria.push({
    id: 'qualifies_multiple_labels',
    title: 'Qualifies for ≥2 of Focus / Improvers / Impact',
    status: qualifies ? STATUS.PASS : STATUS.FAIL,
    detail: `Qualifies for ${qualifyingCount} of 3 constituent labels (${passingLabels.map(r => r.labelName.replace('UK SDR — ', '')).join(', ') || 'none'})`,
    citation: 'FCA PS23/16 ESG 5.3.5R(1)',
    weight: WEIGHT.CRITICAL,
  });

  const proportionDisclosed = !!intake?.sustainability_disclosures_ready;
  criteria.push({
    id: 'proportion_disclosed',
    title: 'Proportion of assets per constituent label disclosed',
    status: proportionDisclosed ? STATUS.PASS : STATUS.FAIL,
    detail: proportionDisclosed
      ? 'Disclosure pack documents per-label proportions'
      : 'Per-label proportion disclosure incomplete',
    citation: 'FCA PS23/16 ESG 5.3.5R(2)',
    weight: WEIGHT.REQUIRED,
  });

  criteria.push({
    id: 'constituent_criteria_met',
    title: "Each constituent label's criteria met for its allocated proportion",
    status: qualifies ? STATUS.PASS : STATUS.FAIL,
    detail: qualifies
      ? `Constituent labels passing: ${passingLabels.map(r => r.labelName.replace('UK SDR — ', '')).join(', ')}`
      : 'Fewer than 2 constituent labels meet their full criteria',
    citation: 'FCA PS23/16 ESG 5.3.5R(3)',
    weight: WEIGHT.CRITICAL,
  });

  criteria.push(...ukSdrGeneralCriteria(intake));

  const verdict = rollupVerdict(criteria, { conditionalOnSupporting: false });
  return {
    label: 'uk_sdr_mixed',
    labelName: FINANCING_LABELS.uk_sdr_mixed,
    verdict,
    criteria,
    dnshApplicable: false,
    showsDnsh: false,
    constituents: {
      focus: focusResult.verdict,
      improvers: improversResult.verdict,
      impact: impactResult.verdict,
    },
    summary: summarise('UK SDR Sustainability Mixed Goals', verdict, criteria),
  };
}

export { STATUS as LABEL_CRITERION_STATUS, WEIGHT as LABEL_CRITERION_WEIGHT };
