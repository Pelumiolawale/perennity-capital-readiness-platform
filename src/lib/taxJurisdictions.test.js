// @ts-check
//
// ITEM-02 — the SFDR c2 Domain D Annex I tax screen.
//
// Three things are worth locking down here:
//   1. the codes operators actually type reach the engine as names it matches;
//   2. ordinary jurisdictions still pass through and still do not match;
//   3. the alias map cannot drift out of step with the engine's Annex I list.
//
// (3) is the one that matters over time. The list refreshes ~twice a year and
// lives in the engine, so the parity test reads the engine's own knowledge
// base off disk rather than trusting a copy.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  normaliseJurisdiction,
  parseJurisdictionsUsed,
  canonicalAnnexINames,
} from "./taxJurisdictions.js";

describe("normaliseJurisdiction", () => {
  it.each([
    ["RU", "Russian Federation"],
    ["ru", "Russian Federation"],
    ["RUS", "Russian Federation"],
    ["Russia", "Russian Federation"],
    ["VN", "Viet Nam"],
    ["Vietnam", "Viet Nam"],
    ["PA", "Panama"],
    ["VU", "Vanuatu"],
    ["TC", "Turks and Caicos Islands"],
    ["Turks & Caicos", "Turks and Caicos Islands"],
    ["VI", "US Virgin Islands"],
    ["U.S. Virgin Islands", "US Virgin Islands"],
    ["AS", "American Samoa"],
    ["AI", "Anguilla"],
    ["GU", "Guam"],
    ["PW", "Palau"],
  ])("%j → %j", (input, expected) => {
    expect(normaliseJurisdiction(input)).toBe(expected);
  });

  it("passes an already-canonical name through unchanged", () => {
    expect(normaliseJurisdiction("Russian Federation")).toBe("Russian Federation");
  });

  it.each(["DE", "NL", "FR", "GB", "AE", "SA", "Germany"])(
    "leaves the non-listed jurisdiction %j alone",
    (input) => {
      expect(normaliseJurisdiction(input)).toBe(input);
    },
  );

  it("trims surrounding whitespace", () => {
    expect(normaliseJurisdiction("  ru  ")).toBe("Russian Federation");
    expect(normaliseJurisdiction("  DE  ")).toBe("DE");
  });
});

describe("parseJurisdictionsUsed", () => {
  it("parses the format live records actually use", () => {
    expect(parseJurisdictionsUsed("DE, NL, FR")).toEqual(["DE", "NL", "FR"]);
  });

  it("translates a listed jurisdiction inside an ordinary list", () => {
    expect(parseJurisdictionsUsed("DE, NL, RU")).toEqual([
      "DE",
      "NL",
      "Russian Federation",
    ]);
  });

  it("de-duplicates aliases that mean the same jurisdiction", () => {
    expect(parseJurisdictionsUsed("RU, Russia, RUS")).toEqual([
      "Russian Federation",
    ]);
  });

  it("drops empty tokens and tolerates trailing commas", () => {
    expect(parseJurisdictionsUsed("DE,,NL, ,")).toEqual(["DE", "NL"]);
  });

  it.each([undefined, null, "", 42, {}])("returns [] for %j", (raw) => {
    expect(parseJurisdictionsUsed(/** @type {any} */ (raw))).toEqual([]);
  });
});

describe("parity with the engine's Annex I list", () => {
  // Read the engine's own knowledge base rather than a copy. The package's
  // exports map does not expose this path to `import`, so resolve the
  // package.json and walk to the file.
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("@perennity/engine/package.json");
  const jsonPath = pkgPath.replace(
    /package\.json$/,
    "regulatory-knowledge/constants/eu_non_cooperative_jurisdictions.json",
  );
  const annexI = JSON.parse(readFileSync(jsonPath, "utf-8")).annex_i;

  it("the engine's list is non-empty (guards against reading the wrong file)", () => {
    expect(Array.isArray(annexI)).toBe(true);
    expect(annexI.length).toBeGreaterThan(0);
  });

  it("every Annex I jurisdiction is reachable from the alias map", () => {
    // If this fails, the pinned engine's list gained a jurisdiction and
    // taxJurisdictions.js needs an ALIASES entry for it — otherwise operators
    // typing its ISO code would silently slip past the screen again.
    expect([...canonicalAnnexINames()].sort()).toEqual([...annexI].sort());
  });

  it("each canonical name is a fixed point of normalisation", () => {
    for (const name of annexI) {
      expect(normaliseJurisdiction(name)).toBe(name);
    }
  });
});
