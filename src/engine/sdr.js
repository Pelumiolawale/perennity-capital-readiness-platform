import { REGULATORY_THRESHOLDS } from '../constants/regulatoryData.js';

// Uses correct weighted overall score (35/25/20/20)
export function determineSdrEligibility(scores, formData) {
  const weights = { energy: 0.35, water: 0.25, circularEconomy: 0.20, climateRisk: 0.20 };
  const overallScore = Object.entries(scores).reduce(
    (acc, [key, val]) => acc + val.score * weights[key], 0
  );

  const renewable = parseFloat(formData.renewablePercent) || 0;
  const { sustainabilityFocus, sustainabilityImprovers, sustainabilityImpact } = REGULATORY_THRESHOLDS.ukSdr;

  const results = [];

  // Sustainability Focus: assets meeting a credible standard of environmental sustainability
  if (overallScore >= sustainabilityFocus.minScore && renewable >= sustainabilityFocus.renewableMin) {
    results.push({
      label: 'Sustainability Focus',
      eligible: true,
      description: 'Assets meeting a credible standard of environmental sustainability'
    });
  } else {
    const gaps = [];
    if (overallScore < sustainabilityFocus.minScore)
      gaps.push(`overall score ≥${sustainabilityFocus.minScore}% (current: ${Math.round(overallScore)}%)`);
    if (renewable < sustainabilityFocus.renewableMin)
      gaps.push(`renewable energy ≥${sustainabilityFocus.renewableMin}% (current: ${renewable}%)`);
    results.push({
      label: 'Sustainability Focus',
      eligible: false,
      gap: `Requires ${gaps.join(' and ')}`
    });
  }

  // Sustainability Improvers: assets with potential to improve sustainability over time
  if (overallScore >= sustainabilityImprovers.minScore && formData.transitionPlan) {
    results.push({
      label: 'Sustainability Improvers',
      eligible: true,
      description: 'Assets with a credible improvement pathway to a more sustainable state'
    });
  } else {
    const gaps = [];
    if (overallScore < sustainabilityImprovers.minScore)
      gaps.push(`overall score ≥${sustainabilityImprovers.minScore}%`);
    if (!formData.transitionPlan)
      gaps.push('net-zero transition plan');
    results.push({
      label: 'Sustainability Improvers',
      eligible: false,
      gap: `Requires ${gaps.join(' and ')}`
    });
  }

  // Sustainability Impact: achieves pre-defined positive environmental impact
  const hasTcfd = formData.climateRiskAssessment || (formData.tcfdGovernance && formData.tcfdStrategy);
  if (overallScore >= sustainabilityImpact.minScore && hasTcfd) {
    results.push({
      label: 'Sustainability Impact',
      eligible: true,
      description: 'Achieves pre-defined positive environmental impact with measurable outcomes'
    });
  } else {
    const gaps = [];
    if (overallScore < sustainabilityImpact.minScore)
      gaps.push(`overall score ≥${sustainabilityImpact.minScore}%`);
    if (!hasTcfd)
      gaps.push('TCFD-aligned climate risk assessment');
    results.push({
      label: 'Sustainability Impact',
      eligible: false,
      gap: `Requires ${gaps.join(' and ')}`
    });
  }

  return results;
}
