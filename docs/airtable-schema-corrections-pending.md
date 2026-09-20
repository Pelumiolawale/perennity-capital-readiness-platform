# Airtable schema corrections still to be applied by hand

Everything here is a change to the **Airtable base itself** (`appasxX7eC3QsmxeM`), not to
the repo. None of it can be done from the app: the PAT the app uses has no
`schema.bases:write` scope, and the assistant's connector is not permitted to write to a
shared base. Each item below gives the exact replacement text, so applying it is a copy
and paste in the Airtable field/table editor.

Compiled 20 Sep 2026. Everything listed was verified against the live schema on that date.

None of these change a verdict on their own. They matter because each one is an
instruction an operator follows, and following it produces a wrong engagement — which
*does* change verdicts. Item 1 is the serious one.

---

## 1. `SFDR Project PAI Data` — table description names the wrong eleven PAIs

**Severity: this makes c10 unwinnable.** The description asks for ten rows covering PAIs
1, 2, 4, 5, 7, 8, 9, 10, 11, 13. The c10 criterion iterates `MATERIAL_PAI_NUMBERS` — 1, 2,
**3**, 5, **6**, 7, 8, 9, 10, 11, 13 — and needs all eleven present, each with a
methodology reference, to return `aligned`. The list in the description is the engine's
`PAI_ROW_ORDER` from `lib/paiDataFile.ts`, which governs the row order of the
machine-readable PAI data **file** handed to the FMP. Different artefact, same shape of
number, and the two got crossed.

Followed as written it omits two PAIs the engine requires and adds one it never reads, so
coverage is capped at 9/11 and the criterion can never exceed `partially_aligned` however
complete the developer's evidence actually is.

Table: `SFDR Project PAI Data` (`tblLF40OS1rLZ7Dgj`). Replace the description with:

> SFDR c10 (Art 9 only) — project-level PAI data per Annex I Table 1. Linked child of
> Engagements. Replaces the legacy sfdr_pai_data JSON blob.
>
> CREATE 11 ROWS, ONE PER MATERIAL PAI: 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 13.
>
> Corrected 20 Sep 2026. This previously said "10 rows expected: PAIs 1, 2, 4, 5, 7, 8, 9,
> 10, 11, 13" and that PAI 4 is always not_applicable. That list is the engine's
> PAI_ROW_ORDER (lib/paiDataFile.ts), which fixes the row order of the machine-readable
> PAI data FILE — a different artefact. c10 iterates MATERIAL_PAI_NUMBERS, the same 11
> PAIs the SFDR PAI Coverage table uses for c3. The old list cost two PAIs the engine
> requires (3 and 6) and added one it never reads (4), capping coverage at 9/11 so that
> aligned was unreachable.
>
> PAI 3 is scoped under PB's developer-as-investee framing: the developer's own GHG
> intensity per unit revenue or per unit IT load. PAI 6 is treated as material for data
> centres despite NACE classification ambiguity. Both per
> regulatory-knowledge/constants/sfdr_v1_material_pais_data_centre.json.
>
> Do not create a PAI 4 row. PAI 4 is not in the material list, so c10 never looks for it.
> The applicability field remains for genuinely inapplicable indicators, but no material
> PAI is not_applicable by default — do not mark one without a rationale.

`docs/engagement-call-checklist.md` has already been corrected to match.

---

## 2. `Target Label` — says UK SDR is unsupported, which stopped being true

Field: `Target Label` (`fldDYxT0PxmhhJrsW`) on `Engagements` (`tblRnd8BdQ65kuaej`).

The description ends "UK SDR options visible but not yet supported." Three of the four UK
SDR labels are supported and routed: `uk_sdr_focus`, `uk_sdr_improvers`, `uk_sdr_impact`.
Only `uk_sdr_mixed_goals` is unbuilt, and the app refuses it explicitly. An operator
reading this today will decline to scope a UK SDR engagement we can in fact deliver.

Replace the last sentence with:

> uk_sdr_focus, uk_sdr_improvers and uk_sdr_impact are supported and routed. uk_sdr_mixed_goals
> is deliberately present but unrouted — the report refuses it with an explicit message
> rather than scoring it against the wrong framework. Do not select it.

---

## 3. `Leads` — describes the client-side PAT architecture that was removed

Table: `Leads` (`tbl3KXEJJ7P4dxr6q`).

Two claims in the description are no longer true. It says leads are "Captured client-side
via sendToAirtable() (see src/components/LeadCaptureModal.jsx)" and that this is "Phase 1:
client-side PAT". The token moved server-side (18 Sep 2026): the browser now posts to
`api/leads.js`, which holds the PAT and writes by field ID. Nothing ships a credential to
the client any more.

This one is worth correcting for a reason beyond tidiness — a future reader could take the
description as licence to put the PAT back in front end code.

Replace the two sentences with:

> Captured by the browser posting to api/leads.js, which holds the Airtable PAT
> server-side and writes by field ID. The PAT is never sent to the client — it moved
> server-side on 18 Sep 2026. A hidden honeypot field (name='website') is the only spam
> guard; a tripped submission still lands, flagged, so the guard can be seen working.

---

## 4. The twelve legacy checkboxes superseded by the `(Y/N/?)` selects

Fields on `Engagements`: the eleven `c2_*` checkboxes, plus `Climate Risk Assessment
Completed` (`fld8T86YqHN3y0bMZ`).

Each tri-state select says which checkbox it replaces. The checkboxes say nothing back, so
an operator working across the row sees two plausible columns for the same question and
no indication which one to use. A tick on the old checkbox is still read as `Yes`, so the
mistake is quiet — but a checkbox can never record a definite `No`, which is the entire
reason the selects exist.

Append to each of the twelve descriptions:

> SUPERSEDED — use the "… (Y/N/?)" single-select instead. This checkbox is still read when
> the select is blank (ticked = Yes, unticked = not answered), so existing records keep
> working, but it cannot record a definite No. Do not enter new data here.

---

## 5. `uk_sdr_kpis_committed` — duplicate option (unchanged, still open)

Already recorded as a `KNOWN_GAPS` entry in `src/lib/airtableSchemaContract.js`, repeated
here so this file is the single list of hand-work outstanding on the base.

The field has two options named `pue` and one with an empty name. Scoring dedupes through
a Set, so no verdict is corrupted, but an operator can tick the second `pue` believing it
a fourth KPI and score 3/4. It has to be merged in the Airtable editor: deleting a select
option strips it from every record using it, and the data API returns option names rather
than IDs, so the duplicates are indistinguishable from outside the UI. The editor shows
usage counts; merge into the one that is in use.

---

## Also still needed on the PAT

The `schema.bases:read` scope. Without it 35 tests skip — the half of
`airtableSchemaParity.test.js` that compares the code's expected option names against the
live base, which is what would catch an operator renaming an option. The half that checks
the contract against the engine's own constants runs today.
