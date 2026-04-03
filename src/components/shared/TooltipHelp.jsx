import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react';
import { METRIC_HELP } from '../../constants/metricHelp.js';

export default function TooltipHelp({ metricKey }) {
  const [open, setOpen] = useState(false);
  const help = METRIC_HELP[metricKey];
  const ref = useRef(null);

  const { refs, floatingStyles } = useFloating({
    open,
    placement: 'top-start',
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (!refs.floating.current?.contains(e.target) && !refs.reference.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, refs]);

  if (!help) return null;

  return (
    <span className="inline-flex items-center ml-1">
      <button
        ref={refs.setReference}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-slate-400 hover:text-teal-600 transition-colors align-middle"
        aria-label={`Help: ${help.title}`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          className="z-50 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-4 text-left"
        >
          <p className="font-semibold text-slate-800 text-sm mb-1">{help.title}</p>
          <p className="text-xs text-slate-600 mb-2 leading-relaxed">{help.description}</p>
          {help.threshold && (
            <div className="flex items-center gap-1.5 text-xs text-teal-700 bg-teal-50 rounded-lg px-2 py-1.5 mb-2">
              <span className="font-medium">Threshold:</span>
              <span>{help.threshold}</span>
            </div>
          )}
          {help.formula && (
            <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-2 py-1.5 mb-2 font-mono">
              {help.formula}
            </div>
          )}
          {help.citation && (
            <p className="text-xs text-slate-400 italic">{help.citation}</p>
          )}
        </div>
      )}
    </span>
  );
}
