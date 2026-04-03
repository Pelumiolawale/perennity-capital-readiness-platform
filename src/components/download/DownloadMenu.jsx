import React, { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, FileText, Table, Braces, FileSpreadsheet } from 'lucide-react';
import { downloadHtmlReport } from '../../export/htmlExport.js';
import { downloadJson } from '../../export/jsonExport.js';
import { downloadPdf } from '../../export/pdfExport.js';
import { downloadExcel } from '../../export/excelExport.js';

export default function DownloadMenu({ formData, results, assessmentId }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleDownload(type) {
    setDownloading(type);
    setOpen(false);
    try {
      if (type === 'pdf') {
        await downloadPdf(formData, results, assessmentId);
      } else if (type === 'excel') {
        downloadExcel(formData, results, assessmentId);
      } else if (type === 'html') {
        downloadHtmlReport(formData, results);
      } else if (type === 'json') {
        downloadJson(formData, results, assessmentId);
      } else if (type === 'csv') {
        downloadCsv(formData, assessmentId);
      }
    } finally {
      setTimeout(() => setDownloading(null), 1000);
    }
  }

  function downloadCsv(fd, id) {
    const rows = [['Field', 'Value'], ...Object.entries(fd).map(([k, v]) => [k, Array.isArray(v) ? v.join('; ') : String(v)])];
    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `perennity-inputs-${id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const options = [
    { id: 'pdf', label: 'Download PDF', sublabel: 'Branded 4-page A4 report', icon: FileText, available: true, primary: true },
    { id: 'excel', label: 'Download Excel (.xlsx)', sublabel: '7-sheet workbook — Summary, Gaps, Taxonomy, CSRD…', icon: FileSpreadsheet, available: true },
    { id: 'html', label: 'Download HTML Report', sublabel: 'Full report, printable from browser', icon: FileText, available: true },
    { id: 'json', label: 'Download JSON', sublabel: 'Machine-readable data for API integration', icon: Braces, available: true },
    { id: 'csv', label: 'Download CSV (inputs)', sublabel: 'Form inputs as spreadsheet', icon: Table, available: true }
  ];

  const label = downloading
    ? `Generating ${options.find(o => o.id === downloading)?.label.split(' ')[1] || ''}…`
    : 'Download Report';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={!!downloading}
        className="px-5 py-2.5 bg-white text-teal-700 hover:bg-teal-50 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-60"
      >
        <Download className="w-4 h-4" />
        {label}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          {options.map(opt => (
            <button
              key={opt.id}
              onClick={() => handleDownload(opt.id)}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 cursor-pointer ${opt.primary ? 'bg-teal-50' : ''}`}
            >
              <opt.icon className={`w-4 h-4 mt-0.5 shrink-0 ${opt.primary ? 'text-teal-700' : 'text-teal-600'}`} />
              <div>
                <p className={`text-sm font-medium ${opt.primary ? 'text-teal-800' : 'text-slate-800'}`}>{opt.label}</p>
                <p className="text-xs text-slate-500">{opt.sublabel}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
