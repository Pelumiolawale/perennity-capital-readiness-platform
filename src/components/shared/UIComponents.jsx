import React from 'react';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import TooltipHelp from './TooltipHelp.jsx';

export const StatusBadge = ({ status }) => {
  const styles = {
    excellent: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    compliant: 'bg-sky-100 text-sky-700 border-sky-200',
    warning: 'bg-amber-100 text-amber-700 border-amber-200',
    critical: 'bg-red-100 text-red-700 border-red-200'
  };
  const icons = {
    excellent: <CheckCircle className="w-4 h-4" />,
    compliant: <CheckCircle className="w-4 h-4" />,
    warning: <AlertTriangle className="w-4 h-4" />,
    critical: <XCircle className="w-4 h-4" />
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status]}`}>
      {icons[status]}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

export const ProgressBar = ({ value, color }) => {
  const colorClasses = {
    teal: 'bg-teal-500', emerald: 'bg-emerald-500',
    blue: 'bg-blue-500', amber: 'bg-amber-500',
    red: 'bg-red-500', gray: 'bg-gray-500'
  };
  const autoColor = value >= 70 ? 'teal' : value >= 50 ? 'amber' : 'red';
  const finalColor = color || autoColor;
  return (
    <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${colorClasses[finalColor]}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
};

export const FormStep = ({ children, title, subtitle, icon: Icon }) => (
  <div className="space-y-6">
    <div className="flex items-center gap-4 pb-4 border-b border-slate-200">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white">
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-slate-800">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
    {children}
  </div>
);

export const InputField = ({ label, helper, error, metricKey, children }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {metricKey && <TooltipHelp metricKey={metricKey} />}
    </label>
    {children}
    {helper && <p className="text-xs text-slate-500">{helper}</p>}
    {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
  </div>
);
