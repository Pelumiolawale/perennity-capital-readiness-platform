// @ts-check
/**
 * Target label → engine framework set. Shared by the free Snapshot and the paid
 * Report, and deliberately free of `import.meta.env` so that Node scripts
 * (scripts/rescore.mjs) can load it. engineClient.js re-exports everything here;
 * application code keeps importing from there.
 *
 * @typedef {import('@perennity/engine').AnyFramework} AnyFramework
 * @typedef {import('./targetLabels.js').TargetLabel} TargetLabel
 */
import {
  BUNDLED_ACTIVITIES,
  BUNDLED_SFDR_FRAMEWORKS,
  BUNDLED_UK_SDR_FRAMEWORKS,
} from "@perennity/engine";

/**
 * Is this target label one the SPA can actually route to a framework set?
 *
 * ITEM-17 (B5). `uk_sdr_mixed_goals` is still selectable on the Airtable
 * Target Label field — it is a roadmap signal, and targetLabels.js already
 * marks it `enabled: false` — but frameworksForLabel throws for it. The route
 * caught the throw as a generic engine failure and showed the client "We hit
 * a problem generating your Report. Please try again shortly", which is wrong
 * twice over: trying again will never help, and nobody, operator included, is
 * told what is actually wrong. Callers use this to fail with a message that
 * names the label instead.
 *
 * @param {string | null | undefined} targetLabel
 * @returns {boolean}
 */
export function isRoutableTargetLabel(targetLabel) {
  try {
    frameworksForLabel(targetLabel ?? "");
    return true;
  } catch {
    return false;
  }
}

/**
 * The EU Taxonomy Activity 8.1 knowledge-base id. Every framework set is built
 * on this activity, so it has to be selected by identity.
 */
const EU_TAX_ACTIVITY_ID = "eu_tax_climate_8_1";

/**
 * Find Activity 8.1 among the engine's bundled activities.
 *
 * ITEM-17. This used to be `BUNDLED_ACTIVITIES[0]` — array position zero of an
 * engine export. Today the array holds exactly one entry so the two are the
 * same thing, which is why nothing has gone wrong. The day the engine bundles
 * a second activity, or reorders, every paid report would silently assess the
 * wrong activity with no error anywhere: a position is not an identity.
 *
 * Throws rather than falling back. An engine that no longer ships Activity 8.1
 * is not a condition to paper over — every framework set in this file is built
 * on it.
 *
 * @returns {AnyFramework}
 */
function euTaxonomyActivity() {
  const found = BUNDLED_ACTIVITIES.find((a) => a && a.id === EU_TAX_ACTIVITY_ID);
  if (!found) {
    throw new Error(
      `Engine does not bundle activity "${EU_TAX_ACTIVITY_ID}". ` +
        `Bundled ids: ${BUNDLED_ACTIVITIES.map((a) => a && a.id).join(", ")}. ` +
        "Every framework set is built on Activity 8.1; refusing to guess.",
    );
  }
  return found;
}

/**
 * Map a target label to the framework set the engine should load for that
 * engagement. EU Tax 8.1 is always present because SFDR criterion 6
 * (taxonomy_alignment_disclosure) cross-references it; UK SDR also reads
 * EU Tax 8.1 cross-framework (uk_sdr_v1_asset_sustainability_profile and
 * uk_sdr_v1_no_significant_harm both depend on it). SFDR Art 8/9 and
 * UK SDR Focus/Improvers/Impact frameworks are additive when the
 * corresponding label is selected.
 *
 * Throws on unsupported labels (e.g. uk_sdr_mixed_goals, or any value the
 * SPA doesn't recognise). Defensive — surfaces an Airtable schema drift
 * loudly rather than silently routing to the wrong framework set.
 *
 * @param {TargetLabel | string} targetLabel
 * @returns {AnyFramework[]}
 */
export function frameworksForLabel(targetLabel) {
  const euTax = euTaxonomyActivity();
  switch (targetLabel) {
    case "eu_taxonomy_aligned_8_1":
      return [euTax];
    case "sfdr_article_8":
      return [euTax, BUNDLED_SFDR_FRAMEWORKS.sfdr_v1_article_8.framework];
    case "sfdr_article_9":
      return [euTax, BUNDLED_SFDR_FRAMEWORKS.sfdr_v1_article_9.framework];
    case "uk_sdr_focus":
      return [euTax, BUNDLED_UK_SDR_FRAMEWORKS.uk_sdr_focus.framework];
    case "uk_sdr_improvers":
      return [euTax, BUNDLED_UK_SDR_FRAMEWORKS.uk_sdr_improvers.framework];
    case "uk_sdr_impact":
      return [euTax, BUNDLED_UK_SDR_FRAMEWORKS.uk_sdr_impact.framework];
    default:
      throw new Error(
        `Unsupported target_label: "${targetLabel}". ` +
          `Expected one of: eu_taxonomy_aligned_8_1, sfdr_article_8, sfdr_article_9, ` +
          `uk_sdr_focus, uk_sdr_improvers, uk_sdr_impact.`,
      );
  }
}
