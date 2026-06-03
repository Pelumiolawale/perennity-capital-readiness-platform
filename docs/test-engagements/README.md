# Test engagements for Perennity Bridge paid Report verification

12 engagement records covering all 6 enabled `target_label` values × 2 tiers (strong / gap).
Generated 2026-06-03 against engine v0.6.0 and the Airtable Engagements schema in base
`appasxX7eC3QsmxeM` table `tblRnd8BdQ65kuaej`.

Profiles are anonymised composites of publicly disclosed data from AirTrunk, STT GDC, Digital Edge,
Gulf Data Hub, Africa Data Centres, and Equinix. Project names, client names, jurisdictions, PUE/WUE
ranges, capacities, and renewable shares match real DCs in the prospect regions but no engagement
maps 1:1 to a real asset.

---

## The 12 engagements

| # | Label | Tier | UUID | Project / client | Expected verdict shape |
|---|-------|------|------|------------------|------------------------|
| 1 | `eu_taxonomy_aligned_8_1` | Strong | `6239c407-a1fa-4335-86fb-5cdda3e480cb` | NORDX1 Stockholm / North Edge Holdings | Mostly `pass` |
| 2 | `eu_taxonomy_aligned_8_1` | Gap | `b4ca4e61-1800-4190-bd4e-b3ac07b9c7ed` | DAL-COL-002 / Lonestar Colocation LLC | Mix of `partial` / `data_missing` |
| 3 | `sfdr_article_8` | Strong | `595791d1-b2ef-4036-9a6e-066bb42be1e8` | FRA-HYP-01 / Centrum Digital AG | Mostly `aligned` |
| 4 | `sfdr_article_8` | Gap | `ba4634e6-bf5c-4bd3-93e7-0654e83e150c` | RUH-COL-004 / Najd Data Holdings | Mostly `partially_aligned` |
| 5 | `sfdr_article_9` | Strong | `48f32d4d-be5a-41bf-bbac-b720ab5612ff` | OSL-GRN-01 / Fjord Sustainable DC Fund | Mostly `aligned`, c8 aligned with sub-case (a) |
| 6 | `sfdr_article_9` | Gap | `b01bb716-997f-42e8-828c-6345aeb708bc` | AMS-MIX-003 / Lowland Digital BV | `partially_aligned` on c8 dominance (b), cascades |
| 7 | `uk_sdr_focus` | Strong | `f517f09f-587f-4094-99ec-e78dd29e72ae` | LOS-HYP-01 / Sahara Edge Capital | `aligned` across all 4 Focus criteria |
| 8 | `uk_sdr_focus` | Gap | `0d9a20e3-17b0-4217-9514-4ddfb200e83b` | SIN-COL-005 / Strait Data Ltd | `not_aligned` on c2 (LEED Gold not recognised) |
| 9 | `uk_sdr_improvers` | Strong | `6325c039-3137-471b-840b-6a6dd87cd9dc` | SAO-IMP-01 / Atlas Sustentável Brasil | `aligned` across c5–c9 |
| 10 | `uk_sdr_improvers` | Gap | `219dbbaa-83e5-4c59-bdc4-9f22aa4027bb` | SYD-IMP-003 / Tasman Cloud Pty | `partially_aligned` cascading from c5 partial baseline |
| 11 | `uk_sdr_impact` | Strong | `01af2113-46f1-4d6b-bc65-ee89b0fb1a32` | ACC-IMP-01 / Sub-Sahara Impact Infrastructure | `aligned` across c10–c15 |
| 12 | `uk_sdr_impact` | Gap | `fff71f4b-2a49-4cbd-97be-c32000412a6d` | LDN-IMP-002 / Thameside Digital Estates | `not_aligned` on c10 objective, c11 measurement; cascades to c13 |

Each engagement is configured with `STATUS=active`, `ISSUED_AT=2026-06-03T00:00:00.000Z`,
`EXPIRES_AT=2026-09-03T00:00:00.000Z` (90-day window). Engagement letters are marked signed.

---

## Files in this directory

- **`engagements.json`** — canonical source. One object per engagement, keyed by Airtable field
  ID (`fld...`). Pass to the Airtable REST API with `returnFieldsByFieldId=true`. This is what
  the seeding script reads.
- **`engagements.csv`** — Airtable-importable CSV with field NAMES as column headers (Airtable's
  CSV importer matches by name, not field ID). Use when seeding via the Airtable UI's
  "Add records → Import data → CSV" flow.
- **`child-rows.json`** — child-table rows needed by SFDR Art 8 / Art 9 engagements (#3, #4, #5, #6).
  Keyed by engagement UUID; one section per child table (`es_characteristics`, `pai_coverage`,
  `annex_ii_coverage`, `project_reports`, `project_pai_data`). The operator creates the parent
  records first, captures the resulting `rec...` IDs, then creates child rows in their respective
  tables with the linked-record field pointing at the parent UUID.

---

## How to seed all 12 (operator path)

### Option A — Airtable REST API (programmatic, faster)

For each object in `engagements.json`:

```bash
curl -X POST "https://api.airtable.com/v0/appasxX7eC3QsmxeM/tblRnd8BdQ65kuaej" \
  -H "Authorization: Bearer $VITE_AIRTABLE_PAT" \
  -H "Content-Type: application/json" \
  -d '{"records":[{"fields":<one engagement object>}],"returnFieldsByFieldId":true}'
```

Capture the returned `id` (Airtable `rec...` ID) per UUID, then POST matching child rows from
`child-rows.json` to the right child tables, linking via the `engagement` field.

### Option B — Airtable UI CSV import

1. Open the Engagements table in Airtable UI
2. Click `+ Add records` → `Import data` → `CSV file`
3. Upload `engagements.csv`
4. Match the column names to existing fields when prompted (most will auto-match by name)
5. Confirm import. 12 parent records created.
6. Open each of the SFDR child tables (`SFDR ES Characteristics`, `SFDR PAI Coverage`,
   `Annex II Coverage`, `Project Reports`, `Project PAI Data`) and create the child rows from
   `child-rows.json`, linking each row to the matching parent engagement.

CSV import does NOT handle linked-record fields — you must seed child rows manually after the
parent import completes.

---

## How to verify each engagement after seeding

1. `npm run dev` to start the local app server
2. For each UUID, open `http://localhost:5173/assessment/report?ref=<uuid>`
3. The route should load (no `entitlement_error`), display the client + project summary, and
   expose the "Download PDF" button
4. Download the PDF; cross-check the heatmap against the "Expected verdict shape" column above
5. For tier-gap engagements: confirm the gap surfaces with substantive rationale text matching
   the design intent (e.g., engagement #8 should show `not_aligned` on c2 with rationale
   referencing the LEED Gold non-recognition)

If an engagement produces verdicts outside the expected shape, the most likely causes are:
- An Airtable single-select option name doesn't match the expected string (e.g.
  `uk_sdr_standard_claimed` must be exactly `eu_taxonomy_8_1` / `leed_platinum` / `sbti` / `other`)
- A JSON blob field contains malformed JSON (the adapter falls back silently to `undefined`,
  producing `insufficient_evidence` on the affected criteria)
- Child rows weren't seeded for an SFDR engagement (c1 falls back to the single
  `sfdr_es_characteristic` text field, producing `not_aligned` on c1 instead of `aligned`)

See `docs/runbook-paid-reports.md` for the full operator runbook including failure-mode triage.
