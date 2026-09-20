#!/usr/bin/env node
// @ts-check
//
// Regenerate src/__fixtures__/airtable-schema-snapshot.json from live Airtable.
//
// The snapshot is the offline half of the option-name parity check (see
// src/lib/airtableSchemaParity.test.js). Refreshing it is a DELIBERATE act:
// it is how a legitimate schema change gets accepted, so the diff is the
// review, and the commit message should say what changed in Airtable and why.
//
// Never run this to "make the tests pass". If the parity test is failing, one
// of two things is true: someone renamed an option that is a code value, or
// the contract in airtableSchemaContract.js needs a matching change. Refreshing
// the snapshot without doing one of those hides the defect the test exists to
// catch.
//
// Usage:  node scripts/refresh-airtable-schema.mjs
// Needs:  AIRTABLE_PAT (with the `schema.bases:read` scope) and AIRTABLE_BASE_ID,
//         from the environment or .env.local.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SNAPSHOT = resolve(process.cwd(), "src/__fixtures__/airtable-schema-snapshot.json");

function readDotEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    const out = {};
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...readDotEnvLocal(), ...process.env };
const pat = env.AIRTABLE_PAT;
const baseId = env.AIRTABLE_BASE_ID;

if (!pat || !baseId) {
  console.error("AIRTABLE_PAT and AIRTABLE_BASE_ID must be set (env or .env.local).");
  process.exit(1);
}

const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
  headers: { Authorization: `Bearer ${pat}` },
});

if (res.status === 403 || res.status === 404) {
  console.error(
    "Airtable refused the schema read (HTTP " + res.status + ").\n" +
      "The PAT almost certainly lacks the `schema.bases:read` scope — the data\n" +
      "scopes are not enough. Add it at https://airtable.com/create/tokens and\n" +
      "re-run. Granting it also activates the live half of the parity test.",
  );
  process.exit(1);
}
if (!res.ok) {
  console.error(`Airtable API error: ${res.status}`);
  process.exit(1);
}

const body = await res.json();

/** @type {Record<string, string[]>} */
const fields = {};
for (const table of body.tables ?? []) {
  for (const field of table.fields ?? []) {
    const choices = field?.options?.choices;
    if (Array.isArray(choices)) fields[field.id] = choices.map((c) => c.name);
  }
}

// Keep only the fields the snapshot already tracks, so an unrelated new select
// elsewhere in the base does not churn the file. To start tracking a new field,
// add it to the contract and to the snapshot by hand once.
const previous = JSON.parse(readFileSync(SNAPSHOT, "utf-8"));
/** @type {Record<string, string[]>} */
const tracked = {};
for (const id of Object.keys(previous.fields)) {
  if (id in fields) tracked[id] = fields[id];
  else console.warn(`  field ${id} is tracked but no longer exists in the base`);
}

const next = {
  ...previous,
  _captured: new Date().toISOString().slice(0, 10),
  fields: tracked,
};

writeFileSync(SNAPSHOT, JSON.stringify(next, null, 2) + "\n");
console.log(
  `Refreshed ${Object.keys(tracked).length} fields into ${SNAPSHOT}.\n` +
    "Read the diff before committing — it is the review.",
);
