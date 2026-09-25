// The paid route must not construct the engine itself. It did, until 25 Sep
// 2026, while engineClient.js claimed to be the single engine boundary — and
// because the assembly lived only in the route, no script could reproduce a
// report's inputs. Both routes now go through a module; this pins that.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("the engine boundary", () => {
  it("ReportRoute imports nothing from @perennity/engine", () => {
    expect(read("../routes/ReportRoute.jsx")).not.toMatch(
      /from\s+["']@perennity\/engine["']/,
    );
  });

  it("reportRun.js reads no build-time env, so Node scripts can load it", () => {
    // Usage, not mentions: both files explain in comments why they avoid it.
    const usesEnv = /import\.meta\.env[.[]/;
    expect(read("./reportRun.js")).not.toMatch(usesEnv);
    expect(read("./frameworkSets.js")).not.toMatch(usesEnv);
    expect(read("./engineClient.js"), "sanity: the pattern does catch real use").toMatch(usesEnv);
  });

  it("the free Snapshot path does not import the paid-only reportRun.js", () => {
    expect(read("./engineClient.js")).not.toMatch(/from\s+["']\.\/reportRun\.js["']/);
  });
});
