// @ts-check
//
// api/engagement tests. The properties that matter: the token comes from the
// server environment and never appears in a response, and the handler keeps
// fetchEngagement's { ok, reason | engagement } contract so ReportRoute's
// handling is unchanged.

import { describe, it, expect, vi } from "vitest";
import handler from "./engagement.js";

const REF = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";
const ENV = {
  AIRTABLE_PAT: "pat_server_secret",
  AIRTABLE_BASE_ID: "app_test",
  AIRTABLE_ENGAGEMENTS_TABLE_ID: "tbl_test",
};

function mockRes() {
  const res = {
    statusCode: 0,
    body: /** @type {unknown} */ (undefined),
    headers: /** @type {Record<string, string>} */ ({}),
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  return res;
}

describe("api/engagement", () => {
  it("rejects non-GET with 405", async () => {
    const res = mockRes();
    const fetchEngagementImpl = vi.fn();
    await handler({ method: "POST", query: { ref: REF } }, res, { env: ENV, fetchEngagementImpl });
    expect(res.statusCode).toBe(405);
    expect(fetchEngagementImpl).not.toHaveBeenCalled();
  });

  it("passes the server-side config to fetchEngagement and returns its result", async () => {
    const res = mockRes();
    const fetchEngagementImpl = vi.fn(async () => ({ ok: true, engagement: { run_id: "x" } }));
    await handler({ method: "GET", query: { ref: REF } }, res, {
      env: ENV,
      fetchEngagementImpl: /** @type {any} */ (fetchEngagementImpl),
    });
    expect(fetchEngagementImpl).toHaveBeenCalledWith(REF, {
      pat: "pat_server_secret",
      baseId: "app_test",
      tableId: "tbl_test",
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, engagement: { run_id: "x" } });
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });

  it.each(["invalid_format", "not_found", "not_active", "expired"])(
    "passes through reason %s with 200",
    async (reason) => {
      const res = mockRes();
      await handler({ method: "GET", query: { ref: REF } }, res, {
        env: ENV,
        fetchEngagementImpl: /** @type {any} */ (async () => ({ ok: false, reason })),
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: false, reason });
    },
  );

  it("returns invalid_format for a malformed ref without calling Airtable (real fetchEngagement)", async () => {
    const res = mockRes();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await handler({ method: "GET", query: { ref: "not-a-uuid" } }, res, { env: ENV });
      expect(res.body).toEqual({ ok: false, reason: "invalid_format" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("returns an opaque 500 on upstream failure, with no token in the response", async () => {
    const res = mockRes();
    const logError = vi.fn();
    await handler({ method: "GET", query: { ref: REF } }, res, {
      env: ENV,
      logError,
      fetchEngagementImpl: /** @type {any} */ (async () => {
        throw new Error("Airtable API error: 401");
      }),
    });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "upstream" });
    expect(JSON.stringify(res.body)).not.toContain("pat_server_secret");
    expect(logError).toHaveBeenCalledWith("[api/engagement] Airtable API error: 401");
  });

  it("returns 500 (not a crash) when the server env is missing the token", async () => {
    const res = mockRes();
    await handler({ method: "GET", query: { ref: REF } }, res, {
      env: {},
      logError: () => {},
    });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "upstream" });
  });
});
