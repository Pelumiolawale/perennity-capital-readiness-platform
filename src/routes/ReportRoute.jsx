// @ts-check
// Gated /assessment/report route.
//
// Flow:
//   1. Read ?ref=<uuid v4> from the URL.
//   2. fetchEngagementFromApi(ref) — entitlement check, run server-side by
//      api/engagement.js so no Airtable token ships in the bundle.
//   3. If valid → DeterministicEngine.run() → ReportRenderer.render() →
//      dump the ReportOutput as a <pre> JSON block. (Commit 3 replaces this
//      with the PDF generator.)
//   4. If entitlement fails (any reason) → opaque ENTITLEMENT_ERROR_COPY.
//   5. If the engine throws → opaque ENGINE_ERROR_COPY.
//
// We never surface the failure reason to the user — the reason lives in
// console.warn for the developer. This keeps the UI from being a probe
// for "does this engagement reference exist" attempts.

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DeterministicEngine,
  ReportRenderer,
  BUNDLED_ACTIVITIES,
  METHODOLOGY_VERSION,
  computeKnowledgeBaseHash,
  buildRenderContract,
} from "@perennity/engine";
import { fetchEngagementFromApi } from "../lib/engagementApi.js";
import { frameworksForLabel } from "../lib/engineClient.js";
import {
  buildSFDRInputs,
  c6ClaimIncompleteWarning,
} from "../lib/sfdrInputAdapter.js";
import { buildUKSDRInputs } from "../lib/ukSDRInputAdapter.js";
import { buildEntityInputs } from "../lib/entityInputAdapter.js";
import {
  serialisePAIDataFile,
  paiCsvFilename,
} from "../lib/paiCsvExport.js";
import {
  ARTICLE_26_DISCLAIMER,
  ENTITLEMENT_ERROR_COPY,
  ENGINE_ERROR_COPY,
} from "../lib/disclaimers.js";
import { generateReportPDF } from "../export/reportPDF.js";

// Default signatory when the engagement record has no overrides set.
//
// ITEM-11 / ITEM-13 (Sep 2026). Two things were wrong here.
//
// The name disagrees with docs/runbook-paid-reports.md, which says the
// report is signed by "Dolapo Faseun, Founder/Managing Director". The
// runbook and the company mailbox (dfaseun@) agree with each other and
// disagree with this constant. Changing a signatory on an
// audit-bearing document is the founder's call, not a code cleanup, so
// the name is left exactly as it was and flagged rather than silently
// corrected. See docs/paid-report-ux-cleanup-brief.md C2: "The parallel
// session should NOT pick a signatory; route this back to the founder."
//
// SIGNATURE_PENDING_URI is the literal placeholder that has been in
// place since commit 3 was deferred. It is exported so the PDF can
// recognise it and print an explicit "not yet countersigned" notice
// instead of the raw token — option B of brief C2, the lower-risk
// default until a real signature asset exists.
export const SIGNATURE_PENDING_URI = "PLACEHOLDER_DEFER_TO_COMMIT_3";

const DEFAULT_SIGNATORY = {
  name: "Dolapo Olawale",
  title: "Chief Executive Officer, Perennity Bridge",
  signature_block_uri: SIGNATURE_PENDING_URI,
};

/**
 * Merge the engagement's signatory overrides onto the default, field by
 * field.
 *
 * ITEM-13: this used to be `overrides ?? DEFAULT_SIGNATORY`, and
 * normalizeSignatoryOverrides returns an object as soon as ANY ONE of the
 * three Airtable cells is filled — with null in the other two. So filling
 * in just a title replaced the whole default and blanked the signatory's
 * name. The three cells are independent overrides and are now treated as
 * such: each blank cell falls back to the default on its own.
 *
 * @param {{name?: string|null, title?: string|null, signature_block_uri?: string|null} | null | undefined} overrides
 * @returns {{name: string, title: string, signature_block_uri: string}}
 */
export function resolveSignatory(overrides) {
  const o = overrides || {};
  return {
    name: o.name || DEFAULT_SIGNATORY.name,
    title: o.title || DEFAULT_SIGNATORY.title,
    signature_block_uri:
      o.signature_block_uri || DEFAULT_SIGNATORY.signature_block_uri,
  };
}

/**
 * Is this signatory backed by a real signature asset, or is it still the
 * deferred placeholder? Drives both the PDF's signature block and the
 * "Signed" claim on the report page.
 *
 * @param {{signature_block_uri?: string|null}} signatory
 * @returns {boolean}
 */
export function hasRealSignatureBlock(signatory) {
  const uri = signatory?.signature_block_uri;
  return typeof uri === "string" && uri.length > 0 && uri !== SIGNATURE_PENDING_URI;
}

// Engine commit SHA — injected at build time by vite.config.js's define
// block, which parses it from package-lock.json's @perennity/engine entry.
// Audit-bearing: missing SHA must fail loudly at module load.
const ENGINE_COMMIT_SHA = import.meta.env.VITE_ENGINE_COMMIT_SHA;
if (!ENGINE_COMMIT_SHA) {
  throw new Error(
    "VITE_ENGINE_COMMIT_SHA not defined. Check vite.config.js — this is an " +
      "audit-bearing field and must always be set at build time.",
  );
}

// Pre-compute the KB hash once per module load. Stable for the page's
// lifetime; refreshed on next reload or engine version bump.
const KB_HASH = computeKnowledgeBaseHash(BUNDLED_ACTIVITIES);

export default function ReportRoute() {
  const [searchParams] = useSearchParams();
  const ref = searchParams.get("ref");

  const [state, setState] = useState("checking_entitlement");
  const [engagement, setEngagement] = useState(null);
  const [reportOutput, setReportOutput] = useState(null);
  const [renderContract, setRenderContract] = useState(null);
  // Dev-mode diagnostic: capture the raw error so the failing-engagement
  // view can show it inline (gated to import.meta.env.DEV in the JSX). In
  // production the friendly ENGINE_ERROR_COPY is the only visible surface;
  // this state is unused.
  const [engineErrorDetail, setEngineErrorDetail] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Entitlement check.
      let entitlement;
      try {
        entitlement = await fetchEngagementFromApi(ref);
      } catch (err) {
        if (cancelled) return;
        console.warn(
          "[ReportRoute] entitlement check threw:",
          err && err.message ? err.message : err,
        );
        setState("entitlement_failed");
        return;
      }

      if (cancelled) return;

      if (!entitlement.ok) {
        console.warn(`[ReportRoute] entitlement failed: ${entitlement.reason}`);
        setState("entitlement_failed");
        return;
      }

      setEngagement(entitlement.engagement);

      // Engine render.
      try {
        const engine = new DeterministicEngine({
          engine_commit_sha: ENGINE_COMMIT_SHA,
          knowledge_base_hash: KB_HASH,
          methodology_version: METHODOLOGY_VERSION,
        });
        const renderer = new ReportRenderer({
          activities: BUNDLED_ACTIVITIES,
          signatory: resolveSignatory(
            entitlement.engagement.signatory_overrides,
          ),
          disclaimer: ARTICLE_26_DISCLAIMER,
          // Deliberately ignore the engine's run_id arg: the engine generates a
          // fresh UUID per render (useful internal serial for replay/debug),
          // but the public engagement_reference must be the stable Airtable
          // UUID Dolapo issued — the same value the customer typed in ?ref=
          // and the primary key of the Engagements row.
          engagement_reference_for: () => entitlement.engagement.run_id,
          ic_defence_pack_version: "v1",
        });
        // Resolve the framework set based on the engagement's target label.
        // For eu_taxonomy_aligned_8_1 (current paid-flow default), this
        // returns the single activity-aligned framework; for SFDR labels,
        // it includes the corresponding product_label framework so the
        // engine emits SFDR cells alongside the EU Tax 8.1 result.
        const frameworks = frameworksForLabel(
          entitlement.engagement.target_label ?? "eu_taxonomy_aligned_8_1",
        );
        // Merge SFDR inputs onto project_input when the engagement carries
        // SFDR Specifics fields. Undefined when no SFDR fields populated —
        // the engine cleanly resolves every SFDR criterion to
        // insufficient_evidence in that case.
        const sfdrInputs = buildSFDRInputs(entitlement.engagement);
        // v0.6.0 (UK SDR Phase 2): merge UK SDR inputs onto project_input
        // when the engagement carries UK SDR Specifics fields. Undefined
        // when no UK SDR fields populated — engine resolves every UK SDR
        // criterion to insufficient_evidence in that case.
        const ukSDRInputs = buildUKSDRInputs(entitlement.engagement);
        const projectInputBase = entitlement.engagement.project_input;
        const projectInput = {
          ...projectInputBase,
          ...(sfdrInputs ? { sfdr: sfdrInputs } : {}),
          ...(ukSDRInputs ? { uk_sdr: ukSDRInputs } : {}),
        };
        // Entity-level inputs from the new sfdr_entity_disclosures JSON
        // blob field. Undefined when the field is missing / empty / not
        // recognised, in which case the engine resolves c2/c3/c5/c7 to
        // insufficient_evidence and reportPDF surfaces the "ENTITY-LEVEL
        // DISCLOSURE REQUIRED" callout for those rows.
        const entityInput = buildEntityInputs(entitlement.engagement);
        const runInput = entityInput
          ? { project: projectInput, entity: entityInput }
          : projectInput;
        const run = await engine.run(runInput, frameworks);
        const output = await renderer.render(run);
        // Build the v3.5 RenderContract alongside the legacy ReportOutput.
        // The PDF generator reads ReportOutput for the EU Tax 8.1 sections
        // (existing path) and the RenderContract for SFDR sections (new
        // path). When no SFDR frameworks are loaded, framework_findings
        // is empty and the SFDR section pages don't render.
        const contract = buildRenderContract(run, {
          project: {
            project_name: entitlement.engagement?.report_metadata?.project_name ?? undefined,
          },
        });
        if (cancelled) return;
        setReportOutput(output);
        setRenderContract(contract);
        setState("entitlement_valid");
      } catch (engineErr) {
        if (cancelled) return;
        console.error("[ReportRoute] engine render failed:", engineErr);
        setEngineErrorDetail(engineErr);
        setState("engine_error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ref]);

  if (state === "checking_entitlement") {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-center font-sans text-[#5C6B5C]">
        <p className="text-lg">Verifying engagement…</p>
      </div>
    );
  }

  if (state === "entitlement_failed") {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6 font-sans text-[#0B1F2A]">
        <div className="max-w-md w-full bg-white border border-[#DDD5CA] rounded-lg p-8 shadow-sm text-center">
          <p className="text-base leading-relaxed">
            {ENTITLEMENT_ERROR_COPY.message}
          </p>
        </div>
      </div>
    );
  }

  if (state === "engine_error") {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6 font-sans text-[#0B1F2A]">
        <div className="max-w-2xl w-full bg-white border border-[#DDD5CA] rounded-lg p-8 shadow-sm">
          <p className="text-base leading-relaxed text-center">{ENGINE_ERROR_COPY.message}</p>
          {import.meta.env.DEV && engineErrorDetail && (
            <details className="mt-6 text-left text-xs text-[#5C6B5C] bg-[#F8F6F2] border border-[#DDD5CA] rounded p-4">
              <summary className="cursor-pointer font-mono text-[#A63D2F] font-semibold">
                Dev-mode diagnostic (visible only in import.meta.env.DEV)
              </summary>
              <p className="mt-3 font-mono whitespace-pre-wrap break-words text-[#0B1F2A]">
                <strong>{engineErrorDetail.name || "Error"}:</strong>{" "}
                {engineErrorDetail.message || String(engineErrorDetail)}
              </p>
              {engineErrorDetail.stack && (
                <pre className="mt-3 text-[10px] overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {engineErrorDetail.stack}
                </pre>
              )}
            </details>
          )}
        </div>
      </div>
    );
  }

  // entitlement_valid — Commit 3 wires the paid-tier PDF generator. The
  // route renders a brief summary card + Download button; the PDF itself
  // is rendered client-side by generateReportPDF on click.
  async function handleDownload() {
    try {
      const pdf = await generateReportPDF(
        reportOutput,
        {
          ...(engagement?.report_metadata ?? {}),
          target_label: engagement?.target_label ?? null,
        },
        renderContract,
      );
      const shortRef = (reportOutput.engagement_reference || "report").slice(0, 8);
      const date = new Date().toISOString().slice(0, 10);
      pdf.save(`perennity-report-${shortRef}-${date}.pdf`);
    } catch (err) {
      console.error("Report PDF generation failed:", err);
      alert(
        "Could not generate the PDF. Please try again or contact hello@perennitybridge.com.",
      );
    }
  }

  // 1.5b: PAI CSV download CTA visibility — render only when the contract
  // carries at least one SFDR framework finding. EU Tax 8.1-only Reports
  // hide the CTA (the CSV would be all-nulls, actively misleading for
  // institutional readers).
  const showPaiCsvCta =
    renderContract &&
    Array.isArray(renderContract.framework_findings) &&
    renderContract.framework_findings.length > 0;

  function handleDownloadPaiCsv() {
    try {
      const csv = serialisePAIDataFile(renderContract.pai_data_file);
      const filename = paiCsvFilename(
        renderContract.project?.project_id ||
          engagement?.report_metadata?.project_id ||
          "project",
      );
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PAI CSV download failed:", err);
      alert(
        "Could not generate the PAI data file. Please try again or contact hello@perennitybridge.com.",
      );
    }
  }

  const shortRef = (reportOutput?.engagement_reference || "").slice(0, 8);
  const generatedDate =
    reportOutput?.generated_at && typeof reportOutput.generated_at === "string"
      ? reportOutput.generated_at.slice(0, 10)
      : "—";

  return (
    <div className="max-w-2xl mx-auto my-10 px-8 font-sans text-[#0B1F2A]">
      {/* Input warnings. These are operator-facing: each one means a cell in
          Airtable was blank or unreadable and a criterion is reporting less
          than it could. The v3.2 banner was built but never rendered, and the
          c6 one is new with ITEM-05. */}
      {engagement?.ecocc_parse_warning && (
        <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 text-sm text-yellow-900">
          <strong>ECoCC Practices JSON parse warning:</strong>{" "}
          {engagement.ecocc_parse_warning}
        </div>
      )}
      {engagement?.v32_parse_warning && (
        <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 text-sm text-yellow-900">
          <strong>v3.2 Data Points (JSON) parse warning:</strong>{" "}
          {engagement.v32_parse_warning}
        </div>
      )}
      {!hasRealSignatureBlock(
        resolveSignatory(engagement?.signatory_overrides),
      ) && (
        <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 text-sm text-yellow-900">
          <strong>Not yet countersigned:</strong> no authorised signature block
          is recorded for this engagement, so the PDF carries a
          &ldquo;NOT YET COUNTERSIGNED&rdquo; notice. It is a draft for internal
          review and must not be issued to a client.
        </div>
      )}
      {c6ClaimIncompleteWarning(engagement) && (
        <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 text-sm text-yellow-900">
          <strong>Taxonomy claim incomplete:</strong>{" "}
          {c6ClaimIncompleteWarning(engagement)}
        </div>
      )}

      <h1 className="text-3xl font-bold mb-2">Report ready</h1>
      <p className="text-sm text-[#5C6B5C] mb-8">
        {/* ITEM-11: the page used to say "Signed" unconditionally, while the
            PDF carried no signature block at all. It now only claims a
            signature when there is one to claim. */}
        {hasRealSignatureBlock(resolveSignatory(engagement?.signatory_overrides))
          ? "Investor-grade. Signed. Issued under your engagement reference."
          : "Investor-grade. Issued under your engagement reference."}
      </p>

      <div className="bg-[#F8F6F2] border border-[#DDD5CA] rounded-xl p-6 mb-6">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
          <dt className="text-[#5C6B5C]">Engagement</dt>
          <dd className="font-mono text-[#0B1F2A] break-all">
            {shortRef ? `${shortRef}…` : "—"}
          </dd>
          <dt className="text-[#5C6B5C]">Client</dt>
          <dd className="text-[#0B1F2A]">
            {engagement?.report_metadata?.client_name || "—"}
          </dd>
          <dt className="text-[#5C6B5C]">Project</dt>
          <dd className="text-[#0B1F2A]">
            {engagement?.report_metadata?.project_name || "—"}
          </dd>
          <dt className="text-[#5C6B5C]">Generated</dt>
          <dd className="text-[#0B1F2A]">{generatedDate}</dd>
        </dl>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-3" data-testid="report-cta-row">
          <button
            type="button"
            onClick={handleDownload}
            className="bg-[#0B1F2A] text-[#F8F6F2] px-7 py-3.5 rounded-lg text-base font-semibold cursor-pointer hover:bg-[#15293a]"
          >
            Download PDF
          </button>
          {showPaiCsvCta && (
            <button
              type="button"
              onClick={handleDownloadPaiCsv}
              className="bg-transparent text-[#0B1F2A] border border-[#0B1F2A] px-[23px] py-[11px] rounded-md text-base font-medium cursor-pointer hover:bg-[#0B1F2A] hover:text-[#F8F6F2]"
              data-testid="pai-csv-cta"
            >
              Download PAI Data (CSV)
            </button>
          )}
        </div>
      </div>

      <div className="mt-10 pt-5 border-t border-[#DDD5CA] text-xs text-[#8A957F] leading-relaxed">
        <p>
          <strong>EU Taxonomy Article 26 disclaimer:</strong>{" "}
          {ARTICLE_26_DISCLAIMER}
        </p>
      </div>
    </div>
  );
}
