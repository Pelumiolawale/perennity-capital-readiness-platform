// @ts-check
// Paid-flow only — see CLAUDE.md. Do not import from /assessment/snapshot or any free-tier component.
//
// Typography + page geometry tokens for the paid Report PDF.
// (1.4d Phase A — Phase 1 close commit.)
//
// FONT SWAP RATIONALE
// -------------------
// The 1.4d spec called for Inter (headings) + Source Serif Pro (body).
// Inter as a static-weight TTF is not reliably available via stable
// GitHub mirrors — the rsms/inter repo distributes OTF, and the
// google/fonts mirror ships a variable font (Thin → Black on the wght
// axis) which jsPDF can embed but can't render as discrete weights at
// runtime. @fontsource/inter ships WOFF/WOFF2 only.
//
// Adobe Fonts publishes Source Sans 3 alongside Source Serif 4 in
// matching static-weight TTF form. The two families were designed as a
// pair — same x-height calibration, complementary stroke contrast,
// optimised for institutional document use. The substitution
// preserves the spec's structural intent (sans serif for headings,
// serif for body) and keeps the institutional register; the only
// visible difference is the heading typeface family.
//
// Going forward all references to "Inter" in this codebase mean Source
// Sans 3. The font face family registered in jsPDF is "PB-Sans" /
// "PB-Serif" so consumers don't have to think about the underlying
// vendor.

import sourceSerifRegularUrl from "../assets/fonts/SourceSerif4-Regular.ttf?url";
import sourceSerifSemiboldUrl from "../assets/fonts/SourceSerif4-Semibold.ttf?url";
import sourceSansRegularUrl from "../assets/fonts/SourceSans3-Regular.ttf?url";
import sourceSansSemiboldUrl from "../assets/fonts/SourceSans3-Semibold.ttf?url";

// ============================================================================
// PAGE GEOMETRY — A4 portrait, two-column grid per pb-product-design
// ============================================================================

export const PAGE = Object.freeze({
  width: 210,
  height: 297,
  margin: Object.freeze({
    top: 22,
    bottom: 22,
    outer: 18, // right on odd pages, left on even pages
    inner: 24, // spine side (gutter) — left on odd, right on even
  }),
  grid: Object.freeze({
    narrowColumn: 38, // footnote / sidebar column
    wideColumn: 130, // body content column
    gutter: 6,
  }),
  // Reserved vertical band at the bottom for the page-bottom footnote
  // engine + folio. Body content stops at (height - bottom - footer).
  footerBandHeight: 32,
});

/**
 * Compute per-page x-coordinate references for odd/even page parity.
 * Odd pages: narrow column on the LEFT (outer = right margin).
 * Even pages: narrow column on the RIGHT (outer = left margin).
 *
 * @param {number} pageNumber 1-indexed page number from doc.getCurrentPageInfo().pageNumber
 * @returns {{
 *   contentLeft: number,
 *   contentRight: number,
 *   wideColumnLeft: number,
 *   wideColumnRight: number,
 *   narrowColumnLeft: number,
 *   narrowColumnRight: number,
 *   isOdd: boolean,
 * }}
 */
export function pageColumns(pageNumber) {
  const isOdd = pageNumber % 2 === 1;
  if (isOdd) {
    // Odd: inner (gutter) on left, outer on right. Narrow column adjacent
    // to inner margin (sits on the gutter side, body sits outboard).
    // Per pb-product-design report-design.md the narrow column is on the
    // outer edge so footnotes/sidebars sit close to the reader's thumb;
    // body sits inboard. Implemented per that read.
    const wideColumnLeft = PAGE.margin.inner;
    const wideColumnRight = wideColumnLeft + PAGE.grid.wideColumn;
    const narrowColumnLeft = wideColumnRight + PAGE.grid.gutter;
    const narrowColumnRight = narrowColumnLeft + PAGE.grid.narrowColumn;
    return {
      contentLeft: PAGE.margin.inner,
      contentRight: PAGE.width - PAGE.margin.outer,
      wideColumnLeft,
      wideColumnRight,
      narrowColumnLeft,
      narrowColumnRight,
      isOdd: true,
    };
  }
  // Even: inner on right, outer on left.
  const narrowColumnLeft = PAGE.margin.outer;
  const narrowColumnRight = narrowColumnLeft + PAGE.grid.narrowColumn;
  const wideColumnLeft = narrowColumnRight + PAGE.grid.gutter;
  const wideColumnRight = wideColumnLeft + PAGE.grid.wideColumn;
  return {
    contentLeft: PAGE.margin.outer,
    contentRight: PAGE.width - PAGE.margin.inner,
    wideColumnLeft,
    wideColumnRight,
    narrowColumnLeft,
    narrowColumnRight,
    isOdd: false,
  };
}

// ============================================================================
// TYPE SCALE — single source of truth per report-design.md
// ============================================================================
//
// All call sites that set fonts via doc.setFont/setFontSize should read
// from TYPE. Literal pt values outside this module are a code smell that
// breaks the type scale's invariants.

const PB_SERIF = "PB-Serif";
const PB_SANS = "PB-Sans";

export const TYPE = Object.freeze({
  coverTitle: Object.freeze({ font: PB_SANS, weight: "bold", size: 28, leading: 36 }),
  coverSubtitle: Object.freeze({ font: PB_SANS, weight: "normal", size: 14, leading: 20 }),
  sectionHead: Object.freeze({ font: PB_SANS, weight: "bold", size: 16, leading: 22 }),
  subHead: Object.freeze({ font: PB_SANS, weight: "bold", size: 12, leading: 18 }),
  body: Object.freeze({ font: PB_SERIF, weight: "normal", size: 10.5, leading: 14 }),
  bodyEmphasis: Object.freeze({ font: PB_SERIF, weight: "bold", size: 10.5, leading: 14 }),
  caption: Object.freeze({ font: PB_SANS, weight: "normal", size: 9, leading: 12 }),
  footnote: Object.freeze({ font: PB_SERIF, weight: "normal", size: 8.5, leading: 11 }),
  runningHead: Object.freeze({ font: PB_SANS, weight: "normal", size: 8, leading: 10 }),
  folio: Object.freeze({ font: PB_SANS, weight: "normal", size: 8, leading: 10 }),
  tableHeader: Object.freeze({ font: PB_SANS, weight: "bold", size: 9, leading: 12 }),
  tableBody: Object.freeze({ font: PB_SERIF, weight: "normal", size: 10.5, leading: 14 }),
});

/**
 * Apply a TYPE token to a jsPDF instance — sets font face + weight + size
 * in one call. Returns the leading (mm-equivalent reference; jsPDF leading
 * is set per-call via doc.text() vertical advance, not on the doc).
 *
 * @param {import("jspdf").jsPDF} doc
 * @param {typeof TYPE[keyof typeof TYPE]} token
 * @returns {number} leading in pt (for downstream vertical math)
 */
export function applyType(doc, token) {
  doc.setFont(token.font, token.weight);
  doc.setFontSize(token.size);
  return token.leading;
}

// ============================================================================
// FONT EMBEDDING — fetch TTF bytes, base64-encode, register with jsPDF VFS
// ============================================================================

/**
 * Convert an ArrayBuffer to base64. jsPDF's addFileToVFS expects base64.
 * Naive btoa(String.fromCharCode(...new Uint8Array(buf))) blows the call
 * stack on buffers larger than ~64KB on some engines; the chunked loop
 * avoids that. TTF sizes here are 260-440 KB so chunking is required.
 *
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // 32 KB chunks
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, /** @type {any} */ (chunk));
  }
  return btoa(binary);
}

let _fontCache = null;

/**
 * Fetch and cache the 4 font files as base64 strings. Cached across PDF
 * generations within one page session — fonts are static assets, no need
 * to re-fetch.
 *
 * @returns {Promise<{
 *   serifRegular: string,
 *   serifSemibold: string,
 *   sansRegular: string,
 *   sansSemibold: string,
 * }>}
 */
async function loadFontCache() {
  if (_fontCache) return _fontCache;
  const [serifReg, serifBold, sansReg, sansBold] = await Promise.all([
    fetch(sourceSerifRegularUrl).then((r) => r.arrayBuffer()),
    fetch(sourceSerifSemiboldUrl).then((r) => r.arrayBuffer()),
    fetch(sourceSansRegularUrl).then((r) => r.arrayBuffer()),
    fetch(sourceSansSemiboldUrl).then((r) => r.arrayBuffer()),
  ]);
  _fontCache = {
    serifRegular: arrayBufferToBase64(serifReg),
    serifSemibold: arrayBufferToBase64(serifBold),
    sansRegular: arrayBufferToBase64(sansReg),
    sansSemibold: arrayBufferToBase64(sansBold),
  };
  return _fontCache;
}

/**
 * Register PB-Serif (Source Serif 4) and PB-Sans (Source Sans 3) into a
 * jsPDF document's virtual file system + font registry. Call once per
 * jsPDF instance, before any drawing. After registration, set fonts via
 * applyType(doc, TYPE.body) etc.
 *
 * The font face names PB-Serif / PB-Sans abstract the underlying vendor
 * so future vendor swaps (e.g. when Inter static TTF becomes available
 * from a stable source) don't ripple through every doc.setFont call site.
 *
 * @param {import("jspdf").jsPDF} doc
 */
export async function embedPBFonts(doc) {
  const cache = await loadFontCache();
  // Serif (body)
  doc.addFileToVFS("PB-Serif-Regular.ttf", cache.serifRegular);
  doc.addFont("PB-Serif-Regular.ttf", "PB-Serif", "normal");
  doc.addFileToVFS("PB-Serif-Semibold.ttf", cache.serifSemibold);
  doc.addFont("PB-Serif-Semibold.ttf", "PB-Serif", "bold");
  // Sans (headings)
  doc.addFileToVFS("PB-Sans-Regular.ttf", cache.sansRegular);
  doc.addFont("PB-Sans-Regular.ttf", "PB-Sans", "normal");
  doc.addFileToVFS("PB-Sans-Semibold.ttf", cache.sansSemibold);
  doc.addFont("PB-Sans-Semibold.ttf", "PB-Sans", "bold");
  // Default body
  applyType(doc, TYPE.body);
}

// ============================================================================
// COLOUR TOKENS — restated here so reportPDF.js can import in one place
// ============================================================================
//
// Sourced from the Perennity brand. RGB arrays kept for jsPDF compatibility
// (setTextColor / setFillColor / setDrawColor all take three numbers).

export const INK = Object.freeze({
  navy: Object.freeze([11, 31, 42]), // #0B1F2A — primary text + brand
  ink: Object.freeze([26, 35, 41]), // #1A2329 — near-black body text
  inkMuted: Object.freeze([74, 87, 96]), // #4A5760 — secondary text, captions, folio
  inkFaint: Object.freeze([138, 148, 155]), // #8A949B — placeholder, disabled
  warmWhite: Object.freeze([248, 246, 242]), // #F8F6F2 — page background, button text
  surfaceTint: Object.freeze([241, 238, 232]), // #F1EEE8 — table header background
  hairline: Object.freeze([216, 220, 223]), // #D8DCDF — table rules, separators
  // Status indicators
  pass: Object.freeze([34, 139, 34]),
  partial: Object.freeze([201, 138, 4]),
  fail: Object.freeze([178, 34, 52]),
});
