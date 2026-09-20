// @ts-check
// Paid-flow only.
//
// ITEM-02 (Sep 2026) — SFDR c2 Domain D tax screen.
//
// The `c2 Tax Jurisdictions Used` Airtable cell is a comma-separated list, and
// both the runbook and the engagement-call checklist tell operators to enter
// ISO country codes ("DE, NL, FR"). Every populated record in the base follows
// that instruction.
//
// The engine screens that list against EU_NON_COOPERATIVE_JURISDICTIONS, whose
// members are the Council document's official LONG FORMS — "Russian
// Federation", "Viet Nam", "Turks and Caicos Islands". So `"RU"` was compared
// against `"Russian Federation"`, never matched, and the Annex I screen never
// fired for anybody. An entity operating through a listed jurisdiction still
// scored a clean Domain D, and the runbook documented the opposite ("Listing
// any Annex I jurisdiction (e.g. RU, PA, VU, VN) forces c2 / domain D to
// fail").
//
// This module translates what operators actually type into what the engine
// actually matches on.
//
// SCOPE — deliberately narrow. This is NOT a general ISO 3166 table. Only the
// Annex I jurisdictions are aliased, because they are the only names the
// screen compares against; every other input is passed through with its
// whitespace trimmed and is expected NOT to match. Adding the other ~240
// countries would be dead weight that still has to be kept correct.
//
// DRIFT — the Annex I list refreshes roughly twice a year (ECOFIN February and
// October cycles) and lives in the engine, not here. ALIASES is keyed by the
// engine's canonical strings, and taxJurisdictions.test.js reads the engine's
// own regulatory-knowledge JSON off disk and fails if any listed jurisdiction
// has no entry here. A list refresh that adds a jurisdiction therefore breaks
// the build rather than quietly reopening this hole.

/**
 * Canonical Annex I name → the spellings an operator might reasonably type.
 * Keys MUST match the engine's EU_NON_COOPERATIVE_JURISDICTIONS entries
 * exactly; the parity test enforces that.
 *
 * Each entry lists ISO 3166-1 alpha-2, alpha-3, and the common short names
 * and punctuation variants seen in corporate disclosure.
 */
const ALIASES = {
  "American Samoa": ["AS", "ASM", "American Samoa"],
  Anguilla: ["AI", "AIA", "Anguilla"],
  Guam: ["GU", "GUM", "Guam"],
  Palau: ["PW", "PLW", "Palau"],
  Panama: ["PA", "PAN", "Panama", "Republic of Panama"],
  "Russian Federation": ["RU", "RUS", "Russia", "Russian Federation"],
  "Turks and Caicos Islands": [
    "TC",
    "TCA",
    "Turks and Caicos",
    "Turks & Caicos",
    "Turks and Caicos Islands",
    "Turks & Caicos Islands",
  ],
  "US Virgin Islands": [
    "VI",
    "VIR",
    "US Virgin Islands",
    "U.S. Virgin Islands",
    "USVI",
    "United States Virgin Islands",
    "Virgin Islands (U.S.)",
    "Virgin Islands, U.S.",
  ],
  Vanuatu: ["VU", "VUT", "Vanuatu"],
  "Viet Nam": ["VN", "VNM", "Vietnam", "Viet Nam"],
};

/**
 * Fold a jurisdiction string to a comparison key: case-insensitive, and with
 * punctuation and internal whitespace removed, so "U.S. Virgin Islands",
 * "us virgin islands" and "USVirginIslands" all land on the same key.
 * @param {string} s
 */
function foldKey(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Lazily built folded-alias → canonical-name lookup. */
const LOOKUP = (() => {
  /** @type {Map<string, string>} */
  const m = new Map();
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) m.set(foldKey(alias), canonical);
  }
  return m;
})();

/**
 * The canonical Annex I names this module knows how to reach. Exported for the
 * parity test, which checks it against the engine's knowledge base.
 * @returns {string[]}
 */
export function canonicalAnnexINames() {
  return Object.keys(ALIASES);
}

/**
 * Translate one jurisdiction token into the engine's vocabulary.
 *
 * Returns the engine's canonical Annex I spelling when the token is a
 * recognised alias of a listed jurisdiction; otherwise returns the token with
 * its surrounding whitespace trimmed. Non-listed jurisdictions ("DE", "NL")
 * are passed through deliberately — they are not meant to match anything.
 *
 * @param {string} token
 * @returns {string}
 */
export function normaliseJurisdiction(token) {
  const trimmed = String(token).trim();
  return LOOKUP.get(foldKey(trimmed)) ?? trimmed;
}

/**
 * Parse a comma-separated `c2 Tax Jurisdictions Used` cell into the list the
 * engine screens. Empty tokens are dropped; duplicates that collapse onto the
 * same canonical name are de-duplicated (an operator writing "RU, Russia"
 * means one jurisdiction, not two).
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
export function parseJurisdictionsUsed(raw) {
  if (typeof raw !== "string") return [];
  const out = [];
  const seen = new Set();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const canonical = normaliseJurisdiction(trimmed);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}
