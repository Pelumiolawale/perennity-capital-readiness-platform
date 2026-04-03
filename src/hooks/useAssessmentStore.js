import { openDB } from 'idb';
import { useCallback, useEffect, useRef } from 'react';

const DB_NAME = 'perennity-assessments';
const DB_VERSION = 1;
const STORE = 'assessments';
const DRAFT_KEY = 'perennity_draft';

async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('savedAt', 'savedAt');
    }
  });
}

export async function saveAssessment(id, formData, results) {
  const db = await getDb();
  const record = {
    id,
    projectName: formData.projectName || 'Untitled Project',
    country: formData.country || '',
    savedAt: new Date().toISOString(),
    overallScore: results?.overall ?? null,
    sfdrClassification: results?.sfdr?.classification ?? null,
    taxonomyAligned: results?.taxonomy?.aligned ?? null,
    formData,
    results
  };
  await db.put(STORE, record);
  return record;
}

export async function loadAssessment(id) {
  const db = await getDb();
  return db.get(STORE, id);
}

export async function listAssessments() {
  const db = await getDb();
  const all = await db.getAllFromIndex(STORE, 'savedAt');
  return all.reverse(); // newest first
}

export async function deleteAssessment(id) {
  const db = await getDb();
  await db.delete(STORE, id);
}

// Draft auto-save (localStorage — cheap, no async overhead for transient state)
export function saveDraft(formData) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      formData,
      savedAt: new Date().toISOString()
    }));
  } catch {
    // storage full — silently ignore
  }
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

// Hook: debounced auto-save of formData to localStorage draft
export function useAutoDraft(formData) {
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveDraft(formData), 2000);
    return () => clearTimeout(timer.current);
  }, [formData]);
}
