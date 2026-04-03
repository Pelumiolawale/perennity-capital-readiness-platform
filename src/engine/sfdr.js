import { REGULATORY_THRESHOLDS } from '../constants/regulatoryData.js';

export function determineSfdrClassification(overallScore, formData) {
  const renewable = parseFloat(formData.renewablePercent) || 0;
  const pue = parseFloat(formData.pueTarget) || 1.8;
  const { article9, article8 } = REGULATORY_THRESHOLDS.sfdr;

  // Article 9: requires score threshold, renewable threshold, PUE threshold
  // Note: real SFDR also requires PAI disclosures and DNSH — captured in gaps
  if (overallScore >= article9.minScore && renewable >= article9.minRenewable && pue <= article9.maxPue) {
    return {
      classification: 'Article 9',
      label: 'Sustainable Investment',
      color: 'emerald',
      description: 'Eligible for funds with sustainable investment as their objective',
      requirements: [
        'Sustainable investment objective',
        'No significant harm to other objectives (DNSH)',
        'Good governance practices',
        'PAI (Principal Adverse Impact) disclosure required'
      ]
    };
  }

  if (overallScore >= article8.minScore && renewable >= article8.minRenewable) {
    return {
      classification: 'Article 8',
      label: 'Environmental Characteristics',
      color: 'blue',
      description: 'Promotes environmental characteristics alongside financial returns',
      requirements: [
        'Promotes E/S characteristics',
        'Investee companies follow good governance',
        'PAI consideration (comply or explain)'
      ]
    };
  }

  return {
    classification: 'Article 6',
    label: 'Standard Disclosure',
    color: 'gray',
    description: 'Basic sustainability risk disclosure only',
    requirements: [
      'Sustainability risk integration disclosure',
      'No ESG claims permitted'
    ]
  };
}
