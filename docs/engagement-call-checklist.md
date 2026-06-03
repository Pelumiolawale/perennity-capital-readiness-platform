# Engagement-call checklist — Dolapo

A question-by-question crib sheet for engagement intake calls. Each question maps to the Airtable column / linked child table it fills.

The Engagements table (`tblRnd8BdQ65kuaej` in base `appasxX7eC3QsmxeM`) drives every paid Report. After the call, populate the relevant columns and any child-table rows; the SPA's `/assessment/report?ref=<UUID>` route reads the engagement record and runs the engine.

## Field-population rule of thumb

- **Always populate** sections 1 + 2 (engagement admin + project basics).
- **If `target_label` = `eu_taxonomy_aligned_8_1`** — also populate section 3 (EU Tax 8.1 inputs) + section 4 (minimum safeguards).
- **If `target_label` = `sfdr_article_8`** — populate sections 1, 2, 3, 4, plus 5 (SFDR project-level) and 6 (SFDR entity-level discrete columns + child rows). c1 (ES Characteristics) lives in the linked child table.
- **If `target_label` = `sfdr_article_9`** — populate sections 1-6 PLUS section 7 (SFDR Article 9 project-level — SI objective, dominance, PAI data).

An empty field is interpreted by the engine as "we don't know yet" — it does NOT default to false / pass. The paid Report PDF will surface the gap honestly.

---

## Section 1 — Engagement admin (every engagement)

| Question | Airtable column |
|---|---|
| "Confirm the engagement reference UUID you sent" | `Engagement Reference` (auto-set when Dolapo creates the row) |
| "What's the client's legal entity name?" | `Client Name` |
| "What's the project name?" | `Project Name` |
| "Project ID for internal reference?" | `Project ID` |
| "Is the engagement letter signed? Date?" | `Engagement Letter Signed` (checkbox), `Engagement Letter Date` |
| "Who signs the report on behalf of Perennity? Title? Path to signature block?" | `Signatory Name`, `Signatory Title`, `Signatory Signature Block URI` (override fields — defaults to app config if blank) |
| "Which regulatory framework should we report against?" | `Target Label` (single-select: `eu_taxonomy_aligned_8_1` / `sfdr_article_8` / `sfdr_article_9`) |

## Section 2 — Project basics (every engagement)

| Question | Airtable column |
|---|---|
| "What type of facility? (hyperscale / colo / edge)" | `Facility Type` |
| "Country?" | `Jurisdiction` (ISO 3166-1 alpha-2: DE / AE / GB / etc.) |
| "Current build status? (design / under_construction / operational)" | `Facility Status` |
| "Expected commissioning / build completion year?" | `Build Completion Year` |
| "Pipe-separate the evidence documents you'll send me — one per line: id | type | URI | uploaded date | sha256" | `Evidence Documents` |

## Section 3 — EU Taxonomy 8.1 inputs (EU Tax label + cross-framework dep for SFDR labels)

| Question | Airtable column |
|---|---|
| "What's the annualised PUE for the facility?" | `Annualised PUE` |
| "Which measurement methodology? (EN 50600-4-2 / ISO IEC 30134-2 / other)" | `PUE Measurement Methodology Declared` |
| "Which category? (1 / 2 / 3)" | `PUE Measurement Category` |
| "Is the measurement boundary documented?" | `PUE Measurement Boundary Documented` (checkbox) |
| "Reporting basis? (annualised / design_point_only)" | `PUE Reporting Basis` |
| "What's the WUE? Site water stress band? (Low / Low-Medium / Medium-High / High / Extremely High)" | `WUE Annualised`, `Site Water Stress Classification` |
| "Is the climate risk assessment completed? Methodology?" | `Climate Risk Assessment Completed`, `Climate Risk Assessment Methodology` |
| "Last independent audit date?" | `Last Independent Audit Date` |
| "List the EU JRC ECoCC practices implemented" | `ECoCC Practices Implemented (JSON)` — paste a JSON array per the v14 2024 schema |
| "Which circular economy compliance items?" | `Circular Economy Compliance Items` — multi-select; need all 4 (`ecodesign_2009_125`, `rohs_2011_65`, `waste_management_plan`, `weee_endoflife_2012_19`) for c4 DNSH circular economy pass |

## Section 4 — Minimum safeguards (Article 18)

| Question | Airtable column |
|---|---|
| "Which human-rights items? (multi-select)" | `Human Rights Compliance Items` — pre-checked items are correct unless you UNCHECK them |
| "Which bribery & corruption items?" | `Bribery Corruption Compliance Items` |
| "Which tax governance items?" | `Taxation Compliance Items` |
| "Which fair competition items?" | `Fair Competition Compliance Items` |

## Section 5 — SFDR project-level (Art 8 and Art 9 labels)

This is where the c1 ES Characteristics child table comes in, plus c6 taxonomy claim.

### c1 ES Characteristics (linked child table — "SFDR ES Characteristics")

For **aligned**, need 3+ rows, each with quantified indicator (metric + target_value + target_year), 2+ in a sector-material category.

| Question (ask 3+ times per engagement) | Child-table field |
|---|---|
| "Name one named environmental or social characteristic the project promotes — short description?" | `name` |
| "What's the metric for that characteristic? (e.g. 'PUE', 'WUE', 'renewable_share_pct')" | `metric` |
| "What's the target value?" | `target_value` |
| "What's the target year?" | `target_year` |
| "Which sector-material category does this belong to? (energy_efficiency / water_stewardship / land_use_biodiversity / community_local_impact)" | `category` |
| "Public source URL — disclosure document, press release, etc.?" | `public_source` |

Repeat at least 3 times per engagement to reach c1 aligned. Suggest opening the table grouped by engagement.

### c6 Taxonomy alignment disclosure (discrete columns on Engagements)

| Question | Airtable column |
|---|---|
| "Is the developer making a Taxonomy alignment claim?" | `c6_taxonomy_claim_made` (checkbox — MASTER GATE) |
| "If yes: claimed alignment %?" | `c6_claimed_percentage` |
| "Methodology basis? (capex / opex / revenue)" | `c6_methodology` |
| "Minimum safeguards attestation made?" | `c6_minimum_safeguards_attestation` |
| "Publication date of the claim?" | `c6_published_date` |
| "Six-objective breakdown — % attributed to each: climate mitigation / climate adaptation / water / circular economy / pollution / biodiversity" | `c6_breakdown_*_pct` (6 columns) |

If the developer is **NOT** making a Taxonomy claim (the common Article 8 light-green case), leave `c6_taxonomy_claim_made` unchecked. c6 returns `not_applicable` with the regulatorily-correct "no Taxonomy claim is permitted" rationale.

## Section 6 — SFDR entity-level (Art 8 and Art 9 labels)

These are the four entity-axis criteria that historically scored as `insufficient_evidence`. Discrete columns now, no JSON.

### c2 Good governance — discrete columns

Domain A (board structure):

| Question | Column |
|---|---|
| "How many independent non-executive directors?" | `c2_independent_ned_count` |
| "Are board terms of reference documented?" | `c2_terms_of_reference_documented` |
| "CEO/Chair separated, OR lead independent director designated? (either is fine)" | `c2_ceo_chair_separated` AND/OR `c2_lead_independent_director_designated` |
| "Is the executive committee publicly disclosed?" | `c2_executive_committee_published` |

Domain B (employee relations):

| Question | Column |
|---|---|
| "Any UNGC violations in the last 5 years?" | `c2_ungc_violations_5yr_count` (>0 forces Fail) |
| "Is a UNGP-aligned policy published?" | `c2_ungp_aligned_policy_published` |
| "Grievance mechanism documented?" | `c2_grievance_mechanism_documented` |
| "Labour law compliance attested?" | `c2_labour_law_compliance_attested` |

Domain C (remuneration):

| Question | Column |
|---|---|
| "Remuneration policy published?" | `c2_remuneration_policy_published` |
| "CEO-to-median pay ratio disclosed?" | `c2_ceo_to_median_ratio_disclosed` |
| "What's the ratio value? (>300 forces Fail)" | `c2_ceo_to_median_ratio_value` |
| "ESG-linked variable pay?" | `c2_esg_linked_variable_pay` |

Domain D (tax compliance):

| Question | Column |
|---|---|
| "Tax policy published?" | `c2_tax_policy_published` |
| "Which jurisdictions does the entity operate in? (comma-separated ISO codes)" | `c2_tax_jurisdictions_used` (no EU Annex I jurisdictions) |
| "Country-by-country reporting jurisdiction count?" | `c2_cbcr_jurisdiction_count` (<3 caps at Partial) |
| "Largest unresolved tax dispute in EUR?" | `c2_unresolved_tax_disputes_eur_max` (>=10M forces Fail) |

### c3 PAI consideration policy

| Question | Column / Child table |
|---|---|
| "URL of the entity's PAI consideration statement?" | `c3_statement_url` |
| "Publication date?" | `c3_statement_published_date` (<=365 days for aligned) |
| "For each of the 11 material PAIs (1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 13) — data disclosed? target disclosed? mitigation documented?" | Create 11 rows in the "**SFDR PAI Coverage**" linked child table, one per PAI |

For aligned: 9+ PAIs with all three booleans = true.

### c5 Pre-contractual disclosure

| Question | Child table |
|---|---|
| "For each of the 9 Annex II elements (1, 2, 3, 4, 5, 6, 7, 9, 10): covered_specific / covered_generic / absent?" | Create 9 rows in "**SFDR Annex II Coverage**" |
| "Element 4 (PAI) — which named framework?" | `named_framework` on the element-4 row (gri / tcfd / ifrs_s1 / ifrs_s2 / efrag_esrs / cdp) |
| "Element 6 (Taxonomy) — which named framework?" | `named_framework` on element-6 |

For aligned: 7+ elements `covered_specific`, named framework on els 4 and 6, element 5 not absent.

### c7 Periodic reporting

| Question | Column / Child table |
|---|---|
| "Operational or pre-operational?" | `c7_operational_status` |
| "If operational, commissioning date?" | `c7_commissioning_date` (>=18 months for operational scoring) |
| "Does the reporting framework commitment specify indicators? Annual cadence? Assurance?" | `c7_specifies_indicators`, `c7_specifies_annual_cadence`, `c7_specifies_assurance` |
| "Which named standard?" | `c7_reporting_named_standard` |
| **If operational:** "Annual project reports — for each: year, URL, indicators, named standard?" | Rows in "**SFDR Project Reports**" |
| **If pre-operational:** "Annual parent-portfolio reports — same shape" | Rows in "**SFDR Parent Portfolio Reports**" |

For aligned (pre-op path): all 3 specifiers + named standard + 2+ consecutive parent-portfolio years.
For aligned (op path): 2+ consecutive project-report years + named standard + indicators.

## Section 7 — SFDR Article 9-specific (only when target_label = sfdr_article_9)

This is the c8/c9/c10 Art 9 machinery on top of the Art 8 baseline (sections 1-6).

### c8 Sustainable investment objective

| Question | Airtable column |
|---|---|
| "What's the sustainable investment objective in one sentence?" | `SFDR SI Objective` |
| "Category: Environmental / Social / Mixed?" | `SFDR SI Objective Category` |
| "Three dominance test questions: (a) is the SI objective named in the investment memorandum? (b) does the project's economic rationale materially depend on the SI contribution? (c) does marketing lead with the SI objective?" | `SFDR Dominance Test` (JSON: `{"named_in_investment_memorandum": true, "economic_rationale_depends_on_si": true, "marketing_leads_with_si": true}`) |

For aligned: all three dominance booleans true, plus quantified indicators (currently bundled with sfdr_si_objective text — future Airtable extension may surface as separate fields).

### c9 SI-eligibility evidence pack

| Question | Airtable column |
|---|---|
| "What's the assurance tier of the evidence pack?" | `SFDR Assurance Tier` (single-select: `reasonable_big4` / `limited_big4` / `limited_partial` / `management_only`) |

For aligned (under the v3.5 four-tier hierarchy): Tier 1 (`reasonable_big4`) OR Tier 2 (`limited_big4`) with no material qualifications, alongside c2/c4/c8 not_aligned (Art 2(17) gates).

### c10 Project PAI data provision

| Question | Child table |
|---|---|
| "For each of the 10 material PAIs (1, 2, 4, 5, 7, 8, 9, 10, 11, 13): value? unit? verifier identity? assurance status?" | Create 10 rows in "**SFDR Project PAI Data**" |
| "PAI 4 (fossil fuels) is always `not_applicable` for data centres — populate the applicability + rationale" | `applicability: not_applicable`, `applicability_rationale: "Data-centre infrastructure does not fall within the fossil-fuel sector definition per Annex I Table 1."` |

For aligned: all 10 PAIs evidenced, ≥9 third-party-verified when c3 entity policy is partial / weaker.

## Engine determinism note

The engine produces the same verdicts for the same inputs on every run. If a verdict surprises you on the rendered report, the cause is in the engagement's input data — not stochastic. Trace back to the Airtable column the engine read, fix the value there, and the next render will reflect the change.

## Reference — recognised single-select values (must match verbatim)

- **Named reporting standards** (lowercase): `gri`, `tcfd`, `ifrs_s1`, `ifrs_s2`, `efrag_esrs`, `cdp`
- **Annex II coverage**: `covered_specific`, `covered_generic`, `absent`
- **c6 methodology**: `capex`, `opex`, `revenue`
- **c7 operational status**: `operational`, `pre_operational`
- **c1 sector-material category**: `energy_efficiency`, `water_stewardship`, `land_use_biodiversity`, `community_local_impact`
- **SFDR Assurance Tier**: `reasonable_big4`, `limited_big4`, `limited_partial`, `management_only`
- **Project PAI Data assurance_status**: `Third-party assured`, `Management attested`, `Unverified`, `Not applicable`
- **Project PAI Data applicability**: `applicable`, `not_applicable`

Typo here = engine reads "missing" and surfaces insufficient_evidence. The single-select dropdowns enforce the constraint where possible.
