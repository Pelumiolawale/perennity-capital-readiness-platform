// @ts-check
/** @typedef {import('@perennity/engine').SnapshotOutput} SnapshotOutput */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sendToAirtable } from "../lib/airtableClient.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Modal for capturing a lead who wants to engage on the paid Project Readiness
 * Report tier. Submits to the Leads table in Airtable with the prospect's
 * snapshot context auto-attached so Dolapo has prep material before responding.
 *
 * @param {{
 *   output: SnapshotOutput,
 *   leadContext: { target_label: string, jurisdiction: string, facility_type: string },
 *   onClose: () => void,
 * }} props
 */
export function LeadCaptureModal({ output, leadContext, onClose }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState(/** @type {"form"|"confirmation"|"error"} */ ("form"));

  const modalRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    const focusables = modal.querySelectorAll(
      'input:not([type="hidden"]):not([aria-hidden="true"]), textarea, button, [tabindex]:not([tabindex="-1"])',
    );
    const first = /** @type {HTMLElement | undefined} */ (focusables[0]);
    const last = /** @type {HTMLElement | undefined} */ (focusables[focusables.length - 1]);
    first?.focus();
    function onKey(e) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && focusables.length > 0) {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, phase]);

  const canSubmit =
    name.trim().length > 0 &&
    company.trim().length > 0 &&
    EMAIL_RE.test(email.trim()) &&
    !submitting;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    const payload = {
      name: name.trim(),
      email: email.trim(),
      company: company.trim(),
      phone: phone.trim() || undefined,
      message: message.trim() || undefined,
      snapshot_run_id: output.run_id,
      indicative_score: output.indicative_score,
      indicative_band: output.indicative_band,
      target_label: leadContext.target_label,
      jurisdiction: leadContext.jurisdiction,
      facility_type: leadContext.facility_type,
      cta_value: output.cta,
      status: "new",
      honeypot_tripped: honeypot.length > 0,
    };
    const ok = await sendToAirtable("Leads", payload);
    setSubmitting(false);
    setPhase(ok ? "confirmation" : "error");
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  const mailtoFallback =
    "mailto:hello@perennitybridge.com" +
    "?subject=" +
    encodeURIComponent("Project Readiness Report enquiry") +
    "&body=" +
    encodeURIComponent(
      [
        `Name: ${name}`,
        `Email: ${email}`,
        `Company: ${company}`,
        phone ? `Phone: ${phone}` : null,
        ``,
        `Snapshot context:`,
        `- run_id: ${output.run_id}`,
        `- score: ${output.indicative_score} (${output.indicative_band})`,
        `- target: ${leadContext.target_label}`,
        `- jurisdiction: ${leadContext.jurisdiction}`,
        `- facility: ${leadContext.facility_type}`,
        ``,
        message ? `Message:\n${message}` : null,
      ]
        .filter((line) => line !== null)
        .join("\n"),
    );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8 overflow-y-auto"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-modal-title"
    >
      <div
        ref={modalRef}
        className="bg-[#F8F6F2] border border-[#DDD5CA] rounded-lg w-full max-w-[520px] p-8 shadow-xl"
      >
        {phase === "form" && (
          <form onSubmit={handleSubmit} noValidate>
            <h2
              id="lead-modal-title"
              className="font-['Source_Sans_3'] text-[22px] leading-[28px] font-semibold text-[#0B1F2A] mb-2"
            >
              Request a Project Readiness Report
            </h2>
            <p className="font-['Source_Serif_4'] text-[14px] leading-[20px] text-[#4A5760] mb-6">
              Tell us where to reach you. Dolapo will email back within two business days with next steps and timeline.
            </p>

            <ModalField label="Name" required>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-white font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A]"
              />
            </ModalField>

            <ModalField label="Work email" required>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-white font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A]"
              />
            </ModalField>

            <ModalField label="Company" required>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                autoComplete="organization"
                className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-white font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A]"
              />
            </ModalField>

            <ModalField label="Phone (optional)">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                className="w-full h-[44px] px-3 border border-[#D8DCDF] rounded-[4px] bg-white font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A]"
              />
            </ModalField>

            <ModalField label="Anything you'd like us to know? (optional)">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-[#D8DCDF] rounded-[4px] bg-white font-['Source_Serif_4'] text-[15px] text-[#0B1F2A] focus:outline-none focus:ring-2 focus:ring-[#0B1F2A] resize-vertical"
              />
            </ModalField>

            {/* Honeypot: real users never fill this; bots typically do. */}
            <div
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", overflow: "hidden" }}
            >
              <label>
                Website
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 font-['Source_Sans_3'] text-[14px] font-medium text-[#4A5760] bg-transparent border border-[#DDD5CA] rounded-[6px] hover:bg-[#F0EAE2] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="px-6 py-2.5 font-['Source_Sans_3'] text-[14px] font-semibold text-[#0B1F2A] bg-[#4ECDA4] rounded-[6px] hover:bg-[#3AB58D] disabled:bg-[#DDD5CA] disabled:text-[#8A957F] disabled:cursor-not-allowed cursor-pointer"
              >
                {submitting ? "Sending…" : "Send request"}
              </button>
            </div>
          </form>
        )}

        {phase === "confirmation" && (
          <div>
            <h2
              id="lead-modal-title"
              className="font-['Source_Sans_3'] text-[22px] leading-[28px] font-semibold text-[#0B1F2A] mb-3"
            >
              Got it — thank you.
            </h2>
            <p className="font-['Source_Serif_4'] text-[15px] leading-[22px] text-[#4A5760] mb-2">
              Dolapo will email you at <span className="text-[#0B1F2A] font-semibold">{email}</span> within two business days.
            </p>
            <p className="font-['Source_Serif_4'] text-[13px] leading-[20px] text-[#8A957F] mb-6">
              Your snapshot context has been attached so we can hit the ground running on the first call.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 font-['Source_Sans_3'] text-[14px] font-semibold text-[#F8F6F2] bg-[#0B1F2A] rounded-[6px] hover:bg-[#15293a] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div>
            <h2
              id="lead-modal-title"
              className="font-['Source_Sans_3'] text-[22px] leading-[28px] font-semibold text-[#A63D2F] mb-3"
            >
              Something went wrong on our side.
            </h2>
            <p className="font-['Source_Serif_4'] text-[15px] leading-[22px] text-[#4A5760] mb-4">
              We couldn&rsquo;t record your request automatically. Please email us directly — your details will be pre-filled.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPhase("form")}
                className="px-5 py-2.5 font-['Source_Sans_3'] text-[14px] font-medium text-[#4A5760] bg-transparent border border-[#DDD5CA] rounded-[6px] hover:bg-[#F0EAE2] cursor-pointer"
              >
                Try again
              </button>
              <a
                href={mailtoFallback}
                className="px-6 py-2.5 font-['Source_Sans_3'] text-[14px] font-semibold text-[#0B1F2A] bg-[#4ECDA4] rounded-[6px] hover:bg-[#3AB58D] no-underline"
              >
                Open email
              </a>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function ModalField({ label, required, children }) {
  return (
    <label className="block mb-4">
      <span className="block font-['Source_Sans_3'] text-[13px] leading-[18px] font-semibold text-[#0B1F2A] mb-1.5">
        {label}
        {required && <span className="text-[#A63D2F] ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
