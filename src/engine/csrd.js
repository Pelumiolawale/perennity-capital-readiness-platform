// ============================================
// CSRD READINESS ASSESSMENT
// Covers ESRS E1 (Climate), E3 (Water), E5 (Circular Economy)
// ============================================

export function assessCsrdReadiness(formData) {
  const e1 = assessEsrsE1(formData);
  const e3 = assessEsrsE3(formData);
  const e5 = assessEsrsE5(formData);

  const overallScore = Math.round((e1.score + e3.score + e5.score) / 3);

  return {
    esrsE1: e1,
    esrsE3: e3,
    esrsE5: e5,
    overallScore,
    label: csrdReadinessLabel(overallScore)
  };

  function csrdReadinessLabel(score) {
    if (score >= 80) return 'CSRD Ready';
    if (score >= 60) return 'Partial Readiness';
    if (score >= 40) return 'Gaps Identified';
    return 'Significant Gaps';
  }

  function assessEsrsE1(fd) {
    // Climate: GHG data, energy data, SBTi/transition plan
    let score = 0;
    const gaps = [];

    if (fd.scope1Emissions) { score += 20; }
    else { gaps.push('Scope 1 GHG data missing'); }

    if (fd.scope2EmissionsMarket) { score += 20; }
    else { gaps.push('Scope 2 (market-based) GHG data missing'); }

    if (fd.scope2EmissionsLocation) { score += 10; }
    else { gaps.push('Scope 2 (location-based) GHG data missing'); }

    if (fd.totalEnergyMwh) { score += 20; }
    else { gaps.push('Total energy consumption (MWh) not provided'); }

    if (fd.transitionPlan) { score += 20; }
    else { gaps.push('No net-zero transition plan'); }

    if (fd.tcfdMetrics) { score += 10; }
    else { gaps.push('GHG metrics and targets not formally tracked'); }

    return { score: Math.min(100, score), gaps, standard: 'ESRS E1 — Climate Change' };
  }

  function assessEsrsE3(fd) {
    // Water: withdrawal data, water stress assessment
    let score = 0;
    const gaps = [];

    if (fd.waterWithdrawal) { score += 40; }
    else { gaps.push('Annual water withdrawal (m³) not provided'); }

    if (fd.climateRiskAssessment || fd.tcfdRiskManagement) { score += 30; }
    else { gaps.push('Water stress / physical risk assessment not conducted'); }

    if (fd.waterRecycling) { score += 15; }
    if (fd.alternativeWaterSource) { score += 15; }

    return { score: Math.min(100, score), gaps, standard: 'ESRS E3 — Water and Marine Resources' };
  }

  function assessEsrsE5(fd) {
    // Circular economy: waste data, recovery rate
    let score = 0;
    const gaps = [];

    if (fd.wasteGenerated) { score += 30; }
    else { gaps.push('Total waste generated (tonnes) not provided'); }

    if (fd.wasteRecoveryRate) { score += 30; }
    else { gaps.push('Waste recovery rate (%) not provided'); }

    if (fd.ewasteProgram && fd.ewasteProgram !== 'none') { score += 25; }
    else { gaps.push('No formal e-waste management programme'); }

    if (fd.equipmentReuse) { score += 15; }

    return { score: Math.min(100, score), gaps, standard: 'ESRS E5 — Resource Use and Circular Economy' };
  }
}
