// @ts-check
//
// IntakeWizard regression test — hotfix for the SFDR blank-page crash that
// hit live v0.5.0 paid-flow when a user selected SFDR Article 8/9 with a
// stale saved draft in localStorage.
//
// Root cause: src/components/IntakeWizard.jsx:120 used
// `setForm(draft.wizardData)` which destructively replaced the form state
// with the saved draft. Any user whose saved draft pre-dated the SFDR
// Specifics fields (added 1.5a Phase B-2) had no `sfdr_pai_rows` key in
// their wizardData. After the destructive replace, `form.sfdr_pai_rows`
// was undefined; selecting an SFDR label mounted <SFDRPAITable rows={undefined} />
// which crashed at `rows.find(...)` inside the tbody .map.
//
// Primary fix: changed setForm(draft.wizardData) to a merge:
// `setForm((current) => ({ ...current, ...draft.wizardData }))` — saved
// fields override defaults but missing fields keep defaults.
//
// This regression test reproduces the original crash sequence (seed a
// stale saved draft, render the wizard, switch the label to SFDR Article 9)
// and asserts the SFDR Specifics section now renders with the 10-row PAI
// table instead of crashing.

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { IntakeWizard } from "./IntakeWizard.jsx";
import { DRAFT_SCHEMA_VERSION } from "../hooks/useAssessmentStore.js";

// DRAFT_KEY from src/hooks/useAssessmentStore.js — must match exactly
// (it's a private constant in the store module; mirroring here to seed
// the test fixture without importing private state).
const DRAFT_KEY = "perennity_wizard_draft";

let container = null;

afterEach(() => {
  if (container) {
    container.remove();
    container = null;
  }
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* setup.js polyfill handles this */
  }
});

function mount(component) {
  container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(component);
  });
  return container;
}

function changeSelect(selectEl, value) {
  act(() => {
    // jsdom doesn't fire React's synthetic onChange from .dispatchEvent
    // for inputs cleanly; the simplest path is to set the value and
    // dispatch a native input event, which React captures.
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    ).set;
    nativeInputValueSetter.call(selectEl, value);
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("IntakeWizard — hotfix: stale saved draft + SFDR label select", () => {
  it("does not crash on SFDR Article 9 select when saved draft pre-dates SFDR fields", () => {
    // Seed localStorage with a draft from BEFORE sfdr_pai_rows existed.
    // Pre-1.5a-Phase-B-2 drafts had project_id + facility metadata but
    // no SFDR Specifics fields at all. This is the exact shape that
    // triggered the live v0.5.0 blank page.
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        v: DRAFT_SCHEMA_VERSION,
        wizardData: {
          target_label: "eu_taxonomy_aligned_8_1",
          project_id: "PB-LEGACY-001",
          facility_type: "hyperscale",
          jurisdiction: "DE",
          facility_status: "operational",
          build_completion_year: 2020,
          // Crucially: NO sfdr_pai_rows, NO sfdr_si_objective, NO sfdr_dominance_*.
        },
        savedAt: "2026-05-15T00:00:00Z",
      }),
    );

    const root = mount(<IntakeWizard onSubmit={() => {}} />);

    // The wizard mounts without throwing (would have thrown pre-fix
    // because the SFDR section is gated on target_label === sfdr_*,
    // so initial mount with target_label === eu_taxonomy_aligned_8_1
    // doesn't trigger SFDRPAITable. The crash only fires once the
    // label switches to SFDR).
    const select = root.querySelector('[data-testid="target-label-select"]');
    expect(select).toBeTruthy();

    // Switch to SFDR Article 9 — pre-fix, this dispatched the .find()-on-
    // undefined crash because the saved draft replace had nuked sfdr_pai_rows.
    changeSelect(select, "sfdr_article_9");

    // The SFDR Specifics section now renders with the 10-row PAI table
    const paiTable = root.querySelector('[data-testid="sfdr-pai-table"]');
    expect(paiTable).toBeTruthy();
    const bodyRows = paiTable.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBe(10);
  });

  it("preserves saved-draft values for fields present in the draft", () => {
    // Confirm the merge fix doesn't lose user data — saved field values
    // override defaults, only MISSING fields fall through to defaults.
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        v: DRAFT_SCHEMA_VERSION,
        wizardData: {
          target_label: "eu_taxonomy_aligned_8_1",
          project_id: "PB-WITH-SAVED-PROJECT-ID",
        },
        savedAt: "2026-05-15T00:00:00Z",
      }),
    );
    const root = mount(<IntakeWizard onSubmit={() => {}} />);
    const projectIdInput = root.querySelector('input[placeholder="PB-..."]');
    expect(projectIdInput).toBeTruthy();
    expect(projectIdInput.value).toBe("PB-WITH-SAVED-PROJECT-ID");
  });

  // The wizard auto-saves on mount, so every visitor who ever loaded the page
  // before 20 Sep 2026 has a draft asserting full safeguards compliance and a
  // passing PUE — values they never entered, written by the old defaults.
  // Merging one of those over the swept defaults would restore exactly the
  // flattering state the sweep removed, so an unversioned draft is discarded.
  it("discards a pre-v2 draft rather than restoring the old pre-ticked defaults", () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        // No `v` — this is what every pre-sweep draft looks like.
        wizardData: {
          project_id: "PB-STALE-001",
          annualised_pue: 1.4,
          wue_annualised: 0.3,
          site_water_stress_classification: "Low",
          human_rights_compliance_items: [
            "human_rights_policy_published",
            "due_diligence_process_operational",
            "grievance_mechanism_operational",
            "ilo_core_conventions_compliance",
            "no_ungc_violations_24m",
          ],
        },
        savedAt: "2026-05-15T00:00:00Z",
      }),
    );

    const root = mount(<IntakeWizard onSubmit={() => {}} />);

    // Nothing from the stale draft survives: the project id is back to blank
    // and the PUE box is empty rather than carrying a passing 1.4.
    const projectIdInput = root.querySelector('input[placeholder="PB-..."]');
    expect(projectIdInput.value).toBe("");
    const numbers = [...root.querySelectorAll('input[type="number"]')].map((i) => i.value);
    expect(numbers).not.toContain("1.4");
    expect(numbers).not.toContain("0.3");
  });
});
