import { describe, it, expect } from "vitest";
import {
  DeterministicEngine,
  SnapshotRenderer,
  BUNDLED_ACTIVITIES,
  computeKnowledgeBaseHash,
} from "@perennity/engine";
import v31Fixture from "../__fixtures__/v3.1-assessment.json";

// Regression guard: pre-v3.2 ProjectInput shapes (no PUE measurement compliance
// or safeguards items in data_points) must still render under the current
// engine. We construct the engine + renderer directly here rather than going
// through src/lib/engineClient so the test isn't coupled to Vite's
// import.meta.env wiring.

async function renderV31() {
  const engine = new DeterministicEngine({
    engine_commit_sha: "v31-backcompat-test",
    knowledge_base_hash: computeKnowledgeBaseHash(BUNDLED_ACTIVITIES),
    methodology_version: "v3.2-test",
  });
  const renderer = new SnapshotRenderer({ disclaimer: "test disclaimer" });
  const run = await engine.run(v31Fixture.projectInput, BUNDLED_ACTIVITIES);
  return { run, snapshot: await renderer.render(run) };
}

describe("v3.1 backward compatibility", () => {
  it("v3.1-shaped data_points renders under current engine without throwing", async () => {
    const { snapshot } = await renderV31();
    expect(snapshot.run_id).toBeTruthy();
    expect(snapshot.indicative_score).toBeGreaterThanOrEqual(0);
    expect(snapshot.indicative_score).toBeLessThanOrEqual(100);
    expect(["Green", "Amber", "Red"]).toContain(snapshot.indicative_band);
    expect(Array.isArray(snapshot.heatmap)).toBe(true);
    expect(snapshot.heatmap.length).toBeGreaterThan(0);
  });

  it("v3.2 safeguards fields absent → safeguards heatmap cell verdict is data_missing", async () => {
    const { snapshot } = await renderV31();
    const sg = snapshot.heatmap.find((c) => c.framework === "minimum_safeguards");
    expect(sg).toBeDefined();
    expect(sg.verdict).toBe("data_missing");
  });

  // Regression-discovery: v3.1 fixtures include an audit doc, which the v3.2
  // PUE measurement criterion treats as 1-of-5 satisfied (the freshness check
  // alone). 1/5 < 4/5 threshold → "fail". This is the engine's documented
  // semantics (see sc_8_1_2_pue_measurement_compliance.test.ts "three items
  // present → fail"). data_missing only fires when ZERO of the five PUE items
  // are present. Worth knowing: historical v3.1 prospects will score "fail" on
  // this new criterion until they re-attest under v3.2 intake.
  it("v3.1 fixture with audit doc scores PUE measurement criterion as 'fail' (1 of 5 items)", async () => {
    const { run } = await renderV31();
    const fr = run.framework_results[0];
    const allResults = [
      ...(fr.sc_results || []),
      ...(fr.methodology_results || []),
    ];
    const pue = allResults.find(
      (r) => r.criterion_id === "sc_8_1_2_pue_measurement_compliance",
    );
    expect(pue).toBeDefined();
    expect(pue.verdict).toBe("fail");
  });
});
