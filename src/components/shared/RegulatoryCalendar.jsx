import React from 'react';
import { Calendar, Clock } from 'lucide-react';
import { getUpcomingDeadlines } from '../../constants/regulatoryCalendar.js';

const URGENCY_STYLES = {
  high: 'bg-red-50 border-red-200 text-red-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  low: 'bg-slate-50 border-slate-200 text-slate-600'
};

function daysUntil(dateStr) {
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function RegulatoryCalendar({ sfdrClassification }) {
  const frameworkMap = {
    'Article 9': ['EU_TAXONOMY', 'SFDR', 'CSRD'],
    'Article 8': ['EU_TAXONOMY', 'SFDR', 'CSRD'],
    'Article 6': ['SFDR', 'CSRD']
  };
  const relevantFrameworks = frameworkMap[sfdrClassification] || null;
  const deadlines = getUpcomingDeadlines(3, relevantFrameworks);

  if (deadlines.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-5 h-5 text-teal-600" />
        <h2 className="text-base font-semibold text-slate-800">Upcoming Regulatory Deadlines</h2>
      </div>
      <div className="space-y-3">
        {deadlines.map(d => {
          const days = daysUntil(d.deadline);
          return (
            <div key={d.id} className={`flex items-start gap-3 p-3 rounded-lg border ${URGENCY_STYLES[d.urgency]}`}>
              <Clock className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-tight">{d.milestone}</p>
                  <span className="text-xs font-medium whitespace-nowrap shrink-0">
                    {days < 365 ? `${days} days` : new Date(d.deadline).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <p className="text-xs mt-0.5 opacity-80 line-clamp-2">{d.description}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-400 mt-3">Calendar last reviewed: 3 April 2026</p>
    </div>
  );
}
