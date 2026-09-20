// @ts-check
//
// Every verdict the engine can put on a heatmap cell gets a colour that means
// what it says.
//
// snapshotPDF's verdictColour was `pass → green, fail → red, everything else
// → amber`. Two of the "everything else" cases were wrong in ways a reader
// could not catch, because an amber pill looks like a deliberate judgement:
//
//   not_aligned            rendered AMBER — a criterion the engine had FAILED,
//                          shown in the same colour as one partially passed.
//   data_missing,          rendered amber, so "nobody has told us" looked
//   insufficient_evidence, identical to "partially met".
//   not_applicable
//
// The not_aligned case is reachable from the free tier: pick an SFDR or UK SDR
// label in the wizard and those framework sets emit the aligned/not_aligned
// vocabulary rather than pass/fail.
//
// The engine's verdict union is a TypeScript type and erases at build, so it
// cannot be read at runtime. This test pins the list against the bundled
// criteria instead, and against the union as written in dist/engine.d.ts.

import { describe, it, expect } from "vitest";
import { VERDICT_COLOURS } from "./snapshotPDF.js";

/**
 * HeatmapCell["verdict"] as declared in @perennity/engine dist/engine.d.ts.
 * If the engine adds a member, this list and VERDICT_COLOURS must both grow —
 * the point is that adding one here without a colour fails immediately.
 */
const ENGINE_VERDICTS = [
  "pass",
  "partial",
  "fail",
  "data_missing",
  "aligned",
  "partially_aligned",
  "not_aligned",
  "insufficient_evidence",
  "not_applicable",
];

const GREEN = [34, 139, 34];
const RED = [178, 34, 52];
const AMBER = [201, 138, 4];
const GREY = [128, 128, 128];

describe("every engine verdict has a colour, and it is the right one", () => {
  it("covers the whole union with no gaps", () => {
    const uncoloured = ENGINE_VERDICTS.filter((v) => !VERDICT_COLOURS[v]);
    expect(uncoloured, `No colour for: ${uncoloured.join(", ")}`).toEqual([]);
  });

  it("has no colour for a verdict the engine cannot emit", () => {
    const orphaned = Object.keys(VERDICT_COLOURS).filter(
      (v) => !ENGINE_VERDICTS.includes(v),
    );
    expect(orphaned, `Orphaned: ${orphaned.join(", ")}`).toEqual([]);
  });

  it("a failure is red in both vocabularies", () => {
    expect(VERDICT_COLOURS.fail).toEqual(RED);
    // This is the one that was amber.
    expect(
      VERDICT_COLOURS.not_aligned,
      "not_aligned is a failure. Rendering it amber shows a failed criterion " +
        "in the same colour as a partially passed one.",
    ).toEqual(RED);
  });

  it("a pass is green in both vocabularies", () => {
    expect(VERDICT_COLOURS.pass).toEqual(GREEN);
    expect(VERDICT_COLOURS.aligned).toEqual(GREEN);
  });

  it("a partial is amber in both vocabularies", () => {
    expect(VERDICT_COLOURS.partial).toEqual(AMBER);
    expect(VERDICT_COLOURS.partially_aligned).toEqual(AMBER);
  });

  it("absence is grey, never amber", () => {
    for (const v of ["data_missing", "insufficient_evidence", "not_applicable"]) {
      expect(
        VERDICT_COLOURS[v],
        `${v} is the absence of a result, not a middling one`,
      ).toEqual(GREY);
    }
  });

  it("amber is reserved for the two verdicts that actually mean 'partly'", () => {
    const amber = Object.entries(VERDICT_COLOURS)
      .filter(([, rgb]) => String(rgb) === String(AMBER))
      .map(([v]) => v)
      .sort();
    expect(amber).toEqual(["partial", "partially_aligned"]);
  });
});
