import { openDB } from 'idb';

const DB = 'perennity-db';
const STORE = 'assessments';
const USERS_STORE = 'users';
const DRAFT_KEY = 'perennity_wizard_draft';

// v2 adds a `users` object store for client-side auth
// (see hooks/useAuthStore.js). The upgrade is guarded so existing
// assessments are preserved when moving from v1 → v2.
async function db() {
  return openDB(DB, 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        const s = d.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('savedAt', 'savedAt');
      }
      if (oldVersion < 2) {
        if (!d.objectStoreNames.contains(USERS_STORE)) {
          d.createObjectStore(USERS_STORE, { keyPath: 'email' });
        }
      }
    }
  });
}

// Exported so useAuthStore can open the same DB at the same version
// without racing the upgrade.
export async function getDb() {
  return db();
}

export const DB_NAME = DB;
export const USERS_STORE_NAME = USERS_STORE;

export async function saveAssessment(id, projectInput, snapshotOutput) {
  const conn = await db();
  await conn.put(STORE, {
    id,
    projectId: projectInput.project_id || 'Untitled',
    facilityType: projectInput.facility_type || '',
    jurisdiction: projectInput.jurisdiction || '',
    savedAt: new Date().toISOString(),
    indicativeScore: snapshotOutput.indicative_score,
    indicativeBand: snapshotOutput.indicative_band,
    runId: snapshotOutput.run_id,
    projectInput,
    snapshotOutput,
  });
}

export async function listAssessments() {
  const conn = await db();
  const all = await conn.getAllFromIndex(STORE, 'savedAt');
  return all.reverse();
}

export async function loadAssessmentById(id) {
  const conn = await db();
  return conn.get(STORE, id);
}

export async function deleteAssessment(id) {
  const conn = await db();
  await conn.delete(STORE, id);
}

// Draft auto-save (localStorage)
// Draft schema version. Bump this whenever a change to the wizard's defaults
// would be silently undone by restoring an older draft — a mismatched draft is
// discarded rather than merged.
//
// v2 (20 Sep 2026): the wizard used to open with all four safeguards groups
// fully ticked and PUE / WUE / water stress pre-filled with passing values,
// and it auto-saves on mount. So every visitor who ever loaded the page has a
// v1 draft asserting full compliance that they never actually entered.
// Merging one of those over the new empty defaults would restore exactly the
// flattering state the sweep removed. Losing one in-progress draft is the
// lesser cost.
export const DRAFT_SCHEMA_VERSION = 2;

export function saveDraft(wizardData) {
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        v: DRAFT_SCHEMA_VERSION,
        wizardData,
        savedAt: new Date().toISOString(),
      }),
    );
  } catch { /* storage full */ }
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // An unversioned draft is pre-v2 by definition.
    if (parsed?.v !== DRAFT_SCHEMA_VERSION) return null;
    return parsed;
  } catch { return null; }
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}
