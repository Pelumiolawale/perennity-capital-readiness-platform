import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronLeft, Download, CheckCircle, AlertTriangle, XCircle, Building2, Zap, Droplets, Recycle, ThermometerSun, Award, FileText, TrendingUp } from 'lucide-react';

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
    climateRisk: calculateClimateRiskScore(formData)
  };
  
  // Weighted overall score
  const weights = { energy: 0.35, water: 0.25, circularEconomy: 0.20, climateRisk: 0.20 };
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

function calculateEnergyScore(formData) {
  let score = 0;
  const gaps = [];
  const details = [];
  
  // PUE Assessment (40 points max)
  const pue = parseFloat(formData.pueTarget) || 1.8;
  if (pue <= 1.3) {
    score += 40;
    details.push({ metric: 'PUE', status: 'excellent', value: pue, message: 'Best-in-class efficiency' });
  } else if (pue <= 1.5) {
    score += 35;
    details.push({ metric: 'PUE', status: 'compliant', value: pue, message: 'EU Taxonomy compliant' });
  } else if (pue <= 1.6) {
    score += 25;
    gaps.push({ metric: 'PUE', gap: 'Above EU Taxonomy threshold of 1.5', severity: 'medium' });
    details.push({ metric: 'PUE', status: 'warning', value: pue, message: 'Above threshold' });
  } else {
    score += 10;
    gaps.push({ metric: 'PUE', gap: 'Significantly above industry standard', severity: 'high' });
    details.push({ metric: 'PUE', status: 'critical', value: pue, message: 'Requires improvement' });
  }
  
  // Renewable Energy Assessment (40 points max)
  const renewable = parseFloat(formData.renewablePercent) || 0;
  if (renewable >= 100) {
    score += 40;
    details.push({ metric: 'Renewable Energy', status: 'excellent', value: `${renewable}%`, message: '100% renewable' });
  } else if (renewable >= 75) {
    score += 32;
    details.push({ metric: 'Renewable Energy', status: 'compliant', value: `${renewable}%`, message: 'SFDR Article 9 eligible' });
  } else if (renewable >= 50) {
    score += 22;
    gaps.push({ metric: 'Renewable Energy', gap: 'Below 75% for Article 9 alignment', severity: 'medium' });
    details.push({ metric: 'Renewable Energy', status: 'warning', value: `${renewable}%`, message: 'Article 8 eligible' });
  } else {
    score += Math.max(5, renewable / 5);
    gaps.push({ metric: 'Renewable Energy', gap: 'Insufficient renewable energy sourcing', severity: 'high' });
    details.push({ metric: 'Renewable Energy', status: 'critical', value: `${renewable}%`, message: 'Below minimum threshold' });
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
  
  return { score: Math.min(100, score), gaps, details };
}

function calculateWaterScore(formData) {
  let score = 0;
  const gaps = [];
  const details = [];
  
  // WUE Assessment (50 points max)
  const wue = parseFloat(formData.wueMetric) || 2.0;
  const country = MENA_COUNTRIES.find(c => c.code === formData.country);
  const isWaterStressed = country?.waterStress === 'high';
  
  // Adjust thresholds for water-stressed regions
  const wueThreshold = isWaterStressed ? 0.5 : 0.8;
  
  if (wue <= 0.3) {
    score += 50;
    details.push({ metric: 'WUE', status: 'excellent', value: wue, message: 'Best-in-class water efficiency' });
  } else if (wue <= wueThreshold) {
    score += 40;
    details.push({ metric: 'WUE', status: 'compliant', value: wue, message: 'Meets regional targets' });
  } else if (wue <= 1.2) {
    score += 25;
    gaps.push({ metric: 'WUE', gap: `Above target for ${isWaterStressed ? 'water-stressed' : 'normal'} region`, severity: 'medium' });
    details.push({ metric: 'WUE', status: 'warning', value: wue, message: 'Improvement needed' });
  } else {
    score += 10;
    gaps.push({ metric: 'WUE', gap: 'Significant water efficiency concern', severity: 'high' });
    details.push({ metric: 'WUE', status: 'critical', value: wue, message: 'Critical improvement required' });
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
  
  return { score: Math.min(100, score), gaps, details };
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
  const dnshClimate = formData.climateRiskAssessment;
  const dnshWater = scores.water.score >= 60;
  const dnshCircular = scores.circularEconomy.score >= 50;
  const dnshPollution = true; // Assumed compliant
  const dnshBiodiversity = true; // Assumed compliant
  
  const allDnsh = dnshClimate && dnshWater && dnshCircular && dnshPollution && dnshBiodiversity;
  
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
      climate: { met: dnshClimate, label: 'Climate Change Adaptation' },
      water: { met: dnshWater, label: 'Water & Marine Resources' },
      circular: { met: dnshCircular, label: 'Circular Economy' },
      pollution: { met: dnshPollution, label: 'Pollution Prevention' },
      biodiversity: { met: dnshBiodiversity, label: 'Biodiversity' }
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
// PDF GENERATION (using basic HTML-to-PDF approach)
// ============================================

function generatePDFContent(formData, results) {
  const date = new Date().toLocaleDateString('en-GB', { 
    day: 'numeric', month: 'long', year: 'numeric' 
  });
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Compliance Gap Assessment Report</title>
  <style>
    @page { size: A4; margin: 2cm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1e293b; }
    .header { background: linear-gradient(135deg, #0f766e 0%, #064e3b 100%); color: white; padding: 40px; margin: -2cm -2cm 2cm -2cm; }
    .header h1 { margin: 0 0 10px 0; font-size: 28px; }
    .header p { margin: 0; opacity: 0.9; }
    .section { margin-bottom: 30px; page-break-inside: avoid; }
    .section h2 { color: #0f766e; border-bottom: 2px solid #0f766e; padding-bottom: 8px; }
    .score-box { display: inline-block; padding: 20px 40px; background: #f0fdf4; border-radius: 12px; text-align: center; margin: 20px 0; }
    .score-value { font-size: 48px; font-weight: bold; color: #0f766e; }
    .score-label { font-size: 14px; color: #64748b; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .card { background: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #0f766e; }
    .card h3 { margin: 0 0 10px 0; color: #0f766e; }
    .status-excellent { color: #059669; }
    .status-compliant { color: #0284c7; }
    .status-warning { color: #d97706; }
    .status-critical { color: #dc2626; }
    .table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    .table th { background: #f1f5f9; font-weight: 600; }
    .priority-high { background: #fef2f2; color: #dc2626; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .priority-medium { background: #fef3c7; color: #d97706; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .priority-low { background: #f0fdf4; color: #059669; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .classification-box { padding: 15px; border-radius: 8px; margin: 10px 0; }
    .article-9 { background: #d1fae5; border: 2px solid #059669; }
    .article-8 { background: #dbeafe; border: 2px solid #2563eb; }
    .article-6 { background: #f1f5f9; border: 2px solid #64748b; }
    .check { color: #059669; }
    .cross { color: #dc2626; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
    ul { margin: 10px 0; padding-left: 20px; }
    li { margin: 5px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Green Finance Compliance Gap Assessment</h1>
    <p>SFDR / UK SDR / EU Taxonomy Alignment Report</p>
    <p style="margin-top: 15px; font-size: 14px;">
      Project: ${formData.projectName || 'Data Centre Project'}<br>
      Location: ${MENA_COUNTRIES.find(c => c.code === formData.country)?.name || formData.country}<br>
      Generated: ${date}
    </p>
  </div>
  
  <div class="section">
    <h2>Executive Summary</h2>
    <div class="score-box">
      <div class="score-value">${results.overall}%</div>
      <div class="score-label">Overall Compliance Readiness</div>
    </div>
    <div class="grid">
      <div class="card">
        <h3>SFDR Classification</h3>
        <p><strong>${results.sfdr.classification}</strong> - ${results.sfdr.label}</p>
        <p style="font-size: 14px; color: #64748b;">${results.sfdr.description}</p>
      </div>
      <div class="card">
        <h3>EU Taxonomy Alignment</h3>
        <p><strong>${results.taxonomy.aligned ? '✓ Aligned' : '✗ Not Aligned'}</strong></p>
        <p style="font-size: 14px; color: #64748b;">
          ${results.taxonomy.aligned 
            ? 'Meets substantial contribution criteria and DNSH requirements' 
            : 'Gaps identified in technical screening criteria'}
        </p>
      </div>
    </div>
  </div>
  
  <div class="section">
    <h2>Category Breakdown</h2>
    <table class="table">
      <tr>
        <th>Category</th>
        <th>Score</th>
        <th>Status</th>
        <th>Key Gap</th>
      </tr>
      <tr>
        <td><strong>Energy Efficiency</strong></td>
        <td>${results.categories.energy.score}%</td>
        <td class="${results.categories.energy.score >= 70 ? 'status-compliant' : results.categories.energy.score >= 50 ? 'status-warning' : 'status-critical'}">
          ${results.categories.energy.score >= 70 ? 'Compliant' : results.categories.energy.score >= 50 ? 'Partial' : 'Non-Compliant'}
        </td>
        <td>${results.categories.energy.gaps[0]?.gap || 'No critical gaps'}</td>
      </tr>
      <tr>
        <td><strong>Water Management</strong></td>
        <td>${results.categories.water.score}%</td>
        <td class="${results.categories.water.score >= 70 ? 'status-compliant' : results.categories.water.score >= 50 ? 'status-warning' : 'status-critical'}">
          ${results.categories.water.score >= 70 ? 'Compliant' : results.categories.water.score >= 50 ? 'Partial' : 'Non-Compliant'}
        </td>
        <td>${results.categories.water.gaps[0]?.gap || 'No critical gaps'}</td>
      </tr>
      <tr>
        <td><strong>Circular Economy</strong></td>
        <td>${results.categories.circularEconomy.score}%</td>
        <td class="${results.categories.circularEconomy.score >= 70 ? 'status-compliant' : results.categories.circularEconomy.score >= 50 ? 'status-warning' : 'status-critical'}">
          ${results.categories.circularEconomy.score >= 70 ? 'Compliant' : results.categories.circularEconomy.score >= 50 ? 'Partial' : 'Non-Compliant'}
        </td>
        <td>${results.categories.circularEconomy.gaps[0]?.gap || 'No critical gaps'}</td>
      </tr>
      <tr>
        <td><strong>Climate Risk</strong></td>
        <td>${results.categories.climateRisk.score}%</td>
        <td class="${results.categories.climateRisk.score >= 70 ? 'status-compliant' : results.categories.climateRisk.score >= 50 ? 'status-warning' : 'status-critical'}">
          ${results.categories.climateRisk.score >= 70 ? 'Compliant' : results.categories.climateRisk.score >= 50 ? 'Partial' : 'Non-Compliant'}
        </td>
        <td>${results.categories.climateRisk.gaps[0]?.gap || 'No critical gaps'}</td>
      </tr>
    </table>
  </div>
  
  <div class="section">
    <h2>EU Taxonomy Technical Screening Criteria (Activity 8.1)</h2>
    <h3>Substantial Contribution to Climate Change Mitigation</h3>
    <table class="table">
      <tr>
        <th>Criterion</th>
        <th>Status</th>
      </tr>
      ${results.taxonomy.substantialContribution.criteria.map(c => `
        <tr>
          <td>${c.name}</td>
          <td>${c.met ? '<span class="check">✓ Met</span>' : '<span class="cross">✗ Not Met</span>'}</td>
        </tr>
      `).join('')}
    </table>
    
    <h3>Do No Significant Harm (DNSH)</h3>
    <table class="table">
      <tr>
        <th>Environmental Objective</th>
        <th>Status</th>
      </tr>
      ${Object.values(results.taxonomy.dnsh).map(d => `
        <tr>
          <td>${d.label}</td>
          <td>${d.met ? '<span class="check">✓ Compliant</span>' : '<span class="cross">✗ Gap Identified</span>'}</td>
        </tr>
      `).join('')}
    </table>
  </div>
  
  <div class="section">
    <h2>UK SDR Fund Label Eligibility</h2>
    <table class="table">
      <tr>
        <th>Label Category</th>
        <th>Eligibility</th>
        <th>Notes</th>
      </tr>
      ${results.sdr.map(s => `
        <tr>
          <td><strong>${s.label}</strong></td>
          <td>${s.eligible ? '<span class="check">✓ Eligible</span>' : '<span class="cross">✗ Not Eligible</span>'}</td>
          <td>${s.eligible ? s.description : s.gap}</td>
        </tr>
      `).join('')}
    </table>
  </div>
  
  <div class="section" style="page-break-before: always;">
    <h2>Remediation Roadmap</h2>
    ${results.recommendations.map(r => `
      <div class="card" style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0;">${r.action}</h3>
          <span class="priority-${r.priority.toLowerCase()}">${r.priority} Priority</span>
        </div>
        <p style="margin: 10px 0; color: #0f766e; font-weight: 500;">${r.impact}</p>
        <p style="margin: 5px 0; font-size: 14px;"><strong>Timeline:</strong> ${r.timeline}</p>
        <ul>
          ${r.details.map(d => `<li>${d}</li>`).join('')}
        </ul>
      </div>
    `).join('')}
  </div>
  
  <div class="section">
    <h2>Project Specifications Summary</h2>
    <table class="table">
      <tr><th>Parameter</th><th>Value</th></tr>
      <tr><td>Power Capacity</td><td>${formData.powerCapacity || 'N/A'} MW</td></tr>
      <tr><td>PUE Target</td><td>${formData.pueTarget || 'N/A'}</td></tr>
      <tr><td>Renewable Energy %</td><td>${formData.renewablePercent || '0'}%</td></tr>
      <tr><td>Cooling Technology</td><td>${COOLING_TECHNOLOGIES.find(c => c.id === formData.coolingType)?.name || 'N/A'}</td></tr>
      <tr><td>WUE Metric</td><td>${formData.wueMetric || 'N/A'} L/kWh</td></tr>
      <tr><td>Certifications</td><td>${(formData.certifications || []).map(c => CERTIFICATIONS.find(cert => cert.id === c)?.name).filter(Boolean).join(', ') || 'None'}</td></tr>
    </table>
  </div>
  
  <div class="footer">
    <p><strong>Disclaimer:</strong> This assessment is provided for informational purposes only and does not constitute legal, financial, or regulatory advice. 
    Actual compliance determinations should be made in consultation with qualified sustainability consultants and legal advisors.</p>
    <p>Generated by Perennity Compliance Assessment Tool | ${date}</p>
  </div>
</body>
</html>
  `;
}

// ============================================
// UI COMPONENTS
// ============================================

const StatusBadge = ({ status }) => {
  const styles = {
    excellent: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    compliant: 'bg-sky-100 text-sky-700 border-sky-200',
    warning: 'bg-amber-100 text-amber-700 border-amber-200',
    critical: 'bg-red-100 text-red-700 border-red-200'
  };
  
  const icons = {
    excellent: <CheckCircle className="w-4 h-4" />,
    compliant: <CheckCircle className="w-4 h-4" />,
    warning: <AlertTriangle className="w-4 h-4" />,
    critical: <XCircle className="w-4 h-4" />
  };
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status]}`}>
      {icons[status]}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const ProgressBar = ({ value, color = 'teal' }) => {
  const colorClasses = {
    teal: 'bg-teal-500',
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    gray: 'bg-gray-500'
  };
  
  const bgColor = value >= 70 ? 'teal' : value >= 50 ? 'amber' : 'red';
  
  return (
    <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
      <div 
        className={`h-full rounded-full transition-all duration-500 ${colorClasses[color] || colorClasses[bgColor]}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
};

const FormStep = ({ children, title, subtitle, icon: Icon }) => (
  <div className="space-y-6">
    <div className="flex items-center gap-4 pb-4 border-b border-slate-200">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white">
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-slate-800">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
    {children}
  </div>
);

const InputField = ({ label, helper, error, children }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-slate-700">{label}</label>
    {children}
    {helper && <p className="text-xs text-slate-500">{helper}</p>}
    {error && <p className="text-xs text-red-500">{error}</p>}
  </div>
);

// ============================================
// MAIN APPLICATION
// ============================================

export default function ComplianceAssessmentTool() {
  const [currentStep, setCurrentStep] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [formData, setFormData] = useState({
    projectName: '',
    country: '',
    powerCapacity: '',
    pueTarget: '',
    coolingType: '',
    renewablePercent: '',
    gridPercent: '',
    onsiteGeneration: '',
    wueMetric: '',
    waterRecycling: false,
    alternativeWaterSource: false,
    ewasteProgram: '',
    serverLifecycle: '',
    equipmentReuse: false,
    sustainableProcurement: false,
    climateRiskAssessment: false,
    heatResilience: false,
    transitionPlan: false,
    certifications: []
  });
  
  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  
  const toggleCertification = (certId) => {
    setFormData(prev => ({
      ...prev,
      certifications: prev.certifications.includes(certId)
        ? prev.certifications.filter(c => c !== certId)
        : [...prev.certifications, certId]
    }));
  };
  
  const results = useMemo(() => {
    if (!showResults) return null;
    return calculateComplianceScore(formData);
  }, [showResults, formData]);
  
  const steps = [
    { title: 'Project Basics', icon: Building2 },
    { title: 'Energy Profile', icon: Zap },
    { title: 'Water Management', icon: Droplets },
    { title: 'Circular Economy', icon: Recycle },
    { title: 'Climate & Governance', icon: ThermometerSun }
  ];
  
  const handleSubmit = () => {
    setShowResults(true);
  };
  
  const handleDownloadPDF = () => {
    const content = generatePDFContent(formData, results);
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-assessment-${formData.projectName || 'report'}-${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const handleReset = () => {
    setShowResults(false);
    setCurrentStep(0);
    setFormData({
      projectName: '',
      country: '',
      powerCapacity: '',
      pueTarget: '',
      coolingType: '',
      renewablePercent: '',
      gridPercent: '',
      onsiteGeneration: '',
      wueMetric: '',
      waterRecycling: false,
      alternativeWaterSource: false,
      ewasteProgram: '',
      serverLifecycle: '',
      equipmentReuse: false,
      sustainableProcurement: false,
      climateRiskAssessment: false,
      heatResilience: false,
      transitionPlan: false,
      certifications: []
    });
  };
  
  if (showResults && results) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-emerald-50/20">
        {/* Results Header */}
        <div className="bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-700 text-white">
          <div className="max-w-6xl mx-auto px-6 py-12">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-teal-200 text-sm font-medium mb-1">Assessment Complete</p>
                <h1 className="text-3xl font-bold">{formData.projectName || 'Data Centre Project'}</h1>
                <p className="text-teal-100 mt-1">
                  {MENA_COUNTRIES.find(c => c.code === formData.country)?.name || 'MENA Region'} • {formData.powerCapacity} MW
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  className="px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg font-medium transition-colors"
                >
                  New Assessment
                </button>
                <button
                  onClick={handleDownloadPDF}
                  className="px-5 py-2.5 bg-white text-teal-700 hover:bg-teal-50 rounded-lg font-medium flex items-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download Report
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Overall Score */}
        <div className="max-w-6xl mx-auto px-6 -mt-8">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
            <div className="grid md:grid-cols-3 gap-8">
              {/* Score Circle */}
              <div className="flex flex-col items-center justify-center">
                <div className="relative w-40 h-40">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="80" cy="80" r="70" fill="none" stroke="#e2e8f0" strokeWidth="12" />
                    <circle
                      cx="80" cy="80" r="70" fill="none"
                      stroke={results.overall >= 70 ? '#0d9488' : results.overall >= 50 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={`${results.overall * 4.4} 440`}
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-slate-800">{results.overall}%</span>
                    <span className="text-sm text-slate-500">Overall Score</span>
                  </div>
                </div>
              </div>
              
              {/* SFDR Classification */}
              <div className={`rounded-xl p-6 ${
                results.sfdr.classification === 'Article 9' ? 'bg-emerald-50 border-2 border-emerald-200' :
                results.sfdr.classification === 'Article 8' ? 'bg-blue-50 border-2 border-blue-200' :
                'bg-slate-50 border-2 border-slate-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className={`w-5 h-5 ${
                    results.sfdr.classification === 'Article 9' ? 'text-emerald-600' :
                    results.sfdr.classification === 'Article 8' ? 'text-blue-600' :
                    'text-slate-600'
                  }`} />
                  <span className="text-sm font-medium text-slate-600">SFDR Classification</span>
                </div>
                <p className={`text-2xl font-bold ${
                  results.sfdr.classification === 'Article 9' ? 'text-emerald-700' :
                  results.sfdr.classification === 'Article 8' ? 'text-blue-700' :
                  'text-slate-700'
                }`}>{results.sfdr.classification}</p>
                <p className="text-sm text-slate-600 mt-1">{results.sfdr.label}</p>
              </div>
              
              {/* EU Taxonomy */}
              <div className={`rounded-xl p-6 ${results.taxonomy.aligned ? 'bg-emerald-50 border-2 border-emerald-200' : 'bg-amber-50 border-2 border-amber-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Award className={`w-5 h-5 ${results.taxonomy.aligned ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <span className="text-sm font-medium text-slate-600">EU Taxonomy</span>
                </div>
                <p className={`text-2xl font-bold ${results.taxonomy.aligned ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {results.taxonomy.aligned ? 'Aligned' : 'Not Aligned'}
                </p>
                <p className="text-sm text-slate-600 mt-1">
                  {results.taxonomy.aligned ? 'Meets all criteria' : 'Gaps identified'}
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Category Breakdown */}
        <div className="max-w-6xl mx-auto px-6 py-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Category Performance</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { key: 'energy', label: 'Energy Efficiency', icon: Zap },
              { key: 'water', label: 'Water Management', icon: Droplets },
              { key: 'circularEconomy', label: 'Circular Economy', icon: Recycle },
              { key: 'climateRisk', label: 'Climate Risk', icon: ThermometerSun }
            ].map(({ key, label, icon: Icon }) => (
              <div key={key} className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    results.categories[key].score >= 70 ? 'bg-teal-100 text-teal-600' :
                    results.categories[key].score >= 50 ? 'bg-amber-100 text-amber-600' :
                    'bg-red-100 text-red-600'
                  }`}>
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
        
        {/* UK SDR Eligibility */}
        <div className="max-w-6xl mx-auto px-6 pb-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">UK SDR Fund Label Eligibility</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {results.sdr.map((label, idx) => (
              <div key={idx} className={`bg-white rounded-xl p-5 shadow-sm border-2 ${
                label.eligible ? 'border-emerald-200' : 'border-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-800">{label.label}</span>
                  {label.eligible ? (
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <p className="text-sm text-slate-600">
                  {label.eligible ? label.description : label.gap}
                </p>
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
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          rec.priority === 'High' ? 'bg-red-100 text-red-700' :
                          rec.priority === 'Medium' ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>{rec.priority} Priority</span>
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
                        <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                          <span className="text-teal-500 mt-1">•</span>
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-emerald-50/20">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-700 text-white py-8">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <span className="text-teal-200 text-sm font-medium">Perennity</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Green Finance Compliance Assessment</h1>
          <p className="text-teal-100">
            Assess your data centre project against SFDR, UK SDR, and EU Taxonomy requirements
          </p>
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-2">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-center">
              <button
                onClick={() => setCurrentStep(idx)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  idx === currentStep
                    ? 'bg-teal-600 text-white shadow-lg'
                    : idx < currentStep
                    ? 'bg-teal-500 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {idx < currentStep ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <step.icon className="w-5 h-5" />
                )}
              </button>
              {idx < steps.length - 1 && (
                <div className={`w-16 h-1 mx-2 rounded ${
                  idx < currentStep ? 'bg-teal-500' : 'bg-slate-200'
                }`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-slate-500 px-2">
          {steps.map((step, idx) => (
            <span key={idx} className={idx === currentStep ? 'text-teal-600 font-medium' : ''}>
              {step.title}
            </span>
          ))}
        </div>
      </div>
      
      {/* Form Content */}
      <div className="max-w-4xl mx-auto px-6 pb-12">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
          {currentStep === 0 && (
            <FormStep title="Project Basics" subtitle="Tell us about your data centre project" icon={Building2}>
              <div className="grid md:grid-cols-2 gap-6">
                <InputField label="Project Name" helper="Internal reference name for this assessment">
                  <input
                    type="text"
                    value={formData.projectName}
                    onChange={e => updateField('projectName', e.target.value)}
                    placeholder="e.g., Dubai DC Phase 2"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                  />
                </InputField>
                
                <InputField label="Location" helper="Country where the facility will be located">
                  <select
                    value={formData.country}
                    onChange={e => updateField('country', e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all bg-white"
                  >
                    <option value="">Select country...</option>
                    {MENA_COUNTRIES.map(c => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </InputField>
                
                <InputField label="Power Capacity (MW)" helper="Total IT load capacity">
                  <input
                    type="number"
                    value={formData.powerCapacity}
                    onChange={e => updateField('powerCapacity', e.target.value)}
                    placeholder="e.g., 50"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                  />
                </InputField>
                
                <InputField label="Cooling Technology" helper="Primary cooling system type">
                  <select
                    value={formData.coolingType}
                    onChange={e => updateField('coolingType', e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all bg-white"
                  >
                    <option value="">Select technology...</option>
                    {COOLING_TECHNOLOGIES.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </InputField>
              </div>
            </FormStep>
          )}
          
          {currentStep === 1 && (
            <FormStep title="Energy Profile" subtitle="Energy efficiency and renewable sourcing" icon={Zap}>
              <div className="grid md:grid-cols-2 gap-6">
                <InputField label="Target PUE" helper="Power Usage Effectiveness (EU Taxonomy requires ≤1.5)">
                  <input
                    type="number"
                    step="0.01"
                    value={formData.pueTarget}
                    onChange={e => updateField('pueTarget', e.target.value)}
                    placeholder="e.g., 1.4"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                  />
                </InputField>
                
                <InputField label="Renewable Energy %" helper="Percentage from renewable sources (SFDR Art 9 requires ≥75%)">
                  <input
                    type="number"
                    value={formData.renewablePercent}
                    onChange={e => updateField('renewablePercent', e.target.value)}
                    placeholder="e.g., 80"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                  />
                </InputField>
                
                <InputField label="Grid Electricity %" helper="Percentage from grid electricity">
                  <input
                    type="number"
                    value={formData.gridPercent}
                    onChange={e => updateField('gridPercent', e.target.value)}
                    placeholder="e.g., 70"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                  />
                </InputField>
                
                <InputField label="On-site Generation %" helper="Percentage from on-site renewable generation">
                  <input
                    type="number"
                    value={formData.onsiteGeneration}
                    onChange={e => updateField('onsiteGeneration', e.target.value)}
                    placeholder="e.g., 30"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                  />
                </InputField>
              </div>
              
              <div className="mt-6 p-4 bg-teal-50 rounded-lg border border-teal-100">
                <p className="text-sm text-teal-800">
                  <strong>Tip:</strong> For SFDR Article 9 classification, aim for ≥75% renewable energy and PUE ≤1.5. 
                  Consider Power Purchase Agreements (PPAs) with regional solar providers.
                </p>
              </div>
            </FormStep>
          )}
          
          {currentStep === 2 && (
            <FormStep title="Water Management" subtitle="Water usage and efficiency metrics" icon={Droplets}>
              <div className="grid md:grid-cols-2 gap-6">
                <InputField label="WUE (L/kWh)" helper="Water Usage Effectiveness - liters per kWh of IT load">
                  <input
                    type="number"
                    step="0.1"
                    value={formData.wueMetric}
                    onChange={e => updateField('wueMetric', e.target.value)}
                    placeholder="e.g., 0.5"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                  />
                </InputField>
                
                <div className="space-y-4">
                  <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.waterRecycling}
                      onChange={e => updateField('waterRecycling', e.target.checked)}
                      className="w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <p className="font-medium text-slate-700">Water Recycling Program</p>
                      <p className="text-xs text-slate-500">Active greywater or condensate recycling</p>
                    </div>
                  </label>
                  
                  <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.alternativeWaterSource}
                      onChange={e => updateField('alternativeWaterSource', e.target.checked)}
                      className="w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <p className="font-medium text-slate-700">Alternative Water Source</p>
                      <p className="text-xs text-slate-500">Non-potable water (treated wastewater, seawater, etc.)</p>
                    </div>
                  </label>
                </div>
              </div>
              
              {formData.country && MENA_COUNTRIES.find(c => c.code === formData.country)?.waterStress === 'high' && (
                <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-sm text-amber-800">
                    <strong>⚠️ Water-Stressed Region:</strong> {MENA_COUNTRIES.find(c => c.code === formData.country)?.name} is classified as 
                    a high water-stress region. Stricter WUE targets apply (≤0.5 L/kWh recommended).
                  </p>
                </div>
              )}
            </FormStep>
          )}
          
          {currentStep === 3 && (
            <FormStep title="Circular Economy" subtitle="Waste management and resource efficiency" icon={Recycle}>
              <div className="grid md:grid-cols-2 gap-6">
                <InputField label="E-Waste Management Program">
                  <select
                    value={formData.ewasteProgram}
                    onChange={e => updateField('ewasteProgram', e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all bg-white"
                  >
                    <option value="">Select level...</option>
                    <option value="none">No formal program</option>
                    <option value="basic">Basic recycling</option>
                    <option value="certified">Certified recycling partners (R2/e-Stewards)</option>
                    <option value="comprehensive">Comprehensive lifecycle management</option>
                  </select>
                </InputField>
                
                <InputField label="Server Refresh Cycle (years)" helper="Target server lifecycle before replacement">
                  <input
                    type="number"
                    value={formData.serverLifecycle}
                    onChange={e => updateField('serverLifecycle', e.target.value)}
                    placeholder="e.g., 5"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                  />
                </InputField>
              </div>
              
              <div className="mt-6 space-y-3">
                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.equipmentReuse}
                    onChange={e => updateField('equipmentReuse', e.target.checked)}
                    className="w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <p className="font-medium text-slate-700">Equipment Reuse Program</p>
                    <p className="text-xs text-slate-500">Refurbishment and resale of decommissioned equipment</p>
                  </div>
                </label>
                
                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.sustainableProcurement}
                    onChange={e => updateField('sustainableProcurement', e.target.checked)}
                    className="w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <p className="font-medium text-slate-700">Sustainable Procurement Policy</p>
                    <p className="text-xs text-slate-500">ESG criteria in supplier selection and contracts</p>
                  </div>
                </label>
              </div>
            </FormStep>
          )}
          
          {currentStep === 4 && (
            <FormStep title="Climate & Governance" subtitle="Risk management and certifications" icon={ThermometerSun}>
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors border border-slate-200">
                    <input
                      type="checkbox"
                      checked={formData.climateRiskAssessment}
                      onChange={e => updateField('climateRiskAssessment', e.target.checked)}
                      className="w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <p className="font-medium text-slate-700">Climate Risk Assessment Completed</p>
                      <p className="text-xs text-slate-500">TCFD-aligned physical and transition risk analysis</p>
                    </div>
                  </label>
                  
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors border border-slate-200">
                    <input
                      type="checkbox"
                      checked={formData.heatResilience}
                      onChange={e => updateField('heatResilience', e.target.checked)}
                      className="w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <p className="font-medium text-slate-700">Heat Resilience Planning</p>
                      <p className="text-xs text-slate-500">Design considerations for extreme temperature scenarios</p>
                    </div>
                  </label>
                  
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors border border-slate-200">
                    <input
                      type="checkbox"
                      checked={formData.transitionPlan}
                      onChange={e => updateField('transitionPlan', e.target.checked)}
                      className="w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <p className="font-medium text-slate-700">Net-Zero Transition Plan</p>
                      <p className="text-xs text-slate-500">Documented decarbonization pathway with targets</p>
                    </div>
                  </label>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">Certifications (select all that apply)</label>
                  <div className="grid md:grid-cols-2 gap-2">
                    {CERTIFICATIONS.map(cert => (
                      <label
                        key={cert.id}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border ${
                          formData.certifications.includes(cert.id)
                            ? 'bg-teal-50 border-teal-300'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.certifications.includes(cert.id)}
                          onChange={() => toggleCertification(cert.id)}
                          className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span className="text-sm text-slate-700">{cert.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </FormStep>
          )}
          
          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8 pt-6 border-t border-slate-200">
            <button
              onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
              disabled={currentStep === 0}
              className="flex items-center gap-2 px-5 py-2.5 text-slate-600 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
              Previous
            </button>
            
            {currentStep === steps.length - 1 ? (
              <button
                onClick={handleSubmit}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-lg font-medium hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-500/25"
              >
                Generate Assessment
                <CheckCircle className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={() => setCurrentStep(prev => Math.min(steps.length - 1, prev + 1))}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors"
              >
                Next
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
