# Airtable schema corrections — applied 20 Sep 2026

Changes to the **Airtable base itself** (`appasxX7eC3QsmxeM`), not to the repo. Recorded
here because nothing in the codebase would otherwise show them, and because two of them
document defects worth remembering rather than just fixing.

Eighteen description edits, one option merge and four new fields were applied, each
verified by reading the schema back afterwards. Nothing on the base is outstanding.

None of these edits changes a verdict by itself. They matter because each one was an
instruction an operator follows, and following it produced a wrong engagement — which
*does* change verdicts. Item 1 was live and material.

---

## 1. `SFDR Project PAI Data` — the table description named the wrong eleven PAIs ✅

**This made c10 unwinnable.** The description asked for ten rows covering PAIs 1, 2, 4, 5,
7, 8, 9, 10, 11, 13. The c10 criterion iterates `MATERIAL_PAI_NUMBERS` — 1, 2, **3**, 5,
**6**, 7, 8, 9, 10, 11, 13 — and needs all eleven present, each with a methodology
reference, to return `aligned`.

The list in the description was real, but belonged to something else: it is the engine's
`PAI_ROW_ORDER` from `lib/paiDataFile.ts`, which fixes the row order of the machine-readable
PAI data **file** handed to the FMP. Different artefact, same shape of number, and the two
got crossed at some point.

Followed as written it omitted two PAIs the engine requires and added one it never reads, so
coverage was capped at 9/11 against a threshold of 11. c10 could not reach `aligned` on any
engagement, however complete the developer's evidence actually was.

The new description names the eleven, explains why 3 and 6 are in scope (PAI 3 under PB's
developer-as-investee framing; PAI 6 as material for data centres despite the NACE
ambiguity), says not to create a PAI 4 row, and records the banding thresholds and the
PAI 7 / Key Biodiversity Area hard override — none of which was written down anywhere an
operator would look. `docs/engagement-call-checklist.md` was corrected to match.

## 2. `Target Label` — said UK SDR was unsupported, which had stopped being true ✅

The description ended "UK SDR options visible but not yet supported". Three of the four UK
SDR labels are supported and routed: `uk_sdr_focus`, `uk_sdr_improvers`, `uk_sdr_impact`.
An operator reading it would have declined to scope an engagement we can deliver.

Now states which three are routed, that `uk_sdr_mixed_goals` is deliberately present and
unbuilt (the app refuses it explicitly rather than scoring it against the wrong framework
set), and that leaving the field blank silently defaults the engagement to EU Taxonomy.

## 3. `Leads` — described the client-side PAT architecture that was removed ✅

Said leads were "captured client-side via sendToAirtable()" under a "Phase 1: client-side
PAT" model. The token moved server-side on 18 Sep 2026; the browser now posts to
`api/leads.js`, which holds the PAT and writes by field ID.

Corrected for a reason beyond tidiness: a future reader could have taken the description as
licence to put a credential back into front-end code.

## 4. The twelve legacy checkboxes superseded by the `(Y/N/?)` selects ✅

The eleven `c2_*` checkboxes plus `Climate Risk Assessment Completed`. Each tri-state select
already said which checkbox it replaced; the checkboxes said nothing back, so an operator
saw two plausible columns for the same question and no indication which to use. A tick on
the old checkbox is still read as `Yes`, so the mistake was quiet.

All twelve now open with `SUPERSEDED (20 Sep 2026)`, name their successor, and explain that
the checkbox is still read when the select is blank but can never record a definite `No`.

Two of them carried a claim that had become actively wrong. `c2_remuneration_policy_published`
said "Unchecked forces Fail on this domain" and `c2_tax_policy_published` said "Unchecked
forces Fail". That was the BUG-01 defect, not the intended rule — an unticked box now means
not answered, and the domain returns insufficient evidence. Both now say so.

---

## 5. `uk_sdr_kpis_committed` — the duplicate `pue` option ✅

Done in the Airtable field editor, since the REST API cannot edit select choices.

The field carried six options: the four real KPIs, a **second** option also named `pue`,
and one with an **empty name**. Scoring dedupes through a Set so no verdict was ever
corrupted, but an operator could tick the second `pue` believing it a fourth KPI and score
3/4.

This had sat open because earlier notes recorded the two `pue` options as
indistinguishable from outside the Airtable UI — true of the data API, which returns option
names rather than IDs, but not of filtering by choice ID. That settled it:

| Option | Choice ID | Records | Action |
|---|---|---|---|
| `pue` (blue) | `selH8zFMULcht5lGB` | 0 | deleted |
| *(empty name)* (orange) | `selBO9adKfhjW5641` | 0 | deleted |
| `pue` (yellow) | `selLUzgvuE0ub27HG` | 7 | kept |

Verified after the edit: four options remain, and the surviving `pue` still holds its 7
records. Nothing was lost.

**Worth remembering if this shape recurs.** The option that mattered was the *second*
duplicate, not the first. Deleting by position — the intuitive move, and what the old note
would have led someone to do — would have stripped `pue` from 7 live engagements and moved
their UK SDR verdicts, because deleting a select option removes it from every record using
it. The general lesson is the one in CLAUDE.md: identity over position, including when the
identities are invisible in the tool you happen to be looking through.

---

## 6. `Signatory Signature Block URI` — marked as no longer read ✅

Added 20 Sep 2026, after the decision to sign reports by hand.

The app stopped reading this column: there is no signature asset, so nothing consumes it,
and a field read but never used is the shape CLAUDE.md rule 4 warns about. The description
now says it is ignored and should be left blank, and that re-enabling a digital signing
path is a new feature rather than a switch to flip back on.

The column is kept rather than deleted so anything already typed into it is not destroyed.
`Signatory Name` and `Signatory Title` remain live overrides.

---

## 7. Four new fields, replacing values the app was inventing ✅

Added 20 Sep 2026 as part of retiring the paid-path fabrications. The SFDR adapter used to
send the engine constants that no operator had supplied, two of which reach a verdict.

| Field | Type | Replaces |
|---|---|---|
| `c9 Operational doc age (months)` | number | `operational_doc_age_months: 6` |
| `c9 Design stage doc age (months)` | number | — (new; the 24-month pre-operational path) |
| `c9 Material qualifications present (Y/N/?)` | Yes/No/Unknown | `material_qualifications_present: false` |
| `c10 Data recency (months)` | number | `data_recency_months: 6` |

All four are read and omitted when blank. Two consequences worth knowing:

- **Leaving both c9 doc ages blank means c9 cannot reach aligned.** The engine's recency
  gate requires at least one to be present and within threshold, so omitting is not
  neutral here. That is deliberate: an evidence pack whose age nobody has established
  should not clear a recency gate.
- **`c10 Data recency` blank is neutral** — the engine treats an absent value as no
  recency concern. The hardcoded 6 was not moving a verdict on its own; what it did was
  submit a twenty-month-old dataset as a six-month-old one.

`c9 Material qualifications present` is registered in `TRI_STATE_FIELDS` and in the
committed schema snapshot, so the parity test covers its option names.

Rescored all 15 live engagements before and after: **no verdict moved.** Both Art 9
engagements are already `not_aligned` on c9 through the Art 2(17) cascade, which
short-circuits before the recency gate is evaluated — so the fabrications were latent
rather than live, the same shape as the defects in the first half of the plan.

---

## One thing this surfaced, which is data entry rather than schema

The `SFDR Project PAI Data` table holds 20 rows: two engagements × ten PAIs, and those ten
are the **old** list — PAI 4 present, PAIs 3 and 6 absent. So both engagements that have
project PAI data today were populated against the instruction corrected in item 1, and
currently score c10 at 9/11, which caps them at `partially_aligned`.

Fixing that is not a schema change. Each of the two engagements needs a PAI 3 row and a
PAI 6 row added, with a value and a methodology reference; the existing PAI 4 rows are
inert and can be left or deleted. Until then c10 cannot reach `aligned` on either, for the
reason the old description created rather than anything about the projects.

---

## Also still needed on the PAT

The `schema.bases:read` scope. Without it 35 tests skip — the half of
`airtableSchemaParity.test.js` that compares the code's expected option names against the
live base, which is what would catch an operator renaming an option. The half that checks
the contract against the engine's own constants runs today.

(The schema reads and writes above were made through the Airtable connector, which
authenticates separately from the app's PAT. The app itself still cannot see the schema.)
