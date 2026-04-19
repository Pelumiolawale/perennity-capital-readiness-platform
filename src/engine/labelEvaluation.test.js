// Label evaluation unit tests — verdicts + criteria per target_financing_label.
// Methodology v3.1 (April 2026). Does not touch scoring thresholds.

import { describe, expect, it } from 'vitest';
import { evaluateLabel, EU_TAXONOMY_OBJECTIVES } from './labelEvaluation.js';

// Minimal assessment stub — taxonomy + dnsh are what evaluateLabel reads.
function fullyAlignedTaxonomy() {
  return {
    aligned: true,
    criteria: [
      { name: 'PUE ≤ 1.3', met: true },
      { name: 'Renewable electricity ≥ 50%', met: true },
      { name: 'Waste heat reuse assessed', met: true },
      { name: 'Climate risk assessment conducted', met: true },
    ],
    dnsh: {
      mitigation: { label: 'Climate Change Mitigation (self-referential)', met: true },
      climate: { label: 'Climate Change Adaptation', met: true },
      water: { label: 'Water', met: true },
      circular: { label: 'Circular', met: true },
      pollution: { label: 'Pollution', met: true },
      biodiversity: { label: 'Biodiversity', met: true },
    },
    minimumSafeguards: {
      humanRights: { label: 'Human rights DD', met: true },
      labour: { label: 'Supply chain labour policy', met: true },
    },
  };
}

function buildAssessment(overrides = {}) {
  return {
    taxonomy: fullyAlignedTaxonomy(),
    dnsh: {
      score: 100,
      details: [
        { key: 'dnsh_climate_vulnerability', label: 'Climate vulnerability assessment', citation: '', met: true },
        { key: 'dnsh_protected_areas', label: 'Site outside protected areas', citation: '', met: true },
        { key: 'dnsh_low_gwp_refrigerants', label: 'Low-GWP refrigerants', citation: '', met: true },
        { key: 'dnsh_weee_compliance', label: 'WEEE end-of-life plan', citation: '', met: true },
        { key: 'dnsh_human_rights_dd', label: 'Human rights DD', citation: '', met: true },
        { key: 'dnsh_supply_chain_labour', label: 'Supply chain labour policy', citation: '', met: true },
      ],
    },
    ...overrides,
  };
}

// ── EU Taxonomy Activity 8.1 ────────────────────────────────
describe('evaluateLabel — EU Taxonomy Activity 8.1', () => {
  it('PASS when substantial contribution + all DNSH + min safeguards met', () => {
    const result = evaluateLabel(buildAssessment(), {
      target_financing_label: 'eu_taxonomy_8_1',
      substantial_contribution_objective: 'ccm',
    });
    expect(result.verdict).toBe('PASS');
    expect(result.showsDnsh).toBe(true);
    expect(result.dnshTreatment).toBe('passfail');
    expect(result.substantialContributionObjective).toBe('ccm');
  });

  it('FAIL when a DNSH objective (biodiversity) is unmet', () => {
    const tax = fullyAlignedTaxonomy();
    tax.dnsh.biodiversity.met = false;
    const result = evaluateLabel(buildAssessment({ taxonomy: tax }), {
      target_financing_label: 'eu_taxonomy_8_1',
      substantial_contribution_objective: 'ccm',
    });
    expect(result.verdict).toBe('FAIL');
    const biodiv = result.criteria.find(c => c.id === 'dnsh_biodiversity');
    expect(biodiv.status).toBe('FAIL');
  });

  it('FAIL when substantial contribution criteria are not all met', () => {
    const tax = fullyAlignedTaxonomy();
    tax.criteria[0].met = false; // PUE fails
    const result = evaluateLabel(buildAssessment({ taxonomy: tax }), {
      target_financing_label: 'eu_taxonomy_8_1',
      substantial_contribution_objective: 'ccm',
    });
    expect(result.verdict).toBe('FAIL');
    const sc = result.criteria.find(c => c.id === 'substantial_contribution');
    expect(sc.status).toBe('FAIL');
  });

  it('FAIL when minimum social safeguards are unmet', () => {
    const tax = fullyAlignedTaxonomy();
    tax.minimumSafeguards.humanRights.met = false;
    const result = evaluateLabel(buildAssessment({ taxonomy: tax }), {
      target_financing_label: 'eu_taxonomy_8_1',
      substantial_contribution_objective: 'ccm',
    });
    expect(result.verdict).toBe('FAIL');
    const ms = result.criteria.find(c => c.id === 'minimum_safeguards');
    expect(ms.status).toBe('FAIL');
  });

  it('defaults substantial contribution objective to CCM when not provided (historical assessment)', () => {
    const result = evaluateLabel(buildAssessment(), {
      target_financing_label: 'eu_taxonomy_8_1',
      // no substantial_contribution_objective
    });
    expect(result.substantialContributionObjective).toBe('ccm');
    expect(result.substantialContributionObjectiveName).toBe(EU_TAXONOMY_OBJECTIVES.ccm);
  });

  it('produces 5 DNSH criteria when substantial contribution is CCM (other 5 objectives)', () => {
    const result = evaluateLabel(buildAssessment(), {
      target_financing_label: 'eu_taxonomy_8_1',
      substantial_contribution_objective: 'ccm',
    });
    const dnshCriteria = result.criteria.filter(c => c.id.startsWith('dnsh_'));
    expect(dnshCriteria).toHaveLength(5);
    expect(dnshCriteria.map(c => c.id)).toEqual(expect.arrayContaining([
      'dnsh_cca', 'dnsh_water', 'dnsh_circular', 'dnsh_pollution', 'dnsh_biodiversity',
    ]));
    expect(dnshCriteria.map(c => c.id)).not.toContain('dnsh_ccm');
  });
});

// ── SFDR Article 8 ──────────────────────────────────────────
describe('evaluateLabel — SFDR Article 8', () => {
  it('PASS when all required criteria + supporting (disclosures) met', () => {
    const result = evaluateLabel(buildAssessment(), {
      target_financing_label: 'sfdr_article_8',
      sustainability_disclosures_ready: true,
      dnsh_protected_areas: true,
      dnsh_human_rights_dd: true,
      dnsh_supply_chain_labour: true,
    });
    expect(result.verdict).toBe('PASS');
    expect(result.showsDnsh).toBe(true);
    expect(result.dnshTreatment).toBe('informational');
    expect(result.dnshApplicable).toBe(false);
  });

  it('FAIL when E/S characteristics not documented (disclosures not ready)', () => {
    const result = evaluateLabel(buildAssessment(), {
      target_financing_label: 'sfdr_article_8',
      sustainability_disclosures_ready: false,
      dnsh_protected_areas: true,
      dnsh_human_rights_dd: true,
      dnsh_supply_chain_labour: true,
    });
    expect(result.verdict).toBe('FAIL');
  });

  it('FAIL when PAI evidence missing', () => {
    const result = evaluateLabel(buildAssessment(), {
      target_financing_label: 'sfdr_article_8',
      sustainability_disclosures_ready: true,
      dnsh_protected_areas: false,
      dnsh_human_rights_dd: true,
      dnsh_supply_chain_labour: true,
    });
    expect(result.verdict).toBe('FAIL');
  });
});

// ── SFDR Article 9 ──────────────────────────────────────────
describe('evaluateLabel — SFDR Article 9', () => {
  it('PASS when SI objective + DNSH + governance + PAI + supporting met', () => {
    const result = evaluateLabel(buildAssessment(), {
      target_financing_label: 'sfdr_article_9',
      net_zero_commitment_present: true,
      taxonomy_alignment_claimed: true,
      sustainability_disclosures_ready: true,
      dnsh_protected_areas: true,
      dnsh_climate_vulnerability: true,
      dnsh_human_rights_dd: true,
      dnsh_supply_chain_labour: true,
    });
    expect(result.verdict).toBe('PASS');
    expect(result.dnshApplicable).toBe(true);
    expect(result.showsDnsh).toBe(true);
    expect(result.dnshTreatment).toBe('passfail');
  });

  it('FAIL when sustainable investment objective not established', () => {
    const result = evaluateLabel(buildAssessment(), {
      target_financing_label: 'sfdr_article_9',
      net_zero_commitment_present: false,
      taxonomy_alignment_claimed: true,
      sustainability_disclosures_ready: true,
      dnsh_protected_areas: true,
      dnsh_climate_vulnerability: true,
      dnsh_human_rights_dd: true,
      dnsh_supply_chain_labour: true,
    });
    expect(result.verdict).toBe('FAIL');
  });

  it('FAIL when DNSH on sustainable investments has gaps', () => {
    // Flip one core DNSH item (biodiversity) to not met in the assessment.
    const assessment = buildAssessment();
    assessment.dnsh.details.find(d => d.key === 'dnsh_protected_areas').met = false;
    assessment.dnsh.score = 70;
    const result = evaluateLabel(assessment, {
      target_financing_label: 'sfdr_article_9',
      net_zero_commitment_present: true,
      taxonomy_alignment_claimed: true,
      sustainability_disclosures_ready: true,
      dnsh_protected_areas: false, // intake flag mirrors assessment
      dnsh_climate_vulnerability: true,
      dnsh_human_rights_dd: true,
      dnsh_supply_chain_labour: true,
    });
    expect(result.verdict).toBe('FAIL');
  });
});

// ── UK SDR Focus ────────────────────────────────────────────
describe('evaluateLabel — UK SDR Sustainability Focus', () => {
  const baseIntake = {
    target_financing_label: 'uk_sdr_focus',
    net_zero_commitment_present: true,
    carbon_reduction_strategy_present: true,
    sustainability_disclosures_ready: true,
    third_party_certification_target: 'breeam',
  };

  it('PASS with alignment 80% and evidence complete', () => {
    const result = evaluateLabel(buildAssessment(), {
      ...baseIntake,
      sdr_focus_alignment_pct: '80',
    });
    expect(result.verdict).toBe('PASS');
    expect(result.showsDnsh).toBe(false);
  });

  it('FAIL at 65% alignment (below 70% threshold)', () => {
    const result = evaluateLabel(buildAssessment(), {
      ...baseIntake,
      sdr_focus_alignment_pct: '65',
    });
    expect(result.verdict).toBe('FAIL');
    const pct = result.criteria.find(c => c.id === 'min_sustainable_assets');
    expect(pct.status).toBe('FAIL');
  });

  it('FAIL (rolls up as FAIL) when alignment % not provided (evidence incomplete on a critical item)', () => {
    const result = evaluateLabel(buildAssessment(), {
      ...baseIntake,
      sdr_focus_alignment_pct: '',
    });
    expect(result.verdict).toBe('FAIL');
    const pct = result.criteria.find(c => c.id === 'min_sustainable_assets');
    expect(pct.status).toBe('EVIDENCE_INCOMPLETE');
  });

  it('FAIL when third-party certification target is "none"', () => {
    const result = evaluateLabel(buildAssessment(), {
      ...baseIntake,
      sdr_focus_alignment_pct: '80',
      third_party_certification_target: 'none',
    });
    expect(result.verdict).toBe('FAIL');
  });

  it('never shows DNSH for UK SDR Focus', () => {
    const result = evaluateLabel(buildAssessment(), {
      ...baseIntake,
      sdr_focus_alignment_pct: '80',
    });
    expect(result.showsDnsh).toBe(false);
    expect(result.dnshApplicable).toBe(false);
  });
});

// ── UK SDR Improvers ────────────────────────────────────────
describe('evaluateLabel — UK SDR Sustainability Improvers', () => {
  const baseIntake = {
    target_financing_label: 'uk_sdr_improvers',
    net_zero_commitment_present: true,
    carbon_reduction_strategy_present: true,
    sustainability_disclosures_ready: true,
  };

  it('PASS when improvement potential + targets + KPIs + stewardship met', () => {
    const result = evaluateLabel(buildAssessment(), {
      ...baseIntake,
      sdr_improvers_evidence_provided: true,
    });
    expect(result.verdict).toBe('PASS');
    expect(result.showsDnsh).toBe(false);
  });

  it('FAIL when improvement targets missing (no net-zero commitment)', () => {
    const result = evaluateLabel(buildAssessment(), {
      ...baseIntake,
      sdr_improvers_evidence_provided: true,
      net_zero_commitment_present: false,
    });
    expect(result.verdict).toBe('FAIL');
  });

  it('FAIL when improvement pathway evidence not provided', () => {
    const result = evaluateLabel(buildAssessment(), {
      ...baseIntake,
      sdr_improvers_evidence_provided: false,
    });
    expect(result.verdict).toBe('FAIL');
  });
});

// ── UK SDR Impact ───────────────────────────────────────────
describe('evaluateLabel — UK SDR Sustainability Impact', () => {
  const baseIntake = {
    target_financing_label: 'uk_sdr_impact',
    net_zero_commitment_present: true,
    taxonomy_alignment_claimed: true,
    carbon_reduction_strategy_present: true,
    sustainability_disclosures_ready: true,
  };

  it('PASS with theory of change + measurement method + additionality', () => {
    const result = evaluateLabel(buildAssessment(), {
      ...baseIntake,
      sdr_impact_theory_of_change: true,
      sdr_impact_measurement_method: true,
      sdr_impact_investor_additionality: true,
    });
    expect(result.verdict).toBe('PASS');
    expect(result.showsDnsh).toBe(false);
  });

  it('FAIL when theory of change is not documented', () => {
    const result = evaluateLabel(buildAssessment(), {
      ...baseIntake,
      sdr_impact_theory_of_change: false,
      sdr_impact_measurement_method: true,
      sdr_impact_investor_additionality: true,
    });
    expect(result.verdict).toBe('FAIL');
    const toc = result.criteria.find(c => c.id === 'theory_of_change');
    expect(toc.status).toBe('EVIDENCE_INCOMPLETE');
  });

  it('FAIL when measurement method is not defined', () => {
    const result = evaluateLabel(buildAssessment(), {
      ...baseIntake,
      sdr_impact_theory_of_change: true,
      sdr_impact_measurement_method: false,
      sdr_impact_investor_additionality: true,
    });
    expect(result.verdict).toBe('FAIL');
  });
});

// ── UK SDR Mixed Goals ──────────────────────────────────────
describe('evaluateLabel — UK SDR Sustainability Mixed Goals', () => {
  it('PASS when project qualifies for ≥2 constituent labels', () => {
    // Configure intake so that both Focus AND Impact pass.
    const result = evaluateLabel(buildAssessment(), {
      target_financing_label: 'uk_sdr_mixed',
      net_zero_commitment_present: true,
      carbon_reduction_strategy_present: true,
      taxonomy_alignment_claimed: true,
      sustainability_disclosures_ready: true,
      third_party_certification_target: 'breeam',
      sdr_focus_alignment_pct: '80',
      sdr_improvers_evidence_provided: true,
      sdr_impact_theory_of_change: true,
      sdr_impact_measurement_method: true,
      sdr_impact_investor_additionality: true,
    });
    expect(result.verdict).toBe('PASS');
    expect(result.constituents).toBeDefined();
    const passing = Object.values(result.constituents).filter(v => v === 'PASS').length;
    expect(passing).toBeGreaterThanOrEqual(2);
  });

  it('FAIL when project qualifies for <2 constituent labels', () => {
    const result = evaluateLabel(buildAssessment(), {
      target_financing_label: 'uk_sdr_mixed',
      net_zero_commitment_present: true,
      carbon_reduction_strategy_present: true,
      taxonomy_alignment_claimed: false,
      sustainability_disclosures_ready: true,
      third_party_certification_target: 'none',
      sdr_focus_alignment_pct: '50',
      sdr_improvers_evidence_provided: false,
      sdr_impact_theory_of_change: false,
    });
    expect(result.verdict).toBe('FAIL');
    const crit = result.criteria.find(c => c.id === 'qualifies_multiple_labels');
    expect(crit.status).toBe('FAIL');
  });

  it('never shows DNSH for UK SDR Mixed Goals', () => {
    const result = evaluateLabel(buildAssessment(), {
      target_financing_label: 'uk_sdr_mixed',
    });
    expect(result.showsDnsh).toBe(false);
  });
});

// ── Non-covered labels ──────────────────────────────────────
describe('evaluateLabel — non-covered labels', () => {
  it('returns null for eugbs so Results page falls back to generic view', () => {
    const result = evaluateLabel(buildAssessment(), { target_financing_label: 'eugbs' });
    expect(result).toBeNull();
  });

  it('returns null when no label is selected', () => {
    const result = evaluateLabel(buildAssessment(), { target_financing_label: '' });
    expect(result).toBeNull();
  });

  it('returns null when intake is undefined', () => {
    const result = evaluateLabel(buildAssessment(), undefined);
    expect(result).toBeNull();
  });
});
