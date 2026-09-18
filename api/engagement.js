// @ts-check
/**
 * GET /api/engagement?ref=<uuid> — server-side entitlement check + engagement
 * read for the paid report route.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * The report route used to call Airtable straight from the browser with a
 * VITE_AIRTABLE_PAT, which Vite inlines into the public bundle. Anyone viewing
 * source had a read/write token for the whole base, and the active / expired
 * entitlement checks ran client-side where they could simply be skipped.
 *
 * Now the token lives only in the serverless environment (AIRTABLE_PAT) and the
 * entitlement checks run here, inside the existing `fetchEngagement` — the one
 * implementation of engagement parsing, reused rather than copied.
 *
 * Response contract (mirrors fetchEngagement's return shape so the route's
 * handling is unchanged):
 *   200 { ok: false, reason }        invalid_format | not_found | not_active | expired
 *   200 { ok: true, engagement }
 *   405 { error: "method_not_allowed" }
 *   500 { error: "upstream" }        misconfiguration or Airtable failure; the
 *                                    detail is logged server-side, never returned
 */

import { fetchEngagement } from "../src/lib/airtableEngagement.js";
import { airtableConfigFromEnv } from "../src/lib/listEngagements.js";

/**
 * @typedef {Object} EngagementDeps
 * @property {NodeJS.ProcessEnv} [env]
 * @property {typeof fetchEngagement} [fetchEngagementImpl]
 * @property {(msg: string) => void} [logError]
 */

/**
 * Typed structurally rather than via `@vercel/node`, matching
 * api/cron/benchmark-sync.js.
 *
 * @param {{method?: string, query?: Record<string, unknown>}} req
 * @param {{status: (c: number) => {json: (b: unknown) => unknown}, setHeader: (k: string, v: string) => unknown}} res
 * @param {EngagementDeps} [deps]
 */
export default async function handler(req, res, deps = {}) {
  // Engagement data is per-client; never let a CDN or browser cache it.
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const rawRef = req.query?.ref;
  const ref = typeof rawRef === "string" ? rawRef : "";

  const fetchImpl = deps.fetchEngagementImpl ?? fetchEngagement;
  const logError = deps.logError ?? ((m) => console.error(m));

  try {
    const config = airtableConfigFromEnv(deps.env ?? process.env);
    const result = await fetchImpl(ref, config);
    return res.status(200).json(result);
  } catch (err) {
    // Message only: fetchEngagement's errors carry status codes and missing
    // env var NAMES, never values or record data.
    logError(
      `[api/engagement] ${err instanceof Error ? err.message : String(err)}`,
    );
    return res.status(500).json({ error: "upstream" });
  }
}
