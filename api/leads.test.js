// @ts-check
//
// api/leads tests. The properties that matter: writes only ever go to the
// Leads table, only whitelisted fields reach Airtable, the token stays
// server-side, and the personal data in the body is never logged.

import { describe, it, expect, vi, afterEach } from "vitest";
import handler, {
  sanitizeLead,
  LEADS_TABLE,
  LEAD_FIELD_IDS,
  toAirtableFields,
} from "./leads.js";

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
    // ITEM-17: the payload is keyed by immutable field ids, not display names.
    // This assertion replaces one that pinned the display-name payload — the
    // behaviour that made renaming a column in the Airtable UI enough to stop
    // inbound leads landing.
    const written = JSON.parse(init.body).fields;
    for (const key of Object.keys(written)) {
      expect(key, `${key} should be a fld… id, not a display name`).toMatch(/^fld[A-Za-z0-9]{14}$/);
    }
    expect(written[LEAD_FIELD_IDS.name]).toBe(LEAD.name);
    expect(written[LEAD_FIELD_IDS.email]).toBe(LEAD.email);
    expect(written[LEAD_FIELD_IDS.company]).toBe(LEAD.company);
    expect(written[LEAD_FIELD_IDS.status]).toBe("new");
  });

  it("maps every field sanitizeLead can emit — none is silently dropped", () => {
    // A key present in the validated lead but missing from LEAD_FIELD_IDS
    // would be discarded without a word. Drive the sanitiser with a fully
    // populated payload and assert the map covers everything it produced.
    const full = sanitizeLead({
      ...LEAD,
      phone: "+44 20 7946 0000",
      message: "Please get in touch.",
      snapshot_run_id: "11111111-1111-4111-8111-111111111111",
      indicative_band: "Amber",
      indicative_score: 61,
      target_label: "sfdr_article_8",
      jurisdiction: "DE",
      facility_type: "hyperscale",
      cta_value: "request_project_readiness_report",
      honeypot_tripped: false,
    });
    expect(full.ok).toBe(true);
    const unmapped = Object.keys(full.fields).filter((k) => !(k in LEAD_FIELD_IDS));
    expect(unmapped, "add these to LEAD_FIELD_IDS").toEqual([]);
    // And every one actually survives translation.
    expect(Object.keys(toAirtableFields(full.fields))).toHaveLength(
      Object.keys(full.fields).length,
    );
  });

  it("the table is addressed by id, not by name", () => {
    expect(LEADS_TABLE).toMatch(/^tbl[A-Za-z0-9]{14}$/);
  });

  it("drops an unmapped key rather than addressing it by name", () => {
    // The safe direction: something we forgot to map is not written at all,
    // instead of being sent as a display name that may not exist.
    expect(toAirtableFields({ name: "x", surprise_new_field: "y" })).toEqual({
      [LEAD_FIELD_IDS.name]: "x",
    });
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
