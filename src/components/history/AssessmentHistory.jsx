import React, { useState, useEffect } from 'react';
import { History, Trash2, FolderOpen, X, Download } from 'lucide-react';
import { listAssessments, deleteAssessment } from '../../hooks/useAssessmentStore.js';
import { downloadExcel } from '../../export/excelExport.js';
import { downloadJson } from '../../export/jsonExport.js';

function ScoreBadge({ score }) {
  if (score == null) return <span className="text-xs text-slate-400">—</span>;
  const color = score >= 70 ? 'bg-emerald-100 text-emerald-700' : score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{score}%</span>;
}

export default function AssessmentHistory({ onLoad, open, onClose }) {
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listAssessments().then(list => { setAssessments(list); setLoading(false); });
  }, [open]);

  async function handleDelete(id, e) {
    e.stopPropagation();
    await deleteAssessment(id);
    setAssessments(prev => prev.filter(a => a.id !== id));
  }

  function handleLoad(record) {
    onLoad(record);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-teal-600">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-white" />
            <h2 className="font-semibold text-white">Assessment History</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-teal-700 transition-colors">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading…</div>
          )}

          {!loading && assessments.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
              <History className="w-10 h-10 opacity-30" />
              <p className="text-sm">No saved assessments yet</p>
              <p className="text-xs text-center px-8">Complete an assessment and click "Save to History" to store it here.</p>
            </div>
          )}

          {!loading && assessments.map(record => (
            <div
              key={record.id}
              className="flex items-start gap-3 px-5 py-4 border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={() => handleLoad(record)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium text-slate-800 text-sm truncate">{record.projectName}</p>
                  <ScoreBadge score={record.overallScore} />
                </div>
                <p className="text-xs text-slate-500">
                  {record.country} · {record.sfdrClassification || 'N/A'} · {new Date(record.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">{record.id}</p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  title="Load this assessment"
                  onClick={e => { e.stopPropagation(); handleLoad(record); }}
                  className="p-1.5 rounded hover:bg-teal-100 text-teal-600 transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
                {record.results && (
                  <button
                    title="Export as JSON"
                    onClick={e => { e.stopPropagation(); downloadJson(record.formData, record.results, record.id); }}
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-500 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  title="Delete"
                  onClick={e => handleDelete(record.id, e)}
                  className="p-1.5 rounded hover:bg-red-100 text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50">
          <p className="text-xs text-slate-400">Stored locally in your browser. Clearing browser data will remove history.</p>
        </div>
      </div>
    </div>
  );
}
