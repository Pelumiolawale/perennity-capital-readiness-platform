// @ts-check
// Paid-flow only — see CLAUDE.md. Do not import from /assessment/snapshot or any free-tier component.
//
// Footnote engine for the paid Report PDF (1.4e — Phase 1 v0.5.0 close).
//
// Provides the institutional-grade page-bottom footnote pattern per
// pb-product-design/references/report-design.md: every regulatory
// threshold reference in body text carries a superscript Arabic numeral
// inline + a numbered citation rendered at the page bottom, separated by
// a 30mm horizontal hairline rule above.
//
// SIMPLER IMPLEMENTATION (per the 1.4d prompt's B.4 fallback):
// - Auto-detect citation library: scan body text for known regulatory
//   patterns from the CITATIONS map; emit superscript + accumulate.
// - Per-page footnote zone: fixed 30mm reserved at page bottom; body
//   content must stop above it. If accumulated footnotes overflow the
//   30mm zone, console.warn and truncate (acceptable v0.5.0 compromise;
//   a future commit can refine to a reflow engine).
// - Per-page reset: caller invokes resetPageFootnotes() at the start of
//   each new page.
// - Fixed-footnote registration: Article 26 disclaimer is registered as
//   a fixed footnote that re-fires on every page as footnote 1.

/** @typedef {{ pattern: string, citation: string }} Citation */
/** @typedef {{ n: number, text: string }} AccumulatedFootnote */

// ============================================================================
// CITATION LIBRARY — five known regulatory references
// ============================================================================
//
// Order matters for the auto-detection pass: longer patterns are matched
// first so e.g. "SFDR Article 8(1)" wins over a bare "Article 4" match
// when both could plausibly apply. Patterns are matched as plain-text
// substring searches (case-sensitive — institutional citations are
// always cased the same way).

/** @type {readonly Citation[]} */
export const CITATIONS = Object.freeze([
  Object.freeze({
    pattern: "SFDR Article 8(1)",
    citation:
      "Regulation (EU) 2019/2088 (SFDR), Article 8(1) — financial products promoting environmental or social characteristics.",
  }),
  Object.freeze({
    pattern: "SFDR Article 2(17)",
    citation:
      "Regulation (EU) 2019/2088 (SFDR), Article 2(17) — definition of sustainable investment.",
  }),
  Object.freeze({
    pattern: "Commission Delegated Regulation (EU) 2022/1288",
    citation:
      "Commission Delegated Regulation (EU) 2022/1288, Annex I Table 1 — mandatory principal adverse impact indicators.",
  }),
  Object.freeze({
    pattern: "Article 26 of Regulation (EU) 2020/852",
    citation:
      "Regulation (EU) 2020/852 (EU Taxonomy Regulation), Article 26 — disclosures and reporting requirements; the present Report does not constitute Article 26 assurance.",
  }),
  Object.freeze({
    pattern: "SFDR Article 4",
    citation:
      "Regulation (EU) 2019/2088 (SFDR), Article 4 — transparency of adverse sustainability impacts.",
  }),
]);

// Pre-sort by pattern length descending so longer patterns are matched
// before shorter overlapping ones (e.g. "SFDR Article 8(1)" before any
// generic "Article" match a future commit might add).
const CITATIONS_BY_LENGTH = [...CITATIONS].sort(
  (a, b) => b.pattern.length - a.pattern.length,
);

// ============================================================================
// STATE — per-page accumulator + fixed-footnote registry
// ============================================================================
//
// The renderer flow in reportPDF.js draws ALL bodies first, then runs a
// separate footer pass per page to compose "Page N of M" once totalPages
// is known. A single global accumulator would conflate all pages' citations
// into the last page's footer. State is therefore page-keyed: callers
// signal page transitions during body render via setCurrentPage(n), and
// the footer pass reads page-specific footnotes via renderFootnotesForPage.
//
// The per-page accumulator state (pageAccumulator / footnoteCounter)
// continues to back the existing test surface (resetPageFootnotes /
// processBodyText / getAccumulatedFootnotes) so the unit tests can
// exercise the engine without driving a real jsPDF document.

/** @type {AccumulatedFootnote[]} */
let pageAccumulator = [];

/** @type {string[]} */
let fixedFootnoteTexts = [];

let footnoteCounter = 0;

/** @type {Map<number, AccumulatedFootnote[]>} */
const footnotesByPage = new Map();

let currentPageNum = 0;

/**
 * Clear the per-page accumulator. Re-registers any fixed footnotes (Article 26
 * disclaimer etc.) so they appear at the top of the next page's footnote
 * zone numbered 1, 2, ... in registration order. Call at the start of each
 * new PDF page render.
 */
export function resetPageFootnotes() {
  pageAccumulator = [];
  footnoteCounter = 0;
  for (const text of fixedFootnoteTexts) {
    footnoteCounter += 1;
    pageAccumulator.push({ n: footnoteCounter, text });
  }
}

/**
 * Register a footnote that fires on every page. Intended for the Article 26
 * disclaimer — institutional convention is that the regulatory scoping
 * caveat appears on every page, not only the page it's first referenced.
 * Fixed footnotes are emitted at the top of the per-page accumulator after
 * resetPageFootnotes() in their registration order.
 *
 * @param {string} text
 */
export function prependFixedFootnote(text) {
  if (typeof text !== "string" || text.length === 0) return;
  fixedFootnoteTexts.push(text);
  // If the accumulator is currently empty (e.g. called before the first
  // page render), seed it so the first call to processBodyText sees the
  // fixed footnote already counted.
  if (pageAccumulator.length === 0 && footnoteCounter === 0) {
    footnoteCounter = 1;
    pageAccumulator.push({ n: 1, text });
  }
}

/**
 * Reset ALL state — both the per-page accumulator AND the fixed-footnote
 * registry AND the page-keyed map. Intended for tests; production code uses
 * resetPageFootnotes() per page and prependFixedFootnote() at PDF init.
 *
 * @internal
 */
export function _resetAllForTests() {
  pageAccumulator = [];
  fixedFootnoteTexts = [];
  footnoteCounter = 0;
  footnotesByPage.clear();
  currentPageNum = 0;
}

/**
 * Set the current page number for subsequent processBodyText calls. The
 * footnote engine snapshots the per-page accumulator state into a
 * page-keyed map so the footer pass can later look up the right page's
 * footnotes. Call at the start of each body-render function in reportPDF.js
 * with `doc.internal.getCurrentPageInfo().pageNumber`.
 *
 * Switching pages flushes the current accumulator into the previous
 * page's map slot, then resets the accumulator (re-seeded with fixed
 * footnotes) for the new page.
 *
 * @param {number} pageNum 1-indexed page number
 */
export function setCurrentPage(pageNum) {
  if (currentPageNum > 0 && pageAccumulator.length > 0) {
    footnotesByPage.set(currentPageNum, [...pageAccumulator]);
  }
  currentPageNum = pageNum;
  // If this page hasn't been seen before, seed a fresh accumulator with
  // fixed footnotes. If it has been seen (re-visit), restore its state.
  if (footnotesByPage.has(pageNum)) {
    pageAccumulator = [...(footnotesByPage.get(pageNum) || [])];
    footnoteCounter = pageAccumulator.length;
  } else {
    pageAccumulator = [];
    footnoteCounter = 0;
    for (const text of fixedFootnoteTexts) {
      footnoteCounter += 1;
      pageAccumulator.push({ n: footnoteCounter, text });
    }
  }
}

/**
 * Flush the current page's accumulator into the page-keyed map. Idempotent.
 * Called by reportPDF.js after body rendering completes, before the footer
 * post-pass begins, to ensure the last page's footnotes are captured.
 */
export function flushCurrentPage() {
  if (currentPageNum > 0) {
    footnotesByPage.set(currentPageNum, [...pageAccumulator]);
  }
}

/**
 * @returns {readonly AccumulatedFootnote[]} the current page's accumulated footnotes
 */
export function getAccumulatedFootnotes() {
  return Object.freeze([...pageAccumulator]);
}

// ============================================================================
// processBodyText — auto-detect + emit superscript markers
// ============================================================================

// Unicode superscript digits 1–9 + 0. Used to render footnote markers
// inline in body text without needing a separate jsPDF text-styling call.
// jsPDF embedded TTF fonts render these glyphs correctly when present in
// the font subset; Source Serif 4 and Source Sans 3 both include them.
const SUPERSCRIPT_DIGITS = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];

/**
 * Convert an integer to a Unicode superscript string.
 *
 * @param {number} n
 * @returns {string}
 */
function toSuperscript(n) {
  if (n < 0) return String(n);
  return String(n)
    .split("")
    .map((d) => SUPERSCRIPT_DIGITS[parseInt(d, 10)] ?? d)
    .join("");
}

/**
 * Scan input text for known citation patterns; for each matched pattern
 * (first occurrence only — second/third occurrences of the same pattern
 * in the same text are NOT re-footnoted), append a superscript numeral
 * and add the citation to the per-page accumulator.
 *
 * Returns the transformed text + the count of footnotes added by this
 * call (useful for caller diagnostics; renderer doesn't need to use it).
 *
 * @param {string} text
 * @returns {{ text: string, addedFootnotes: number }}
 */
export function processBodyText(text) {
  if (typeof text !== "string" || text.length === 0) {
    return { text: text ?? "", addedFootnotes: 0 };
  }
  let working = text;
  let added = 0;
  // Track which patterns have been footnoted in this call to enforce
  // first-occurrence-only behaviour.
  const matchedThisCall = new Set();
  for (const c of CITATIONS_BY_LENGTH) {
    if (matchedThisCall.has(c.pattern)) continue;
    const idx = working.indexOf(c.pattern);
    if (idx === -1) continue;
    matchedThisCall.add(c.pattern);
    footnoteCounter += 1;
    pageAccumulator.push({ n: footnoteCounter, text: c.citation });
    const marker = toSuperscript(footnoteCounter);
    // Insert the marker immediately after the matched pattern.
    const before = working.slice(0, idx + c.pattern.length);
    const after = working.slice(idx + c.pattern.length);
    working = `${before}${marker}${after}`;
    added += 1;
  }
  return { text: working, addedFootnotes: added };
}

// ============================================================================
// renderPageFootnotes — emit the accumulated footnotes at page bottom
// ============================================================================

/**
 * Render the page's accumulated footnotes at the given y position. Draws
 * a 0.5pt #D8DCDF hairline rule above the footnote block (the spec's
 * "30mm horizontal hairline rule" is the *position* of the separator,
 * not its length — the rule spans the body width).
 *
 * Each footnote is rendered as: `{n}. {text}` in PB-Serif 8.5pt with 11pt
 * leading (TYPE.footnote). Wrapped to the page width via
 * doc.splitTextToSize.
 *
 * If the accumulated footnotes exceed ~30mm (the reserved zone), surface
 * a console.warn and truncate to the visible portion. v0.5.0 acceptable
 * compromise per the prompt's "simpler implementation" guidance.
 *
 * @param {import("jspdf").jsPDF} doc
 * @param {number} y vertical position (mm) where the hairline rule should be drawn
 * @param {{ contentLeft: number, contentRight: number }} [bounds] body-width bounds; defaults to MARGIN_MM left and PAGE_WIDTH_MM - MARGIN_MM right
 * @returns {number} the y position consumed by the footnote block (i.e. the y where the folio should start, below the last footnote)
 */
export function renderPageFootnotes(doc, y, bounds) {
  if (pageAccumulator.length === 0) return y;
  const left = bounds?.contentLeft ?? 20;
  const right = bounds?.contentRight ?? 190;
  const contentWidth = right - left;

  // Hairline separator
  doc.setDrawColor(216, 220, 223);
  doc.setLineWidth(0.5);
  doc.line(left, y, right, y);

  // Footnote text
  let cursorY = y + 3; // 3mm gap below the rule
  doc.setFont("PB-Serif", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(26, 35, 41); // INK.ink

  const LEADING_MM = 3.0; // tighter leading for smaller footnote font
  // 45mm — increased from 30mm. Three full-length wrapped footnotes
  // (Article 26 disclaimer + SFDR Article 8(1) + SFDR Article 2(17))
  // overflowed the prior 30mm zone and truncated mid-word. 45mm fits 4-5
  // wrapped footnotes (~3.5mm leading × 2 lines per footnote × 4-5
  // footnotes ≈ 28-35mm), leaving margin. Revisit if the CITATIONS
  // registry grows past ~6 entries.
  const MAX_ZONE_MM = 45;
  const zoneBottom = y + MAX_ZONE_MM;

  for (const fn of pageAccumulator) {
    const body = `${fn.n}. ${fn.text}`;
    const lines = doc.splitTextToSize(body, contentWidth);
    const heightNeeded = lines.length * LEADING_MM;
    if (cursorY + heightNeeded > zoneBottom) {
      // eslint-disable-next-line no-console
      console.warn(
        `[footnoteEngine] page footnote zone overflow at footnote ${fn.n}; truncating.`,
      );
      break;
    }
    doc.text(lines, left, cursorY);
    cursorY += heightNeeded;
  }
  return cursorY;
}

/**
 * Render the footnotes accumulated for a specific page number. Used by the
 * footer post-pass in reportPDF.js: for each page n, look up its captured
 * accumulator and render. Behaviour is identical to renderPageFootnotes
 * except the footnote list source is the page-keyed map, not the current
 * accumulator.
 *
 * @param {import("jspdf").jsPDF} doc
 * @param {number} pageNum
 * @param {number} y vertical position (mm) where the hairline rule should be drawn
 * @param {{ contentLeft: number, contentRight: number }} [bounds]
 * @returns {number}
 */
export function renderFootnotesForPage(doc, pageNum, y, bounds) {
  const fns = footnotesByPage.get(pageNum);
  if (!fns || fns.length === 0) return y;
  // Temporarily swap the accumulator so renderPageFootnotes (which reads
  // from it) emits the right page's footnotes, then restore.
  const saved = pageAccumulator;
  pageAccumulator = fns;
  const result = renderPageFootnotes(doc, y, bounds);
  pageAccumulator = saved;
  return result;
}
