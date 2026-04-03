import {
  REGULATORY_THRESHOLDS,
  MENA_COUNTRIES,
  COOLING_TECHNOLOGIES,
  calculateWueTarget
} from '../constants/regulatoryData.js';
import { getPercentileRank } from '../constants/benchmarks.js';
import { determineSfdrClassification } from './sfdr.js';
import { determineSdrEligibility } from './sdr.js';
import { determineTaxonomyAlignment } from './taxonomy.js';
import { identifyGaps, generateRecommendations } from './gaps.js';
import { assessCsrdReadiness } from './csrd.js';

export function calculateComplianceScore(formData) {
  const scores = {
    energy: calculateEnergyScore(formData),
    water: calculateWaterScore(formData),
    circularEconomy: calculateCircularScore(formData),
    climateRisk: calculateClimateRiskScore(formData)
  };

  // Weighted overall score: 35/25/20/20
  const weights = { energy: 0.35, water: 0.25, circularEconomy: 0.20, climateRisk: 0.20 };
  const overallScore = Object.entries(scores).reduce(
    (acc, [key, val]) => acc + val.score * weights[key], 0
  );

  const sfdrClassification = determineSfdrClassification(overallScore, formData);
  const sdrEligibility = determineSdrEligibility(scores, formData);
  const taxonomyAlignment = determineTaxonomyAlignment(scores, formData);
  const csrdReadiness = assessCsrdReadiness(formData);

  return {
    overall: Math.round(overallScore),
    categories: scores,
    sfdr: sfdrClassification,
    sdr: sdrEligibility,
    taxonomy: taxonomyAlignment,
    csrd: csrdReadiness,
    gaps: identifyGaps(scores, formData),
    recommendations: generateRecommendations(scores, formData)
  };
}

export function calculateEnergyScore(formData) {
  let score = 0;
  const gaps = [];
  const details = [];

  const isNewBuild = formData.isNewBuild !== false; // default true
  const pue = parseFloat(formData.pueTarget) || 1.8;
  const pueThreshold = isNewBuild
    ? REGULATORY_THRESHOLDS.euTaxonomy.pue.compliantNew
    : REGULATORY_THRESHOLDS.euTaxonomy.pue.compliantExisting;

  // PUE Assessment (40 points)
  if (pue <= 1.3) {
    score += 40;
    details.push({ metric: 'PUE', status: 'excellent', value: pue, message: 'Best-in-class efficiency' });
  } else if (pue <= pueThreshold) {
    score += 35;
    details.push({ metric: 'PUE', status: 'compliant', value: pue, message: 'EU Taxonomy compliant' });
  } else if (pue <= 1.6) {
    score += 25;
    gaps.push({ metric: 'PUE', gap: `Above EU Taxonomy threshold of ${pueThreshold}`, severity: 'medium', impactOnScore: 15 });
    details.push({ metric: 'PUE', status: 'warning', value: pue, message: 'Above threshold' });
  } else {
    score += 10;
    gaps.push({ metric: 'PUE', gap: 'Significantly above industry standard', severity: 'high', impactOnScore: 30 });
    details.push({ metric: 'PUE', status: 'critical', value: pue, message: 'Requires improvement' });
  }

  // Benchmark
  const region = MENA_COUNTRIES.find(c => c.code === formData.country) ? 'mena' : 'global';
  const puePercentile = getPercentileRank('pue', pue, region);

  // Renewable Energy (40 points)
  const renewable = parseFloat(formData.renewablePercent) || 0;
  // Penalise EAC-only sourcing for Article 9 additionality
  const hasDirectPpa = formData.renewableType?.includes('ppa_direct') || formData.renewableType?.includes('onsite');
  const effectiveRenewableForA9 = hasDirectPpa ? renewable : Math.min(renewable, 70);

  if (renewable >= 100) {
    score += 40;
    details.push({ metric: 'Renewable Energy', status: 'excellent', value: `${renewable}%`, message: '100% renewable' });
  } else if (renewable >= 75) {
    score += 32;
    details.push({ metric: 'Renewable Energy', status: 'compliant', value: `${renewable}%`, message: 'SFDR Article 9 eligible' });
  } else if (renewable >= 50) {
    score += 22;
    gaps.push({ metric: 'Renewable Energy', gap: 'Below 75% for Article 9 alignment', severity: 'medium', impactOnScore: 10 });
    details.push({ metric: 'Renewable Energy', status: 'warning', value: `${renewable}%`, message: 'Article 8 eligible' });
  } else {
    score += Math.max(5, renewable / 5);
    gaps.push({ metric: 'Renewable Energy', gap: 'Insufficient renewable energy sourcing', severity: 'high', impactOnScore: 20 });
    details.push({ metric: 'Renewable Energy', status: 'critical', value: `${renewable}%`, message: 'Below minimum threshold' });
  }

  // On-site Generation Bonus (10 points)
  const onsite = parseFloat(formData.onsiteGeneration) || 0;
  if (onsite >= 25) {
    score += 10;
    details.push({ metric: 'On-site Generation', status: 'excellent', value: `${onsite}%`, message: 'Strong on-site capacity' });
  } else if (onsite >= 10) {
    score += 6;
    details.push({ metric: 'On-site Generation', status: 'compliant', value: `${onsite}%`, message: 'Good progress' });
  } else {
    score += 2;
    details.push({ metric: 'On-site Generation', status: 'warning', value: `${onsite}%`, message: 'Consider expansion' });
  }

  // Certification Bonus (10 points)
  const hasEnergyCert = formData.certifications?.includes('iso50001') || formData.certifications?.includes('eu_coc');
  if (hasEnergyCert) {
    score += 10;
    details.push({ metric: 'Energy Certifications', status: 'compliant', value: 'Present', message: 'ISO 50001 / EU CoC' });
  }

  return {
    score: Math.min(100, score),
    gaps,
    details,
    benchmarks: { pue: { percentile: puePercentile, region } }
  };
}

export function calculateWaterScore(formData) {
  let score = 0;
  const gaps = [];
  const details = [];

  const country = MENA_COUNTRIES.find(c => c.code === formData.country);
  const isWaterStressed = country?.waterStress === 'high';
  const climateZone = country?.climateZone ?? 'temperate';
  const recycledLevel = formData.recycledWaterLevel ?? 'none';
  const coolingType = formData.coolingType ?? 'chilled_water';

  // Calculate actual CNDCP WUE target for this facility
  const wueTarget = calculateWueTarget(climateZone, coolingType, recycledLevel);
  const wue = parseFloat(formData.wueMetric) || 2.0;

  // WUE Assessment (50 points)
  if (wue <= 0.3) {
    score += 50;
    details.push({ metric: 'WUE', status: 'excellent', value: wue, message: 'Best-in-class water efficiency' });
  } else if (wue <= wueTarget) {
    score += 40;
    details.push({ metric: 'WUE', status: 'compliant', value: wue, message: `Meets CNDCP target (≤${wueTarget})` });
  } else if (wue <= wueTarget * 1.5) {
    score += 25;
    gaps.push({
      metric: 'WUE',
      gap: `Above CNDCP target of ${wueTarget} L/kWh for this climate and cooling type`,
      severity: 'medium',
      impactOnScore: 15
    });
    details.push({ metric: 'WUE', status: 'warning', value: wue, message: 'Improvement needed' });
  } else {
    score += 10;
    gaps.push({
      metric: 'WUE',
      gap: 'Significant water efficiency concern — well above CNDCP target',
      severity: 'high',
      impactOnScore: 25
    });
    details.push({ metric: 'WUE', status: 'critical', value: wue, message: 'Critical improvement required' });
  }

  // Cooling Technology (30 points)
  const cooling = COOLING_TECHNOLOGIES.find(c => c.id === coolingType);
  if (cooling) {
    if (cooling.waterIntensity === 'very_low' || cooling.waterIntensity === 'low') {
      score += 30;
      details.push({ metric: 'Cooling Technology', status: 'excellent', value: cooling.name, message: 'Water-efficient technology' });
    } else if (cooling.waterIntensity === 'medium') {
      score += 20;
      details.push({ metric: 'Cooling Technology', status: 'compliant', value: cooling.name, message: 'Moderate water use' });
    } else {
      score += 10;
      gaps.push({ metric: 'Cooling Technology', gap: 'High water consumption cooling system', severity: 'medium', impactOnScore: 10 });
      details.push({ metric: 'Cooling Technology', status: 'warning', value: cooling.name, message: 'Consider alternatives' });
    }
  }

  // Water Recycling & Alternative Sources (20 points)
  if (formData.waterRecycling) {
    score += 10;
    details.push({ metric: 'Water Recycling', status: 'compliant', value: 'Yes', message: 'Active recycling program' });
  } else if (isWaterStressed) {
    gaps.push({ metric: 'Water Recycling', gap: 'No recycling in water-stressed region', severity: 'high', impactOnScore: 10 });
  }

  if (formData.alternativeWaterSource) {
    score += 10;
    details.push({ metric: 'Alternative Water Source', status: 'compliant', value: 'Yes', message: 'Non-potable water use' });
  }

  const region = country ? 'mena' : 'global';
  const wuePercentile = getPercentileRank('wue', wue, region);

  return {
    score: Math.min(100, score),
    gaps,
    details,
    wueTarget,
    benchmarks: { wue: { percentile: wuePercentile, region } }
  };
}

export function calculateCircularScore(formData) {
  let score = 0;
  const gaps = [];
  const details = [];

  // E-waste Management (35 points)
  const ewasteProgram = formData.ewasteProgram;
  if (ewasteProgram === 'comprehensive') {
    score += 35;
    details.push({ metric: 'E-waste Management', status: 'excellent', value: 'Comprehensive', message: 'Full lifecycle program' });
  } else if (ewasteProgram === 'certified') {
    score += 28;
    details.push({ metric: 'E-waste Management', status: 'compliant', value: 'Certified', message: 'Certified recycling partners' });
  } else if (ewasteProgram === 'basic') {
    score += 15;
    gaps.push({ metric: 'E-waste', gap: 'Basic program without certification', severity: 'medium', impactOnScore: 13 });
    details.push({ metric: 'E-waste Management', status: 'warning', value: 'Basic', message: 'Enhancement needed' });
  } else {
    gaps.push({ metric: 'E-waste', gap: 'No formal e-waste management program', severity: 'high', impactOnScore: 28 });
    details.push({ metric: 'E-waste Management', status: 'critical', value: 'None', message: 'Program required' });
  }

  // Server Refresh Policy (25 points)
  const serverLife = parseInt(formData.serverLifecycle) || 3;
  if (serverLife >= 5) {
    score += 25;
    details.push({ metric: 'Server Lifecycle', status: 'excellent', value: `${serverLife} years`, message: 'Extended lifecycle' });
  } else if (serverLife >= 4) {
    score += 20;
    details.push({ metric: 'Server Lifecycle', status: 'compliant', value: `${serverLife} years`, message: 'Standard lifecycle' });
  } else {
    score += 10;
    gaps.push({ metric: 'Server Lifecycle', gap: 'Short refresh cycle increases e-waste', severity: 'medium', impactOnScore: 10 });
    details.push({ metric: 'Server Lifecycle', status: 'warning', value: `${serverLife} years`, message: 'Consider extension' });
  }

  // Equipment Reuse (20 points)
  if (formData.equipmentReuse) {
    score += 20;
    details.push({ metric: 'Equipment Reuse', status: 'compliant', value: 'Yes', message: 'Active reuse program' });
  } else {
    gaps.push({ metric: 'Equipment Reuse', gap: 'No formal equipment reuse program', severity: 'low', impactOnScore: 20 });
    details.push({ metric: 'Equipment Reuse', status: 'warning', value: 'No', message: 'Program recommended' });
  }

  // Sustainable Procurement (20 points)
  if (formData.sustainableProcurement) {
    score += 20;
    details.push({ metric: 'Sustainable Procurement', status: 'compliant', value: 'Yes', message: 'ESG supplier criteria' });
  } else {
    gaps.push({ metric: 'Procurement', gap: 'No sustainable procurement policy', severity: 'medium', impactOnScore: 20 });
    details.push({ metric: 'Sustainable Procurement', status: 'warning', value: 'No', message: 'Policy needed' });
  }

  return { score: Math.min(100, score), gaps, details };
}

export function calculateClimateRiskScore(formData) {
  let score = 0;
  const gaps = [];
  const details = [];

  const country = MENA_COUNTRIES.find(c => c.code === formData.country);

  // TCFD 5-pillar scoring (replaces single checkbox) — 30 points total
  const tcfdPillars = [
    { key: 'tcfdGovernance', label: 'Governance', points: 6 },
    { key: 'tcfdStrategy', label: 'Strategy', points: 6 },
    { key: 'tcfdRiskManagement', label: 'Risk Management', points: 6 },
    { key: 'tcfdMetrics', label: 'Metrics & Targets', points: 6 },
    { key: 'climateRiskAssessment', label: 'Climate Risk Assessment', points: 6 }
  ];

  let tcfdScore = 0;
  tcfdPillars.forEach(pillar => {
    if (formData[pillar.key]) {
      tcfdScore += pillar.points;
    }
  });
  score += tcfdScore;

  if (tcfdScore < 18) {
    gaps.push({
      metric: 'TCFD',
      gap: `Only ${tcfdScore}/30 TCFD pillars complete`,
      severity: tcfdScore < 12 ? 'high' : 'medium',
      impactOnScore: 30 - tcfdScore
    });
    details.push({ metric: 'TCFD Alignment', status: tcfdScore >= 18 ? 'compliant' : tcfdScore >= 12 ? 'warning' : 'critical', value: `${tcfdScore}/30`, message: 'Partial TCFD coverage' });
  } else {
    details.push({ metric: 'TCFD Alignment', status: 'compliant', value: `${tcfdScore}/30`, message: 'Strong TCFD alignment' });
  }

  // Heat Resilience (25 points)
  if (country?.climate === 'hot') {
    if (formData.heatResilience) {
      score += 25;
      details.push({ metric: 'Heat Resilience', status: 'compliant', value: 'Planned', message: 'Hot climate mitigation' });
    } else {
      gaps.push({ metric: 'Heat Resilience', gap: 'No heat resilience planning in hot climate', severity: 'high', impactOnScore: 25 });
      details.push({ metric: 'Heat Resilience', status: 'critical', value: 'Missing', message: 'Critical for region' });
    }
  } else {
    score += 20;
    details.push({ metric: 'Heat Resilience', status: 'compliant', value: 'Moderate risk', message: 'Standard controls' });
  }

  // Transition Plan (25 points)
  if (formData.transitionPlan) {
    score += 25;
    details.push({ metric: 'Transition Plan', status: 'compliant', value: 'Yes', message: 'Net-zero pathway defined' });
  } else {
    gaps.push({ metric: 'Transition Plan', gap: 'No decarbonization transition plan', severity: 'medium', impactOnScore: 25 });
    details.push({ metric: 'Transition Plan', status: 'warning', value: 'No', message: 'Plan recommended' });
  }

  // Environmental Certifications (20 points)
  const hasEnvCerts = formData.certifications?.some(c => ['iso14001', 'leed', 'breeam'].includes(c));
  if (hasEnvCerts) {
    score += 20;
    details.push({ metric: 'Environmental Certifications', status: 'compliant', value: 'Present', message: 'Recognised standards' });
  } else {
    gaps.push({ metric: 'Certifications', gap: 'No environmental management certification', severity: 'low', impactOnScore: 20 });
    details.push({ metric: 'Environmental Certifications', status: 'warning', value: 'None', message: 'Certification beneficial' });
  }

  return { score: Math.min(100, score), gaps, details };
}
