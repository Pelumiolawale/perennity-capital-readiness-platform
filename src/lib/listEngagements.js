// @ts-check
/**
 * Server-side engagement lister — the list sibling of `fetchEngagement`.
 *
 * Used by the nightly benchmark sweep (api/cron/benchmark-sync.js). Runs ONLY in
 * a Node context; never imported by the browser bundle. `airtableConfigFromEnv`
 * below is also the credential source for api/engagement.js and api/leads.js.
 *
 * ============================================================================
 * WHY THIS RETURNS REFERENCES RATHER THAN PARSED ENGAGEMENTS
 * ============================================================================
 *
 * `fetchEngagement` already contains ~150 lines of field parsing, JSON-blob
 * handling, child-table joins, and entitlement validation. Re-implementing that
 * here to parse a list response would create a second copy that drifts from the
 * one the paid report depends on — and the paid report is the £85k deliverable.
 *
 * So this returns identifiers only, and the caller loops `fetchEngagement(ref)`.
 * That costs one extra API call per engagement, which at this volume is
 * irrelevant, and buys three things: the parsing has exactly one implementation,
 * the active/expired entitlement checks apply automatically, and the paid route
 * needed no refactor to make this work.
 *
 * @typedef {{pat: string, baseId: string, tableId: string}} AirtableConfig
 */

import { FID } from "./airtableEngagement.js";

/** Airtable's maximum page size. */
const PAGE_SIZE = 100;

/**
 * Safety cap on pagination. At 100 records per page this is 10,000 engagements —
 * orders of magnitude beyond real volume. Its job is to stop a malformed offset
 * response turning a nightly cron into an unbounded loop, not to limit real data.
 */
const MAX_PAGES = 100;

/**
 * Read Airtable credentials from the process environment.
 *
 * Prefers the unprefixed AIRTABLE_* names. The PAT must NEVER carry a VITE_
 * prefix: Vite inlines every VITE_* variable into the client bundle, which is
 * how the token leaked (Sep 2026). vite.config.js now refuses to build if
 * VITE_AIRTABLE_PAT is set. The VITE_* names remain as a fallback for the
 * non-secret base and table IDs so existing deployments keep working.
 *
 * Shared by every serverless function that talks to Airtable (the benchmark
 * cron, api/engagement.js, api/leads.js).
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {AirtableConfig}
 */
export function airtableConfigFromEnv(env = process.env) {
  // DELETED (Sep 2026): `?? env.VITE_AIRTABLE_*` fallbacks on all three. They
  // were the last place in the codebase that ACCEPTED the VITE_-prefixed
  // names, and they contradicted the guard in vite.config.js, which refuses to
  // build when a secret-looking VITE_ variable is set — the guard that exists
  // because the PAT once shipped in the public bundle through exactly that
  // name. Keeping a server-side reader that quietly accepts the forbidden
  // spelling kept it alive as a plausible thing to configure.
  const pat = env.AIRTABLE_PAT;
  const baseId = env.AIRTABLE_BASE_ID;
  const tableId = env.AIRTABLE_ENGAGEMENTS_TABLE_ID;
  const missing = [
    ["AIRTABLE_PAT", pat],
    ["AIRTABLE_BASE_ID", baseId],
    ["AIRTABLE_ENGAGEMENTS_TABLE_ID", tableId],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `Airtable env vars missing: ${missing.join(", ")}. ` +
        "This is a deploy misconfiguration, not a runtime error.",
    );
  }
  return { pat, baseId, tableId };
}

/**
 * List the engagement references eligible for benchmark capture.
 *
 * Eligibility here is deliberately narrow: status `active` AND a signed
 * engagement letter. Drafts and prospects must not accrue benchmark rows —
 * the table is append-only, so a row written in error cannot be taken back.
 *
 * Filtering happens client-side against field IDs rather than through
 * `filterByFormula`, because formulas address fields by their DISPLAY NAME.
 * Display names can be renamed in the Airtable UI at any time; field IDs cannot.
 * The existing code chose `returnFieldsByFieldId=true` for exactly this reason,
 * and a name-based formula here would reintroduce the fragility it avoided.
 *
 * @param {AirtableConfig} config
 * @param {typeof fetch} [fetchImpl] Injectable for tests.
 * @returns {Promise<string[]>} Engagement Reference UUIDs.
 */
export async function listEngagementReferences(config, fetchImpl = fetch) {
  const references = [];
  let offset;
  let page = 0;

  do {
    if (page >= MAX_PAGES) {
      throw new Error(
        `Engagement pagination exceeded ${MAX_PAGES} pages — aborting rather ` +
          "than looping. Check the Airtable offset response.",
      );
    }
    page += 1;

    const url = new URL(
      `https://api.airtable.com/v0/${config.baseId}/${config.tableId}`,
    );
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    url.searchParams.set("returnFieldsByFieldId", "true");
    if (offset) url.searchParams.set("offset", offset);

    let res;
    try {
      res = await fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${config.pat}` },
      });
    } catch (e) {
      throw new Error(
        `Airtable network failure listing engagements: ${
          e && e.message ? e.message : String(e)
        }`,
      );
    }
    if (!res.ok) {
      throw new Error(`Airtable API error listing engagements: ${res.status}`);
    }

    const body = await res.json();
    for (const record of (body && body.records) || []) {
      const fields = record.fields || {};
      if (fields[FID.STATUS] !== "active") continue;
      if (!fields[FID.ENGAGEMENT_LETTER_SIGNED]) continue;
      const ref = fields[FID.ENGAGEMENT_REF];
      if (typeof ref === "string" && ref.length > 0) references.push(ref);
    }

    offset = body && body.offset;
  } while (offset);

  return references;
}
