#!/usr/bin/env node
// Seed the test fixtures' child-table rows from docs/test-engagements/child-rows.json.
//
//   node scripts/seed-fixture-children.mjs            dry run: says what it would write
//   node scripts/seed-fixture-children.mjs --apply    writes
//
// Until 25 Sep 2026 these rows had never been in the live base — the file did
// not match the live schema, and the README's seeding instructions stopped at
// "POST matching child rows". Fixtures #3-#6 therefore ran with no ES
// characteristics, PAI coverage, Annex II coverage, project reports or PAI data,
// and fixture #5 could not be the Article 9 happy path the README promised.
//
// Refuses per (table, engagement) when that engagement already links any row in
// that table, so it cannot double-seed. Writes with typecast off: an option name
// the field does not offer fails the request rather than being created.
//
// Credentials from .env.local (the PAT needs data.records:write). Prints refs
// and counts only.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { CHILD_TABLES, CHILD_LINK_FIDS, FID } from "../src/lib/airtableEngagement.js";
import { airtableConfigFromEnv } from "../src/lib/listEngagements.js";

// The link field on each CHILD table pointing at Engagements (the inverse of
// CHILD_LINK_FIDS). Read from the live schema on 25 Sep 2026; the app itself
// only ever reads the parent side, so these are not in airtableEngagement.js.
const CHILD_SIDE_LINK = {
  ES_CHARACTERISTICS: "fldYW7p9y4kk8y9tr",
  PAI_COVERAGE: "fld1FybB5eREKO67u",
  ANNEX_II_COVERAGE: "fldTPY44vIpmbqstA",
  PROJECT_REPORTS: "fldkeJcOeOMvFAVWJ",
  PROJECT_PAI_DATA: "fldXY0B1cvPaqHc1t",
};

const apply = process.argv.includes("--apply");
loadEnvLocal();
const { pat, baseId, tableId } = airtableConfigFromEnv();
const api = (path, init = {}) =>
  fetch(`https://api.airtable.com/v0/${baseId}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
  }).then(async (r) => {
    const body = await r.json();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(body.error ?? body)}`);
    return body;
  });

const data = JSON.parse(readFileSync(resolve("docs/test-engagements/child-rows.json"), "utf8"));

// Parent engagements by reference, with what each already links.
const parents = new Map();
let offset;
do {
  const q = new URLSearchParams({ returnFieldsByFieldId: "true" });
  if (offset) q.set("offset", offset);
  const body = await api(`${tableId}?${q}`);
  for (const rec of body.records) {
    const ref = rec.fields[FID.ENGAGEMENT_REF];
    if (ref) parents.set(ref, rec);
  }
  offset = body.offset;
} while (offset);

let planned = 0;
let written = 0;
for (const [table, rows] of Object.entries(data)) {
  if (table === "_meta" || !Array.isArray(rows) || rows.length === 0) continue;
  const childTable = CHILD_TABLES[table];
  const childLink = CHILD_SIDE_LINK[table];
  if (!childTable || !childLink) throw new Error(`No table/link mapping for ${table}`);

  // Group by engagement so the refusal is per (table, engagement).
  const byRef = new Map();
  for (const row of rows) {
    if (!byRef.has(row.engagement_uuid)) byRef.set(row.engagement_uuid, []);
    byRef.get(row.engagement_uuid).push(row);
  }

  for (const [ref, group] of byRef) {
    const parent = parents.get(ref);
    if (!parent) throw new Error(`${table}: parent engagement ${ref} not in the base`);
    const existing = parent.fields[CHILD_LINK_FIDS[table]] ?? [];
    if (existing.length > 0) {
      console.log(`skip   ${table.padEnd(18)} ${ref}  already links ${existing.length} row(s)`);
      continue;
    }
    planned += group.length;
    console.log(`${apply ? "write" : "would"}  ${table.padEnd(18)} ${ref}  ${group.length} row(s)`);
    if (!apply) continue;
    // The REST API accepts at most 10 records per create.
    for (let i = 0; i < group.length; i += 10) {
      const records = group.slice(i, i + 10).map((row) => ({
        fields: { ...row.fields, [childLink]: [parent.id] },
      }));
      const body = await api(`${childTable}?returnFieldsByFieldId=true`, {
        method: "POST",
        body: JSON.stringify({ records, typecast: false }),
      });
      written += body.records.length;
    }
  }
}
console.log(apply ? `\nWrote ${written} of ${planned} row(s).` : `\nDry run: ${planned} row(s) would be written. Re-run with --apply.`);

function loadEnvLocal() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
