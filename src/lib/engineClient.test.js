// @ts-check
//
// frameworksForLabel + targetLabels tests (Phase 1, commit 1.5a Phase B-1).
//
// Locks the label → framework mapping and the defensive throw on
// unsupported labels. Any rename of an enabled label name in the
// Airtable schema must be paired with an update here.

import { describe, it, expect } from "vitest";
import { frameworksForLabel } from "./engineClient.js";
import {
  TARGET_LABEL_OPTIONS,
  DEFAULT_TARGET_LABEL,
  ENABLED_TARGET_LABELS,
  targetLabelDisplay,
} from "./targetLabels.js";

describe("frameworksForLabel", () => {
  it("eu_taxonomy_aligned_8_1 → [eu_tax_climate_8_1] (one framework)", () => {
    const frameworks = frameworksForLabel("eu_taxonomy_aligned_8_1");
    expect(frameworks).toHaveLength(1);
    // Activity-aligned framework — has activity_code field (per the engine's
    // Activity schema), not the product_label framework_id field.
    expect(frameworks[0]).toHaveProperty("activity_code");
  });

  it("sfdr_article_8 → [eu_tax_climate_8_1, sfdr_v1_article_8] (two frameworks)", () => {
    const frameworks = frameworksForLabel("sfdr_article_8");
    expect(frameworks).toHaveLength(2);
    expect(frameworks[0]).toHaveProperty("activity_code");
    expect(frameworks[1].framework_id).toBe("sfdr_v1_article_8");
    expect(frameworks[1].archetype).toBe("product_label");
  });

  it("sfdr_article_9 → [eu_tax_climate_8_1, sfdr_v1_article_9] (two frameworks)", () => {
    const frameworks = frameworksForLabel("sfdr_article_9");
    expect(frameworks).toHaveLength(2);
    expect(frameworks[0]).toHaveProperty("activity_code");
    expect(frameworks[1].framework_id).toBe("sfdr_v1_article_9");
    expect(frameworks[1].archetype).toBe("product_label");
  });

  it("uk_sdr_focus → [eu_tax_climate_8_1, uk_sdr_focus] (two frameworks)", () => {
    const frameworks = frameworksForLabel("uk_sdr_focus");
    expect(frameworks).toHaveLength(2);
    expect(frameworks[0]).toHaveProperty("activity_code");
    expect(frameworks[1].framework_id).toBe("uk_sdr_focus");
    expect(frameworks[1].archetype).toBe("product_label");
  });

  it("uk_sdr_improvers → [eu_tax_climate_8_1, uk_sdr_improvers] (two frameworks)", () => {
    const frameworks = frameworksForLabel("uk_sdr_improvers");
    expect(frameworks).toHaveLength(2);
    expect(frameworks[1].framework_id).toBe("uk_sdr_improvers");
    expect(frameworks[1].archetype).toBe("product_label");
  });

  it("uk_sdr_impact → [eu_tax_climate_8_1, uk_sdr_impact] (two frameworks)", () => {
    const frameworks = frameworksForLabel("uk_sdr_impact");
    expect(frameworks).toHaveLength(2);
    expect(frameworks[1].framework_id).toBe("uk_sdr_impact");
    expect(frameworks[1].archetype).toBe("product_label");
  });

  it("throws on uk_sdr_mixed_goals (not yet routed in v0.6.0)", () => {
    expect(() => frameworksForLabel("uk_sdr_mixed_goals")).toThrow(
      /Unsupported target_label/,
    );
  });

  it("throws on unknown label (Airtable schema drift surface)", () => {
    expect(() => frameworksForLabel("future_label_not_yet_added")).toThrow(
      /Unsupported target_label/,
    );
    expect(() => frameworksForLabel("")).toThrow();
  });
});

describe("targetLabels — option list", () => {
  it("exposes exactly 7 labels (6 enabled + 1 disabled after v0.6.0 / UK SDR)", () => {
    expect(TARGET_LABEL_OPTIONS).toHaveLength(7);
    expect(TARGET_LABEL_OPTIONS.filter((o) => o.enabled)).toHaveLength(6);
    expect(TARGET_LABEL_OPTIONS.filter((o) => !o.enabled)).toHaveLength(1);
  });

  it("DEFAULT_TARGET_LABEL is eu_taxonomy_aligned_8_1", () => {
    expect(DEFAULT_TARGET_LABEL).toBe("eu_taxonomy_aligned_8_1");
  });

  it("ENABLED_TARGET_LABELS matches the six enabled option values exactly", () => {
    expect(ENABLED_TARGET_LABELS).toEqual([
      "eu_taxonomy_aligned_8_1",
      "sfdr_article_8",
      "sfdr_article_9",
      "uk_sdr_focus",
      "uk_sdr_improvers",
      "uk_sdr_impact",
    ]);
  });

  it("targetLabelDisplay resolves enabled labels to human-readable strings", () => {
    expect(targetLabelDisplay("eu_taxonomy_aligned_8_1")).toBe(
      "EU Taxonomy Aligned (Activity 8.1)",
    );
    expect(targetLabelDisplay("sfdr_article_8")).toBe("SFDR Article 8");
    expect(targetLabelDisplay("sfdr_article_9")).toBe("SFDR Article 9");
  });

  it("targetLabelDisplay resolves disabled labels to base name (no 'Coming soon' suffix at the data layer)", () => {
    // The "Coming soon" suffix is a render-layer concern; the data-layer
    // display is the bare framework name. Tests Phase 2 wizard render adds
    // the suffix; this test guards against the suffix leaking into the
    // data layer.
    expect(targetLabelDisplay("uk_sdr_focus")).toBe("UK SDR Focus");
    expect(targetLabelDisplay("uk_sdr_impact")).toBe("UK SDR Impact");
  });

  it("targetLabelDisplay falls back to the raw value for unknown inputs", () => {
    expect(targetLabelDisplay("never_seen_before")).toBe("never_seen_before");
    expect(targetLabelDisplay(null)).toBe("");
    expect(targetLabelDisplay(undefined)).toBe("");
  });
});
