import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronLeft, Download, CheckCircle, AlertTriangle, XCircle, Building2, Zap, Droplets, Recycle, ThermometerSun, Award, FileText, TrendingUp, Shield, HelpCircle, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import generatePDFReport from '../utils/pdfReportGenerator';

// ============================================
// REGULATORY THRESHOLDS & ASSESSMENT LOGIC
// ============================================

const REGULATORY_THRESHOLDS = {
  // EU Taxonomy Climate Delegated Act 8.1 for Data Centres
  euTaxonomy: {
    pue: {
      excellent: 1.3,      // Best practice
      compliant: 1.5,      // EU Taxonomy threshold
      acceptable: 1.6,     // Transitional
      poor: 1.8            // Non-compliant
    },
    renewableEnergy: {
      excellent: 100,
      compliant: 75,       // For Article 9 alignment
      acceptable: 50,      // For Article 8 alignment
      poor: 25
    },
    wue: {
      // Based on CNDCP WUEmax = 0.4 × K1 × K2 × K3
      excellent: 0.3,      // Water-efficient (air-cooled)
      compliant: 0.8,      // CNDCP target for normal climates
      acceptable: 1.2,     // Acceptable with mitigation
      poor: 2.0            // Requires significant improvement
    }
  },
  // UK SDR Requirements
  ukSdr: {
    sustainabilityFocus: {
      minScore: 75,        // High sustainability threshold
      renewableMin: 70
    },
    sustainabilityImprovers: {
      minScore: 50,        // Demonstrable improvement path
      improvementPlan: true
    },
    sustainabilityImpact: {
      minScore: 80,        // Measurable positive impact
      impactMetrics: true
    }
  },
  // SFDR Classification
  sfdr: {
    article9: {
      minScore: 85,
      sustainableInvestment: 100,
      paiDisclosure: true
    },
    article8: {
      minScore: 60,
      esgPromotion: true
    },
    article6: {
      minScore: 0,
      basicDisclosure: true
    }
  }
};

const MENA_COUNTRIES = [
  { code: 'UAE', name: 'United Arab Emirates', waterStress: 'high', climate: 'hot' },
  { code: 'KSA', name: 'Saudi Arabia', waterStress: 'high', climate: 'hot' },
  { code: 'QAT', name: 'Qatar', waterStress: 'high', climate: 'hot' },
  { code: 'KWT', name: 'Kuwait', waterStress: 'high', climate: 'hot' },
  { code: 'BHR', name: 'Bahrain', waterStress: 'high', climate: 'hot' },
  { code: 'OMN', name: 'Oman', waterStress: 'high', climate: 'hot' },
  { code: 'JOR', name: 'Jordan', waterStress: 'high', climate: 'moderate' },
  { code: 'EGY', name: 'Egypt', waterStress: 'medium', climate: 'moderate' },
  { code: 'MAR', name: 'Morocco', waterStress: 'medium', climate: 'moderate' },
  { code: 'TUN', name: 'Tunisia', waterStress: 'medium', climate: 'moderate' }
];

const COOLING_TECHNOLOGIES = [
  { id: 'air_cooled', name: 'Air-Cooled Chillers', waterIntensity: 'low', pueImpact: 0.1 },
  { id: 'evaporative', name: 'Evaporative Cooling', waterIntensity: 'high', pueImpact: -0.15 },
  { id: 'chilled_water', name: 'Chilled Water System', waterIntensity: 'medium', pueImpact: 0 },
  { id: 'free_cooling', name: 'Free Cooling / Economizers', waterIntensity: 'low', pueImpact: -0.2 },
  { id: 'liquid_cooling', name: 'Direct Liquid Cooling', waterIntensity: 'low', pueImpact: -0.25 },
  { id: 'immersion', name: 'Immersion Cooling', waterIntensity: 'very_low', pueImpact: -0.3 },
  { id: 'hybrid', name: 'Hybrid System', waterIntensity: 'medium', pueImpact: -0.1 }
];

const CERTIFICATIONS = [
  { id: 'iso14001', name: 'ISO 14001 (Environmental Management)', weight: 15 },
  { id: 'iso50001', name: 'ISO 50001 (Energy Management)', weight: 20 },
  { id: 'leed', name: 'LEED Certification', weight: 15 },
  { id: 'breeam', name: 'BREEAM Certification', weight: 15 },
  { id: 'iso27001', name: 'ISO 27001 (Information Security)', weight: 5 },
  { id: 'en50600', name: 'EN 50600 Compliance', weight: 20 },
  { id: 'eu_coc', name: 'EU Code of Conduct for Data Centres', weight: 25 },
  { id: 'uptime', name: 'Uptime Institute Tier Certification', weight: 10 }
];

// ============================================
// ASSESSMENT CALCULATION ENGINE
// ============================================

function calculateComplianceScore(formData) {
  const scores = {
    energy: calculateEnergyScore(formData),
    water: calculateWaterScore(formData),
    circularEconomy: calculateCircularScore(formData),
    climateRisk: calculateClimateRiskScore(formData),
    governance: calculateGovernanceScore(formData)
  };

  // Weighted overall score
  const weights = { energy: 0.30, water: 0.20, circularEconomy: 0.15, climateRisk: 0.15, governance: 0.20 };
  const overallScore = Object.entries(scores).reduce((acc, [key, val]) =>
    acc + (val.score * weights[key]), 0
  );
  
  // Determine regulatory classifications
  const sfdrClassification = determineSfdrClassification(overallScore, formData);
  const sdrEligibility = determineSdrEligibility(scores, formData);
  const taxonomyAlignment = determineTaxonomyAlignment(scores, formData);
  
  return {
    overall: Math.round(overallScore),
    categories: scores,
    sfdr: sfdrClassification,
    sdr: sdrEligibility,
    taxonomy: taxonomyAlignment,
    gaps: identifyGaps(scores, formData),
    recommendations: generateRecommendations(scores, formData)
  };
}

function calculatePueScore(pue, facilityType, isMena) {
  // EU Taxonomy Climate Delegated Act (EU) 2021/2139, Annex I, Activity 8.1
  const flags = [];
  let score, label, taxonomyGate;

  if (facilityType === 'new') {
    if (pue <= 1.2) {
      score = 95; label = 'Capital ready'; taxonomyGate = 'Pass — meets post-2025 new build threshold';
    } else if (pue <= 1.3) {
      score = 80; label = 'Capital ready'; taxonomyGate = 'Pass — meets 2021–2025 new build threshold / CNDCP target';
    } else if (pue <= 1.5) {
      score = 57; label = 'Conditional'; taxonomyGate = 'Fail for new build — passes existing DC threshold only';
      if (isMena) flags.push('Gap vs EU new-build threshold (≤1.3): ' + (pue - 1.3).toFixed(2) + '. Projects seeking EU-classified capital must meet EU thresholds regardless of project location.');
    } else if (pue <= 1.8) {
      score = 32; label = 'Development'; taxonomyGate = 'Fail';
    } else {
      score = 10; label = 'Pre-development'; taxonomyGate = 'Fail';
    }
  } else {
    // existing facility
    if (pue <= 1.5) {
      score = 77; label = 'Capital ready'; taxonomyGate = 'Pass — existing DC threshold';
    } else if (pue <= 1.8) {
      score = 47; label = 'Conditional'; taxonomyGate = 'Conditional — improvement plan required';
    } else {
      score = 15; label = 'Development'; taxonomyGate = 'Fail';
    }
  }

  // MENA gap warning for PUE > 1.3
  if (isMena && pue > 1.3 && !flags.length) {
    flags.push('Gap vs EU new-build threshold (≤1.3): ' + (pue - 1.3).toFixed(2) + '. Projects seeking EU-classified capital must meet EU thresholds regardless of project location.');
  }

  return { score, label, taxonomyGate, flags };
}

function calculateRenewableScore(renewable, tier) {
  // GHG Protocol Scope 2 Guidance (2015) and EU Taxonomy Climate Delegated Act Activity 8.1
  let score;
  const flags = [];

  if (tier === '3') {
    score = Math.min(40, renewable >= 100 ? 40 : renewable >= 75 ? 30 : renewable >= 50 ? 20 : 10);
    flags.push('Utility green tariff does not satisfy EU Taxonomy additionality requirements. Upgrade to matched PPA or GOs recommended.');
  } else if (tier === '2') {
    if (renewable >= 100) score = 72;
    else if (renewable >= 75) score = 55;
    else score = Math.min(44, Math.round(renewable * 0.58));
  } else {
    // tier 1 (default)
    if (renewable >= 100) score = 95;
    else if (renewable >= 75) score = 80;
    else if (renewable >= 50) score = 57;
    else score = Math.min(44, Math.round(renewable * 0.88));
  }

  return { score, flags };
}

function calculateEnergyScore(formData) {
  let score = 0;
  const gaps = [];
  const details = [];

  const pue = parseFloat(formData.pueTarget) || 1.8;
  const facilityType = formData.facilityType || 'new';
  const isMena = MENA_COUNTRIES.some(c => c.code === formData.country);
  const pueResult = calculatePueScore(pue, facilityType, isMena);

  // PUE contributes up to 40 points
  const puePoints = Math.round(pueResult.score * 0.4);
  score += puePoints;

  const pueStatus = pueResult.score >= 70 ? 'excellent' : pueResult.score >= 45 ? 'compliant' : pueResult.score >= 20 ? 'warning' : 'critical';
  details.push({ metric: 'PUE', status: pueStatus, value: pue, message: `${pueResult.label} — ${pueResult.taxonomyGate}` });
  if (pueResult.score < 70) {
    gaps.push({ metric: 'PUE', gap: pueResult.taxonomyGate, severity: pueResult.score < 45 ? 'high' : 'medium' });
  }
  if (pueResult.flags.length > 0) {
    details.push({ metric: 'PUE MENA Warning', status: 'warning', value: '', message: pueResult.flags[0] });
  }

  // Renewable Energy Assessment (40 points max)
  const renewable = parseFloat(formData.renewablePercent) || 0;
  const tier = formData.renewableSourceTier || '1';
  const renewResult = calculateRenewableScore(renewable, tier);
  const renewPoints = Math.round(renewResult.score * 0.4);
  score += renewPoints;

  const renewStatus = renewResult.score >= 70 ? 'excellent' : renewResult.score >= 45 ? 'compliant' : renewResult.score >= 20 ? 'warning' : 'critical';
  details.push({ metric: 'Renewable Energy', status: renewStatus, value: `${renewable}%`, message: `Tier ${tier} source — score ${renewResult.score}` });
  details.push({ metric: 'Renewable Source Quality', status: 'compliant', value: `Tier ${tier}`, message: 'Source quality assessed against GHG Protocol Scope 2 Guidance (2015) and EU Taxonomy Climate Delegated Act Activity 8.1.' });
  if (renewResult.score < 45) {
    gaps.push({ metric: 'Renewable Energy', gap: 'Insufficient renewable energy sourcing or low source quality tier', severity: 'high' });
  }
  if (renewResult.flags.length > 0) {
    details.push({ metric: 'Renewable Tier Warning', status: 'warning', value: '', message: renewResult.flags[0] });
  }

  // On-site Generation Bonus (10 points max)
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

  // Certification Bonus (10 points max)
  const hasEnergyCert = formData.certifications?.includes('iso50001') || formData.certifications?.includes('eu_coc');
  if (hasEnergyCert) {
    score += 10;
    details.push({ metric: 'Energy Certifications', status: 'compliant', value: 'Present', message: 'ISO 50001 / EU CoC' });
  }

  return { score: Math.min(100, score), gaps, details, pueResult };
}

function calculateWueMax(formData) {
  // CNDCP WUEmax formula from EUDCA White Paper (October 2024)
  // WUEmax = 0.4 × K1_climate × K2_stress × K3_water
  const isMena = MENA_COUNTRIES.some(c => c.code === formData.country);
  const k1Map = { cold: 1.0, warm: 1.1 };
  const k2Map = { low: 5.0, low_medium: 4.0, medium_high: 2.5, high: 1.0 };
  const k3Map = { potable: 1.0, grey: 3.0, brackish: 6.0 };

  const k1 = k1Map[formData.k1Climate] || (isMena ? 1.1 : 1.0);
  const k2 = k2Map[formData.k2Stress] || (isMena ? 1.0 : 5.0);
  const k3 = k3Map[formData.k3Water] || 1.0;

  const wueMax = 0.4 * k1 * k2 * k3;

  const notes = [];
  if (isMena && !formData.k2Stress) {
    notes.push('Conservative assumption applied: high water stress (WEI+ > 40). Override if local water authority data is available.');
  }

  return { wueMax, k1, k2, k3, notes };
}

function calculateWaterScore(formData) {
  let score = 0;
  const gaps = [];
  const details = [];

  const wue = parseFloat(formData.wueMetric) || 2.0;
  const country = MENA_COUNTRIES.find(c => c.code === formData.country);
  const isWaterStressed = country?.waterStress === 'high';
  const { wueMax, k1, k2, k3, notes } = calculateWueMax(formData);

  // WUE vs WUEmax Assessment (50 points max)
  let wueScore, wueLabel;
  if (wue <= wueMax * 0.8) {
    wueScore = 92; wueLabel = 'Exceeds CNDCP target';
  } else if (wue <= wueMax) {
    wueScore = 75; wueLabel = 'Meets CNDCP WUEmax target';
  } else if (wue <= wueMax * 1.2) {
    wueScore = 52; wueLabel = 'Marginally above target — remediation required';
  } else {
    wueScore = 20; wueLabel = 'Fails CNDCP WUEmax target';
  }

  const wuePoints = Math.round(wueScore * 0.5);
  score += wuePoints;

  const wueStatus = wueScore >= 85 ? 'excellent' : wueScore >= 65 ? 'compliant' : wueScore >= 40 ? 'warning' : 'critical';
  details.push({ metric: 'WUE', status: wueStatus, value: `${wue} m³/MWh`, message: wueLabel });
  details.push({ metric: 'WUEmax (CNDCP)', status: 'compliant', value: `${wueMax.toFixed(2)} m³/MWh`, message: `Your site WUEmax (CNDCP formula): ${wueMax.toFixed(2)} m³/MWh — K1=${k1}, K2=${k2}, K3=${k3}` });
  if (wueScore < 65) {
    gaps.push({ metric: 'WUE', gap: wueLabel, severity: wueScore < 40 ? 'high' : 'medium' });
  }
  if (notes.length > 0) {
    details.push({ metric: 'WUE Note', status: 'warning', value: '', message: notes[0] });
  }

  // Cooling Technology Assessment (30 points max)
  const cooling = COOLING_TECHNOLOGIES.find(c => c.id === formData.coolingType);
  if (cooling) {
    if (cooling.waterIntensity === 'very_low' || cooling.waterIntensity === 'low') {
      score += 30;
      details.push({ metric: 'Cooling Technology', status: 'excellent', value: cooling.name, message: 'Water-efficient technology' });
    } else if (cooling.waterIntensity === 'medium') {
      score += 20;
      details.push({ metric: 'Cooling Technology', status: 'compliant', value: cooling.name, message: 'Moderate water use' });
    } else {
      score += 10;
      gaps.push({ metric: 'Cooling Technology', gap: 'High water consumption cooling system', severity: 'medium' });
      details.push({ metric: 'Cooling Technology', status: 'warning', value: cooling.name, message: 'Consider alternatives' });
    }
  }

  // Water Stress Mitigation (20 points max)
  if (formData.waterRecycling) {
    score += 10;
    details.push({ metric: 'Water Recycling', status: 'compliant', value: 'Yes', message: 'Active recycling program' });
  } else if (isWaterStressed) {
    gaps.push({ metric: 'Water Recycling', gap: 'No recycling in water-stressed region', severity: 'high' });
  }

  if (formData.alternativeWaterSource) {
    score += 10;
    details.push({ metric: 'Alternative Water Source', status: 'compliant', value: 'Yes', message: 'Non-potable water use' });
  }

  return { score: Math.min(100, score), gaps, details, wueMax };
}

function calculateCircularScore(formData) {
  let score = 0;
  const gaps = [];
  const details = [];
  
  // E-waste Management (35 points max)
  const ewasteProgram = formData.ewasteProgram;
  if (ewasteProgram === 'comprehensive') {
    score += 35;
    details.push({ metric: 'E-waste Management', status: 'excellent', value: 'Comprehensive', message: 'Full lifecycle program' });
  } else if (ewasteProgram === 'certified') {
    score += 28;
    details.push({ metric: 'E-waste Management', status: 'compliant', value: 'Certified', message: 'Certified recycling partners' });
  } else if (ewasteProgram === 'basic') {
    score += 15;
    gaps.push({ metric: 'E-waste', gap: 'Basic program without certification', severity: 'medium' });
    details.push({ metric: 'E-waste Management', status: 'warning', value: 'Basic', message: 'Enhancement needed' });
  } else {
    gaps.push({ metric: 'E-waste', gap: 'No formal e-waste management program', severity: 'high' });
    details.push({ metric: 'E-waste Management', status: 'critical', value: 'None', message: 'Program required' });
  }
  
  // Server Refresh Policy (25 points max)
  const serverLife = parseInt(formData.serverLifecycle) || 3;
  if (serverLife >= 5) {
    score += 25;
    details.push({ metric: 'Server Lifecycle', status: 'excellent', value: `${serverLife} years`, message: 'Extended lifecycle' });
  } else if (serverLife >= 4) {
    score += 20;
    details.push({ metric: 'Server Lifecycle', status: 'compliant', value: `${serverLife} years`, message: 'Standard lifecycle' });
  } else {
    score += 10;
    gaps.push({ metric: 'Server Lifecycle', gap: 'Short refresh cycle increases e-waste', severity: 'medium' });
    details.push({ metric: 'Server Lifecycle', status: 'warning', value: `${serverLife} years`, message: 'Consider extension' });
  }
  
  // Material Reuse (20 points max)
  if (formData.equipmentReuse) {
    score += 20;
    details.push({ metric: 'Equipment Reuse', status: 'compliant', value: 'Yes', message: 'Active reuse program' });
  } else {
    gaps.push({ metric: 'Equipment Reuse', gap: 'No formal equipment reuse program', severity: 'low' });
    details.push({ metric: 'Equipment Reuse', status: 'warning', value: 'No', message: 'Program recommended' });
  }
  
  // Supply Chain Sustainability (20 points max)
  if (formData.sustainableProcurement) {
    score += 20;
    details.push({ metric: 'Sustainable Procurement', status: 'compliant', value: 'Yes', message: 'ESG supplier criteria' });
  } else {
    gaps.push({ metric: 'Procurement', gap: 'No sustainable procurement policy', severity: 'medium' });
    details.push({ metric: 'Sustainable Procurement', status: 'warning', value: 'No', message: 'Policy needed' });
  }
  
  return { score: Math.min(100, score), gaps, details };
}

function calculateClimateRiskScore(formData) {
  let score = 0;
  const gaps = [];
  const details = [];

  const country = MENA_COUNTRIES.find(c => c.code === formData.country);

  // Physical Risk Assessment (30 points max)
  if (formData.climateRiskAssessment) {
    score += 30;
    details.push({ metric: 'Climate Risk Assessment', status: 'compliant', value: 'Complete', message: 'TCFD-aligned assessment' });
  } else {
    gaps.push({ metric: 'Climate Risk', gap: 'No formal climate risk assessment', severity: 'high' });
    details.push({ metric: 'Climate Risk Assessment', status: 'critical', value: 'Missing', message: 'Assessment required' });
  }

  // Heat Resilience (25 points max)
  if (country?.climate === 'hot') {
    if (formData.heatResilience) {
      score += 25;
      details.push({ metric: 'Heat Resilience', status: 'compliant', value: 'Planned', message: 'Hot climate mitigation' });
    } else {
      gaps.push({ metric: 'Heat Resilience', gap: 'No heat resilience planning in hot climate', severity: 'high' });
      details.push({ metric: 'Heat Resilience', status: 'critical', value: 'Missing', message: 'Critical for region' });
    }
  } else {
    score += 20;
    details.push({ metric: 'Heat Resilience', status: 'compliant', value: 'Moderate risk', message: 'Standard controls' });
  }

  // Transition Risk Management (25 points max)
  if (formData.transitionPlan) {
    score += 25;
    details.push({ metric: 'Transition Plan', status: 'compliant', value: 'Yes', message: 'Net-zero pathway defined' });
  } else {
    gaps.push({ metric: 'Transition Plan', gap: 'No decarbonization transition plan', severity: 'medium' });
    details.push({ metric: 'Transition Plan', status: 'warning', value: 'No', message: 'Plan recommended' });
  }

  // Certifications (20 points max)
  const hasEnvCerts = formData.certifications?.some(c => ['iso14001', 'leed', 'breeam'].includes(c));
  if (hasEnvCerts) {
    score += 20;
    details.push({ metric: 'Environmental Certifications', status: 'compliant', value: 'Present', message: 'Recognized standards' });
  } else {
    gaps.push({ metric: 'Certifications', gap: 'No environmental management certification', severity: 'low' });
    details.push({ metric: 'Environmental Certifications', status: 'warning', value: 'None', message: 'Certification beneficial' });
  }

  return { score: Math.min(100, score), gaps, details };
}

function calculateGovernanceScore(formData) {
  const gaps = [];
  const details = [];

  // DNSH Checklist — weighted points
  // (a) Climate vulnerability: 2 points
  // (b) Protected areas: 2 points
  // (c) Low-GWP refrigerants: 1 point
  // (d) WEEE compliance: 1 point
  // (e) Human rights due diligence: 2 points
  // (f) Supply chain labour: 1 point
  // Total max = 9 points → mapped to 0–100
  const dnshItems = [
    { key: 'dnshClimateVulnerability', points: 2, label: 'DNSH Obj 2 — Climate vulnerability assessment (IPCC risk taxonomy)', shortLabel: 'Climate Vulnerability' },
    { key: 'dnshProtectedAreas', points: 2, label: 'DNSH Obj 6 — Site outside protected areas (Natura 2000, UNESCO, KBAs, primary forests)', shortLabel: 'Biodiversity / Protected Areas' },
    { key: 'dnshLowGwpRefrigerants', points: 1, label: 'DNSH Obj 5 — Low-GWP refrigerants (EU F-Gas Regulation 517/2014)', shortLabel: 'Low-GWP Refrigerants' },
    { key: 'dnshWeeeCompliance', points: 1, label: 'DNSH Obj 4 — IT equipment end-of-life plan (WEEE Directive 2012/19/EU)', shortLabel: 'WEEE Compliance' },
    { key: 'dnshHumanRightsDueDiligence', points: 2, label: 'Art 18 Min Social Safeguards — Human rights due diligence (UNGPs / OECD Guidelines)', shortLabel: 'Human Rights Due Diligence' },
    { key: 'dnshSupplyChainLabour', points: 1, label: 'Art 18 Min Social Safeguards — Supply chain labour standards policy', shortLabel: 'Supply Chain Labour' },
  ];

  let totalPoints = 0;
  const maxPoints = 9;
  dnshItems.forEach(item => {
    if (formData[item.key]) {
      totalPoints += item.points;
      details.push({ metric: item.shortLabel, status: 'compliant', value: 'Yes', message: item.label });
    } else {
      gaps.push({ metric: item.shortLabel, gap: item.label, severity: item.points >= 2 ? 'high' : 'medium' });
      details.push({ metric: item.shortLabel, status: 'critical', value: 'No', message: item.label });
    }
  });

  const score = Math.round((totalPoints / maxPoints) * 100);
  return { score: Math.min(100, score), gaps, details };
}

function determineSfdrClassification(overallScore, formData) {
  const renewable = parseFloat(formData.renewablePercent) || 0;
  const pue = parseFloat(formData.pueTarget) || 1.8;
  
  if (overallScore >= 85 && renewable >= 75 && pue <= 1.5) {
    return {
      classification: 'Article 9',
      label: 'Sustainable Investment',
      color: 'emerald',
      description: 'Eligible for funds with sustainable investment as their objective',
      requirements: ['Sustainable investment objective', 'No significant harm to other objectives', 'Good governance practices']
    };
  } else if (overallScore >= 60 && renewable >= 50) {
    return {
      classification: 'Article 8',
      label: 'Environmental Characteristics',
      color: 'blue',
      description: 'Promotes environmental characteristics alongside financial returns',
      requirements: ['Promotes E/S characteristics', 'Investee companies follow good governance', 'PAI consideration']
    };
  } else {
    return {
      classification: 'Article 6',
      label: 'Standard Disclosure',
      color: 'gray',
      description: 'Basic sustainability risk disclosure only',
      requirements: ['Sustainability risk integration disclosure', 'No ESG claims permitted']
    };
  }
}

function determineSdrEligibility(scores, formData) {
  const overallScore = Object.values(scores).reduce((a, b) => a + b.score, 0) / 4;
  const results = [];
  
  if (overallScore >= 75 && parseFloat(formData.renewablePercent) >= 70) {
    results.push({
      label: 'Sustainability Focus',
      eligible: true,
      description: 'Assets meeting a credible standard of environmental sustainability'
    });
  } else {
    results.push({
      label: 'Sustainability Focus',
      eligible: false,
      gap: 'Requires ≥75% overall score and ≥70% renewable energy'
    });
  }
  
  if (overallScore >= 50 && formData.transitionPlan) {
    results.push({
      label: 'Sustainability Improvers',
      eligible: true,
      description: 'Assets with potential to improve sustainability over time'
    });
  } else {
    results.push({
      label: 'Sustainability Improvers',
      eligible: false,
      gap: 'Requires demonstrable improvement pathway'
    });
  }
  
  if (overallScore >= 80 && formData.climateRiskAssessment) {
    results.push({
      label: 'Sustainability Impact',
      eligible: true,
      description: 'Achieves pre-defined positive environmental impact'
    });
  } else {
    results.push({
      label: 'Sustainability Impact',
      eligible: false,
      gap: 'Requires measurable positive impact metrics'
    });
  }
  
  return results;
}

function determineTaxonomyAlignment(scores, formData) {
  const pue = parseFloat(formData.pueTarget) || 1.8;
  const hasEuCoc = formData.certifications?.includes('eu_coc');

  const substantialContribution = pue <= 1.5 && hasEuCoc;
  const dnshClimate = formData.dnshClimateVulnerability;
  const dnshWater = scores.water.score >= 60;
  const dnshCircular = formData.dnshWeeeCompliance && scores.circularEconomy.score >= 50;
  const dnshPollution = formData.dnshLowGwpRefrigerants;
  const dnshBiodiversity = formData.dnshProtectedAreas;
  const minSocialSafeguards = formData.dnshHumanRightsDueDiligence && formData.dnshSupplyChainLabour;

  const allDnsh = dnshClimate && dnshWater && dnshCircular && dnshPollution && dnshBiodiversity && minSocialSafeguards;

  return {
    aligned: substantialContribution && allDnsh,
    substantialContribution: {
      met: substantialContribution,
      criteria: [
        { name: 'PUE ≤ 1.5', met: pue <= 1.5 },
        { name: 'EU Code of Conduct', met: hasEuCoc },
        { name: 'Third-party verification', met: hasEuCoc }
      ]
    },
    dnsh: {
      climate: { met: dnshClimate, label: 'Climate Change Adaptation (DNSH Obj 2)' },
      water: { met: dnshWater, label: 'Water & Marine Resources (DNSH Obj 3)' },
      circular: { met: dnshCircular, label: 'Circular Economy (DNSH Obj 4)' },
      pollution: { met: dnshPollution, label: 'Pollution Prevention (DNSH Obj 5)' },
      biodiversity: { met: dnshBiodiversity, label: 'Biodiversity (DNSH Obj 6)' },
      socialSafeguards: { met: minSocialSafeguards, label: 'Minimum Social Safeguards (Art 18)' }
    }
  };
}

function identifyGaps(scores, formData) {
  const allGaps = [];
  Object.entries(scores).forEach(([category, data]) => {
    data.gaps.forEach(gap => {
      allGaps.push({ ...gap, category });
    });
  });
  return allGaps.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

function generateRecommendations(scores, formData) {
  const recommendations = [];
  
  // Energy recommendations
  const pue = parseFloat(formData.pueTarget) || 1.8;
  if (pue > 1.5) {
    recommendations.push({
      category: 'Energy',
      priority: 'High',
      action: 'Reduce PUE to ≤1.5',
      impact: 'Required for EU Taxonomy substantial contribution',
      timeline: '6-12 months',
      details: [
        'Implement hot/cold aisle containment',
        'Upgrade to variable speed drives on cooling equipment',
        'Deploy AI-based cooling optimization',
        'Increase temperature setpoints where possible'
      ]
    });
  }
  
  const renewable = parseFloat(formData.renewablePercent) || 0;
  if (renewable < 75) {
    recommendations.push({
      category: 'Energy',
      priority: renewable < 50 ? 'High' : 'Medium',
      action: 'Increase renewable energy to ≥75%',
      impact: 'Required for SFDR Article 9 classification',
      timeline: '3-6 months',
      details: [
        'Negotiate Power Purchase Agreements (PPAs) with renewable generators',
        'Source REGOs/GOs for remaining grid consumption',
        'Evaluate on-site solar PV installation',
        'Consider virtual PPAs for price hedging'
      ]
    });
  }
  
  // Water recommendations
  const wue = parseFloat(formData.wueMetric) || 2.0;
  if (wue > 0.8) {
    recommendations.push({
      category: 'Water',
      priority: 'Medium',
      action: 'Reduce WUE below 0.8 L/kWh',
      impact: 'Critical for MENA water-stressed regions',
      timeline: '12-18 months',
      details: [
        'Transition to air-cooled or liquid cooling systems',
        'Implement water recycling for non-potable uses',
        'Deploy water treatment for cooling tower cycles',
        'Consider seawater or treated wastewater sources'
      ]
    });
  }
  
  // Certification recommendations
  if (!formData.certifications?.includes('eu_coc')) {
    recommendations.push({
      category: 'Governance',
      priority: 'High',
      action: 'Implement EU Code of Conduct for Data Centres',
      impact: 'Mandatory for EU Taxonomy alignment',
      timeline: '3-6 months',
      details: [
        'Self-assess against EU CoC best practices',
        'Engage independent third-party auditor',
        'Register as EU CoC Participant',
        'Implement continuous improvement process'
      ]
    });
  }
  
  // Climate risk recommendations
  if (!formData.climateRiskAssessment) {
    recommendations.push({
      category: 'Climate Risk',
      priority: 'High',
      action: 'Complete TCFD-aligned climate risk assessment',
      impact: 'Required for SFDR PAI disclosure and UK SDR',
      timeline: '2-4 months',
      details: [
        'Conduct physical risk analysis (heat, water scarcity, extreme weather)',
        'Assess transition risks (carbon pricing, policy changes)',
        'Develop climate scenarios (1.5°C, 2°C, 3°C pathways)',
        'Integrate findings into strategic planning'
      ]
    });
  }
  
  // Circular economy recommendations
  if (!formData.ewasteProgram || formData.ewasteProgram === 'none') {
    recommendations.push({
      category: 'Circular Economy',
      priority: 'Medium',
      action: 'Establish certified e-waste management program',
      impact: 'Required for DNSH to circular economy objective',
      timeline: '3-6 months',
      details: [
        'Partner with R2/e-Stewards certified recyclers',
        'Implement asset tracking and disposal chain-of-custody',
        'Establish equipment refurbishment and resale program',
        'Report e-waste metrics in sustainability disclosures'
      ]
    });
  }
  
  return recommendations;
}

// ============================================
// CONSTANTS
// ============================================

const INITIAL_FORM_DATA = {
  projectName: '', country: '', powerCapacity: '', facilityType: '',
  pueTarget: '', coolingType: '', renewablePercent: '', renewableSourceTier: '',
  gridPercent: '', onsiteGeneration: '', wueMetric: '', k1Climate: '',
  k2Stress: '', k3Water: '', waterRecycling: false, alternativeWaterSource: false,
  ewasteProgram: '', serverLifecycle: '', equipmentReuse: false,
  sustainableProcurement: false, climateRiskAssessment: false, heatResilience: false,
  transitionPlan: false, dnshClimateVulnerability: false, dnshProtectedAreas: false,
  dnshLowGwpRefrigerants: false, dnshWeeeCompliance: false,
  dnshHumanRightsDueDiligence: false, dnshSupplyChainLabour: false,
  targetFinancingLabel: '', certifications: []
};

const WIZARD_STEPS = [
  { title: 'Project', icon: Building2 },
  { title: 'Region', icon: Building2 },
  { title: 'Capacity', icon: Zap },
  { title: 'Energy', icon: Zap },
  { title: 'Water', icon: Droplets },
  { title: 'Renewables', icon: Zap },
  { title: 'Governance', icon: Shield },
  { title: 'Circular', icon: Recycle }
];

const TOOLTIPS = {
  pue: 'Power Usage Effectiveness \u2014 the ratio of total data centre energy use to IT equipment energy use. A PUE of 1.0 is perfect; 1.3 is best practice for new builds under EU Taxonomy.',
  wue: 'Water Usage Effectiveness \u2014 annual data centre water consumption (m\u00b3) divided by annual IT equipment energy consumption (MWh). Lower is better. Calculated per ISO/IEC 30134-5.',
  renewablePercent: 'The proportion of electricity consumed that comes from renewable sources on a market basis. Source quality matters \u2014 a matched Power Purchase Agreement scores higher than a Renewable Energy Certificate.',
  renewableSourceTier: 'Tier 1 (matched PPA or on-site generation) satisfies EU Taxonomy additionality requirements. Tier 2 (GOs/RECs) is accepted by most Article 8 funds. Tier 3 (green tariff) does not satisfy additionality requirements.',
  k2Stress: 'Based on the EU Water Exploitation Index (WEI+) for your location. MENA locations are typically high stress (WEI+ > 40). This affects your site-specific WUEmax target under the Climate Neutral Data Centre Pact.',
  k3Water: 'The type of water used for cooling affects your WUEmax target. Using brackish or sea water allows a higher WUE target than potable water under the CNDCP formula.',
};

const STORAGE_KEY = 'pb_wizard_state';
const SIDEBAR_KEY = 'sidebar_collapsed';

// ============================================
// VALIDATION
// ============================================

function validateStep(step, formData) {
  const errors = {};
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };

  if (step === 2) {
    // Capacity step — powerCapacity
    if (formData.powerCapacity !== '') {
      const v = num(formData.powerCapacity);
      if (v === null) errors.powerCapacity = 'Please enter a valid number.';
      else if (v <= 0 || v >= 10000) errors.powerCapacity = 'IT load must be greater than 0 MW and less than 10,000 MW.';
    }
  }
  if (step === 3) {
    // Energy step — PUE
    if (formData.pueTarget !== '') {
      const v = num(formData.pueTarget);
      if (v === null) errors.pueTarget = 'Please enter a valid number.';
      else if (v < 1.0 || v > 5.0) errors.pueTarget = 'PUE must be between 1.0 and 5.0. A value below 1.0 is physically impossible; above 5.0 is outside normal data centre range.';
    }
  }
  if (step === 4) {
    // Water step — WUE
    if (formData.wueMetric !== '') {
      const v = num(formData.wueMetric);
      if (v === null) errors.wueMetric = 'Please enter a valid number.';
      else if (v < 0.0 || v > 20.0) errors.wueMetric = 'WUE must be between 0.0 and 20.0 m\u00b3/MWh.';
    }
  }
  if (step === 5) {
    // Renewables step — renewablePercent
    if (formData.renewablePercent !== '') {
      const v = num(formData.renewablePercent);
      if (v === null) errors.renewablePercent = 'Please enter a valid number.';
      else if (v < 0 || v > 100) errors.renewablePercent = 'Renewable energy percentage must be between 0 and 100.';
    }
    if (formData.onsiteGeneration !== '') {
      const v = num(formData.onsiteGeneration);
      if (v === null) errors.onsiteGeneration = 'Please enter a valid number.';
      else if (v < 0 || v > 100) errors.onsiteGeneration = 'On-site generation must be between 0 and 100%.';
    }
    if (formData.gridPercent !== '') {
      const v = num(formData.gridPercent);
      if (v === null) errors.gridPercent = 'Please enter a valid number.';
      else if (v < 0 || v > 100) errors.gridPercent = 'Grid percentage must be between 0 and 100%.';
    }
  }
  return errors;
}

// ============================================
// UI COMPONENTS
// ============================================

const ProgressBar = ({ value, color = 'teal' }) => {
  const colorClasses = { teal: 'bg-teal-500', emerald: 'bg-emerald-500', blue: 'bg-blue-500', amber: 'bg-amber-500', red: 'bg-red-500', gray: 'bg-gray-500' };
  const bgColor = value >= 70 ? 'teal' : value >= 50 ? 'amber' : 'red';
  return (
    <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${colorClasses[color] || colorClasses[bgColor]}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
};

const FormStep = ({ children, title, subtitle, icon: Icon }) => (
  <div className="space-y-6">
    <div className="flex items-center gap-4 pb-4 border-b border-slate-200">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white"><Icon className="w-6 h-6" /></div>
      <div>
        <h2 className="text-xl font-semibold text-slate-800">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
    {children}
  </div>
);

const Tooltip = ({ text }) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block ml-1 align-middle">
      <button type="button" onClick={() => setOpen(o => !o)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} className="text-slate-400 hover:text-teal-600 focus:outline-none" aria-label="Help">
        <HelpCircle className="w-4 h-4" />
      </button>
      {open && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 px-3 py-2 text-xs text-white bg-slate-800 rounded-lg shadow-lg leading-relaxed pointer-events-none">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </span>
      )}
    </span>
  );
};

const InputField = ({ label, helper, error, tooltip, children }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {tooltip && <Tooltip text={tooltip} />}
    </label>
    {children}
    {helper && !error && <p className="text-xs text-slate-500">{helper}</p>}
    {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
  </div>
);

const StepProgress = ({ currentStep, totalSteps, steps }) => (
  <>
    {/* Desktop: full bar */}
    <div className="hidden sm:block">
      <div className="flex items-center justify-between mb-1">
        {steps.map((step, idx) => (
          <div key={idx} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${
              idx < currentStep ? 'bg-[#0B1F2A] text-white' :
              idx === currentStep ? 'bg-[#4ECDA4] text-white shadow-md' :
              'bg-white border-2 border-slate-300 text-slate-400'
            }`}>
              {idx < currentStep ? <CheckCircle className="w-4 h-4" /> : idx + 1}
            </div>
            {idx < steps.length - 1 && (
              <div className={`w-6 lg:w-10 xl:w-14 h-0.5 mx-0.5 transition-colors duration-200 ${idx < currentStep ? 'bg-[#0B1F2A]' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-500">
        {steps.map((step, idx) => (
          <span key={idx} className={`w-8 text-center ${idx === currentStep ? 'text-teal-600 font-semibold' : ''}`}>{step.title}</span>
        ))}
      </div>
    </div>
    {/* Mobile: compact */}
    <div className="sm:hidden text-center py-2">
      <span className="text-sm font-medium text-teal-700">Step {currentStep + 1} of {totalSteps}</span>
      <span className="text-xs text-slate-500 ml-2">{steps[currentStep]?.title}</span>
    </div>
  </>
);

// ============================================
// MAIN APPLICATION
// ============================================

export default function ComplianceAssessmentTool() {
  const [currentStep, setCurrentStep] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [assessmentTime, setAssessmentTime] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === 'true'; } catch { return false; }
  });
  const [savedBanner, setSavedBanner] = useState(null);

  // FIX 6: Restore saved state on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || !saved.timestamp) return;
      const age = Date.now() - saved.timestamp;
      if (age > 7 * 24 * 60 * 60 * 1000) { localStorage.removeItem(STORAGE_KEY); return; }
      setSavedBanner({ formData: saved.formData, step: saved.step });
    } catch { /* ignore corrupt data */ }
  }, []);

  // FIX 6: Persist on every change
  useEffect(() => {
    if (showResults) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ formData, step: currentStep, timestamp: Date.now() }));
    } catch { /* quota exceeded */ }
  }, [formData, currentStep, showResults]);

  // FIX 1: Persist sidebar
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, String(sidebarCollapsed)); } catch {}
  }, [sidebarCollapsed]);

  const updateField = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const toggleCertification = useCallback((certId) => {
    setFormData(prev => ({
      ...prev,
      certifications: prev.certifications.includes(certId) ? prev.certifications.filter(c => c !== certId) : [...prev.certifications, certId]
    }));
  }, []);

  const results = useMemo(() => {
    if (!showResults) return null;
    return calculateComplianceScore(formData);
  }, [showResults, formData]);

  const validationErrors = useMemo(() => validateStep(currentStep, formData), [currentStep, formData]);
  const hasErrors = Object.keys(validationErrors).length > 0;

  const handleSubmit = () => {
    setAssessmentTime(new Date());
    setShowResults(true);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  const handleDownloadPDF = () => {
    generatePDFReport(formData, results);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  const handleReset = () => {
    setShowResults(false);
    setCurrentStep(0);
    setFormData({ ...INITIAL_FORM_DATA });
    setAssessmentTime(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  const handleRestoreSaved = () => {
    if (!savedBanner) return;
    setFormData(savedBanner.formData);
    setCurrentStep(savedBanner.step);
    setSavedBanner(null);
  };

  const handleStartFresh = () => {
    setSavedBanner(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  // ============================================
  // RESULTS SCREEN (with sidebar — FIX 1 + FIX 5)
  // ============================================
  if (showResults && results) {
    const sidebarItems = [
      { key: 'energy', label: 'Energy', icon: Zap },
      { key: 'water', label: 'Water', icon: Droplets },
      { key: 'circularEconomy', label: 'Circular', icon: Recycle },
      { key: 'climateRisk', label: 'Climate', icon: ThermometerSun },
      { key: 'governance', label: 'DNSH', icon: Shield }
    ];

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-emerald-50/20 flex">
        {/* Sidebar — FIX 1 */}
        <aside className={`hidden md:flex flex-col bg-[#0B1F2A] text-white transition-all duration-200 ease-in-out ${sidebarCollapsed ? 'w-12' : 'w-56'}`}>
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between px-4'} h-14 border-b border-white/10`}>
            {!sidebarCollapsed && <span className="text-sm font-semibold text-[#4ECDA4] truncate">Perennity Bridge</span>}
            <button onClick={() => setSidebarCollapsed(c => !c)} className="p-1 rounded hover:bg-white/10 transition-colors" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4 text-slate-400" /> : <PanelLeftClose className="w-4 h-4 text-slate-400" />}
            </button>
          </div>
          <nav className="flex-1 py-3 space-y-1">
            {sidebarItems.map(({ key, label, icon: Icon }) => {
              const score = results.categories[key].score;
              const dotColor = score >= 65 ? 'bg-emerald-400' : score >= 40 ? 'bg-amber-400' : 'bg-red-400';
              return (
                <div key={key} className={`flex items-center gap-2 px-3 py-2 mx-1 rounded-lg hover:bg-white/5 transition-colors ${sidebarCollapsed ? 'justify-center' : ''}`}>
                  <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                  {!sidebarCollapsed && (
                    <>
                      <span className="text-sm text-slate-300 flex-1 truncate">{label}</span>
                      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                      <span className="text-xs text-slate-400">{score}</span>
                    </>
                  )}
                </div>
              );
            })}
          </nav>
          <div className={`p-3 border-t border-white/10 ${sidebarCollapsed ? 'hidden' : ''}`}>
            <button onClick={handleReset} className="w-full text-xs text-slate-400 hover:text-white py-1.5 rounded transition-colors">New Assessment</button>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Results Header */}
          <div className="bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-700 text-white">
            <div className="max-w-6xl mx-auto px-6 py-12">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-teal-200 text-sm font-medium mb-1">Assessment Complete</p>
                  <h1 className="text-3xl font-bold">{formData.projectName || 'Data Centre Project'}</h1>
                  <p className="text-teal-100 mt-1">{MENA_COUNTRIES.find(c => c.code === formData.country)?.name || 'MENA Region'} &bull; {formData.powerCapacity} MW</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={handleReset} className="px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg font-medium transition-colors">New Assessment</button>
                  <button onClick={handleDownloadPDF} className="px-5 py-2.5 bg-white text-teal-700 hover:bg-teal-50 rounded-lg font-medium flex items-center gap-2 transition-colors">
                    <Download className="w-4 h-4" />Download Report
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Overall Score */}
          <div className="max-w-6xl mx-auto px-6 -mt-8">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
              <div className="grid md:grid-cols-3 gap-8">
                <div className="flex flex-col items-center justify-center">
                  <div className="relative w-40 h-40">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="80" cy="80" r="70" fill="none" stroke="#e2e8f0" strokeWidth="12" />
                      <circle cx="80" cy="80" r="70" fill="none" stroke={results.overall >= 70 ? '#0d9488' : results.overall >= 50 ? '#f59e0b' : '#ef4444'} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${results.overall * 4.4} 440`} className="transition-all duration-1000" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-4xl font-bold text-slate-800">{results.overall}%</span>
                      <span className="text-sm text-slate-500">Overall Score</span>
                    </div>
                  </div>
                </div>
                <div className={`rounded-xl p-6 ${results.sfdr.classification === 'Article 9' ? 'bg-emerald-50 border-2 border-emerald-200' : results.sfdr.classification === 'Article 8' ? 'bg-blue-50 border-2 border-blue-200' : 'bg-slate-50 border-2 border-slate-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className={`w-5 h-5 ${results.sfdr.classification === 'Article 9' ? 'text-emerald-600' : results.sfdr.classification === 'Article 8' ? 'text-blue-600' : 'text-slate-600'}`} />
                    <span className="text-sm font-medium text-slate-600">SFDR Classification</span>
                  </div>
                  <p className={`text-2xl font-bold ${results.sfdr.classification === 'Article 9' ? 'text-emerald-700' : results.sfdr.classification === 'Article 8' ? 'text-blue-700' : 'text-slate-700'}`}>{results.sfdr.classification}</p>
                  <p className="text-sm text-slate-600 mt-1">{results.sfdr.label}</p>
                </div>
                <div className={`rounded-xl p-6 ${results.taxonomy.aligned ? 'bg-emerald-50 border-2 border-emerald-200' : 'bg-amber-50 border-2 border-amber-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Award className={`w-5 h-5 ${results.taxonomy.aligned ? 'text-emerald-600' : 'text-amber-600'}`} />
                    <span className="text-sm font-medium text-slate-600">EU Taxonomy</span>
                  </div>
                  <p className={`text-2xl font-bold ${results.taxonomy.aligned ? 'text-emerald-700' : 'text-amber-700'}`}>{results.taxonomy.aligned ? 'Aligned' : 'Not Aligned'}</p>
                  <p className="text-sm text-slate-600 mt-1">{results.taxonomy.aligned ? 'Meets all criteria' : 'Gaps identified'}</p>
                </div>
              </div>
              {/* FIX 5: Version stamp */}
              <p className="text-xs text-slate-400 text-right mt-4">
                Assessment generated: {assessmentTime ? assessmentTime.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'} &middot; Methodology: Perennity Bridge v3.1 &middot; April 2026
              </p>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="max-w-6xl mx-auto px-6 py-8">
            <h2 className="text-xl font-semibold text-slate-800 mb-4">Category Performance</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { key: 'energy', label: 'Energy Efficiency', icon: Zap },
                { key: 'water', label: 'Water Management', icon: Droplets },
                { key: 'circularEconomy', label: 'Circular Economy', icon: Recycle },
                { key: 'climateRisk', label: 'Climate Risk', icon: ThermometerSun },
                { key: 'governance', label: 'Governance / DNSH', icon: Shield }
              ].map(({ key, label, icon: Icon }) => (
                <div key={key} className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${results.categories[key].score >= 70 ? 'bg-teal-100 text-teal-600' : results.categories[key].score >= 50 ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">{label}</p>
                      <p className="text-xl font-bold text-slate-800">{results.categories[key].score}%</p>
                    </div>
                  </div>
                  <ProgressBar value={results.categories[key].score} />
                  {results.categories[key].gaps.length > 0 && (
                    <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {results.categories[key].gaps.length} gap{results.categories[key].gaps.length > 1 ? 's' : ''} identified
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* UK SDR */}
          <div className="max-w-6xl mx-auto px-6 pb-8">
            <h2 className="text-xl font-semibold text-slate-800 mb-4">UK SDR Fund Label Eligibility</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {results.sdr.map((label, idx) => (
                <div key={idx} className={`bg-white rounded-xl p-5 shadow-sm border-2 ${label.eligible ? 'border-emerald-200' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-slate-800">{label.label}</span>
                    {label.eligible ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-slate-400" />}
                  </div>
                  <p className="text-sm text-slate-600">{label.eligible ? label.description : label.gap}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div className="max-w-6xl mx-auto px-6 pb-12">
            <h2 className="text-xl font-semibold text-slate-800 mb-4">Remediation Roadmap</h2>
            <div className="space-y-4">
              {results.recommendations.map((rec, idx) => (
                <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${rec.priority === 'High' ? 'bg-red-100 text-red-700' : rec.priority === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{rec.priority} Priority</span>
                          <span className="text-xs text-slate-500">{rec.category}</span>
                        </div>
                        <h3 className="font-semibold text-slate-800">{rec.action}</h3>
                        <p className="text-sm text-teal-600 mt-1">{rec.impact}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm text-slate-500">Timeline</span>
                        <p className="font-medium text-slate-800">{rec.timeline}</p>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <p className="text-sm font-medium text-slate-600 mb-2">Implementation Steps:</p>
                      <ul className="grid md:grid-cols-2 gap-2">
                        {rec.details.map((detail, i) => (
                          <li key={i} className="text-sm text-slate-600 flex items-start gap-2"><span className="text-teal-500 mt-1">&bull;</span>{detail}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // WIZARD SCREEN
  // ============================================

  const inputCls = "w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all";
  const inputErrCls = "w-full px-4 py-2.5 border border-red-400 rounded-lg focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none transition-all bg-red-50/30";
  const selectCls = inputCls + " bg-white";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-emerald-50/20">
      {/* FIX 6: Saved state banner */}
      {savedBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-amber-800">You have a saved assessment in progress.</p>
            <div className="flex gap-2">
              <button onClick={handleRestoreSaved} className="px-4 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors font-medium">Continue</button>
              <button onClick={handleStartFresh} className="px-4 py-1.5 bg-white border border-slate-300 text-slate-700 text-sm rounded-lg hover:bg-slate-50 transition-colors font-medium">Start fresh</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-700 text-white py-8">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center"><TrendingUp className="w-5 h-5" /></div>
            <span className="text-teal-200 text-sm font-medium">Perennity</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Green Finance Compliance Assessment</h1>
          <p className="text-teal-100">Assess your data centre project against SFDR, UK SDR, and EU Taxonomy requirements</p>
        </div>
      </div>

      {/* FIX 2: 8-Step Progress Bar */}
      <div className="max-w-4xl mx-auto px-6 py-6">
        <StepProgress currentStep={currentStep} totalSteps={WIZARD_STEPS.length} steps={WIZARD_STEPS} />
      </div>

      {/* Form Content */}
      <div className="max-w-4xl mx-auto px-6 pb-12">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">

          {/* Step 0: Project */}
          {currentStep === 0 && (
            <FormStep title="Project" subtitle="Name and financing target" icon={Building2}>
              <div className="grid md:grid-cols-2 gap-6">
                <InputField label="Project Name" helper="Internal reference name for this assessment">
                  <input type="text" value={formData.projectName} onChange={e => updateField('projectName', e.target.value)} placeholder="e.g., Dubai DC Phase 2" className={inputCls} />
                </InputField>
                <InputField label="Target Financing Label" helper="Sustainability framework the project targets">
                  <select value={formData.targetFinancingLabel} onChange={e => updateField('targetFinancingLabel', e.target.value)} className={selectCls}>
                    <option value="">Select financing label...</option>
                    <optgroup label="EU Frameworks — Fund Level">
                      <option value="sfdr_article_8">SFDR Article 8 — promotes environmental/social characteristics</option>
                      <option value="sfdr_article_9">SFDR Article 9 — sustainable investment objective</option>
                    </optgroup>
                    <optgroup label="EU Taxonomy">
                      <option value="eu_taxonomy_8_1">EU Taxonomy aligned — Activity 8.1 (climate change mitigation)</option>
                    </optgroup>
                    <optgroup label="EU Bond Instruments">
                      <option value="eugbs">European Green Bond (EuGBS) — Regulation (EU) 2023/2631</option>
                      <option value="icma_green_bond">ICMA Green Bond Principles</option>
                      <option value="icma_slb">ICMA Sustainability-Linked Bond Principles</option>
                      <option value="icma_social_bond">ICMA Social Bond Principles</option>
                    </optgroup>
                    <optgroup label="UK Frameworks">
                      <option value="uk_sdr_focus">UK SDR — Sustainability Focus</option>
                      <option value="uk_sdr_improvers">UK SDR — Sustainability Improvers</option>
                      <option value="uk_sdr_impact">UK SDR — Sustainability Impact</option>
                      <option value="uk_sdr_mixed">UK SDR — Sustainability Mixed Goals</option>
                    </optgroup>
                    <optgroup label="Development Finance">
                      <option value="eib">EIB green finance</option>
                      <option value="ifc">IFC / World Bank green finance</option>
                      <option value="ebrd">EBRD green finance</option>
                      <option value="afdb">AfDB green finance</option>
                    </optgroup>
                  </select>
                </InputField>
              </div>
            </FormStep>
          )}

          {/* Step 1: Region */}
          {currentStep === 1 && (
            <FormStep title="Region" subtitle="Location and facility type" icon={Building2}>
              <div className="grid md:grid-cols-2 gap-6">
                <InputField label="Location" helper="Country where the facility will be located">
                  <select value={formData.country} onChange={e => updateField('country', e.target.value)} className={selectCls}>
                    <option value="">Select country...</option>
                    {MENA_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </InputField>
                <InputField label="Facility Type" helper="New build or existing data centre">
                  <select value={formData.facilityType} onChange={e => updateField('facilityType', e.target.value)} className={selectCls}>
                    <option value="">Select type...</option>
                    <option value="new">New Build</option>
                    <option value="existing">Existing Facility</option>
                  </select>
                </InputField>
              </div>
            </FormStep>
          )}

          {/* Step 2: Capacity */}
          {currentStep === 2 && (
            <FormStep title="Capacity" subtitle="Power and cooling infrastructure" icon={Zap}>
              <div className="grid md:grid-cols-2 gap-6">
                <InputField label="Power Capacity (MW)" helper="Total IT load capacity" error={validationErrors.powerCapacity}>
                  <input type="number" value={formData.powerCapacity} onChange={e => updateField('powerCapacity', e.target.value)} placeholder="e.g., 50" className={validationErrors.powerCapacity ? inputErrCls : inputCls} />
                </InputField>
                <InputField label="Cooling Technology" helper="Primary cooling system type">
                  <select value={formData.coolingType} onChange={e => updateField('coolingType', e.target.value)} className={selectCls}>
                    <option value="">Select technology...</option>
                    {COOLING_TECHNOLOGIES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </InputField>
              </div>
            </FormStep>
          )}

          {/* Step 3: Energy */}
          {currentStep === 3 && (
            <FormStep title="Energy" subtitle="PUE target" icon={Zap}>
              <div className="grid md:grid-cols-2 gap-6">
                <InputField label="Target PUE" tooltip={TOOLTIPS.pue} error={validationErrors.pueTarget}>
                  <input type="number" step="0.01" value={formData.pueTarget} onChange={e => updateField('pueTarget', e.target.value)} placeholder="e.g., 1.4" className={validationErrors.pueTarget ? inputErrCls : inputCls} />
                </InputField>
              </div>
              <div className="mt-6 p-4 bg-teal-50 rounded-lg border border-teal-100">
                <p className="text-sm text-teal-800"><strong>Tip:</strong> EU Taxonomy requires PUE &le;1.5 for substantial contribution. Best practice for new builds is &le;1.3.</p>
              </div>
            </FormStep>
          )}

          {/* Step 4: Water */}
          {currentStep === 4 && (
            <FormStep title="Water" subtitle="Water usage and CNDCP WUEmax assessment" icon={Droplets}>
              <div className="grid md:grid-cols-2 gap-6">
                <InputField label="Actual WUE (m\u00b3/MWh)" tooltip={TOOLTIPS.wue} error={validationErrors.wueMetric}>
                  <input type="number" step="0.01" value={formData.wueMetric} onChange={e => updateField('wueMetric', e.target.value)} placeholder="e.g., 0.5" className={validationErrors.wueMetric ? inputErrCls : inputCls} />
                </InputField>
                <InputField label="K1 — Climate Zone" helper="Cooling degree days above 21\u00b0C (CNDCP)">
                  <select value={formData.k1Climate} onChange={e => updateField('k1Climate', e.target.value)} className={selectCls}>
                    <option value="">Select climate zone...</option>
                    <option value="cold">Cold (&lt; 50 CDD above 21\u00b0C) — K1 = 1.0</option>
                    <option value="warm">Warm (&ge; 50 CDD above 21\u00b0C) — K1 = 1.1</option>
                  </select>
                </InputField>
                <InputField label="K2 — Water Stress Level" tooltip={TOOLTIPS.k2Stress}>
                  <select value={formData.k2Stress} onChange={e => updateField('k2Stress', e.target.value)} className={selectCls}>
                    <option value="">Select water stress level...</option>
                    <option value="low">Low stress (WEI+ &le; 10) — K2 = 5.0</option>
                    <option value="low_medium">Low-medium stress (WEI+ 11–20) — K2 = 4.0</option>
                    <option value="medium_high">Medium-high stress (WEI+ 21–40) — K2 = 2.5</option>
                    <option value="high">High stress (WEI+ &gt; 40) — K2 = 1.0</option>
                  </select>
                </InputField>
                <InputField label="K3 — Water Source Type" tooltip={TOOLTIPS.k3Water}>
                  <select value={formData.k3Water} onChange={e => updateField('k3Water', e.target.value)} className={selectCls}>
                    <option value="">Select water source...</option>
                    <option value="potable">Potable / fresh water — K3 = 1.0</option>
                    <option value="grey">Grey water — K3 = 3.0</option>
                    <option value="brackish">Brackish / sea water — K3 = 6.0</option>
                  </select>
                </InputField>
              </div>
              <div className="mt-6 space-y-4">
                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                  <input type="checkbox" checked={formData.waterRecycling} onChange={e => updateField('waterRecycling', e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                  <div><p className="font-medium text-slate-700">Water Recycling Program</p><p className="text-xs text-slate-500">Active greywater or condensate recycling</p></div>
                </label>
                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                  <input type="checkbox" checked={formData.alternativeWaterSource} onChange={e => updateField('alternativeWaterSource', e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                  <div><p className="font-medium text-slate-700">Alternative Water Source</p><p className="text-xs text-slate-500">Non-potable water (treated wastewater, seawater, etc.)</p></div>
                </label>
              </div>
              {formData.country && MENA_COUNTRIES.find(c => c.code === formData.country)?.waterStress === 'high' && (
                <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-sm text-amber-800"><strong>Water-Stressed Region:</strong> {MENA_COUNTRIES.find(c => c.code === formData.country)?.name} is classified as a high water-stress region. Stricter WUE targets apply.</p>
                </div>
              )}
            </FormStep>
          )}

          {/* Step 5: Renewables */}
          {currentStep === 5 && (
            <FormStep title="Renewables" subtitle="Renewable energy sourcing and source quality" icon={Zap}>
              <div className="grid md:grid-cols-2 gap-6">
                <InputField label="Renewable Energy %" tooltip={TOOLTIPS.renewablePercent} error={validationErrors.renewablePercent}>
                  <input type="number" value={formData.renewablePercent} onChange={e => updateField('renewablePercent', e.target.value)} placeholder="e.g., 80" className={validationErrors.renewablePercent ? inputErrCls : inputCls} />
                </InputField>
                <InputField label="Renewable Energy Source Type" tooltip={TOOLTIPS.renewableSourceTier}>
                  <select value={formData.renewableSourceTier} onChange={e => updateField('renewableSourceTier', e.target.value)} className={selectCls}>
                    <option value="">Select source type...</option>
                    <option value="1">Matched PPA with new-build generation / On-site generation (solar / wind)</option>
                    <option value="2">Guarantees of Origin (GOs) / Renewable Energy Certificates (RECs)</option>
                    <option value="3">Utility green tariff only</option>
                  </select>
                </InputField>
                <InputField label="Grid Electricity %" error={validationErrors.gridPercent}>
                  <input type="number" value={formData.gridPercent} onChange={e => updateField('gridPercent', e.target.value)} placeholder="e.g., 70" className={validationErrors.gridPercent ? inputErrCls : inputCls} />
                </InputField>
                <InputField label="On-site Generation %" error={validationErrors.onsiteGeneration}>
                  <input type="number" value={formData.onsiteGeneration} onChange={e => updateField('onsiteGeneration', e.target.value)} placeholder="e.g., 30" className={validationErrors.onsiteGeneration ? inputErrCls : inputCls} />
                </InputField>
              </div>
              <div className="mt-6 p-4 bg-teal-50 rounded-lg border border-teal-100">
                <p className="text-sm text-teal-800"><strong>Tip:</strong> For SFDR Article 9 classification, aim for &ge;75% renewable energy with Tier 1 sourcing (matched PPA or on-site).</p>
              </div>
            </FormStep>
          )}

          {/* Step 6: Governance */}
          {currentStep === 6 && (
            <FormStep title="Governance" subtitle="Climate risk, certifications, DNSH & social safeguards" icon={Shield}>
              <div className="space-y-6">
                <div className="space-y-3">
                  {[
                    { key: 'climateRiskAssessment', title: 'Climate Risk Assessment Completed', desc: 'TCFD-aligned physical and transition risk analysis' },
                    { key: 'heatResilience', title: 'Heat Resilience Planning', desc: 'Design considerations for extreme temperature scenarios' },
                    { key: 'transitionPlan', title: 'Net-Zero Transition Plan', desc: 'Documented decarbonization pathway with targets' },
                  ].map(item => (
                    <label key={item.key} className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors border border-slate-200">
                      <input type="checkbox" checked={formData[item.key]} onChange={e => updateField(item.key, e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                      <div><p className="font-medium text-slate-700">{item.title}</p><p className="text-xs text-slate-500">{item.desc}</p></div>
                    </label>
                  ))}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">Certifications (select all that apply)</label>
                  <div className="grid md:grid-cols-2 gap-2">
                    {CERTIFICATIONS.map(cert => (
                      <label key={cert.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border ${formData.certifications.includes(cert.id) ? 'bg-teal-50 border-teal-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
                        <input type="checkbox" checked={formData.certifications.includes(cert.id)} onChange={() => toggleCertification(cert.id)} className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                        <span className="text-sm text-slate-700">{cert.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">DNSH & Minimum Social Safeguards Checklist</label>
                  <div className="space-y-3">
                    {[
                      { key: 'dnshClimateVulnerability', title: 'Climate Vulnerability & Physical Risk Assessment', desc: 'Has a climate vulnerability and physical risk assessment been conducted for this site, including identification of physical climate risks per the IPCC risk taxonomy? (DNSH Objective 2 — Climate adaptation)' },
                      { key: 'dnshProtectedAreas', title: 'Site Outside Protected Areas', desc: 'Is the site located outside all of the following protected areas: Natura 2000 sites, UNESCO World Heritage Sites, Key Biodiversity Areas (KBAs), and primary forests? (DNSH Objective 6 — Biodiversity)' },
                      { key: 'dnshLowGwpRefrigerants', title: 'Low-GWP Refrigerants', desc: 'Does the cooling system use refrigerants with a Global Warming Potential (GWP) compliant with EU F-Gas Regulation (EU) 517/2014 (low-GWP refrigerants)? (DNSH Objective 5 — Pollution prevention)' },
                      { key: 'dnshWeeeCompliance', title: 'IT Equipment End-of-Life Plan (WEEE)', desc: 'Is there a documented IT equipment end-of-life plan compliant with the WEEE Directive (2012/19/EU)? (DNSH Objective 4 — Circular economy)' },
                      { key: 'dnshHumanRightsDueDiligence', title: 'Human Rights Due Diligence Policy', desc: 'Does the organisation have a human rights due diligence policy aligned to the UN Guiding Principles on Business and Human Rights (UNGPs) and OECD Guidelines for Multinational Enterprises? (Article 18 Minimum Social Safeguards — EU Taxonomy)' },
                      { key: 'dnshSupplyChainLabour', title: 'Supply Chain Labour Standards Policy', desc: 'Does the organisation have a supply chain labour standards policy? (Article 18 Minimum Social Safeguards)' },
                    ].map(item => (
                      <label key={item.key} className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors border border-slate-200">
                        <input type="checkbox" checked={formData[item.key]} onChange={e => updateField(item.key, e.target.checked)} className="w-5 h-5 mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                        <div><p className="font-medium text-slate-700">{item.title}</p><p className="text-xs text-slate-500">{item.desc}</p></div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </FormStep>
          )}

          {/* Step 7: Circular */}
          {currentStep === 7 && (
            <FormStep title="Circular Economy" subtitle="Waste management and resource efficiency" icon={Recycle}>
              <div className="grid md:grid-cols-2 gap-6">
                <InputField label="E-Waste Management Program">
                  <select value={formData.ewasteProgram} onChange={e => updateField('ewasteProgram', e.target.value)} className={selectCls}>
                    <option value="">Select level...</option>
                    <option value="none">No formal program</option>
                    <option value="basic">Basic recycling</option>
                    <option value="certified">Certified recycling partners (R2/e-Stewards)</option>
                    <option value="comprehensive">Comprehensive lifecycle management</option>
                  </select>
                </InputField>
                <InputField label="Server Refresh Cycle (years)" helper="Target server lifecycle before replacement">
                  <input type="number" value={formData.serverLifecycle} onChange={e => updateField('serverLifecycle', e.target.value)} placeholder="e.g., 5" className={inputCls} />
                </InputField>
              </div>
              <div className="mt-6 space-y-3">
                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                  <input type="checkbox" checked={formData.equipmentReuse} onChange={e => updateField('equipmentReuse', e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                  <div><p className="font-medium text-slate-700">Equipment Reuse Program</p><p className="text-xs text-slate-500">Refurbishment and resale of decommissioned equipment</p></div>
                </label>
                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                  <input type="checkbox" checked={formData.sustainableProcurement} onChange={e => updateField('sustainableProcurement', e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                  <div><p className="font-medium text-slate-700">Sustainable Procurement Policy</p><p className="text-xs text-slate-500">ESG criteria in supplier selection and contracts</p></div>
                </label>
              </div>
            </FormStep>
          )}

          {/* Navigation Buttons — FIX 3: block Next if errors */}
          <div className="flex justify-between mt-8 pt-6 border-t border-slate-200">
            <button onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))} disabled={currentStep === 0} className="flex items-center gap-2 px-5 py-2.5 text-slate-600 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="w-5 h-5" />Previous
            </button>
            {currentStep === WIZARD_STEPS.length - 1 ? (
              <button onClick={handleSubmit} disabled={hasErrors} className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-lg font-medium hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-500/25 disabled:opacity-50 disabled:cursor-not-allowed">
                Generate Assessment<CheckCircle className="w-5 h-5" />
              </button>
            ) : (
              <button onClick={() => setCurrentStep(prev => Math.min(WIZARD_STEPS.length - 1, prev + 1))} disabled={hasErrors} className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Next<ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
