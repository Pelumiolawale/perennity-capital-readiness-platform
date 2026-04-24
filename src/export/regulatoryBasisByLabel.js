// ============================================================
// REGULATORY BASIS — per target financing label × per pillar.
//
// Single source of truth for the "Regulatory basis" block and the
// "Threshold applied" table on each pillar page of the PDF/Excel.
// Consumed by pdfExport.js and excelExport.js only — do not
// duplicate any of these strings inline in templates.
//
// Pillar keys match scoring.js subscores:
//   sa  → Energy Efficiency (PUE)
//   wre → Water Efficiency (WUE)
//   epv → Renewable Energy
//   csr → Governance & Minimum Safeguards
//   dfr → Delivery & Funding Readiness — issuer diligence signals
//         (site control, permitting, EPC, financing strategy).
//         Not a regulatory pass/fail category; treated as
//         investor-facing supporting evidence across all labels.
//
// Returns `null` for a (label, pillar) combination that should not
// render a dedicated pillar page (page omitted entirely — no "N/A"
// placeholder per export scope).
// ============================================================

export const SUPPORTED_EXPORT_LABELS = [
  'eu_taxonomy_8_1',
  'sfdr_article_8',
  'sfdr_article_9',
  'uk_sdr_focus',
  'uk_sdr_improvers',
  'uk_sdr_impact',
  'uk_sdr_mixed',
];

// Short display names for pillar pages.
export const PILLAR_DISPLAY_NAMES = {
  sa: 'Energy Efficiency (PUE)',
  wre: 'Water Efficiency (WUE)',
  epv: 'Renewable Energy',
  csr: 'Governance & Minimum Safeguards',
  dfr: 'Delivery & Funding Readiness',
};

// Canonical PAI map (per Commission Delegated Regulation (EU)
// 2022/1288, Annex I, Table 1). PAI 13 is mandatory under Table 1
// — the earlier PDF labelled it "supplementary", which was wrong.
const PAI = {
  energy: 'PAI 1, 2, 5 — GHG emissions and non-renewable energy consumption share',
  waterEmissions: 'PAI 8 — Emissions to water',
  biodiversity: 'PAI 7 — Activities negatively affecting biodiversity-sensitive areas',
  governanceSocial: 'PAI 10, 11, 13 — UNGC/OECD violations, monitoring processes, board gender diversity',
  waste: 'PAI 9 — Hazardous waste and radioactive waste ratio',
};

// EU Taxonomy Activity 8.1 threshold tables reused across labels
// that invoke the Taxonomy TSC (EU Tax, SFDR Art 9 via DNSH).
const EU_TAX_PUE_THRESHOLDS = [
  { threshold: 'New-build PUE (post-2025 best-in-class)', value: '≤ 1.2', source: 'EU 2021/2139 Annex I §8.1 (v3.1)' },
  { threshold: 'New-build PUE (Activity 8.1 gate)',      value: '≤ 1.3', source: 'EU 2021/2139 Annex I §8.1 ¶1(a)' },
  { threshold: 'Existing-DC PUE',                         value: '≤ 1.5', source: 'EU 2021/2139 Annex I §8.1 ¶1(b)' },
];

const CNDCP_WUE_THRESHOLDS = [
  { threshold: 'WUEmax formula',                 value: '0.4 × K1 × K2 × K3', source: 'EUDCA CNDCP White Paper (Oct 2024)' },
  { threshold: 'Exceeds CNDCP target',           value: 'WUE ≤ WUEmax × 0.8', source: 'Perennity Bridge methodology v3.1' },
  { threshold: 'Meets CNDCP target',             value: 'WUE ≤ WUEmax',       source: 'Perennity Bridge methodology v3.1' },
];

const RENEWABLE_TIER_THRESHOLDS = [
  { threshold: 'Tier 1 — matched PPA / on-site',   value: '100% ≥ 90 pts',  source: 'GHG Protocol Scope 2 (2015); EU Tax 8.1 §1(c)' },
  { threshold: 'Tier 2 — Guarantees of Origin',    value: '100% ≥ 72 pts',  source: 'GHG Protocol Scope 2 (2015)' },
  { threshold: 'Tier 3 — utility green tariff',    value: 'capped at 40 pts (no additionality)', source: 'Perennity Bridge methodology v3.1' },
];

const DNSH_GOV_THRESHOLDS = [
  { threshold: 'Climate vulnerability assessment', value: 'Required',        source: 'EU 2020/852 Art 17 + Annex II' },
  { threshold: 'Site outside protected areas',     value: 'Required',        source: 'EU 2020/852 Art 17 + Annex VI' },
  { threshold: 'Human rights due diligence',       value: 'UNGPs + OECD MNE', source: 'EU 2020/852 Art 18' },
  { threshold: 'Supply chain labour policy',       value: 'ILO Declaration', source: 'EU 2020/852 Art 18' },
];

// Delivery & Funding Readiness evidence tables. Not regulatory
// pass/fail thresholds — these are issuer-diligence signals that
// funds and lenders expect to see before committing capital.
const DFR_EVIDENCE = [
  { threshold: 'Site control',            value: 'Secured',                        source: 'Investor diligence (Perennity Bridge v3.1)' },
  { threshold: 'Permitting status',       value: 'Underway or complete',           source: 'Investor diligence (Perennity Bridge v3.1)' },
  { threshold: 'EPC / contractor',        value: 'Identified',                     source: 'Investor diligence (Perennity Bridge v3.1)' },
  { threshold: 'Financing strategy',      value: 'Defined + investment memo ready', source: 'Investor diligence (Perennity Bridge v3.1)' },
];

// UK SDR labels share a common "evidence standard" framing —
// thresholds are not regulatory pass/fail (FCA PS23/16 does not
// prescribe quantitative thresholds); the tables below list the
// qualifying evidence bars the project must demonstrate.
const UK_SDR_PUE_EVIDENCE = [
  { threshold: 'PUE evidence (efficient-design claim)', value: 'Site target disclosed + independently reviewable', source: 'FCA PS23/16 ESG 5.3.1R — general criteria' },
];
const UK_SDR_WUE_EVIDENCE = [
  { threshold: 'WUE evidence (water-stress context)', value: 'Site target disclosed + independently reviewable', source: 'FCA PS23/16 ESG 5.3.1R' },
];
const UK_SDR_RENEWABLES_EVIDENCE = [
  { threshold: 'Renewable-source quality evidence', value: 'PPA / GO / utility tariff documented with additionality view', source: 'FCA PS23/16 ESG 5.3.1R' },
];
const UK_SDR_GOVERNANCE_EVIDENCE = [
  { threshold: 'Stewardship strategy',     value: 'Documented', source: 'FCA PS23/16 ESG 5.3.1R' },
  { threshold: 'Escalation plan',          value: 'Documented', source: 'FCA PS23/16 ESG 5.3.1R' },
];
const UK_SDR_DFR_EVIDENCE = [
  { threshold: 'Delivery milestones disclosed', value: 'Site control + permitting + EPC documented', source: 'FCA PS23/16 ESG 5.3.1R (general disclosure)' },
  { threshold: 'Financing strategy',            value: 'Investment memo or term sheet available',     source: 'Investor diligence (Perennity Bridge v3.1)' },
];

// ── Per-label × per-pillar encoding ──────────────────────────

function euTaxonomyBasis(pillar) {
  switch (pillar) {
    case 'sa':
      return {
        primaryRegime: 'EU Taxonomy Regulation (EU) 2020/852 + Climate Delegated Act (EU) 2021/2139',
        objectiveOrCategory: 'Climate Change Mitigation (Objective 1) — Activity 8.1 TSC',
        paiMapping: PAI.energy,
        sources: ['EU 2021/2139 Annex I §8.1', 'Perennity Bridge methodology v3.1'],
        thresholdTable: EU_TAX_PUE_THRESHOLDS,
        framing: 'passfail',
      };
    case 'wre':
      return {
        primaryRegime: 'EU 2020/852 Art 17 (DNSH) + EUDCA CNDCP WUEmax formula',
        objectiveOrCategory: 'Sustainable Use and Protection of Water and Marine Resources (Objective 3) — DNSH',
        paiMapping: PAI.waterEmissions,
        sources: ['EU 2020/852 Art 17 + Annex III', 'EUDCA CNDCP White Paper (Oct 2024)'],
        thresholdTable: CNDCP_WUE_THRESHOLDS,
        framing: 'passfail',
      };
    case 'epv':
      return {
        primaryRegime: 'EU 2021/2139 Annex I Activity 8.1 §1(c) + GHG Protocol Scope 2 (2015)',
        objectiveOrCategory: 'Climate Change Mitigation (Objective 1) — renewable electricity sourcing',
        paiMapping: PAI.energy,
        sources: ['EU 2021/2139 Annex I §8.1 ¶1(c)', 'GHG Protocol Scope 2 Guidance (2015)'],
        thresholdTable: RENEWABLE_TIER_THRESHOLDS,
        framing: 'passfail',
      };
    case 'csr':
      return {
        primaryRegime: 'EU 2020/852 Art 17 (DNSH) + Art 18 (Minimum Safeguards)',
        objectiveOrCategory: 'DNSH Objectives 2, 4, 5, 6 + Art 18 Minimum Social Safeguards',
        paiMapping: PAI.governanceSocial,
        sources: ['EU 2020/852 Art 17 + Annexes II–VI', 'EU 2020/852 Art 18 — UNGPs / OECD MNEs / ILO'],
        thresholdTable: DNSH_GOV_THRESHOLDS,
        framing: 'passfail',
      };
    case 'dfr':
      return {
        primaryRegime: 'Investor diligence (not an EU Taxonomy criterion)',
        objectiveOrCategory: 'Delivery & Funding Readiness — issuer diligence signals',
        paiMapping: null,
        sources: ['Perennity Bridge methodology v3.1'],
        thresholdTable: DFR_EVIDENCE,
        framing: 'indicative',
      };
    default:
      return null;
  }
}

function sfdrArt8Basis(pillar) {
  // Article 8 products: PAI consideration is the organising
  // principle; values shown are indicative benchmarks, not
  // regulatory pass/fail thresholds.
  const footnote = 'SFDR Article 8 does not prescribe quantitative thresholds; values shown are EU Taxonomy/market benchmarks used for indicative PAI-consideration context.';
  switch (pillar) {
    case 'sa':
      return {
        primaryRegime: 'SFDR 2019/2088 Art 8 + Commission Delegated Regulation (EU) 2022/1288 (RTS)',
        objectiveOrCategory: 'Promotes environmental/social characteristics — PAI consideration',
        paiMapping: PAI.energy,
        sources: ['SFDR 2019/2088 Art 8', 'Commission Delegated Regulation (EU) 2022/1288 Annex I Table 1'],
        thresholdTable: EU_TAX_PUE_THRESHOLDS,
        framing: 'indicative',
        footnote,
      };
    case 'wre':
      return {
        primaryRegime: 'SFDR 2019/2088 Art 8 + RTS 2022/1288',
        objectiveOrCategory: 'E/S characteristics — PAI 8 water emissions',
        paiMapping: PAI.waterEmissions,
        sources: ['SFDR 2019/2088 Art 8', 'RTS 2022/1288 Annex I Table 1', 'EUDCA CNDCP White Paper (Oct 2024)'],
        thresholdTable: CNDCP_WUE_THRESHOLDS,
        framing: 'indicative',
        footnote,
      };
    case 'epv':
      return {
        primaryRegime: 'SFDR 2019/2088 Art 8 + RTS 2022/1288',
        objectiveOrCategory: 'E/S characteristics — PAI 1/2/5 energy & emissions',
        paiMapping: PAI.energy,
        sources: ['SFDR 2019/2088 Art 8', 'RTS 2022/1288 Annex I Table 1', 'GHG Protocol Scope 2 Guidance (2015)'],
        thresholdTable: RENEWABLE_TIER_THRESHOLDS,
        framing: 'indicative',
        footnote,
      };
    case 'csr':
      return {
        primaryRegime: 'SFDR 2019/2088 Art 2(17) + Art 8',
        objectiveOrCategory: 'Good governance + PAI 10, 11, 13',
        paiMapping: PAI.governanceSocial,
        sources: ['SFDR 2019/2088 Art 2(17) + Art 8', 'RTS 2022/1288 Annex I Table 1'],
        thresholdTable: DNSH_GOV_THRESHOLDS,
        framing: 'indicative',
        footnote,
      };
    case 'dfr':
      return {
        primaryRegime: 'Investor diligence (not an SFDR disclosure item)',
        objectiveOrCategory: 'Delivery & Funding Readiness — issuer diligence signals',
        paiMapping: null,
        sources: ['Perennity Bridge methodology v3.1'],
        thresholdTable: DFR_EVIDENCE,
        framing: 'indicative',
        footnote,
      };
    default:
      return null;
  }
}

function sfdrArt9Basis(pillar) {
  // Article 9 products: sustainable investment objective —
  // DNSH cross-references EU Taxonomy TSC for sustainable
  // investments (RTS Art 16). Full pillar coverage applies.
  switch (pillar) {
    case 'sa':
      return {
        primaryRegime: 'SFDR 2019/2088 Art 9 + RTS 2022/1288 + EU 2020/852 (DNSH cross-reference)',
        objectiveOrCategory: 'Sustainable investment objective — substantial contribution + DNSH',
        paiMapping: PAI.energy,
        sources: ['SFDR 2019/2088 Art 9', 'RTS 2022/1288 Art 16', 'EU 2021/2139 Annex I §8.1'],
        thresholdTable: EU_TAX_PUE_THRESHOLDS,
        framing: 'passfail',
      };
    case 'wre':
      return {
        primaryRegime: 'SFDR 2019/2088 Art 9 + DNSH via EU 2020/852 Art 17',
        objectiveOrCategory: 'DNSH — water & marine resources',
        paiMapping: PAI.waterEmissions,
        sources: ['SFDR 2019/2088 Art 9', 'EU 2020/852 Art 17 + Annex III', 'EUDCA CNDCP White Paper (Oct 2024)'],
        thresholdTable: CNDCP_WUE_THRESHOLDS,
        framing: 'passfail',
      };
    case 'epv':
      return {
        primaryRegime: 'SFDR 2019/2088 Art 9 + EU 2021/2139 Annex I Activity 8.1 §1(c)',
        objectiveOrCategory: 'Sustainable investment — renewable electricity',
        paiMapping: PAI.energy,
        sources: ['SFDR 2019/2088 Art 9', 'EU 2021/2139 Annex I §8.1 ¶1(c)', 'GHG Protocol Scope 2 (2015)'],
        thresholdTable: RENEWABLE_TIER_THRESHOLDS,
        framing: 'passfail',
      };
    case 'csr':
      return {
        primaryRegime: 'SFDR 2019/2088 Art 2(17) + Art 9 + EU 2020/852 Art 18',
        objectiveOrCategory: 'Good governance + DNSH + Minimum Safeguards',
        paiMapping: PAI.governanceSocial,
        sources: ['SFDR 2019/2088 Art 9', 'EU 2020/852 Art 17 + Annexes II–VI', 'EU 2020/852 Art 18'],
        thresholdTable: DNSH_GOV_THRESHOLDS,
        framing: 'passfail',
      };
    case 'dfr':
      return {
        primaryRegime: 'Investor diligence (not an SFDR disclosure item)',
        objectiveOrCategory: 'Delivery & Funding Readiness — issuer diligence signals',
        paiMapping: null,
        sources: ['Perennity Bridge methodology v3.1'],
        thresholdTable: DFR_EVIDENCE,
        framing: 'indicative',
      };
    default:
      return null;
  }
}

function ukSdrBasis(sublabel, pillar) {
  // UK SDR: no SFDR PAI mapping, no DNSH, no quantitative
  // regulatory thresholds. Pillars reframed as evidence for the
  // label's qualifying criteria under FCA PS23/16.
  const common = {
    paiMapping: null,
    framing: 'evidence',
    footnote: 'UK SDR does not prescribe quantitative thresholds. Values shown are the evidence standards required to substantiate the label criteria under FCA PS23/16.',
  };
  const regime = {
    uk_sdr_focus:     { primary: 'FCA PS23/16 ESG 5.3.2R — Sustainability Focus', tag: 'Sustainability Focus label qualifying criteria — ≥70% of assets meet a robust, evidence-based, absolute standard of sustainability' },
    uk_sdr_improvers: { primary: 'FCA PS23/16 ESG 5.3.3R — Sustainability Improvers', tag: 'Improvers label qualifying criteria — potential to meet a robust standard over time + defined short/medium-term targets' },
    uk_sdr_impact:    { primary: 'FCA PS23/16 ESG 5.3.4R — Sustainability Impact', tag: 'Impact label qualifying criteria — theory of change + measurable positive contribution + investor additionality' },
    uk_sdr_mixed:     { primary: 'FCA PS23/16 ESG 5.3.5R — Sustainability Mixed Goals', tag: 'Mixed Goals label qualifying criteria — requirements for each constituent label met for its allocated proportion' },
  }[sublabel];
  if (!regime) return null;

  switch (pillar) {
    case 'sa':
      return {
        primaryRegime: regime.primary,
        objectiveOrCategory: regime.tag + ' — energy-efficiency evidence',
        sources: [regime.primary, 'FCA ESG 4.3.1R anti-greenwashing rule'],
        thresholdTable: UK_SDR_PUE_EVIDENCE,
        ...common,
      };
    case 'wre':
      return {
        primaryRegime: regime.primary,
        objectiveOrCategory: regime.tag + ' — water-efficiency evidence',
        sources: [regime.primary, 'FCA ESG 4.3.1R anti-greenwashing rule'],
        thresholdTable: UK_SDR_WUE_EVIDENCE,
        ...common,
      };
    case 'epv':
      return {
        primaryRegime: regime.primary,
        objectiveOrCategory: regime.tag + ' — renewable electricity evidence',
        sources: [regime.primary, 'GHG Protocol Scope 2 Guidance (2015)'],
        thresholdTable: UK_SDR_RENEWABLES_EVIDENCE,
        ...common,
      };
    case 'csr':
      return {
        primaryRegime: regime.primary,
        objectiveOrCategory: regime.tag + ' — stewardship + escalation',
        sources: [regime.primary, 'FCA PS23/16 ESG 5.3.1R general criteria'],
        thresholdTable: UK_SDR_GOVERNANCE_EVIDENCE,
        ...common,
      };
    case 'dfr':
      // Improvers is strictly about forward-looking improvement targets;
      // delivery/funding readiness is not a qualifying criterion under
      // ESG 5.3.3R, so omit the pillar page for that sublabel.
      if (sublabel === 'uk_sdr_improvers') return null;
      return {
        primaryRegime: regime.primary,
        objectiveOrCategory: regime.tag + ' — delivery & funding readiness (supporting)',
        sources: [regime.primary, 'Perennity Bridge methodology v3.1 (indicative)'],
        thresholdTable: UK_SDR_DFR_EVIDENCE,
        ...common,
      };
    default:
      return null;
  }
}

export function getRegulatoryBasis(pillar, label) {
  switch (label) {
    case 'eu_taxonomy_8_1':  return euTaxonomyBasis(pillar);
    case 'sfdr_article_8':   return sfdrArt8Basis(pillar);
    case 'sfdr_article_9':   return sfdrArt9Basis(pillar);
    case 'uk_sdr_focus':
    case 'uk_sdr_improvers':
    case 'uk_sdr_impact':
    case 'uk_sdr_mixed':
      return ukSdrBasis(label, pillar);
    default:
      return null;
  }
}

// Convenience: list of pillar keys that apply for a given label.
export function getApplicablePillars(label) {
  return ['sa', 'wre', 'epv', 'csr', 'dfr'].filter(p => getRegulatoryBasis(p, label) !== null);
}

// Whether the SFDR PAI Mapping page should render for a label.
// EU Taxonomy / SFDR Art 8 / SFDR Art 9 → yes. UK SDR → no.
export function shouldRenderPaiPage(label) {
  return ['eu_taxonomy_8_1', 'sfdr_article_8', 'sfdr_article_9'].includes(label);
}

// Whether the dedicated DNSH Evidence page should render for a
// label. Per design: EU Taxonomy criteria breakdown already
// includes the 3-group DNSH split, so a separate DNSH page is
// redundant for EU Tax. Keep the dedicated page only for SFDR
// (both Art 8 informational + Art 9 pass/fail).
export function shouldRenderDnshEvidencePage(label) {
  return ['sfdr_article_8', 'sfdr_article_9'].includes(label);
}

// Canonical PAI mapping rows used by the SFDR PAI page. PAI 13 is
// mandatory per RTS 2022/1288 Annex I Table 1 — not supplementary.
export const PAI_MAPPING_ROWS = [
  ['PAI 1',  'GHG emissions (Scope 1, 2, 3)',                        'Energy Efficiency + Renewable Energy'],
  ['PAI 2',  'Carbon footprint',                                      'Energy Efficiency + Renewable Energy'],
  ['PAI 5',  'Non-renewable energy consumption',                      'Energy Efficiency + Renewable Energy'],
  ['PAI 7',  'Activities affecting biodiversity-sensitive areas',     'Governance & Minimum Safeguards'],
  ['PAI 8',  'Emissions to water',                                    'Water Efficiency'],
  ['PAI 9',  'Hazardous waste ratio',                                 'Governance & Minimum Safeguards'],
  ['PAI 10', 'UNGC/OECD violations',                                  'Governance & Minimum Safeguards'],
  ['PAI 11', 'UNGC compliance processes',                             'Governance & Minimum Safeguards'],
  ['PAI 13', 'Board gender diversity',                                'Governance & Minimum Safeguards'],
];
