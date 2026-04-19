// ============================================================
// TARGET FINANCING LABEL → APPLICABLE REGULATORY FRAMEWORKS
// Source of truth for the framework routing shown on the Results
// page, in the PDF Executive Summary, in the Excel report, and
// written to Airtable. Methodology v3.1, April 2026.
// ============================================================

export const FINANCING_LABELS = {
  sfdr_article_8:   'SFDR Article 8 — promotes environmental/social characteristics',
  sfdr_article_9:   'SFDR Article 9 — sustainable investment objective',
  eu_taxonomy_8_1:  'EU Taxonomy aligned — Activity 8.1 (climate change mitigation)',
  eugbs:            'European Green Bond (EuGBS) — Regulation (EU) 2023/2631',
  uk_sdr_focus:     'UK SDR — Sustainability Focus',
  uk_sdr_improvers: 'UK SDR — Sustainability Improvers',
  uk_sdr_impact:    'UK SDR — Sustainability Impact',
  uk_sdr_mixed:     'UK SDR — Sustainability Mixed Goals',
};

// Primary + secondary framework mapping per methodology v3.1 §Fix 3.2.
// Primary = the instrument or regime the label points directly at.
// Secondary = related frameworks the project should cross-check against.
const FRAMEWORK_MAPPING = {
  eugbs: {
    primary:   ['EU Regulation 2023/2631 — European Green Bond Standard'],
    secondary: ['EU Taxonomy Regulation 2020/852', 'SFDR 2019/2088', 'Activity 8.1 TSC (Climate DA 2021/2139 Annex I)'],
  },
  sfdr_article_8: {
    primary:   ['SFDR 2019/2088 Article 8'],
    secondary: ['Commission Delegated Regulation 2022/1288 (RTS)', 'EU Taxonomy 2020/852', 'SFDR PAI Annex I'],
  },
  sfdr_article_9: {
    primary:   ['SFDR 2019/2088 Article 9'],
    secondary: ['Commission Delegated Regulation 2022/1288 (RTS — sustainable investment requirements)', 'EU Taxonomy 2020/852', 'SFDR PAI Annex I'],
  },
  eu_taxonomy_8_1: {
    primary:   ['EU Taxonomy Regulation 2020/852', 'Climate Delegated Act 2021/2139 Annex I Activity 8.1'],
    secondary: ['SFDR 2019/2088', 'Disclosures Delegated Act 2021/2178'],
  },
  uk_sdr_focus: {
    primary:   ['FCA PS23/16 — Sustainability Focus label criteria'],
    secondary: ['ESG 4.3.1R anti-greenwashing rule', 'ESG 4 naming & marketing rules'],
  },
  uk_sdr_improvers: {
    primary:   ['FCA PS23/16 — Sustainability Improvers label criteria'],
    secondary: ['ESG 4.3.1R anti-greenwashing rule', 'ESG 4 naming & marketing rules'],
  },
  uk_sdr_impact: {
    primary:   ['FCA PS23/16 — Sustainability Impact label criteria'],
    secondary: ['ESG 4.3.1R anti-greenwashing rule', 'ESG 4 naming & marketing rules'],
  },
  uk_sdr_mixed: {
    primary:   ['FCA PS23/16 — Sustainability Mixed Goals (must meet each constituent label for the proportion invested)'],
    secondary: ['ESG 4.3.1R anti-greenwashing rule', 'ESG 4 naming & marketing rules'],
  },
};

// Returned when the user has not yet selected a label. Neutral — does not
// prescribe a routing; surfaces the full reference set the project may wish
// to consider.
const UNSET_FRAMEWORKS = {
  primary:   [],
  secondary: [
    'SFDR 2019/2088 (if targeting EU fund capital)',
    'EU Taxonomy 2020/852 + Activity 8.1 (for green claims)',
    'EU Regulation 2023/2631 — European Green Bond Standard (for EU green bond issuance)',
    'FCA PS23/16 UK SDR (for UK fund capital)',
  ],
};

/**
 * Returns the applicable regulatory frameworks for a given target
 * financing label.
 * @param {string|undefined} label - the target_financing_label value
 * @returns {{primary: string[], secondary: string[], labelName: string, labelSelected: boolean}}
 */
export function getApplicableFrameworks(label) {
  if (!label || !FRAMEWORK_MAPPING[label]) {
    return {
      primary: UNSET_FRAMEWORKS.primary,
      secondary: UNSET_FRAMEWORKS.secondary,
      labelName: FINANCING_LABELS[label] || '',
      labelSelected: false,
    };
  }
  return {
    primary: FRAMEWORK_MAPPING[label].primary,
    secondary: FRAMEWORK_MAPPING[label].secondary,
    labelName: FINANCING_LABELS[label],
    labelSelected: true,
  };
}

/**
 * Flat joined string suitable for single-cell exports (Airtable, Excel).
 */
export function flattenFrameworks(label) {
  const { primary, secondary, labelSelected } = getApplicableFrameworks(label);
  if (!labelSelected) return '';
  const primaryStr = primary.length ? `Primary: ${primary.join('; ')}` : '';
  const secondaryStr = secondary.length ? `Secondary: ${secondary.join('; ')}` : '';
  return [primaryStr, secondaryStr].filter(Boolean).join(' | ');
}
