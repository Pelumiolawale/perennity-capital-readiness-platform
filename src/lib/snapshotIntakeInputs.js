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
//   - A blank cell is never sent as `null`, `false`, `""`, `0` or `[]`.
//   - An unticked attestation checkbox means "has not attested", which is not
//     the same claim as "has told us it is false", and must not be sent as
//     `false`.
//   - An untouched checkbox group is not an answer either. But a group the
//     prospect HAS worked through and left empty is one — "none of these" is
//     a real thing to say. The two are distinguished by `undefined` versus
//     `[]`, which is why the wizard starts these arrays undefined rather than
//     empty. See omitBlanks in airtableEngagement.js, which keeps `[]` for
//     exactly the same reason.
//
// WHAT THIS FILE HAS HAD TO FIX, in order, because the shape recurs:
//
//   ecocc_practices_implemented: []          -> "No European Code of Conduct
//                                               practices recorded as
//                                               implemented."  (fail)
//   climate_risk_assessment_completed: false -> "Climate risk vulnerability
//                                               assessment has not been
//                                               completed."    (fail)
//
// Both were fixed on the paid path (ITEM-03, ITEM-04) and never swept here, so
// every prospect who ran a free snapshot collected two asserted failures they
// had never been asked about, in the document meant to start a commercial
// conversation.
//
// The sweep that followed found the mirror image of that problem — the wizard
// was not only asserting failures nobody stated, it was asserting PASSES
// nobody stated. All four safeguards groups shipped with every box already
// ticked, and PUE, WUE and water stress came pre-filled with values that clear
// their thresholds. An untouched form scored as a compliant project. On a
// free lead-generation tool, an out-of-the-box answer that flatters the
// prospect is worse than a wrong one: it is the number they remember.

/**
 * @typedef {Object} SnapshotIntakeForm
 * @property {number|string} [annualised_pue]
 * @property {number|string} [wue_annualised]
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

/** The four safeguards groups, and the data_point key each one feeds. */
export const SAFEGUARDS_KEYS = Object.freeze([
  "human_rights_compliance_items",
  "bribery_corruption_compliance_items",
  "taxation_compliance_items",
  "fair_competition_compliance_items",
]);

/**
 * The wizard's opening state for every field that feeds `data_points`.
 *
 * Exported and spread into IntakeWizard's useState rather than written there,
 * so a test can assert what an untouched form actually produces instead of
 * restating what it is assumed to produce. The first version of the test that
 * covered this restated the defaults, which meant it would have gone green
 * against the very wizard it was supposed to be checking — the same mirror
 * defect this module was extracted to remove.
 *
 * Every value here is "unanswered". That is the point: nothing in this object
 * is a claim about the prospect.
 */
export const INITIAL_INTAKE_ANSWERS = Object.freeze({
  annualised_pue: "",
  wue_annualised: "",
  site_water_stress_classification: "",
  climate_risk_assessment_completed: false,
  climate_risk_assessment_methodology: "",
  pue_measurement_compliance_attested: false,
  human_rights_compliance_items: undefined,
  bribery_corruption_compliance_items: undefined,
  taxation_compliance_items: undefined,
  fair_competition_compliance_items: undefined,
});

/**
 * A number the prospect actually typed, or undefined.
 *
 * The wizard's number inputs used to coerce with `Number(e.target.value)`,
 * and `Number("")` is 0 — so clearing the PUE box submitted a PUE of zero,
 * which clears every efficiency threshold in the methodology. That is the
 * same defect as the blank WUE that passed the DNSH water test on the paid
 * path, reached by a different route.
 *
 * @param {unknown} value
 * @returns {number|undefined}
 */
function answeredNumber(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Build the engine's data_points from the wizard's form state.
 *
 * @param {SnapshotIntakeForm} form
 * @returns {Record<string, unknown>}
 */
export function buildSnapshotDataPoints(form) {
  /** @type {Record<string, unknown>} */
  const data_points = {};

  // Numbers: sent only when typed. See answeredNumber.
  const pue = answeredNumber(form.annualised_pue);
  if (pue !== undefined) data_points.annualised_pue = pue;

  const wue = answeredNumber(form.wue_annualised);
  if (wue !== undefined) data_points.wue_annualised = wue;

  // Water stress defaulted to "Low" — the most favourable of five options,
  // and the one that keeps the WUE threshold from applying at all. The
  // dropdown now starts unanswered.
  const waterStress = (form.site_water_stress_classification || "").trim();
  if (waterStress.length > 0) {
    data_points.site_water_stress_classification = waterStress;
  }

  // Safeguards: undefined until the prospect touches the group, then whatever
  // is ticked — including [] once they have engaged and ticked nothing, which
  // is a real answer and scores as one.
  for (const key of SAFEGUARDS_KEYS) {
    const value = form[key];
    if (Array.isArray(value)) data_points[key] = value;
  }

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
