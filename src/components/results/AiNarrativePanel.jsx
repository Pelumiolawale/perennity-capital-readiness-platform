import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { generateGapNarrative } from '../../engine/aiAnalysis.js';

export default function AiNarrativePanel({ formData, results }) {
  const [narrative, setNarrative] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const abortRef = useRef(false);

  async function loadNarrative() {
    if (!import.meta.env.VITE_ANTHROPIC_API_KEY) return;
    abortRef.current = false;
    setLoading(true);
    setNarrative('');
    setError(null);

    try {
      for await (const chunk of generateGapNarrative(formData, results)) {
        if (abortRef.current) break;
        setNarrative(prev => prev + chunk);
      }
      setHasLoaded(true);
    } catch (err) {
      setError('AI analysis temporarily unavailable. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNarrative();
    return () => { abortRef.current = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Don't render if no API key configured
  if (!import.meta.env.VITE_ANTHROPIC_API_KEY) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-teal-100 overflow-hidden">
      <div className="bg-gradient-to-r from-teal-50 to-emerald-50 px-6 py-4 border-b border-teal-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-teal-600" />
          <h2 className="text-base font-semibold text-slate-800">AI Expert Analysis</h2>
          <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium">Powered by Claude</span>
        </div>
        {hasLoaded && !loading && (
          <button
            onClick={loadNarrative}
            className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-800 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerate
          </button>
        )}
      </div>

      <div className="p-6">
        {error && (
          <div className="flex items-start gap-2 text-amber-700 bg-amber-50 rounded-lg p-3 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && !narrative && (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            <span className="ml-1">Analysing regulatory gaps…</span>
          </div>
        )}

        {narrative && (
          <div className="prose prose-sm prose-slate max-w-none text-slate-700 leading-relaxed whitespace-pre-wrap">
            {narrative}
            {loading && <span className="inline-block w-1 h-4 bg-teal-500 animate-pulse ml-0.5 align-middle" />}
          </div>
        )}
      </div>
    </div>
  );
}
