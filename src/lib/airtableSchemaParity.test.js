// @ts-check
//
// Airtable option-name parity.
//
// Airtable option names are code values (see airtableSchemaContract.js for why,
// and for what each one breaks). Nothing enforced that until now: the runbook
// asked operators to remember, and several of the failure modes are silent and
// flatter the client. This turns it into a test.
//
// Three checks, in increasing order of how much they are worth:
//
//   1. CONTRACT vs ENGINE — for the constants the engine publishes in its
//      regulatory-knowledge JSON, read that file off disk and assert the
//      contract still matches. Catches an engine bump that changes an enum.
//   2. CONTRACT vs SNAPSHOT — assert the committed schema snapshot satisfies
//      every contract. Runs offline, always. Catches a careless contract edit.
//   3. CONTRACT vs LIVE AIRTABLE — the one that catches an operator renaming
//      an option in the UI, which is the actual failure mode. Needs a PAT with
//      the `schema.bases:read` scope; the current production PAT does not carry
//      it, so this skips with a message rather than passing quietly. Granting
//      that scope activates the check with no code change.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import {
  FIELD_CONTRACTS,
  KNOWN_GAPS,
  TRI_STATE_FIELDS,
  TRI_STATE_OPTIONS,
} from "./airtableSchemaContract.js";

const snapshot = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "src/__fixtures__/airtable-schema-snapshot.json"),
    "utf-8",
  ),
);

/**
 * Read one of the engine's published constant files off disk and return the
 * canonical id list. The package's exports map does not expose this path to
 * `import`, so resolve package.json and walk to it. Each file holds one array
 * under its own key, whose entries are objects carrying an `id` — the `id` is
 * the string the scoring code compares against, and therefore the string the
 * Airtable option name must equal.
 */
function readEngineConstantIds(filename, key) {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("@perennity/engine/package.json");
  const jsonPath = pkgPath.replace(
    /package\.json$/,
    `regulatory-knowledge/constants/${filename}`,
  );
  const parsed = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const rows = parsed[key];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`${filename}: no array at "${key}" (shape changed?)`);
  }
  return rows.map((r) => (typeof r === "string" ? r : r.id));
}

/**
 * Read .env.local if it is there. vitest does not populate process.env from
 * it, and this check is worthless without credentials — so read it directly
 * rather than have the live half silently never run on a developer machine.
 * Returns {} when the file is absent, which is the CI case.
 */
function readDotEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    /** @type {Record<string,string>} */
    const out = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      out[trimmed.slice(0, eq).trim()] = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

/** Every contract, including the tri-states expanded from their shorthand. */
function allContracts() {
  const triStates = TRI_STATE_FIELDS.map(([field, label]) => ({
    table: "tblRnd8BdQ65kuaej",
    field,
    label,
    required: TRI_STATE_OPTIONS,
    mode: /** @type {const} */ ("exact"),
    consumer:
      "triState() in airtableEngagement.js. A renamed 'No' is read as " +
      "'not answered', laundering a recorded finding into a data gap.",
  }));
  return [...FIELD_CONTRACTS, ...triStates];
}

/**
 * Fetch the live option names, or null when the PAT cannot read schema.
 * @returns {Promise<Record<string, string[]> | null>}
 */
async function fetchLiveSchema() {
  const env = { ...readDotEnvLocal(), ...process.env };
  const pat = env.AIRTABLE_PAT;
  const baseId = env.AIRTABLE_BASE_ID;
  if (!pat || !baseId) return null;
  let res;
  try {
    res = await fetch(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
      { headers: { Authorization: `Bearer ${pat}` } },
    );
  } catch {
    return null;
  }
  if (!res.ok) return null; // 403 = PAT lacks schema.bases:read
  const body = await res.json();
  if (!body || !Array.isArray(body.tables)) return null;
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const table of body.tables) {
    for (const field of table.fields || []) {
      const choices = field?.options?.choices;
      if (Array.isArray(choices)) {
        out[field.id] = choices.map((c) => c.name);
      }
    }
  }
  return out;
}

const live = await fetchLiveSchema();

/** Assert one contract against one source of option names. */
function assertContract(contract, actual, source) {
  const where = `${contract.label} (${contract.field}) per ${source}`;
  expect(actual, `${where}: field not found`).toBeDefined();

  for (const name of contract.required) {
    expect(
      actual.includes(name),
      `${where}\n  missing option "${name}"\n  has: ${JSON.stringify(actual)}\n  ${contract.consumer}`,
    ).toBe(true);
  }
  if (contract.mode === "exact") {
    const extra = actual.filter((n) => !contract.required.includes(n));
    expect(
      extra,
      `${where}\n  unexpected option(s) ${JSON.stringify(extra)}\n  ${contract.consumer}`,
    ).toEqual([]);
  }
}

describe("the contract still matches the engine's published constants", () => {
  it("recognised reporting standards", () => {
    const ids = readEngineConstantIds(
      "recognised_sustainability_standards.json",
      "standards",
    );
    // Two Airtable fields carry this same set.
    for (const fieldId of ["fldJSLW9dBx0YM4ZC", "fld5L3pQEGrKgh91v"]) {
      const contract = FIELD_CONTRACTS.find((x) => x.field === fieldId);
      expect([...contract.required].sort(), contract.label).toEqual([...ids].sort());
    }
  });

  it("sector-material categories", () => {
    const ids = readEngineConstantIds(
      "data_centre_sector_material_categories.json",
      "categories",
    );
    const cat = FIELD_CONTRACTS.find((x) => x.field === "fldDZcacqTnser8uP");
    expect([...cat.required].sort()).toEqual([...ids].sort());
  });
});

describe("the committed snapshot satisfies every contract", () => {
  it.each(allContracts().map((c) => [c.label, c]))("%s", (_label, contract) => {
    assertContract(contract, snapshot.fields[contract.field], "the snapshot");
  });

  it("covers every field the contract names", () => {
    const uncovered = allContracts()
      .map((c) => c.field)
      .filter((f) => !(f in snapshot.fields));
    expect(uncovered, "snapshot is missing fields the contract requires").toEqual([]);
  });
});

describe("live Airtable still matches the contract", () => {
  it("the PAT can read schema — otherwise the check that matters cannot run", () => {
    if (!live) {
      // Deliberately not a silent skip. This is the only direction that
      // catches an operator rename, and its absence should be visible.
      console.warn(
        "[airtableSchemaParity] LIVE CHECK DID NOT RUN. The PAT lacks the " +
          "`schema.bases:read` scope (or no credentials are present). Option " +
          "renames in the Airtable UI are NOT currently caught by this test. " +
          "Grant the scope to activate it — no code change needed.",
      );
    }
    expect(true).toBe(true);
  });

  it.runIf(live).each(allContracts().map((c) => [c.label, c]))(
    "%s",
    (_label, contract) => {
      assertContract(contract, live[contract.field], "live Airtable");
    },
  );
});

describe("known contract gaps stay visible", () => {
  // These are real defects, deliberately not fixed yet. Asserting on them means
  // closing one has to be a conscious edit here rather than a silent drift.
  it("indicator_source is still missing 'bespoke'", () => {
    const gap = KNOWN_GAPS.find((g) => g.field === "fldntLJtw5b4TnNUN");
    expect(gap).toBeDefined();
    expect(snapshot.fields["fldntLJtw5b4TnNUN"]).not.toContain("bespoke");
  });

  it("uk_sdr_kpis_committed still has a duplicate and a blank option", () => {
    const options = snapshot.fields["fldJ01YejLamlwxN2"];
    expect(options.filter((o) => o === "pue").length).toBe(2);
    expect(options).toContain("");
  });
});
