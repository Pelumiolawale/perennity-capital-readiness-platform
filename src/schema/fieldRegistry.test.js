import { describe, expect, it } from 'vitest';
import {
  REQUIRED_FIELDS_BY_TAB,
  ALL_REQUIRED_FIELD_KEYS,
  isFieldFilled,
  getTabCompletionPct,
  getTabFieldStatus,
  getAllMissingRequiredFields,
} from './fieldRegistry.js';

describe('isFieldFilled — type-aware predicate', () => {
  it('numeric zero is filled', () => {
    expect(isFieldFilled(0, 'number')).toBe(true);
    expect(isFieldFilled('0', 'number')).toBe(true);
  });

  it('boolean false is filled (valid answer to a yes/no question)', () => {
    expect(isFieldFilled(false, 'boolean')).toBe(true);
    expect(isFieldFilled(true, 'boolean')).toBe(true);
  });

  it('empty string is not filled', () => {
    expect(isFieldFilled('', 'string')).toBe(false);
  });

  it('null and undefined are never filled', () => {
    expect(isFieldFilled(null, 'string')).toBe(false);
    expect(isFieldFilled(undefined, 'number')).toBe(false);
    expect(isFieldFilled(null, 'boolean')).toBe(false);
  });

  it('NaN numeric string is not filled', () => {
    expect(isFieldFilled('abc', 'number')).toBe(false);
    expect(isFieldFilled(NaN, 'number')).toBe(false);
  });

  it('a non-boolean value passed for a boolean type is not filled', () => {
    expect(isFieldFilled('true', 'boolean')).toBe(false);
    expect(isFieldFilled(0, 'boolean')).toBe(false);
  });
});

describe('getTabCompletionPct', () => {
  it('returns 100 for a tab with zero required fields (Tabs 3/4/5)', () => {
    expect(getTabCompletionPct(3, {})).toBe(100);
    expect(getTabCompletionPct(4, {})).toBe(100);
    expect(getTabCompletionPct(5, {})).toBe(100);
  });

  it('returns 0 when nothing is filled', () => {
    expect(getTabCompletionPct(0, {})).toBe(0);
  });

  it('returns 100 when every required field on the tab is filled', () => {
    const draft = {
      project_name: 'Acme',
      projectRegionGroup: 'EU',
      country: 'Germany',
      development_stage: 'pre_permitting',
    };
    expect(getTabCompletionPct(0, draft)).toBe(100);
  });

  it('rounds to nearest integer (2 of 3 → 67%)', () => {
    // Tab 2 has 3 required fields
    const draft = {
      grid_connection_status: 'secured',
      renewable_energy_share_pct: 65,
      // renewable_energy_source missing
    };
    expect(getTabCompletionPct(2, draft)).toBe(67);
  });

  it('counts numeric zero as filled', () => {
    // Tab 1 has 4 required fields, 2 of them numeric
    const draft = {
      planned_capacity_mw: 0,
      pue: 0,
      cooling_type: 'air',
      backup_power_type: 'battery',
    };
    expect(getTabCompletionPct(1, draft)).toBe(100);
  });

  it('counts boolean false as filled', () => {
    // Tab 6 has 1 required boolean field
    const draft = { financing_strategy_defined: false };
    expect(getTabCompletionPct(6, draft)).toBe(100);
  });

  it('treats unknown tab index as 100% (nothing required)', () => {
    expect(getTabCompletionPct(99, {})).toBe(100);
  });
});

describe('getTabFieldStatus', () => {
  it('returns per-field filled status with labels preserved', () => {
    const status = getTabFieldStatus(1, { planned_capacity_mw: 30, pue: 1.3 });
    expect(status).toHaveLength(4);
    expect(status.find(f => f.key === 'planned_capacity_mw').filled).toBe(true);
    expect(status.find(f => f.key === 'pue').filled).toBe(true);
    expect(status.find(f => f.key === 'cooling_type').filled).toBe(false);
    expect(status.every(f => typeof f.label === 'string' && f.label.length > 0)).toBe(true);
  });
});

describe('getAllMissingRequiredFields — Submit gate helper', () => {
  it('returns empty when every required field is filled', () => {
    const complete = {
      project_name: 'Acme',
      projectRegionGroup: 'EU',
      country: 'Germany',
      development_stage: 'pre_permitting',
      planned_capacity_mw: 30,
      pue: 1.3,
      cooling_type: 'hybrid',
      backup_power_type: 'battery',
      grid_connection_status: 'secured',
      renewable_energy_share_pct: 65,
      renewable_energy_source: 'ppa',
      financing_strategy_defined: true,
    };
    expect(getAllMissingRequiredFields(complete)).toEqual([]);
  });

  it('returns 12 entries when project is empty', () => {
    expect(getAllMissingRequiredFields({})).toHaveLength(12);
  });

  it('each entry carries step + tabName + key + label', () => {
    const missing = getAllMissingRequiredFields({});
    for (const m of missing) {
      expect(typeof m.step).toBe('number');
      expect(typeof m.tabName).toBe('string');
      expect(typeof m.key).toBe('string');
      expect(typeof m.label).toBe('string');
    }
  });

  it('boolean false counts as filled (does not appear as missing)', () => {
    const draft = { financing_strategy_defined: false };
    const missing = getAllMissingRequiredFields(draft);
    expect(missing.find(m => m.key === 'financing_strategy_defined')).toBeUndefined();
  });

  it('numeric zero counts as filled', () => {
    const draft = { planned_capacity_mw: 0, pue: 0 };
    const missing = getAllMissingRequiredFields(draft);
    expect(missing.find(m => m.key === 'planned_capacity_mw')).toBeUndefined();
    expect(missing.find(m => m.key === 'pue')).toBeUndefined();
  });
});

describe('registry shape', () => {
  it('covers 7 tabs (0–6)', () => {
    const keys = Object.keys(REQUIRED_FIELDS_BY_TAB).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('total required field count matches the sanity-checked list (12)', () => {
    expect(ALL_REQUIRED_FIELD_KEYS).toHaveLength(12);
  });

  it('every registry key exists as a potential state key (string)', () => {
    for (const key of ALL_REQUIRED_FIELD_KEYS) {
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    }
  });
});
