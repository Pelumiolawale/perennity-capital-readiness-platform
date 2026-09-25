#!/usr/bin/env node
// Rescore every engagement in the live base, through the same code path a paid
// report uses (src/lib/reportRun.js), and write the result to a JSON file.
//
//   node scripts/rescore.mjs --out rescore/before.json
//   node scripts/rescore.mjs --diff rescore/before.json rescore/after.json
//
// CLAUDE.md asks for every structural change to the Airtable read path to be
// rescored before and after. This is the tool for that. Each engagement's
// entry holds the assembled engine input AND the scoring results, so a diff
// shows a changed input as well as a changed verdict.
//
// Read-only against Airtable. Credentials come from .env.local (the same three
// server-side variables the /api functions use); nothing is printed but refs.
//
// Expiry is ignored by passing fetchEngagement a clock set to the epoch —
// fixtures' 90-day windows lapse, and a rescore still has to cover them. The
// status check is NOT bypassed: a non-active record is reported, not scored.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  BUNDLED_ACTIVITIES,
  METHODOLOGY_VERSION,
  computeKnowledgeBaseHash,
} from "@perennity/engine";
import { fetchEngagement, FID } from "../src/lib/airtableEngagement.js";
import { airtableConfigFromEnv } from "../src/lib/listEngagements.js";
import { isRoutableTargetLabel } from "../src/lib/frameworkSets.js";
import { assembleRunInput, runReport } from "../src/lib/reportRun.js";

const args = process.argv.slice(2);

if (args[0] === "--diff") {
  process.exit(diff(args[1], args[2]));
}

const outIdx = args.indexOf("--out");
const outPath = resolve(outIdx >= 0 ? args[outIdx + 1] : "rescore/latest.json");

loadEnvLocal();
const config = airtableConfigFromEnv();

const refs = await listAllReferences(config);
/** @type {Record<string, unknown>} */
const result = {};
for (const ref of refs.sort()) {
  const fetched = await fetchEngagement(ref, { ...config, now: 0 });
  if (!fetched.ok) {
    result[ref] = { refused: fetched.reason };
    continue;
  }
  const e = /** @type {any} */ (fetched.engagement);
  if (!isRoutableTargetLabel(e.target_label)) {
    result[ref] = { refused: "unroutable_target_label", target_label: e.target_label ?? null };
    continue;
  }
  const { run } = await runReport(e, {
    engine_commit_sha: "rescore",
    knowledge_base_hash: computeKnowledgeBaseHash(BUNDLED_ACTIVITIES),
    methodology_version: METHODOLOGY_VERSION,
    signatory: { name: "rescore", title: "rescore" },
    disclaimer: "rescore",
  });
  result[ref] = {
    target_label: e.target_label,
    input: assembleRunInput(e),
    framework_results: run.framework_results,
    gap_list: run.gap_list,
  };
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
const scored = Object.values(result).filter((r) => !(/** @type {any} */ (r).refused)).length;
console.log(`Scored ${scored} of ${refs.length} engagements → ${outPath}`);
for (const [ref, r] of Object.entries(result)) {
  const x = /** @type {any} */ (r);
  if (x.refused) console.log(`  not scored: ${ref} (${x.refused})`);
}

// ---------------------------------------------------------------------------

function loadEnvLocal() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

/** Every Engagement Reference in the table, regardless of status. */
async function listAllReferences({ pat, baseId, tableId }) {
  const refs = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`);
    url.searchParams.set("returnFieldsByFieldId", "true");
    url.searchParams.append("fields[]", FID.ENGAGEMENT_REF);
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
    if (!res.ok) throw new Error(`Airtable list failed: HTTP ${res.status}`);
    const body = await res.json();
    for (const rec of body.records ?? []) {
      const ref = rec.fields?.[FID.ENGAGEMENT_REF];
      if (ref) refs.push(ref);
    }
    offset = body.offset;
  } while (offset);
  return refs;
}

/** Print verdict changes, then any other difference. Exit 1 if anything differs. */
function diff(aPath, bPath) {
  const a = JSON.parse(readFileSync(aPath, "utf8"));
  const b = JSON.parse(readFileSync(bPath, "utf8"));
  let changed = 0;
  for (const ref of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    if (JSON.stringify(a[ref]) === JSON.stringify(b[ref])) continue;
    changed += 1;
    console.log(`\n${ref} (${b[ref]?.target_label ?? a[ref]?.target_label ?? "?"})`);
    const va = verdicts(a[ref]);
    const vb = verdicts(b[ref]);
    for (const k of [...new Set([...Object.keys(va), ...Object.keys(vb)])].sort()) {
      if (va[k] !== vb[k]) console.log(`  ${k}: ${va[k] ?? "—"} → ${vb[k] ?? "—"}`);
    }
    for (const part of ["refused", "input", "framework_results", "gap_list"]) {
      if (JSON.stringify(a[ref]?.[part]) !== JSON.stringify(b[ref]?.[part])) {
        console.log(`  [${part} differs]`);
      }
    }
  }
  console.log(changed ? `\n${changed} engagement(s) differ.` : "Identical.");
  return changed ? 1 : 0;
}

function verdicts(entry) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const fr of entry?.framework_results ?? []) {
    out[`${fr.activity_id} overall`] = fr.overall_verdict;
    for (const list of ["sc_results", "dnsh_results", "safeguards_results", "methodology_results"]) {
      for (const c of fr[list] ?? []) {
        if (c && c.criterion_id) out[`${fr.activity_id} ${c.criterion_id}`] = c.verdict;
      }
    }
  }
  return out;
}
