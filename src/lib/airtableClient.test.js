// @ts-check
//
// airtableClient tests. The browser must never talk to Airtable directly or
// hold a token; lead writes go to /api/leads, and the payload (personal data)
// is never logged.

import { describe, it, expect, vi, afterEach } from "vitest";
import { sendToAirtable } from "./airtableClient.js";

const PAYLOAD = { name: "Jane Doe", email: "jane@acme.com", company: "Acme" };

afterEach(() => vi.restoreAllMocks());

function spyConsole() {
  return ["log", "info", "warn", "error", "debug"].map((m) =>
    vi.spyOn(console, /** @type {any} */ (m)).mockImplementation(() => {}),
  );
}

describe("sendToAirtable", () => {
  it("posts Leads to /api/leads with no Airtable URL or Authorization header", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(/** @type {any} */ ({ ok: true, status: 200 }));
    const ok = await sendToAirtable("Leads", PAYLOAD);
    expect(ok).toBe(true);
    const [url, init] = /** @type {any} */ (fetchSpy.mock.calls[0]);
    expect(url).toBe("/api/leads");
    expect(String(url)).not.toContain("airtable.com");
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(init.body)).toEqual(PAYLOAD);
  });

  it("refuses tables that have no server endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    spyConsole();
    expect(await sendToAirtable("Engagements", PAYLOAD)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns false on a server error without logging the payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(/** @type {any} */ ({ ok: false, status: 502 }));
    const spies = spyConsole();
    expect(await sendToAirtable("Leads", PAYLOAD)).toBe(false);
    const logged = JSON.stringify(spies.map((s) => s.mock.calls));
    expect(logged).not.toContain("jane@acme.com");
    expect(logged).not.toContain("Jane Doe");
  });

  it("does not log the payload on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(/** @type {any} */ ({ ok: true, status: 200 }));
    const spies = spyConsole();
    await sendToAirtable("Leads", PAYLOAD);
    const logged = JSON.stringify(spies.map((s) => s.mock.calls));
    expect(logged).not.toContain("jane@acme.com");
  });
});
