# Runbook appendix — per-label setup gotchas

Companion to `docs/runbook-paid-reports.md`. One section per enabled target label.
Each section lists the Airtable fields you must populate beyond the universal
project-intake set (steps 4-6 of the main runbook), names the matching test engagement
you can copy from, and flags common gotchas.

---

## 1. EU Taxonomy Aligned (Activity 8.1) — `eu_taxonomy_aligned_8_1`

**Worked example:** Engagement #1 — `6239c407-a1fa-4335-86fb-5cdda3e480cb` (NORDX1
Stockholm, strong tier) or #2 — `b4ca4e61-1800-4190-bd4e-b3ac07b9c7ed` (DAL-COL-002
Dallas, gap tier).

**Additional fields beyond universal set:** none. EU Taxonomy 8.1 engagements rely
entirely on the project-intake fields (steps 4-6) + safeguards multi-selects + ECoCC.

**Criteria scored:**

- `sc_8_1_1` (ECoCC compliance) — driven by `ECoCC Practices Implemented (JSON)` (number
  of practices) + `Last Independent Audit Date` (must be ≤3 years old) + an evidence
  document of `document_type: audit_report` or `independent_audit` in the `Evidence
  Documents` field.
- `sc_8_1_2_pue_measurement_compliance` — driven by the 4 PUE measurement fields. Aligned
  requires ALL of: methodology ∈ `EN_50600_4_2 / ISO_IEC_30134_2`, category ∈ `category_1
  / category_2 / category_3` (not `unspecified`), boundary documented, reporting basis
  `annualised`.
- `dnsh_8_1_adaptation` (climate adaptation) — `Climate Risk Completed` checkbox +
  `Climate Risk Methodology` free text (more methodology detail = stronger verdict).
- `dnsh_8_1_water` (water) — `WUE Annualised` + `Site Water Stress`. The threshold is
  conditional on water stress: stricter for `High` / `Extremely High` sites.
- `dnsh_8_1_circular_economy` — `Circular Economy Compliance Items` multi-select. The
  engine's expected items are `ecodesign_2009_125`, `rohs_2011_65`, `waste_management_plan`,
  `weee_endoflife_2012_19`. All 4 required for `pass`.
- `minimum_safeguards` — driven by the 4 safeguards multi-selects (`Human Rights Items`,
  `Bribery Corruption Items`, `Taxation Items`, `Fair Competition Items`). The expected
  items per pillar:
  - **Human Rights (5):** `human_rights_policy_published`,
    `due_diligence_process_operational`, `grievance_mechanism_operational`,
    `ilo_core_conventions_compliance`, `no_ungc_violations_24m`
  - **Bribery & Corruption (3):** `anti_bribery_policy_published`,
    `anti_bribery_training_programme`, `no_bribery_convictions_24m`
  - **Taxation (3):** `tax_governance_policy_published`, `no_tax_evasion_findings_24m`,
    `country_by_country_reporting_or_below_threshold`
  - **Fair Competition (2):** `competition_policy_published`,
    `no_competition_law_breaches_24m`

**Common gotchas:**

- **Evidence Documents format.** One document per line, pipe-separated:
  `doc_id | doc_type | uri | uploaded_at | sha256`. For ECoCC compliance you need at
  least one `audit_report` or `independent_audit` line.
- **Facility type must literally match the options** — `hyperscale` (not `hyperscale data
  centre`), `colocation` (not `colocation data centre`), `edge`, `enterprise`. Pre-existing
  records sometimes have the longer form; the engine doesn't accept it.
- **Safeguards items strings.** These ARE the exact option names. Don't add spaces or
  rename. The engine compares against canonical strings; mismatches force `data_missing`.

---

## 2. SFDR Article 8 — `sfdr_article_8`

**Worked example:** Engagement #3 — `595791d1-b2ef-4036-9a6e-066bb42be1e8`
(FRA-HYP-01 Frankfurt, strong tier) or #4 — `ba4634e6-bf5c-4bd3-93e7-0654e83e150c`
(RUH-COL-004 Riyadh, gap tier).

**Additional fields beyond universal set:** 6 SFDR Specifics fields + 26 PR A1 entity-axis
scalars + (if claiming Taxonomy alignment) 8 PR A3 c6 fields + child rows in 4 SFDR
linked tables.

**Criteria scored** (7 total — the Art 8 baseline, all shared with Art 9):

- **c1 — E/S characteristics promotion** — driven by SFDR ES Characteristics child rows
  (preferred; 3+ rows with quantified indicators for aligned) OR fallback to the legacy
  `SFDR ES Characteristic` single-text field (caps at `not_aligned`).
- **c2 — Good governance attestation** — driven by 16 c2_* entity scalars across 4 domains
  (board / employees / remuneration / tax). All 4 domains must `pass` for criterion
  `aligned`.
- **c3 — PAI consideration policy** — driven by `c3 Statement URL` + `c3 Statement
  Published Date` (must be ≤365 days old for aligned) + SFDR PAI Coverage child rows (≥9
  of 11 material PAIs fully evidenced).
- **c4 — DNSH assessment** — cross-framework read from EU Taxonomy 8.1 DNSH results (auto;
  no SFDR-specific fields needed) OR per-PAI fallback fields if EU Tax not in scope.
- **c5 — Pre-contractual disclosure** — driven by SFDR Annex II Coverage child rows (9
  elements, need ≥7 `covered_specific`).
- **c6 — Taxonomy alignment disclosure** — MASTER GATE field `c6 Taxonomy Claim Made`.
  When unchecked, c6 returns `not_applicable` (regulatorily correct for most Art 8
  engagements). When checked, populate `c6 Claimed Percentage`, `c6 Methodology`,
  `c6 Minimum Safeguards Attestation`, `c6 Published Date` + 6 breakdown percentages.
- **c7 — Periodic reporting commitment** — operational path requires SFDR Project Reports
  child rows (2+ consecutive years + named standard + indicator names). Pre-operational
  path requires the 3 c7_specifies_* booleans + parent portfolio reports.

**Common gotchas:**

- **`c6 Taxonomy Claim Made` is a master gate.** Leave it unchecked unless the developer
  IS making a Taxonomy alignment claim. Checking it without populating the rest forces
  `not_aligned`.
- **Child row linked-record field.** Each child row (ES Characteristic, PAI Coverage,
  Annex II Coverage, Project Report) has a hidden `engagement` field that MUST be linked
  to the parent engagement. Without this link, the adapter returns no data for the
  criterion and falls back to insufficient_evidence.
- **`c2 Tax Jurisdictions Used`** is a multilineText field expecting comma-separated ISO
  country codes (e.g. `DE, NL, FR`). The engine cross-checks against the EU Council
  Annex I non-cooperative list (last refreshed 2026-02-17). Listing any Annex I
  jurisdiction (e.g. `RU`, `PA`, `VU`, `VN`) forces c2 / domain D to fail.
- **`c2 Unresolved Tax Disputes EUR Max`** ≥10,000,000 forces c2 / domain D fail
  regardless of other compliance.

---

## 3. SFDR Article 9 — `sfdr_article_9`

**Worked example:** Engagement #5 — `48f32d4d-be5a-41bf-bbac-b720ab5612ff` (OSL-GRN-01
Oslo, strong tier — pure-play green DC fund target) or #6 —
`b01bb716-997f-42e8-828c-6345aeb708bc` (AMS-MIX-003 Amsterdam, gap tier — dominance
test (b) fails).

**Additional fields beyond Art 8 set:** all 7 Art 8 baseline criteria PLUS 3 Art 9-specific
criteria (c8 / c9 / c10) needing the SFDR Specifics fields + SFDR Project PAI Data child
rows.

**Criteria scored** (10 total = 7 Art 8 baseline + 3 Art 9-specific):

- All Art 8 criteria as above.
- **c8 — SI objective qualification** — load-bearing. Driven by:
  - `SFDR SI Objective` (named objective, free text ~200 chars)
  - `SFDR SI Objective Category` (`Environmental` / `Social` / `Mixed`)
  - `SFDR Dominance Test` (JSON object with 3 booleans: `named_in_investment_memorandum`,
    `economic_rationale_depends_on_si`, `marketing_leads_with_si`). All 3 must be true for
    aligned. Optional fields `investment_memorandum_ref`, `economic_rationale_description`.
  - ≥3 quantified contribution indicators via SFDR ES Characteristics child rows (those
    that have `indicator_source` populated double as c8 indicators).
- **c9 — SI-eligibility evidence pack** — cascades from c8 + c4 + c2. Any `not_aligned`
  upstream forces c9 `not_aligned`. Driven by `SFDR Assurance Tier` (`reasonable_big4` /
  `limited_big4` / `limited_partial` / `management_only` — see methodology v3.5 F7).
- **c10 — Project PAI data provision** — driven by SFDR Project PAI Data child rows (10
  rows per Annex I Table 1: PAIs 1, 2, 4, 5, 7, 8, 9, 10, 11, 13). c10 reads c3 result
  for a verification gate: if c3 is `partially_aligned` or weaker, c10 requires ≥9 of 11
  PAIs to be third-party-verified for aligned.

**Common gotchas:**

- **Dominance test JSON.** The `SFDR Dominance Test` field is a JSON blob, not a
  free-text checkbox set. Shape:
  ```json
  {
    "named_in_investment_memorandum": true,
    "economic_rationale_depends_on_si": true,
    "marketing_leads_with_si": true,
    "investment_memorandum_ref": "Fund I IM, Section 2.3",
    "economic_rationale_description": "Sustainability-linked credit margin (-25bps)..."
  }
  ```
  Validate with `node -e 'JSON.parse(...)'` before pasting into Airtable. Common failure:
  smart quotes instead of straight quotes if copy-pasted from Word.
- **PAI 4 is always `not_applicable` for data centres** (fossil-fuel sector exposure;
  doesn't apply). Always create the PAI 4 row with `applicability: not_applicable` and
  a rationale string. Omitting PAI 4 entirely will count against you.
- **Indicator source on ES Characteristics.** For ES Characteristic child rows to double
  as c8 contribution indicators, the `indicator_source` field must be populated with one
  of `art_2_17_example`, `l2_rts_annex_i_pai`, or `bespoke`. Rows without it count for c1
  only, not c8.
- **`SFDR Assurance Tier` defaults to v3.4 per-component logic when omitted.** New
  engagements should always set this explicitly (v3.5 F7 pack-level hierarchy).

---

## 4. UK SDR Sustainability Focus — `uk_sdr_focus`

**Worked example:** Engagement #7 — `f517f09f-587f-4094-99ec-e78dd29e72ae` (LOS-HYP-01
Lagos, strong tier) or #8 — `0d9a20e3-17b0-4217-9514-4ddfb200e83b` (SIN-COL-005
Singapore, gap tier — `other` standard not recognised).

**Additional fields beyond universal set:** 3 UK SDR Specifics fields. No child rows.

**Criteria scored** (4 total):

- **c1 — Asset sustainability profile** — cross-framework dependency on EU Taxonomy 8.1.
  EU Tax MUST be in the framework set (the app's `frameworksForLabel()` already adds it
  automatically when target_label is uk_sdr_*). c1 reads EU Tax 8.1's `overall_verdict`:
  `pass` → `aligned`, `partial` → `partially_aligned`, `fail` → `not_aligned`.
- **c2 — Credible standard recognition** — reads `UK SDR Standard Claimed` single-select.
  - `eu_taxonomy_8_1` → `aligned`
  - `leed_platinum` → `aligned`
  - `sbti` → `partially_aligned` (covers emissions trajectory only)
  - `other` → `not_aligned` (standard not in PB methodology v3.5's recognised set)
- **c3 — Sustainable proportion threshold** — cascades from c1 + c2. Both must be aligned
  for the asset to qualify toward the fund's 70% threshold.
- **c4 — Asset-level KPI reporting** — reads `UK SDR KPIs Committed` multi-select
  + `UK SDR Reporting Frequency`. Aligned requires all 4 KPIs (`pue`, `renewable_energy_pct`,
  `ghg_emissions`, `wue`) + frequency `annual`.

**Common gotchas:**

- **EU Taxonomy 8.1 fields must be populated.** Because c1 reads EU Tax, the engagement
  needs the full EU Tax intake set populated even though the target label is UK SDR. If
  EU Tax fields are sparse, EU Tax verdict will be weak which drags UK SDR c1 down.
- **`UK SDR Standard Claimed` single-select options.** Exact valid values: `eu_taxonomy_8_1`,
  `leed_platinum`, `sbti`, `other`. Don't add new options without bumping the engine's
  `FULL_CREDIBLE_STANDARDS` / `PARTIAL_CREDIBLE_STANDARDS` sets — the engine compares
  against canonical lowercase strings.
- **`UK SDR KPIs Committed` multi-select options.** Exact valid values: `pue`,
  `renewable_energy_pct`, `ghg_emissions`, `wue`. (Note the Airtable schema as currently
  configured has a duplicate `pue` option and one with an empty name — both are leftover
  artefacts; ignore them. Always use the lowercase canonical names.)

---

## 5. UK SDR Sustainability Improvers — `uk_sdr_improvers`

**Worked example:** Engagement #9 — `6325c039-3137-471b-840b-6a6dd87cd9dc` (SAO-IMP-01
São Paulo, strong tier) or #10 — `219dbbaa-83e5-4c59-bdc4-9f22aa4027bb` (SYD-IMP-003
Sydney, gap tier — partial baseline + extended timeline).

**Additional fields beyond universal set:** 3 UK SDR Focus-style fields + 1 JSON blob
(`UK SDR Improvement Plan`).

**Criteria scored** (5 total):

- **c5 — Baseline sustainability assessment** — reads `improvement_plan.baseline_metrics`
  from the JSON blob. Aligned requires all 3 of: `pue_current`,
  `renewable_pct_current`, `ghg_current`. (Optional 4th: `wue_current`.)
- **c6 — Improvement strategy** — reads `improvement_plan.strategy`. Aligned requires
  `timeline_years ≤3` AND `actions.length ≥3`. Partial: ≤5 years, ≥1 action.
- **c7 — Improvement KPI targets** — reads `improvement_plan.targets`. Aligned requires
  ≥3 of 4 quantified targets, AND a credible baseline from c5 (cascade).
- **c8 — Progress monitoring** — reads `UK SDR Reporting Frequency` + verification method
  inside the JSON blob (`strategy.verification_method`). Aligned requires `annual` cadence
  + verification ≠ `none`.
- **c9 — Improvement proportion threshold** — cascades from c5 + c6 + c7 + c8. Any
  `not_aligned` upstream forces c9 `not_aligned`.

**JSON blob shape (`UK SDR Improvement Plan`):**

```json
{
  "baseline_metrics": {
    "pue_current": 1.50,
    "renewable_pct_current": 60,
    "ghg_current": 12500,
    "wue_current": 0.78
  },
  "strategy": {
    "timeline_years": 3,
    "actions": [
      "Migrate 100% of grid demand to renewable PPAs by 2027",
      "Deploy liquid cooling on next compute refresh cycle (2026 Q3)",
      "Implement site-level water recycling targeting 50% reduction by 2028"
    ],
    "verification_method": "third_party_audit"
  },
  "targets": {
    "pue_target": 1.25,
    "renewable_pct_target": 95,
    "ghg_reduction_pct": 35,
    "wue_target": 0.55
  }
}
```

**Common gotchas:**

- **JSON blob must be valid JSON.** Validate before pasting. Smart quotes break the
  parse. Adapter falls back silently to `undefined` on malformed input (all 5 criteria
  resolve to `insufficient_evidence` if the parse fails).
- **`verification_method` enum.** Valid values: `third_party_audit`, `internal`, `none`.
  Anything else is treated as `none` by c8.
- **Cascade visibility.** If c5 fails (e.g. only `pue_current` populated, missing renewable
  + GHG), c7 will say "baseline weak which limits materiality assessment" even when
  targets are populated. The rationale text explains the chain.

---

## 6. UK SDR Sustainability Impact — `uk_sdr_impact`

**Worked example:** Engagement #11 — `01af2113-46f1-4d6b-bc65-ee89b0fb1a32` (ACC-IMP-01
Accra, strong tier — substantive theory of change + additionality) or #12 —
`fff71f4b-2a49-4cbd-97be-c32000412a6d` (LDN-IMP-002 London, gap tier — generic objective).

**Additional fields beyond universal set:** 3 UK SDR Focus-style fields + 1 JSON blob
(`UK SDR Impact Plan`).

**Criteria scored** (6 total):

- **c10 — Defined impact objective** — reads `impact_plan.impact_objective` +
  `objective_category` + `declared_in`. Aligned requires all three: named objective,
  recognised category, and deal-defining documentation reference.
- **c11 — Impact measurement** — reads `impact_plan.theory_of_change` +
  `quantified_indicators[]`. Aligned requires both a written ToC AND ≥3 well-formed
  quantified indicators (each with `name`, `baseline`, `target`, `unit`). Cascades from
  c10 (c10 `not_aligned` forces c11 `not_aligned`).
- **c12 — Impact additionality** — reads `impact_plan.additionality_evidence`. Aligned
  requires substantive narrative (≥200 characters). Partial for shorter narrative.
- **c13 — Impact proportion threshold** — cascades from c10 + c11 + c12. Any
  `not_aligned` upstream forces c13 `not_aligned`.
- **c14 — Annual impact reporting** — reads `impact_plan.reporting_commitment`. Aligned
  requires all 4 elements: `annual_cadence`, `reports_against_indicators`,
  `outcome_level_reporting`, `verification_method` ≠ `none`.
- **c15 — No-significant-harm screen** — cross-framework dependency on EU Taxonomy 8.1
  DNSH results. EU Tax MUST be in framework set. Mirrors c1's cross-framework pattern.

**JSON blob shape (`UK SDR Impact Plan`):**

```json
{
  "impact_objective": "Displace diesel-grid emissions across three underserved West African markets...",
  "objective_category": "environmental_climate_mitigation",
  "declared_in": "Sub-Sahara Impact Infrastructure Fund I Investment Memorandum, Section 3.2",
  "theory_of_change": "Anchor renewable PPA demand at scale in Ghana, Côte d'Ivoire, and Senegal grids historically supplemented by diesel generation. The 80MW PPA underwrites grid-scale solar buildout...",
  "quantified_indicators": [
    {"name": "Annual displaced diesel emissions", "baseline": 0, "target": 11500, "unit": "tCO2e/yr", "source": "eu_taxonomy"},
    {"name": "Renewable PPA capacity anchored", "baseline": 0, "target": 80, "unit": "MW", "source": "bespoke"}
  ],
  "additionality_evidence": "Counterfactual analysis (IM Annex C, signed off by independent advisor...)...",
  "reporting_commitment": {
    "annual_cadence": true,
    "reports_against_indicators": true,
    "outcome_level_reporting": true,
    "verification_method": "third_party_audit"
  }
}
```

**Common gotchas:**

- **`objective_category` enum.** Valid values (from engine's `SIObjectiveCategory` type):
  `environmental_climate_mitigation`, `environmental_climate_adaptation`,
  `environmental_water_marine`, `environmental_circular_economy`,
  `environmental_pollution_prevention`, `environmental_biodiversity`,
  `social_decent_work`, `social_adequate_standards_of_living`,
  `social_inclusive_communities`, `social_other_recognised`.
- **Additionality narrative threshold.** ≥200 characters for `aligned`. Generic
  one-sentence narratives ("This investment supports sustainability") will resolve to
  `partially_aligned` even when other criteria are strong — flagged in rationale.
- **EU Taxonomy 8.1 fields must be populated** (same reason as UK SDR Focus c1 — c15
  reads EU Tax DNSH results).
- **Indicators array shape.** Each indicator needs `name` (string), `baseline` (number),
  `target` (number), `unit` (string). `source` is optional but recommended for evidence
  trail.

---

## Cross-label quick reference: what each label loads

| Label | Engine frameworks loaded | Required Airtable fields beyond universal |
|-------|--------------------------|-------------------------------------------|
| `eu_taxonomy_aligned_8_1` | EU Tax 8.1 | (none — universal set is enough) |
| `sfdr_article_8` | EU Tax 8.1 + SFDR Art 8 | 6 SFDR Specifics + 26 entity scalars + 8 c6 fields (conditional) + 4 child tables |
| `sfdr_article_9` | EU Tax 8.1 + SFDR Art 9 | All of the above + SFDR Project PAI Data child rows |
| `uk_sdr_focus` | EU Tax 8.1 + UK SDR Focus | 3 UK SDR Specifics fields |
| `uk_sdr_improvers` | EU Tax 8.1 + UK SDR Improvers | 3 UK SDR Specifics + UK SDR Improvement Plan JSON |
| `uk_sdr_impact` | EU Tax 8.1 + UK SDR Impact | 3 UK SDR Specifics + UK SDR Impact Plan JSON |

In every case the EU Taxonomy 8.1 fields must be populated even when the target label is
SFDR or UK SDR — those frameworks depend on EU Tax cross-framework either for c6 (SFDR)
or for c1 + c15 (UK SDR).
