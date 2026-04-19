// ============================================================
// FIELD REGISTRY — single source of truth for required fields
// per wizard tab. Consumed by the Review tab to compute accurate
// completion percentages, and by validateWizardStep for wizard
// gating. Do not duplicate this list anywhere else.
// ============================================================

/**
 * Per-tab required-field registry.
 *
 * `key`    — matches the state key in INITIAL_PROJECT (src/App.jsx).
 * `label`  — user-facing label (kept in sync with the <FormField>).
 * `type`   — one of "string", "number", "boolean". Drives the
 *            `isFilled` predicate:
 *              - string  → non-empty, non-null, non-undefined
 *              - number  → numeric, not NaN (zero counts as filled)
 *              - boolean → non-null, non-undefined (false counts as filled —
 *                          it is a valid answer to a yes/no question)
 *
 * Tabs with zero required fields (3 Water & Resources, 4 Site & Climate,
 * 5 Sustainability) are intentionally empty per the approved scope; their
 * Review card shows a ✓ "no action required" indicator.
 */
export const REQUIRED_FIELDS_BY_TAB = {
  0: {
    step: 0,
    name: 'Project Basics',
    fields: [
      { key: 'project_name',         label: 'Project Name',       type: 'string' },
      { key: 'projectRegionGroup',   label: 'Region',             type: 'string' },
      { key: 'country',              label: 'Country',            type: 'string' },
      { key: 'development_stage',    label: 'Development Stage',  type: 'string' },
    ],
  },
  1: {
    step: 1,
    name: 'Technical Specs',
    fields: [
      { key: 'planned_capacity_mw',  label: 'Planned Capacity (MW)', type: 'number' },
      { key: 'pue',                  label: 'PUE',                   type: 'number' },
      { key: 'cooling_type',         label: 'Cooling Type',          type: 'string' },
      { key: 'backup_power_type',    label: 'Backup Power Type',     type: 'string' },
    ],
  },
  2: {
    step: 2,
    name: 'Energy Profile',
    fields: [
      { key: 'grid_connection_status',       label: 'Grid Connection Status',  type: 'string' },
      { key: 'renewable_energy_share_pct',   label: 'Renewable Energy Share (%)', type: 'number' },
      { key: 'renewable_energy_source',      label: 'Renewable Energy Source', type: 'string' },
    ],
  },
  3: {
    step: 3,
    name: 'Water & Resources',
    fields: [],
  },
  4: {
    step: 4,
    name: 'Site & Climate',
    fields: [],
  },
  5: {
    step: 5,
    name: 'Sustainability',
    fields: [],
  },
  6: {
    step: 6,
    name: 'Delivery Readiness',
    fields: [
      { key: 'financing_strategy_defined',   label: 'Financing Strategy Defined?', type: 'boolean' },
    ],
  },
};

/** Flat array of all required-field keys. */
export const ALL_REQUIRED_FIELD_KEYS = Object.values(REQUIRED_FIELDS_BY_TAB)
  .flatMap(tab => tab.fields.map(f => f.key));

/**
 * Type-aware "filled" predicate. Zero is a valid filled value for numeric
 * fields; false is a valid filled value for boolean fields.
 */
export function isFieldFilled(value, type) {
  if (value === null || value === undefined) return false;
  if (type === 'number') {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n);
  }
  if (type === 'boolean') {
    return typeof value === 'boolean';
  }
  // string
  return value !== '';
}

/**
 * Returns the completion percentage for a given tab, rounded to nearest
 * integer. A tab with zero required fields returns 100 (nothing to fill).
 */
export function getTabCompletionPct(tabIndex, projectDraft) {
  const tab = REQUIRED_FIELDS_BY_TAB[tabIndex];
  if (!tab || tab.fields.length === 0) return 100;
  const filled = tab.fields.filter(f => isFieldFilled(projectDraft[f.key], f.type)).length;
  return Math.round((filled / tab.fields.length) * 100);
}

/**
 * Returns a per-field filled status for a given tab — used by any UI
 * that wants to show which specific required fields are still missing.
 */
export function getTabFieldStatus(tabIndex, projectDraft) {
  const tab = REQUIRED_FIELDS_BY_TAB[tabIndex];
  if (!tab) return [];
  return tab.fields.map(f => ({
    ...f,
    filled: isFieldFilled(projectDraft[f.key], f.type),
  }));
}

/**
 * Returns the list of required fields still unfilled across the entire
 * registry. Each entry carries { step, name, key, label } so the caller
 * can point the user at the owning tab. Used by the Review tab's Submit
 * gate so a user cannot submit with required fields blank.
 */
export function getAllMissingRequiredFields(projectDraft) {
  return Object.values(REQUIRED_FIELDS_BY_TAB).flatMap(tab =>
    tab.fields
      .filter(f => !isFieldFilled(projectDraft[f.key], f.type))
      .map(f => ({ step: tab.step, tabName: tab.name, key: f.key, label: f.label }))
  );
}
