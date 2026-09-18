// @ts-check
// Browser-side entitlement client for the gated report route.
//
// Calls api/engagement.js, which runs the existing `fetchEngagement` on the
// server with a token the browser never sees. Returns the same shape as
// `fetchEngagement` so ReportRoute's handling is unchanged, and throws on
// transport / server errors just as `fetchEngagement` throws on Airtable
// errors, so the route's catch → "entitlement_failed" path is unchanged too.

/**
 * @param {string} engagementReference
 * @param {typeof fetch} [fetchImpl] Injectable for tests.
 * @returns {Promise<
 *   | { ok: false, reason: "invalid_format" | "not_found" | "not_active" | "expired" }
 *   | { ok: true, engagement: object }
 * >}
 */
export async function fetchEngagementFromApi(engagementReference, fetchImpl = fetch) {
  const url = `/api/engagement?ref=${encodeURIComponent(engagementReference ?? "")}`;
  const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Engagement API error: ${res.status}`);
  }
  const body = await res.json();
  if (!body || typeof body.ok !== "boolean") {
    throw new Error("Engagement API returned an unexpected response.");
  }
  return body;
}
