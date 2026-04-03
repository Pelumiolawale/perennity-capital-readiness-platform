import { REGULATORY_THRESHOLDS } from '../constants/regulatoryData.js';

// EU Taxonomy Activity 8.1 — Data Centres
// Delegated Act 2021/2139 technical screening criteria
export function determineTaxonomyAlignment(scores, formData) {
  const pue = parseFloat(formData.pueTarget) || 1.8;
  const isNewBuild = formData.isNewBuild !== false;
  const hasEuCoc = formData.certifications?.includes('eu_coc');
  const pueThreshold = isNewBuild
    ? REGULATORY_THRESHOLDS.euTaxonomy.pue.compliantNew
    : REGULATORY_THRESHOLDS.euTaxonomy.pue.compliantExisting;

  // Substantial Contribution: PUE ≤ threshold AND EU CoC
  const pueCompliant = pue <= pueThreshold;
  const substantialContribution = pueCompliant && hasEuCoc;

  // DNSH — all 5 environmental objectives must be met
  const dnshClimate = !!(formData.climateRiskAssessment || formData.tcfdRiskManagement);
  const dnshWater = scores.water.score >= 60;
  const dnshCircular = scores.circularEconomy.score >= 50;

  // Pollution — requires actual programme, not hardcoded assumption
  const dnshPollution = formData.pollutionPrevention === 'certified' || formData.pollutionPrevention === 'basic';

  // Biodiversity — requires documented assessment
  const dnshBiodiversity = !!formData.biodiversityAssessment;

  const allDnsh = dnshClimate && dnshWater && dnshCircular && dnshPollution && dnshBiodiversity;

  return {
    aligned: substantialContribution && allDnsh,
    substantialContribution: {
      met: substantialContribution,
      criteria: [
        { name: `PUE ≤ ${pueThreshold} (${isNewBuild ? 'new build' : 'existing'})`, met: pueCompliant },
        { name: 'EU Code of Conduct for Data Centres', met: !!hasEuCoc },
        { name: 'Third-party verification (EU CoC)', met: !!hasEuCoc }
      ]
    },
    dnsh: {
      climate: { met: dnshClimate, label: 'Climate Change Adaptation' },
      water: { met: dnshWater, label: 'Water & Marine Resources' },
      circular: { met: dnshCircular, label: 'Circular Economy' },
      pollution: { met: dnshPollution, label: 'Pollution Prevention' },
      biodiversity: { met: dnshBiodiversity, label: 'Biodiversity & Ecosystems' }
    }
  };
}
