// ============================================================
// SCORING ENGINE — reads thresholds from regulation JSON
// Update src/regulations/frameworks/region-thresholds.json
// to change thresholds without touching this file.
// ============================================================

import regionThresholds from '../regulations/frameworks/region-thresholds.json';
import sfdrFramework from '../regulations/frameworks/sfdr.json';
import ukSdrFramework from '../regulations/frameworks/uk-sdr.json';
import euTaxonomy from '../regulations/frameworks/eu-taxonomy.json';

const RT = regionThresholds.regions;

export const REGION_WEIGHTS = Object.fromEntries(
  Object.entries(RT).map(([r, v]) => [r, v.weights])
);

export const REGION_THRESHOLDS = Object.fromEntries(
  Object.entries(RT).map(([r, v]) => [r, { pue: v.pue.target, renewableMin: v.renewableMin, wue: v.wue.target }])
);

export const READINESS_BANDS = [
  { min: 80, label: "Green Ready", color: "#1B6B4A" },
  { min: 60, label: "Needs Optimisation", color: "#B8860B" },
  { min: 0,  label: "High Risk", color: "#A63D2F" },
];

// ── SFDR classification ──────────────────────────────────────
export function determineSfdrClassification(project, region) {
  const renewPct = parseFloat(project.renewable_energy_share_pct) || 0;
  const pue = parseFloat(project.pue) || 999;
  const a9 = sfdrFramework.classifications.article9.requirements;
  const a8 = sfdrFramework.classifications.article8.requirements;

  if (
    renewPct >= a9.minRenewable &&
    pue <= a9.maxPue &&
    project.taxonomy_alignment_claimed &&
    project.sustainability_disclosures_ready &&
    project.net_zero_commitment_present
  ) {
    return { classification: 'Article 9', label: sfdrFramework.classifications.article9.label, description: sfdrFramework.classifications.article9.greenFinanceImpact };
  }

  if (
    renewPct >= a8.minRenewable &&
    pue <= a8.maxPue &&
    project.sustainability_disclosures_ready
  ) {
    return { classification: 'Article 8', label: sfdrFramework.classifications.article8.label, description: sfdrFramework.classifications.article8.greenFinanceImpact };
  }

  return { classification: 'Article 6', label: sfdrFramework.classifications.article6.label, description: sfdrFramework.classifications.article6.greenFinanceImpact };
}

// ── UK SDR eligibility ───────────────────────────────────────
export function determineUkSdrEligibility(project, score) {
  const renewPct = parseFloat(project.renewable_energy_share_pct) || 0;
  const pue = parseFloat(project.pue) || 999;
  const labels = ukSdrFramework.labels;
  const results = [];

  results.push({
    label: labels.sustainabilityImpact.label,
    eligible: score >= labels.sustainabilityImpact.scoringThreshold &&
      renewPct >= labels.sustainabilityImpact.requirements.minRenewable &&
      pue <= labels.sustainabilityImpact.requirements.maxPue &&
      project.net_zero_commitment_present &&
      project.taxonomy_alignment_claimed,
    description: labels.sustainabilityImpact.description,
    gap: `Score ${score} < ${labels.sustainabilityImpact.scoringThreshold} or renewable ${renewPct}% < ${labels.sustainabilityImpact.requirements.minRenewable}% or PUE ${pue} > ${labels.sustainabilityImpact.requirements.maxPue}`,
  });

  results.push({
    label: labels.sustainabilityFocus.label,
    eligible: score >= labels.sustainabilityFocus.scoringThreshold &&
      renewPct >= labels.sustainabilityFocus.requirements.minRenewable &&
      pue <= labels.sustainabilityFocus.requirements.maxPue &&
      project.sustainability_disclosures_ready,
    description: labels.sustainabilityFocus.description,
    gap: `Score ${score} < ${labels.sustainabilityFocus.scoringThreshold} or renewable ${renewPct}% < ${labels.sustainabilityFocus.requirements.minRenewable}%`,
  });

  results.push({
    label: labels.sustainabilityImprovers.label,
    eligible: score >= labels.sustainabilityImprovers.scoringThreshold &&
      renewPct >= labels.sustainabilityImprovers.requirements.minRenewable &&
      project.carbon_reduction_strategy_present,
    description: labels.sustainabilityImprovers.description,
    gap: `Score ${score} < ${labels.sustainabilityImprovers.scoringThreshold} or no carbon reduction strategy`,
  });

  return results;
}

// ── EU Taxonomy alignment ─────────────────────────────────────
export function determineEuTaxonomyAlignment(project) {
  const pue = parseFloat(project.pue) || 999;
  const renewPct = parseFloat(project.renewable_energy_share_pct) || 0;
  const sc = euTaxonomy.substantialContribution;

  const pueThreshold = project.is_new_build
    ? sc.criteria.find(c => c.id === 'pue_new').threshold
    : sc.criteria.find(c => c.id === 'pue_existing').threshold;

  const criteria = [
    { name: `PUE ≤ ${pueThreshold}`, met: pue <= pueThreshold },
    { name: 'Renewable electricity ≥ 50%', met: renewPct >= 50 },
    { name: 'Waste heat reuse assessed', met: !!project.waste_heat_recovery },
    { name: 'Climate risk assessment conducted', met: !!project.adaptation_measures_present || !!project.business_continuity_plan_ready },
  ];

  const dnsh = {
    water: { label: euTaxonomy.dnsh.water.label, met: !project.wue || parseFloat(project.wue) <= euTaxonomy.dnsh.water.wueThreshold || !!project.water_recycling_included },
    pollution: { label: euTaxonomy.dnsh.pollution.label, met: project.backup_power_type !== 'diesel' || project.onsite_generation_type !== 'gas' },
    biodiversity: { label: euTaxonomy.dnsh.biodiversity.label, met: !!project.adaptation_measures_present },
    circular: { label: euTaxonomy.dnsh.circularEconomy.label, met: true },
    climate: { label: euTaxonomy.dnsh.climateAdaptation.label, met: !!project.adaptation_measures_present },
  };

  const substantialMet = criteria.every(c => c.met);
  const dnshMet = Object.values(dnsh).every(d => d.met);
  const aligned = substantialMet && dnshMet;

  return { aligned, criteria, dnsh };
}

// ── Pillar scoring functions ──────────────────────────────────
export function calculateSustainabilityAlignment(project, region) {
  let score = 100;
  const thresholds = REGION_THRESHOLDS[region] || REGION_THRESHOLDS.UK;
  const explanations = { positive: [], negative: [] };

  const pue = parseFloat(project.pue);
  if (pue && pue > thresholds.pue) {
    const penalty = Math.min(20, Math.round((pue - thresholds.pue) * 40));
    score -= penalty;
    explanations.negative.push(`PUE ${pue} above ${region} threshold ${thresholds.pue} (−${penalty})`);
  } else if (pue) {
    explanations.positive.push(`PUE ${pue} meets ${region} benchmark`);
  }

  const renewPct = parseFloat(project.renewable_energy_share_pct) || 0;
  if (renewPct < thresholds.renewableMin) {
    const penalty = Math.min(25, Math.round((thresholds.renewableMin - renewPct) * 0.5));
    score -= penalty;
    explanations.negative.push(`Renewable share ${renewPct}% below ${thresholds.renewableMin}% target (−${penalty})`);
  } else {
    explanations.positive.push(`Renewable energy share ${renewPct}% exceeds regional target`);
  }

  if (project.backup_power_type === 'diesel') {
    score -= 12;
    explanations.negative.push('Diesel-only backup power strategy (−12)');
  } else if (project.backup_power_type === 'battery' || project.backup_power_type === 'hydrogen') {
    explanations.positive.push('Clean backup power strategy');
  }

  if (!project.sustainability_disclosures_ready) {
    score -= 10;
    explanations.negative.push('Sustainability disclosures not ready (−10)');
  }

  if (project.net_zero_commitment_present) {
    score += 5;
    explanations.positive.push('Net-zero commitment in place (+5)');
  }

  if (project.carbon_reduction_strategy_present) {
    score += 3;
    explanations.positive.push('Carbon reduction strategy defined (+3)');
  }

  if (project.third_party_certification_target && project.third_party_certification_target !== 'none') {
    score += 5;
    explanations.positive.push(`Targeting ${project.third_party_certification_target} certification (+5)`);
  }

  // EU Taxonomy bonus
  if (project.taxonomy_alignment_claimed) {
    score += euTaxonomy.scoringImpact.taxonomyClaimedBonus;
    explanations.positive.push(`EU Taxonomy alignment claimed (+${euTaxonomy.scoringImpact.taxonomyClaimedBonus})`);
  }

  return { score: Math.max(0, Math.min(100, score)), explanations };
}

export function calculateEnergyPowerViability(project, region) {
  const explanations = { positive: [], negative: [] };

  let gridScore = 50;
  if (project.grid_connection_status === 'secured') { gridScore = 95; explanations.positive.push('Grid capacity fully secured'); }
  else if (project.grid_connection_status === 'partially_secured') { gridScore = 75; }
  else if (project.grid_connection_status === 'application_submitted') { gridScore = 60; }
  else if (project.grid_connection_status === 'in_discussion') { gridScore = 45; explanations.negative.push('Grid connection only in discussion phase'); }
  else { gridScore = 20; explanations.negative.push('Grid connection process not started'); }

  let interScore = 50;
  const months = parseFloat(project.interconnection_timeline_months);
  if (months && months <= 12) { interScore = 92; explanations.positive.push('Fast interconnection timeline (<12 months)'); }
  else if (months && months <= 24) { interScore = 72; }
  else if (months && months <= 36) { interScore = 48; explanations.negative.push('Interconnection timeline 24–36 months'); }
  else if (months && months > 36) { interScore = 28; explanations.negative.push('Interconnection timeline exceeds 36 months'); }

  let renewScore = 40;
  const renewPct = parseFloat(project.renewable_energy_share_pct) || 0;
  if (project.ppa_secured && renewPct >= 50) { renewScore = 92; explanations.positive.push('PPA secured with strong renewable share'); }
  else if (project.ppa_secured) { renewScore = 78; }
  else if (renewPct >= 50) { renewScore = 65; }
  else if (renewPct >= 25) { renewScore = 45; }
  else { renewScore = 25; explanations.negative.push('Weak renewable power access'); }

  let backupScore = 50;
  if (project.backup_power_type === 'hybrid') { backupScore = 85; }
  else if (project.backup_power_type === 'battery') { backupScore = 80; }
  else if (project.backup_power_type === 'hydrogen') { backupScore = 82; explanations.positive.push('Hydrogen backup — best-in-class for clean resilience'); }
  else if (project.backup_power_type === 'gas') { backupScore = 60; }
  else if (project.backup_power_type === 'diesel') { backupScore = 35; }
  const batteryMwh = parseFloat(project.battery_storage_mwh);
  if (batteryMwh && batteryMwh > 0) { backupScore = Math.min(100, backupScore + 10); }

  const score = gridScore * 0.35 + interScore * 0.25 + renewScore * 0.25 + backupScore * 0.15;
  return { score: Math.max(0, Math.min(100, Math.round(score))), explanations };
}

export function calculateWaterResourceEfficiency(project, region) {
  const explanations = { positive: [], negative: [] };
  const thresholds = REGION_THRESHOLDS[region] || REGION_THRESHOLDS.UK;

  let wueScore = 50;
  const wue = parseFloat(project.wue);
  if (wue) {
    if (wue <= 0.3) { wueScore = 95; explanations.positive.push('Best-in-class WUE'); }
    else if (wue <= thresholds.wue) { wueScore = 80; explanations.positive.push(`WUE ${wue} meets ${region} target`); }
    else if (wue <= 1.0) { wueScore = 60; }
    else if (wue <= 1.5) { wueScore = 40; explanations.negative.push('WUE above acceptable range'); }
    else { wueScore = 20; explanations.negative.push('Poor WUE performance'); }
  }

  let coolingScore = 50;
  if (project.cooling_type === 'liquid') { coolingScore = 90; explanations.positive.push('Liquid cooling — highly efficient'); }
  else if (project.cooling_type === 'hybrid') { coolingScore = 75; }
  else if (project.cooling_type === 'evaporative') { coolingScore = 55; }
  else if (project.cooling_type === 'air') { coolingScore = 45; }

  let contextScore = 60;
  const waterStress = parseFloat(project.water_stress_index) || 0.5;
  if (waterStress > 0.7 && project.cooling_type === 'evaporative' && !project.water_recycling_included) {
    contextScore = 15;
    explanations.negative.push('High water use in water-stressed region without recycling');
  } else if (project.water_recycling_included) {
    contextScore = 85;
    explanations.positive.push('Water recycling systems planned');
  }

  if (project.waste_heat_recovery) {
    contextScore = Math.min(100, contextScore + 10);
    explanations.positive.push('Waste heat recovery planned');
  }

  const score = wueScore * 0.50 + coolingScore * 0.25 + contextScore * 0.25;
  return { score: Math.max(0, Math.min(100, Math.round(score))), explanations };
}

export function calculateClimateSiteResilience(project) {
  const explanations = { positive: [], negative: [] };

  const flood = parseFloat(project.flood_risk_score) ?? 50;
  const heat = parseFloat(project.extreme_heat_risk_score) ?? 50;
  const storm = parseFloat(project.storm_risk_score) ?? 30;
  const wildfire = parseFloat(project.wildfire_risk_score) ?? 20;

  let floodScore = Math.max(0, 100 - flood);
  let heatScore = Math.max(0, 100 - heat);
  let stormScore = Math.max(0, 100 - storm * 0.8);
  let weatherScore = Math.max(0, 100 - (storm + wildfire) / 2);

  if (flood > 60 && !project.adaptation_measures_present) {
    explanations.negative.push('High flood risk with no adaptation measures');
  } else if (flood > 60 && project.adaptation_measures_present) {
    floodScore = Math.min(100, floodScore + 25);
    explanations.positive.push('Flood risk mitigated by adaptation measures');
  }

  if (heat > 60) { explanations.negative.push('Significant extreme heat exposure'); }

  let adaptScore = 40;
  if (project.adaptation_measures_present) {
    adaptScore = 80;
    explanations.positive.push('Climate adaptation measures in design');
  }
  if (project.business_continuity_plan_ready) {
    adaptScore = Math.min(100, adaptScore + 15);
    explanations.positive.push('Business continuity plan ready');
  }

  // TCFD bonus
  const tcfdPillars = [
    project.adaptation_measures_present,
    project.business_continuity_plan_ready,
    project.net_zero_commitment_present,
    project.sustainability_disclosures_ready,
  ].filter(Boolean).length;
  if (tcfdPillars >= 3) {
    adaptScore = Math.min(100, adaptScore + 5);
    explanations.positive.push('Strong TCFD alignment (+5)');
  }

  const score = floodScore * 0.25 + heatScore * 0.20 + stormScore * 0.20 + weatherScore * 0.20 + adaptScore * 0.15;
  return { score: Math.max(0, Math.min(100, Math.round(score))), explanations };
}

export function calculateDeliveryFundingReadiness(project) {
  const explanations = { positive: [], negative: [] };

  let maturityScore = 40;
  const stage = project.development_stage;
  if (stage === 'shovel_ready') { maturityScore = 95; explanations.positive.push('Shovel-ready project'); }
  else if (stage === 'permitted') { maturityScore = 85; }
  else if (stage === 'pre_permitting') { maturityScore = 68; }
  else if (stage === 'site_selected') { maturityScore = 55; }
  else if (stage === 'site_shortlisted') { maturityScore = 40; }
  else if (stage === 'concept') { maturityScore = 30; explanations.negative.push('Concept stage — low maturity for investors'); }

  const criticalFields = ['pue', 'planned_capacity_mw', 'cooling_type', 'backup_power_type', 'grid_connection_status', 'renewable_energy_share_pct', 'development_stage', 'financing_strategy_defined'];
  const filled = criticalFields.filter(f => project[f] !== undefined && project[f] !== null && project[f] !== '').length;
  const completeness = Math.round((filled / criticalFields.length) * 100);
  if (completeness < 50) explanations.negative.push('Critical data fields missing — reduces confidence');

  let financeScore = 30;
  if (project.financing_strategy_defined) financeScore += 25;
  if (project.investment_memo_ready) { financeScore += 20; explanations.positive.push('Investment memo ready'); }
  if (project.site_control_secured) { financeScore += 15; explanations.positive.push('Site control secured'); }
  if (!project.financing_strategy_defined) explanations.negative.push('No financing strategy defined');

  let execScore = 40;
  if (project.permitting_status === 'approved') { execScore = 90; }
  else if (project.permitting_status === 'partially_approved') { execScore = 70; }
  else if (project.permitting_status === 'underway') { execScore = 55; }
  if (project.contractor_or_epc_identified) { execScore = Math.min(100, execScore + 15); }
  if (project.schedule_confidence_level === 'high') execScore = Math.min(100, execScore + 10);

  const score = maturityScore * 0.30 + completeness * 0.25 + financeScore * 0.25 + execScore * 0.20;
  return { score: Math.max(0, Math.min(100, Math.round(score))), explanations, dataCompleteness: completeness };
}

export function evaluateHardStops(project, region) {
  const stops = [];
  const regionData = RT[region] || RT.UK;

  if (project.grid_connection_status === 'not_started' && regionData.hardStops?.noGridUS_EU) {
    stops.push(regionData.hardStops.noGridUS_EU);
  }

  if ((parseFloat(project.flood_risk_score) || 0) > 80 && !project.adaptation_measures_present) {
    stops.push({ reason: 'Extreme unmitigated flood risk', cap: 50 });
  }

  if ((parseFloat(project.water_stress_index) || 0) > 0.85 && project.cooling_type === 'evaporative' && !project.water_recycling_included) {
    stops.push({ reason: 'Very high water stress with water-intensive cooling and no recycling', cap: 50 });
  }

  const criticalFields = ['pue', 'planned_capacity_mw', 'cooling_type', 'grid_connection_status'];
  const missing = criticalFields.filter(f => !project[f]);
  if (missing.length >= 3) {
    stops.push({ reason: 'Missing critical technical data', cap: 55 });
  }

  if (regionData.hardStops?.greenRaiseWithoutTaxonomy) {
    const hs = regionData.hardStops.greenRaiseWithoutTaxonomy;
    if (project.target_financing_label && ['green', 'article_8_9', 'sustainable'].includes(project.target_financing_label) &&
        !project.taxonomy_alignment_claimed &&
        (parseFloat(project.renewable_energy_share_pct) || 0) < hs.minRenewable) {
      stops.push({ reason: hs.reason, cap: hs.cap });
    }
  }

  return stops;
}

export function calculateConfidence(project) {
  const weightedFields = {
    pue: 3, planned_capacity_mw: 3, cooling_type: 2, backup_power_type: 2,
    grid_connection_status: 3, renewable_energy_share_pct: 3, ppa_secured: 2,
    wue: 2, development_stage: 2, financing_strategy_defined: 2,
    interconnection_timeline_months: 2, flood_risk_score: 1, extreme_heat_risk_score: 1,
    water_recycling_included: 1, site_control_secured: 1, permitting_status: 1,
    adaptation_measures_present: 1, sustainability_disclosures_ready: 1,
  };
  let totalWeight = 0, completedWeight = 0;
  for (const [field, weight] of Object.entries(weightedFields)) {
    totalWeight += weight;
    if (project[field] !== undefined && project[field] !== null && project[field] !== '') completedWeight += weight;
  }
  return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
}

export function generateRecommendations(project, subscores, region) {
  const thresholds = REGION_THRESHOLDS[region] || REGION_THRESHOLDS.UK;
  const recs = [];

  if (!project.ppa_secured && subscores.epv < 80) {
    recs.push({ action: 'Secure renewable PPA', uplift: 8, impact: 'High', difficulty: 'Medium', reason: 'Improves sustainability alignment and funding attractiveness', pillar: 'Energy & Power Viability' });
  }

  const pue = parseFloat(project.pue);
  if (pue && pue > thresholds.pue) {
    recs.push({ action: 'Reduce projected PUE', uplift: 6, impact: 'High', difficulty: 'Medium', reason: `Current PUE ${pue} exceeds ${region} benchmark of ${thresholds.pue}`, pillar: 'Sustainability Alignment' });
  }

  if (project.cooling_type !== 'liquid' && project.cooling_type !== 'hybrid') {
    recs.push({ action: 'Adopt liquid or hybrid cooling', uplift: 5, impact: 'Medium', difficulty: 'High', reason: 'Improves WUE and energy efficiency', pillar: 'Water & Resource Efficiency' });
  }

  if (!project.water_recycling_included) {
    recs.push({ action: 'Add water recycling measures', uplift: 4, impact: 'Medium', difficulty: 'Low', reason: 'Reduces water dependency and improves resource score', pillar: 'Water & Resource Efficiency' });
  }

  if ((parseFloat(project.flood_risk_score) || 0) > 40 && !project.adaptation_measures_present) {
    recs.push({ action: 'Validate flood mitigation measures', uplift: 5, impact: 'High', difficulty: 'Medium', reason: 'Unmitigated flood risk significantly reduces climate resilience score', pillar: 'Climate & Site Resilience' });
  }

  if (!project.financing_strategy_defined) {
    recs.push({ action: 'Define financing strategy', uplift: 6, impact: 'High', difficulty: 'Low', reason: 'A clear strategy signals maturity to investors', pillar: 'Delivery & Funding Readiness' });
  }

  if (!project.investment_memo_ready) {
    recs.push({ action: 'Prepare investment memo', uplift: 4, impact: 'Medium', difficulty: 'Medium', reason: 'Required by most institutional investors', pillar: 'Delivery & Funding Readiness' });
  }

  if (project.backup_power_type === 'diesel') {
    recs.push({ action: 'Transition backup power from diesel', uplift: 5, impact: 'Medium', difficulty: 'High', reason: 'Diesel-heavy strategy weakens sustainability alignment and EU Taxonomy DNSH', pillar: 'Sustainability Alignment' });
  }

  if (!project.taxonomy_alignment_claimed && (region === 'EU' || region === 'UK')) {
    recs.push({ action: 'Target EU Taxonomy alignment', uplift: 7, impact: 'High', difficulty: 'Medium', reason: 'Unlocks Article 8/9 SFDR eligibility and green bond market access', pillar: 'Sustainability Alignment' });
  }

  if (!project.net_zero_commitment_present) {
    recs.push({ action: 'Establish net-zero commitment', uplift: 4, impact: 'Medium', difficulty: 'Low', reason: 'Required for SFDR Article 9 and increasingly expected by DFIs', pillar: 'Sustainability Alignment' });
  }

  return recs.sort((a, b) => b.uplift - a.uplift).slice(0, 5);
}

export function runAssessment(project, region) {
  const sa = calculateSustainabilityAlignment(project, region);
  const epv = calculateEnergyPowerViability(project, region);
  const wre = calculateWaterResourceEfficiency(project, region);
  const csr = calculateClimateSiteResilience(project);
  const dfr = calculateDeliveryFundingReadiness(project);

  const weights = REGION_WEIGHTS[region] || REGION_WEIGHTS.UK;
  const rawScore = sa.score * weights.sa + epv.score * weights.epv + wre.score * weights.wre + csr.score * weights.csr + dfr.score * weights.dfr;

  const hardStops = evaluateHardStops(project, region);
  let finalScore = Math.round(rawScore);
  let hardStopTriggered = false;
  let hardStopReason = null;

  if (hardStops.length > 0) {
    const lowestCap = Math.min(...hardStops.map(s => s.cap));
    if (finalScore > lowestCap) {
      finalScore = lowestCap;
      hardStopTriggered = true;
      hardStopReason = hardStops[0].reason;
    }
  }

  const subscores = { sa: sa.score, epv: epv.score, wre: wre.score, csr: csr.score, dfr: dfr.score };
  const confidence = calculateConfidence(project);
  const recommendations = generateRecommendations(project, subscores, region);
  const band = READINESS_BANDS.find(b => finalScore >= b.min);

  const sfdr = determineSfdrClassification(project, region);
  const sdr = region === 'UK' ? determineUkSdrEligibility(project, finalScore) : [];
  const taxonomy = determineEuTaxonomyAlignment(project);

  const allExplanations = {
    positive: [...sa.explanations.positive, ...epv.explanations.positive, ...wre.explanations.positive, ...csr.explanations.positive, ...dfr.explanations.positive],
    negative: [...sa.explanations.negative, ...epv.explanations.negative, ...wre.explanations.negative, ...csr.explanations.negative, ...dfr.explanations.negative],
  };

  return {
    capitalReadinessScore: finalScore,
    confidenceScore: confidence,
    band,
    subscores,
    hardStopTriggered,
    hardStopReason,
    hardStops,
    recommendations,
    risks: allExplanations.negative.slice(0, 3),
    explanations: allExplanations,
    sfdr,
    sdr,
    taxonomy,
    pillarDetails: {
      sa: { ...sa, weight: weights.sa },
      epv: { ...epv, weight: weights.epv },
      wre: { ...wre, weight: weights.wre },
      csr: { ...csr, weight: weights.csr },
      dfr: { ...dfr, weight: weights.dfr, dataCompleteness: dfr.dataCompleteness },
    },
    region,
    weights,
    assessedAt: new Date().toISOString(),
  };
}
