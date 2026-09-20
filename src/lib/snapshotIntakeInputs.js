// @ts-check
// FREE TIER. Used by src/components/IntakeWizard.jsx.
//
// Builds the engine's `data_points` from the wizard's form state.
//
// Extracted from the component so it can be driven through the real engine in
// a test. That matters more than it sounds: the two defects this module was
// created to fix were invisible in the submitted object and only showed up as
// a verdict, and the first version of the test reimplemented this function
// rather than calling it — which would have gone green against a regressed
// wizard. One source of truth, tested directly.
//
// THE RULE THIS FILE FOLLOWS. The engine treats `undefined` as "no input" and
// every other value as an answer. So a key is emitted only when the prospect
// actually answered:
//
//   - A blank cell is never sent as `null`, `false`, `""` or `[]`.
//   - An unticked attestation checkbox means "has not attested", which is not
//     the same claim as "has told us it is false", and must not be sent as
//     `false`.
//
// Both halves of that were being broken here. `ecocc_practices_implemented: []`
// scored a FAIL — "No European Code of Conduct practices recorded as
// implemented" — for a question the wizard never asks. And
// `climate_risk_assessment_completed: false` scored a FAIL — "Climate risk
// vulnerability assessment has not been completed" — on an untouched form. Both
// were fixed on the paid path (ITEM-03, ITEM-04) and never swept here, so every
// prospect who ran a free snapshot collected two asserted failures they had
// never been asked about, in the document meant to start a commercial
// conversation.

/**
 * @typedef {Object} SnapshotIntakeForm
 * @property {number} [annualised_pue]
 * @property {number} [wue_annualised]
 * @property {string} [site_water_stress_classification]
 * @property {boolean} [climate_risk_assessment_completed]
 * @property {string} [climate_risk_assessment_methodology]
 * @property {boolean} [pue_measurement_compliance_attested]
 * @property {string[]} [human_rights_compliance_items]
 * @property {string[]} [bribery_corruption_compliance_items]
 * @property {string[]} [taxation_compliance_items]
 * @property {string[]} [fair_competition_compliance_items]
 */

/**
 * The four claims the PUE attestation checkbox makes on the prospect's behalf.
 *
 * These are NOT invented. They are exactly the sentence the checkbox's own
 * label puts to the user — "PUE measured per EN 50600-4-2, Category 2, with
 * documented boundary and annualised reporting." One tick standing for one
 * stated sentence is an attestation, not a fabrication.
 *
 * They are only defensible while the label still says it. If that label
 * changes and this does not, the tick starts meaning something the user was
 * never shown. Kept here, beside the rule, so the two move together.
 */
export const PUE_ATTESTATION_CLAIMS = Object.freeze({
  pue_measurement_methodology_declared: "EN_50600_4_2",
  pue_measurement_category: "category_2",
  pue_measurement_boundary_documented: true,
  pue_reporting_basis: "annualised",
});

/**
 * Build the engine's data_points from the wizard's form state.
 *
 * @param {SnapshotIntakeForm} form
 * @returns {Record<string, unknown>}
 */
export function buildSnapshotDataPoints(form) {
  /** @type {Record<string, unknown>} */
  const data_points = {
    annualised_pue: form.annualised_pue,
    wue_annualised: form.wue_annualised,
    site_water_stress_classification: form.site_water_stress_classification,
    human_rights_compliance_items: form.human_rights_compliance_items ?? [],
    bribery_corruption_compliance_items:
      form.bribery_corruption_compliance_items ?? [],
    taxation_compliance_items: form.taxation_compliance_items ?? [],
    fair_competition_compliance_items:
      form.fair_competition_compliance_items ?? [],
  };

  // ECoCC practices are not collected by this wizard at all, so the key is
  // never sent. It used to be sent as [], which the engine reads as a finding
  // of zero practices rather than as a question nobody asked.

  // The climate-risk checkbox is an attestation. Unticked means the prospect
  // has not attested — not that they have told us the assessment was never
  // done — so it is sent only when ticked.
  if (form.climate_risk_assessment_completed) {
    data_points.climate_risk_assessment_completed = true;
    const methodology = (form.climate_risk_assessment_methodology || "").trim();
    if (methodology.length > 0) {
      data_points.climate_risk_assessment_methodology = methodology;
    }
  }

  // Same rule: unchecked is no claim, which the engine correctly reports as
  // data_missing. We do not fabricate a failure, and we do not fabricate a
  // pass either — see PUE_ATTESTATION_CLAIMS.
  if (form.pue_measurement_compliance_attested) {
    Object.assign(data_points, PUE_ATTESTATION_CLAIMS);
  }

  return data_points;
}
