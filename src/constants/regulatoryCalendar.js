// ============================================
// REGULATORY CALENDAR
// lastUpdated: 2026-04-03
// Review and update quarterly
// ============================================

export const REGULATORY_DEADLINES = [
  {
    id: 'csrd-large-2025',
    regulation: 'CSRD',
    milestone: 'Large company first CSRD reporting (FY2024 data)',
    deadline: '2025-01-01',
    relevantTo: ['CSRD'],
    urgency: 'passed',
    description: 'Companies meeting 2 of 3: 250+ employees, €40M+ turnover, €20M+ balance sheet must publish first ESRS-aligned sustainability report.'
  },
  {
    id: 'uk-sdr-labels-2024',
    regulation: 'UK SDR',
    milestone: 'UK SDR fund labels go live',
    deadline: '2024-07-31',
    relevantTo: ['UK_SDR'],
    urgency: 'passed',
    description: 'FCA Sustainability Disclosure Requirements — fund labels (Sustainability Focus, Improvers, Impact) became available for UK-authorised funds.'
  },
  {
    id: 'uk-sdr-naming-2025',
    regulation: 'UK SDR',
    milestone: 'UK SDR naming and marketing rules',
    deadline: '2025-04-02',
    relevantTo: ['UK_SDR'],
    urgency: 'passed',
    description: 'FCA rules restricting use of sustainability-related terms (e.g. "green", "ESG", "sustainable") in fund names and marketing come into force.'
  },
  {
    id: 'csrd-listed-sme-2026',
    regulation: 'CSRD',
    milestone: 'Listed SME CSRD reporting begins (FY2025)',
    deadline: '2026-01-01',
    relevantTo: ['CSRD'],
    urgency: 'high',
    description: 'Listed small and medium enterprises must publish first ESRS sustainability report for FY2025.'
  },
  {
    id: 'sfdr-review-2026',
    regulation: 'SFDR',
    milestone: 'SFDR reform review — ESAs consultation',
    deadline: '2026-06-30',
    relevantTo: ['SFDR'],
    urgency: 'medium',
    description: 'European Supervisory Authorities expected to publish consultation on SFDR 2.0 reform, potentially replacing Article 6/8/9 with a new category system.'
  },
  {
    id: 'eu-taxonomy-pue-2027',
    regulation: 'EU Taxonomy',
    milestone: 'EU Taxonomy PUE threshold tightens to ≤1.4',
    deadline: '2027-01-01',
    relevantTo: ['EU_TAXONOMY'],
    urgency: 'medium',
    description: 'European Commission scheduled review of Activity 8.1 technical screening criteria. PUE threshold for new data centres expected to reduce from 1.5 to 1.4.'
  },
  {
    id: 'eu-taxonomy-existing-pue-2030',
    regulation: 'EU Taxonomy',
    milestone: 'Existing data centres must meet PUE ≤1.5',
    deadline: '2030-01-01',
    relevantTo: ['EU_TAXONOMY'],
    urgency: 'low',
    description: 'Transition deadline for existing data centres to meet the new-build PUE threshold of 1.5.'
  },
  {
    id: 'csrd-non-eu-2028',
    regulation: 'CSRD',
    milestone: 'Non-EU companies with EU turnover >€150M in scope',
    deadline: '2028-01-01',
    relevantTo: ['CSRD'],
    urgency: 'low',
    description: 'CSRD extends to non-EU parent companies that generate >€150M EU net turnover and have at least one EU subsidiary or branch.'
  }
];

export function getUpcomingDeadlines(count = 3, relevantFrameworks = null) {
  const today = new Date();
  return REGULATORY_DEADLINES
    .filter(d => {
      if (d.urgency === 'passed') return false;
      if (relevantFrameworks && !d.relevantTo.some(f => relevantFrameworks.includes(f))) return false;
      return new Date(d.deadline) > today;
    })
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, count);
}
