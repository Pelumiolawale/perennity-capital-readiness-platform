// @ts-check
//
// SNAPSHOT_PHRASES — v3.5 investor-grade per-criterion narrative phrases.
//
// 10 SFDR criteria × 5 verdict bands = 50 phrases. Sourced verbatim from
// the v3.5 spec drafted against the 10 v3.5 SFDR criterion definitions.
// Each phrase ≤40 words by design; institutional dense prose at this
// length is the right register, longer phrases drift toward narrative.
//
// ====================================================================
// FREE-TIER GUARD (CLAUDE.md hard rule — architectural, not enforceable
// at the language level):
//
// This module MUST be imported only from paid-flow components — the
// /assessment/report route and its children. Importing from the free
// /assessment/snapshot route or any of its components is a hard-rule
// breach: per CLAUDE.md, a free user must never extract methodology
// version stamps, PAI tables, signature blocks, or anything resembling
// a Second Party Opinion. These phrases are SPO-style narrative and
// belong exclusively to the paid Report tier.
// ====================================================================
//
// Slot interpolation convention:
//   1. Templates contain {slot_name} markers.
//   2. Resolution priority:
//      a. verdict.inputs_used[slot_name] — if the engine populates it
//         with a structured value (post-1.4b: today the engine emits
//         an empty inputs_used; defaults exclusively apply).
//      b. defaults[slot_name] — the fallback phrasing shown in
//         parentheses in the spec.
//      c. empty string — only as a last resort; templates have been
//         drafted so that every slot has a default.
//   3. Literal {slot_name} never appears in production output — that
//      would be a code smell visible to investors. The interpolator
//      always substitutes or strips.
//
// Engine source of truth for the consumed shape:
//   src/lib/renderContract.ts in the engine repo (v0.5.0-alpha.6+).

/** @typedef {import("../types/renderContract.js").CriterionVerdict} CriterionVerdict */
/** @typedef {import("../types/renderContract.js").CriterionContractVerdict} CriterionContractVerdict */

/**
 * @typedef {Object} BandPhrase
 * @property {string} template
 * @property {Record<string, string>} defaults
 * @property {Record<string, string>} [article9_defaults] Slot overrides that
 *   apply when the verdict's `applies_under === "sfdr_v1_article_9"`. Engine
 *   v0.6.0+ stamps applies_under on every SFDR CriterionVerdict; this map
 *   lets shared criteria (e.g. c1, the Art-8 baseline that Art 9 products
 *   also satisfy) render Art-9-aware phrasing without rewriting the
 *   template. Empty / undefined defaults to the Art 8 phrasing.
 */

/**
 * @typedef {Record<CriterionContractVerdict, BandPhrase>} CriterionBands
 */

/**
 * All 10 criteria × 5 bands. Templates are verbatim from the v3.5 spec
 * with the inline ", default: '...'" notation factored into the
 * `defaults` map; slot markers `{slot_name}` are preserved unchanged.
 *
 * @type {Record<string, CriterionBands>}
 */
export const SNAPSHOT_PHRASES = {
  // ====================================================================
  // Criterion 1 — sfdr_v1_e_s_characteristics_promotion
  // ====================================================================
  sfdr_v1_e_s_characteristics_promotion: {
    aligned: {
      template:
        "The project demonstrates the promotion of a named environmental or social characteristic ({named_characteristic}), with a documented mechanism of advancement and governance arrangements to maintain it over the product life. {regulatory_satisfaction}",
      defaults: {
        named_characteristic: "a named E/S characteristic",
        regulatory_satisfaction: "SFDR Article 8(1) is satisfied.",
      },
      article9_defaults: {
        regulatory_satisfaction:
          "The SFDR Article 8(1) baseline applicable to Article 9 products is satisfied.",
      },
    },
    partially_aligned: {
      template:
        "The project promotes a named environmental or social characteristic, with {gap_summary} remaining before full {regulatory_disclosure_standard} are met.",
      defaults: {
        gap_summary:
          "incomplete documentation of the advancement mechanism or maintenance governance",
        regulatory_disclosure_standard: "Article 8(1) disclosure standards",
      },
      article9_defaults: {
        regulatory_disclosure_standard:
          "Article 8(1) baseline disclosure standards applicable to Article 9 products",
      },
    },
    not_aligned: {
      template:
        "The project does not demonstrate the promotion of an identifiable environmental or social characteristic to the {regulatory_standard}; {primary_gap}.",
      defaults: {
        primary_gap:
          "no specific E/S characteristic is named, or its advancement mechanism is not documented",
        regulatory_standard: "standard required by SFDR Article 8(1)",
      },
      article9_defaults: {
        regulatory_standard:
          "Article 8(1) baseline standard that Article 9 products must also satisfy",
      },
    },
    not_applicable: {
      template:
        "The engagement scope excludes Article 8 promotion testing. This criterion is not assessed for the target label selected.",
      defaults: {},
    },
    insufficient_evidence: {
      template:
        "The project's E/S characteristics framing cannot be verified to {regulatory_verification_standard} from inputs supplied; {missing_inputs}.",
      defaults: {
        missing_inputs:
          "the named characteristic, advancement mechanism, or governance arrangement is not in evidence",
        regulatory_verification_standard: "Article 8(1) standards",
      },
      article9_defaults: {
        regulatory_verification_standard:
          "Article 8(1) baseline standards applicable to Article 9 products",
      },
    },
  },

  // ====================================================================
  // Criterion 2 — sfdr_v1_good_governance_attestation
  // ====================================================================
  sfdr_v1_good_governance_attestation: {
    aligned: {
      template:
        "The developer's parent entity demonstrates good governance across management structures, employee relations, remuneration, and tax compliance, consistent with the SFDR Article 2(17) constituent and Article 8(1) baseline requirement.",
      defaults: {},
    },
    partially_aligned: {
      template:
        "The developer's parent entity documents good governance practices, with {gap_summary} remaining before unqualified attestation.",
      defaults: {
        gap_summary:
          "one or more constituents of the Article 2(17) good-governance test not fully evidenced",
      },
    },
    not_aligned: {
      template:
        "The developer's parent entity does not satisfy the good-governance constituent of SFDR Article 2(17); {primary_gap}.",
      defaults: {
        primary_gap:
          "material weakness identified in management structures, employee relations, remuneration practices, or tax compliance",
      },
    },
    not_applicable: {
      template:
        "The engagement scope excludes entity-level good-governance assessment. This criterion is not assessed for the target label selected.",
      defaults: {},
    },
    insufficient_evidence: {
      template:
        "Good governance cannot be attested from inputs supplied; {missing_inputs}.",
      defaults: {
        missing_inputs:
          "documentation of management structures, employee relations, remuneration, or tax compliance is incomplete",
      },
    },
  },

  // ====================================================================
  // Criterion 3 — sfdr_v1_pai_consideration_policy
  // ====================================================================
  sfdr_v1_pai_consideration_policy: {
    aligned: {
      template:
        "The developer maintains a substantive principal adverse impacts consideration policy with named indicators tracked, consistent with SFDR Article 4 and the mandatory PAI table at Commission Delegated Regulation (EU) 2022/1288 Annex I.",
      defaults: {},
    },
    partially_aligned: {
      template:
        "The developer documents a principal adverse impacts policy, with {gap_summary} outstanding.",
      defaults: {
        gap_summary:
          "incomplete coverage of mandatory Annex I indicators, or a comply-or-explain stance on indicators that PB scoring expects to be substantively tracked",
      },
    },
    not_aligned: {
      template:
        "The developer has not established a principal adverse impacts consideration policy meeting SFDR Article 4 expectations; {primary_gap}.",
      defaults: {
        primary_gap:
          "no documented policy, or the policy is a bare comply-or-explain statement without substantive indicator tracking",
      },
    },
    not_applicable: {
      template:
        "The engagement scope excludes entity-level PAI policy assessment. This criterion is not assessed for the target label selected.",
      defaults: {},
    },
    insufficient_evidence: {
      template:
        "The PAI consideration policy cannot be verified from inputs supplied; {missing_inputs}.",
      defaults: {
        missing_inputs:
          "the policy document, indicator scope, or governance arrangement is not in evidence",
      },
    },
  },

  // ====================================================================
  // Criterion 4 — sfdr_v1_dnsh_assessment
  // ====================================================================
  sfdr_v1_dnsh_assessment: {
    aligned: {
      template:
        "The project demonstrates Do No Significant Harm against all six environmental objectives at the threshold required by SFDR Article 2(17)(b), with primary evidence on {load_bearing_objectives}.",
      defaults: {
        load_bearing_objectives:
          "energy efficiency, water use, and biodiversity",
      },
    },
    partially_aligned: {
      template:
        "The project demonstrates Do No Significant Harm at the no-harm threshold but not at the investor-grade aligned tier; {tier_gap}.",
      defaults: {
        tier_gap:
          "one or more objectives meet industry-standard thresholds without reaching the PB-aligned calibration — typically PUE or WUE at the cool/warm climate-conditional band",
      },
    },
    not_aligned: {
      template:
        "The project does not satisfy the Do No Significant Harm standard required by SFDR Article 2(17)(b); {primary_breach}.",
      defaults: {
        primary_breach:
          "a threshold breach is identified on at least one environmental objective",
      },
    },
    not_applicable: {
      template:
        "The engagement scope excludes DNSH testing. This criterion is not assessed for the target label selected.",
      defaults: {},
    },
    insufficient_evidence: {
      template:
        "DNSH cannot be verified from inputs supplied; {missing_inputs}.",
      defaults: {
        missing_inputs:
          "project-level evidence on energy efficiency, water use, biodiversity siting, or hazardous waste handling is incomplete",
      },
    },
  },

  // ====================================================================
  // Criterion 5 — sfdr_v1_pre_contractual_disclosure
  // ====================================================================
  sfdr_v1_pre_contractual_disclosure: {
    aligned: {
      template:
        "The developer's pre-contractual documentation discloses all SFDR-mandated content — the E/S characteristic or sustainable investment objective, investment strategy, reference benchmarks where applicable, and sustainability risk integration — consistent with Commission Delegated Regulation (EU) 2022/1288 Annex II / III.",
      defaults: {},
    },
    partially_aligned: {
      template:
        "The developer's pre-contractual documentation addresses SFDR disclosure scope, with {gap_summary} remaining before unqualified compliance.",
      defaults: {
        gap_summary:
          "one or more Annex II / III template sections incomplete or not fully traceable to evidence",
      },
    },
    not_aligned: {
      template:
        "The developer's pre-contractual documentation does not meet SFDR Article 6 and Article 8 disclosure standards; {primary_gap}.",
      defaults: {
        primary_gap:
          "the E/S characteristic or SI objective, investment strategy, or sustainability risk integration is not disclosed at the required granularity",
      },
    },
    not_applicable: {
      template:
        "The engagement scope excludes pre-contractual disclosure testing. This criterion is not assessed for the target label selected.",
      defaults: {},
    },
    insufficient_evidence: {
      template:
        "Pre-contractual disclosure compliance cannot be verified from inputs supplied; {missing_inputs}.",
      defaults: {
        missing_inputs:
          "the pre-contractual template, investment strategy documentation, or sustainability risk policy is not in evidence",
      },
    },
  },

  // ====================================================================
  // Criterion 6 — sfdr_v1_taxonomy_alignment_disclosure
  // ====================================================================
  sfdr_v1_taxonomy_alignment_disclosure: {
    aligned: {
      template:
        "The project documents a defensible EU Taxonomy alignment proportion with explicit numerical disclosure, consistent with Regulation (EU) 2020/852 Articles 5 and 6 and the SFDR Article 2a interface. A disclosed proportion of zero satisfies the criterion where the underlying calculation is documented.",
      defaults: {},
    },
    partially_aligned: {
      template:
        "The project discloses an EU Taxonomy alignment proportion, with {gap_summary} remaining before unqualified disclosure.",
      defaults: {
        gap_summary:
          "the underlying calculation methodology or activity attribution not fully traceable to the regulatory technical screening criteria",
      },
    },
    not_aligned: {
      template:
        "The project does not disclose an EU Taxonomy alignment proportion at the standard required by SFDR Article 2a; {primary_gap}.",
      defaults: {
        primary_gap:
          "no numerical disclosure is made, or the disclosure is not traceable to a defensible activity attribution",
      },
    },
    not_applicable: {
      template:
        "The engagement scope excludes EU Taxonomy alignment disclosure. This criterion is not assessed for the target label selected.",
      defaults: {},
    },
    insufficient_evidence: {
      template:
        "EU Taxonomy alignment disclosure cannot be verified from inputs supplied; {missing_inputs}.",
      defaults: {
        missing_inputs:
          "the numerical proportion, underlying methodology, or activity-level attribution is not in evidence",
      },
    },
  },

  // ====================================================================
  // Criterion 7 — sfdr_v1_periodic_reporting_commitment
  // ====================================================================
  sfdr_v1_periodic_reporting_commitment: {
    aligned: {
      template:
        "The developer has committed to and operationalised the SFDR Article 11 periodic reporting obligation, with annual disclosure of attainment against the pre-contractual template, consistent with Commission Delegated Regulation (EU) 2022/1288 Annex IV / V.",
      defaults: {},
    },
    partially_aligned: {
      template:
        "The developer has committed to SFDR Article 11 periodic reporting, with {gap_summary} remaining before unqualified compliance.",
      defaults: {
        gap_summary:
          "the operationalising governance, reporting cadence, or template traceability not fully evidenced",
      },
    },
    not_aligned: {
      template:
        "The developer has not made a credible commitment to SFDR Article 11 periodic reporting; {primary_gap}.",
      defaults: {
        primary_gap:
          "no documented reporting obligation, or no governance arrangement to operationalise the Annex IV / V template",
      },
    },
    not_applicable: {
      template:
        "The engagement scope excludes periodic reporting commitment testing. This criterion is not assessed for the target label selected.",
      defaults: {},
    },
    insufficient_evidence: {
      template:
        "Periodic reporting commitment cannot be verified from inputs supplied; {missing_inputs}.",
      defaults: {
        missing_inputs:
          "the reporting policy, governance arrangement, or template traceability is not in evidence",
      },
    },
  },

  // ====================================================================
  // Criterion 8 — sfdr_v1_si_objective_qualification
  // ====================================================================
  sfdr_v1_si_objective_qualification: {
    aligned: {
      template:
        "The project's sustainable investment objective is named, mappable to a recognised environmental or social taxonomy, evidenced as load-bearing to the deal thesis, and supported by {indicator_count}. SFDR Article 9(1)/(2)/(3) and Article 2(17) are satisfied at project level.",
      defaults: {
        indicator_count: "at least three quantified contribution indicators",
      },
    },
    partially_aligned: {
      template:
        "The project documents a sustainable investment objective with measurable contribution, with {gap_summary} remaining before unqualified Article 9 qualification.",
      defaults: {
        gap_summary:
          "fewer than three quantified contribution indicators, or the dominance test partially evidenced against one of conditions (a)/(b)/(c)",
      },
    },
    not_aligned: {
      template:
        "The project does not qualify under SFDR Article 9 at project level; {primary_gap}.",
      defaults: {
        primary_gap:
          "the named SI objective is not load-bearing to the deal thesis, lacks quantified contribution indicators, or fails the dominance test under conditions (a)/(b)/(c)",
      },
    },
    not_applicable: {
      template:
        "The engagement scope is Article 8 only. SI objective qualification is not assessed for the target label selected.",
      defaults: {},
    },
    insufficient_evidence: {
      template:
        "The sustainable investment objective qualification cannot be verified from inputs supplied; {missing_inputs}.",
      defaults: {
        missing_inputs:
          "the named objective, taxonomy mapping, quantified indicators, or dominance-test evidence is incomplete",
      },
    },
  },

  // ====================================================================
  // Criterion 9 — sfdr_v1_si_eligibility_evidence_pack
  // ====================================================================
  sfdr_v1_si_eligibility_evidence_pack: {
    aligned: {
      template:
        "The project's SI-eligibility evidence pack is complete and FMP-liftable: contribution attestation, DNSH attestation, good-governance attestation, machine-readable PAI data, and documentation completeness all satisfy the Article 2(17) gates at investor-grade quality.",
      defaults: {},
    },
    partially_aligned: {
      template:
        "The project's SI-eligibility evidence pack is substantially complete, with {gap_summary} remaining before unqualified FMP lift.",
      defaults: {
        gap_summary:
          "one or more pack components — contribution, DNSH, governance, PAI data, or documentation completeness — evidenced at standard but not investor-grade quality",
      },
    },
    not_aligned: {
      template:
        "The project's SI-eligibility evidence pack does not satisfy Article 2(17) gates at the level required for FMP lift; {cascade_trigger}.",
      defaults: {
        cascade_trigger:
          "cascade from criterion 8, 4, or 2 forces this verdict — the underlying Article 2(17) test has failed",
      },
    },
    not_applicable: {
      template:
        "The engagement scope is Article 8 only. SI-eligibility evidence pack assembly is not assessed for the target label selected.",
      defaults: {},
    },
    insufficient_evidence: {
      template:
        "The SI-eligibility evidence pack cannot be assembled from inputs supplied; {missing_components}.",
      defaults: {
        missing_components:
          "one or more of the five pack components — contribution attestation, DNSH attestation, governance attestation, PAI data, documentation completeness — is incomplete or not in evidence",
      },
    },
  },

  // ====================================================================
  // Criterion 10 — sfdr_v1_project_pai_data_provision
  // ====================================================================
  sfdr_v1_project_pai_data_provision: {
    aligned: {
      template:
        "The project provides machine-readable PAI data across the 11 material indicators with measured or credibly projected values, methodology references, and third-party verification on {verified_count}. Consistent with Commission Delegated Regulation (EU) 2022/1288 Annex I Table 1 and SFDR Article 7.",
      defaults: { verified_count: "the threshold proportion" },
    },
    partially_aligned: {
      template:
        "The project provides PAI data across the 11 material indicators, with {gap_summary} outstanding.",
      defaults: {
        gap_summary:
          "fewer than nine of eleven indicators third-party verified where the entity-level Article 4 policy is partially aligned, capping the verdict at this tier under the verification-gate rule",
      },
    },
    not_aligned: {
      template:
        "The project does not provide PAI data at the level required by SFDR Article 7 and Annex I Table 1; {primary_gap}.",
      defaults: {
        primary_gap:
          "one or more material indicators lack measured value, methodology reference, or verifier identity at the required granularity",
      },
    },
    not_applicable: {
      template:
        "The engagement scope is Article 8 only. Project-level PAI data provision is not assessed for the target label selected.",
      defaults: {},
    },
    insufficient_evidence: {
      template:
        "Project-level PAI data provision cannot be verified from inputs supplied; {missing_inputs}.",
      defaults: {
        missing_inputs:
          "measured values, methodology references, measurement periods, or verifier identity are incomplete across one or more of the 11 material PAI indicators",
      },
    },
  },
};

/**
 * The ten SFDR criterion IDs covered by SNAPSHOT_PHRASES. Exported as a
 * frozen array so consumers can iterate deterministically without
 * recomputing from Object.keys (which is insertion-ordered in modern
 * JS but reads less explicitly).
 *
 * @type {readonly string[]}
 */
export const SNAPSHOT_PHRASE_CRITERION_IDS = Object.freeze([
  "sfdr_v1_e_s_characteristics_promotion",
  "sfdr_v1_good_governance_attestation",
  "sfdr_v1_pai_consideration_policy",
  "sfdr_v1_dnsh_assessment",
  "sfdr_v1_pre_contractual_disclosure",
  "sfdr_v1_taxonomy_alignment_disclosure",
  "sfdr_v1_periodic_reporting_commitment",
  "sfdr_v1_si_objective_qualification",
  "sfdr_v1_si_eligibility_evidence_pack",
  "sfdr_v1_project_pai_data_provision",
]);

/**
 * The five criterion-level verdict bands SNAPSHOT_PHRASES covers.
 * @type {readonly import("../types/renderContract.js").CriterionContractVerdict[]}
 */
export const SNAPSHOT_PHRASE_BANDS = Object.freeze([
  "aligned",
  "partially_aligned",
  "not_aligned",
  "not_applicable",
  "insufficient_evidence",
]);

const SLOT_PATTERN = /\{([a-z_][a-z0-9_]*)\}/g;

/**
 * Substitute {slot} markers in a template. Resolution priority:
 *   1. inputs[slot] (if provided and non-null/undefined/empty string)
 *   2. defaults[slot]
 *   3. empty string (last resort — should never occur for spec-compliant
 *      phrases, all of which have either no slots or full defaults)
 *
 * Literal {slot} never reaches output: unresolved slots collapse to ""
 * with adjacent whitespace normalised so the surrounding sentence
 * stays clean.
 *
 * @param {string} template
 * @param {Record<string, string>} defaults
 * @param {Record<string, unknown> | undefined} inputs
 * @returns {string}
 */
export function interpolatePhrase(template, defaults, inputs) {
  const substituted = template.replace(SLOT_PATTERN, (_match, name) => {
    const fromInputs = inputs ? inputs[name] : undefined;
    if (fromInputs !== undefined && fromInputs !== null && fromInputs !== "") {
      return String(fromInputs);
    }
    const fromDefaults = defaults[name];
    if (fromDefaults !== undefined && fromDefaults !== "") {
      return fromDefaults;
    }
    return "";
  });
  // Collapse any double spaces or stray " ;" / " ." patterns that an
  // empty substitution can leave behind. Sentences from the spec are
  // drafted so that every slot has a default, so this is a belt-and-
  // braces clean-up rather than expected behaviour.
  return substituted
    .replace(/\s+;/g, ";")
    .replace(/\s+\./g, ".")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Resolve the investor-grade phrase for a given CriterionVerdict. If the
 * criterion_id is unknown (e.g. the engine ships a new SFDR criterion
 * before the SPA picks up matching phrases), falls back to the verdict's
 * own band_rationale — which is non-empty by RenderContract invariant
 * and acceptable in the institutional register.
 *
 * @param {CriterionVerdict} verdict
 * @returns {string}
 */
export function snapshotPhraseFor(verdict) {
  if (!verdict || typeof verdict.criterion_id !== "string") {
    return "";
  }
  const bands = SNAPSHOT_PHRASES[verdict.criterion_id];
  if (!bands) {
    return verdict.band_rationale || "";
  }
  const band = bands[verdict.verdict];
  if (!band) {
    return verdict.band_rationale || "";
  }
  // Engine v0.6.0+ stamps applies_under on every SFDR verdict. When the
  // criterion's phrase block declares article9_defaults and the verdict
  // was produced under Art 9, merge them over defaults so Art-9-aware
  // slot values win. Falls back to the Art 8 phrasing in every other
  // case (no applies_under, no article9_defaults, or Art 8).
  const effectiveDefaults =
    verdict.applies_under === "sfdr_v1_article_9" && band.article9_defaults
      ? { ...band.defaults, ...band.article9_defaults }
      : band.defaults;
  return interpolatePhrase(band.template, effectiveDefaults, verdict.inputs_used);
}
