# METHODOLOGY_AUDIT.md — Phase 2

**Branch:** `audit` (from `origin/main`, HEAD `82a3f7e`)
**Methodology vintage:** Perennity Bridge v3.1, April 2026
**Scope:** Every Core / scored input identified in [INPUT_AUDIT.md](INPUT_AUDIT.md), plus engine-level regulatory classifications (SFDR / UK SDR / EU Taxonomy) and the cross-cutting issues flagged in the prompt.

Status legend:
- ✅ **Aligned** — code matches methodology v3.1 and the cited source
- ⚠️ **Partial** — right shape, wrong numbers / wrong mapping / stale citation
- ❌ **Misaligned** — fundamentally wrong logic, missing scope, or contradicts source
- ⬜ **Undefined** — code exists but no methodology spec provided; needs a decision

---

## Summary of findings

Across the 29 Core inputs and 7 regulatory classification surfaces audited:

- ✅ **6 aligned** — keep as-is
- ⚠️ **14 partial** — correct shape but wrong thresholds, stale citations, or missing branches
- ❌ **8 misaligned** — logic bug, missing scope, or material contradiction of source
- ⬜ **1 undefined** — CUE (not implemented anywhere; confirm whether v3.1 mandates it)

The majority of issues cluster in three places:
1. `src/regulations/frameworks/eu-taxonomy.json` — PUE thresholds encode the old 2021/2139 numbers (1.5/1.8) rather than v3.1's tightened 1.2/1.3 bands; DNSH Obj 1 and Obj 3 missing; version string "DA 2021/2139 (amended 2023)" implies 2023/2485 applies (it doesn't).
2. `src/regulations/frameworks/uk-sdr.json` — missing the 4th label ("Sustainability Mixed Goals"), and `determineUkSdrEligibility` in the engine correspondingly only returns 3 results.
3. `src/engine/scoring.js` `determineEuTaxonomyAlignment` — `||` bug in DNSH pollution check, incorrect DNSH scope (only 4 of 6 objectives covered, one of them wrong), and the hard-stop `target_financing_label` check references never-selectable enum values.

The AI narrative ([aiAnalysis.js:16](src/engine/aiAnalysis.js:16)) serialises the raw framework JSONs into the Claude system prompt — so every JSON misalignment below is also propagating into the investor-facing AI analysis. Fix the JSONs, the narrative self-heals.

---

## Per-input methodology table

Columns:
- **Input / Classification** — field name or classification function
- **Current logic (file:line)** — what the code does today
- **Required per v3.1** — what the methodology + cited source require
- **Status** — ✅ / ⚠️ / ❌ / ⬜
- **Gap & proposed fix**

### 1. PUE scoring

| | |
|---|---|
| **Input** | `pue` (Tab 1) → `calculatePueScore` |
| **Current logic** | [scoring.js:129-164](src/engine/scoring.js:129). For new-build (concept / site_shortlisted / site_selected / pre_permitting / `is_new_build`): score 95 if ≤1.2; 85 if ≤1.3; 80 if within country target (else gap/conditional down to 10). For existing: 77 if ≤ target+0.2; 47 if ≤ target+0.5; 15 otherwise. PUE target read from `COUNTRY_PROFILES[country].pueTarget` (e.g. 1.5 for UAE, 1.3 for Germany). |
| **Required per v3.1** | EU 2021/2139 Annex I, Activity 8.1, paragraph 1(a)-(b): for data centres placed in service from 1 Jan 2026, PUE ≤ 1.3 by 2026; for existing, ≤ 1.5 by 2027 with improvement plan. v3.1 (per prompt) tightens this: new-build ≤1.2 → 90–100 score band; ≤1.3 → 70–89; ≤1.5 fail-for-new-build → 45–69; >1.5 fail; existing ≤1.5 pass. |
| **Status** | ⚠️ **Partial** |
| **Gap & fix** | **Three issues:** (1) v3.1 bands are specified by numeric PUE value, but the code thresholds the score around the *country PUE target* (1.5 for MENA, 1.3 for EU). That couples the band interpretation to the country profile rather than to the Activity 8.1 absolute thresholds. Result: a new-build MENA DC at PUE 1.45 → `pue <= pueTarget (1.5)` → score 80 "Capital ready", which contradicts v3.1's "45–69 fail-for-new-build". (2) The upper existing-DC threshold at `pueTarget+0.5` is 2.0 for MENA (pueTarget 1.5), which exceeds the EU Taxonomy 1.8 existing-DC ceiling; existing MENA DC at PUE 1.99 today scores 47 not fail. (3) The isNew heuristic treats `site_selected` and `pre_permitting` as new-build, which is correct under Activity 8.1 (applies to anything placed in service from 2026). Re-center banding on absolute PUE per v3.1 spec. The country target should *inform a contextual flag* (e.g. "your country recommends ≤1.5") but not define the scoring bands. |

### 2. WUE scoring & CNDCP WUEmax formula

| | |
|---|---|
| **Input** | `wue`, `k1_climate`, `k2_stress`, `k3_water` → `calculateWueMax` + `scoreWueVsMax` |
| **Current logic** | [scoring.js:167-203](src/engine/scoring.js:167). WUEmax = 0.4 × K1 × K2 × K3. K1 map: cold→1.0, warm→1.1. K2 map: low→5.0, low_medium→4.0, medium_high→2.5, high→1.0. K3 map: potable→1.0, grey→3.0, brackish→6.0. Band: ≤80%·WUEmax exceeds; ≤WUEmax meets; ≤120%·WUEmax marginal; else fails. |
| **Required per v3.1** | EUDCA White Paper October 2024 §CNDCP formula: WUEmax = 0.4 × K1_climate × K2_stress × K3_water. K1: cold ≤50 CDD above 21°C → 1.0; warm ≥50 CDD → 1.1. K2: WEI+ ≤10 → 5.0; 11–20 → 4.0; 21–40 → 2.5; >40 → 1.0. K3: potable → 1.0; grey/recycled → 3.0; brackish/sea → 6.0. MENA default K1=1.1, K2=1.0, K3=1.0 → WUEmax = 0.44 m³/MWh. |
| **Status** | ✅ **Aligned** on formula, ⚠️ **Partial** on defaults |
| **Gap & fix** | The formula, K-factor maps, and banding are **correct**. Two smaller issues: (1) the country-water-stress → K2 fallback at [scoring.js:174](src/engine/scoring.js:174) maps `extreme→1.0`, `high→1.0`, `medium→2.5`, `low→5.0`. No separate "low_medium" (4.0) tier even though the CNDCP band exists. Minor — merging `extreme`/`high` into the same K2 is a defensible conservatism. (2) The stringency map at [scoring.js:194](src/engine/scoring.js:194) (`getWueMaxStringency`: extreme→0.5, high→1.0, medium→1.5, low→2.0) is a *separate* threshold layer that doesn't appear in CNDCP — it's a regional stress overlay that isn't cited. Either document the source (v3.1 layer?) or remove — currently it can contradict the CNDCP WUEmax result. |

### 3. Renewables — three-tier source quality

| | |
|---|---|
| **Input** | `renewable_energy_share_pct`, `renewable_energy_source`, `renewable_source_tier` → `calculateRenewableTierScore` |
| **Current logic** | [scoring.js:206-241](src/engine/scoring.js:206). Tier 1 (matched PPA / on-site): 100%→95, 75%→80, 50%→57, else linear. Tier 2 (GOs/RECs/mixed): 100%→72, 75%→55, else linear capped at 44. Tier 3 (utility green tariff): capped at 40, with flag "does not satisfy EU Taxonomy additionality". |
| **Required per v3.1** | GHG Protocol Scope 2 Guidance (2015), EU Taxonomy Climate DA Activity 8.1 paragraph 1(c): "100% renewable electricity or credible pathway". Tier 1 — matched PPA or on-site → full credit; Tier 2 — GOs/RECs → partial credit; Tier 3 — unmatched utility green tariff → capped at 40 (does not satisfy additionality per GHG Protocol Scope 2). |
| **Status** | ✅ **Aligned** |
| **Gap & fix** | Logic and thresholds match. One micro-issue: the default branch at [scoring.js:220](src/engine/scoring.js:220) maps "unknown source" to Tier 1, which overstates quality for a blank answer. Change default to Tier 2 (midpoint) or force the field to be required. Recommend: make `renewable_energy_source` required (it is already marked `required` on the form). |

### 4. EU Taxonomy substantial contribution — Activity 8.1

| | |
|---|---|
| **Classification** | `determineEuTaxonomyAlignment` |
| **Current logic** | [scoring.js:97-126](src/engine/scoring.js:97). Reads threshold from `eu-taxonomy.json` (`pue_new: 1.5`, `pue_existing: 1.8`). Checks `renewable ≥ 50`, `waste_heat_recovery`, climate-risk-adaptation. Switches on `project.is_new_build` — a field that **is not collected from the user** and is never set in `INITIAL_PROJECT`, so `pueThreshold` always falls through to `pue_existing: 1.8`. |
| **Required per v3.1** | EU 2021/2139 Annex I Activity 8.1 paragraph 1(a)-(d): (a) PUE meets threshold (new-build ≤ 1.3 — tightened by v3.1 to ≤1.2 for post-2025); (b) existing ≤ 1.5 with improvement plan; (c) 100% renewable or credible pathway; (d) waste-heat re-use assessed. |
| **Status** | ❌ **Misaligned** |
| **Gap & fix** | (a) `eu-taxonomy.json` encodes **pue_new: 1.5 / pue_existing: 1.8** — these are the pre-2023 Activity 8.1 transitional numbers, not the v3.1 values. Update to `pue_new: 1.3` (or 1.2 post-2025) and `pue_existing: 1.5`. Also update the `name` strings ("PUE ≤ 1.5 (new facilities from 2026)" is the wrong number). (b) `is_new_build` is never set — replace with the same stage-based heuristic used in `calculatePueScore` ([scoring.js:130](src/engine/scoring.js:130)) and remove the phantom `is_new_build` field. (c) The `renewable ≥ 50%` criterion is correct as a soft threshold (matches `softThreshold: 50` in the JSON) but v3.1 per Activity 8.1 requires a credible pathway to 100%. Currently scored all-or-nothing at 50%; add the higher bound. (d) The JSON's version string `"DA 2021/2139 (amended 2023)"` misleadingly suggests EU 2023/2485 amended Activity 8.1 — **it did not** (2023/2485 amended environmental objectives DA 2023/2486, not Activity 8.1). Change version to `"DA 2021/2139 (Climate DA), effective 2022-01-01; tightened per Perennity v3.1 methodology"`. |

### 5. EU Taxonomy DNSH — six environmental objectives

| | |
|---|---|
| **Classification** | `determineEuTaxonomyAlignment` DNSH block + `calculateDnshGovernance` |
| **Current logic** | [scoring.js:113-119](src/engine/scoring.js:113). The `dnsh` object covers: `water` (WUE threshold), `pollution` (backup_power_type / onsite_generation_type), `biodiversity` (adaptation measures), `circular` (hard-coded `met: true`), `climate` (adaptation measures). Separately, `calculateDnshGovernance` at [scoring.js:244-268](src/engine/scoring.js:244) grades the 6-item DNSH checklist. |
| **Required per v3.1** | EU 2020/852 Article 17 + Annexes I–VI (per objective): DNSH across all six EU environmental objectives — (1) Climate Mitigation, (2) Climate Adaptation, (3) Sustainable Use of Water and Marine Resources, (4) Circular Economy, (5) Pollution Prevention, (6) Biodiversity. Per EU Platform Feb 2025, DNSH for Activity 8.1 is ~88% qualitative. |
| **Status** | ❌ **Misaligned** — multiple issues |
| **Gap & fix** | (1) **DNSH Obj 1 (Climate Mitigation) missing entirely.** For data centres the substantial contribution itself is climate mitigation, so DNSH Obj 1 is instead checked against the other five; the current code has no equivalent placeholder. Add explicit "DNSH Obj 1 — self-referential, satisfied by substantial contribution". (2) **DNSH Obj 3 (Water) is present but uses a fixed WUE ≤ 1.0 threshold** from the JSON ([eu-taxonomy.json:50](src/regulations/frameworks/eu-taxonomy.json:50)). Methodology v3.1 requires the CNDCP WUEmax formula, not a flat 1.0. Compute WUEmax via `calculateWueMax` and DNSH-pass if `wue ≤ wueMax`. (3) **Pollution DNSH has a logic bug:** `project.backup_power_type !== 'diesel' || project.onsite_generation_type !== 'gas'` ([scoring.js:115](src/engine/scoring.js:115)) passes if EITHER is non-polluting. Should be `&&` — BOTH must be non-polluting. (4) **Circular is hard-coded `met: true`** ([scoring.js:117](src/engine/scoring.js:117)) — should be driven by `dnsh_weee_compliance`. (5) The `calculateDnshGovernance` checklist bundles 4 DNSH items (Obj 2, 4, 5, 6) with 2 Art 18 Minimum Social Safeguards items into a single 9-point score. Split these: DNSH items roll into the `determineEuTaxonomyAlignment` DNSH object; Art 18 rolls into Minimum Safeguards (separate gate under Article 18). |

### 6. Minimum Social Safeguards (Article 18)

| | |
|---|---|
| **Inputs** | `dnsh_human_rights_dd`, `dnsh_supply_chain_labour` |
| **Current logic** | [scoring.js:250-251](src/engine/scoring.js:250). Bundled into the DNSH governance score under `calculateDnshGovernance`. |
| **Required per v3.1** | EU 2020/852 Article 18: alignment with OECD Guidelines for MNEs, UN Guiding Principles on Business and Human Rights, ILO Declaration on Fundamental Principles, International Bill of Human Rights. Required as a separate gate from DNSH — an activity that fails Art 18 is not Taxonomy-aligned regardless of DNSH. |
| **Status** | ❌ **Misaligned** |
| **Gap & fix** | Extract the 2 Art 18 items out of `calculateDnshGovernance` and add them as a gating check in `determineEuTaxonomyAlignment`: `aligned = substantialMet && dnshMet && art18Met`. The eu-taxonomy.json already has `minimumSocialSafeguards` defined ([eu-taxonomy.json:69](src/regulations/frameworks/eu-taxonomy.json:69)) but the engine doesn't read it. |

### 7. SFDR classification

| | |
|---|---|
| **Classification** | `determineSfdrClassification` |
| **Current logic** | [scoring.js:29-54](src/engine/scoring.js:29). Article 9: `renewPct ≥ 80`, `pue ≤ 1.5`, `taxonomy_alignment_claimed`, `sustainability_disclosures_ready`, `net_zero_commitment_present`. Article 8: `renewPct ≥ 40`, `pue ≤ 1.8`, `sustainability_disclosures_ready`. Else Article 6. |
| **Required per v3.1** | SFDR 2019/2088 Arts 8, 9. Commission Delegated Reg (EU) 2022/1288 (RTS). Article 9: "sustainable investment as its objective" + EU Taxonomy alignment + PAI disclosure + Do No Significant Harm + Minimum Social Safeguards + good governance. Article 8: "promotes environmental or social characteristics" + process for integrating sustainability risks + PAI consideration. |
| **Status** | ⚠️ **Partial** |
| **Gap & fix** | Two issues: (1) The thresholds use project-level proxies for fund-level requirements, which is appropriate for a project-scoring tool, but the numbers should key off Activity 8.1 thresholds. `pue ≤ 1.5` as the Article 9 gate is too lax per v3.1 (should be ≤1.3 for new-build); `pue ≤ 1.8` for Article 8 is the existing-DC limit and is defensible only as a minimum bar. (2) PAI disclosure is a *required disclosure* under Art 9 — `sustainability_disclosures_ready` stands in for PAI + pre-contractual + periodic disclosures, which understates the requirement. Either keep the current proxy but document it in the `sfdr.json` description, or split `sustainability_disclosures_ready` into three booleans (pre-contractual, periodic, PAI). Recommend: document the proxy, don't split. |

### 8. UK SDR label eligibility

| | |
|---|---|
| **Classification** | `determineUkSdrEligibility` |
| **Current logic** | [scoring.js:57-94](src/engine/scoring.js:57). Returns 3 labels: Sustainability Impact, Sustainability Focus, Sustainability Improvers. Reads thresholds from `uk-sdr.json`. |
| **Required per v3.1** | FCA PS23/16 ESG Sourcebook 5.3 — **four** labels: Sustainability Focus, Sustainability Improvers, Sustainability Impact, **Sustainability Mixed Goals**. Plus the anti-greenwashing rule (ESG 4.3.1R) and the naming & marketing rules (ESG 4.3.2R–4.3.14R). |
| **Status** | ❌ **Misaligned** — missing label + missing companion rules |
| **Gap & fix** | (1) Add **Sustainability Mixed Goals** label to `uk-sdr.json` and to `determineUkSdrEligibility`. Mixed Goals criterion per PS23/16 9.50: "where a fund's objective aligns with more than one of the other three labels' standards in respect of different parts of the portfolio". Eligibility rule: pass if the project would qualify for at least two of (Focus, Improvers, Impact) at the proportional-investment level. (2) `uk-sdr.json` `disclosureRequirements.naming` is one sentence ("Fund names must not use sustainability terms unless labelled") — replace with a structured section citing ESG 4.3.2R-4.3.14R (naming & marketing) and the anti-greenwashing rule ESG 4.3.1R. (3) The Focus threshold `minSustainableAssets: 70` is correct per PS23/16 9.10(1); the Impact threshold `minRenewable: 70` and `maxPue: 1.4` are stricter project proxies — acceptable but should be documented. (4) The engine has a region gate at [scoring.js:662](src/engine/scoring.js:662) that only runs `determineUkSdrEligibility` when `region === 'UK'`, meaning the Tab 5 `uk_sdr_*` dropdown options are only evaluated for UK projects. That's correct per FCA scope. |

### 9. SFDR PAI indicators

| | |
|---|---|
| **Source** | `sfdr.json` `paiIndicators` + PDF `drawPaiMapping` |
| **Current logic** | `sfdr.json` lists 5 PAIs by internal id without numbering ([sfdr.json:43](src/regulations/frameworks/sfdr.json:43)). PDF page 8 at [pdfExport.js:493-503](src/export/pdfExport.js:493) lists PAI 1, 2, 5, 7, 8, 9, 10, 11, 13 with correct names. |
| **Required per v3.1** | Commission Delegated Reg (EU) 2022/1288 Annex I Table 1. Mandatory PAIs (1–14) plus optional (15–18, 41–42). Indicators materially relevant for data centres: PAI 1 (GHG), 2 (carbon footprint), 5 (non-renewable energy consumption share), 7 (biodiversity-sensitive area activities), 8 (emissions to water), 9 (hazardous waste ratio), 10 (UNGC violations), 11 (UNGC processes/mechanisms), 13 (board gender diversity). |
| **Status** | ⚠️ **Partial** |
| **Gap & fix** | (1) PDF mapping is ✅ correct. (2) `sfdr.json` list is **misaligned with the PDF and with the Annex numbering** — it uses 5 internal-id entries (`ghg_emissions`, `carbon_footprint`, `energy_consumption`, `renewable_energy`, `water_emissions`) that don't map cleanly to the 14 mandatory Annex I Table 1 indicators and omit PAIs 7, 9, 10, 11, 13. Rewrite the JSON list to match the PDF (9 entries with numeric PAI ids and canonical Annex names). This fix also makes the AI narrative cite the correct PAIs. (3) The page 8 note at [pdfExport.js:512](src/export/pdfExport.js:512) correctly disclaims PAIs not addressed (3, 4, 6, 12, 14). Keep. |

### 10. Hard-stop logic — `target_financing_label` branch

| | |
|---|---|
| **Input** | `target_financing_label` |
| **Current logic** | [scoring.js:551-558](src/engine/scoring.js:551). Triggers a 59-point cap if `target_financing_label ∈ {'green', 'article_8_9', 'sustainable'}` AND not taxonomy aligned AND renewable < 30. |
| **Required per v3.1** | The list of valid `target_financing_label` values ([App.jsx:1273-1296](src/App.jsx:1273-1296)) is: `sfdr_article_8`, `sfdr_article_9`, `eu_taxonomy_8_1`, `eugbs`, `icma_green_bond`, `icma_slb`, `icma_social_bond`, `uk_sdr_focus`, `uk_sdr_improvers`, `uk_sdr_impact`, `uk_sdr_mixed`, `eib`, `ifc`, `ebrd`, `afdb`. None of `'green'`, `'article_8_9'`, `'sustainable'` can be selected. |
| **Status** | ❌ **Misaligned — dead branch** |
| **Gap & fix** | Update the hard-stop check to trigger when `target_financing_label` is a **green-claim label** (`sfdr_article_9`, `eu_taxonomy_8_1`, `eugbs`, `icma_green_bond`, any `uk_sdr_*`, any DFI) AND taxonomy-not-claimed AND renewable < 30. Rename the hardStop key from `greenRaiseWithoutTaxonomy` (still fine as a key) but fix the enum comparison. Move the enum list to `region-thresholds.json` so it doesn't need recompilation when labels change. |

### 11. CUE (Carbon Usage Effectiveness)

| | |
|---|---|
| **Input** | — not collected anywhere |
| **Current logic** | No references to CUE, ISO/IEC 30134-8, or carbon-per-IT-load anywhere in the repo. Grid carbon intensity (`COUNTRY_PROFILES[country].gridCarbon`) is consumed in SA scoring ([scoring.js:292](src/engine/scoring.js:292)) as a penalty/bonus only. |
| **Required per v3.1** | If methodology v3.1 mandates CUE per ISO/IEC 30134-8 (`CUE_ISOIECFDIS301348.pdf` in the library), then CUE = carbon emissions / IT energy should be derivable from `it_load_mw × PUE × gridCarbon` or collected as an explicit user input. |
| **Status** | ⬜ **Undefined** |
| **Gap & fix** | Confirm whether v3.1 requires CUE. If yes: (a) surface CUE = `(pue × planned_capacity_mw × 8760 × gridCarbon) / (planned_capacity_mw × 8760)` = `pue × gridCarbon` (kgCO₂/MWh) as a derived display value on Results page + PDF; (b) add bands per ISO/IEC 30134-8 or v3.1 spec. If no: leave as-is and remove the line item from the v3.1 scope. I'll need your call before implementing. |

### 12. Region weights & thresholds

| | |
|---|---|
| **Source** | `region-thresholds.json` |
| **Current logic** | Four regions (EU, UK, US, MENA). Pillar weights vary by region (EU weights SA at 35%, MENA at 30%, US at 20%). PUE target: EU 1.3, UK 1.35, US 1.4, MENA 1.4. Renewable min: EU 50%, UK 40%, US 30%, MENA 35%. |
| **Required per v3.1** | Thresholds should derive from the applicable regulatory frameworks for the region, not from methodology design choices alone. Weights are a Perennity methodology decision, not a regulatory one — must be documented as such. |
| **Status** | ⚠️ **Partial** |
| **Gap & fix** | (1) Thresholds: EU PUE target 1.3 is correct per v3.1; MENA 1.4 has no regulatory anchor (the JSON cites UAE Smart Dubai Data Centre Policy and Saudi Vision 2030 but neither specifies 1.4). Cite or loosen. (2) Weights: document that these are Perennity v3.1 opinion-based weights, not reg-derived. (3) "Africa" and "Latin America" as `projectRegionGroup` values are mapped to UK/US weights at [App.jsx:1091](src/App.jsx:1091) with no justification — flag from Phase 1 carries over. Either add `AFRICA` / `LATAM` regions to `region-thresholds.json` or explicitly document that they inherit UK/US weights. |

### 13. Climate site resilience — `wildfire_risk_score`

| | |
|---|---|
| **Input** | `wildfire_risk_score` — not collected on any form |
| **Current logic** | [scoring.js:453](src/engine/scoring.js:453) reads `project.wildfire_risk_score` and defaults to 20 if absent. Feeds into `weatherScore`. |
| **Required per v3.1** | Phase 1 flagged this as a phantom field. Either collect it (Tab 4 has Flood/Heat/Storm but not wildfire) or remove from the engine. |
| **Status** | ❌ **Misaligned** (silent default of 20 is shipped to every project) |
| **Gap & fix** | Either add a `wildfire_risk_score` input to Tab 4 (recommended, since many markets have material wildfire risk) or remove the reference and the `weatherScore` calculation. The silent `|| 20` is a hidden scoring input that no user controls. |

### 14. TCFD alignment

| | |
|---|---|
| **Source** | `tcfd.json` + CSR bonus at [scoring.js:480-489](src/engine/scoring.js:480) |
| **Current logic** | `tcfd.json` defines 4 pillars (Governance, Strategy, Risk Management, Metrics) with weights. Engine adds +5 to `adaptScore` if ≥3 of `adaptation_measures_present`, `business_continuity_plan_ready`, `net_zero_commitment_present`, `sustainability_disclosures_ready` are set. |
| **Required per v3.1** | TCFD 2017 recommendations (finalised 2023; now ISSB IFRS S2). Four pillars as stated. Data-centre-level TCFD reporting typically at portfolio level, not project. A project-level proxy is acceptable if documented. |
| **Status** | ⚠️ **Partial** |
| **Gap & fix** | The proxy is defensible — no numbers are wrong. But `tcfd.json` has two project field references (`tcfd_governance`, `tcfd_strategy`) that **do not exist in `INITIAL_PROJECT`** — these were placeholders. Either add those as form fields (strongest) or remove them from the JSON and leave the current 4-item heuristic proxy. |

### 15. Grid carbon intensity usage (scope-2 proxy)

| | |
|---|---|
| **Input** | derived from `country` → `COUNTRY_PROFILES[country].gridCarbon` |
| **Current logic** | [scoring.js:291-299](src/engine/scoring.js:291). Penalty if `gridCarbon > 600 gCO₂/kWh` without PPA/battery/hydrogen mitigation; small bonus if `≤100`. |
| **Required per v3.1** | GHG Protocol Scope 2 Guidance: market-based vs location-based dual reporting. Data-centre benchmarks commonly use 450–500 gCO₂/kWh as a "high" threshold. |
| **Status** | ✅ **Aligned** (reasonable threshold, sound logic) |
| **Gap & fix** | The 600 gCO₂/kWh threshold isn't cited but is plausible. Add a source citation in-code or in `region-thresholds.json`. |

### 16. Readiness bands

| | |
|---|---|
| **Source** | `READINESS_BANDS` at [scoring.js:22-26](src/engine/scoring.js:22) |
| **Current logic** | 80+ Green Ready; 60–79 Needs Optimisation; <60 High Risk. |
| **Required per v3.1** | The PDF uses a 4-band model at [pdfExport.js:62](src/export/pdfExport.js:62) — 75+ CAPITAL READY, 55–74 CONDITIONALLY READY, 35–54 DEVELOPMENT STAGE, <35 PRE-DEVELOPMENT. |
| **Status** | ❌ **Misaligned — engine and PDF use different bands** |
| **Gap & fix** | The Results page UI shows "Green Ready" (80+) while the PDF shows "CAPITAL READY" (75+). Same assessment, same score, contradictory labels. Unify: pick one band scheme per v3.1 methodology and use it everywhere. Recommend the 4-band PDF scheme with slightly tighter "Capital Ready" at 75+, because it gives the Conditional band meaningful coverage. Update `READINESS_BANDS` in engine AND Results page bands at [App.jsx:155-159](src/App.jsx:155). |

### 17. Recommendations — threshold comparison

| | |
|---|---|
| **Source** | `generateRecommendations` at [scoring.js:580-625](src/engine/scoring.js:580) |
| **Current logic** | Recommends "Reduce PUE" if `pue > thresholds.pue` where `thresholds = REGION_THRESHOLDS[region]`. Regional PUE targets: EU 1.3, UK 1.35, US 1.4, MENA 1.4. |
| **Required per v3.1** | Recommendations should reference Activity 8.1 thresholds when the capital source is EU-regulated, not the regional "target" only. |
| **Status** | ⚠️ **Partial** |
| **Gap & fix** | Recommendation text says "exceeds ${region} benchmark of ${thresholds.pue}" — fine for regional context, but should also note the absolute Activity 8.1 thresholds (1.3 new / 1.5 existing) where the user is pursuing an EU-regulated financing label. Drive from `target_financing_label` after Fix 3.2. |

### 18. Hard stops — grid access, flood, water

| | |
|---|---|
| **Source** | `evaluateHardStops` at [scoring.js:529-561](src/engine/scoring.js:529) |
| **Current logic** | Four hard-stops: `noGridUS_EU` (grid not started for EU/US, cap 45), flood >80 unmitigated (cap 50), water-stress >0.85 + evaporative + no recycling (cap 50), missing ≥3 critical fields (cap 55), `greenRaiseWithoutTaxonomy` (cap 59). |
| **Required per v3.1** | Not methodology-specified; these are Perennity business-logic gates. |
| **Status** | ⬜ **Undefined** — Perennity opinion |
| **Gap & fix** | (1) Document these as Perennity business rules in `region-thresholds.json`, not reg thresholds. (2) The `missing ≥3 critical fields` gate at [scoring.js:545](src/engine/scoring.js:545) triggers cap 55 but critical fields include `cooling_type` (mostly collected by now). Re-check whether this gate ever fires under current UX; if it's vestigial, remove. |

### 19. Readiness flag — version stamp

| | |
|---|---|
| **Source** | Results page header at [App.jsx:1713](src/App.jsx:1713): `Methodology: Perennity Bridge v3.1 · April 2026` |
| **Current logic** | Hard-coded in the Results page. |
| **Required per v3.1** | ✅ Matches your prompt's stated vintage. |
| **Status** | ✅ **Aligned** |
| **Gap & fix** | — |

### 20. Framework citation for Activity 8.1 vs 2023/2485

| | |
|---|---|
| **Scope** | All framework references |
| **Current logic** | Only cites `EU Climate Delegated Regulation (EU) 2021/2139, Annex I, Activity 8.1` (correct) **except** the `eu-taxonomy.json` version field says `"DA 2021/2139 (amended 2023)"`. No file cites 2023/2485 by number, but the "amended 2023" wording is misleading. |
| **Required per v3.1** | EU 2023/2485 amended the Environmental Objectives DA (EU 2023/2486), not the Climate DA (2021/2139). Activity 8.1 is in the Climate DA and is unchanged by 2023/2485. |
| **Status** | ⚠️ **Partial** — citation wording only |
| **Gap & fix** | Change `eu-taxonomy.json:version` to `"DA (EU) 2021/2139 — Climate Delegated Act, in force from 2022-01-01"`. Remove the "amended 2023" phrase. |

### 21. Output surface consistency — Applicable Frameworks

| | |
|---|---|
| **Scope** | Results page + PDF + Airtable |
| **Current logic** | Results page ([App.jsx:1496-1516](src/App.jsx:1496)) and PDF ([pdfExport.js:45-60](src/export/pdfExport.js:45)) both derive frameworks from `capitalSource`, using the same mapping. Airtable writes `Applicable Frameworks` from the same function. Excel does NOT include frameworks (should). |
| **Required per v3.1** | Per Fix 3.2 in the prompt, the framework list should be driven by `target_financing_label` (Tab 5) — with a primary + secondary framework structure per label. |
| **Status** | ❌ **Misaligned** (the whole point of Fix 3.2) |
| **Gap & fix** | Implement Fix 3.2 per the label mapping table in the prompt. Update Results, PDF Exec Summary, Excel, Airtable write. Primary/secondary structure. |

### 22. Circular Economy scoring (Objective 4)

| | |
|---|---|
| **Input** | `dnsh_weee_compliance` |
| **Current logic** | Checklist point in `calculateDnshGovernance` (+1 pt). Hard-coded `met: true` in the DNSH gate ([scoring.js:117](src/engine/scoring.js:117)). |
| **Required per v3.1** | WEEE Directive 2012/19/EU. Activity 8.1 DNSH Obj 4 requires e-waste management plan + circular IT asset approach. |
| **Status** | ❌ **Misaligned** (DNSH gate hard-coded true) |
| **Gap & fix** | Change DNSH circular gate at [scoring.js:117](src/engine/scoring.js:117) from `met: true` to `met: !!project.dnsh_weee_compliance`. |

### 23. Pollution Prevention scoring (Objective 5)

| | |
|---|---|
| **Input** | `dnsh_low_gwp_refrigerants`, plus derived backup/onsite logic |
| **Current logic** | Checklist point in `calculateDnshGovernance` (+1 pt). DNSH pollution gate uses backup_power + onsite_generation with the `||` bug. |
| **Required per v3.1** | EU F-Gas Regulation 517/2014 for refrigerants; IED (2010/75/EU) / REACH SVHC exclusion. |
| **Status** | ❌ **Misaligned** (see row 5 — `||` bug) |
| **Gap & fix** | Use `dnsh_low_gwp_refrigerants` as the gate for the pollution DNSH, not `backup_power_type`. The backup/onsite check relates more to air emissions than to pollution DNSH per Activity 8.1; move it to SA scoring or remove. |

### 24. Biodiversity scoring (Objective 6)

| | |
|---|---|
| **Input** | `dnsh_protected_areas` |
| **Current logic** | Checklist point in `calculateDnshGovernance` (+2 pts). DNSH biodiversity gate uses `adaptation_measures_present` — wrong field. |
| **Required per v3.1** | Activity 8.1 DNSH Obj 6: EIA conducted; no siting in Natura 2000 / UNESCO / KBAs / primary forests. |
| **Status** | ❌ **Misaligned** |
| **Gap & fix** | At [scoring.js:116](src/engine/scoring.js:116), change biodiversity DNSH gate from `!!project.adaptation_measures_present` to `!!project.dnsh_protected_areas`. |

### 25. Climate Adaptation (Objective 2)

| | |
|---|---|
| **Input** | `dnsh_climate_vulnerability` + `adaptation_measures_present` + `business_continuity_plan_ready` |
| **Current logic** | DNSH climate gate at [scoring.js:118](src/engine/scoring.js:118) uses `adaptation_measures_present`. Checklist has `dnsh_climate_vulnerability` (+2 pts). |
| **Required per v3.1** | Activity 8.1 DNSH Obj 2: physical climate risk assessment per IPCC scenarios + adaptation plan. |
| **Status** | ⚠️ **Partial** |
| **Gap & fix** | Change the DNSH climate gate to require BOTH `dnsh_climate_vulnerability` (risk assessment conducted) AND `adaptation_measures_present` (plan implemented). Currently only the plan is checked; the risk assessment is only credited via the governance checklist. |

---

## Cross-cutting observations

### A. Framework JSON is the single source of truth AND the AI prompt
`aiAnalysis.js` serialises the raw framework JSON into the Claude system prompt. Every misalignment in the JSON (wrong PUE thresholds, stale citations, missing labels) propagates into the investor-facing AI narrative. Fixing the JSON has outsized impact.

### B. Dead `src/utils/pdfReportGenerator.js`
Same story as `ComplianceAssessmentTool.jsx`. The file is only referenced by the dead `ComplianceAssessmentTool.jsx` ([ComplianceAssessmentTool.jsx imports pdfReportGenerator.js:20ish](src/components/ComplianceAssessmentTool.jsx)). If you approve deleting `ComplianceAssessmentTool.jsx`, also delete `pdfReportGenerator.js`. **Confirm before I delete.**

### C. The phantom fields
Three fields are referenced by the engine but never collected from the user:
1. `is_new_build` — `determineEuTaxonomyAlignment` at [scoring.js:102](src/engine/scoring.js:102) always falls through to existing-DC threshold because this is never truthy.
2. `wildfire_risk_score` — defaults to 20 for every project, silently feeding CSR weatherScore.
3. `tcfd_governance`, `tcfd_strategy` — declared in `tcfd.json` `projectField` refs but never exist on the project object.

All three need either a form input or removal. Probably remove `is_new_build` (use the stage-based heuristic everywhere), add or remove `wildfire_risk_score`, and strip the placeholder `projectField` strings from `tcfd.json`.

### D. CUE — genuine decision needed
Nothing in the repo mentions CUE. If methodology v3.1 mandates it per ISO/IEC 30134-8, we'd surface a derived value (no new user input needed — it's `PUE × gridCarbon`). **Tell me: is CUE in v3.1 scope?**

---

## Priority of fixes

If you approve all findings, roughly ordered by blast radius × effort:

**High impact, low effort**
1. Fix `||` → `&&` in DNSH pollution check ([scoring.js:115](src/engine/scoring.js:115))
2. Fix circular DNSH gate — replace hard-coded `met: true` with `dnsh_weee_compliance`
3. Fix biodiversity DNSH gate — use `dnsh_protected_areas`, not `adaptation_measures_present`
4. Fix `target_financing_label` enum values in `evaluateHardStops`
5. Unify readiness bands between engine and PDF
6. Change `eu-taxonomy.json` version string to remove the "amended 2023" phrase
7. Remove phantom `is_new_build`; use stage heuristic in `determineEuTaxonomyAlignment`

**High impact, medium effort**
8. Add UK SDR Sustainability Mixed Goals label to `uk-sdr.json` + engine
9. Correct `eu-taxonomy.json` PUE thresholds to match v3.1 (1.2/1.3 new, 1.5 existing)
10. Add Art 18 (Minimum Social Safeguards) as a separate gate in `determineEuTaxonomyAlignment`
11. Rewrite `sfdr.json` PAI list to numeric Annex I Table 1 ids
12. Re-center `calculatePueScore` bands on absolute PUE values, not country-target-relative
13. Implement Fix 3.2 (target_financing_label → Applicable Frameworks)

**Medium impact, medium effort**
14. Decide wildfire_risk_score (collect or remove)
15. Remove orphan `getWueMaxStringency` OR document its v3.1 basis
16. Decide CUE

**Low impact, low effort**
17. Cite the 600 gCO₂/kWh grid threshold
18. Strip placeholder `projectField` strings from `tcfd.json`

---

## Decisions requested before Phase 3

For each finding, please indicate ✅ accept the proposed fix / ❌ leave as-is / ✏️ modify:

1. PUE bands — move to absolute-v3.1 bands (re-center away from country target)?
2. `eu-taxonomy.json` — update PUE thresholds (1.3/1.5 per v3.1, or 1.2/1.5 post-2025)?
3. DNSH — fix `||`→`&&`, use correct fields for circular/biodiversity/climate gates?
4. DNSH — add Minimum Social Safeguards (Art 18) as separate gate?
5. UK SDR — add Sustainability Mixed Goals label + naming/anti-greenwashing citation?
6. SFDR PAI — rewrite JSON list to match PDF's numeric PAI mapping?
7. Hard-stop `target_financing_label` enum — update to current dropdown values?
8. Phantom `is_new_build` — remove entirely, use stage heuristic?
9. Phantom `wildfire_risk_score` — add form input OR remove engine reference?
10. `tcfd.json` placeholder projectFields — remove?
11. Readiness bands — unify engine & PDF on the 4-band scheme (75/55/35)?
12. Framework version strings — drop "amended 2023" from `eu-taxonomy.json`?
13. CUE — in v3.1 scope, yes/no?
14. `pdfReportGenerator.js` + `ComplianceAssessmentTool.jsx` — delete both as dead code (already approved in Phase 1 for the latter; confirm pdfReportGenerator too)?

Awaiting your direction before proceeding to Phase 3 fixes.
