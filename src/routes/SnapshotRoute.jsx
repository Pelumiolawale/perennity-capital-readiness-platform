import { useState } from "react";
import { IntakeWizard } from "../components/IntakeWizard";
import { SnapshotResults } from "../components/SnapshotResults";
import { runSnapshot } from "../lib/engineClient";
import { saveAssessment, clearDraft } from "../hooks/useAssessmentStore";

// SnapshotRoute owns the intake → engine → results flow. Local useState
// for phase only; we'll consolidate state mgmt on Day 4 once the shape is
// settled. No Airtable on Day 3 — write integration follows once the
// SnapshotOutput contract is exercised through the new path.
export function SnapshotRoute() {
  const [phase, setPhase] = useState("intake");
  const [output, setOutput] = useState(null);
  const [leadContext, setLeadContext] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (input) => {
    try {
      const snapshot = await runSnapshot(input);
      await saveAssessment(crypto.randomUUID(), input, snapshot);
      clearDraft();
      setOutput(snapshot);
      setLeadContext({
        target_label: input.target_label,
        jurisdiction: input.jurisdiction,
        facility_type: input.facility_type,
      });
      setPhase("results");
    } catch (e) {
      console.error("Snapshot failed:", e);
      setError((e && e.message) || String(e));
    }
  };

  if (error) {
    return (
      <div className="max-w-2xl mx-auto my-10 px-8 font-sans text-[#0B1F2A]">
        <h1 className="text-2xl font-bold text-[#A63D2F] mb-2">Snapshot failed</h1>
        <pre className="text-sm whitespace-pre-wrap bg-[#F8F6F2] p-4 rounded border border-[#DDD5CA]">
          {error}
        </pre>
        <button
          onClick={() => {
            setError(null);
            setPhase("intake");
          }}
          className="mt-4 underline text-[#1B6B4A]"
        >
          Try again
        </button>
      </div>
    );
  }

  if (phase === "results" && output) {
    return <SnapshotResults output={output} leadContext={leadContext} />;
  }

  return <IntakeWizard onSubmit={handleSubmit} />;
}
