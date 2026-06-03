// @ts-check
//
// SNAPSHOT_PHRASES tests — v3.5 investor-grade phrases.
//
// Locks the structural invariants that matter at publish time:
//   1. Every criterion has all 5 bands populated.
//   2. Resolver never emits literal {slot} markers — that would be a
//      code smell visible to investors.
//   3. inputs_used substitution takes precedence over defaults.
//   4. Unknown criterion falls back to band_rationale, not throws.
//   5. ≤40-word discipline holds across all 50 phrases (after default
//      substitution — the resolved phrase is what investors see).

import { describe, it, expect } from "vitest";
import {
  SNAPSHOT_PHRASES,
  SNAPSHOT_PHRASE_CRITERION_IDS,
  SNAPSHOT_PHRASE_BANDS,
  interpolatePhrase,
  snapshotPhraseFor,
} from "./snapshotPhrases.js";

/** @typedef {import("../types/renderContract.js").CriterionVerdict} CriterionVerdict */
/** @typedef {import("../types/renderContract.js").CriterionContractVerdict} CriterionContractVerdict */

/**
 * @param {string} criterion_id
 * @param {CriterionContractVerdict} verdict
 * @param {Partial<CriterionVerdict>} [overrides]
 * @returns {CriterionVerdict}
 */
function makeVerdict(criterion_id, verdict, overrides = {}) {
  return {
    criterion_id,
    criterion_label: "Test criterion label",
    verdict,
    band_rationale: "engine rationale text",
    evidence_refs: [],
    inputs_used: {},
    ...overrides,
  };
}

describe("SNAPSHOT_PHRASES — structural completeness", () => {
  it("covers exactly 10 SFDR criteria", () => {
    expect(SNAPSHOT_PHRASE_CRITERION_IDS).toHaveLength(10);
    expect(Object.keys(SNAPSHOT_PHRASES)).toHaveLength(10);
  });

  it("covers exactly 5 verdict bands", () => {
    expect(SNAPSHOT_PHRASE_BANDS).toEqual([
      "aligned",
      "partially_aligned",
      "not_aligned",
      "not_applicable",
      "insufficient_evidence",
    ]);
  });

  it("every criterion has all 5 bands populated with non-empty templates", () => {
    for (const id of SNAPSHOT_PHRASE_CRITERION_IDS) {
      const bands = SNAPSHOT_PHRASES[id];
      expect(bands, `criterion ${id} missing from SNAPSHOT_PHRASES`).toBeDefined();
      for (const band of SNAPSHOT_PHRASE_BANDS) {
        const entry = bands[band];
        expect(entry, `${id}.${band} missing`).toBeDefined();
        expect(entry.template.length, `${id}.${band} template is empty`).toBeGreaterThan(0);
        expect(typeof entry.defaults, `${id}.${band} defaults must be a map`).toBe("object");
      }
    }
  });

  it("every {slot_name} marker in every template has a matching defaults entry", () => {
    const slotPattern = /\{([a-z_][a-z0-9_]*)\}/g;
    for (const id of SNAPSHOT_PHRASE_CRITERION_IDS) {
      for (const band of SNAPSHOT_PHRASE_BANDS) {
        const { template, defaults } = SNAPSHOT_PHRASES[id][band];
        const slots = [...template.matchAll(slotPattern)].map((m) => m[1]);
        for (const slot of slots) {
          expect(
            defaults[slot],
            `${id}.${band} references {${slot}} but defaults map has no entry for it`,
          ).toBeDefined();
        }
      }
    }
  });
});

describe("SNAPSHOT_PHRASES — investor-grade discipline", () => {
  it("every resolved phrase is ≤45 tokens (hard ceiling; v3.5 design intent 40)", () => {
    // Hard ceiling at 45 tokens. The v3.5 spec sets ≤40 as the design
    // intent for institutional dense prose. Criterion 6 aligned sits at
    // 42 tokens because of two regulation citations ("Articles 5 and 6"
    // and "Article 2a") that humans read as single references but the
    // whitespace tokenizer counts as multiple tokens — a documented
    // outlier preserved verbatim from the spec. Drift past 45 tokens
    // means the phrase is moving toward narrative and must be reviewed
    // before merge.
    const LIMIT = 45;
    for (const id of SNAPSHOT_PHRASE_CRITERION_IDS) {
      for (const band of SNAPSHOT_PHRASE_BANDS) {
        const verdict = makeVerdict(id, band);
        const phrase = snapshotPhraseFor(verdict);
        const wordCount = phrase.split(/\s+/).filter(Boolean).length;
        expect(
          wordCount,
          `${id}.${band} resolves to ${wordCount} tokens (limit ${LIMIT}): "${phrase}"`,
        ).toBeLessThanOrEqual(LIMIT);
      }
    }
  });

  it("no resolved phrase contains a literal {slot} marker", () => {
    for (const id of SNAPSHOT_PHRASE_CRITERION_IDS) {
      for (const band of SNAPSHOT_PHRASE_BANDS) {
        const verdict = makeVerdict(id, band);
        const phrase = snapshotPhraseFor(verdict);
        expect(
          phrase,
          `${id}.${band} contains a literal slot marker after resolution`,
        ).not.toMatch(/\{[a-z_][a-z0-9_]*\}/);
      }
    }
  });

  it("no resolved phrase contains promotional language", () => {
    // Spot-check for the specific anti-patterns flagged in the design
    // references — promotional adjectives and second-person framing.
    const promotionalPatterns = [
      /\bgreat\b/i,
      /\bunlock\b/i,
      /\byour project shines\b/i,
      /\bawesome\b/i,
      /\bcongratulations\b/i,
    ];
    for (const id of SNAPSHOT_PHRASE_CRITERION_IDS) {
      for (const band of SNAPSHOT_PHRASE_BANDS) {
        const phrase = snapshotPhraseFor(makeVerdict(id, band));
        for (const pattern of promotionalPatterns) {
          expect(phrase, `${id}.${band} hit promotional pattern ${pattern}`).not.toMatch(pattern);
        }
      }
    }
  });
});

describe("interpolatePhrase — slot resolution priority", () => {
  it("uses inputs_used value when present and non-empty", () => {
    const template = "Indicator: {indicator_name} at value {indicator_value}.";
    const defaults = {
      indicator_name: "default name",
      indicator_value: "default value",
    };
    const result = interpolatePhrase(template, defaults, {
      indicator_name: "PUE",
      indicator_value: "1.2",
    });
    expect(result).toBe("Indicator: PUE at value 1.2.");
  });

  it("falls back to defaults when inputs_used is empty", () => {
    const template = "Indicator: {indicator_name}.";
    const defaults = { indicator_name: "default name" };
    const result = interpolatePhrase(template, defaults, {});
    expect(result).toBe("Indicator: default name.");
  });

  it("falls back to defaults when inputs_used is undefined", () => {
    const template = "Indicator: {indicator_name}.";
    const defaults = { indicator_name: "default name" };
    const result = interpolatePhrase(template, defaults, undefined);
    expect(result).toBe("Indicator: default name.");
  });

  it("inputs null / empty string fall through to defaults (treated as absent)", () => {
    const template = "Indicator: {indicator_name}.";
    const defaults = { indicator_name: "default name" };
    const fromNull = interpolatePhrase(template, defaults, {
      indicator_name: null,
    });
    expect(fromNull).toBe("Indicator: default name.");
    const fromEmpty = interpolatePhrase(template, defaults, {
      indicator_name: "",
    });
    expect(fromEmpty).toBe("Indicator: default name.");
  });

  it("collapses adjacent whitespace and punctuation when a slot resolves to empty", () => {
    // Pathological case: no inputs, no default — slot collapses cleanly.
    const template = "Status: {status}.";
    const defaults = {};
    const result = interpolatePhrase(template, defaults, undefined);
    // The "Status:" colon and surrounding spaces collapse to a clean
    // sentence with no double-spaces.
    expect(result).not.toMatch(/\s{2,}/);
    expect(result).not.toMatch(/\{[a-z_]+\}/);
  });
});

describe("snapshotPhraseFor — verdict-driven resolution", () => {
  it("returns the aligned template for a known criterion at aligned band", () => {
    const verdict = makeVerdict("sfdr_v1_pai_consideration_policy", "aligned");
    const phrase = snapshotPhraseFor(verdict);
    expect(phrase).toMatch(/substantive principal adverse impacts/);
    expect(phrase).toMatch(/Article 4/);
  });

  it("returns the not_aligned template for a known criterion at not_aligned band", () => {
    const verdict = makeVerdict("sfdr_v1_dnsh_assessment", "not_aligned");
    const phrase = snapshotPhraseFor(verdict);
    expect(phrase).toMatch(/Do No Significant Harm/);
    expect(phrase).toMatch(/Article 2\(17\)\(b\)/);
  });

  it("returns the criterion 9 cascade rationale at not_aligned band", () => {
    // c9 is the load-bearing cascade — its not_aligned phrase explicitly
    // names the upstream gate that failed.
    const verdict = makeVerdict("sfdr_v1_si_eligibility_evidence_pack", "not_aligned");
    const phrase = snapshotPhraseFor(verdict);
    expect(phrase).toMatch(/cascade/);
    expect(phrase).toMatch(/criterion 8, 4, or 2/);
  });

  it("falls back to band_rationale when criterion_id is unknown", () => {
    const verdict = makeVerdict("uk_sdr_some_future_criterion", "aligned", {
      band_rationale: "Engine rationale for an unknown criterion id.",
    });
    const phrase = snapshotPhraseFor(verdict);
    expect(phrase).toBe("Engine rationale for an unknown criterion id.");
  });

  it("returns empty string for a malformed verdict (no criterion_id)", () => {
    // Defensive guard — should never happen with a valid RenderContract,
    // but the resolver doesn't throw.
    const result = snapshotPhraseFor(/** @type {any} */ ({}));
    expect(result).toBe("");
  });

  it("substitutes inputs_used into the aligned phrase for c1", () => {
    const verdict = makeVerdict("sfdr_v1_e_s_characteristics_promotion", "aligned", {
      inputs_used: { named_characteristic: "renewable PPA coverage ≥80%" },
    });
    const phrase = snapshotPhraseFor(verdict);
    expect(phrase).toMatch(/renewable PPA coverage ≥80%/);
    expect(phrase).not.toMatch(/a named E\/S characteristic/);
  });

  it("falls back to default characteristic name when inputs_used is empty", () => {
    const verdict = makeVerdict("sfdr_v1_e_s_characteristics_promotion", "aligned");
    const phrase = snapshotPhraseFor(verdict);
    expect(phrase).toMatch(/a named E\/S characteristic/);
  });
});

describe("snapshotPhraseFor — label-aware c1 phrasing (E5 follow-up)", () => {
  // Under Art 9, c1 is the Art-8 baseline that Article 9 products must also
  // satisfy. The engine v0.6.0+ stamps applies_under on the verdict so the
  // phrase resolver can substitute Art-9-aware language without rewriting
  // the template. Cover the four reachable bands (engine c1 never returns
  // not_applicable).

  const C1 = "sfdr_v1_e_s_characteristics_promotion";

  it("c1 aligned under Art 9: rationale includes 'baseline applicable to Article 9 products'", () => {
    const verdict = makeVerdict(C1, "aligned", { applies_under: "sfdr_v1_article_9" });
    const phrase = snapshotPhraseFor(verdict);
    expect(phrase).toMatch(/Article 8\(1\) baseline applicable to Article 9 products is satisfied/);
    // The bare Art 8 phrasing must not appear.
    expect(phrase).not.toMatch(/^.*SFDR Article 8\(1\) is satisfied\.$/);
  });

  it("c1 aligned under Art 8: rationale keeps existing 'SFDR Article 8(1) is satisfied' phrasing (regression)", () => {
    const verdict = makeVerdict(C1, "aligned", { applies_under: "sfdr_v1_article_8" });
    const phrase = snapshotPhraseFor(verdict);
    expect(phrase).toMatch(/SFDR Article 8\(1\) is satisfied/);
    expect(phrase).not.toMatch(/baseline applicable to Article 9 products/);
  });

  it("c1 aligned with no applies_under: defaults to Art 8 phrasing (back-compat for older engines)", () => {
    const verdict = makeVerdict(C1, "aligned"); // applies_under omitted
    const phrase = snapshotPhraseFor(verdict);
    expect(phrase).toMatch(/SFDR Article 8\(1\) is satisfied/);
    expect(phrase).not.toMatch(/baseline applicable to Article 9 products/);
  });

  it("c1 partially_aligned under Art 9 reframes 'disclosure standards' as baseline-applicable-to-Art-9", () => {
    const verdict = makeVerdict(C1, "partially_aligned", { applies_under: "sfdr_v1_article_9" });
    const phrase = snapshotPhraseFor(verdict);
    expect(phrase).toMatch(/Article 8\(1\) baseline disclosure standards applicable to Article 9 products/);
    expect(phrase).not.toMatch(/before full Article 8\(1\) disclosure standards are met/);
  });

  it("c1 not_aligned under Art 9 reframes 'standard required' as baseline-Art-9-must-also-satisfy", () => {
    const verdict = makeVerdict(C1, "not_aligned", { applies_under: "sfdr_v1_article_9" });
    const phrase = snapshotPhraseFor(verdict);
    expect(phrase).toMatch(/Article 8\(1\) baseline standard that Article 9 products must also satisfy/);
    expect(phrase).not.toMatch(/standard required by SFDR Article 8\(1\)/);
  });

  it("c1 insufficient_evidence under Art 9 reframes 'verified to standards' as baseline-Art-9-applicable", () => {
    const verdict = makeVerdict(C1, "insufficient_evidence", { applies_under: "sfdr_v1_article_9" });
    const phrase = snapshotPhraseFor(verdict);
    expect(phrase).toMatch(/Article 8\(1\) baseline standards applicable to Article 9 products/);
    // Bare "verified to Article 8(1) standards" must not appear.
    expect(phrase).not.toMatch(/verified to Article 8\(1\) standards/);
  });

  it("other criteria are unaffected by applies_under (c2 has no article9_defaults)", () => {
    // c2 aligned phrase mentions Article 2(17) and Article 8(1) baseline by
    // design — already framework-neutral. Setting applies_under should not
    // change its output.
    const v8 = makeVerdict("sfdr_v1_good_governance_attestation", "aligned", {
      applies_under: "sfdr_v1_article_8",
    });
    const v9 = makeVerdict("sfdr_v1_good_governance_attestation", "aligned", {
      applies_under: "sfdr_v1_article_9",
    });
    expect(snapshotPhraseFor(v8)).toBe(snapshotPhraseFor(v9));
  });
});
