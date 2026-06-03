# Perennity Bridge — Capital Readiness Platform

Frontend MVP for the Perennity Bridge capital readiness assessment tool.
Methodology v3.1 (April 2026).

## Quick start

```bash
npm install
npm run dev     # vite dev server on :5173
npm test        # vitest
npx vite build  # production build to dist/
```

## Important caveats

### Client-side authentication (interim)

The current sign-in system stores accounts and PBKDF2-hashed passwords
in IndexedDB on the user's local device. **It is not security-grade.**
Anyone with physical access to a signed-in device can inspect the
IndexedDB contents and extract password hashes for offline cracking.

Tradeoffs, in order of importance:

- Accounts do **not** sync across devices. A user who signs up on their
  laptop cannot sign in on their phone — there is no backend yet.
- Password reset is not available (no email provider wired in).
- Email verification is not available.
- The sign-in screen surfaces this limitation via a visible banner.

The eventual target is a backend (Supabase / Firebase / custom API).
The IndexedDB shape is chosen to be migratable: `email` is the stable
identifier, and the PBKDF2 hash can either be re-challenged on
migration day or imported if the backend accepts compatible hashes.

### Legal-entity rebrand

User-facing strings, Terms of Service, and regulatory citations have
been rebranded from "Perennity" to "Perennity Bridge". The T&Cs now
reference **Perennity Bridge Ltd** as the contracting legal entity.

**Before shipping publicly**, verify the Companies House registration
matches "Perennity Bridge Ltd". If the registered entity is still
"Perennity Ltd", the T&Cs will be legally inaccurate — update the
definition in `src/App.jsx` back to `Perennity Ltd` with a trading
name note, or register/rename the entity to match.

### Demo mode

The landing page "View Example Assessment" button surfaces a neutered
sample: score ring, pillar grid, and verdict label name only. The
criteria breakdown, recommendations, DNSH grid, PDF/Excel downloads,
AI narrative, and regulatory Q&A are gated behind a Create Account
CTA to protect methodology IP.
