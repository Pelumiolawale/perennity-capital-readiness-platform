// @vitest-environment node
// @ts-check
//
// The build must refuse to inline secrets. VITE_AIRTABLE_PAT shipped in the
// public bundle in 2026; this guards against it coming back.

import { describe, it, expect } from "vitest";
import { findExposedSecrets } from "../../vite.config.js";

describe("vite.config findExposedSecrets", () => {
  it("flags VITE_AIRTABLE_PAT and other secret-looking VITE_ vars", () => {
    expect(
      findExposedSecrets({
        VITE_AIRTABLE_PAT: "pat123",
        VITE_ANTHROPIC_API_KEY: "sk-ant",
        VITE_SOME_SECRET: "s",
      }).sort(),
    ).toEqual(["VITE_AIRTABLE_PAT", "VITE_ANTHROPIC_API_KEY", "VITE_SOME_SECRET"]);
  });

  it("allows the engine SHA, non-secret IDs and unprefixed secrets", () => {
    expect(
      findExposedSecrets({
        VITE_ENGINE_COMMIT_SHA: "abc",
        VITE_AIRTABLE_BASE_ID: "app",
        AIRTABLE_PAT: "pat123",
      }),
    ).toEqual([]);
  });

  it("ignores empty values", () => {
    expect(findExposedSecrets({ VITE_AIRTABLE_PAT: "" })).toEqual([]);
  });
});
