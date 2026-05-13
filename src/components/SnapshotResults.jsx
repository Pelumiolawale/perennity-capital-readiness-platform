// @ts-check
/** @typedef {import('@perennity/engine').SnapshotOutput} SnapshotOutput */
import { METHODOLOGY_VERSION } from "@perennity/engine";

/**
 * Renders a SnapshotOutput. Reads ONLY the closed allowlist
 * (run_id, indicative_score, indicative_band, heatmap, gap_list,
 * disclaimer, generated_at, cta). The engine's structural gate test
 * enforces what can appear in the input; this component does not
 * derive, enrich, or invent additional fields.
 *
 * Note on heatmap: SnapshotOutput exposes framework-level verdicts only
 * (HeatmapCell[] keyed by framework). Per-criterion SC/DNSH rows are
 * paid-tier-only — the allowlist deliberately excludes them. The Day 3
 * Snapshot therefore renders one row per framework cell, plus the static
 * safeguards-pending row.
 *
 * @param {{ output: SnapshotOutput }} props
 */
export function SnapshotResults({ output }) {
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
            <div
              key={cell.framework}
              className="flex justify-between items-center px-3.5 py-2.5 border border-[#DDD5CA] rounded bg-white"
            >
              <span>{cell.framework}</span>
              <VerdictPill verdict={cell.verdict} />
            </div>
          ))}
        </div>

        <div className="mt-3 px-3.5 py-2.5 border border-dashed border-[#C9BFB2] rounded text-[#5C6B5C] text-sm">
          Minimum safeguards: <em>Pending — assessed in paid Report</em>
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

        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => console.log("CTA clicked:", output.cta)}
            className="bg-[#0B1F2A] text-[#F8F6F2] px-7 py-3.5 rounded-lg text-base font-semibold cursor-pointer hover:bg-[#15293a]"
          >
            {ctaLabel(output.cta)}
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
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${map[verdict] || "bg-gray-200 text-gray-700"}`}>
      {verdict}
    </span>
  );
}

function ctaLabel(cta) {
  if (cta === "request_project_readiness_report") return "Request Project Readiness Report";
  return cta.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}
