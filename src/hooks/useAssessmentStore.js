import { openDB } from 'idb';

const DB = 'perennity-db';
const STORE = 'assessments';
const DRAFT_KEY = 'perennity_wizard_draft';

async function db() {
  return openDB(DB, 1, {
    upgrade(d) {
      const s = d.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('savedAt', 'savedAt');
    }
  });
}

export async function saveAssessment(id, project, assessment) {
  const conn = await db();
  await conn.put(STORE, {
    id,
    projectName: project.project_name || 'Untitled',
    region: project.region || '',
    country: project.country || '',
    savedAt: new Date().toISOString(),
    score: assessment.capitalReadinessScore,
    band: assessment.band?.label,
    sfdr: assessment.sfdr?.classification,
    project,
    assessment,
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
export function saveDraft(wizardData) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ wizardData, savedAt: new Date().toISOString() }));
  } catch { /* storage full */ }
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}
