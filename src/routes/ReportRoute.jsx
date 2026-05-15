// @ts-check
// Gated /assessment/report route.
//
// Flow:
//   1. Read ?ref=<uuid v4> from the URL.
//   2. fetchEngagement(ref) — entitlement check against Airtable.
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
} from "@perennity/engine";
import { fetchEngagement } from "../lib/airtableEngagement.js";
import {
  ARTICLE_26_DISCLAIMER,
  ENTITLEMENT_ERROR_COPY,
  ENGINE_ERROR_COPY,
} from "../lib/disclaimers.js";

// Default signatory when the engagement record has no overrides set.
// Commit 3 will replace the placeholder URI with the real pre-signed
// PDF segment once the design lands.
const DEFAULT_SIGNATORY = {
  name: "Dolapo Olawale",
  title: "Chief Executive Officer, Perennity Bridge",
  signature_block_uri: "PLACEHOLDER_DEFER_TO_COMMIT_3",
};

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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Entitlement check.
      let entitlement;
      try {
        entitlement = await fetchEngagement(ref);
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
          signatory:
            entitlement.engagement.signatory_overrides ?? DEFAULT_SIGNATORY,
          disclaimer: ARTICLE_26_DISCLAIMER,
          // Deliberately ignore the engine's run_id arg: the engine generates a
          // fresh UUID per render (useful internal serial for replay/debug),
          // but the public engagement_reference must be the stable Airtable
          // UUID Dolapo issued — the same value the customer typed in ?ref=
          // and the primary key of the Engagements row.
          engagement_reference_for: () => entitlement.engagement.run_id,
          ic_defence_pack_version: "v1",
        });
        const run = await engine.run(
          entitlement.engagement.project_input,
          BUNDLED_ACTIVITIES,
        );
        const output = await renderer.render(run);
        if (cancelled) return;
        setReportOutput(output);
        setState("entitlement_valid");
      } catch (engineErr) {
        if (cancelled) return;
        console.error("[ReportRoute] engine render failed:", engineErr);
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
        <div className="max-w-md w-full bg-white border border-[#DDD5CA] rounded-lg p-8 shadow-sm text-center">
          <p className="text-base leading-relaxed">{ENGINE_ERROR_COPY.message}</p>
        </div>
      </div>
    );
  }

  // entitlement_valid — Commit 2 verification gate: eyeball the ReportOutput
  // structure as raw JSON. Commit 3 wires PDF generation.
  return (
    <div className="max-w-4xl mx-auto my-10 px-6 font-sans text-[#0B1F2A]">
      {engagement?.ecocc_parse_warning && (
        <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 text-sm text-yellow-900">
          <strong>ECoCC Practices JSON parse warning:</strong>{" "}
          {engagement.ecocc_parse_warning}
        </div>
      )}
      <h1 className="text-3xl font-bold mb-4">Report ready for review</h1>
      <pre className="font-mono text-xs bg-[#F8F6F2] border border-[#DDD5CA] rounded p-4 overflow-x-auto whitespace-pre">
        {JSON.stringify(reportOutput, null, 2)}
      </pre>
      <p className="mt-4 text-sm text-[#5C6B5C]">
        Commit 3 will replace this with a downloadable PDF.
      </p>
    </div>
  );
}
