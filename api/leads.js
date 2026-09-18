// @ts-check
/**
 * POST /api/leads — writes one lead from the snapshot LeadCaptureModal to the
 * Airtable "Leads" table using the server-only AIRTABLE_PAT.
 *
 * Replaces the browser-side Airtable write that shipped the PAT in the public
 * bundle. Two properties keep this from becoming a general write proxy:
 *
 *   1. The table is fixed to "Leads". The caller cannot choose a table.
 *   2. Only the fields LeadCaptureModal sends are accepted, each type-checked
 *      and length-capped. Anything else in the body is dropped.
 *
 * The request body is never logged: it contains personal data (name, email,
 * phone, message).
 *
 * Response contract:
 *   200 { ok: true }
 *   400 { ok: false, error: "invalid_lead" }
 *   405 { error: "method_not_allowed" }
 *   502 { ok: false, error: "upstream" }
 */

import { airtableConfigFromEnv } from "../src/lib/listEngagements.js";

export const LEADS_TABLE = "Leads";

// Same pattern as LeadCaptureModal.jsx so the server never rejects a lead the
// form accepted.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SHORT = 500;
const LONG = 5000;

/** Optional string fields and their caps. */
const STRING_FIELDS = /** @type {const} */ ({
  phone: SHORT,
  message: LONG,
  snapshot_run_id: SHORT,
  indicative_band: SHORT,
  target_label: SHORT,
  jurisdiction: SHORT,
  facility_type: SHORT,
  cta_value: SHORT,
});

/**
 * Validate and whitelist a lead payload.
 *
 * @param {unknown} body
 * @returns {{ok: true, fields: Record<string, string|number|boolean>} | {ok: false}}
 */
export function sanitizeLead(body) {
  if (!body || typeof body !== "object") return { ok: false };
  const b = /** @type {Record<string, unknown>} */ (body);

  const req = (/** @type {string} */ k) =>
    typeof b[k] === "string" ? /** @type {string} */ (b[k]).trim() : "";
  const name = req("name");
  const email = req("email");
  const company = req("company");
  if (!name || !company || !EMAIL_RE.test(email)) return { ok: false };
  if (name.length > SHORT || company.length > SHORT || email.length > SHORT) {
    return { ok: false };
  }

  /** @type {Record<string, string|number|boolean>} */
  const fields = { name, email, company };

  for (const [key, cap] of Object.entries(STRING_FIELDS)) {
    const v = b[key];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "string" || v.length > cap) return { ok: false };
    fields[key] = v;
  }

  if (typeof b.indicative_score === "number" && Number.isFinite(b.indicative_score)) {
    fields.indicative_score = b.indicative_score;
  }

  // Server decides status; the client value is ignored.
  fields.status = "new";
  fields.honeypot_tripped = b.honeypot_tripped === true;

  return { ok: true, fields };
}

/**
 * @typedef {Object} LeadsDeps
 * @property {NodeJS.ProcessEnv} [env]
 * @property {typeof fetch} [fetchImpl]
 * @property {(msg: string) => void} [logError]
 */

/**
 * @param {{method?: string, body?: unknown}} req
 * @param {{status: (c: number) => {json: (b: unknown) => unknown}, setHeader: (k: string, v: string) => unknown}} res
 * @param {LeadsDeps} [deps]
 */
export default async function handler(req, res, deps = {}) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const logError = deps.logError ?? ((m) => console.error(m));
  const fetchImpl = deps.fetchImpl ?? fetch;

  // Vercel parses JSON bodies; tolerate a raw string too.
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }

  const lead = sanitizeLead(body);
  if (!lead.ok) {
    return res.status(400).json({ ok: false, error: "invalid_lead" });
  }

  try {
    const { pat, baseId } = airtableConfigFromEnv(deps.env ?? process.env);
    const upstream = await fetchImpl(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(LEADS_TABLE)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pat}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: lead.fields }),
      },
    );
    if (!upstream.ok) {
      // Status only. Airtable error bodies can echo submitted values.
      logError(`[api/leads] Airtable write failed: ${upstream.status}`);
      return res.status(502).json({ ok: false, error: "upstream" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    logError(
      `[api/leads] ${err instanceof Error ? err.message : String(err)}`,
    );
    return res.status(502).json({ ok: false, error: "upstream" });
  }
}
