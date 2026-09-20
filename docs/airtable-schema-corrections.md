# Airtable schema corrections — applied 20 Sep 2026

Changes to the **Airtable base itself** (`appasxX7eC3QsmxeM`), not to the repo. Recorded
here because nothing in the codebase would otherwise show them, and because two of them
document defects worth remembering rather than just fixing.

Sixteen description edits were applied and verified by reading the schema back. One item
remains, and it needs a human in the Airtable editor — see the last section.

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

## Still outstanding — `uk_sdr_kpis_committed`, needs the Airtable editor

The REST API cannot edit select choices, so this one cannot be scripted. It is the last
schema defect on the base.

The field has six options: the four real KPIs, a **second** option also named `pue`, and one
with an **empty name**. Scoring dedupes through a Set so no verdict is corrupted today, but
an operator can tick the second `pue` believing it a fourth KPI and score 3/4.

Earlier notes said the duplicates were indistinguishable from outside the Airtable UI,
because the data API returns option names rather than IDs. That is true of the data API but
not of filtering by choice ID, which settles it. Checked 20 Sep 2026:

| Option | Choice ID | Records | Action |
|---|---|---|---|
| `pue` (blue) | `selH8zFMULcht5lGB` | 0 | **delete** |
| *(empty name)* (orange) | `selBO9adKfhjW5641` | 0 | **delete** |
| `pue` (yellow) | `selLUzgvuE0ub27HG` | 7 | **keep** |

Both strays are unused, so the merge costs nothing.

**The trap:** the surviving option is the *second* `pue` in the list. Deleting the duplicate
by position — the intuitive move — strips `pue` from 7 live engagements and moves their UK
SDR verdicts, because deleting a select option removes it from every record using it. Delete
by colour as above, and re-run the counts first if time has passed.

The field's own Airtable description now carries this table, so whoever does the merge sees
it without needing this file.

---

## Also still needed on the PAT

The `schema.bases:read` scope. Without it 35 tests skip — the half of
`airtableSchemaParity.test.js` that compares the code's expected option names against the
live base, which is what would catch an operator renaming an option. The half that checks
the contract against the engine's own constants runs today.

(The schema reads and writes above were made through the Airtable connector, which
authenticates separately from the app's PAT. The app itself still cannot see the schema.)
