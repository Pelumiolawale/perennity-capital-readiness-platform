// ============================================
// GAP IDENTIFICATION & RECOMMENDATIONS
// ============================================

const REMEDIATION_MONTHS = {
  'PUE': 9,
  'Renewable Energy': 4,
  'TCFD': 3,
  'Heat Resilience': 6,
  'Transition Plan': 3,
  'E-waste': 4,
  'Server Lifecycle': 12,
  'Procurement': 2,
  'WUE': 15,
  'Cooling Technology': 18,
  'Water Recycling': 9,
  'Certifications': 6
};

const COST_OF_DELAY = {
  high: 'Blocks EU Taxonomy alignment and SFDR Article 8/9 classification',
  medium: 'Reduces score and may prevent SDR label eligibility',
  low: 'Minor score impact, beneficial for best-practice reporting'
};

export function identifyGaps(scores, formData) {
  const allGaps = [];
  Object.entries(scores).forEach(([category, data]) => {
    data.gaps.forEach(gap => {
      const months = REMEDIATION_MONTHS[gap.metric] || 6;
      const severityWeight = { high: 3, medium: 2, low: 1 }[gap.severity] || 1;
      const impact = gap.impactOnScore || 10;
      const priorityScore = (severityWeight * impact) / months;

      allGaps.push({
        ...gap,
        category,
        remediationMonths: months,
        costOfDelay: COST_OF_DELAY[gap.severity],
        priorityScore
      });
    });
  });

  return allGaps.sort((a, b) => b.priorityScore - a.priorityScore);
}

export function generateRecommendations(scores, formData) {
  const recommendations = [];

  // Energy: PUE
  const pue = parseFloat(formData.pueTarget) || 1.8;
  const isNewBuild = formData.isNewBuild !== false;
  const pueThreshold = isNewBuild ? 1.5 : 1.8;
  if (pue > pueThreshold) {
    recommendations.push({
      category: 'Energy',
      priority: pue > 1.6 ? 'High' : 'Medium',
      action: `Reduce PUE to ≤${pueThreshold}`,
      impact: 'Required for EU Taxonomy substantial contribution',
      timeline: '6-12 months',
      details: [
        'Implement hot/cold aisle containment',
        'Upgrade to variable speed drives on cooling equipment',
        'Deploy AI-based cooling optimisation',
        'Increase temperature setpoints to ASHRAE A2 range'
      ]
    });
  }

  // Energy: Renewables
  const renewable = parseFloat(formData.renewablePercent) || 0;
  if (renewable < 75) {
    recommendations.push({
      category: 'Energy',
      priority: renewable < 50 ? 'High' : 'Medium',
      action: 'Increase renewable energy to ≥75%',
      impact: 'Required for SFDR Article 9 classification',
      timeline: '3-6 months',
      details: [
        'Negotiate direct-wire PPAs with regional solar generators',
        'Source REGOs/GOs for remaining grid consumption',
        'Evaluate on-site solar PV installation feasibility',
        'Consider virtual PPAs for price hedging — note: EAC/GO-only may not satisfy Article 9 additionality'
      ]
    });
  }

  // Water: WUE
  const wue = parseFloat(formData.wueMetric) || 2.0;
  if (wue > 0.8) {
    recommendations.push({
      category: 'Water',
      priority: 'Medium',
      action: 'Reduce WUE below CNDCP target',
      impact: 'Critical for MENA water-stressed regions and EU Taxonomy DNSH compliance',
      timeline: '12-18 months',
      details: [
        'Transition to air-cooled or direct liquid cooling systems',
        'Implement cooling tower water recycling programme',
        'Explore treated wastewater or seawater as cooling make-up',
        'Install advanced water metering and leak detection'
      ]
    });
  }

  // EU CoC
  if (!formData.certifications?.includes('eu_coc')) {
    recommendations.push({
      category: 'Governance',
      priority: 'High',
      action: 'Implement EU Code of Conduct for Data Centres',
      impact: 'Mandatory for EU Taxonomy substantial contribution alignment',
      timeline: '3-6 months',
      details: [
        'Self-assess against EU CoC best practices catalogue',
        'Engage independent third-party auditor',
        'Register as EU CoC Participant on EC portal',
        'Establish continuous improvement process with KPIs'
      ]
    });
  }

  // TCFD / Climate Risk
  const tcfdComplete = formData.tcfdGovernance && formData.tcfdStrategy && formData.tcfdRiskManagement && formData.tcfdMetrics && formData.climateRiskAssessment;
  if (!tcfdComplete) {
    recommendations.push({
      category: 'Climate Risk',
      priority: 'High',
      action: 'Complete TCFD-aligned climate risk assessment (all 5 pillars)',
      impact: 'Required for SFDR PAI disclosure, EU Taxonomy DNSH, and UK SDR Impact label',
      timeline: '2-4 months',
      details: [
        'Conduct physical risk analysis (heat stress, water scarcity, extreme weather) using IPCC scenarios',
        'Assess transition risks (carbon pricing, policy changes, stranded asset risk)',
        'Develop multi-scenario analysis (1.5°C, 2°C, 3°C pathways)',
        'Integrate TCFD findings into board-level governance and disclosures'
      ]
    });
  }

  // DNSH gaps — Pollution and Biodiversity
  if (!formData.pollutionPrevention || formData.pollutionPrevention === 'none') {
    recommendations.push({
      category: 'DNSH',
      priority: 'Medium',
      action: 'Establish pollution prevention programme',
      impact: 'Required for EU Taxonomy DNSH compliance on Pollution Prevention',
      timeline: '2-3 months',
      details: [
        'Implement refrigerant management programme (HFC/HFO leak detection)',
        'Conduct emissions monitoring for diesel backup generators',
        'Document chemical storage and spill prevention controls',
        'Report to local environmental regulator'
      ]
    });
  }

  if (!formData.biodiversityAssessment) {
    recommendations.push({
      category: 'DNSH',
      priority: 'Low',
      action: 'Conduct biodiversity impact assessment',
      impact: 'Required for EU Taxonomy DNSH compliance on Biodiversity & Ecosystems',
      timeline: '1-2 months',
      details: [
        'Assess land-use change and habitat impact at site',
        'Review light pollution controls for nocturnal wildlife',
        'Document water abstraction effects on local water bodies',
        'Consider Green Building certification with biodiversity credits'
      ]
    });
  }

  // E-waste
  if (!formData.ewasteProgram || formData.ewasteProgram === 'none') {
    recommendations.push({
      category: 'Circular Economy',
      priority: 'Medium',
      action: 'Establish certified e-waste management programme',
      impact: 'Required for DNSH to circular economy objective and ESRS E5',
      timeline: '3-6 months',
      details: [
        'Partner with R2/e-Stewards certified recyclers',
        'Implement asset tracking and disposal chain-of-custody',
        'Establish equipment refurbishment and resale programme',
        'Report e-waste metrics in CSRD sustainability disclosures'
      ]
    });
  }

  return recommendations;
}
