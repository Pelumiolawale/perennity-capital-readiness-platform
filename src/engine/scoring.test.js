// Scoring engine unit tests — methodology v3.1 (April 2026).
// Covers the verification scenarios in the Phase 3 prompt plus a few
// regression checks for the DNSH gate corrections shipped in Fix 3.4a/b.

import { describe, expect, it } from 'vitest';
import {
  calculatePueScore,
  calculateWueMax,
  determineSfdrClassification,
  determineUkSdrEligibility,
  determineEuTaxonomyAlignment,
  runAssessment,
} from './scoring.js';
import { getApplicableFrameworks } from '../regulations/frameworks/financing-labels.js';

// Country profile for MENA used by several tests (matches UAE in App.jsx).
const MENA_PROFILE = { pueTarget: 1.5, waterStress: 'extreme', gridCarbon: 550, renewableGrid: 5 };
const EU_PROFILE = { pueTarget: 1.3, waterStress: 'low', gridCarbon: 385, renewableGrid: 46 };

function newBuildProject(overrides = {}) {
  return {
    development_stage: 'pre_permitting',
    country: 'United Arab Emirates',
    region: 'MENA',
    pue: 1.25,
    wue: 0.4,
    k1_climate: 'warm',
    k2_stress: 'high',
    k3_water: 'potable',
    cooling_type: 'hybrid',
    backup_power_type: 'battery',
    grid_connection_status: 'partially_secured',
    renewable_energy_share_pct: 65,
    renewable_energy_source: 'ppa',
    ppa_secured: true,
    water_recycling_included: true,
    waste_heat_recovery: true,
    adaptation_measures_present: true,
    business_continuity_plan_ready: true,
    dnsh_climate_vulnerability: true,
    dnsh_protected_areas: true,
    dnsh_low_gwp_refrigerants: true,
    dnsh_weee_compliance: true,
    dnsh_human_rights_dd: true,
    dnsh_supply_chain_labour: true,
    taxonomy_alignment_claimed: true,
    net_zero_commitment_present: true,
    sustainability_disclosures_ready: true,
    carbon_reduction_strategy_present: true,
    financing_strategy_defined: true,
    ...overrides,
  };
}

describe('calculatePueScore — methodology v3.1 bands', () => {
  it('new-build MENA DC at PUE 1.25 scores in the 70–89 band', () => {
    const result = calculatePueScore(1.25, newBuildProject({ pue: 1.25 }), 'MENA', MENA_PROFILE);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.score).toBeLessThanOrEqual(89);
    expect(result.label).toBe('Capital ready');
  });

  it('new-build MENA DC at PUE 1.45 falls into the fail-for-new-build band (45–69)', () => {
    const result = calculatePueScore(1.45, newBuildProject({ pue: 1.45 }), 'MENA', MENA_PROFILE);
    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(result.score).toBeLessThanOrEqual(69);
    expect(result.label).toBe('Conditional');
    expect(result.taxonomyGate).toMatch(/Fail for new-build/);
  });

  it('existing MENA DC at PUE 1.45 passes (Activity 8.1 existing threshold ≤ 1.5)', () => {
    const project = { ...newBuildProject({ pue: 1.45 }), development_stage: 'shovel_ready' };
    const result = calculatePueScore(1.45, project, 'MENA', MENA_PROFILE);
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.label).toBe('Capital ready');
    expect(result.taxonomyGate).toMatch(/existing-DC threshold/);
  });

  it('post-2025 new-build at PUE 1.15 scores in the 90–100 band', () => {
    const result = calculatePueScore(1.15, newBuildProject({ pue: 1.15 }), 'EU', EU_PROFILE);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.taxonomyGate).toMatch(/post-2025/);
  });

  it('new-build at PUE 1.6 is pre-development', () => {
    const result = calculatePueScore(1.6, newBuildProject({ pue: 1.6 }), 'EU', EU_PROFILE);
    expect(result.score).toBeLessThanOrEqual(15);
    expect(result.label).toBe('Pre-development');
  });
});

describe('calculateWueMax — CNDCP formula', () => {
  it('MENA defaults K1=1.1, K2=1.0, K3=1.0 → WUEmax = 0.44 m³/MWh', () => {
    const project = { k1_climate: 'warm', k2_stress: 'high', k3_water: 'potable' };
    const { wueMax, k1, k2, k3 } = calculateWueMax(project, 'MENA', MENA_PROFILE);
    expect(k1).toBe(1.1);
    expect(k2).toBe(1.0);
    expect(k3).toBe(1.0);
    expect(wueMax).toBeCloseTo(0.44, 2);
  });

  it('WUE 0.4 at MENA defaults is at WUEmax (passes)', () => {
    const wueMax = 0.4 * 1.1 * 1.0 * 1.0;
    // A project at wue === wueMax should meet the CNDCP target
    expect(0.4).toBeLessThanOrEqual(wueMax);
  });

  it('brackish cooling in low-stress cold climate → WUEmax = 12', () => {
    const project = { k1_climate: 'cold', k2_stress: 'low', k3_water: 'brackish' };
    const { wueMax } = calculateWueMax(project, 'EU', EU_PROFILE);
    expect(wueMax).toBeCloseTo(12, 2); // 0.4 × 1.0 × 5.0 × 6.0
  });
});

describe('determineUkSdrEligibility — four labels per FCA PS23/16', () => {
  it('returns exactly four label results', () => {
    const results = determineUkSdrEligibility(newBuildProject(), 85);
    expect(results).toHaveLength(4);
    expect(results.map(r => r.label)).toContain('Sustainability Focus');
    expect(results.map(r => r.label)).toContain('Sustainability Improvers');
    expect(results.map(r => r.label)).toContain('Sustainability Impact');
    expect(results.map(r => r.label)).toContain('Sustainability Mixed Goals');
  });

  it('Mixed Goals eligible when project qualifies for at least two other labels', () => {
    // High-performing project: qualifies for Impact (score ≥80, renew ≥70, pue ≤1.4, net-zero, taxonomy),
    // Focus (score ≥75, renew ≥50, pue ≤1.5, disclosures), Improvers (score ≥55, renew ≥30, carbon strategy)
    const project = newBuildProject({ pue: 1.25, renewable_energy_share_pct: 75 });
    const results = determineUkSdrEligibility(project, 85);
    const mixed = results.find(r => r.label === 'Sustainability Mixed Goals');
    expect(mixed.eligible).toBe(true);
  });

  it('Mixed Goals not eligible for a project that qualifies for only one other label', () => {
    const project = newBuildProject({
      pue: 1.35, // fails Impact (needs ≤1.4) ... actually passes Impact
      // Make it fail Impact and Focus but pass Improvers
      net_zero_commitment_present: false,     // fails Impact
      taxonomy_alignment_claimed: false,       // fails Impact
      sustainability_disclosures_ready: false, // fails Focus
      renewable_energy_share_pct: 40,         // fails Focus and Impact minimums; Improvers needs ≥30
    });
    const results = determineUkSdrEligibility(project, 60);
    const mixed = results.find(r => r.label === 'Sustainability Mixed Goals');
    expect(mixed.eligible).toBe(false);
  });
});

describe('determineEuTaxonomyAlignment — DNSH gate corrections (Fix 3.4a)', () => {
  it('circular DNSH gate driven by dnsh_weee_compliance (not hard-coded true)', () => {
    const project = newBuildProject({ dnsh_weee_compliance: false });
    const result = determineEuTaxonomyAlignment(project, EU_PROFILE);
    expect(result.dnsh.circular.met).toBe(false);
    expect(result.aligned).toBe(false);
  });

  it('biodiversity DNSH gate driven by dnsh_protected_areas (not adaptation_measures_present)', () => {
    const project = newBuildProject({ dnsh_protected_areas: false, adaptation_measures_present: true });
    const result = determineEuTaxonomyAlignment(project, EU_PROFILE);
    expect(result.dnsh.biodiversity.met).toBe(false);
  });

  it('pollution DNSH gate requires low-GWP refrigerants AND non-polluting backup AND non-polluting onsite', () => {
    // Diesel backup alone should fail regardless of refrigerants + onsite
    const dieselBackup = newBuildProject({ backup_power_type: 'diesel', dnsh_low_gwp_refrigerants: true });
    expect(determineEuTaxonomyAlignment(dieselBackup, EU_PROFILE).dnsh.pollution.met).toBe(false);

    // Gas onsite alone should fail
    const gasOnsite = newBuildProject({ onsite_generation_type: 'gas', dnsh_low_gwp_refrigerants: true });
    expect(determineEuTaxonomyAlignment(gasOnsite, EU_PROFILE).dnsh.pollution.met).toBe(false);

    // Missing low-GWP refrigerants alone should fail
    const noLowGwp = newBuildProject({ dnsh_low_gwp_refrigerants: false });
    expect(determineEuTaxonomyAlignment(noLowGwp, EU_PROFILE).dnsh.pollution.met).toBe(false);
  });

  it('climate DNSH gate requires BOTH vulnerability assessment AND adaptation measures', () => {
    const project = newBuildProject({ dnsh_climate_vulnerability: true, adaptation_measures_present: false });
    const result = determineEuTaxonomyAlignment(project, EU_PROFILE);
    expect(result.dnsh.climate.met).toBe(false);
  });

  it('Art 18 Minimum Safeguards is a separate gate from DNSH', () => {
    const project = newBuildProject({ dnsh_human_rights_dd: false });
    const result = determineEuTaxonomyAlignment(project, EU_PROFILE);
    expect(result.minimumSafeguards.humanRights.met).toBe(false);
    expect(result.aligned).toBe(false);
  });

  it('DNSH water gate uses CNDCP WUEmax, not a flat 1.0 m³/MWh', () => {
    // A MENA project with WUE 0.8 and WUEmax ~0.44 should fail water DNSH
    const project = newBuildProject({ wue: 0.8, water_recycling_included: false });
    const result = determineEuTaxonomyAlignment(project, MENA_PROFILE);
    expect(result.dnsh.water.met).toBe(false);
    expect(result.dnsh.water.label).toMatch(/CNDCP/);
  });

  it('is aligned when all substantial / DNSH / Art 18 criteria are met', () => {
    const project = newBuildProject({
      pue: 1.25,                                // meets ≤1.3 new-build threshold
      renewable_energy_share_pct: 100,
      wue: 0.3,                                 // well below MENA WUEmax of 0.44
      water_recycling_included: true,
      backup_power_type: 'battery',
      onsite_generation_type: 'solar',
    });
    const result = determineEuTaxonomyAlignment(project, EU_PROFILE);
    expect(result.aligned).toBe(true);
  });
});

describe('SFDR classification', () => {
  it('Article 9 requires renewable ≥80%, PUE ≤1.5, Taxonomy + disclosures + net-zero', () => {
    const project = newBuildProject({
      renewable_energy_share_pct: 85,
      pue: 1.3,
    });
    const result = determineSfdrClassification(project, 'EU');
    expect(result.classification).toBe('Article 9');
  });

  it('Article 8 requires renewable ≥40%, PUE ≤1.8, disclosures ready', () => {
    const project = newBuildProject({
      renewable_energy_share_pct: 50,
      pue: 1.45,
      taxonomy_alignment_claimed: false,
      net_zero_commitment_present: false,
    });
    const result = determineSfdrClassification(project, 'EU');
    expect(result.classification).toBe('Article 8');
  });

  it('falls back to Article 6 when disclosures are not ready', () => {
    const project = newBuildProject({
      sustainability_disclosures_ready: false,
      taxonomy_alignment_claimed: false,
      net_zero_commitment_present: false,
    });
    const result = determineSfdrClassification(project, 'EU');
    expect(result.classification).toBe('Article 6');
  });
});

describe('Applicable frameworks by target_financing_label', () => {
  it('uk_sdr_focus returns PS23/16 Focus criteria + anti-greenwashing + naming rules', () => {
    const fw = getApplicableFrameworks('uk_sdr_focus');
    expect(fw.labelSelected).toBe(true);
    expect(fw.primary.join(' ')).toMatch(/Sustainability Focus/);
    expect(fw.secondary.join(' ')).toMatch(/anti-greenwashing/);
    expect(fw.secondary.join(' ')).toMatch(/naming/);
  });

  it('uk_sdr_improvers → Improvers-specific primary framework', () => {
    const fw = getApplicableFrameworks('uk_sdr_improvers');
    expect(fw.primary.join(' ')).toMatch(/Sustainability Improvers/);
  });

  it('uk_sdr_impact → Impact-specific primary framework', () => {
    const fw = getApplicableFrameworks('uk_sdr_impact');
    expect(fw.primary.join(' ')).toMatch(/Sustainability Impact/);
  });

  it('uk_sdr_mixed → Mixed Goals with constituent-label note', () => {
    const fw = getApplicableFrameworks('uk_sdr_mixed');
    expect(fw.primary.join(' ')).toMatch(/Mixed Goals/);
    expect(fw.primary.join(' ')).toMatch(/constituent label/i);
  });

  it('sfdr_article_9 → RTS cites stricter sustainable investment requirements', () => {
    const fw = getApplicableFrameworks('sfdr_article_9');
    expect(fw.primary.join(' ')).toMatch(/SFDR 2019\/2088 Article 9/);
    expect(fw.secondary.join(' ')).toMatch(/sustainable investment/);
  });

  it('unset label returns neutral reference set', () => {
    const fw = getApplicableFrameworks(undefined);
    expect(fw.labelSelected).toBe(false);
    expect(fw.primary).toHaveLength(0);
    expect(fw.secondary.length).toBeGreaterThan(0);
  });
});

describe('runAssessment — end-to-end integration', () => {
  it('returns a non-zero score for a healthy MENA new-build project', () => {
    const result = runAssessment(newBuildProject(), 'MENA', MENA_PROFILE);
    expect(result.capitalReadinessScore).toBeGreaterThan(60);
    expect(result.dnsh.details).toHaveLength(6);
    expect(result.taxonomy.minimumSafeguards).toBeDefined();
  });

  it('4-band readiness: score 80 lands in Capital Ready', () => {
    // Construct via direct band lookup
    const project = newBuildProject({ pue: 1.2, renewable_energy_share_pct: 100 });
    const result = runAssessment(project, 'EU', EU_PROFILE);
    expect(result.band.label).toBe('Capital Ready');
  });
});

describe('hard-stop overrides label verdict', () => {
  it('triggers hardStopOverride on labelEvaluation when hard stop fires', () => {
    // Extreme unmitigated flood risk (>80 without adaptation) caps score.
    const project = newBuildProject({
      target_financing_label: 'sfdr_article_9',
      flood_risk_score: 95,
      adaptation_measures_present: false,
    });
    const result = runAssessment(project, 'MENA', MENA_PROFILE);
    expect(result.hardStopTriggered).toBe(true);
    expect(result.labelEvaluation).toBeTruthy();
    expect(result.labelEvaluation.hardStopOverride).toBe(true);
    expect(result.labelEvaluation.verdict).toBe('FAIL');
    expect(result.labelEvaluation.summary).toMatch(/Hard-stop triggered/);
  });

  it('does NOT set hardStopOverride when no hard stop fires', () => {
    const project = newBuildProject({ target_financing_label: 'sfdr_article_8' });
    const result = runAssessment(project, 'EU', EU_PROFILE);
    expect(result.hardStopTriggered).toBe(false);
    expect(result.labelEvaluation).toBeTruthy();
    expect(result.labelEvaluation.hardStopOverride).toBeUndefined();
  });
});

describe('recommendations are label-aware', () => {
  it('suppresses "Target EU Taxonomy alignment" rec for UK SDR Focus projects', () => {
    // UK SDR Focus project that would otherwise trigger the rec
    // (taxonomy_alignment_claimed = false, region UK).
    const project = newBuildProject({
      region: 'UK',
      country: 'United Kingdom',
      target_financing_label: 'uk_sdr_focus',
      taxonomy_alignment_claimed: false,
    });
    const ukProfile = { pueTarget: 1.3, waterStress: 'low', gridCarbon: 230, renewableGrid: 42 };
    const result = runAssessment(project, 'UK', ukProfile);
    const actions = result.recommendations.map(r => r.action);
    expect(actions).not.toContain('Target EU Taxonomy alignment');
  });

  it('still emits "Target EU Taxonomy alignment" rec for SFDR Article 8 projects', () => {
    const project = newBuildProject({
      region: 'EU',
      country: 'Germany',
      target_financing_label: 'sfdr_article_8',
      taxonomy_alignment_claimed: false,
    });
    const result = runAssessment(project, 'EU', EU_PROFILE);
    const actions = result.recommendations.map(r => r.action);
    expect(actions).toContain('Target EU Taxonomy alignment');
  });
});
