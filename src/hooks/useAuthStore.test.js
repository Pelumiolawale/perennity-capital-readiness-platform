// useAuthStore — client-side IndexedDB auth tests.
// Runs against fake-indexeddb polyfill in jsdom.

import { describe, expect, it } from 'vitest';
import {
  signup, signin, signout, getCurrentSession, userExists, hashPassword,
} from './useAuthStore.js';

// Test isolation between tests is provided by src/test/setup.js
// (afterEach resets indexedDB + localStorage). No beforeEach here —
// doing a localStorage.clear() in beforeEach would wipe the session
// that signup() just persisted within the same test.

describe('useAuthStore — signup', () => {
  it('persists a new user and returns a sanitised user object (no hash / salt)', async () => {
    const user = await signup({
      email: 'Alice@Example.com',
      name: 'Alice',
      company: 'Acme',
      role: 'developer',
      password: 'correct-horse-battery-staple',
    });
    expect(user).toEqual({
      email: 'alice@example.com',
      name: 'Alice',
      company: 'Acme',
      role: 'developer',
    });
    // Belt-and-braces: returned object must not expose secrets.
    expect(user.passwordHash).toBeUndefined();
    expect(user.passwordSalt).toBeUndefined();
  });

  it('rejects a duplicate email', async () => {
    await signup({ email: 'bob@example.com', name: 'Bob', password: 'password123' });
    await expect(
      signup({ email: 'bob@example.com', name: 'Bob2', password: 'othersecret' })
    ).rejects.toThrow(/already exists/i);
  });

  it('rejects passwords shorter than 8 characters', async () => {
    await expect(
      signup({ email: 'short@example.com', name: 'Short', password: 'abc' })
    ).rejects.toThrow(/at least 8/i);
  });

  it('normalises email (case-insensitive, trimmed)', async () => {
    await signup({ email: '  CASE@Example.com  ', name: 'Case', password: 'password123' });
    expect(await userExists('case@example.com')).toBe(true);
    expect(await userExists('CASE@EXAMPLE.COM')).toBe(true);
  });
});

describe('useAuthStore — signin', () => {
  it('returns the user on correct credentials', async () => {
    await signup({ email: 'signin@example.com', name: 'Signin', password: 'password123' });
    signout(); // clear session so we're actually testing signin, not rehydration
    const user = await signin({ email: 'signin@example.com', password: 'password123' });
    expect(user.email).toBe('signin@example.com');
  });

  it('rejects wrong password with a generic error', async () => {
    await signup({ email: 'reject@example.com', name: 'Reject', password: 'password123' });
    await expect(
      signin({ email: 'reject@example.com', password: 'wrongpassword' })
    ).rejects.toThrow(/email or password is incorrect/i);
  });

  it('rejects unknown email with the same generic error', async () => {
    // Deliberately symmetric with wrong-password — prevents leaking
    // whether the email is registered.
    await expect(
      signin({ email: 'nobody@example.com', password: 'password123' })
    ).rejects.toThrow(/email or password is incorrect/i);
  });
});

describe('useAuthStore — session', () => {
  it('persists across a simulated reload (session stored in localStorage)', async () => {
    await signup({ email: 'session@example.com', name: 'Session', password: 'password123' });
    const session = await getCurrentSession();
    expect(session?.email).toBe('session@example.com');
  });

  it('signout clears the session so getCurrentSession returns null', async () => {
    await signup({ email: 'logout@example.com', name: 'Logout', password: 'password123' });
    signout();
    const session = await getCurrentSession();
    expect(session).toBeNull();
  });
});

describe('useAuthStore — password hashing', () => {
  it('same password + same salt produces the same hash (deterministic)', async () => {
    const { hash: h1, salt } = await hashPassword('password123');
    const { hash: h2 } = await hashPassword('password123', salt);
    expect(h1).toBe(h2);
  });

  it('same password + different salt produces different hashes', async () => {
    const { hash: h1 } = await hashPassword('password123');
    const { hash: h2 } = await hashPassword('password123');
    expect(h1).not.toBe(h2);
  });
});
