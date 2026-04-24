// ============================================================
// Client-side auth — IndexedDB-backed, PBKDF2-hashed passwords.
//
// NOT security-grade. Anyone with local machine access can
// inspect IndexedDB and extract password hashes. This is a
// staging implementation for the single-device demo; a real
// backend (Supabase / Firebase / custom API) is the eventual
// target. Shape is chosen to be migratable: email is the stable
// identifier; the PBKDF2 hash can either be re-challenged or
// imported depending on the backend chosen.
// ============================================================

import { getDb, USERS_STORE_NAME } from './useAssessmentStore.js';

const SESSION_KEY = 'perennity_session_email';

// ── Password hashing (Web Crypto API) ───────────────────────
// PBKDF2 — 100k iterations, SHA-256, 16-byte random salt.

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function toHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function deriveHash(password, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    HASH_BYTES * 8
  );
  return toHex(bits);
}

export async function hashPassword(password, saltHex = null) {
  const salt = saltHex
    ? fromHex(saltHex)
    : crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveHash(password, salt);
  return { hash, salt: saltHex || toHex(salt) };
}

// ── Store operations ────────────────────────────────────────

function normaliseEmail(email) {
  return (email || '').trim().toLowerCase();
}

export async function userExists(email) {
  const key = normaliseEmail(email);
  if (!key) return false;
  const db = await getDb();
  const rec = await db.get(USERS_STORE_NAME, key);
  return !!rec;
}

export async function signup({ email, name, company, role, password }) {
  const key = normaliseEmail(email);
  if (!key) throw new Error('Email is required.');
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  if (await userExists(key)) {
    throw new Error('An account with this email already exists. Sign in instead.');
  }
  const { hash, salt } = await hashPassword(password);
  const record = {
    email: key,
    name: name || '',
    company: company || '',
    role: role || 'developer',
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: new Date().toISOString(),
  };
  const db = await getDb();
  await db.put(USERS_STORE_NAME, record);
  persistSession(key);
  return userFromRecord(record);
}

export async function signin({ email, password }) {
  const key = normaliseEmail(email);
  if (!key) throw new Error('Email is required.');
  if (!password) throw new Error('Password is required.');
  const db = await getDb();
  const rec = await db.get(USERS_STORE_NAME, key);
  if (!rec) {
    // Generic error — don't leak whether the email is registered.
    throw new Error('Email or password is incorrect.');
  }
  const { hash } = await hashPassword(password, rec.passwordSalt);
  if (hash !== rec.passwordHash) {
    throw new Error('Email or password is incorrect.');
  }
  persistSession(key);
  return userFromRecord(rec);
}

export function signout() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

export async function getCurrentSession() {
  let email;
  try { email = localStorage.getItem(SESSION_KEY); } catch { return null; }
  if (!email) return null;
  const db = await getDb();
  const rec = await db.get(USERS_STORE_NAME, email);
  if (!rec) {
    // Orphaned session (user record deleted). Clear and bail.
    signout();
    return null;
  }
  return userFromRecord(rec);
}

function persistSession(email) {
  try { localStorage.setItem(SESSION_KEY, email); } catch {}
}

function userFromRecord(rec) {
  // Never expose hash / salt to the rest of the app.
  return {
    email: rec.email,
    name: rec.name,
    company: rec.company,
    role: rec.role,
  };
}
