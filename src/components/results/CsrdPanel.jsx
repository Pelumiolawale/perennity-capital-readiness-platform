import React, { useState } from 'react';
import { FileBarChart, ChevronDown, ChevronUp, CheckCircle, XCircle } from 'lucide-react';
import { ProgressBar } from '../shared/UIComponents.jsx';

export default function CsrdPanel({ csrd }) {
  const [expanded, setExpanded] = useState(false);
  if (!csrd) return null;

  const color = csrd.overallScore >= 70 ? 'teal' : csrd.overallScore >= 40 ? 'amber' : 'red';
  const standards = [csrd.esrsE1, csrd.esrsE3, csrd.esrsE5].filter(Boolean);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <FileBarChart className="w-5 h-5 text-teal-600" />
          <div className="text-left">
            <p className="font-semibold text-slate-800">CSRD Readiness</p>
            <p className="text-sm text-slate-500">{csrd.label} — {csrd.overallScore}%</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-24 hidden sm:block">
            <ProgressBar value={csrd.overallScore} color={color} />
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-6 space-y-4">
          {standards.map((std, i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">{std.standard}</span>
                <span className="text-sm font-bold text-slate-800">{std.score}%</span>
              </div>
              <ProgressBar value={std.score} />
              {std.gaps.length > 0 && (
                <ul className="space-y-1">
                  {std.gaps.map((gap, j) => (
                    <li key={j} className="flex items-start gap-1.5 text-xs text-red-600">
                      <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      {gap}
                    </li>
                  ))}
                </ul>
              )}
              {std.gaps.length === 0 && (
                <p className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <CheckCircle className="w-3.5 h-3.5" /> All disclosures covered
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
