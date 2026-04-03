// ============================================
// TOOLTIP HELP CONTENT FOR ALL FORM METRICS
// ============================================

export const METRIC_HELP = {
  pueTarget: {
    title: 'Power Usage Effectiveness (PUE)',
    description: 'Ratio of total facility power to IT equipment power. PUE of 1.0 means 100% of power goes to IT — no overhead. Lower is better.',
    citation: 'EU Taxonomy DA 2021/2139, Annex I, Activity 8.1, Section 1.1',
    threshold: 'New builds must achieve PUE ≤1.5 for EU Taxonomy compliance. Target ≤1.4 from 2027.',
    formula: 'PUE = Total Facility Power ÷ IT Equipment Power'
  },
  renewablePercent: {
    title: 'Renewable Energy Percentage',
    description: 'Percentage of total electricity consumption sourced from renewable generators — via on-site generation, direct-wire PPAs, virtual PPAs, or EAC/GO purchases.',
    citation: 'SFDR PAI Indicator 7 (renewable energy share)',
    threshold: '≥75% for SFDR Article 9. ≥50% for SFDR Article 8. Note: EAC/GO-only sourcing may not satisfy additionality requirements for Article 9.',
  },
  gridPercent: {
    title: 'Grid Electricity Percentage',
    description: 'Percentage of power drawn from the public electricity grid. Relevant for carbon intensity calculations under GHG Protocol Scope 2.',
  },
  onsiteGeneration: {
    title: 'On-site Generation Percentage',
    description: 'Percentage of power generated on-site from renewable sources (e.g. rooftop solar PV, wind turbines). On-site generation typically satisfies SFDR additionality requirements better than EACs alone.',
  },
  wueMetric: {
    title: 'Water Usage Effectiveness (WUE)',
    description: 'Litres of water consumed per kWh of IT load. Calculated using the CNDCP formula which adjusts targets by climate zone and cooling technology.',
    citation: 'EU Taxonomy DA 2021/2139, Annex I, Activity 8.1, DNSH Section 3; CNDCP Best Practice Guidelines',
    threshold: 'Calculated target varies by climate zone and cooling technology. In MENA hot-arid climates, air-cooled systems: target ≈0.14 L/kWh.',
    formula: 'WUEmax = 0.4 × K1(climate zone) × K2(cooling type) × K3(recycled water fraction)'
  },
  waterRecycling: {
    title: 'Water Recycling Program',
    description: 'Active program for recycling greywater, condensate from cooling, or other on-site water for non-potable uses such as cooling tower make-up water.',
    citation: 'CNDCP Best Practice Guidelines, Section 4.3',
  },
  alternativeWaterSource: {
    title: 'Alternative Water Source',
    description: 'Use of non-potable water sources such as treated municipal wastewater, seawater (for coastal facilities), harvested rainwater, or industrial effluent treated to cooling quality standards.',
    citation: 'EU Taxonomy DA 2021/2139, Annex I, Activity 8.1, DNSH on Water Resources'
  },
  recycledWaterLevel: {
    title: 'Recycled Water Fraction',
    description: 'Proportion of total cooling water consumption that comes from recycled or alternative sources. Higher recycled fraction reduces the CNDCP WUE target.',
  },
  ewasteProgram: {
    title: 'E-waste Management Program',
    description: 'Formal program for responsible disposal and recycling of decommissioned IT equipment. Certified programs (R2, e-Stewards) provide documented chain of custody.',
    citation: 'EU Taxonomy DA 2021/2139, Annex I, Activity 8.1, DNSH on Circular Economy',
    threshold: 'A minimum of a basic recycling program is required for DNSH compliance. Comprehensive lifecycle management is required for EU Taxonomy full alignment.'
  },
  serverLifecycle: {
    title: 'Server Refresh Cycle',
    description: 'Target operational lifetime (years) for server hardware before replacement. Longer lifecycles reduce e-waste volume and embodied carbon from manufacturing.',
    citation: 'ESRS E5 (Resource use and circular economy)',
    threshold: '≥5 years is best practice. ≥4 years is compliant. <4 years indicates high e-waste risk.'
  },
  climateRiskAssessment: {
    title: 'Climate Risk Assessment',
    description: 'A TCFD-aligned formal assessment of both physical climate risks (heat, flooding, water scarcity) and transition risks (carbon pricing, policy changes, stranded assets) affecting the facility.',
    citation: 'TCFD Recommendations (2017); EU Taxonomy DA 2021/2139, Annex I, Activity 8.1, DNSH on Climate Adaptation',
    threshold: 'Required for EU Taxonomy DNSH compliance and SFDR PAI disclosure. Also required for UK SDR Sustainability Impact label.'
  },
  heatResilience: {
    title: 'Heat Resilience Planning',
    description: 'Engineering and operational plans to maintain uptime and cooling efficiency during extreme heat events, including design for higher ambient temperatures, redundant cooling, and wet-bulb temperature thresholds.',
    citation: 'EU Taxonomy DA 2021/2139, Annex I, Activity 8.1, DNSH on Climate Adaptation'
  },
  transitionPlan: {
    title: 'Net-Zero Transition Plan',
    description: 'A documented pathway to net-zero greenhouse gas emissions with interim targets, investment plans, and governance accountability. Aligned to Science-Based Targets initiative (SBTi) is best practice.',
    citation: 'ESRS E1 (Climate change); UK SDR Sustainability Improvers label requirement',
    threshold: 'Required for UK SDR Sustainability Improvers label eligibility.'
  },
  pollutionPrevention: {
    title: 'Pollution Prevention Program',
    description: 'Measures to prevent and monitor pollution from facility operations — refrigerant management (HFC/HFO), diesel generator emissions, chemical storage, noise pollution controls.',
    citation: 'EU Taxonomy DA 2021/2139, Annex I, Activity 8.1, DNSH on Pollution Prevention'
  },
  biodiversityAssessment: {
    title: 'Biodiversity Impact Assessment',
    description: 'Assessment of the facility\'s impact on local biodiversity, including land-use change, light pollution, and water abstraction effects on local ecosystems.',
    citation: 'EU Taxonomy DA 2021/2139, Annex I, Activity 8.1, DNSH on Biodiversity'
  },
  scope1Emissions: {
    title: 'Scope 1 GHG Emissions',
    description: 'Direct greenhouse gas emissions from sources owned or controlled by the facility — diesel backup generators, refrigerant leaks (F-gases), on-site fuel combustion.',
    citation: 'GHG Protocol Corporate Standard; ESRS E1-6',
    formula: 'CO2e = Activity data × Emission factor (IPCC AR6 factors)'
  },
  scope2EmissionsMarket: {
    title: 'Scope 2 GHG Emissions (Market-Based)',
    description: 'Indirect emissions from purchased electricity, calculated using the emission factor of the specific energy product purchased (e.g. renewable EAC/GO has 0 gCO2e/kWh).',
    citation: 'GHG Protocol Scope 2 Guidance (2015); ESRS E1-6',
  },
  scope2EmissionsLocation: {
    title: 'Scope 2 GHG Emissions (Location-Based)',
    description: 'Indirect emissions from purchased electricity, calculated using the average grid emission factor of the country/region where the facility operates.',
    citation: 'GHG Protocol Scope 2 Guidance (2015); SFDR PAI Indicator 1',
  },
  totalEnergyMwh: {
    title: 'Total Energy Consumption (MWh/year)',
    description: 'Total annual electricity and heat consumption of the facility. Required for ESRS E1 energy intensity disclosures and SFDR PAI Indicator 8.',
    citation: 'ESRS E1-5 (Energy consumption and mix); SFDR PAI Indicator 8'
  },
  waterWithdrawal: {
    title: 'Water Withdrawal (m³/year)',
    description: 'Total annual volume of water withdrawn from all sources (mains, groundwater, surface water, seawater, rainwater). Required for ESRS E3 water disclosures.',
    citation: 'ESRS E3-1 (Water and marine resources); SFDR PAI Indicator 10'
  },
  isNewBuild: {
    title: 'New Build vs. Existing Facility',
    description: 'Whether this is a new-build data centre or an upgrade/expansion of an existing facility. EU Taxonomy applies different PUE thresholds to new builds (≤1.5) versus existing facilities (≤1.8, transitioning to ≤1.5 by 2030).',
    citation: 'EU Taxonomy DA 2021/2139, Annex I, Activity 8.1, Section 1.1'
  }
};
