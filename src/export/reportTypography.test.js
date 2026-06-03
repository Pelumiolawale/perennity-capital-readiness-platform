// @ts-check
//
// reportTypography invariants (1.4d Phase A+B partial).
//
// Locks the type scale + page geometry tokens against drift. Any change
// to PAGE.* or TYPE.* values must update these expectations atomically —
// the report-design.md spec is the source of truth and silent token
// drift is a typography regression we want caught at test time.

import { describe, it, expect } from "vitest";
import { PAGE, TYPE, INK, pageColumns } from "./reportTypography.js";

describe("PAGE — A4 portrait geometry per report-design.md", () => {
  it("page size is A4 portrait (210 × 297 mm)", () => {
    expect(PAGE.width).toBe(210);
    expect(PAGE.height).toBe(297);
  });

  it("margins match spec: 22/22/18/24 (top/bottom/outer/inner)", () => {
    expect(PAGE.margin.top).toBe(22);
    expect(PAGE.margin.bottom).toBe(22);
    expect(PAGE.margin.outer).toBe(18);
    expect(PAGE.margin.inner).toBe(24);
  });

  it("two-column grid: 38mm narrow + 130mm wide + 6mm gutter (total 174mm)", () => {
    expect(PAGE.grid.narrowColumn).toBe(38);
    expect(PAGE.grid.wideColumn).toBe(130);
    expect(PAGE.grid.gutter).toBe(6);
    const total = PAGE.grid.narrowColumn + PAGE.grid.wideColumn + PAGE.grid.gutter;
    expect(total).toBe(174);
    // 174mm + 18mm outer + 18mm gutter-side reservation = 210mm page width.
    // (Inner margin 24mm reserves 6mm extra for the spine, expected.)
  });

  it("PAGE constants are frozen — no runtime mutation", () => {
    expect(Object.isFrozen(PAGE)).toBe(true);
    expect(Object.isFrozen(PAGE.margin)).toBe(true);
    expect(Object.isFrozen(PAGE.grid)).toBe(true);
  });
});

describe("TYPE — type scale tokens per report-design.md", () => {
  it("cover-title is 28pt PB-Sans bold", () => {
    expect(TYPE.coverTitle.size).toBe(28);
    expect(TYPE.coverTitle.font).toBe("PB-Sans");
    expect(TYPE.coverTitle.weight).toBe("bold");
  });

  it("section-head is 16pt PB-Sans bold", () => {
    expect(TYPE.sectionHead.size).toBe(16);
    expect(TYPE.sectionHead.font).toBe("PB-Sans");
    expect(TYPE.sectionHead.weight).toBe("bold");
  });

  it("body is 10.5pt PB-Serif normal with 14pt leading", () => {
    expect(TYPE.body.size).toBe(10.5);
    expect(TYPE.body.font).toBe("PB-Serif");
    expect(TYPE.body.weight).toBe("normal");
    expect(TYPE.body.leading).toBe(14);
  });

  it("footnote is 8.5pt PB-Serif normal with 11pt leading", () => {
    expect(TYPE.footnote.size).toBe(8.5);
    expect(TYPE.footnote.font).toBe("PB-Serif");
    expect(TYPE.footnote.leading).toBe(11);
  });

  it("running-head is 8pt PB-Sans", () => {
    expect(TYPE.runningHead.size).toBe(8);
    expect(TYPE.runningHead.font).toBe("PB-Sans");
  });

  it("TYPE constants are frozen — no runtime mutation", () => {
    expect(Object.isFrozen(TYPE)).toBe(true);
    expect(Object.isFrozen(TYPE.body)).toBe(true);
  });
});

describe("INK — colour tokens", () => {
  it("navy is #0B1F2A = [11, 31, 42]", () => {
    expect(INK.navy).toEqual([11, 31, 42]);
  });

  it("surfaceTint is #F1EEE8 = [241, 238, 232]", () => {
    expect(INK.surfaceTint).toEqual([241, 238, 232]);
  });

  it("hairline is #D8DCDF = [216, 220, 223]", () => {
    expect(INK.hairline).toEqual([216, 220, 223]);
  });
});

describe("pageColumns — odd/even parity for two-column grid", () => {
  it("odd page (page 1): wide column inboard, narrow column outboard", () => {
    const cols = pageColumns(1);
    expect(cols.isOdd).toBe(true);
    // Inner (gutter) margin on left for odd pages
    expect(cols.contentLeft).toBe(24); // inner
    expect(cols.contentRight).toBe(192); // 210 - 18 outer
    expect(cols.wideColumnLeft).toBe(24); // starts at inner margin
    expect(cols.wideColumnRight).toBe(154); // + 130
    expect(cols.narrowColumnLeft).toBe(160); // + 6 gutter
    expect(cols.narrowColumnRight).toBe(198); // + 38
  });

  it("even page (page 2): narrow column inboard (left), wide column outboard", () => {
    const cols = pageColumns(2);
    expect(cols.isOdd).toBe(false);
    expect(cols.contentLeft).toBe(18); // outer
    expect(cols.contentRight).toBe(186); // 210 - 24 inner
    expect(cols.narrowColumnLeft).toBe(18); // starts at outer
    expect(cols.narrowColumnRight).toBe(56); // + 38
    expect(cols.wideColumnLeft).toBe(62); // + 6 gutter
    expect(cols.wideColumnRight).toBe(192); // + 130
  });
});
