# Methodology + judgement-gap audit — engine v0.6.0

**Date:** 2026-06-03
**Engine pin:** `@perennity/engine#v0.6.0` (UK SDR Phase 2 ship; UK SDR Focus/Improvers/Impact
fully scored, 351/351 engine tests passing).
**Scope:** what an acquirer's tech-DD team or an FCA reviewer would probe first.
**Approach:** 7 items, Tier 1 → 3 by acquirer/regulator scrutiny risk. Each item carries a
file:line citation, a 2-3 sentence diagnosis, a 1-line remediation, an effort estimate, and
a recommended owner. Citations are against the engine repo at
`/Users/western/Downloads/Perennity_Bridge_V2/` unless stated otherwise.

---

## TIER 1 — Critical (anyone with regulatory experience will probe these in due diligence)

### 1. Aggregate framework verdict is permanently `not_applicable`

**Citation:** `src/sfdr/orchestration.ts:168-179` (`aggregateProductLabelVerdict`) +
`regulatory-knowledge/frameworks/sfdr/v1/{art-8,art-9}.json` (`verdict_thresholds: { aligned: null, partially_aligned: null, not_aligned: 0 }`)
+ `src/runtime.ts:188` (the runtime call site that uses the aggregate).

**Diagnosis.** Per-criterion scoring is complete and emits real verdicts. But every
framework's `overall_verdict` stays `not_applicable` because weights are `null` and the
calibration commit hasn't shipped. A framework where 7 of 7 criteria are `aligned` still
reports `not_applicable` at the framework level. To a sophisticated reader this looks
indistinguishable from a broken or unrun framework. To an acquirer comparing the engine
to a finished competitor, it reads as "scoring works but doesn't compose into a verdict"
— the most damning critique possible for a scoring engine.

**Remediation (pick one):**
- A. Wire the existing `aggregateProductLabelVerdict` (which already implements severity-rank
  aggregation) into the runtime's framework_result so `overall_verdict` reflects per-criterion
  outcomes. The function is well-tested and methodology.md documents the rule.
- B. If A is too aggressive without a calibration commit, change the PDF + RenderContract to
  surface "Per-criterion verdicts are authoritative; framework-level aggregation
  intentionally deferred pending calibration" in a visible callout on every framework page,
  rather than letting `not_applicable` silently propagate.

**Effort:** ≤1 hour for A; ≤30 min for B (PDF copy change).
**Owner:** Engine team for A (Bolu); app team for B (Dolapo / parallel session).

---

### 2. Free-tier `rationale_text` carries verbatim regulatory citations

**Citation:** `src/renderers/__tests__/snapshot.gate.test.ts:82` (the `ALLOWED_HEATMAP_CELL_KEYS`
allowlist) + `src/sfdr/uk-sdr-scoring.ts:144` (an example UK SDR c1 rationale string).

**Diagnosis.** `rationale_text` is allowlisted into `SnapshotOutput` (the free-tier surface)
explicitly because it explains the verdict in plain language. But there is no test that
walks the contents of `rationale_text` strings to assert they don't carry verbatim
regulation citations, numeric thresholds, or methodology version strings. The UK SDR
scoring functions emit rationale text like "Under PB methodology v3.5, this satisfies the
Sustainability Focus credible-standard requirement (FCA PS23/16 ¶4.23)." That string
includes the regulation name, the paragraph reference, and the methodology version stamp —
all three of which the snapshot allowlist explicitly disallows in dedicated fields, but
they leak via the rationale strings instead. A free user collecting all free-tier
rationale across multiple snapshot runs can reverse-engineer PB's calibration thresholds
and which paragraphs each criterion maps to.

**Remediation:** Extend `snapshot.gate.test.ts` to walk every `rationale_text` value in the
serialised output and assert it does NOT match a disallowed regex (e.g. `/\bv\d+\.\d+\b/`
for methodology version, `/¶\d+\.\d+/` for PS23 paragraph numbers, `/(≤|≥)\s*\d/` for
numeric thresholds). Failing the test should block the build. Separately, audit the
existing rationale strings (~50 across SFDR + UK SDR) and either strip citations from the
free-tier rationale (moving them to paid-tier `evidence_refs`) OR put the citations behind
a paid-tier-only field.

**Effort:** ~1 day. 2-3 hours for the test, 2-3 hours auditing + stripping citations.
**Owner:** Engine team. This is load-bearing for the free/paid line; do it before any
external snapshot is widely shared.

---

### 3. UK SDR cross-framework dependency edge cases untested

**Citation:** `src/sfdr/uk-sdr-scoring.ts:131-180` (`uk_sdr_c1_asset_sustainability_profile`)
and `:773-828` (`uk_sdr_c15_no_significant_harm`). Both criteria carry
`depends_on_framework: ["eu_tax_climate_8_1"]` in their criterion JSONs.

**Diagnosis.** Both criteria handle the case where EU Taxonomy 8.1 was not loaded in this
run (graceful degradation to `insufficient_evidence`). They do NOT explicitly handle the
case where EU Taxonomy 8.1 WAS scored but returned `overall_verdict: "not_applicable"` —
which is the regulatorily correct outcome for a developer who makes no Taxonomy claim
under Art 8 light-green positioning. In that case the cross-framework read succeeds but
the verdict is misleading: c1 cascades a "no claim made" into a "no credible standard
met" finding, and c15 takes the EU Tax DNSH results at face value (which may be sparse or
empty). The bug surface is narrow — most UK SDR engagements will pair with a real EU Tax
8.1 assessment — but the audit failure mode is "engine produced a wrong-looking verdict
because of an undeclared dependency assumption," exactly what a reviewer probes first.

**Remediation:** Add explicit `not_applicable` handling at the top of both `uk_sdr_c1_*`
and `uk_sdr_c15_*` scoring functions. Add 2-4 new test cases in
`src/sfdr/__tests__/uk-sdr-focus.test.ts` and `uk-sdr-impact.test.ts` covering
(a) EU Tax framework absent, (b) EU Tax verdict `not_applicable`, (c) EU Tax DNSH results
empty. Each test should assert the right rationale text.

**Effort:** ~2 hours (small targeted code + 4 new test cases).
**Owner:** Engine team.

---

## TIER 2 — Moderate (mention proactively in IC defence; do not require pre-DD fix)

### 4. PUE aligned-tier gate logic for existing DCs is correct but undocumented

**Citation:** `src/sfdr/art8-scoring.ts:437-460` (`checkPUEAlignedTier`). Methodology v3.5
§F3 documents the intent at `methodology.md` (root of engine repo).

**Diagnosis.** The function deliberately returns `not_applicable` when `!d.new_build` —
existing DCs don't pass through the aligned-tier conservatism gate. This is correct per
v3.5 F3 calibration (existing DCs have a universal ≤1.5 PUE no_harm floor; new builds get
the stricter cool/warm split). However, reading the function in isolation a code reviewer
will not understand why new-build PUE 1.35 fails aligned-tier but existing-DC PUE 1.45
routes through per-PAI eval (which can still reach `aligned`). The split logic is right
but opaque.

**Remediation:** Add a JSDoc block at the function entry explaining the two-path
architecture: "New-build PUE activates aligned-tier conservatism gate (cool ≤1.2 / warm
≤1.3 per F3); existing DCs bypass this gate entirely — their no_harm floor is the
universal ≤1.5 set inside `evalPAI_pue_existing`. Existing-DC PUE failures are caught at
per-PAI evaluation, NOT here. See methodology.md §F3."

**Effort:** ≤30 min (comment only; no code change).
**Owner:** Engine team.

---

### 5. Deferred / "calibration pending" items scattered across docs

**Citation:** `methodology.md` lines 79-80, 238-241, 335-337 (and similar); `CLAUDE.md`
sections "v0.4.0 output contracts" + "v0.5.0-alpha.4" + "v0.6.0".

**Diagnosis.** Several known limitations are documented but scattered: aggregate verdict
calibration deferred (item #1 above), Activity 8.2 scope limitation, IC Defence Pack
`questions[]` empty (engine builder not yet shipped), DNSH Narrative Library inline rather
than templated, weights uniformly null. A reviewer reading methodology.md cannot easily
enumerate these — each is mentioned where it was first deferred, not in one place. This
makes the engine appear to have hidden limitations even though the limitations are
honestly documented in scattered form.

**Remediation:** Add a single "## Known Limitations and Future Work" section at the end of
`methodology.md` enumerating each deferred item with: (a) what will change, (b) target
commit, (c) how existing v0.6.0 verdicts will be affected when the change ships
(retroactive relabelling needed? new test fixtures? etc.). Use forward-compat language:
"v0.6.0 outputs are valid as of date of issue; the aggregation calibration commit will
introduce framework-level verdicts but per-criterion outputs will not change."

**Effort:** ~2 hours (consolidation + writing; no code).
**Owner:** Founder (methodology) or engine team.

---

## TIER 3 — Low priority (document or schedule; not blockers)

### 6. `uk_sdr_mixed_goals` label is an orphan

**Citation:** `src/renderers/filterCells.ts:37` (`SupportedLabel` union member) and `:57`
(`UK_SDR_LABELS` set). App `src/lib/targetLabels.js` line 41 keeps it disabled.

**Diagnosis.** The label is in the engine's `SupportedLabel` type union but the engine has
no `mixed_goals.json` framework JSON, no scoring functions, and no entry in
`BUNDLED_UK_SDR_FRAMEWORKS`. If a user routed an engagement with `target_label:
"uk_sdr_mixed_goals"`, `frameworksForLabel()` would currently throw (the app correctly
treats it as unsupported), but the type union suggests it's a valid label. Dead-letter
type entry.

**Remediation:** Two options:
- A. Comment the entry out in `SupportedLabel` and `UK_SDR_LABELS` with a forward-compat
  note ("Mixed Goals label deferred; no framework JSON or scoring functions exist. Restore
  this entry when multi-label aggregation is in scope.").
- B. Fully implement the Mixed Goals framework (requires multi-label aggregation logic —
  out of v0.6.0 scope).

**Effort:** ≤15 min for A; multi-week for B.
**Owner:** Engine team (or founder if B is roadmap-relevant).

---

### 7. SFDR Art 9 c9 + UK SDR c9 cascade independence

**Citation:** `regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_si_eligibility_evidence_pack.json`
(SFDR Art 9 c9 declares `depends_on: [c8, c4, c2]`); 
`regulatory-knowledge/criteria/uk-sdr-v1/uk_sdr_v1_improvement_proportion_threshold.json`
(UK SDR c9 declares `depends_on: [c5, c6, c7, c8]`).

**Diagnosis.** Both frameworks name a c9 criterion; the names are conceptually distinct
but coincidentally share the index. The orchestrator's `topologicalSort` (in
`src/sfdr/orchestration.ts`) handles each framework's cascade independently — no
cross-framework cascade edge exists. This is the correct architecture but no test exercises
both SFDR Art 9 and UK SDR Improvers together in a single run to assert independence.
A future engagement asking for combined-label certification (e.g., "Art 9 + UK Improvers
combined fund") would surface the lack of an integration test as a methodology gap.

**Remediation:** Add a single end-to-end test fixture (in
`src/sfdr/__tests__/multi-framework.test.ts`) that loads BOTH `sfdr_v1_article_9` and
`uk_sdr_improvers` frameworks in one `DeterministicEngine.run()` call. Assert: (a) no
exception, (b) both frameworks produce sc_results, (c) cascades within each framework
work without leakage. Add a note to methodology.md: "Cascades are intra-framework only.
Combined-label certification across SFDR and UK SDR is not in v0.6.0 scope and would
require a new top-level orchestrator."

**Effort:** ~1 hour (test fixture + 1 paragraph in methodology.md).
**Owner:** Engine team.

---

## Other items noted but not promoted to the top 7

- **PAI 4 always not_applicable for data centres** — this is documented in
  `src/lib/paiDataFile.ts` and the criteria; it is correct (PAI 4 is fossil-fuel sector
  exposure, which DC operators don't have). Not a gap.
- **`weight: null` everywhere** — symptom of item #1; not a separate gap.
- **Snapshot heatmap doesn't show numeric verdicts for product_label cells** — by design
  (free/paid line); not a gap.
- **No PAI CSV export validation tests for empty PAI rows** — minor robustness item; would
  be caught at first malformed engagement.
- **PUE measurement methodology `"other_with_documentation"` accepts any developer-supplied
  methodology with documentation** — by design (operator flexibility); not a gap.

---

## Suggested execution order

If the founder has limited engineering bandwidth to address these, the right sequence is:

1. **Item #1 (aggregate verdict)** — fixes the most damning impression issue. ≤1 hour
   for the engine fix; the PDF copy fallback is even smaller.
2. **Item #2 (rationale_text gate test)** — closes a real leak before any free-tier
   snapshot is shared widely. ~1 day.
3. **Item #5 (Known Limitations section)** — converts "scattered known limits" into
   "honest engineering hygiene." Cheap (~2 hours) but high signal to a sophisticated
   reader.
4. **Item #3 (UK SDR cross-framework edges)** — ~2 hours; closes a subtle but
   reviewer-visible bug surface.
5. **Item #4 (PUE comment)** — 30 minutes whenever you next touch that file.
6. **Items #6, #7** — schedule for v0.6.1 or v0.7.0; document and move on.

Total Tier 1 + #5 effort: roughly 1.5 working days of engineering. Disproportionately high
impact for acquirer-perceived methodology quality relative to the time cost.
