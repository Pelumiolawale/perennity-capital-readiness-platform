// @ts-check
/** @typedef {import('@perennity/engine').SnapshotOutput} SnapshotOutput */
/** @typedef {import('@perennity/engine').HeatmapCell} HeatmapCell */
/** @typedef {import('@perennity/engine').PillarVerdict} PillarVerdict */
import { useState } from "react";
import { METHODOLOGY_VERSION } from "@perennity/engine";
import { generateSnapshotPDF } from "../export/snapshotPDF.js";
import { LeadCaptureModal } from "./LeadCaptureModal.jsx";

const FRAMEWORK_LABELS = {
  minimum_safeguards: "Minimum Safeguards (Article 18)",
};

const PILLAR_LABELS = {
  human_rights: "Human Rights",
  bribery_corruption: "Bribery & Corruption",
  taxation: "Taxation",
  fair_competition: "Fair Competition",
};

const AUTHORITY_LABELS = {
  1: "Regulatory",
  2: "Perennity Bridge methodology",
  3: "Informational",
};

/**
 * Renders a SnapshotOutput. Reads only fields the engine's snapshot
 * allowlist exposes — see snapshot.gate.test.ts in the engine repo.
 *
 * @param {{
 *   output: SnapshotOutput,
 *   leadContext?: { target_label: string, jurisdiction: string, facility_type: string },
 * }} props
 */
export function SnapshotResults({ output, leadContext }) {
  const [leadModalOpen, setLeadModalOpen] = useState(false);

  function handleCTAClick() {
    // Only the request-readiness-report CTA opens the lead-capture flow.
    // Other engine CTA values (e.g. data-quality-improvement suggestions)
    // currently have no UI; revisit once the engine starts emitting them.
    if (output.cta === "request_project_readiness_report") {
      setLeadModalOpen(true);
    }
  }

  function handleDownloadPDF() {
    try {
      const pdf = generateSnapshotPDF(output);
      const shortId = (output.run_id || "snapshot").slice(0, 8);
      const date = new Date().toISOString().slice(0, 10);
      pdf.save(`perennity-snapshot-${shortId}-${date}.pdf`);
    } catch (err) {
      console.error("Snapshot PDF generation failed:", err);
      alert(
        "Could not generate the PDF. Please try again or contact hello@perennitybridge.com.",
      );
    }
  }

  return (
    <div className="max-w-2xl mx-auto my-10 px-8 font-sans text-[#0B1F2A]">
      <div className="text-xs text-[#A63D2F] text-center mb-4 uppercase tracking-wider font-semibold">
        Diagnostic — not investor-grade
      </div>

      <div className="bg-[#F8F6F2] border border-[#DDD5CA] rounded-xl p-8">
        <div className="flex items-baseline gap-4 mb-6">
          <div className="text-6xl font-bold text-[#0B1F2A]">{output.indicative_score}</div>
          <BandChip band={output.indicative_band} />
        </div>

        <h2 className="text-lg font-semibold mt-8 mb-3">Framework verdicts</h2>
        <div className="grid gap-2">
          {output.heatmap.map((cell) => (
            <HeatmapRow key={cell.framework} cell={cell} />
          ))}
        </div>

        <h2 className="text-lg font-semibold mt-8 mb-3">Gaps</h2>
        {output.gap_list.length === 0 ? (
          <p className="text-[#5C6B5C] text-sm">
            No gaps identified at Snapshot level. The paid Report assesses depth and safeguards.
          </p>
        ) : (
          <ol className="pl-5 leading-7 list-decimal">
            {output.gap_list.map((gap) => (
              <li key={gap.gap_id}>{gap.one_sentence_description}</li>
            ))}
          </ol>
        )}

        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={handleCTAClick}
            className="bg-[#0B1F2A] text-[#F8F6F2] px-7 py-3.5 rounded-lg text-base font-semibold cursor-pointer hover:bg-[#15293a]"
          >
            {ctaLabel(output.cta)}
          </button>
          <button
            type="button"
            onClick={handleDownloadPDF}
            className="text-[#0B1F2A] bg-transparent border border-[#DDD5CA] px-5 py-2 rounded text-sm font-medium cursor-pointer hover:bg-[#F0EAE2]"
          >
            Download PDF
          </button>
        </div>

        <div className="mt-10 pt-5 border-t border-[#DDD5CA] text-xs text-[#8A957F] leading-relaxed">
          <p>
            <strong>EU Taxonomy Article 26 disclaimer:</strong> this output is advisory and does not constitute regulatory assurance under Article 26 of Regulation (EU) 2020/852.
          </p>
          <p className="mt-2 text-[11px]">
            Methodology version: {METHODOLOGY_VERSION}
          </p>
        </div>
      </div>

      {leadModalOpen && leadContext && (
        <LeadCaptureModal
          output={output}
          leadContext={leadContext}
          onClose={() => setLeadModalOpen(false)}
        />
      )}
    </div>
  );
}

function BandChip({ band }) {
  const map = {
    Green: "bg-[rgba(78,205,164,0.18)] text-[#1B6B4A]",
    Amber: "bg-[rgba(184,134,11,0.15)] text-[#B8860B]",
    Red: "bg-[rgba(166,61,47,0.15)] text-[#A63D2F]",
  };
  return (
    <span className={`px-3.5 py-1.5 rounded-full text-sm font-semibold ${map[band] || "bg-gray-200 text-gray-700"}`}>
      {band}
    </span>
  );
}

function VerdictPill({ verdict }) {
  const map = {
    pass: "bg-[rgba(27,107,74,0.12)] text-[#1B6B4A]",
    partial: "bg-[rgba(184,134,11,0.15)] text-[#B8860B]",
    fail: "bg-[rgba(166,61,47,0.15)] text-[#A63D2F]",
    data_missing: "bg-[rgba(92,107,92,0.12)] text-[#5C6B5C]",
  };
  const labelMap = { data_missing: "data missing" };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${map[verdict] || "bg-gray-200 text-gray-700"}`}>
      {labelMap[verdict] ?? verdict}
    </span>
  );
}

/** @param {{ cell: HeatmapCell }} props */
function HeatmapRow({ cell }) {
  const label = FRAMEWORK_LABELS[cell.framework] ?? cell.framework;
  const isSafeguards = cell.framework === "minimum_safeguards";
  // Defensive consumption of the v0.4.0+ HeatmapCell.archetype field. Surfaced
  // on the row as a data-attribute so it's DOM-inspectable but invisible to
  // users. Phase 1 (SFDR) will design the visible chip/label. Undefined on
  // pre-v0.4.0 engine output and on the minimum_safeguards cell — React omits
  // the attribute when the value is undefined, so legacy data renders unchanged.
  const { archetype } = cell;
  return (
    <div
      className="border border-[#DDD5CA] rounded bg-white"
      data-archetype={archetype}
    >
      <div className="flex justify-between items-center px-3.5 py-2.5 gap-3">
        <span className="flex-1">{label}</span>
        {cell.authority_level && <AuthorityChip level={cell.authority_level} />}
        <VerdictPill verdict={cell.verdict} />
      </div>
      {isSafeguards && cell.pillar_verdicts && cell.pillar_verdicts.length > 0 && (
        <div className="px-3.5 pb-2.5 pt-1 flex flex-wrap gap-1.5 border-t border-[#F0EAE2]">
          {cell.pillar_verdicts.map((pv) => (
            <PillarPill key={pv.pillar_id} pillar={pv} />
          ))}
        </div>
      )}
    </div>
  );
}

/** @param {{ level: 1 | 2 | 3 }} props */
function AuthorityChip({ level }) {
  const label = AUTHORITY_LABELS[level];
  if (!label) return null;
  return (
    <span className="px-2 py-0.5 rounded border border-[#DDD5CA] text-[10px] uppercase tracking-wider text-[#5C6B5C] whitespace-nowrap">
      {label}
    </span>
  );
}

/** @param {{ pillar: PillarVerdict }} props */
function PillarPill({ pillar }) {
  const map = {
    pass: "bg-[rgba(78,205,164,0.18)] text-[#1B6B4A] border-[rgba(78,205,164,0.4)]",
    partial: "bg-[rgba(184,134,11,0.12)] text-[#B8860B] border-[rgba(184,134,11,0.3)]",
    fail: "bg-[rgba(166,61,47,0.12)] text-[#A63D2F] border-[rgba(166,61,47,0.3)]",
    data_missing: "bg-[rgba(92,107,92,0.08)] text-[#5C6B5C] border-[#DDD5CA]",
    not_applicable: "bg-[rgba(92,107,92,0.08)] text-[#5C6B5C] border-[#DDD5CA]",
  };
  const cls = map[pillar.verdict] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] border ${cls}`}>
      {PILLAR_LABELS[pillar.pillar_id] ?? pillar.pillar_id}
    </span>
  );
}

function ctaLabel(cta) {
  if (cta === "request_project_readiness_report") return "Request Project Readiness Report";
  return cta.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}
