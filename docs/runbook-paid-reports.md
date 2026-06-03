# Runbook — Generating a Paid Project Readiness Report

**Audience:** anyone other than the founder. Specifically: Dolapo's analyst, a Perennity
Bridge contractor, or any operator who has been granted Airtable access and a local clone
of this repo.

**Goal:** take a signed engagement letter from a client, populate Airtable, generate a
paid Project Readiness Report PDF, verify it, and send it to the client. End-to-end this
takes 30-90 minutes per engagement once you are comfortable with the steps.

**Engine pin:** `@perennity/engine#v0.6.0` (UK SDR Phase 2). Confirm this in `package.json`
before starting — engine versions affect what verdicts are produced.

---

## Prerequisites (one-time setup)

1. **Airtable access:** request collaborator access to base `appasxX7eC3QsmxeM` from
   Bolu. Verify you can open the `Engagements` table at
   `https://airtable.com/appasxX7eC3QsmxeM/tblRnd8BdQ65kuaej`.
2. **Repo clone:**
   ```
   git clone https://github.com/Pelumiolawale/perennity-capital-readiness-platform.git
   cd perennity-capital-readiness-platform
   npm install
   ```
3. **`.env.local`:** create at the repo root with:
   ```
   VITE_AIRTABLE_PAT=<your Airtable Personal Access Token>
   VITE_AIRTABLE_BASE_ID=appasxX7eC3QsmxeM
   VITE_AIRTABLE_ENGAGEMENTS_TABLE_ID=tblRnd8BdQ65kuaej
   ```
   Get the PAT from Airtable: Account → Developer hub → Personal access tokens → create
   token with `data.records:read` scope on the `appasxX7eC3QsmxeM` base.
   The `VITE_ENGINE_COMMIT_SHA` build-time variable is set automatically by `vite.config.js`
   from `package-lock.json` — no action needed.
4. **Dev server:** `npm run dev`. Confirm it boots on `http://localhost:5173/`.
5. **Test fixtures:** confirm the 12 test engagements in `docs/test-engagements/` are
   seeded in Airtable (they are as of 2026-06-03; ask Bolu if unsure). Use engagement #1
   (UUID `6239c407-a1fa-4335-86fb-5cdda3e480cb`) for the smoke test below.

**Smoke test before first real engagement:** open
`http://localhost:5173/assessment/report?ref=6239c407-a1fa-4335-86fb-5cdda3e480cb`. The
page should load, show the client/project summary card, and offer a "Download PDF" button.
If you instead see an entitlement error, check `.env.local` and your PAT permissions.

---

## Generating a paid report — happy path checklist

For a new client engagement, follow these 10 steps in order. Steps 4-8 depend on the
client's target framework (see the per-label appendix at
`docs/runbook-paid-reports-appendix-labels.md`).

### 1. Generate a UUID v4 engagement reference

```
node -e 'console.log(crypto.randomUUID())'
```

Copy the result (e.g. `6239c407-a1fa-4335-86fb-5cdda3e480cb`). This is the engagement
reference, the URL query param for the gated route, and the immutable primary key for the
Airtable record. Save it somewhere durable — share it with the client at the end.

### 2. Create a new Airtable record in `Engagements`

Open `https://airtable.com/appasxX7eC3QsmxeM/tblRnd8BdQ65kuaej`. Click `+ Add record`. Set:

- **Engagement Reference:** the UUID from step 1
- **Status:** `active` (literally — the engine rejects anything else)
- **Issued At:** today's ISO timestamp (Airtable's dateTime picker)
- **Expires At:** 90 days from today (paid Report tier validity window)
- **Client Name, Project Name, Project ID:** from the engagement letter
- **Engagement Letter Signed:** check the box
- **Engagement Letter Date:** the countersignature date

### 3. Pick the target framework (Target Label single-select)

Choose ONE of:
- `eu_taxonomy_aligned_8_1` — default for EU developers seeking Taxonomy alignment only
- `sfdr_article_8` — fund placement under SFDR Art 8 (light-green / E/S characteristics)
- `sfdr_article_9` — fund placement under SFDR Art 9 (sustainable investment objective)
- `uk_sdr_focus` — UK SDR Sustainability Focus label
- `uk_sdr_improvers` — UK SDR Sustainability Improvers label
- `uk_sdr_impact` — UK SDR Sustainability Impact label

(`uk_sdr_mixed_goals` is on the dropdown but not yet routable — don't use it.)

The Target Label determines which framework set the engine loads + which extra Airtable
fields the engagement needs populated. See the per-label appendix.

### 4. Populate project-level intake fields

Required for every label:

- **Facility Type:** `hyperscale` / `colocation` / `edge` / `enterprise`
- **Jurisdiction:** ISO 3166-1 alpha-2 country code (e.g. `DE`, `NG`, `BR`)
- **Facility Status:** `design` / `construction` / `operational`
- **Build Completion Year:** integer
- **Annualised PUE:** number
- **WUE Annualised:** number (L/kWh)
- **Site Water Stress:** `Low` / `Low - Medium` / `Medium - High` / `High` / `Extremely High`
  (capitalised, exactly as shown — these are Airtable single-select options)
- **Climate Risk Completed:** checkbox
- **Climate Risk Methodology:** free text describing the climate-risk assessment
- **Last Independent Audit Date:** date of the most recent third-party audit

### 5. Populate ECoCC practices + PUE measurement compliance

- **ECoCC Practices Implemented (JSON):** a JSON array of practice strings. Common values:
  `airflow_management`, `hot_cold_aisle_containment`, `raised_floor_pressurisation`,
  `variable_speed_fans`, `economiser_freecooling`. More practices = stronger c1 verdict.
- **PUE Measurement Methodology Declared:** `EN_50600_4_2` / `ISO_IEC_30134_2` /
  `other_with_documentation`
- **PUE Measurement Category:** `category_1` / `category_2` / `category_3`
- **PUE Measurement Boundary Documented:** checkbox
- **PUE Reporting Basis:** `annualised` / `design_point_only`

### 6. Populate Minimum Safeguards multi-selects

Four pillars + circular economy. Each is an Airtable multi-select with engine-expected
option strings. Tick every item the developer attests to. Missing items reduce safeguards
verdict from `pass` to `partial` or `fail`.

See `docs/runbook-paid-reports-appendix-labels.md` for the full option list per pillar.

### 7. Populate framework-specific fields

Depends on the Target Label chosen in step 3. See the per-label appendix for the exact
fields. SFDR Art 8/9 engagements need SFDR Specifics fields + the 26 c2/c3/c7 entity-axis
scalars + (if claiming Taxonomy alignment) the 8 c6 fields. UK SDR Focus / Improvers /
Impact each need different UK SDR Specifics fields.

### 8. Populate child-table rows (SFDR Art 8/9 only)

SFDR engagements link to multiple child tables. The Engagements record has linked-record
fields named `SFDR ES Characteristics`, `SFDR PAI Coverage`, `SFDR Annex II Coverage`,
`SFDR Project Reports`, `SFDR Parent Portfolio Reports`, `SFDR Project PAI Data`.

For each, click `+ Add row` (Airtable's expanded record view) to create a child row,
populate the fields per the appendix, and confirm the engagement-link field is set to the
parent record.

UK SDR engagements do NOT use these child tables.

### 9. Generate the PDF

Open `http://localhost:5173/assessment/report?ref=<your-uuid>`. The page loads, shows the
engagement summary, and offers "Download PDF" and (for SFDR engagements) "Download PAI
Data (CSV)" buttons.

Click "Download PDF". The PDF is generated client-side via jsPDF; it downloads to your
default downloads folder named like `Perennity_Bridge_Report_<short-uuid>.pdf`.

### 10. Verify the PDF + send to client

Open the downloaded PDF. Run through the verification checklist below before sending. If
everything checks out, email the PDF + (where applicable) PAI CSV to the client. Update
the Airtable record's `Report Generated At` field to record when you sent it.

---

## Verification checklist (run BEFORE sending)

Open the PDF. Confirm each of:

1. **Cover page** — client name, project name, target label all correct. Subtitle matches
   the chosen framework (e.g. "SFDR Article 9 (sustainable investment objective)" or
   "UK SDR — Sustainability Focus").
2. **Article 26 footer** — present on every page. Reads (paraphrased): "This document is
   advisory in nature. It does not constitute regulatory assurance, audit, or verification
   within the meaning of Article 26 of Regulation (EU) 2020/852 or under any equivalent
   regime in the United Kingdom or any other jurisdiction." This is a regulatory invariant
   — if it's missing, do not send.
3. **Methodology version stamp** — currently `v3.5`. Visible in cover-page subtitle or
   footer.
4. **Engagement reference** — visible on every page (short form of the UUID).
5. **Signatory block** — Dolapo Faseun, Founder/Managing Director of Perennity Bridge,
   with signature image. If the block reads `PLACEHOLDER_DEFER_TO_COMMIT_3`, the
   signatory swap-in hasn't shipped yet — flag to Bolu and do not send.
6. **Heatmap** — rows for each scored framework. Verdicts read sensibly given the inputs
   (a developer with sparse SFDR fields should show many `insufficient_evidence` rows; a
   developer with strong inputs should show many `aligned` rows). If every row is blanket
   `insufficient_evidence` despite populated inputs, the engagement is probably misconfigured
   — see "Failure modes" below.
7. **Rationale text per criterion** — substantive, not boilerplate. The rationale should
   reference specific fields the developer populated.
8. **PAI CSV (SFDR only)** — downloads cleanly, opens in Excel/Sheets, has 10 rows (one
   per material PAI), units present.
9. **No empty page breaks, no overflowing text, no missing fonts.** If layout looks
   broken, check the browser console for errors and escalate.
10. **Browser console** — clean. No red errors. Yellow warnings about React dev mode are
    fine.

If any check fails, see "Failure modes" or escalate to engineering.

---

## Failure modes + fixes

### `entitlement_error` on the report route

Four causes; identify which from the browser console (open DevTools → Console tab):

- **`invalid_format`** — the URL UUID is malformed. The engine requires strict UUID v4
  (`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`). Regenerate
  with the step 1 command and try again.
- **`not_found`** — the UUID isn't in Airtable. Check the engagement record exists and
  the UUID in step 1 matches the URL.
- **`not_active`** — `Status` field is something other than `active`. Set to `active`
  in Airtable and reload.
- **`expired`** — `Expires At` is in the past. Extend the date by 90 days from today,
  or remove the field entirely (no-expiry mode).

### All heatmap rows show `insufficient_evidence` despite populated fields

Most common causes:

- **Single-select value mismatch.** E.g. `uk_sdr_standard_claimed = "LEED Gold"` is not
  one of `eu_taxonomy_8_1` / `leed_platinum` / `sbti` / `other`. Airtable will accept any
  string in the single-select option set, but the engine compares against canonical
  strings. Fix the option value and reload.
- **JSON blob malformed.** Fields like `uk_sdr_improvement_plan` and `uk_sdr_impact_plan`
  must be valid JSON. The adapter (`src/lib/ukSDRInputAdapter.js`) uses `safeJsonParse`
  which falls back to `undefined` on malformed input. Validate with
  `node -e 'JSON.parse(require("fs").readFileSync("/tmp/blob.txt","utf8"))'` — fix any
  parse errors, paste back into Airtable.
- **Engine pin mismatch.** Confirm `package.json` shows `@perennity/engine#v0.6.0` and
  `node_modules/@perennity/engine/package.json` shows version `0.6.0`. If they diverge,
  run `npm install @perennity/engine` to refresh.
- **Child rows not linked (SFDR only).** SFDR c1 / c3 / c5 / c7 / c10 read child tables
  via linked-record field. If the child rows exist but aren't linked to the parent
  engagement, the adapter returns no data and the relevant criteria resolve to
  `insufficient_evidence`. Open each child row and confirm the `engagement` field points at
  the right parent.

### PDF generation throws / hangs

Open browser console. Common causes:

- **Missing font file.** `src/assets/fonts/SourceSerif4-Regular.ttf` etc. should exist.
  If missing, see commit `cf66b1c` which added them.
- **Render-time exception.** Note the error message + stack trace and escalate.

### PAI CSV downloads but is empty

This happens when no SFDR frameworks are scored (e.g. `target_label =
eu_taxonomy_aligned_8_1` engagement). Expected — the PAI CSV is an SFDR Art 8/9
deliverable. If you have a SFDR Art 9 engagement and the CSV is still empty, check the
`SFDR Project PAI Data` child rows are linked to the engagement.

---

## When to escalate to engineering (Bolu)

- Engine throws an exception (red error in console; route doesn't load at all)
- Snapshot allowlist gate test fails on engine update (pre-deploy block)
- `RenderContract.framework_findings` is empty for an SFDR engagement with populated
  fields (engine wiring bug)
- Font fails to load + PDF generation throws (asset pipeline issue)
- PDF layout breaks for a specific engagement profile (rendering bug)
- Any feedback from a client suggesting the verdict is wrong on a specific criterion (this
  is potentially a methodology issue that needs founder review)

---

## Repo + remote pointers

- **App repo:** `https://github.com/Pelumiolawale/perennity-capital-readiness-platform`
- **Engine repo:** `https://github.com/Pelumiolawale/Perennity_regulatory_frameworks`
- **Engine pin:** `package.json` → `dependencies.@perennity/engine`. To bump (Bolu only):
  edit the URL fragment from `#v0.6.0` to `#v0.7.0` (or whatever new tag), then
  `npm install`. Confirm `node_modules/@perennity/engine/package.json` version matches
  before any client-facing report.
- **Engagement schema source of truth:** `src/lib/airtableEngagement.js` `FID` constant.
  Every Airtable field used by the engine is keyed by an immutable Airtable field ID
  (`fld...`). Renaming a field name in Airtable does NOT break the parser; renaming an
  option value (e.g. `eu_taxonomy_aligned_8_1` → `eu_tax_8_1`) WILL break scoring.
- **Test engagements:** `docs/test-engagements/`. 12 engagements covering all 6 labels ×
  2 tiers. Use these as worked examples when building real engagements.

---

## Worked examples per label

See `docs/runbook-paid-reports-appendix-labels.md` for one section per label with:

- The specific Airtable fields that label requires
- A pointer to the matching test engagement in `docs/test-engagements/`
- Common gotchas specific to that label
