// @ts-check
//
// RenderContract — JSDoc typedef mirror of the engine's canonical render
// contract shape. The engine (Perennity_regulatory_frameworks) emits this
// shape from `buildRenderContract(run, opts?)` at v0.5.0-alpha.6+. This
// file mirrors the shape locally so the SPA can type-check consuming code
// against a stable, app-owned reference rather than tightly coupling to
// the engine's import path.
//
// The engine type source of truth: src/lib/renderContract.ts in the engine
// repo. When the engine bumps schema_version, update this file in lockstep.
// Mismatches are caught by consumer JSDoc type errors at @ts-check time.
//
// This file declares types only — no runtime exports. Importing it is
// purely a typedef side-effect for @ts-check consumers.

/**
 * @typedef {"sfdr_v1_article_8" | "sfdr_v1_article_9" | "sfdr_v1_article_8_and_9"} SupportedRenderLabel
 */

/**
 * Criterion-level band union. Excludes "no_harm" — that is a per-PAI
 * internal verdict inside DNSH evaluation, not a criterion-level band.
 * @typedef {"aligned" | "partially_aligned" | "not_aligned" | "not_applicable" | "insufficient_evidence"} CriterionContractVerdict
 */

/**
 * @typedef {Object} NumericValue
 * @property {number} value
 * @property {string} unit
 * @property {string} label
 */

/**
 * @typedef {Object} CriterionVerdict
 * @property {string} criterion_id
 * @property {string} criterion_label
 * @property {CriterionContractVerdict} verdict
 * @property {string} band_rationale
 * @property {string[]} evidence_refs
 * @property {Record<string, unknown>} inputs_used
 * @property {NumericValue} [numeric_value]
 * @property {string} [not_applicable_rationale]
 * @property {string} [applies_under] Framework id under which this verdict
 *   was produced (e.g. "sfdr_v1_article_8" / "sfdr_v1_article_9"). Engine
 *   v0.6.0+ stamps this from the SFDR orchestrator's framework_id so
 *   consumers can route label-aware narrative without re-deriving from
 *   the parent FrameworkResult. snapshotPhrases.js branches on this for
 *   c1 (the Art-8-baseline criterion shared with Art 9 products).
 */

/**
 * @typedef {Object} FrameworkFinding
 * @property {"sfdr_art8" | "sfdr_art9"} framework
 * @property {CriterionVerdict[]} criteria
 */

/**
 * @typedef {Object} ProjectMetadata
 * @property {string} project_id
 * @property {string} project_name
 * @property {string} jurisdiction
 * @property {SupportedRenderLabel} target_label
 */

/**
 * @typedef {Object} RenderEvidenceReference
 * @property {string} ref_id
 * @property {string[]} cited_by
 */

/**
 * @typedef {"SFDR_2022_1288_Annex_I_Table_1"} PAISchemaSource
 */

/**
 * @typedef {"third_party_assured" | "management_attested" | "unverified" | "not_applicable"} VerificationStatus
 */

/**
 * @typedef {Object} PAIRow
 * @property {number} pai_number
 * @property {string} indicator_name
 * @property {string} metric_definition
 * @property {number | string | null} value
 * @property {string} unit
 * @property {string} data_source
 * @property {string} methodology_note
 * @property {VerificationStatus} verification_status
 * @property {"applicable" | "not_applicable"} applicability
 * @property {string} [applicability_rationale]
 * @property {string} [data_unavailable_rationale]
 */

/**
 * @typedef {Object} PAIDataFile
 * @property {PAISchemaSource} schema_source
 * @property {string} reporting_period
 * @property {PAIRow[]} rows
 */

/**
 * @typedef {Object} RenderContract
 * @property {"1.0.0"} schema_version
 * @property {string} methodology_version
 * @property {string} generated_at
 * @property {ProjectMetadata} project
 * @property {FrameworkFinding[]} framework_findings
 * @property {PAIDataFile} pai_data_file
 * @property {RenderEvidenceReference[]} evidence_index
 * @property {"calibration_pending"} overall_verdict
 */

// Re-export marker — empty object keeps the module a valid ES module
// without exporting any runtime values. Consumers import only the typedefs
// via JSDoc `@typedef {import("../types/renderContract.js").Foo} Foo`.
export {};
