// ============================================================
// TARGET FINANCING LABEL — CATALOG
//
// Day 4 commit 2: the mapping half (FRAMEWORK_MAPPING +
// getApplicableFrameworks + flattenFrameworks) has been removed alongside the
// legacy scoring engine. Regulatory routing is now exclusively the engine's
// responsibility.
//
// The label catalog is preserved as intake UI metadata. Consumers can import
// FINANCING_LABELS to render a Target Financing Label selector when the new
// IntakeWizard grows past its Activity 8.1-focused Day 3 scope.
//
// Methodology version: v3.1, April 2026.
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
