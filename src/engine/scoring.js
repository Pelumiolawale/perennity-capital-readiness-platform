// ============================================================
// SCORING ENGINE — reads thresholds from regulation JSON
// Update src/regulations/frameworks/region-thresholds.json
// to change thresholds without touching this file.
// ============================================================

import regionThresholds from '../regulations/frameworks/region-thresholds.json';
import sfdrFramework from '../regulations/frameworks/sfdr.json';
import ukSdrFramework from '../regulations/frameworks/uk-sdr.json';
import euTaxonomy from '../regulations/frameworks/eu-taxonomy.json';
import { evaluateLabel } from './labelEvaluation.js';

const RT = regionThresholds.regions;
const SUPPORTED_REGIONS = Object.keys(RT);

// Region-dependent logic (WUE K-factor fallbacks, grid carbon lookups,
// DNSH water CNDCP formula, region weights) all key off this set. An
// unmapped region indicates a bug upstream — throw rather than silently
// defaulting, so it's caught in the engine instead of producing
// misleading scores.
function assertSupportedRegion(region) {
  if (!SUPPORTED_REGIONS.includes(region)) {
    throw new Error(
      `Unsupported region "${region}". Supported regions: ${SUPPORTED_REGIONS.join(', ')}. ` +
      `Add an entry to src/regulations/frameworks/region-thresholds.json to support additional regions.`
    );
  }
}

export const REGION_WEIGHTS = Object.fromEntries(
  Object.entries(RT).map(([r, v]) => [r, v.weights])
);

export const REGION_THRESHOLDS = Object.fromEntries(
  Object.entries(RT).map(([r, v]) => [r, { pue: v.pue.target, renewableMin: v.renewableMin, wue: v.wue.target }])
);

// Unified 4-band readiness model (v3.1). Matches the PDF band labels
// so that Results page, Excel, PDF, and Airtable all use the same bands.
export const READINESS_BANDS = [
  { min: 75, label: "Capital Ready",        color: "#4ECDA4" },
  { min: 55, label: "Conditionally Ready",  color: "#B8860B" },
  { min: 35, label: "Development Stage",    color: "#2E4057" },
  { min: 0,  label: "Pre-Development",      color: "#A63D2F" },
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
// Four labels per FCA PS23/16 ESG Sourcebook 5.3: Focus, Improvers,
// Impact, and Mixed Goals. Mixed Goals is eligible when the project
// would qualify for at least two of the other three labels — its
// intended semantics per PS23/16 9.50.
export function determineUkSdrEligibility(project, score) {
  const renewPct = parseFloat(project.renewable_energy_share_pct) || 0;
  const pue = parseFloat(project.pue) || 999;
  const labels = ukSdrFramework.labels;

  const impactEligible = score >= labels.sustainabilityImpact.scoringThreshold &&
    renewPct >= labels.sustainabilityImpact.requirements.minRenewable &&
    pue <= labels.sustainabilityImpact.requirements.maxPue &&
    project.net_zero_commitment_present &&
    project.taxonomy_alignment_claimed;

  const focusEligible = score >= labels.sustainabilityFocus.scoringThreshold &&
    renewPct >= labels.sustainabilityFocus.requirements.minRenewable &&
    pue <= labels.sustainabilityFocus.requirements.maxPue &&
    project.sustainability_disclosures_ready;

  const improversEligible = score >= labels.sustainabilityImprovers.scoringThreshold &&
    renewPct >= labels.sustainabilityImprovers.requirements.minRenewable &&
    project.carbon_reduction_strategy_present;

  const qualifyingLabels = [impactEligible, focusEligible, improversEligible].filter(Boolean).length;
  const mixedGoalsEligible = score >= labels.sustainabilityMixedGoals.scoringThreshold &&
    renewPct >= labels.sustainabilityMixedGoals.requirements.minRenewable &&
    project.sustainability_disclosures_ready &&
    qualifyingLabels >= 2;

  return [
    {
      label: labels.sustainabilityImpact.label,
      eligible: impactEligible,
      description: labels.sustainabilityImpact.description,
      gap: impactEligible ? '' : `Score ${score} < ${labels.sustainabilityImpact.scoringThreshold} or renewable ${renewPct}% < ${labels.sustainabilityImpact.requirements.minRenewable}% or PUE ${pue} > ${labels.sustainabilityImpact.requirements.maxPue} or missing net-zero / Taxonomy claim`,
      citation: labels.sustainabilityImpact.citation,
    },
    {
      label: labels.sustainabilityFocus.label,
      eligible: focusEligible,
      description: labels.sustainabilityFocus.description,
      gap: focusEligible ? '' : `Score ${score} < ${labels.sustainabilityFocus.scoringThreshold} or renewable ${renewPct}% < ${labels.sustainabilityFocus.requirements.minRenewable}% or disclosures not ready`,
      citation: labels.sustainabilityFocus.citation,
    },
    {
      label: labels.sustainabilityImprovers.label,
      eligible: improversEligible,
      description: labels.sustainabilityImprovers.description,
      gap: improversEligible ? '' : `Score ${score} < ${labels.sustainabilityImprovers.scoringThreshold} or renewable ${renewPct}% < ${labels.sustainabilityImprovers.requirements.minRenewable}% or no carbon reduction strategy`,
      citation: labels.sustainabilityImprovers.citation,
    },
    {
      label: labels.sustainabilityMixedGoals.label,
      eligible: mixedGoalsEligible,
      description: labels.sustainabilityMixedGoals.description,
      gap: mixedGoalsEligible ? '' : `Qualifies for ${qualifyingLabels} of 3 other labels (need ≥ 2) or score/renewable/disclosures gap`,
      citation: labels.sustainabilityMixedGoals.citation,
    },
  ];
}

// ── EU Taxonomy alignment ─────────────────────────────────────
// Stage-based new-build heuristic per Activity 8.1 (applies to any DC
// placed in service from 2026). Shared with calculatePueScore.
function isNewBuildStage(project) {
  const s = project.development_stage;
  return s === 'concept' || s === 'site_shortlisted' || s === 'site_selected' || s === 'pre_permitting';
}

export function determineEuTaxonomyAlignment(project, countryProfile) {
  const pue = parseFloat(project.pue) || 999;
  const renewPct = parseFloat(project.renewable_energy_share_pct) || 0;
  const sc = euTaxonomy.substantialContribution;

  const pueThreshold = isNewBuildStage(project)
    ? sc.criteria.find(c => c.id === 'pue_new').threshold
    : sc.criteria.find(c => c.id === 'pue_existing').threshold;

  const criteria = [
    { name: `PUE ≤ ${pueThreshold}`, met: pue <= pueThreshold },
    { name: 'Renewable electricity ≥ 50%', met: renewPct >= 50 },
    { name: 'Waste heat reuse assessed', met: !!project.waste_heat_recovery },
    { name: 'Climate risk assessment conducted', met: !!project.adaptation_measures_present || !!project.business_continuity_plan_ready },
  ];

  // DNSH per EU 2020/852 Art 17 + Annexes I–VI
  //   Obj 1 Climate Mitigation — self-referential: satisfied by the substantial
  //     contribution itself (Activity 8.1 IS a climate-mitigation activity).
  //   Obj 2 Climate Adaptation — requires physical risk assessment AND
  //     adaptation measures (was: adaptation only).
  //   Obj 3 Water — WUE computed via CNDCP in Fix 3.4b; for now, keep flat
  //     threshold but reference project.wue correctly.
  //   Obj 4 Circular Economy — wired to dnsh_weee_compliance (was: hard-coded true).
  //   Obj 5 Pollution — low-GWP refrigerants; backup/onsite AND-check (was ||).
  //   Obj 6 Biodiversity — site outside protected areas (was: adaptation).
  // DNSH Obj 3 Water uses the site-specific CNDCP WUEmax = 0.4 × K1 × K2 × K3
  // rather than a flat WUE ≤ 1.0 m³/MWh, per EUDCA WUE White Paper Oct 2024.
  const wueVal = parseFloat(project.wue);
  const { wueMax } = calculateWueMax(project, null, countryProfile || null);
  const waterMet = !project.wue || (isFinite(wueVal) && wueVal <= wueMax) || !!project.water_recycling_included;

  const dnsh = {
    mitigation: { label: 'Climate Change Mitigation (self-referential)', met: true },
    climate: { label: euTaxonomy.dnsh.climateAdaptation.label, met: !!project.dnsh_climate_vulnerability && !!project.adaptation_measures_present },
    water: { label: `${euTaxonomy.dnsh.water.label} (CNDCP WUEmax ${wueMax.toFixed(2)} m³/MWh)`, met: waterMet },
    circular: { label: euTaxonomy.dnsh.circularEconomy.label, met: !!project.dnsh_weee_compliance },
    pollution: { label: euTaxonomy.dnsh.pollution.label, met: !!project.dnsh_low_gwp_refrigerants && project.backup_power_type !== 'diesel' && project.onsite_generation_type !== 'gas' },
    biodiversity: { label: euTaxonomy.dnsh.biodiversity.label, met: !!project.dnsh_protected_areas },
  };

  // Minimum Social Safeguards per EU 2020/852 Article 18 — separate gate.
  const minimumSafeguards = {
    humanRights: { label: 'Human rights due diligence (UNGPs, OECD MNEs)', met: !!project.dnsh_human_rights_dd },
    labour: { label: 'Supply chain labour standards (ILO)', met: !!project.dnsh_supply_chain_labour },
  };

  const substantialMet = criteria.every(c => c.met);
  const dnshMet = Object.values(dnsh).every(d => d.met);
  const safeguardsMet = Object.values(minimumSafeguards).every(s => s.met);
  const aligned = substantialMet && dnshMet && safeguardsMet;

  return { aligned, criteria, dnsh, minimumSafeguards };
}

// ── PUE scoring — EU Taxonomy Climate Delegated Act (EU) 2021/2139, Annex I, Activity 8.1
// Bands per Perennity Bridge methodology v3.1:
//   New-build:  ≤1.2  → 95 (post-2025 best-in-class)
//               ≤1.3  → 85 (v3.1 new-build gate — Activity 8.1 ¶1(a))
//               ≤1.5  → 55 (fail-for-new-build; allowed only for existing)
//               >1.5  → 10 (fail)
//   Existing:   ≤1.5  → 85 (Activity 8.1 ¶1(b))
//               ≤1.8  → 50 (transitional — improvement plan required)
//               >1.8  → 15 (fail)
// Bands are anchored to absolute PUE per Activity 8.1. The country PUE
// target (COUNTRY_PROFILES[country].pueTarget) informs an advisory flag
// but does not define the scoring bands.
export function calculatePueScore(pue, project, region, countryProfile) {
  const isNew = isNewBuildStage(project);
  const pueTarget = countryProfile?.pueTarget || 1.5;
  let score, label, taxonomyGate;
  const flags = [];

  if (isNew) {
    if (pue <= 1.2)      { score = 95; label = 'Capital ready';   taxonomyGate = 'Pass — post-2025 new-build best-in-class (≤1.2)'; }
    else if (pue <= 1.3) { score = 85; label = 'Capital ready';   taxonomyGate = 'Pass — meets Activity 8.1 new-build threshold (≤1.3)'; }
    else if (pue <= 1.5) { score = 55; label = 'Conditional';     taxonomyGate = 'Fail for new-build — PUE 1.3 < x ≤ 1.5 only permitted for existing facilities'; }
    else                 { score = 10; label = 'Pre-development'; taxonomyGate = 'Fail — exceeds Activity 8.1 new-build threshold'; }
  } else {
    if (pue <= 1.5)      { score = 85; label = 'Capital ready';   taxonomyGate = 'Pass — meets Activity 8.1 existing-DC threshold (≤1.5)'; }
    else if (pue <= 1.8) { score = 50; label = 'Conditional';     taxonomyGate = 'Transitional — improvement plan required (≤1.8)'; }
    else                 { score = 15; label = 'Pre-development'; taxonomyGate = 'Fail — exceeds Activity 8.1 existing-DC threshold'; }
  }

  // Advisory flag: country PUE target delta (informational only)
  if (pue > pueTarget) {
    flags.push(`Your country's recommended PUE target is ≤${pueTarget}. Current PUE ${pue} exceeds this by ${(pue - pueTarget).toFixed(2)}.`);
  }
  // Advisory flag: EU Activity 8.1 new-build absolute threshold
  if (isNew && pue > 1.3) {
    flags.push(`Gap vs EU Activity 8.1 new-build threshold (≤1.3): ${(pue - 1.3).toFixed(2)}. Projects seeking EU-classified capital must meet EU thresholds regardless of location.`);
  }

  return { score, label, taxonomyGate, flags };
}

// ── WUE scoring — CNDCP WUEmax formula (EUDCA White Paper October 2024)
export function calculateWueMax(project, region, countryProfile) {
  const waterStress = countryProfile?.waterStress || 'medium';
  const k1Map = { cold: 1.0, warm: 1.1 };
  const k2Map = { low: 5.0, low_medium: 4.0, medium_high: 2.5, high: 1.0 };
  const k3Map = { potable: 1.0, grey: 3.0, brackish: 6.0 };

  // Map country water stress to default K2 if user hasn't selected one
  const stressToK2 = { 'extreme': 1.0, 'high': 1.0, 'medium': 2.5, 'low': 5.0 };
  // Map country water stress to default K1 (climate zone)
  const stressToK1 = { 'extreme': 1.1, 'high': 1.1, 'medium': 1.0, 'low': 1.0 };

  const k1 = k1Map[project.k1_climate] || stressToK1[waterStress] || 1.0;
  const k2 = k2Map[project.k2_stress] || stressToK2[waterStress] || 2.5;
  const k3 = k3Map[project.k3_water] || 1.0;
  const wueMax = 0.4 * k1 * k2 * k3;

  const notes = [];
  if (['extreme', 'high'].includes(waterStress) && !project.k2_stress) {
    notes.push(`Conservative assumption applied based on ${waterStress} water stress classification. Override if local water authority data is available.`);
  }

  return { wueMax, k1, k2, k3, notes };
}

// ── WUE max stringency by country water stress ──────────────
export function getWueMaxStringency(waterStress) {
  // Returns WUEmax threshold for full score based on water stress
  const map = { 'extreme': 0.5, 'high': 1.0, 'medium': 1.5, 'low': 2.0 };
  return map[waterStress] || 1.5;
}

export function scoreWueVsMax(wue, wueMax) {
  if (wue <= wueMax * 0.8) return { score: 92, label: 'Exceeds CNDCP target' };
  if (wue <= wueMax) return { score: 75, label: 'Meets CNDCP WUEmax target' };
  if (wue <= wueMax * 1.2) return { score: 52, label: 'Marginally above target — remediation required' };
  return { score: 20, label: 'Fails CNDCP WUEmax target' };
}

// ── Renewable energy three-tier source quality scoring
export function calculateRenewableTierScore(renewPct, project) {
  const source = project.renewable_energy_source || '';
  const tierOverride = project.renewable_source_tier;
  let tier;

  if (tierOverride === '1' || tierOverride === '2' || tierOverride === '3') {
    tier = parseInt(tierOverride, 10);
  } else if (source === 'ppa' || source === 'onsite' || source === 'solar_wind') {
    tier = 1;
  } else if (source === 'rec' || source === 'mixed') {
    tier = 2;
  } else if (source === 'utility_green_tariff') {
    tier = 3;
  } else {
    tier = 1; // default
  }

  let score;
  const flags = [];

  if (tier === 3) {
    score = Math.min(40, renewPct >= 100 ? 40 : renewPct >= 75 ? 30 : renewPct >= 50 ? 20 : 10);
    flags.push('Utility green tariff does not satisfy EU Taxonomy additionality requirements. Upgrade to matched PPA or GOs recommended.');
  } else if (tier === 2) {
    if (renewPct >= 100) score = 72;
    else if (renewPct >= 75) score = 55;
    else score = Math.min(44, Math.round(renewPct * 0.58));
  } else {
    if (renewPct >= 100) score = 95;
    else if (renewPct >= 75) score = 80;
    else if (renewPct >= 50) score = 57;
    else score = Math.min(44, Math.round(renewPct * 0.88));
  }

  return { score, tier, flags };
}

// ── DNSH governance scoring
export function calculateDnshGovernance(project) {
  const items = [
    { key: 'dnsh_climate_vulnerability', points: 2, label: 'Climate vulnerability assessment', citation: 'DNSH Obj 2 — Climate adaptation' },
    { key: 'dnsh_protected_areas',       points: 2, label: 'Site outside protected areas',     citation: 'DNSH Obj 6 — Biodiversity' },
    { key: 'dnsh_low_gwp_refrigerants',  points: 1, label: 'Low-GWP refrigerants',             citation: 'DNSH Obj 5 — Pollution (F-Gas 517/2014)' },
    { key: 'dnsh_weee_compliance',       points: 1, label: 'WEEE end-of-life plan',            citation: 'DNSH Obj 4 — Circular (Dir 2012/19/EU)' },
    { key: 'dnsh_human_rights_dd',       points: 2, label: 'Human rights due diligence',       citation: 'Art 18 — UNGPs / OECD MNEs' },
    { key: 'dnsh_supply_chain_labour',   points: 1, label: 'Supply chain labour policy',       citation: 'Art 18 — ILO Declaration' },
  ];

  let totalPoints = 0;
  const maxPoints = 9;
  const explanations = { positive: [], negative: [] };
  const details = items.map(item => {
    const met = !!project[item.key];
    if (met) {
      totalPoints += item.points;
      explanations.positive.push(`${item.label} — confirmed (+${item.points})`);
    } else {
      explanations.negative.push(`${item.label} — not confirmed`);
    }
    return { key: item.key, label: item.label, citation: item.citation, points: item.points, met };
  });

  return { score: Math.round((totalPoints / maxPoints) * 100), explanations, details };
}

// ── Pillar scoring functions ──────────────────────────────────
export function calculateSustainabilityAlignment(project, region, countryProfile) {
  let score = 100;
  const explanations = { positive: [], negative: [] };

  // PUE scoring with country-specific thresholds
  const pue = parseFloat(project.pue);
  if (pue) {
    const pueResult = calculatePueScore(pue, project, region, countryProfile);
    // Map PUE score (0-100) to a penalty/bonus on the SA pillar
    if (pueResult.score >= 70) {
      explanations.positive.push(`PUE ${pue}: ${pueResult.label} — ${pueResult.taxonomyGate}`);
    } else {
      const penalty = Math.min(25, Math.round((100 - pueResult.score) * 0.25));
      score -= penalty;
      explanations.negative.push(`PUE ${pue}: ${pueResult.label} — ${pueResult.taxonomyGate} (−${penalty})`);
    }
    pueResult.flags.forEach(f => explanations.negative.push(f));
  }

  // Grid carbon scoring using country profile
  if (countryProfile) {
    const gridCarbon = countryProfile.gridCarbon;
    if (gridCarbon > 600 && project.backup_power_type !== 'battery' && project.backup_power_type !== 'hydrogen' && !project.ppa_secured) {
      score -= 8;
      explanations.negative.push(`DNSH risk: grid carbon intensity ${gridCarbon} gCO₂/kWh exceeds 600g threshold without PPA/REC mitigation (−8)`);
    } else if (gridCarbon <= 100) {
      score += 3;
      explanations.positive.push(`Low-carbon grid (${gridCarbon} gCO₂/kWh) — strong decarbonisation baseline (+3)`);
    }
  }

  // CHANGE 3: Renewable energy with three-tier source quality scoring
  const renewPct = parseFloat(project.renewable_energy_share_pct) || 0;
  const renewResult = calculateRenewableTierScore(renewPct, project);
  if (renewResult.score >= 65) {
    explanations.positive.push(`Renewable ${renewPct}% (Tier ${renewResult.tier}): score ${renewResult.score}`);
  } else {
    const penalty = Math.min(20, Math.round((65 - renewResult.score) * 0.3));
    score -= penalty;
    explanations.negative.push(`Renewable ${renewPct}% (Tier ${renewResult.tier}): score ${renewResult.score} (−${penalty})`);
  }
  renewResult.flags.forEach(f => explanations.negative.push(f));
  if (renewResult.tier <= 2 && renewPct > 0) {
    explanations.positive.push('Source quality assessed against GHG Protocol Scope 2 Guidance (2015) and EU Taxonomy Climate Delegated Act Activity 8.1.');
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

export function calculateWaterResourceEfficiency(project, region, countryProfile) {
  const explanations = { positive: [], negative: [] };

  // CNDCP WUEmax formula scoring with country profile
  const wue = parseFloat(project.wue);
  const { wueMax, k1, k2, k3, notes } = calculateWueMax(project, region, countryProfile);
  let wueScore = 50;

  // Apply WUE max stringency based on country water stress
  if (countryProfile) {
    const wueStringency = getWueMaxStringency(countryProfile.waterStress);
    if (wue && wue <= wueStringency) {
      wueScore = Math.min(100, wueScore + 15);
      explanations.positive.push(`WUE ${wue} meets ${countryProfile.waterStress} water stress stringency threshold (≤${wueStringency})`);
    } else if (wue && wue > wueStringency) {
      explanations.negative.push(`WUE ${wue} exceeds ${countryProfile.waterStress} water stress stringency threshold (≤${wueStringency})`);
    }
  }

  if (wue) {
    const wueResult = scoreWueVsMax(wue, wueMax);
    wueScore = wueResult.score;
    if (wueScore >= 65) {
      explanations.positive.push(`${wueResult.label} — WUE ${wue} vs WUEmax ${wueMax.toFixed(2)} m³/MWh`);
    } else {
      explanations.negative.push(`${wueResult.label} — WUE ${wue} vs WUEmax ${wueMax.toFixed(2)} m³/MWh`);
    }
    explanations.positive.push(`Your site WUEmax (CNDCP formula): ${wueMax.toFixed(2)} m³/MWh (K1=${k1}, K2=${k2}, K3=${k3})`);
    notes.forEach(n => explanations.negative.push(n));
  }

  let coolingScore = 50;
  if (project.cooling_type === 'liquid') { coolingScore = 90; explanations.positive.push('Liquid cooling — highly efficient'); }
  else if (project.cooling_type === 'hybrid') { coolingScore = 75; }
  else if (project.cooling_type === 'evaporative') { coolingScore = 55; }
  else if (project.cooling_type === 'air') { coolingScore = 45; }

  let contextScore = 60;
  const countryStressBand = countryProfile?.waterStress || 'medium';
  const highStress = countryStressBand === 'extreme' || countryStressBand === 'high';
  if (highStress && project.cooling_type === 'evaporative' && !project.water_recycling_included) {
    contextScore = 15;
    explanations.negative.push(`High water use in ${countryStressBand}-stress region without recycling`);
  } else if (project.water_recycling_included) {
    contextScore = 85;
    explanations.positive.push('Water recycling systems planned');
  }

  if (project.waste_heat_recovery) {
    contextScore = Math.min(100, contextScore + 10);
    explanations.positive.push('Waste heat recovery planned');
  }

  const score = wueScore * 0.50 + coolingScore * 0.25 + contextScore * 0.25;
  return { score: Math.max(0, Math.min(100, Math.round(score))), explanations, wueMax };
}

export function calculateClimateSiteResilience(project) {
  const explanations = { positive: [], negative: [] };

  const flood = parseFloat(project.flood_risk_score) || 50;
  const heat = parseFloat(project.extreme_heat_risk_score) || 50;
  const storm = parseFloat(project.storm_risk_score) || 30;

  let floodScore = Math.max(0, 100 - flood);
  let heatScore = Math.max(0, 100 - heat);
  let stormScore = Math.max(0, 100 - storm * 0.8);

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

  // Rebalanced weights after removing the phantom weatherScore (which was
  // driven by wildfire_risk_score — never collected from the user).
  //   flood 35%, heat 25%, storm 20%, adaptation 20%.
  const score = floodScore * 0.35 + heatScore * 0.25 + stormScore * 0.20 + adaptScore * 0.20;
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

export function evaluateHardStops(project, region, countryProfile) {
  const stops = [];
  const regionData = RT[region] || RT.UK;

  if (project.grid_connection_status === 'not_started' && regionData.hardStops?.noGridUS_EU) {
    stops.push(regionData.hardStops.noGridUS_EU);
  }

  if ((parseFloat(project.flood_risk_score) || 0) > 80 && !project.adaptation_measures_present) {
    stops.push({ reason: 'Extreme unmitigated flood risk', cap: 50 });
  }

  if (countryProfile?.waterStress === 'extreme' && project.cooling_type === 'evaporative' && !project.water_recycling_included) {
    stops.push({ reason: 'Extreme-water-stress region with water-intensive cooling and no recycling', cap: 50 });
  }

  const criticalFields = ['pue', 'planned_capacity_mw', 'cooling_type', 'grid_connection_status'];
  const missing = criticalFields.filter(f => !project[f]);
  if (missing.length >= 3) {
    stops.push({ reason: 'Missing critical technical data', cap: 55 });
  }

  // Hard stop: pursuing a green-claim financing label without EU Taxonomy
  // alignment AND with very low renewable share. Enum list reflects current
  // Tab 5 dropdown values (not the stale legacy keys).
  const greenClaimLabels = [
    'sfdr_article_9', 'eu_taxonomy_8_1', 'eugbs',
    'uk_sdr_focus', 'uk_sdr_improvers', 'uk_sdr_impact', 'uk_sdr_mixed',
  ];
  if (regionData.hardStops?.greenRaiseWithoutTaxonomy) {
    const hs = regionData.hardStops.greenRaiseWithoutTaxonomy;
    if (project.target_financing_label && greenClaimLabels.includes(project.target_financing_label) &&
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

// Map a criterion pillar to the UI-facing pillar name. Falls back
// to 'Sustainability Alignment' when the criterion doesn't clearly
// map (label evaluators don't always tag pillar consistently).
function criterionToPillarName(criterion) {
  const id = (criterion.id || '').toLowerCase();
  if (id.includes('pue') || id.includes('energy') || id.includes('taxonomy') || id.includes('ccm')) return 'Sustainability Alignment';
  if (id.includes('wue') || id.includes('water')) return 'Water & Resource Efficiency';
  if (id.includes('ppa') || id.includes('renewable')) return 'Energy & Power Viability';
  if (id.includes('climate') || id.includes('adapt') || id.includes('flood')) return 'Climate & Site Resilience';
  if (id.includes('safeguards') || id.includes('governance') || id.includes('dnsh')) return 'Sustainability Alignment';
  return 'Sustainability Alignment';
}

const UK_SDR_LABELS = new Set([
  'uk_sdr_focus', 'uk_sdr_improvers', 'uk_sdr_impact', 'uk_sdr_mixed',
]);

export function generateRecommendations(project, subscores, region, labelEvaluation = null) {
  const thresholds = REGION_THRESHOLDS[region] || REGION_THRESHOLDS.UK;
  const label = project?.target_financing_label || null;
  const isUkSdr = UK_SDR_LABELS.has(label);
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

  // EU Taxonomy alignment is only a relevant rec for EU-regime labels.
  // Suppress for UK SDR labels — SDR is a disclosure regime that does
  // not use the EU Taxonomy as a qualifying criterion.
  if (!project.taxonomy_alignment_claimed && !isUkSdr && (region === 'EU' || region === 'UK')) {
    recs.push({ action: 'Target EU Taxonomy alignment', uplift: 7, impact: 'High', difficulty: 'Medium', reason: 'Unlocks Article 8/9 SFDR eligibility and green bond market access', pillar: 'Sustainability Alignment' });
  }

  if (!project.net_zero_commitment_present) {
    const reason = isUkSdr
      ? 'Supports UK SDR sustainability claims and is increasingly expected by DFIs'
      : 'Required for SFDR Article 9 and increasingly expected by DFIs';
    recs.push({ action: 'Establish net-zero commitment', uplift: 4, impact: 'Medium', difficulty: 'Low', reason, pillar: 'Sustainability Alignment' });
  }

  // Label-specific prepend: up to 3 recs driven by failing criteria
  // from the label evaluation. Ranked above generic recs so the user
  // sees "close these gaps" first. Deduped against generic recs by
  // action text (soft match).
  const labelRecs = [];
  if (labelEvaluation && Array.isArray(labelEvaluation.criteria)) {
    const failing = labelEvaluation.criteria.filter(c => c.status === 'FAIL' || c.status === 'PARTIAL');
    const byWeight = (w) => (w === 'critical' ? 0 : w === 'required' ? 1 : 2);
    failing.sort((a, b) => byWeight(a.weight) - byWeight(b.weight));
    for (const c of failing.slice(0, 3)) {
      const upliftMap = { critical: 10, required: 6, supporting: 3 };
      const levelMap = { critical: { impact: 'High', difficulty: 'High' }, required: { impact: 'Medium', difficulty: 'Medium' }, supporting: { impact: 'Low', difficulty: 'Low' } };
      const u = upliftMap[c.weight] ?? 5;
      const lv = levelMap[c.weight] ?? { impact: 'Medium', difficulty: 'Medium' };
      labelRecs.push({
        action: `Address: ${c.title}`,
        uplift: u,
        impact: lv.impact,
        difficulty: lv.difficulty,
        reason: c.detail || `Required for ${labelEvaluation.labelName}.`,
        pillar: criterionToPillarName(c),
      });
    }
  }

  const generic = recs.sort((a, b) => b.uplift - a.uplift);
  const combined = [...labelRecs, ...generic];
  // Dedup by action text (case-insensitive) while preserving order.
  const seen = new Set();
  const deduped = [];
  for (const r of combined) {
    const key = r.action.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  return deduped.slice(0, 5);
}

export function runAssessment(project, region, countryProfile) {
  assertSupportedRegion(region);

  const sa = calculateSustainabilityAlignment(project, region, countryProfile);
  const epv = calculateEnergyPowerViability(project, region);
  const wre = calculateWaterResourceEfficiency(project, region, countryProfile);
  const csr = calculateClimateSiteResilience(project);
  const dfr = calculateDeliveryFundingReadiness(project);
  const dnsh = calculateDnshGovernance(project);

  // Blend DNSH governance into sustainability alignment (weighted)
  const saAdjusted = { ...sa, score: Math.round(sa.score * 0.7 + dnsh.score * 0.3), explanations: { positive: [...sa.explanations.positive, ...dnsh.explanations.positive], negative: [...sa.explanations.negative, ...dnsh.explanations.negative] } };

  const weights = REGION_WEIGHTS[region] || REGION_WEIGHTS.UK;
  const rawScore = saAdjusted.score * weights.sa + epv.score * weights.epv + wre.score * weights.wre + csr.score * weights.csr + dfr.score * weights.dfr;

  const hardStops = evaluateHardStops(project, region, countryProfile);
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

  const subscores = { sa: saAdjusted.score, epv: epv.score, wre: wre.score, csr: csr.score, dfr: dfr.score };
  const confidence = calculateConfidence(project);
  const band = READINESS_BANDS.find(b => finalScore >= b.min) || READINESS_BANDS[READINESS_BANDS.length - 1];

  const sfdr = determineSfdrClassification(project, region);
  const sdr = region === 'UK' ? determineUkSdrEligibility(project, finalScore) : [];
  const taxonomy = determineEuTaxonomyAlignment(project, countryProfile);

  const allExplanations = {
    positive: [...saAdjusted.explanations.positive, ...epv.explanations.positive, ...wre.explanations.positive, ...csr.explanations.positive, ...dfr.explanations.positive],
    negative: [...saAdjusted.explanations.negative, ...epv.explanations.negative, ...wre.explanations.negative, ...csr.explanations.negative, ...dfr.explanations.negative],
  };

  // Pre-assemble the partial assessment object so label evaluation can
  // read `taxonomy` and `dnsh` alongside the intake (`project`). Pure,
  // doesn't touch scoring thresholds — interprets existing outputs.
  const preLabelAssessment = { taxonomy, dnsh: { score: dnsh.score, details: dnsh.details } };
  const labelEvaluation = evaluateLabel(preLabelAssessment, project);

  // Hard stop overrides the label verdict. A score-capped project
  // cannot be presented as label-eligible regardless of criteria —
  // the criterion array is preserved for transparency.
  if (labelEvaluation && hardStopTriggered) {
    labelEvaluation.verdict = 'FAIL';
    labelEvaluation.summary = `Hard-stop triggered (${hardStopReason}) — label verdict fails automatically regardless of individual criteria.`;
    labelEvaluation.hardStopOverride = true;
  }

  // Recommendations are generated after label evaluation so they can
  // incorporate failing criteria and filter label-irrelevant advice.
  const recommendations = generateRecommendations(project, subscores, region, labelEvaluation);

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
    labelEvaluation,
    pillarDetails: {
      sa: { ...saAdjusted, weight: weights.sa, dnshScore: dnsh.score },
      epv: { ...epv, weight: weights.epv },
      wre: { ...wre, weight: weights.wre },
      csr: { ...csr, weight: weights.csr },
      dfr: { ...dfr, weight: weights.dfr, dataCompleteness: dfr.dataCompleteness },
    },
    dnsh: { score: dnsh.score, details: dnsh.details },
    region,
    weights,
    assessedAt: new Date().toISOString(),
  };
}
