// ============================================
// REGULATORY THRESHOLDS & REFERENCE DATA
// ============================================

export const REGULATORY_THRESHOLDS = {
  // EU Taxonomy Climate Delegated Act 8.1 for Data Centres
  euTaxonomy: {
    pue: {
      excellent: 1.3,
      compliantNew: 1.5,      // New builds (DA 2021/2139)
      compliantExisting: 1.8, // Existing builds (transition to 1.5 by 2030)
      acceptable: 1.6,
      poor: 1.8,
      // 2027 review target
      targetNew2027: 1.4
    },
    renewableEnergy: {
      excellent: 100,
      compliant: 75,
      acceptable: 50,
      poor: 25
    },
    wue: {
      // CNDCP WUEmax = 0.4 × K1(climate) × K2(cooling) × K3(recycled water)
      baseTarget: 0.4,
      excellent: 0.3,
      compliant: 0.8,
      acceptable: 1.2,
      poor: 2.0
    }
  },
  ukSdr: {
    sustainabilityFocus: {
      minScore: 75,
      renewableMin: 70
    },
    sustainabilityImprovers: {
      minScore: 50,
      improvementPlan: true
    },
    sustainabilityImpact: {
      minScore: 80,
      impactMetrics: true
    }
  },
  sfdr: {
    article9: {
      minScore: 85,
      sustainableInvestment: 100,
      paiDisclosure: true,
      minRenewable: 75,
      maxPue: 1.5
    },
    article8: {
      minScore: 60,
      esgPromotion: true,
      minRenewable: 50
    },
    article6: {
      minScore: 0,
      basicDisclosure: true
    }
  }
};

// CNDCP climate zone K-factors for WUE target calculation
export const CNDCP_CLIMATE_FACTORS = {
  climateZones: {
    hot_arid:      { K1: 1.4 }, // GCC states
    hot_semi_arid: { K1: 1.2 }, // Jordan, Morocco, Tunisia
    temperate:     { K1: 1.0 }  // EU reference
  },
  coolingFactors: {
    air_cooled:    { K2: 0.5 },
    free_cooling:  { K2: 0.4 },
    liquid_cooling: { K2: 0.3 },
    immersion:     { K2: 0.2 },
    evaporative:   { K2: 0.9 },
    chilled_water: { K2: 0.7 },
    hybrid:        { K2: 0.6 }
  },
  recycledWaterFactors: {
    none:     { K3: 1.0 },
    partial:  { K3: 0.8 }, // >20% recycled
    majority: { K3: 0.6 }  // >60% recycled
  }
};

export function calculateWueTarget(climateZone, coolingType, recycledWaterLevel = 'none') {
  const base = REGULATORY_THRESHOLDS.euTaxonomy.wue.baseTarget;
  const K1 = CNDCP_CLIMATE_FACTORS.climateZones[climateZone]?.K1 ?? 1.0;
  const K2 = CNDCP_CLIMATE_FACTORS.coolingFactors[coolingType]?.K2 ?? 0.7;
  const K3 = CNDCP_CLIMATE_FACTORS.recycledWaterFactors[recycledWaterLevel]?.K3 ?? 1.0;
  return +(base * K1 * K2 * K3).toFixed(2);
}

export const MENA_COUNTRIES = [
  { code: 'UAE', name: 'United Arab Emirates', waterStress: 'high', climate: 'hot', climateZone: 'hot_arid' },
  { code: 'KSA', name: 'Saudi Arabia', waterStress: 'high', climate: 'hot', climateZone: 'hot_arid' },
  { code: 'QAT', name: 'Qatar', waterStress: 'high', climate: 'hot', climateZone: 'hot_arid' },
  { code: 'KWT', name: 'Kuwait', waterStress: 'high', climate: 'hot', climateZone: 'hot_arid' },
  { code: 'BHR', name: 'Bahrain', waterStress: 'high', climate: 'hot', climateZone: 'hot_arid' },
  { code: 'OMN', name: 'Oman', waterStress: 'high', climate: 'hot', climateZone: 'hot_arid' },
  { code: 'JOR', name: 'Jordan', waterStress: 'high', climate: 'moderate', climateZone: 'hot_semi_arid' },
  { code: 'EGY', name: 'Egypt', waterStress: 'medium', climate: 'moderate', climateZone: 'hot_semi_arid' },
  { code: 'MAR', name: 'Morocco', waterStress: 'medium', climate: 'moderate', climateZone: 'hot_semi_arid' },
  { code: 'TUN', name: 'Tunisia', waterStress: 'medium', climate: 'moderate', climateZone: 'hot_semi_arid' }
];

export const COOLING_TECHNOLOGIES = [
  { id: 'air_cooled', name: 'Air-Cooled Chillers', waterIntensity: 'low', pueImpact: 0.1 },
  { id: 'evaporative', name: 'Evaporative Cooling', waterIntensity: 'high', pueImpact: -0.15 },
  { id: 'chilled_water', name: 'Chilled Water System', waterIntensity: 'medium', pueImpact: 0 },
  { id: 'free_cooling', name: 'Free Cooling / Economizers', waterIntensity: 'low', pueImpact: -0.2 },
  { id: 'liquid_cooling', name: 'Direct Liquid Cooling', waterIntensity: 'low', pueImpact: -0.25 },
  { id: 'immersion', name: 'Immersion Cooling', waterIntensity: 'very_low', pueImpact: -0.3 },
  { id: 'hybrid', name: 'Hybrid System', waterIntensity: 'medium', pueImpact: -0.1 }
];

export const CERTIFICATIONS = [
  { id: 'iso14001', name: 'ISO 14001 (Environmental Management)', weight: 15 },
  { id: 'iso50001', name: 'ISO 50001 (Energy Management)', weight: 20 },
  { id: 'leed', name: 'LEED Certification', weight: 15 },
  { id: 'breeam', name: 'BREEAM Certification', weight: 15 },
  { id: 'iso27001', name: 'ISO 27001 (Information Security)', weight: 5 },
  { id: 'en50600', name: 'EN 50600 Compliance', weight: 20 },
  { id: 'eu_coc', name: 'EU Code of Conduct for Data Centres', weight: 25 },
  { id: 'uptime', name: 'Uptime Institute Tier Certification', weight: 10 }
];

// SFDR PAI (Principal Adverse Impact) Indicators relevant to data centres
export const PAI_INDICATORS = [
  { id: 'pai1', name: 'GHG emissions (Scope 1+2)', unit: 'tCO2e', mandatory: true },
  { id: 'pai2', name: 'Carbon footprint', unit: 'tCO2e/€M invested', mandatory: true },
  { id: 'pai7', name: 'Renewable energy consumption', unit: '%', mandatory: true },
  { id: 'pai8', name: 'Energy consumption intensity', unit: 'kWh/€M revenue', mandatory: true },
  { id: 'pai10', name: 'Water usage', unit: 'm³', mandatory: false },
  { id: 'pai11', name: 'Hazardous waste ratio', unit: '%', mandatory: false }
];
