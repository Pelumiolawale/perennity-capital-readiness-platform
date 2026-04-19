// Contract tests for the label-driven PDF + Excel exports.
//
// These tests exercise the page/sheet PLAN and the regulatory
// basis DATA — the pure pieces that drive what gets rendered.
// They do not generate actual PDF/XLSX binaries (jsPDF + xlsx
// both rely on browser APIs that vitest's default environment
// doesn't expose).

import { describe, expect, it } from 'vitest';
import { planExportPages, planExportSheets, KIND } from './exportPlan.js';
import {
  getRegulatoryBasis,
  getApplicablePillars,
  shouldRenderPaiPage,
  shouldRenderDnshEvidencePage,
  SUPPORTED_EXPORT_LABELS,
  PAI_MAPPING_ROWS,
} from './regulatoryBasisByLabel.js';

function mkAssessment(labelOverride) {
  // Minimal assessment that the exports consume. Pillar scores +
  // label evaluation shape is all that matters for contract-level
  // assertions.
  const le = labelOverride ? {
    label: labelOverride,
    labelName: `Label(${labelOverride})`,
    verdict: 'PASS',
    criteria: [
      { id: 'substantial_contribution', title: 'Substantial contribution', status: 'PASS', detail: '', citation: 'EU 2021/2139', weight: 'critical' },
      { id: 'dnsh_cca',      title: 'DNSH — Climate Adaptation',   status: 'PASS', detail: '', citation: '',                    weight: 'critical' },
      { id: 'dnsh_water',    title: 'DNSH — Water',                status: 'PASS', detail: '', citation: '',                    weight: 'critical' },
      { id: 'dnsh_circular', title: 'DNSH — Circular',             status: 'PASS', detail: '', citation: '',                    weight: 'critical' },
      { id: 'dnsh_pollution',title: 'DNSH — Pollution',            status: 'PASS', detail: '', citation: '',                    weight: 'critical' },
      { id: 'dnsh_biodiversity', title: 'DNSH — Biodiversity',     status: 'PASS', detail: '', citation: '',                    weight: 'critical' },
      { id: 'minimum_safeguards', title: 'Minimum safeguards',     status: 'PASS', detail: '', citation: 'EU 2020/852 Art 18',  weight: 'critical' },
    ],
    dnshApplicable: true,
    showsDnsh: true,
    dnshTreatment: 'passfail',
    substantialContributionObjective: 'ccm',
    substantialContributionObjectiveName: 'Climate Change Mitigation',
    summary: 'Meets all criteria.',
  } : null;

  return {
    capitalReadinessScore: 79,
    confidenceScore: 95,
    band: { label: 'Capital Ready' },
    subscores: { sa: 70, epv: 80, wre: 75, csr: 85, dfr: 65 },
    weights: { sa: 0.30, epv: 0.25, wre: 0.15, csr: 0.15, dfr: 0.15 },
    pillarDetails: {
      sa:  { explanations: { positive: ['PUE 1.25: Capital ready'], negative: [] } },
      epv: { explanations: { positive: ['PPA secured with strong renewable share'], negative: [] } },
      wre: { explanations: { positive: ['Meets CNDCP target'], negative: [] } },
      csr: { explanations: { positive: ['Climate adaptation measures in design'], negative: [] } },
      dfr: { explanations: { positive: ['Site control secured'], negative: [] } },
    },
    recommendations: [],
    hardStopTriggered: false,
    labelEvaluation: le,
    dnsh: { score: 100, details: [
      { label: 'Climate vulnerability assessment', met: true, citation: 'DNSH Obj 2' },
      { label: 'Site outside protected areas',     met: true, citation: 'DNSH Obj 6' },
      { label: 'Low-GWP refrigerants',             met: true, citation: 'DNSH Obj 5' },
      { label: 'WEEE end-of-life plan',            met: true, citation: 'DNSH Obj 4' },
      { label: 'Human rights due diligence',       met: true, citation: 'Art 18' },
      { label: 'Supply chain labour policy',       met: true, citation: 'Art 18' },
    ]},
    taxonomy: {},
    sfdr: {},
    sdr: [],
  };
}

function mkProject(label) {
  return { project_name: 'Test Project', region: 'EU', target_financing_label: label };
}

// ── Page plan page counts per label ─────────────────────────
describe('planExportPages — page counts per label', () => {
  it('EU Taxonomy 8.1 → Cover + ExecSummary + Criteria + 5 pillars + PAI + Actions = 10 pages', () => {
    const pages = planExportPages(mkProject('eu_taxonomy_8_1'), mkAssessment('eu_taxonomy_8_1'));
    // Cover (1) + ExecSummary (2) + Criteria (3) + 5 pillars (4–8) + PAI (9) + Actions (10)
    // But note: we dropped the DNSH evidence page for EU Tax. Action plan still present.
    // Count: 1+1+1+5+1+1 = 10 pages for EU Tax.
    expect(pages).toHaveLength(10);
    expect(pages.filter(p => p.kind === KIND.PILLAR)).toHaveLength(5);
    expect(pages.filter(p => p.kind === KIND.DNSH_EVIDENCE)).toHaveLength(0);
    expect(pages.filter(p => p.kind === KIND.PAI_MAPPING)).toHaveLength(1);
    expect(pages.filter(p => p.kind === KIND.ACTION_PLAN)).toHaveLength(1);
  });

  it('SFDR Article 8 → Cover + ExecSummary + Criteria + 5 pillars + DNSH (info) + PAI + Actions = 11 pages', () => {
    const pages = planExportPages(mkProject('sfdr_article_8'), mkAssessment('sfdr_article_8'));
    expect(pages).toHaveLength(11);
    expect(pages.filter(p => p.kind === KIND.PILLAR)).toHaveLength(5);
    expect(pages.filter(p => p.kind === KIND.DNSH_EVIDENCE)).toHaveLength(1);
    expect(pages.filter(p => p.kind === KIND.PAI_MAPPING)).toHaveLength(1);
  });

  it('SFDR Article 9 → 11 pages (same structure as Art 8, DNSH pass/fail)', () => {
    const pages = planExportPages(mkProject('sfdr_article_9'), mkAssessment('sfdr_article_9'));
    expect(pages).toHaveLength(11);
    expect(pages.filter(p => p.kind === KIND.DNSH_EVIDENCE)).toHaveLength(1);
  });

  it('UK SDR Focus → no DNSH, no PAI; 5 pillars including circular', () => {
    const pages = planExportPages(mkProject('uk_sdr_focus'), mkAssessment('uk_sdr_focus'));
    expect(pages.filter(p => p.kind === KIND.DNSH_EVIDENCE)).toHaveLength(0);
    expect(pages.filter(p => p.kind === KIND.PAI_MAPPING)).toHaveLength(0);
    expect(pages.filter(p => p.kind === KIND.PILLAR)).toHaveLength(5);
    // Total: Cover + Exec + Criteria + 5 pillars + Actions = 9
    expect(pages).toHaveLength(9);
  });

  it('UK SDR Improvers → circular pillar page omitted (not a qualifying criterion)', () => {
    const pages = planExportPages(mkProject('uk_sdr_improvers'), mkAssessment('uk_sdr_improvers'));
    expect(pages.filter(p => p.kind === KIND.PILLAR)).toHaveLength(4);
    // Total: Cover + Exec + Criteria + 4 pillars + Actions = 8
    expect(pages).toHaveLength(8);
    const pillarKeys = pages.filter(p => p.kind === KIND.PILLAR).map(p => p.pillarKey);
    expect(pillarKeys).not.toContain('dfr');
  });

  it('UK SDR Impact → 5 pillars including supporting circular evidence', () => {
    const pages = planExportPages(mkProject('uk_sdr_impact'), mkAssessment('uk_sdr_impact'));
    expect(pages.filter(p => p.kind === KIND.PILLAR)).toHaveLength(5);
    expect(pages).toHaveLength(9);
  });

  it('UK SDR Mixed Goals → 5 pillars + no DNSH/PAI', () => {
    const pages = planExportPages(mkProject('uk_sdr_mixed'), mkAssessment('uk_sdr_mixed'));
    expect(pages.filter(p => p.kind === KIND.DNSH_EVIDENCE)).toHaveLength(0);
    expect(pages.filter(p => p.kind === KIND.PAI_MAPPING)).toHaveLength(0);
    expect(pages.filter(p => p.kind === KIND.PILLAR)).toHaveLength(5);
    expect(pages).toHaveLength(9);
  });

  it('Unsupported label (icma_gbp historical) → 3-page fallback', () => {
    const pages = planExportPages(mkProject('icma_gbp'), mkAssessment());
    expect(pages).toHaveLength(3);
    expect(pages.map(p => p.kind)).toEqual([KIND.COVER, KIND.EXEC_SUMMARY, KIND.FALLBACK_NOTICE]);
  });

  it('No label selected → 3-page fallback', () => {
    const pages = planExportPages(mkProject(''), mkAssessment());
    expect(pages).toHaveLength(3);
    expect(pages[2].kind).toBe(KIND.FALLBACK_NOTICE);
  });
});

// ── Excel sheet plan ────────────────────────────────────────
describe('planExportSheets — sheet counts per label', () => {
  it('EU Taxonomy 8.1 → Summary + Criteria + Pillars + PAI + Actions = 5 sheets (no DNSH)', () => {
    const sheets = planExportSheets(mkProject('eu_taxonomy_8_1'), mkAssessment('eu_taxonomy_8_1'));
    expect(sheets.map(s => s.name)).toEqual(['Summary', 'Criteria', 'Pillars', 'SFDR PAI', 'Actions']);
  });

  it('SFDR Article 9 → 6 sheets including DNSH Evidence + SFDR PAI', () => {
    const sheets = planExportSheets(mkProject('sfdr_article_9'), mkAssessment('sfdr_article_9'));
    expect(sheets.map(s => s.name)).toEqual(['Summary', 'Criteria', 'Pillars', 'DNSH Evidence', 'SFDR PAI', 'Actions']);
  });

  it('UK SDR Focus → 4 sheets (no DNSH, no PAI)', () => {
    const sheets = planExportSheets(mkProject('uk_sdr_focus'), mkAssessment('uk_sdr_focus'));
    expect(sheets.map(s => s.name)).toEqual(['Summary', 'Criteria', 'Pillars', 'Actions']);
  });

  it('Unsupported label → Summary + Notice = 2 sheets', () => {
    const sheets = planExportSheets(mkProject('icma_gbp'), mkAssessment());
    expect(sheets.map(s => s.name)).toEqual(['Summary', 'Notice']);
  });
});

// ── Regulatory basis per (label, pillar) ────────────────────
describe('getRegulatoryBasis — citations per pillar per label', () => {
  it('EU Taxonomy SA pillar cites EU 2021/2139 Annex I Activity 8.1', () => {
    const b = getRegulatoryBasis('sa', 'eu_taxonomy_8_1');
    expect(b.primaryRegime).toMatch(/2020\/852/);
    expect(b.primaryRegime).toMatch(/2021\/2139/);
    expect(b.thresholdTable.some(t => t.value === '≤ 1.3')).toBe(true);
    expect(b.framing).toBe('passfail');
  });

  it('SFDR Article 8 pillars carry the "indicative benchmarks" framing + footnote', () => {
    ['sa', 'wre', 'epv', 'csr', 'dfr'].forEach(p => {
      const b = getRegulatoryBasis(p, 'sfdr_article_8');
      expect(b.framing).toBe('indicative');
      expect(b.footnote).toMatch(/does not prescribe quantitative thresholds/);
    });
  });

  it('UK SDR labels have no SFDR PAI mapping on any pillar', () => {
    ['uk_sdr_focus', 'uk_sdr_improvers', 'uk_sdr_impact', 'uk_sdr_mixed'].forEach(lb => {
      getApplicablePillars(lb).forEach(p => {
        const b = getRegulatoryBasis(p, lb);
        expect(b.paiMapping).toBeNull();
        expect(b.framing).toBe('evidence');
      });
    });
  });

  it('Unsupported label returns null for every pillar', () => {
    ['sa', 'wre', 'epv', 'csr', 'dfr'].forEach(p => {
      expect(getRegulatoryBasis(p, 'icma_gbp')).toBeNull();
    });
  });
});

// ── Conditional-page predicates ─────────────────────────────
describe('shouldRenderPaiPage / shouldRenderDnshEvidencePage', () => {
  it('PAI page: only EU Taxonomy + SFDR labels', () => {
    expect(shouldRenderPaiPage('eu_taxonomy_8_1')).toBe(true);
    expect(shouldRenderPaiPage('sfdr_article_8')).toBe(true);
    expect(shouldRenderPaiPage('sfdr_article_9')).toBe(true);
    ['uk_sdr_focus', 'uk_sdr_improvers', 'uk_sdr_impact', 'uk_sdr_mixed', 'icma_gbp', ''].forEach(lb => {
      expect(shouldRenderPaiPage(lb)).toBe(false);
    });
  });

  it('DNSH Evidence page: only SFDR labels (EU Tax criteria page covers it; UK SDR not applicable)', () => {
    expect(shouldRenderDnshEvidencePage('eu_taxonomy_8_1')).toBe(false);
    expect(shouldRenderDnshEvidencePage('sfdr_article_8')).toBe(true);
    expect(shouldRenderDnshEvidencePage('sfdr_article_9')).toBe(true);
    ['uk_sdr_focus', 'uk_sdr_improvers', 'uk_sdr_impact', 'uk_sdr_mixed'].forEach(lb => {
      expect(shouldRenderDnshEvidencePage(lb)).toBe(false);
    });
  });
});

// ── Regressions ─────────────────────────────────────────────
describe('regressions', () => {
  it('PAI 13 is mapped to Governance & Minimum Safeguards without "(supplementary)"', () => {
    const row = PAI_MAPPING_ROWS.find(r => r[0] === 'PAI 13');
    expect(row).toBeDefined();
    expect(row[2]).toBe('Governance & Minimum Safeguards');
    expect(row[2]).not.toMatch(/supplementary/i);
  });

  it('SUPPORTED_EXPORT_LABELS uses canonical codes from financing-labels.js', () => {
    // Regression check: codes must match the enum in
    // financing-labels.js (eu_taxonomy_8_1, uk_sdr_mixed, etc.)
    // so export routing aligns with label evaluation.
    expect(SUPPORTED_EXPORT_LABELS).toContain('eu_taxonomy_8_1');
    expect(SUPPORTED_EXPORT_LABELS).toContain('uk_sdr_mixed');
    expect(SUPPORTED_EXPORT_LABELS).not.toContain('eu_taxonomy_aligned');
    expect(SUPPORTED_EXPORT_LABELS).not.toContain('uk_sdr_mixed_goals');
  });

  it('EU Taxonomy SA pillar threshold uses the updated new-build gate (not ≤1.5)', () => {
    // Sanity: the ≤1.3 new-build gate must be present, and the
    // old ≤1.5-as-primary-threshold must not be the sole value.
    const b = getRegulatoryBasis('sa', 'eu_taxonomy_8_1');
    expect(b.thresholdTable.some(t => t.value === '≤ 1.3')).toBe(true);
    expect(b.thresholdTable.some(t => t.value === '≤ 1.2')).toBe(true);
  });
});
