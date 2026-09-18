// @vitest-environment node
// @ts-check
//
// BUG-07: production builds must not ship console.log / debug / info, so no
// future debug line can leak form data to visitors' consoles.

import { describe, it, expect } from "vitest";
import configFn, { PROD_PURE_CONSOLE } from "../../vite.config.js";

/** @param {"build" | "serve"} command */
function resolve(command) {
  return /** @type {any} */ (configFn)({ mode: "production", command });
}

describe("vite.config console stripping", () => {
  it("marks console.log/debug/info as pure in production builds", () => {
    expect(resolve("build").esbuild.pure).toEqual(PROD_PURE_CONSOLE);
    expect(PROD_PURE_CONSOLE).toEqual(["console.log", "console.debug", "console.info"]);
  });

  it("keeps console.warn and console.error", () => {
    expect(PROD_PURE_CONSOLE).not.toContain("console.warn");
    expect(PROD_PURE_CONSOLE).not.toContain("console.error");
  });

  it("does not strip anything in dev", () => {
    expect(resolve("serve").esbuild.pure).toBeUndefined();
  });
});
