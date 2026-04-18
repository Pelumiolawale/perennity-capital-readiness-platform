# INPUT_AUDIT.md — Perennity Capital Readiness Platform

**Branch:** `audit` (from `origin/main`, HEAD `82a3f7e`)
**Source of truth:** `src/App.jsx` (2,105 lines) → `INITIAL_PROJECT` at `src/App.jsx:465`
**Methodology vintage:** v3.1, April 2026
**Scope:** All fields rendered in the 8-tab wizard (tabs 0–6 + Tab 7 Review).

---

## Summary

- **Total input fields in `INITIAL_PROJECT`:** 55
- **Total rendered as `<FormField>` in wizard (tabs 0–6):** 55 (every state key has a corresponding form control)
- **Classification counts:**
  - **Core** (scored AND displayed somewhere): **29**
  - **Display-only** (surfaced in at least one output, not scored): **6**
  - **Orphaned** (collected but never scored and never displayed): **10**
  - **Scored-but-hidden** (influences score, never displayed back): **2**
  - **Framework-routing input** (drives a non-scoring display surface): **2** (`capitalSource`, `target_financing_label` — both treated as Core-display)
  - **Ambiguous / semi-used** (defined and used inconsistently; see notes): **6**

Total 55 = 29 core + 6 display-only + 10 orphaned + 2 scored-but-hidden + 2 framework-routing + 6 ambiguous.

### Explicitly orphaned inputs (recommended for removal)

These are collected from the user, written to IndexedDB/Airtable only insofar as they sit in the project blob, but never consumed by `src/engine/scoring.js`, the Results page, the PDF, the Excel export, or the Airtable `Assessments` write-list:

1. `state_or_province` — Tab 0 ([App.jsx:1107](src/App.jsx:1107))
2. `backup_duration_hours` — declared in `INITIAL_PROJECT` ([App.jsx:470](src/App.jsx:470)) but **not rendered as a form field on any tab** (no `<FormField>` for it — dead state key)
3. `grid_capacity_secured_mw` — Tab 2 ([App.jsx:1162](src/App.jsx:1162))
4. `ppa_term_years` — Tab 2 ([App.jsx:1184](src/App.jsx:1184))
5. `utility_engagement_started` — Tab 2 ([App.jsx:1185](src/App.jsx:1185))
6. `water_source_type` — Tab 3 ([App.jsx:1197](src/App.jsx:1197))
7. `land_area_hectares` — Tab 3 ([App.jsx:1237](src/App.jsx:1237))
8. `brownfield_or_greenfield` — Tab 3 ([App.jsx:1239](src/App.jsx:1239))
9. `flood_mitigation_details` (textarea) — Tab 4 ([App.jsx:1263](src/App.jsx:1263))
10. `thermal_resilience_strategy` (textarea) — Tab 4 ([App.jsx:1264](src/App.jsx:1264))

### Scored-but-hidden inputs (recommended for surfacing OR removal)

Influence the final score but never shown on the Results page, PDF, or Excel:

1. `dnsh_human_rights_dd` — 2 DNSH governance points ([scoring.js:250](src/engine/scoring.js:250)). Only appears aggregated in pillar CSR "Governance & Safeguards" text; individual answer not shown.
2. `dnsh_supply_chain_labour` — 1 DNSH governance point ([scoring.js:251](src/engine/scoring.js:251)). Same as above.

All 6 DNSH questions are scored, but only the aggregated governance score is displayed. The PDF's CSR pillar page ([pdfExport.js:351](src/export/pdfExport.js:351)) cites "Human rights DD" and "Protected areas" as thresholds but does not show the user's actual Y/N answers. Recommend surfacing the 6-item DNSH checklist back to the user (pass/fail list) in both Results page and PDF pillar section.

### Ambiguous / semi-used inputs (need a decision)

1. `expected_commissioning_date` — rendered ([App.jsx:1114](src/App.jsx:1114)), shown only in **Excel** ([excelExport.js:81](src/export/excelExport.js:81)). Not on Results page. Not in PDF. Not in Airtable. Not scored. → **Display-only (Excel only)**; recommend either surface on Results page/PDF cover or remove.
2. `it_load_mw` — rendered ([App.jsx:1134](src/App.jsx:1134)), shown only in **Excel** ([excelExport.js:83](src/export/excelExport.js:83)). Not scored. Not on Results page. Not in PDF. → **Display-only (Excel only)**; technically a useful engineering fact — recommend surface on PDF Project Info or remove.
3. `annual_water_demand_m3` — rendered ([App.jsx:1195](src/App.jsx:1195)), shown only in **Excel** ([excelExport.js:94](src/export/excelExport.js:94)). Not scored. → **Display-only**; orphaned from scoring engine despite being the most direct water footprint metric available. Recommend surface or reconsider as scoring input.
4. `water_stress_index` — rendered on Tab 4 ([App.jsx:1250](src/App.jsx:1250)). **Scored** (used in `calculateWaterResourceEfficiency` at [scoring.js:429](src/engine/scoring.js:429) and hard-stop logic at [scoring.js:541](src/engine/scoring.js:541)). Also shown in Excel. **BUT** — the country profile at [App.jsx:121](src/App.jsx:121) already carries `waterStress` per country, and the WUE engine already defaults K2 from that country value. Having the user also enter a 0–1 index is duplicative with the K2 dropdown on Tab 3 and the country auto-resolution. → **Core but duplicative**; recommend unifying with `k2_stress` and country profile.
5. `onsite_generation_type` — rendered ([App.jsx:1149](src/App.jsx:1149)). Scored in exactly one conditional branch ([scoring.js:115](src/engine/scoring.js:115)) inside `determineEuTaxonomyAlignment` DNSH pollution check: `project.backup_power_type !== 'diesel' || project.onsite_generation_type !== 'gas'`. The logic is a bug (||` should be `&&` to require BOTH to be non-polluting for pollution-DNSH pass) — flag for Phase 2 methodology audit. → **Scored (buggy), not displayed**.
6. `target_investor_type` — rendered ([App.jsx:1379](src/App.jsx:1379)). Not scored. Not on Results page. Not in PDF. Not in Excel. Not in Airtable. → **Orphaned**, move to orphaned list if you agree. Listed separately because unlike the 10 orphans above, it has visible user meaning (may be worth surfacing on PDF/Excel rather than removing).

### Duplicate / overlapping inputs

- **Water stress (three input paths):**
  1. Tab 3 `k2_stress` (user-selects CNDCP K2 factor)
  2. Tab 4 `water_stress_index` (numeric 0–1)
  3. Auto-resolution from `country` via `COUNTRY_PROFILES[country].waterStress` at `getCountryProfile` ([App.jsx:151](src/App.jsx:151))

  The scoring engine falls back through these in [scoring.js:176-179](src/engine/scoring.js:176). Recommend: drop `water_stress_index` from the form; keep `k2_stress` as an override for the country default.

- **Climate zone (two input paths):**
  1. Tab 3 `k1_climate` (cold/warm)
  2. Auto-resolution from country water-stress mapping (`stressToK1`) at [scoring.js:176](src/engine/scoring.js:176)

  Acceptable — the user `k1_climate` override is meaningful.

- **Renewable source quality (two input paths):**
  1. Tab 2 `renewable_energy_source` (ppa / rec / onsite / utility_green_tariff / mixed)
  2. Tab 2 `renewable_source_tier` (1 / 2 / 3 manual override)

  Acceptable — documented as override.

### Region resolution

- `projectRegionGroup` (Tab 0) is the user's selection ("Europe", "MENA", etc.)
- `region` is derived at [App.jsx:1091](src/App.jsx:1091) via `regionMap` (e.g. Europe→EU, MENA→MENA, Asia-Pacific→UK, Africa→UK, Latin America→US)
- Both are stored, both are written to Airtable separately. The scoring engine uses `region` (two-letter code).
- The Africa→UK and Latin America→US mappings look arbitrary and likely wrong — flag for Phase 2. Either add proper region weights/thresholds for those regions or document the mapping rationale.

### `ComplianceAssessmentTool.jsx` — dead code

- Defined at `src/components/ComplianceAssessmentTool.jsx:917` (1,574 lines) but **never imported anywhere** in the source tree. Only one reference to the identifier, which is the export itself. Contains a parallel (outdated) scoring thresholds block and an older wizard implementation.
- Recommendation: **delete** after your approval. It's not a candidate for de-duplication — it's simply stale.

---

## Input trace table

Columns:
- **Tab** — wizard step (0–6)
- **Field Label** — user-visible label on the form
- **State Key** — key in `INITIAL_PROJECT`
- **Type** — form control type
- **Req?** — required per `validateWizardStep` ([App.jsx:1044](src/App.jsx:1044)) or marked `required` prop
- **Scored?** — consumed by `src/engine/scoring.js` (✓ / ✗, with function name)
- **Results?** — appears on Results page UI (`screen === "app"`, `navItem === "results"`)
- **PDF?** — appears in `downloadPdf` output (`src/export/pdfExport.js`)
- **Excel?** — appears in `downloadExcel` (`src/export/excelExport.js`)
- **Airtable?** — written to `Assessments` table at [App.jsx:789](src/App.jsx:789)
- **Class** — Core / Display-only / Orphaned / Scored-hidden / Framework-routing / Ambiguous
- **Recommendation**

Legend for **Scored?** column: `✓ SA` = consumed by Sustainability Alignment; `EPV` = Energy & Power Viability; `WRE` = Water & Resource; `CSR` = Climate & Site; `DFR` = Delivery & Funding; `TAX` = `determineEuTaxonomyAlignment`; `SFDR` = `determineSfdrClassification`; `SDR` = `determineUkSdrEligibility`; `HS` = `evaluateHardStops`; `CONF` = `calculateConfidence`; `DNSH` = `calculateDnshGovernance`; `REC` = `generateRecommendations`.

| # | Tab | Field Label | State Key | Type | Req? | Scored? | Results? | PDF? | Excel? | Airtable? | Class | Recommendation |
|---|-----|-------------|-----------|------|------|---------|----------|------|--------|-----------|-------|----------------|
| 1 | 0 | Project Name | `project_name` | text | ✓ | ✗ | ✓ title | ✓ cover+action | ✓ Summary | ✓ | Display-only | Keep |
| 2 | 0 | Region Group | `projectRegionGroup` | select | ✓ | ✗ (derived `region` used) | ✗ (region shown) | ✓ cover | ✗ | ✓ "Region Group" | Display-only | Keep — drives `region` derivation |
| 3 | 0 | Country | `country` | select | ✓ | ✓ (`getCountryProfile` → PUE/WUE/SA) | ✓ header | ✓ cover | ✓ Summary | ✓ | **Core** | Keep |
| 4 | 0 | State / Province | `state_or_province` | text | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **Orphaned** | **Remove** |
| 5 | 0 | City | `city` | text | ✗ | ✗ | ✓ Projects list | ✗ | ✓ | ✗ | Display-only | Keep or surface on Results page |
| 6 | 0 | Development Stage | `development_stage` | select | ✓ | ✓ DFR maturity + PUE isNew + SDR new-build gate ([scoring.js:130](src/engine/scoring.js:130), [:500](src/engine/scoring.js:500)) | ✗ | ✓ cover (as `stageLabel`) | ✓ | ✓ | **Core** | Keep |
| 7 | 0 | Expected Commissioning Date | `expected_commissioning_date` | date | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | **Ambiguous** | Surface on PDF or remove |
| 8 | 0 | Where is your primary financing sourced from? | `capitalSource` | select | ✓ | ✗ | ✓ "Applicable Frameworks" | ✓ Exec Summary chip | ✗ | ✓ "Capital Source" | **Framework-routing** | **REMOVE per Fix 3.1** — duplicative with `target_financing_label` |
| 9 | 1 | Planned Capacity (MW) | `planned_capacity_mw` | number | ✓ | ✓ CONF, HS critical-fields ([scoring.js:545](src/engine/scoring.js:545)) | ✗ | ✗ | ✓ | ✓ | **Core** | Keep; consider surfacing on Results/PDF |
| 10 | 1 | IT Load (MW) | `it_load_mw` | number | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | **Ambiguous** | Surface on PDF or remove |
| 11 | 1 | PUE | `pue` | number | ✓ (validated 1.0–5.0) | ✓ SA, TAX, SFDR, SDR, HS, CONF, REC | ✗ (aggregated) | ✓ embedded in explanations | ✗ | ✓ | **Core** | Keep; consider explicit surface |
| 12 | 1 | WUE | `wue` | number | ✗ (validated 0–20) | ✓ WRE, TAX-DNSH-water | ✗ | ✓ embedded in explanations | ✗ | ✗ | **Core** | Keep; consider explicit surface |
| 13 | 1 | Cooling Type | `cooling_type` | select | ✓ | ✓ WRE, HS, CONF, REC | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 14 | 1 | Backup Power Type | `backup_power_type` | select | ✓ | ✓ SA penalty, EPV, TAX-DNSH-pollution, CONF, REC | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 15 | 1 | Battery Storage (MWh) | `battery_storage_mwh` | number | ✗ | ✓ EPV uplift | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 16 | 1 | Onsite Generation | `onsite_generation_type` | select | ✗ | ✓ TAX-DNSH-pollution (buggy `\|\|`) | ✗ | ✗ | ✗ | ✗ | **Ambiguous** | Fix scoring logic in Phase 2, then surface or remove |
| 17 | — | (Dead key, no form) | `backup_duration_hours` | — | — | ✗ | ✗ | ✗ | ✗ | ✗ | **Orphaned** | **Remove from state** |
| 18 | 2 | Grid Connection Status | `grid_connection_status` | select | ✓ | ✓ EPV, HS, CONF | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 19 | 2 | Grid Capacity Secured (MW) | `grid_capacity_secured_mw` | number | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **Orphaned** | **Remove** |
| 20 | 2 | Interconnection Timeline (months) | `interconnection_timeline_months` | number | ✗ | ✓ EPV, CONF | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 21 | 2 | Renewable Energy Share (%) | `renewable_energy_share_pct` | number | ✗ (validated 0–100) | ✓ SA, EPV, TAX, SFDR, SDR, HS, CONF | ✗ | ✓ embedded | ✓ | ✓ | **Core** | Keep |
| 22 | 2 | Renewable Energy Source | `renewable_energy_source` | select | ✓ | ✓ SA tier | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 23 | 2 | Renewable Source Quality Tier | `renewable_source_tier` | select | ✗ | ✓ SA tier override ([scoring.js:211](src/engine/scoring.js:211)) | ✗ | ✗ | ✗ | ✗ | **Scored-but-hidden** | Surface in PDF pillar or keep silent |
| 24 | 2 | PPA Secured? | `ppa_secured` | checkbox | ✗ | ✓ SA, EPV, CONF, REC | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 25 | 2 | PPA Term (years) | `ppa_term_years` | number | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **Orphaned** | **Remove** |
| 26 | 2 | Utility Engagement Started? | `utility_engagement_started` | checkbox | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **Orphaned** | **Remove** |
| 27 | 3 | Annual Water Demand (m³) | `annual_water_demand_m3` | number | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | **Ambiguous** | Either score it or remove — currently decorative |
| 28 | 3 | Water Source Type | `water_source_type` | select | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **Orphaned** | **Remove** (overlaps with `k3_water`) |
| 29 | 3 | K1 — Climate Zone | `k1_climate` | select | ✗ | ✓ WRE CNDCP formula | ✗ | ✗ | ✗ | ✗ | **Scored-but-hidden** | Surface on PDF WRE pillar (already in explanations text) |
| 30 | 3 | K2 — Water Stress Level | `k2_stress` | select | ✗ | ✓ WRE CNDCP formula | ✗ | ✗ | ✗ | ✗ | **Core** (explanation shows `K1=...K2=...K3=...`) | Keep |
| 31 | 3 | K3 — Water Source Type | `k3_water` | select | ✗ | ✓ WRE CNDCP formula | ✗ | ✗ | ✗ | ✗ | **Core** | Keep |
| 32 | 3 | Water Recycling Included? | `water_recycling_included` | checkbox | ✗ | ✓ WRE, TAX-DNSH-water, HS, CONF, REC | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 33 | 3 | Waste Heat Recovery? | `waste_heat_recovery` | checkbox | ✗ | ✓ WRE, TAX-substantial | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 34 | 3 | Land Area (hectares) | `land_area_hectares` | number | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **Orphaned** | **Remove** |
| 35 | 3 | Site Type (brownfield/greenfield) | `brownfield_or_greenfield` | select | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **Orphaned** | **Remove** |
| 36 | 4 | Flood Risk Score (0–100) | `flood_risk_score` | number | ✗ | ✓ CSR, HS, CONF, REC | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 37 | 4 | Extreme Heat Risk Score (0–100) | `extreme_heat_risk_score` | number | ✗ | ✓ CSR, CONF | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 38 | 4 | Storm Risk Score (0–100) | `storm_risk_score` | number | ✗ | ✓ CSR | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 39 | 4 | Water Stress Index (0–1) | `water_stress_index` | number | ✗ | ✓ WRE context, HS | ✗ | ✗ | ✓ | ✗ | **Ambiguous (duplicative)** | **Consolidate with `k2_stress` + country profile; recommend remove** |
| 40 | 4 | Adaptation Measures Present? | `adaptation_measures_present` | checkbox | ✗ | ✓ CSR, TAX-substantial, TAX-DNSH-bio/climate, HS, CONF, REC | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 41 | 4 | Business Continuity Plan Ready? | `business_continuity_plan_ready` | checkbox | ✗ | ✓ CSR, TAX-substantial, CSR TCFD bonus | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 42 | 4 | Flood Mitigation Details | `flood_mitigation_details` | textarea | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **Orphaned** | **Remove** (or surface on PDF narrative) |
| 43 | 4 | Thermal Resilience Strategy | `thermal_resilience_strategy` | textarea | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **Orphaned** | **Remove** (or surface on PDF narrative) |
| 44 | 5 | Target Financing Label | `target_financing_label` | select | ✗ | ◐ HS only, with stale value set (`'green', 'article_8_9', 'sustainable'` at [scoring.js:553](src/engine/scoring.js:553) — never matches current dropdown values) | ✗ | ✓ Exec Summary "Target label" chip | ✓ | ✗ | **Framework-routing (broken)** | **Wire into Applicable Frameworks per Fix 3.2** |
| 45 | 5 | Third-Party Certification Target | `third_party_certification_target` | select | ✗ | ✓ SA bonus | ✗ | ✗ | ✗ | ✗ | **Scored-but-hidden** | Surface on PDF or Results |
| 46 | 5 | Taxonomy Alignment Claimed? | `taxonomy_alignment_claimed` | checkbox | ✗ | ✓ SA bonus, SFDR, SDR-impact, HS | ✗ | ✓ via TAX badge | ✓ | ✗ | **Core** | Keep |
| 47 | 5 | Net-Zero Commitment? | `net_zero_commitment_present` | checkbox | ✗ | ✓ SA bonus, SFDR-9, SDR-impact, CSR TCFD | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 48 | 5 | Sustainability Disclosures Ready? | `sustainability_disclosures_ready` | checkbox | ✗ | ✓ SA penalty, SFDR-8/9, SDR-focus, CSR TCFD | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 49 | 5 | Carbon Reduction Strategy? | `carbon_reduction_strategy_present` | checkbox | ✗ | ✓ SA bonus, SDR-improvers | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 50 | 5 | DNSH — Climate vulnerability assessment conducted? | `dnsh_climate_vulnerability` | checkbox | ✗ | ✓ DNSH (+2) | ✗ | ✗ (aggregate only) | ✗ | ✗ | **Scored-but-hidden** | Surface 6-item checklist in Results + PDF pillar |
| 51 | 5 | DNSH — Site outside protected areas? | `dnsh_protected_areas` | checkbox | ✗ | ✓ DNSH (+2) | ✗ | ✗ | ✗ | ✗ | **Scored-but-hidden** | Surface |
| 52 | 5 | DNSH — Low-GWP refrigerants? | `dnsh_low_gwp_refrigerants` | checkbox | ✗ | ✓ DNSH (+1) | ✗ | ✗ | ✗ | ✗ | **Scored-but-hidden** | Surface |
| 53 | 5 | DNSH — WEEE compliance? | `dnsh_weee_compliance` | checkbox | ✗ | ✓ DNSH (+1) | ✗ | ✗ | ✗ | ✗ | **Scored-but-hidden** | Surface |
| 54 | 5 | DNSH — Human rights DD policy? | `dnsh_human_rights_dd` | checkbox | ✗ | ✓ DNSH (+2) | ✗ | ✗ | ✗ | ✗ | **Scored-but-hidden** | Surface |
| 55 | 5 | DNSH — Supply chain labour policy? | `dnsh_supply_chain_labour` | checkbox | ✗ | ✓ DNSH (+1) | ✗ | ✗ | ✗ | ✗ | **Scored-but-hidden** | Surface |
| 56 | 6 | Financing Strategy Defined? | `financing_strategy_defined` | checkbox | ✓ | ✓ DFR, HS critical, CONF, REC | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 57 | 6 | Target Investor Type | `target_investor_type` | select | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **Orphaned (soft)** | **Remove or surface on PDF as context** |
| 58 | 6 | Investment Memo Ready? | `investment_memo_ready` | checkbox | ✗ | ✓ DFR, REC | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 59 | 6 | Site Control Secured? | `site_control_secured` | checkbox | ✗ | ✓ DFR, CONF | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 60 | 6 | Permitting Status | `permitting_status` | select | ✗ | ✓ DFR, CONF | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 61 | 6 | EPC / Contractor Identified? | `contractor_or_epc_identified` | checkbox | ✗ | ✓ DFR | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |
| 62 | 6 | Schedule Confidence Level | `schedule_confidence_level` | select | ✗ | ✓ DFR | ✗ | ✗ | ✓ | ✗ | **Core** | Keep |

Note: rows 50–55 and others exceed 55 due to the single dead state key `backup_duration_hours` (row 17) plus the `region` derived field that isn't a user input. The 55-field count refers to user-visible form controls; the `INITIAL_PROJECT` literal contains both those 55 and the `backup_duration_hours` dead key.

### Fields written to Airtable `Assessments` but not in user form

Airtable also persists derived values, not user inputs, so not listed above: `Capital Readiness Score`, `Confidence Score`, `Band`, `Water Stress Band`, `Grid Carbon Intensity`, `Applicable Frameworks`, pillar sub-scores (`SA Score` … `DFR Score`), `Hard Stop Triggered`, `Hard Stop Reason`, `Timestamp`. These are outputs of scoring and are correct to persist.

---

## Cross-surface observations

### Results page shows very little input detail back to the user
The Results page ([App.jsx:1708](src/App.jsx:1708)) shows:
- Header strip: `project_name`, `region`, assessment timestamp
- Score ring + band + confidence
- 5 pillar cards (derived subscores only)
- Top Risks (3 strings, dynamically generated)
- Top Recommendations (3)
- SFDR & EU Taxonomy badges
- "Applicable Regulatory Frameworks" chip row (driven by `capitalSource` today — Fix 3.2 target)
- AI narrative + Q&A

**None** of the 55 inputs is rendered back as a project-fact panel. The PDF's Exec Summary also shows very little input detail (only `target_financing_label`, `country`, `projectRegionGroup`, `development_stage`). The Excel "Input Data" sheet is the only place where the user's full inputs are echoed back. **Recommendation for your review**: consider adding a collapsed "Project snapshot" card on the Results page and a "Project parameters" section on PDF page 2 to echo the key inputs so the user can verify what was assessed.

### Two exports already diverge in what they show
- Excel "Input Data" sheet lists 38 fields
- PDF page 2 shows only `target_financing_label` + (via cover page) `country`, `projectRegionGroup`, `development_stage`
- Airtable writes 8 input fields + all derived scores

Any streamlining you approve needs to be propagated through all three exports for consistency.

### Capital Source vs Target Financing Label — the core routing confusion

Both exist in the form. They overlap semantically but are used differently today:

| | `capitalSource` (Tab 0) | `target_financing_label` (Tab 5) |
|---|---|---|
| Drives Applicable Regulatory Frameworks on Results page | ✓ | ✗ |
| Drives Applicable Frameworks on PDF Exec Summary | ✓ | ✗ |
| Shown as "Target label" chip on PDF | ✗ | ✓ |
| Written to Airtable | ✓ (as "Capital Source") | ✗ |
| Consumed by scoring engine | ✗ | ◐ (broken — references never-selected values) |
| Required | ✓ | ✗ |

**This is the Fix 3.1 + Fix 3.2 pair.** Removing `capitalSource` and routing `target_financing_label` through the framework display is the correct consolidation. The `target_financing_label` dropdown is finer-grained (16 options vs 7) and maps cleanly to regs. Confirm we're aligned on this before I start.

### Dropdown value mismatch in Tab 5

The current `target_financing_label` options ([App.jsx:1269-1297](src/App.jsx:1269-1297)) match exactly the keys listed in the prompt's Fix 3.2 mapping. ✓ No discrepancy to flag.

The stale values referenced in `evaluateHardStops` at [scoring.js:553](src/engine/scoring.js:553) (`'green', 'article_8_9', 'sustainable'`) do NOT match any current dropdown option — this hard-stop branch is effectively dead. Flag for Phase 2.

---

## Decisions requested before Phase 2

1. ✅/❌ **Delete `ComplianceAssessmentTool.jsx`** (1,574 lines of dead code)?
2. ✅/❌ **Remove the 10 orphaned inputs** in the list above (state_or_province, backup_duration_hours, grid_capacity_secured_mw, ppa_term_years, utility_engagement_started, water_source_type, land_area_hectares, brownfield_or_greenfield, flood_mitigation_details, thermal_resilience_strategy)?
3. ✅/❌ **Remove or surface the 6 ambiguous inputs** (expected_commissioning_date, it_load_mw, annual_water_demand_m3, water_stress_index, onsite_generation_type, target_investor_type)? Per-field decision needed.
4. ✅/❌ **Surface the 6-item DNSH checklist** answers on the Results page and PDF pillar section?
5. ✅/❌ **Add a "Project snapshot" card** on Results page and "Project parameters" section on PDF page 2 to echo key inputs back to the user?
6. ✅/❌ **Proceed with Fix 3.1** as specified (remove `capitalSource` entirely, including the Airtable "Capital Source" column write — leaving the column in place but unwritten to preserve history)?
7. ✅/❌ **Proceed with Fix 3.2** as specified (wire `target_financing_label` → Applicable Regulatory Frameworks on Results, PDF, Excel per the mapping in your prompt)?

**Awaiting your direction before moving to Phase 2 (methodology audit).**
