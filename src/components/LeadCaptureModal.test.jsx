// @ts-check
//
// LeadCaptureModal — tests for the lead-capture flow triggered by the
// "Request Project Readiness Report" CTA on /assessment/snapshot. The modal
// posts to Airtable's Leads table via sendToAirtable() and shows a
// confirmation state on success / an error state with mailto fallback on
// failure. Honeypot field is the spam guard for Phase 1.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("../lib/airtableClient.js", () => ({
  sendToAirtable: vi.fn(),
}));

import { LeadCaptureModal } from "./LeadCaptureModal.jsx";
import { sendToAirtable } from "../lib/airtableClient.js";

const FAKE_OUTPUT = {
  run_id: "11111111-2222-3333-4444-555555555555",
  indicative_score: 72,
  indicative_band: "Amber",
  cta: "request_project_readiness_report",
};
const FAKE_CONTEXT = {
  target_label: "eu_taxonomy_aligned_8_1",
  jurisdiction: "DE",
  facility_type: "hyperscale",
};

let container = null;
let root = null;

beforeEach(() => {
  vi.mocked(sendToAirtable).mockReset();
});

afterEach(() => {
  if (root) {
    act(() => root.unmount());
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

function mount(node) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
}

function setInput(label, value) {
  // Modal mounts via createPortal into document.body, so query the whole body.
  const fields = document.body.querySelectorAll("label");
  const target = Array.from(fields).find((l) => l.textContent.trim().startsWith(label));
  expect(target, `field labelled "${label}" not found`).toBeTruthy();
  const input = target.querySelector("input, textarea");
  expect(input, `input/textarea inside "${label}" not found`).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(
    input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
    "value",
  ).set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}

function findSubmitButton() {
  const buttons = document.body.querySelectorAll("button[type='submit']");
  return buttons[0];
}

describe("LeadCaptureModal", () => {
  it("renders the form by default with required + optional fields", () => {
    mount(
      <LeadCaptureModal output={FAKE_OUTPUT} leadContext={FAKE_CONTEXT} onClose={() => {}} />,
    );
    const labels = Array.from(document.body.querySelectorAll("label"))
      .map((l) => l.textContent.trim())
      .filter((t) => t.length > 0);
    expect(labels.some((t) => t.startsWith("Name"))).toBe(true);
    expect(labels.some((t) => t.startsWith("Work email"))).toBe(true);
    expect(labels.some((t) => t.startsWith("Company"))).toBe(true);
    expect(labels.some((t) => t.startsWith("Phone"))).toBe(true);
  });

  it("keeps submit disabled until required fields are filled with a valid email", () => {
    mount(
      <LeadCaptureModal output={FAKE_OUTPUT} leadContext={FAKE_CONTEXT} onClose={() => {}} />,
    );
    expect(findSubmitButton().disabled).toBe(true);

    setInput("Name", "Jane Doe");
    setInput("Company", "Acme Capital");
    setInput("Work email", "not-an-email");
    expect(findSubmitButton().disabled).toBe(true);

    setInput("Work email", "jane@acme.com");
    expect(findSubmitButton().disabled).toBe(false);
  });

  it("submits the merged payload (form + snapshot context) to the Leads table", async () => {
    vi.mocked(sendToAirtable).mockResolvedValueOnce(true);
    mount(
      <LeadCaptureModal output={FAKE_OUTPUT} leadContext={FAKE_CONTEXT} onClose={() => {}} />,
    );
    setInput("Name", "Jane Doe");
    setInput("Company", "Acme Capital");
    setInput("Work email", "jane@acme.com");
    setInput("Phone", "+44 20 1234 5678");
    setInput("Anything", "We're closing a series B and need this fast.");

    const form = document.body.querySelector("form");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(sendToAirtable).toHaveBeenCalledTimes(1);
    const [tableName, payload] = vi.mocked(sendToAirtable).mock.calls[0];
    expect(tableName).toBe("Leads");
    expect(payload).toMatchObject({
      name: "Jane Doe",
      email: "jane@acme.com",
      company: "Acme Capital",
      phone: "+44 20 1234 5678",
      message: "We're closing a series B and need this fast.",
      snapshot_run_id: FAKE_OUTPUT.run_id,
      indicative_score: 72,
      indicative_band: "Amber",
      target_label: "eu_taxonomy_aligned_8_1",
      jurisdiction: "DE",
      facility_type: "hyperscale",
      cta_value: "request_project_readiness_report",
      status: "new",
      honeypot_tripped: false,
    });
  });

  it("renders the confirmation state when sendToAirtable resolves true", async () => {
    vi.mocked(sendToAirtable).mockResolvedValueOnce(true);
    mount(
      <LeadCaptureModal output={FAKE_OUTPUT} leadContext={FAKE_CONTEXT} onClose={() => {}} />,
    );
    setInput("Name", "Jane Doe");
    setInput("Company", "Acme Capital");
    setInput("Work email", "jane@acme.com");
    const form = document.body.querySelector("form");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(document.body.textContent).toMatch(/Got it — thank you/);
    expect(document.body.textContent).toMatch(/jane@acme\.com/);
  });

  it("renders the error state with a mailto fallback when sendToAirtable resolves false", async () => {
    vi.mocked(sendToAirtable).mockResolvedValueOnce(false);
    mount(
      <LeadCaptureModal output={FAKE_OUTPUT} leadContext={FAKE_CONTEXT} onClose={() => {}} />,
    );
    setInput("Name", "Jane Doe");
    setInput("Company", "Acme Capital");
    setInput("Work email", "jane@acme.com");
    const form = document.body.querySelector("form");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(document.body.textContent).toMatch(/Something went wrong/);
    const mailto = document.body.querySelector('a[href^="mailto:hello@perennitybridge.com"]');
    expect(mailto).toBeTruthy();
    expect(mailto.getAttribute("href")).toContain("Project%20Readiness%20Report%20enquiry");
  });

  it("hides the honeypot field from screen readers and tab order", () => {
    mount(
      <LeadCaptureModal output={FAKE_OUTPUT} leadContext={FAKE_CONTEXT} onClose={() => {}} />,
    );
    const honeypotWrapper = document.body.querySelector('[aria-hidden="true"]');
    expect(honeypotWrapper).toBeTruthy();
    const honeypotInput = honeypotWrapper.querySelector("input");
    expect(honeypotInput).toBeTruthy();
    expect(honeypotInput.getAttribute("tabIndex")).toBe("-1");
  });

  it("flags honeypot_tripped: true in the payload when the hidden field is filled", async () => {
    vi.mocked(sendToAirtable).mockResolvedValueOnce(true);
    mount(
      <LeadCaptureModal output={FAKE_OUTPUT} leadContext={FAKE_CONTEXT} onClose={() => {}} />,
    );
    setInput("Name", "Spam Bot");
    setInput("Company", "Spammers Inc");
    setInput("Work email", "bot@spam.test");
    // Fill the honeypot the way a bot would
    const honeypotInput = document.body.querySelector('[aria-hidden="true"] input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    act(() => {
      setter.call(honeypotInput, "http://spam.site");
      honeypotInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const form = document.body.querySelector("form");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    const [, payload] = vi.mocked(sendToAirtable).mock.calls[0];
    expect(payload.honeypot_tripped).toBe(true);
  });
});
