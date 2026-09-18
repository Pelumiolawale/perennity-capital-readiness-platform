// @ts-check
//
// api/leads tests. The properties that matter: writes only ever go to the
// Leads table, only whitelisted fields reach Airtable, the token stays
// server-side, and the personal data in the body is never logged.

import { describe, it, expect, vi, afterEach } from "vitest";
import handler, { sanitizeLead, LEADS_TABLE } from "./leads.js";

const ENV = {
  AIRTABLE_PAT: "pat_server_secret",
  AIRTABLE_BASE_ID: "app_test",
  AIRTABLE_ENGAGEMENTS_TABLE_ID: "tbl_test",
};

// Mirrors the payload LeadCaptureModal.jsx builds.
const LEAD = {
  name: "Jane Doe",
  email: "jane@acme.com",
  company: "Acme Capital",
  phone: "+44 20 1234 5678",
  message: "We're closing a series B and need this fast.",
  snapshot_run_id: "run-123",
  indicative_score: 72,
  indicative_band: "Amber",
  target_label: "eu_taxonomy_aligned_8_1",
  jurisdiction: "DE",
  facility_type: "hyperscale",
  cta_value: "request_project_readiness_report",
  status: "new",
  honeypot_tripped: false,
};

function mockRes() {
  return {
    statusCode: 0,
    body: /** @type {any} */ (undefined),
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
}

function okFetch() {
  return vi.fn(async () => /** @type {any} */ ({ ok: true, status: 200 }));
}

afterEach(() => vi.restoreAllMocks());

describe("sanitizeLead", () => {
  it("accepts the LeadCaptureModal payload unchanged", () => {
    const r = sanitizeLead(LEAD);
    expect(r.ok).toBe(true);
    expect(r.ok && r.fields).toEqual(LEAD);
  });

  it.each([
    ["missing name", { ...LEAD, name: "  " }],
    ["missing company", { ...LEAD, company: "" }],
    ["invalid email", { ...LEAD, email: "not-an-email" }],
    ["oversized message", { ...LEAD, message: "x".repeat(5001) }],
    ["non-string phone", { ...LEAD, phone: { $gt: "" } }],
    ["null body", null],
  ])("rejects %s", (_label, body) => {
    expect(sanitizeLead(body).ok).toBe(false);
  });

  it("drops fields that are not whitelisted and forces status to new", () => {
    const r = sanitizeLead({ ...LEAD, status: "won", owner: "attacker", fields: { x: 1 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields).not.toHaveProperty("owner");
    expect(r.fields).not.toHaveProperty("fields");
    expect(r.fields.status).toBe("new");
  });

  it("omits empty optional fields", () => {
    const r = sanitizeLead({ ...LEAD, phone: "", message: undefined });
    expect(r.ok && r.fields).not.toHaveProperty("phone");
    expect(r.ok && r.fields).not.toHaveProperty("message");
  });
});

describe("api/leads handler", () => {
  it("rejects non-POST with 405", async () => {
    const res = mockRes();
    const fetchImpl = okFetch();
    await handler({ method: "GET" }, res, { env: ENV, fetchImpl });
    expect(res.statusCode).toBe(405);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns 400 and writes nothing for an invalid lead", async () => {
    const res = mockRes();
    const fetchImpl = okFetch();
    await handler({ method: "POST", body: { ...LEAD, email: "bad" } }, res, { env: ENV, fetchImpl });
    expect(res.statusCode).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("writes to the Leads table only, with the server token", async () => {
    const res = mockRes();
    const fetchImpl = okFetch();
    await handler({ method: "POST", body: LEAD }, res, { env: ENV, fetchImpl: /** @type {any} */ (fetchImpl) });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const [url, init] = /** @type {any} */ (fetchImpl.mock.calls[0]);
    expect(url).toBe(`https://api.airtable.com/v0/app_test/${LEADS_TABLE}`);
    expect(init.headers.Authorization).toBe("Bearer pat_server_secret");
    expect(JSON.parse(init.body)).toEqual({ fields: LEAD });
  });

  it("accepts a JSON string body", async () => {
    const res = mockRes();
    await handler({ method: "POST", body: JSON.stringify(LEAD) }, res, { env: ENV, fetchImpl: /** @type {any} */ (okFetch()) });
    expect(res.statusCode).toBe(200);
  });

  it("returns 502 on Airtable failure and never logs the personal data", async () => {
    const res = mockRes();
    const logError = vi.fn();
    const consoleSpies = ["log", "info", "warn", "error", "debug"].map((m) =>
      vi.spyOn(console, /** @type {any} */ (m)).mockImplementation(() => {}),
    );
    await handler({ method: "POST", body: LEAD }, res, {
      env: ENV,
      logError,
      fetchImpl: /** @type {any} */ (vi.fn(async () => ({ ok: false, status: 422 }))),
    });
    expect(res.statusCode).toBe(502);
    const logged = JSON.stringify([
      logError.mock.calls,
      ...consoleSpies.map((s) => s.mock.calls),
    ]);
    expect(logged).not.toContain("jane@acme.com");
    expect(logged).not.toContain("Jane Doe");
    expect(logged).not.toContain("pat_server_secret");
  });
});
