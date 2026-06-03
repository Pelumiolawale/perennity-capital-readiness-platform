// @ts-check
//
// footnoteEngine tests — 1.4e citation library + per-page accumulator.

import { describe, it, expect, beforeEach } from "vitest";
import {
  CITATIONS,
  processBodyText,
  resetPageFootnotes,
  prependFixedFootnote,
  getAccumulatedFootnotes,
  _resetAllForTests,
} from "./footnoteEngine.js";

beforeEach(() => {
  _resetAllForTests();
});

describe("CITATIONS — citation library invariants", () => {
  it("contains exactly 5 entries with non-empty pattern + citation", () => {
    expect(CITATIONS).toHaveLength(5);
    for (const c of CITATIONS) {
      expect(typeof c.pattern).toBe("string");
      expect(c.pattern.length).toBeGreaterThan(0);
      expect(typeof c.citation).toBe("string");
      expect(c.citation.length).toBeGreaterThan(0);
    }
  });

  it("includes the five regulatory references named in the v3.5 spec", () => {
    const patterns = CITATIONS.map((c) => c.pattern);
    expect(patterns).toContain("SFDR Article 8(1)");
    expect(patterns).toContain("SFDR Article 2(17)");
    expect(patterns).toContain("SFDR Article 4");
    expect(patterns).toContain("Commission Delegated Regulation (EU) 2022/1288");
    expect(patterns).toContain("Article 26 of Regulation (EU) 2020/852");
  });
});

describe("processBodyText — auto-detect + accumulator behaviour", () => {
  it("returns input unchanged + addedFootnotes 0 when no citation matches", () => {
    const result = processBodyText("Plain body text with no regulatory references.");
    expect(result.text).toBe("Plain body text with no regulatory references.");
    expect(result.addedFootnotes).toBe(0);
    expect(getAccumulatedFootnotes()).toHaveLength(0);
  });

  it("returns input + addedFootnotes 0 for empty / non-string input (defensive)", () => {
    expect(processBodyText("").text).toBe("");
    expect(processBodyText("").addedFootnotes).toBe(0);
    expect(processBodyText(/** @type {any} */ (null)).text).toBe("");
  });

  it("appends superscript marker + accumulates when one citation matches", () => {
    const result = processBodyText(
      "This project satisfies SFDR Article 8(1) at the institutional bar.",
    );
    expect(result.text).toMatch(/SFDR Article 8\(1\)¹/);
    expect(result.addedFootnotes).toBe(1);
    const acc = getAccumulatedFootnotes();
    expect(acc).toHaveLength(1);
    expect(acc[0].n).toBe(1);
    expect(acc[0].text).toMatch(/Regulation \(EU\) 2019\/2088/);
  });

  it("matches only the first occurrence of the same pattern in one call", () => {
    const result = processBodyText(
      "SFDR Article 8(1) is the test; SFDR Article 8(1) appears twice.",
    );
    expect(result.addedFootnotes).toBe(1);
    // First occurrence gets the superscript; second stays bare.
    const matches = (result.text.match(/SFDR Article 8\(1\)¹/g) || []).length;
    expect(matches).toBe(1);
  });

  it("matches multiple distinct citations sequentially, numbered 1 then 2", () => {
    const result = processBodyText(
      "The project demonstrates SFDR Article 8(1) compliance and references SFDR Article 4 for PAI policy substance.",
    );
    expect(result.addedFootnotes).toBe(2);
    expect(result.text).toMatch(/SFDR Article 8\(1\)¹/);
    expect(result.text).toMatch(/SFDR Article 4²/);
    const acc = getAccumulatedFootnotes();
    expect(acc).toHaveLength(2);
    expect(acc[0].n).toBe(1);
    expect(acc[1].n).toBe(2);
  });
});

describe("prependFixedFootnote + resetPageFootnotes", () => {
  it("prependFixedFootnote registers footnote 1; subsequent processBodyText calls start at 2", () => {
    prependFixedFootnote("Fixed: Article 26 disclaimer.");
    const acc = getAccumulatedFootnotes();
    expect(acc).toHaveLength(1);
    expect(acc[0].n).toBe(1);
    expect(acc[0].text).toBe("Fixed: Article 26 disclaimer.");

    const result = processBodyText("This satisfies SFDR Article 8(1).");
    expect(result.text).toMatch(/SFDR Article 8\(1\)²/);
    expect(getAccumulatedFootnotes()).toHaveLength(2);
  });

  it("resetPageFootnotes clears accumulator + counter but preserves fixed footnotes", () => {
    prependFixedFootnote("Fixed: Article 26 disclaimer.");
    processBodyText("Citation: SFDR Article 8(1).");
    expect(getAccumulatedFootnotes()).toHaveLength(2);

    resetPageFootnotes();
    const acc = getAccumulatedFootnotes();
    // After reset, only the fixed footnote remains (re-registered as #1).
    expect(acc).toHaveLength(1);
    expect(acc[0].n).toBe(1);
    expect(acc[0].text).toBe("Fixed: Article 26 disclaimer.");

    // A subsequent processBodyText call resumes at 2.
    const result = processBodyText("Citation: SFDR Article 4.");
    expect(result.text).toMatch(/SFDR Article 4²/);
  });
});

// Regression for the page-5 visual defect on reccILCx0VfYGFBl5: the
// Article 26 disclaimer was being concatenated with a parenthetical
// citation in reportPDF.js before being registered, producing a duplicate
// "(Article 26 of Regulation (EU) 2020/852)" suffix on footnote 1.
// reportPDF.js now passes the raw disclaimer to prependFixedFootnote; the
// engine receives it unchanged.
describe("prependFixedFootnote — raw disclaimer (no duplicate citation suffix)", () => {
  it("registers the disclaimer verbatim with exactly one Article 26 mention", () => {
    const DISCLAIMER =
      "This document is advisory in nature. It does not constitute regulatory " +
      "assurance, audit, or verification within the meaning of Article 26 of " +
      "Regulation (EU) 2020/852 or under any equivalent regime in the United " +
      "Kingdom or any other jurisdiction.";
    prependFixedFootnote(DISCLAIMER);
    const acc = getAccumulatedFootnotes();
    expect(acc).toHaveLength(1);
    // Exactly one mention — the inline reference inside the sentence.
    const matches = acc[0].text.match(/Article 26 of Regulation \(EU\) 2020\/852/g);
    expect(matches).toHaveLength(1);
    // And no trailing parenthetical of the same citation that the v0.5.0
    // reportPDF.js concat used to introduce.
    expect(acc[0].text).not.toMatch(/\(Article 26 of Regulation \(EU\) 2020\/852\)\.$/);
  });
});
