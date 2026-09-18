// @ts-check
import { describe, it, expect, vi } from "vitest";
import { fetchEngagementFromApi } from "./engagementApi.js";

const REF = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";

function jsonRes(status, body) {
  return /** @type {any} */ ({ ok: status >= 200 && status < 300, status, json: async () => body });
}

describe("fetchEngagementFromApi", () => {
  it("calls /api/engagement with the encoded ref and returns the body", async () => {
    const fetchImpl = vi.fn(async () => jsonRes(200, { ok: true, engagement: { run_id: "x" } }));
    const r = await fetchEngagementFromApi(REF, /** @type {any} */ (fetchImpl));
    expect(fetchImpl.mock.calls[0][0]).toBe(`/api/engagement?ref=${REF}`);
    expect(r).toEqual({ ok: true, engagement: { run_id: "x" } });
  });

  it("returns entitlement failures as data, not throws", async () => {
    const r = await fetchEngagementFromApi(REF, /** @type {any} */ (async () => jsonRes(200, { ok: false, reason: "expired" })));
    expect(r).toEqual({ ok: false, reason: "expired" });
  });

  it("throws on a non-200 so the route shows its opaque error", async () => {
    await expect(
      fetchEngagementFromApi(REF, /** @type {any} */ (async () => jsonRes(500, { error: "upstream" }))),
    ).rejects.toThrow("Engagement API error: 500");
  });

  it("throws on an unexpected body shape", async () => {
    await expect(
      fetchEngagementFromApi(REF, /** @type {any} */ (async () => jsonRes(200, { hello: 1 }))),
    ).rejects.toThrow();
  });
});
