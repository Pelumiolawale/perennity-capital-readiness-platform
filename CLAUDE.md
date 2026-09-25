# CLAUDE.md — rules for working in this repo

Eleven source files cite this document as the authority for the free/paid boundary. Until
20 Sep 2026 it did not exist: the rules were real and consistently followed, but they lived
only in the comments that pointed here. This file makes the cited authority real. It records
what was already being done — it is not a new policy.

Keep it short. A rule nobody reads is not a rule.

---

## What this product is

A React/Vite SPA on Vercel with two tiers:

- **Free** — `/assessment/snapshot`. A self-serve wizard producing an indicative snapshot
  and a lead-generation PDF. Explicitly **not** assurance.
- **Paid** — `/assessment/report`. An £85k investor-grade Project Readiness Report,
  generated from data an operator enters in Airtable and scored by a pinned engine repo
  (`@perennity/engine`, pinned by commit SHA in `package.json`).

**Reports are signed in wet ink.** The PDF is printed, signed by hand, and that copy is the
issued opinion. There is no signature asset and no digital signing path — the signature page
leaves a rule to sign on, and a caption stating that an unsigned copy is a draft. So nothing
in the app should claim a report is "signed", and nothing should warn that it is not: the
download never is, by design. An earlier version stamped NOT YET COUNTERSIGNED in red on
every report, which is what a permanent warning always becomes — invisible.

The engine is the methodology. This repo reads it, renders it, and must never restate it.

---

## The four rules

### 1. The free tier must not receive paid methodology

A free user must never be able to extract a methodology version stamp, per-criterion SPO
narrative, PAI tables, signature blocks, or anything else resembling a Second Party Opinion.

Files marked `// Paid-flow only` at the top must be imported only from `/assessment/report`
and its children. This is architectural, not enforceable by the language — the import would
compile fine. It is checked by reading.

The files under this rule today:

```
src/components/SFDRPAITable.jsx   src/lib/entityInputAdapter.js
src/export/footnoteEngine.js      src/lib/paiCsvExport.js
src/export/reportTypography.js    src/lib/sfdrInputAdapter.js
src/lib/snapshotPhrases.js        src/lib/taxJurisdictions.js
src/lib/ukSDRInputAdapter.js      src/lib/reportRun.js
```

`src/lib/snapshotPhrases.js` is the one whose name invites the mistake. Despite "snapshot"
in the filename, it holds the 125 investor-grade per-criterion phrases and is **paid-only**.

### 2. `undefined` means "not answered". Nothing else does.

The engine treats `undefined` as no input, and every other value — including `null`, `0`,
`false`, `""` and `[]` — as a real answer from the developer.

This single contract is the root cause of six separate defects fixed in this codebase, each
of which put a scored failure in front of a client for a question nobody had asked. A blank
WUE read as `0` passed a regulated water threshold. An unticked checkbox read as a definite
"No". An empty list read as a finding of zero practices.

So: **never coerce a blank cell.** No `?? null`, no `?? 0`, no `Boolean(...)` on a checkbox,
no literal default standing in for an answer. Let the key be absent and let the engine say
`data_missing`, which is the truth.

`omitBlanks()` in `src/lib/airtableEngagement.js` strips blanks once at the boundary so that
forgetting is harmless. `src/lib/blankRecordGuard.test.js` enforces the property: an
engagement with nothing filled in must produce no answers. It also pins the fabrications
that remain, each with a reason. That list may shrink deliberately. It must never grow
quietly.

### 3. Address Airtable data by identity, never by name or position

Field IDs (`fld…`) and table IDs (`tbl…`) are immutable. Display names are not — an operator
can rename a column in the UI and break a report with no error anywhere.

Write field IDs. Fetch child rows by record ID via `RECORD_ID()`, which names no field at
all. Never index an array from an external package by position.

**One exception exists and only one.** The initial engagement lookup filters by
`{Engagement Reference}` because `filterByFormula` offers no way to address a field by ID.
It is guarded: on the 422 that a rename produces, the code falls back to a client-side scan
by field ID and warns loudly. Clients keep working and the drift still gets noticed. Do not
add a second exception.

Airtable single-select **option names are code values**, compared literally by the engine.
`src/lib/airtableSchemaContract.js` is the contract between the two, and
`airtableSchemaParity.test.js` checks it against both the engine's constants and the live
base. Renaming an option in the Airtable UI is a code change made in a spreadsheet.

### 4. If a field is required, prove it is rendered

Two defects had the same shape: a field the PDF generator refused to run without, which then
appeared on no page. The signature block was one — the report page promised "Investor-grade.
Signed." and handed over an unsigned document. The Article 26 disclaimer was the other.

Both were invisible to unit tests, because every unit was correct in isolation, and both
survived human review. `src/export/renderCompleteness.test.js` tests the invariant instead of
the instances, in both directions: a required field must reach the page, and a drawn field
must be required. Add a required field, add it there.

---

## Working practice

**Red before green.** A test that was never red proves nothing. Prove the failure first.

**Never invent a number.** If the engine declines to score something, the renderer prints
nothing — not its own weighting. A figure the client cannot distinguish from methodology,
which exists in no methodology document, is the most damaging thing this codebase can emit.
`computeProductLabelScore` was deleted for doing exactly that.

**Run the build, not just the tests.** `npm test` (vitest) only loads the files some test
imports; `npm run build` (`vite build`) resolves every import the app actually ships, so it
catches a broken import in a file no test touches. Neither type-checks: this repo has no
TypeScript toolchain, and the `// @ts-check` headers are read by editors only.

The engine repo is different. Its `build` is `tsc` and its `prepare` runs the build, so a
type error there makes the package uninstallable — and that surfaces at `npm install` in
this repo, not in the engine's own test run. *Corrected 25 Sep 2026: this said `npm test`
here ran under `tsx` and `npm run build` ran `tsc`. Neither is true of this repo.*

**Verify against the live base before and after.** Structural changes to the Airtable read
path must rescore all live engagements byte-identically. Anything else is a bug in the
change, not a finding. The tool is `npm run rescore -- --out rescore/before.json`, then
again after the change, then `npm run rescore -- --diff rescore/before.json rescore/after.json`.
It scores through `src/lib/reportRun.js`, the same function the paid route calls, so it
cannot drift from what clients receive. Output goes to `rescore/`, which is gitignored —
it holds engagement data.

**Never put a credential in client code.** The Airtable PAT moved server-side to
`api/leads.js` on 18 Sep 2026. `VITE_`-prefixed environment variables are compiled into the
browser bundle — never prefix a secret with `VITE_`. Some older runbooks said to; they were
wrong and have been corrected.

---

## Where things are

| | |
|---|---|
| Airtable base | `appasxX7eC3QsmxeM` — Engagements `tblRnd8BdQ65kuaej` |
| Schema contract | `src/lib/airtableSchemaContract.js` |
| Airtable read path | `src/lib/airtableEngagement.js` |
| Engine boundary | `src/lib/engineClient.js` (free), `src/lib/reportRun.js` (paid) — see below |
| Rescore harness | `npm run rescore` (`scripts/rescore.mjs`) |
| Paid PDF | `src/export/reportPDF.js` |
| Operator runbook | `docs/runbook-paid-reports.md` |
| Call checklist | `docs/engagement-call-checklist.md` |
| Base schema changes | `docs/airtable-schema-corrections.md` |

Re-pin the engine by commit SHA, never by tag or branch.

### The engine import boundary

No route constructs the engine. The free Snapshot runs it through `runSnapshot` in
`src/lib/engineClient.js`; the paid Report runs it through `runReport` in
`src/lib/reportRun.js`, taking the audit-bearing constants (commit SHA, KB hash, methodology
version) from `engineClient.js`. `src/lib/reportRun.test.js` pins this.

They are two files, not one, on purpose. `engineClient.js` is imported by the free path, so
it cannot import the paid-only adapters (rule 1). And `reportRun.js` reads no
`import.meta.env`, so `scripts/rescore.mjs` can run it under plain Node.

Until 25 Sep 2026 `ReportRoute.jsx` built and ran `DeterministicEngine` itself while
`engineClient.js` claimed to be the single boundary. Other files still import the package —
`@typedef` imports that erase at build, and regulatory-knowledge JSON read deliberately as
the source of truth — and that is fine. Running the engine is what goes through the two
entry points.
