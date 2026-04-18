import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const SIDEBAR_KEY = "pb_sidebar_collapsed";
import pbDarkLogo from "./assets/pb_dark_v2.png";
import pbRgbaLogo from "./assets/pb_rgba.png";
import { runAssessment as runScoringEngine, determineSfdrClassification, determineUkSdrEligibility, determineEuTaxonomyAlignment, REGION_WEIGHTS as ENGINE_REGION_WEIGHTS, REGION_THRESHOLDS as ENGINE_REGION_THRESHOLDS } from "./engine/scoring.js";
import { downloadPdf } from "./export/pdfExport.js";
import { downloadExcel } from "./export/excelExport.js";
import { generateNarrative, answerRegulatoryQuestion } from "./engine/aiAnalysis.js";
import { saveAssessment, listAssessments, loadAssessmentById, deleteAssessment, saveDraft, loadDraft, clearDraft } from "./hooks/useAssessmentStore.js";
import { getApplicableFrameworks, flattenFrameworks, FINANCING_LABELS } from "./regulations/frameworks/financing-labels.js";

// ============================================================
// PERENNITY CAPITAL READINESS PLATFORM — FULL MVP APPLICATION
// ============================================================

// ─── AIRTABLE BACKEND ───────────────────────────────────────
const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID;
const AIRTABLE_API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY;

async function sendToAirtable(tableName, fields) {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
    console.error("❌ Airtable credentials not configured. Check your .env.local file and restart the dev server.");
    console.log("BASE_ID present:", !!AIRTABLE_BASE_ID, "API_KEY present:", !!AIRTABLE_API_KEY);
    return false;
  }
  console.log(`📤 Sending to Airtable table "${tableName}":`, fields);
  try {
    const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      const error = await res.json();
      console.error("❌ Airtable error:", error);
      if (tableName === "Users") {
        console.error('Airtable Users error:', error);
      }
      return false;
    }
    const result = await res.json();
    console.log(`✅ Successfully sent to Airtable table "${tableName}"`);
    if (tableName === "Users") {
      console.log('Airtable Users response:', result);
    }
    return true;
  } catch (err) {
    console.error("❌ Airtable send failed:", err);
    if (tableName === "Users") {
      console.error('Airtable Users error:', err);
    }
    return false;
  }
}

// ─── DESIGN TOKENS ──────────────────────────────────────────
const COLORS = {
  bg: "#F6F1EB",
  surface: "#FFFFFF",
  surfaceRaised: "#F0EAE2",
  surfaceHover: "#EBE4DA",
  border: "#DDD5CA",
  borderLight: "#C9BFB2",
  text: "#1A2E1A",
  textSecondary: "#5C6B5C",
  textMuted: "#8A957F",
  accent: "#1B6B4A",
  accentHover: "#15573C",
  accentSubtle: "rgba(27,107,74,0.07)",
  green: "#1B6B4A",
  greenBg: "rgba(27,107,74,0.08)",
  amber: "#B8860B",
  amberBg: "rgba(184,134,11,0.08)",
  red: "#A63D2F",
  redBg: "rgba(166,61,47,0.08)",
  purple: "#5B4A8A",
};

// ─── REGION CONFIG ──────────────────────────────────────────
const REGION_WEIGHTS = {
  EU: { sa: 0.35, epv: 0.20, wre: 0.15, csr: 0.15, dfr: 0.15 },
  UK: { sa: 0.30, epv: 0.25, wre: 0.15, csr: 0.15, dfr: 0.15 },
  US: { sa: 0.20, epv: 0.35, wre: 0.15, csr: 0.15, dfr: 0.15 },
  MENA: { sa: 0.30, epv: 0.25, wre: 0.15, csr: 0.15, dfr: 0.15 },
};

const REGION_THRESHOLDS = {
  EU: { pue: 1.3, renewableMin: 50, wue: 0.5 },
  UK: { pue: 1.35, renewableMin: 40, wue: 0.6 },
  US: { pue: 1.4, renewableMin: 30, wue: 0.8 },
  MENA: { pue: 1.4, renewableMin: 35, wue: 0.9 },
};

const DC_MARKETS = {
  'North America': {
    countries: ['United States', 'Canada', 'Mexico'],
    defaults: { waterStress: 'medium', gridCarbon: 'medium' }
  },
  'Europe': {
    countries: ['United Kingdom', 'Germany', 'Netherlands', 'France', 'Ireland', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland', 'Spain'],
    defaults: { waterStress: 'low', gridCarbon: 'low-medium' }
  },
  'Asia-Pacific': {
    countries: ['Singapore', 'Australia', 'Japan', 'South Korea', 'India', 'Hong Kong', 'Malaysia'],
    defaults: { waterStress: 'high', gridCarbon: 'high' }
  },
  'MENA': {
    countries: ['United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Bahrain', 'Kuwait', 'Oman', 'Egypt', 'Jordan', 'Morocco'],
    defaults: { waterStress: 'extreme', gridCarbon: 'high' }
  },
  'Africa': {
    countries: ['South Africa', 'Nigeria', 'Kenya', 'Ghana', 'Egypt', 'Ethiopia'],
    defaults: { waterStress: 'high', gridCarbon: 'medium-high' }
  },
  'Latin America': {
    countries: ['Brazil', 'Chile', 'Colombia', 'Mexico', 'Argentina'],
    defaults: { waterStress: 'medium', gridCarbon: 'low-medium' }
  }
};

const COUNTRY_PROFILES = {
  'United Arab Emirates':   { pueTarget: 1.5, waterStress: 'extreme', gridCarbon: 550, renewableGrid: 5 },
  'Saudi Arabia':           { pueTarget: 1.5, waterStress: 'extreme', gridCarbon: 580, renewableGrid: 4 },
  'Qatar':                  { pueTarget: 1.5, waterStress: 'extreme', gridCarbon: 490, renewableGrid: 2 },
  'United Kingdom':         { pueTarget: 1.5, waterStress: 'low',     gridCarbon: 230, renewableGrid: 40 },
  'Germany':                { pueTarget: 1.3, waterStress: 'low',     gridCarbon: 385, renewableGrid: 46 },
  'Netherlands':            { pueTarget: 1.3, waterStress: 'medium',  gridCarbon: 290, renewableGrid: 25 },
  'Ireland':                { pueTarget: 1.3, waterStress: 'low',     gridCarbon: 295, renewableGrid: 35 },
  'Sweden':                 { pueTarget: 1.2, waterStress: 'low',     gridCarbon: 45,  renewableGrid: 98 },
  'Norway':                 { pueTarget: 1.2, waterStress: 'low',     gridCarbon: 30,  renewableGrid: 99 },
  'Finland':                { pueTarget: 1.2, waterStress: 'low',     gridCarbon: 80,  renewableGrid: 75 },
  'Denmark':                { pueTarget: 1.2, waterStress: 'low',     gridCarbon: 175, renewableGrid: 55 },
  'France':                 { pueTarget: 1.3, waterStress: 'low',     gridCarbon: 85,  renewableGrid: 25 },
  'Singapore':              { pueTarget: 1.3, waterStress: 'high',    gridCarbon: 408, renewableGrid: 3 },
  'India':                  { pueTarget: 1.5, waterStress: 'high',    gridCarbon: 708, renewableGrid: 20 },
  'Australia':              { pueTarget: 1.5, waterStress: 'high',    gridCarbon: 490, renewableGrid: 27 },
  'Japan':                  { pueTarget: 1.4, waterStress: 'low',     gridCarbon: 462, renewableGrid: 22 },
  'United States':          { pueTarget: 1.5, waterStress: 'medium',  gridCarbon: 386, renewableGrid: 21 },
  'Canada':                 { pueTarget: 1.4, waterStress: 'low',     gridCarbon: 150, renewableGrid: 66 },
  'Brazil':                 { pueTarget: 1.5, waterStress: 'medium',  gridCarbon: 110, renewableGrid: 83 },
  'South Africa':           { pueTarget: 1.6, waterStress: 'high',    gridCarbon: 780, renewableGrid: 8 },
  'Nigeria':                { pueTarget: 1.8, waterStress: 'medium',  gridCarbon: 430, renewableGrid: 15 },
  'Kenya':                  { pueTarget: 1.6, waterStress: 'high',    gridCarbon: 170, renewableGrid: 74 },
  'Egypt':                  { pueTarget: 1.6, waterStress: 'extreme', gridCarbon: 460, renewableGrid: 12 },
  'Poland':                 { pueTarget: 1.3, waterStress: 'low',     gridCarbon: 680, renewableGrid: 15 },
  'Chile':                  { pueTarget: 1.4, waterStress: 'high',    gridCarbon: 290, renewableGrid: 45 },
};

const DEFAULT_COUNTRY_PROFILE = { pueTarget: 1.5, waterStress: 'medium', gridCarbon: 450, renewableGrid: 20 };

function getCountryProfile(country) {
  return COUNTRY_PROFILES[country] || DEFAULT_COUNTRY_PROFILE;
}

// Unified 4-band readiness model (v3.1). Must match engine READINESS_BANDS.
const READINESS_BANDS = [
  { min: 75, label: "Capital Ready",        color: COLORS.green },
  { min: 55, label: "Conditionally Ready",  color: COLORS.amber },
  { min: 35, label: "Development Stage",    color: COLORS.purple },
  { min: 0,  label: "Pre-Development",      color: COLORS.red },
];

// ─── STYLE HELPERS ──────────────────────────────────────────
const css = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=DM+Serif+Display&family=JetBrains+Mono:wght@400;500&display=swap');

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #root { height: 100%; }
body { font-family: 'DM Sans', -apple-system, sans-serif; background: ${COLORS.bg}; color: ${COLORS.text}; }

.main-scroll { overflow-y: auto; scroll-behavior: smooth; }

h1, h2, h3 { font-family: 'DM Serif Display', Georgia, serif; font-weight: 400; }

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: ${COLORS.borderLight}; }

input, select, textarea {
  font-family: 'DM Sans', sans-serif;
  background: #FFFFFF;
  border: 1px solid ${COLORS.border};
  color: ${COLORS.text};
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 14px;
  width: 100%;
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
}
input:focus, select:focus, textarea:focus {
  border-color: ${COLORS.accent};
  box-shadow: 0 0 0 3px ${COLORS.accentSubtle};
}
select { cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%235C6B5C' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 36px; }
textarea { resize: vertical; min-height: 100px; }
input[type="checkbox"] { width: auto; accent-color: ${COLORS.accent}; }

@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
@keyframes scoreReveal { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes ringFill { from { stroke-dashoffset: 440; } }

@media (max-width: 640px) {
  .step-indicator-desktop { display: none !important; }
  .step-indicator-mobile { display: block !important; }
}
`;

// ─── COMPONENTS ─────────────────────────────────────────────

function Icon({ name, size = 18, color = "currentColor" }) {
  const icons = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    projects: <><path d="M3 7V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2"/><polyline points="8 12 12 8 16 12"/></>,
    assessment: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    reports: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
    advisory: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    arrow: <><polyline points="9 18 15 12 9 6"/></>,
    arrowLeft: <><polyline points="15 18 9 12 15 6"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
    alert: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    info: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    star: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    droplet: <><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></>,
    cloud: <><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></>,
    target: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    panelClose: <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="15 9 12 12 15 15"/></>,
    panelOpen: <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="13 9 16 12 13 15"/></>,
    helpCircle: <><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  );
}

function Button({ children, variant = "primary", size = "md", icon, onClick, disabled, style = {} }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer",
    border: "none", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
    transition: "all 0.2s", opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap",
  };
  const sizes = { sm: { padding: "6px 14px", fontSize: 13 }, md: { padding: "10px 20px", fontSize: 14 }, lg: { padding: "14px 28px", fontSize: 15 } };
  const variants = {
    primary: { background: COLORS.accent, color: "#fff" },
    secondary: { background: "transparent", color: COLORS.textSecondary, border: `1px solid ${COLORS.border}` },
    ghost: { background: "transparent", color: COLORS.textSecondary },
    danger: { background: COLORS.redBg, color: COLORS.red },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...base, ...sizes[size], ...variants[variant], ...style }}>
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />} {children}
    </button>
  );
}

function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12,
      padding: 24, cursor: onClick ? "pointer" : "default",
      transition: "border-color 0.2s, transform 0.2s, box-shadow 0.2s",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      ...style,
    }}
    onMouseEnter={e => { if (onClick) { e.currentTarget.style.borderColor = COLORS.borderLight; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)"; }}}
    onMouseLeave={e => { if (onClick) { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"; }}}
    >
      {children}
    </div>
  );
}

function Tooltip({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 4, verticalAlign: "middle" }}>
      <span onClick={() => setOpen(o => !o)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} style={{ cursor: "pointer", color: COLORS.textMuted, display: "inline-flex" }}>
        <Icon name="helpCircle" size={14} color={COLORS.textMuted} />
      </span>
      {open && (
        <span style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", width: 280, padding: "8px 12px", fontSize: 12, lineHeight: 1.5, color: "#fff", background: "#1e293b", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.2)", zIndex: 100, pointerEvents: "none" }}>
          {text}
          <span style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", border: "5px solid transparent", borderTopColor: "#1e293b" }} />
        </span>
      )}
    </span>
  );
}

function FormField({ label, help, required, tooltip, error, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: COLORS.textSecondary, marginBottom: 6 }}>
        {label} {required && <span style={{ color: COLORS.red }}>*</span>}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
      {children}
      {help && !error && <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>{help}</div>}
      {error && <div style={{ fontSize: 12, color: COLORS.red, fontWeight: 500, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

function ScoreRing({ score, size = 160, strokeWidth = 10, color }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const ringColor = color || (score >= 80 ? COLORS.green : score >= 60 ? COLORS.amber : COLORS.red);
  
  return (
    <svg width={size} height={size} style={{ animation: "scoreReveal 0.6s ease-out" }}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={COLORS.border} strokeWidth={strokeWidth} />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={ringColor} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dashoffset 1.2s ease-out", animation: "ringFill 1.2s ease-out" }}
      />
      <text x={size/2} y={size/2 - 8} textAnchor="middle" fill={COLORS.text} fontSize={size * 0.28} fontWeight="700" fontFamily="'DM Sans'">{score}</text>
      <text x={size/2} y={size/2 + 16} textAnchor="middle" fill={COLORS.textSecondary} fontSize={12} fontFamily="'DM Sans'">out of 100</text>
    </svg>
  );
}

function PillarCard({ name, score, icon, weight, onClick }) {
  const color = score >= 80 ? COLORS.green : score >= 60 ? COLORS.amber : COLORS.red;
  const bgColor = score >= 80 ? COLORS.greenBg : score >= 60 ? COLORS.amberBg : COLORS.redBg;
  return (
    <Card onClick={onClick} style={{ padding: 20, cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: bgColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name={icon} size={18} color={color} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.text }}>{name}</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted }}>Weight: {Math.round(weight * 100)}%</div>
          </div>
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: "'JetBrains Mono'" }}>{score}</div>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: COLORS.border, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score}%`, background: color, borderRadius: 2, transition: "width 1s ease-out" }} />
      </div>
    </Card>
  );
}

function StepIndicator({ steps, currentStep, onStepClick }) {
  const shortLabels = ["Project", "Specs", "Energy", "Water", "Climate", "Sustain.", "Delivery", "Review"];
  return (
    <>
      {/* Desktop: numbered circles with connecting lines */}
      <div className="step-indicator-desktop" style={{ display: "flex", alignItems: "flex-start", padding: "16px 0" }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
            <div onClick={() => onStepClick?.(i)} style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", minWidth: 32 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, transition: "all 0.2s",
                background: i < currentStep ? "#0B1F2A" : i === currentStep ? "#4ECDA4" : "transparent",
                color: i <= currentStep ? "#fff" : COLORS.textMuted,
                border: i > currentStep ? `2px solid ${COLORS.border}` : "2px solid transparent",
                boxShadow: i === currentStep ? "0 2px 8px rgba(78,205,164,0.3)" : "none",
              }}>
                {i < currentStep ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : i + 1}
              </div>
              <div style={{ fontSize: 10, marginTop: 4, color: i === currentStep ? COLORS.text : COLORS.textMuted, fontWeight: i === currentStep ? 600 : 400, textAlign: "center", maxWidth: 56, lineHeight: 1.2 }}>
                {shortLabels[i] || step}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, margin: "0 4px", marginBottom: 18, background: i < currentStep ? "#0B1F2A" : COLORS.border, transition: "background 0.2s", minWidth: 12 }} />
            )}
          </div>
        ))}
      </div>
      {/* Mobile: compact text */}
      <div className="step-indicator-mobile" style={{ display: "none", textAlign: "center", padding: "12px 0" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#4ECDA4" }}>Step {currentStep + 1} of {steps.length}</span>
        <span style={{ fontSize: 13, color: COLORS.textSecondary, marginLeft: 8 }}>{shortLabels[currentStep] || steps[currentStep]}</span>
      </div>
    </>
  );
}

function EmptyState({ icon, title, description, action, onAction }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 40px", animation: "fadeIn 0.4s ease-out" }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: COLORS.accentSubtle, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
        <Icon name={icon} size={28} color={COLORS.accent} />
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{title}</h3>
      <p style={{ color: COLORS.textSecondary, fontSize: 14, marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>{description}</p>
      {action && <Button onClick={onAction} icon="plus">{action}</Button>}
    </div>
  );
}

// ─── LOADING ANIMATION ──────────────────────────────────────
function AssessmentLoading({ onComplete }) {
  const [step, setStep] = useState(0);
  const steps = [
    "Checking sustainability alignment",
    "Reviewing energy and power viability",
    "Evaluating water and resource efficiency",
    "Running climate resilience checks",
    "Assessing delivery readiness",
    "Applying country-specific weighting",
    "Checking hard-stop rules",
    "Generating recommendations",
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setStep(s => {
        if (s >= steps.length - 1) {
          clearInterval(timer);
          setTimeout(onComplete, 600);
          return s;
        }
        return s + 1;
      });
    }, 450);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 500, animation: "fadeIn 0.4s ease-out" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", border: `3px solid ${COLORS.border}`, borderTopColor: COLORS.accent, animation: "spin 1s linear infinite", marginBottom: 32 }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 32 }}>Running Capital Readiness Assessment</h2>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {steps.map((s, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "8px 0",
            opacity: i <= step ? 1 : 0.3, transition: "opacity 0.3s",
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: i < step ? COLORS.green : i === step ? COLORS.accent : COLORS.border,
              transition: "background 0.3s",
            }}>
              {i < step ? <Icon name="check" size={12} color="#fff" /> : i === step ? <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", animation: "pulse 1s infinite" }} /> : null}
            </div>
            <span style={{ fontSize: 14, color: i <= step ? COLORS.text : COLORS.textMuted }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN APP ───────────────────────────────────────────────
const INITIAL_PROJECT = {
  project_name: "", region: "", projectRegionGroup: "", country: "", city: "",
  development_stage: "", expected_commissioning_date: "",
  planned_capacity_mw: "", it_load_mw: "", pue: "", wue: "",
  cooling_type: "", backup_power_type: "",
  battery_storage_mwh: "", onsite_generation_type: "",
  grid_connection_status: "",
  interconnection_timeline_months: "", renewable_energy_share_pct: "",
  renewable_energy_source: "", ppa_secured: false,
  water_recycling_included: false,
  waste_heat_recovery: false,
  flood_risk_score: "", extreme_heat_risk_score: "", storm_risk_score: "",
  adaptation_measures_present: false,
  business_continuity_plan_ready: false,
  // CNDCP WUEmax inputs
  k1_climate: "", k2_stress: "", k3_water: "",
  // Renewable source tier
  renewable_source_tier: "",
  // DNSH checklist
  dnsh_climate_vulnerability: false, dnsh_protected_areas: false,
  dnsh_low_gwp_refrigerants: false, dnsh_weee_compliance: false,
  dnsh_human_rights_dd: false, dnsh_supply_chain_labour: false,
  // Sustainability & certification
  target_financing_label: "", taxonomy_alignment_claimed: false,
  net_zero_commitment_present: false, sustainability_disclosures_ready: false,
  third_party_certification_target: "", carbon_reduction_strategy_present: false,
  // Delivery readiness
  financing_strategy_defined: false,
  investment_memo_ready: false, site_control_secured: false,
  permitting_status: "", contractor_or_epc_identified: false,
  schedule_confidence_level: "",
};

// ─── TERMS OF SERVICE CONTENT ───────────────────────────────
function TOSModal({ onClose, onAccept, showAccept = false }) {
  const scrollRef = useRef(null);

  const S = {
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 0.2s ease-out" },
    modal: { background: COLORS.surface, borderRadius: 16, width: "min(720px, 92vw)", maxHeight: "85vh", display: "flex", flexDirection: "column", border: `1px solid ${COLORS.border}`, boxShadow: "0 20px 60px rgba(0,0,0,0.12)" },
    header: { padding: "20px 28px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 },
    body: { flex: 1, overflow: "auto", padding: "28px 28px 20px" },
    footer: { padding: "16px 28px", borderTop: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "flex-end", gap: 12, flexShrink: 0 },
    h1: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 20, fontWeight: 400, marginTop: 28, marginBottom: 12, color: COLORS.text },
    h2: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 16, fontWeight: 400, marginTop: 20, marginBottom: 8, color: COLORS.text },
    p: { fontSize: 13, lineHeight: 1.7, color: COLORS.textSecondary, marginBottom: 12 },
    bold: { fontWeight: 600, color: COLORS.text },
    list: { fontSize: 13, lineHeight: 1.7, color: COLORS.textSecondary, marginBottom: 6, paddingLeft: 24 },
    label: { display: "inline-block", fontSize: 11, fontWeight: 600, color: "#fff", background: COLORS.accent, padding: "2px 8px", borderRadius: 3, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 16 },
  };

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.header}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Terms of Service & Confidentiality Agreement</div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>Perennity Capital Readiness Platform</div>
          </div>
          <div onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: COLORS.surfaceRaised }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary} strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </div>
        </div>

        <div style={S.body} ref={scrollRef}>
          <div style={S.label}>Confidential</div>

          {/* 1. Introduction */}
          <h2 style={S.h1}>1. Introduction and Acceptance</h2>
          <p style={S.p}>This Terms of Service, Confidentiality & Acceptable Use Agreement (<span style={S.bold}>"Agreement"</span>) is entered into between:</p>
          <p style={S.p}><span style={S.bold}>Perennity Ltd</span> (a company registered in England and Wales) ("Perennity", "we", "our", or the "Company"); and</p>
          <p style={S.p}><span style={S.bold}>You, the User</span> ("User", "you", or "your"), being any individual or entity that accesses, registers for, or uses the Perennity Capital Readiness Platform (the "Platform").</p>
          <p style={{...S.p, background: COLORS.accentSubtle, padding: "12px 16px", borderRadius: 8, borderLeft: `3px solid ${COLORS.accent}`}}>
            <span style={S.bold}>By creating an account, accessing, or using the Platform, you acknowledge that you have read, understood, and agree to be bound by this Agreement in its entirety.</span> If you are accepting this Agreement on behalf of a company or other legal entity, you represent and warrant that you have the authority to bind such entity to this Agreement. If you do not agree to these terms, you must not access or use the Platform.
          </p>

          {/* 2. Definitions */}
          <h2 style={S.h1}>2. Definitions and Interpretation</h2>
          <p style={S.p}><span style={S.bold}>Business Day:</span> a day other than a Saturday, Sunday or public holiday in England when banks in London are open for business.</p>
          <p style={S.p}><span style={S.bold}>Confidential Information:</span> has the meaning given in clause 4.</p>
          <p style={S.p}><span style={S.bold}>Platform:</span> the Perennity Capital Readiness Platform, including all associated software, tools, scoring engines, assessment outputs, reports, interfaces, APIs, and documentation provided or made available by Perennity.</p>
          <p style={S.p}><span style={S.bold}>Platform Outputs:</span> all scores, assessments, reports, recommendations, gap analyses, and other outputs generated by the Platform based on User Data.</p>
          <p style={S.p}><span style={S.bold}>Purpose:</span> the User's use of the Platform to assess the capital readiness and sustainability alignment of data centre projects, and to explore a potential advisory or commercial relationship with Perennity.</p>
          <p style={S.p}><span style={S.bold}>User Data:</span> all data, information, project specifications, technical parameters, financial details, and other materials submitted by the User to the Platform.</p>
          <p style={S.p}><span style={S.bold}>Representatives:</span> in relation to each Party: (a) its officers and employees that need to know the Confidential Information for the Purpose; (b) its professional advisers or consultants engaged to advise that Party in connection with the Purpose; (c) its contractors and sub-contractors engaged by that Party in connection with the Purpose; and (d) any other person to whom the other Party agrees in writing that Confidential Information may be disclosed.</p>

          {/* 3. Platform Access */}
          <h2 style={S.h1}>3. Platform Access and Licence</h2>
          <p style={S.p}>3.1 Subject to your compliance with this Agreement, Perennity grants you a limited, non-exclusive, non-transferable, revocable licence to access and use the Platform solely for the Purpose.</p>
          <p style={S.p}>3.2 Perennity reserves the right to modify, suspend, or discontinue any aspect of the Platform at any time, with or without notice. We shall not be liable to you or any third party for any modification, suspension, or discontinuation of the Platform.</p>
          <p style={S.p}>3.3 You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.</p>

          {/* 4. Confidential Information */}
          <h2 style={S.h1}>4. Confidential Information</h2>
          <p style={S.p}>4.1 Confidential Information means all confidential information relating to the Purpose which either Party or its Representatives directly or indirectly discloses, or makes available, to the other Party before, on or after the date of this Agreement. This includes:</p>
          <p style={S.list}>(a) the fact that discussions and negotiations are taking place concerning the Purpose and the status of those discussions;</p>
          <p style={S.list}>(b) all confidential or proprietary information relating to the business, assets, affairs, customers, clients, suppliers, plans, operations, processes, product information, know-how, technical information, designs, trade secrets, intellectual property or software of the Discloser;</p>
          <p style={S.list}>(c) any information, findings, data or analysis derived from Confidential Information;</p>
          <p style={S.list}>(d) Platform Outputs, including all scores, assessments, recommendations, and reports generated by the Platform;</p>
          <p style={S.list}>(e) the Perennity scoring methodology, algorithms, weighting models, threshold configurations, and rules engine logic; and</p>
          <p style={S.list}>(f) all and any information disclosed or communicated between the Parties regardless of format.</p>
          <p style={S.p}>4.2 Information is not Confidential Information if: (a) it becomes generally available to the public other than through breach of this Agreement; (b) it was available to the Recipient on a non-confidential basis prior to disclosure; (c) it becomes available from a third party not under a confidentiality obligation; (d) it was lawfully in the Recipient's possession before disclosure; or (e) the Parties agree in writing that it is not confidential.</p>

          {/* 5. Confidentiality & IP */}
          <h2 style={S.h1}>5. Confidentiality and Intellectual Property Obligations</h2>
          <p style={S.p}>5.1 The Recipient undertakes to: (a) keep the Confidential Information secret and confidential; (b) not use or exploit it except for the Purpose; (c) not disclose it to any person except as permitted by this Agreement; and (d) not copy or record it except as strictly necessary for the Purpose.</p>
          <p style={S.p}>5.2 The Recipient shall maintain adequate security measures to safeguard Confidential Information from unauthorised access or use.</p>
          <p style={S.p}>5.3 All intellectual property rights in and to the Platform, including the scoring engine, algorithms, methodologies, user interface, software, documentation, and all Platform Outputs, shall remain vested exclusively in Perennity or its licensors.</p>
          <p style={S.p}>5.4 All intellectual property rights in User Data shall remain vested in the User. The User grants Perennity a limited, non-exclusive licence to process User Data solely for operating the Platform.</p>

          {/* 6. User Data Obligations */}
          <h2 style={S.h1}>6. User Data Obligations and Restrictions</h2>
          <p style={{...S.p, background: COLORS.redBg, padding: "12px 16px", borderRadius: 8, borderLeft: `3px solid ${COLORS.red}`}}>
            <span style={S.bold}>The User bears sole and exclusive responsibility for all data submitted to the Platform.</span> The User undertakes and warrants that:
          </p>
          <p style={S.list}>(a) the User shall not upload any personal data (as defined under UK GDPR and the Data Protection Act 2018), including names, addresses, identification numbers, financial account details, or any data relating to an identified or identifiable natural person;</p>
          <p style={S.list}>(b) the User shall not upload any live production data, real customer data, or data subject to third-party confidentiality obligations, unless the User has obtained all necessary consents and assumes full liability;</p>
          <p style={S.list}>(c) the User shall not upload any data that is classified, restricted, or subject to government security clearance;</p>
          <p style={S.list}>(d) all User Data is accurate, complete, and not misleading to the best of the User's knowledge;</p>
          <p style={S.list}>(e) the User has all necessary rights and authorisations to submit the User Data; and</p>
          <p style={S.list}>(f) the User shall indemnify and hold harmless Perennity from any claims arising from breach of this clause 6.</p>
          <p style={S.p}>6.2 Perennity shall have no liability whatsoever for any loss arising from the User's submission of personal data, production data, or any data in breach of clause 6.1.</p>
          <p style={S.p}>6.3 Perennity may use anonymised and aggregated data derived from User Data for improving the Platform, developing benchmarks, and conducting research, provided such data cannot reasonably identify the User or any individual.</p>

          {/* 7. Disclaimers */}
          <h2 style={S.h1}>7. Disclaimers, Warranties, and Limitation of Liability</h2>
          <p style={{...S.p, background: COLORS.amberBg, padding: "12px 16px", borderRadius: 8, borderLeft: `3px solid ${COLORS.amber}`, fontWeight: 500, color: COLORS.text}}>
            THE PLATFORM AND ALL PLATFORM OUTPUTS ARE PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS. Neither Party makes any express or implied warranty or representation concerning its Confidential Information, including accuracy or completeness.
          </p>
          <p style={S.p}><span style={S.bold}>7.2 No Investment, Legal, or Professional Advice.</span> Platform Outputs are provided for informational and indicative purposes only. They do not constitute: (a) investment or financial advice; (b) legal advice; (c) assurance of compliance with any regulatory framework including EU Taxonomy, SFDR, UK SDR; (d) guarantee that any project will secure financing or regulatory approval; or (e) engineering or technical certification of any kind. Users are strongly advised to obtain independent professional advice.</p>
          <p style={S.p}><span style={S.bold}>7.3 No Guarantees.</span> Perennity does not warrant that: (a) the Platform will be uninterrupted, error-free, or secure; (b) Platform Outputs will be accurate, complete, or fit for any particular purpose; (c) the scoring methodology reflects the most current regulatory framework version; (d) defects will be corrected; or (e) the Platform will meet specific requirements.</p>
          <p style={S.p}><span style={S.bold}>7.4 Exclusion of Liability.</span> To the maximum extent permitted by law, Perennity shall not be liable for: (a) any indirect, incidental, special, consequential, or exemplary damages including loss of profits, revenue, business, data, or goodwill; (b) loss arising from reliance on Platform Outputs; (c) loss arising from User's breach of clause 6; (d) loss from unauthorised access to User's data; or (e) loss from Platform unavailability or discontinuation.</p>
          <p style={S.p}><span style={S.bold}>7.5 Liability Cap.</span> Perennity's total aggregate liability shall not exceed the total fees paid by the User in the twelve (12) months preceding the claim, or one hundred pounds sterling (£100), whichever is greater.</p>
          <p style={S.p}>7.6 Nothing in this Agreement excludes liability for: (a) death or personal injury caused by negligence; (b) fraud or fraudulent misrepresentation; or (c) any liability which cannot be excluded by applicable law.</p>

          {/* 8. User Warranties */}
          <h2 style={S.h1}>8. User Warranties and Representations</h2>
          <p style={S.p}>The User warrants that: (a) the User has legal capacity and authority to enter into this Agreement; (b) if accepting on behalf of an entity, the User is duly authorised; (c) the User will use the Platform only for lawful purposes; (d) the User will not reverse-engineer, decompile, or derive source code, algorithms, or methodology of the Platform; (e) the User will not use automated means to access the Platform without consent; (f) the User will not use Platform Outputs to develop competing products; (g) the User will not misrepresent Platform Outputs as regulatory certification or investment advice; and (h) the User will comply with all applicable laws.</p>

          {/* 9-11 Disclosure & Return */}
          <h2 style={S.h1}>9. Permitted Disclosure</h2>
          <p style={S.p}>9.1 The Recipient may disclose Confidential Information to its Representatives provided it informs them of its confidential nature and procures their compliance with clause 5.1. The Recipient shall be liable for its Representatives' actions as if they were the Recipient's own.</p>

          <h2 style={S.h1}>10. Mandatory Disclosure</h2>
          <p style={S.p}>A Party may disclose Confidential Information to the minimum extent required by court order, regulatory body, or applicable law, provided it uses reasonable endeavours to give the other Party prior notice where permitted.</p>

          <h2 style={S.h1}>11. Return or Destruction of Confidential Information</h2>
          <p style={S.p}>Upon written request, the Recipient shall destroy or return all materials containing Confidential Information and certify compliance, except where retention is required by law or regulatory authority.</p>

          {/* 12. Indemnification */}
          <h2 style={S.h1}>12. Indemnification</h2>
          <p style={S.p}>The User shall indemnify, defend, and hold harmless Perennity from all claims, losses, damages, liabilities, costs, and expenses arising from: (a) any breach of this Agreement by the User; (b) the User's use of the Platform; (c) submission of data in breach of clause 6; (d) any third-party claim arising from the User's acts or omissions; and (e) any misrepresentation of Platform Outputs.</p>

          {/* 13-16 General */}
          <h2 style={S.h1}>13. Adequacy of Damages and Remedies</h2>
          <p style={S.p}>Each Party acknowledges that damages alone would not be an adequate remedy for breach. Each Party shall be entitled to injunctions, specific performance or other equitable relief for any threatened or actual breach.</p>

          <h2 style={S.h1}>14. Term, Termination, and Duration of Obligations</h2>
          <p style={S.p}>14.1 This Agreement takes effect upon acceptance (by account creation, clicking "I Accept", or continued use) and continues while the User maintains an account. 14.2 Perennity may terminate immediately for material breach. 14.3 The User may terminate by closing their account. 14.4 Confidentiality obligations survive for three (3) years after termination. 14.5 Clauses 4, 5, 6, 7, 8, 12, and 13 survive termination.</p>

          <h2 style={S.h1}>15. No Partnership or Agency</h2>
          <p style={S.p}>Nothing in this Agreement establishes any partnership, joint venture, or agency relationship. Each Party acts on its own behalf.</p>

          <h2 style={S.h1}>16. General Provisions</h2>
          <p style={S.p}><span style={S.bold}>16.1 Assignment.</span> Neither Party shall assign rights or obligations without the other's written permission.</p>
          <p style={S.p}><span style={S.bold}>16.2 Entire Agreement.</span> This Agreement constitutes the entire agreement between the Parties.</p>
          <p style={S.p}><span style={S.bold}>16.3 Variation.</span> Perennity may modify this Agreement by posting revised terms. Continued use constitutes acceptance. Material changes will be notified via the Platform or email.</p>
          <p style={S.p}><span style={S.bold}>16.4 Waiver.</span> A waiver of any right is only effective if in writing and shall not be deemed a waiver of any subsequent right.</p>
          <p style={S.p}><span style={S.bold}>16.5 Severance.</span> If any provision is invalid, it shall be deemed deleted without affecting the rest of this Agreement.</p>
          <p style={S.p}><span style={S.bold}>16.6 Third-Party Rights.</span> This Agreement does not give rise to rights under the Contracts (Rights of Third Parties) Act 1999.</p>
          <p style={S.p}><span style={S.bold}>16.7 Notices.</span> Notices shall be in writing by email, deemed received on the next Business Day.</p>
          <p style={S.p}><span style={S.bold}>16.8 Governing Law.</span> This Agreement shall be governed by the law of England and Wales.</p>
          <p style={S.p}><span style={S.bold}>16.9 Jurisdiction.</span> The courts of England and Wales shall have exclusive jurisdiction.</p>

          <div style={{ marginTop: 32, padding: "16px 20px", borderTop: `1px solid ${COLORS.border}`, textAlign: "center" }}>
            <p style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}>© Perennity Ltd. All rights reserved.</p>
          </div>
        </div>

        <div style={S.footer}>
          {showAccept ? (
            <Button onClick={onAccept}>I Accept These Terms</Button>
          ) : (
            <Button variant="secondary" onClick={onClose}>Close</Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("landing");
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [projectDraft, setProjectDraft] = useState({ ...INITIAL_PROJECT });
  const [wizardStep, setWizardStep] = useState(0);
  const [assessments, setAssessments] = useState({});
  const [selectedPillar, setSelectedPillar] = useState(null);
  const [navItem, setNavItem] = useState("dashboard");
  const [advisoryForm, setAdvisoryForm] = useState({ request_type: "", message: "" });
  const [onboardingForm, setOnboardingForm] = useState({ name: "", company: "", role: "developer", email: "" });
  const [tosAccepted, setTosAccepted] = useState(false);
  const [showTos, setShowTos] = useState(false);
  // Enterprise features
  const [aiNarrative, setAiNarrative] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaHistory, setQaHistory] = useState([]);
  const [qaStreaming, setQaStreaming] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [draftBanner, setDraftBanner] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === "true"; } catch { return false; }
  });

  // Persist sidebar state
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, String(sidebarCollapsed)); } catch {}
  }, [sidebarCollapsed]);

  const currentAssessment = currentProject ? assessments[currentProject.id] : null;

  // Load draft on mount
  useEffect(() => {
    const draft = loadDraft();
    if (draft) setDraftBanner(draft);
  }, []);

  // Auto-save wizard draft
  useEffect(() => {
    if (screen === "wizard") {
      const t = setTimeout(() => saveDraft(projectDraft), 1500);
      return () => clearTimeout(t);
    }
  }, [projectDraft, screen]);

  // Load AI narrative when results appear
  useEffect(() => {
    if (screen === "app" && navItem === "results" && currentAssessment && !aiNarrative) {
      setAiLoading(true);
      setAiNarrative("");
      (async () => {
        try {
          for await (const chunk of generateNarrative(currentProject, currentAssessment)) {
            setAiNarrative(prev => prev + chunk);
          }
        } catch (e) { /* API key not set or error */ }
        setAiLoading(false);
      })();
    }
  }, [screen, navItem, currentAssessment?.capitalReadinessScore]);

  // Load history list when panel opens
  useEffect(() => {
    if (showHistory) {
      listAssessments().then(setHistoryList).catch(() => {});
    }
  }, [showHistory]);

  function handleLogin(userData) {
    setUser(userData);
    setScreen("app");
    setNavItem("dashboard");

    // Send to Airtable Users table
    sendToAirtable("Users", {
      Name: userData.name,
      Company: userData.company,
      Role: userData.role,
      Timestamp: new Date().toISOString(),
    });
  }

  function handleCreateProject() {
    setProjectDraft({ ...INITIAL_PROJECT });
    setWizardStep(0);
    setScreen("wizard");
  }

  function handleSaveProject() {
    const id = Date.now().toString();
    const project = { ...projectDraft, id, status: "draft", created_at: new Date().toISOString() };
    setProjects(prev => [...prev, project]);
    setCurrentProject(project);
    setScreen("app");
    setNavItem("projects");
  }

  function handleRunAssessment(project) {
    setCurrentProject(project);
    setAiNarrative("");
    setQaHistory([]);
    setScreen("assessing");
  }

  function handleAssessmentComplete() {
    const flatProject = {};
    Object.entries(currentProject).forEach(([k, v]) => {
      if (v === "") flatProject[k] = undefined;
      else if (v === "true") flatProject[k] = true;
      else if (v === "false") flatProject[k] = false;
      else if (!isNaN(v) && v !== "" && v !== true && v !== false && typeof v === "string") flatProject[k] = parseFloat(v);
      else flatProject[k] = v;
    });
    const region = currentProject.region || "UK";
    const countryProfile = getCountryProfile(currentProject.country);
    const result = runScoringEngine(flatProject, region, countryProfile);
    // Augment with regulatory classifications
    result.sfdr = determineSfdrClassification(flatProject, region);
    result.taxonomy = determineEuTaxonomyAlignment(flatProject, countryProfile);
    result.sdr = determineUkSdrEligibility(flatProject, result.capitalReadinessScore);
    setAssessments(prev => ({ ...prev, [currentProject.id]: result }));
    // Save to IndexedDB history
    const assessmentId = `PER-${currentProject.id.slice(-6).toUpperCase()}`;
    saveAssessment(assessmentId, currentProject, result).catch(console.error);
    setScreen("app");
    setNavItem("results");

    // Send to Airtable Assessments table. Applicable Frameworks is derived
    // from target_financing_label via the shared financing-labels helper.
    sendToAirtable("Assessments", {
      "Project Name": currentProject.project_name || "Untitled",
      "Capital Readiness Score": result.capitalReadinessScore,
      "Confidence Score": result.confidenceScore,
      "Band": result.band?.label,
      "Region": currentProject.region,
      "Country": currentProject.country,
      "Region Group": currentProject.projectRegionGroup,
      "Water Stress Band": countryProfile.waterStress,
      "Grid Carbon Intensity": countryProfile.gridCarbon,
      "Target Financing Label": FINANCING_LABELS[currentProject.target_financing_label] || "",
      "Applicable Frameworks": flattenFrameworks(currentProject.target_financing_label),
      "Development Stage": currentProject.development_stage,
      "PUE": flatProject.pue,
      "Planned Capacity MW": flatProject.planned_capacity_mw,
      "Renewable Energy %": flatProject.renewable_energy_share_pct,
      "SA Score": result.subscores?.sa,
      "EPV Score": result.subscores?.epv,
      "WRE Score": result.subscores?.wre,
      "CSR Score": result.subscores?.csr,
      "DFR Score": result.subscores?.dfr,
      "Hard Stop Triggered": result.hardStopTriggered,
      "Hard Stop Reason": result.hardStopReason,
      "Timestamp": new Date().toISOString(),
    });
  }

  async function handleQaSubmit() {
    if (!qaQuestion.trim() || qaStreaming || !currentAssessment) return;
    const q = qaQuestion.trim();
    setQaQuestion("");
    const userMsg = { role: "user", content: q };
    setQaHistory(prev => [...prev, userMsg]);
    setQaStreaming(true);
    let answer = "";
    try {
      const histForApi = [...qaHistory, userMsg].map(m => ({ role: m.role, content: m.content }));
      for await (const chunk of answerRegulatoryQuestion(q, currentProject, currentAssessment, histForApi)) {
        answer += chunk;
        setQaHistory(prev => {
          const updated = [...prev];
          if (updated[updated.length - 1]?.role === "assistant") {
            updated[updated.length - 1] = { role: "assistant", content: answer };
          } else {
            updated.push({ role: "assistant", content: answer });
          }
          return updated;
        });
      }
    } catch (e) { /* no API key */ }
    setQaStreaming(false);
  }

  function handleEditProject(project) {
    setProjectDraft({ ...project });
    setCurrentProject(project);
    setWizardStep(0);
    setScreen("wizard");
  }

  function handleUpdateProject() {
    const updated = { ...projectDraft, updated_at: new Date().toISOString() };
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
    setCurrentProject(updated);
    setScreen("app");
    setNavItem("projects");
  }

  function updateDraft(field, value) {
    setProjectDraft(prev => ({ ...prev, [field]: value }));
  }

  // ─── LANDING ──────────────────────────────────────────────
  if (screen === "landing") {
    return (
      <>
        <style>{css}</style>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 48px", borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img
                src={pbRgbaLogo}
                alt="Perennity Bridge"
                style={{ display: "block", width: "160px", height: "auto" }}
              />
            </div>
            <Button onClick={() => setScreen("onboarding")}>Get Started</Button>
          </nav>

          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
            <div style={{ maxWidth: 640, textAlign: "center", animation: "fadeIn 0.6s ease-out" }}>
              <div style={{ display: "inline-block", fontSize: 12, fontWeight: 600, color: "#FFFFFF", background: COLORS.accent, padding: "4px 12px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 20 }}>Capital Readiness Platform</div>
              <h1 style={{ fontSize: 48, lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 24 }}>
                Assess your data centre project's readiness for sustainable capital globally
              </h1>
              <p style={{ fontSize: 17, color: COLORS.textSecondary, lineHeight: 1.6, marginBottom: 40 }}>
                Evaluate sustainability alignment, infrastructure viability, and funding readiness against EU Taxonomy, SFDR, and UK SDR frameworks. Get investor-grade assessments in minutes, not months.
              </p>
              <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
                <Button size="lg" onClick={() => setScreen("onboarding")}>Create Account</Button>
                <Button variant="secondary" size="lg" onClick={() => {
                  const sampleProject = {
                    id: "sample-demo", project_name: "Frankfurt Campus Alpha — Sample", region: "EU", projectRegionGroup: "Europe", country: "Germany", city: "Frankfurt",
                    development_stage: "pre_permitting", planned_capacity_mw: 30, it_load_mw: 24, pue: 1.28, wue: 0.4,
                    cooling_type: "hybrid", backup_power_type: "battery", battery_storage_mwh: 12,
                    grid_connection_status: "partially_secured", interconnection_timeline_months: 18,
                    renewable_energy_share_pct: 65, renewable_energy_source: "ppa", ppa_secured: true,
                    k1_climate: "cold", k2_stress: "low", k3_water: "potable",
                    water_recycling_included: true, waste_heat_recovery: true,
                    flood_risk_score: 25, extreme_heat_risk_score: 20, storm_risk_score: 15,
                    adaptation_measures_present: true, business_continuity_plan_ready: true,
                    taxonomy_alignment_claimed: true, net_zero_commitment_present: true,
                    sustainability_disclosures_ready: true, carbon_reduction_strategy_present: true,
                    financing_strategy_defined: true, investment_memo_ready: false,
                    site_control_secured: true, permitting_status: "underway", contractor_or_epc_identified: true,
                    schedule_confidence_level: "high", target_financing_label: "sfdr_article_8",
                  };
                  const region = sampleProject.region;
                  const sampleCountryProfile = getCountryProfile(sampleProject.country);
                  const result = runScoringEngine(sampleProject, region, sampleCountryProfile);
                  result.sfdr = determineSfdrClassification(sampleProject, region);
                  result.taxonomy = determineEuTaxonomyAlignment(sampleProject, sampleCountryProfile);
                  result.sdr = determineUkSdrEligibility(sampleProject, result.capitalReadinessScore);
                  setProjects(prev => prev.some(p => p.id === "sample-demo") ? prev : [...prev, { ...sampleProject, status: "assessed", created_at: new Date().toISOString() }]);
                  setAssessments(prev => ({ ...prev, [sampleProject.id]: result }));
                  setCurrentProject(sampleProject);
                  setUser(prev => prev || { name: "Demo User", company: "Demo", role: "investor", email: "demo@example.com" });
                  setScreen("app");
                  setNavItem("results");
                }}>View Example Assessment</Button>
              </div>
              <div style={{ display: "flex", gap: 32, justifyContent: "center", marginTop: 48 }}>
                {[
                  { icon: "shield", label: "Tri-framework coverage" },
                  { icon: "zap", label: "Country-specific scoring" },
                  { icon: "target", label: "Actionable gap analysis" },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name={item.icon} size={16} color={COLORS.accent} />
                    <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ─── ONBOARDING ───────────────────────────────────────────
  if (screen === "onboarding") {
    return (
      <>
        <style>{css}</style>
        {showTos && <TOSModal onClose={() => setShowTos(false)} onAccept={() => { setTosAccepted(true); setShowTos(false); }} showAccept={!tosAccepted} />}
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Card style={{ width: 440, animation: "fadeIn 0.4s ease-out" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
              <img
                src={pbRgbaLogo}
                alt="Perennity Bridge"
                style={{ display: "block", width: "220px", height: "auto" }}
              />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Create your account</h2>
            <p style={{ color: COLORS.textSecondary, fontSize: 14, marginBottom: 28 }}>Get started with your first capital readiness assessment.</p>
            
            <FormField label="Full Name" required>
              <input value={onboardingForm.name} onChange={e => setOnboardingForm({...onboardingForm, name: e.target.value})} placeholder="Your full name" />
            </FormField>
            <FormField label="Company" required>
              <input value={onboardingForm.company} onChange={e => setOnboardingForm({...onboardingForm, company: e.target.value})} placeholder="Company name" />
            </FormField>
            <FormField label="Role" required>
              <select value={onboardingForm.role} onChange={e => setOnboardingForm({...onboardingForm, role: e.target.value})}>
                <option value="developer">Developer</option>
                <option value="investor">Investor</option>
                <option value="consultant">Consultant</option>
              </select>
            </FormField>
            <FormField label="Email" required>
              <input type="email" value={onboardingForm.email} onChange={e => setOnboardingForm({...onboardingForm, email: e.target.value})} placeholder="you@company.com" />
            </FormField>

            {/* Click-wrap TOS acceptance */}
            <div style={{ marginTop: 8, marginBottom: 16, padding: "14px 16px", borderRadius: 10, background: COLORS.surfaceRaised, border: `1px solid ${tosAccepted ? COLORS.accent + "44" : COLORS.border}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <input 
                  type="checkbox" 
                  checked={tosAccepted} 
                  onChange={e => {
                    if (!tosAccepted) {
                      setShowTos(true);
                    } else {
                      setTosAccepted(false);
                    }
                  }}
                  style={{ marginTop: 2, flexShrink: 0 }} 
                />
                <div style={{ fontSize: 13, lineHeight: 1.5, color: COLORS.textSecondary }}>
                  I have read and agree to the{" "}
                  <span 
                    onClick={() => setShowTos(true)} 
                    style={{ color: COLORS.accent, cursor: "pointer", textDecoration: "underline", fontWeight: 500 }}
                  >
                    Terms of Service, Confidentiality & Acceptable Use Agreement
                  </span>
                  , including the data obligations in clause 6 and the liability limitations in clause 7.
                </div>
              </div>
              {tosAccepted && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
                  <Icon name="check" size={14} color={COLORS.green} />
                  <span style={{ fontSize: 12, color: COLORS.green, fontWeight: 500 }}>Terms accepted</span>
                </div>
              )}
            </div>
            
            <Button 
              style={{ width: "100%", justifyContent: "center" }} 
              onClick={() => handleLogin(onboardingForm)} 
              disabled={!onboardingForm.name || !onboardingForm.email || !tosAccepted}
            >
              Create Account
            </Button>
            {!tosAccepted && onboardingForm.name && onboardingForm.email && (
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <span style={{ fontSize: 12, color: COLORS.amber }}>Please accept the terms to continue</span>
              </div>
            )}
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <span style={{ fontSize: 13, color: COLORS.textMuted }}>Already have an account? </span>
              <span style={{ fontSize: 13, color: COLORS.accent, cursor: "pointer" }} onClick={() => handleLogin({ name: "Demo User", company: "Demo Co", role: "developer", email: "demo@example.com" })}>Sign in</span>
            </div>
          </Card>
        </div>
      </>
    );
  }

  // ─── ASSESSMENT LOADING ───────────────────────────────────
  if (screen === "assessing") {
    return (
      <>
        <style>{css}</style>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
          <AssessmentLoading onComplete={handleAssessmentComplete} />
        </div>
      </>
    );
  }

  // ─── WIZARD ───────────────────────────────────────────────

  // FIX 3: Validation
  function validateWizardStep(step, d) {
    const errors = {};
    const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
    if (step === 1) {
      if (d.planned_capacity_mw !== "" && d.planned_capacity_mw !== undefined) {
        const v = num(d.planned_capacity_mw);
        if (v === null) errors.planned_capacity_mw = "Please enter a valid number.";
        else if (v <= 0 || v >= 10000) errors.planned_capacity_mw = "IT load must be greater than 0 MW and less than 10,000 MW.";
      }
      if (d.pue !== "" && d.pue !== undefined) {
        const v = num(d.pue);
        if (v === null) errors.pue = "Please enter a valid number.";
        else if (v < 1.0 || v > 5.0) errors.pue = "PUE must be between 1.0 and 5.0. A value below 1.0 is physically impossible; above 5.0 is outside normal data centre range.";
      }
      if (d.wue !== "" && d.wue !== undefined) {
        const v = num(d.wue);
        if (v === null) errors.wue = "Please enter a valid number.";
        else if (v < 0.0 || v > 20.0) errors.wue = "WUE must be between 0.0 and 20.0 m\u00b3/MWh.";
      }
    }
    if (step === 2) {
      if (d.renewable_energy_share_pct !== "" && d.renewable_energy_share_pct !== undefined) {
        const v = num(d.renewable_energy_share_pct);
        if (v === null) errors.renewable_energy_share_pct = "Please enter a valid number.";
        else if (v < 0 || v > 100) errors.renewable_energy_share_pct = "Renewable energy percentage must be between 0 and 100.";
      }
    }
    return errors;
  }

  if (screen === "wizard") {
    const steps = ["Project Basics", "Technical Specs", "Energy Profile", "Water & Resources", "Site & Climate", "Sustainability", "Delivery Readiness", "Review & Submit"];
    const d = projectDraft;
    const wizardErrors = validateWizardStep(wizardStep, d);
    const hasWizardErrors = Object.keys(wizardErrors).length > 0;

    function renderWizardContent() {
      switch (wizardStep) {
        case 0: return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ gridColumn: "1 / -1" }}><FormField label="Project Name" required><input value={d.project_name} onChange={e => updateDraft("project_name", e.target.value)} placeholder="e.g. Frankfurt Campus Alpha" /></FormField></div>
            <FormField label="Region Group" required help="Determines the scoring ruleset and country-specific thresholds applied">
              <select value={d.projectRegionGroup} onChange={e => {
                const rg = e.target.value;
                updateDraft("projectRegionGroup", rg);
                updateDraft("country", "");
                // Map region group to scoring region code
                const regionMap = { 'Europe': 'EU', 'North America': 'US', 'Asia-Pacific': 'UK', 'MENA': 'MENA', 'Africa': 'UK', 'Latin America': 'US' };
                updateDraft("region", regionMap[rg] || "UK");
              }}>
                <option value="">Select region group</option>
                {Object.keys(DC_MARKETS).map(rg => <option key={rg} value={rg}>{rg}</option>)}
              </select>
            </FormField>
            <FormField label="Country" required help="Select your project's country within the chosen region">
              <select value={d.country} onChange={e => updateDraft("country", e.target.value)}>
                <option value="">Select country</option>
                {d.projectRegionGroup && DC_MARKETS[d.projectRegionGroup]
                  ? DC_MARKETS[d.projectRegionGroup].countries.map(c => <option key={c} value={c}>{c}</option>)
                  : Object.values(DC_MARKETS).flatMap(m => m.countries).filter((c, i, a) => a.indexOf(c) === i).sort().map(c => <option key={c} value={c}>{c}</option>)
                }
              </select>
            </FormField>
            <FormField label="City"><input value={d.city} onChange={e => updateDraft("city", e.target.value)} placeholder="e.g. Frankfurt" /></FormField>
            <FormField label="Development Stage" required>
              <select value={d.development_stage} onChange={e => updateDraft("development_stage", e.target.value)}>
                <option value="">Select stage</option><option value="concept">Concept</option><option value="site_shortlisted">Site Shortlisted</option><option value="site_selected">Site Selected</option><option value="pre_permitting">Pre-Permitting</option><option value="permitted">Permitted</option><option value="shovel_ready">Shovel Ready</option>
              </select>
            </FormField>
            <FormField label="Expected Commissioning Date"><input type="date" value={d.expected_commissioning_date} onChange={e => updateDraft("expected_commissioning_date", e.target.value)} /></FormField>
          </div>
        );
        case 1: return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <FormField label="Planned Capacity (MW)" required help="Total planned power load" error={wizardErrors.planned_capacity_mw}><input type="number" step="0.1" value={d.planned_capacity_mw} onChange={e => updateDraft("planned_capacity_mw", e.target.value)} placeholder="e.g. 80" style={wizardErrors.planned_capacity_mw ? { borderColor: COLORS.red, background: "rgba(166,61,47,0.04)" } : {}} /></FormField>
            <FormField label="IT Load (MW)" help="IT load only, if known"><input type="number" step="0.1" value={d.it_load_mw} onChange={e => updateDraft("it_load_mw", e.target.value)} placeholder="e.g. 60" /></FormField>
            <FormField label="PUE" required tooltip="Power Usage Effectiveness — the ratio of total data centre energy use to IT equipment energy use. A PUE of 1.0 is perfect; 1.3 is best practice for new builds under EU Taxonomy." error={wizardErrors.pue}><input type="number" step="0.01" value={d.pue} onChange={e => updateDraft("pue", e.target.value)} placeholder="e.g. 1.30" style={wizardErrors.pue ? { borderColor: COLORS.red, background: "rgba(166,61,47,0.04)" } : {}} /></FormField>
            <FormField label="WUE" tooltip="Water Usage Effectiveness — annual data centre water consumption (m³) divided by annual IT equipment energy consumption (MWh). Lower is better. Calculated per ISO/IEC 30134-5." error={wizardErrors.wue}><input type="number" step="0.01" value={d.wue} onChange={e => updateDraft("wue", e.target.value)} placeholder="e.g. 0.45" style={wizardErrors.wue ? { borderColor: COLORS.red, background: "rgba(166,61,47,0.04)" } : {}} /></FormField>
            <FormField label="Cooling Type" required help="Primary cooling technology">
              <select value={d.cooling_type} onChange={e => updateDraft("cooling_type", e.target.value)}>
                <option value="">Select cooling</option><option value="air">Air</option><option value="evaporative">Evaporative</option><option value="liquid">Liquid</option><option value="hybrid">Hybrid</option>
              </select>
            </FormField>
            <FormField label="Backup Power Type" required help="Primary backup power source">
              <select value={d.backup_power_type} onChange={e => updateDraft("backup_power_type", e.target.value)}>
                <option value="">Select backup</option><option value="diesel">Diesel</option><option value="gas">Gas</option><option value="battery">Battery</option><option value="hydrogen">Hydrogen</option><option value="hybrid">Hybrid</option>
              </select>
            </FormField>
            <FormField label="Battery Storage (MWh)"><input type="number" step="0.1" value={d.battery_storage_mwh} onChange={e => updateDraft("battery_storage_mwh", e.target.value)} placeholder="e.g. 50" /></FormField>
            <FormField label="Onsite Generation">
              <select value={d.onsite_generation_type} onChange={e => updateDraft("onsite_generation_type", e.target.value)}>
                <option value="">Select type</option><option value="solar">Solar</option><option value="gas">Gas</option><option value="hybrid">Hybrid</option><option value="none">None</option>
              </select>
            </FormField>
          </div>
        );
        case 2: return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <FormField label="Grid Connection Status" required>
              <select value={d.grid_connection_status} onChange={e => updateDraft("grid_connection_status", e.target.value)}>
                <option value="">Select status</option><option value="not_started">Not Started</option><option value="in_discussion">In Discussion</option><option value="application_submitted">Application Submitted</option><option value="partially_secured">Partially Secured</option><option value="secured">Secured</option>
              </select>
            </FormField>
            <FormField label="Interconnection Timeline (months)" help="Estimated time to grid connection"><input type="number" value={d.interconnection_timeline_months} onChange={e => updateDraft("interconnection_timeline_months", e.target.value)} placeholder="e.g. 18" /></FormField>
            <FormField label="Renewable Energy Share (%)" required tooltip="The proportion of electricity consumed that comes from renewable sources on a market basis. Source quality matters — a matched Power Purchase Agreement scores higher than a Renewable Energy Certificate." error={wizardErrors.renewable_energy_share_pct}><input type="number" step="1" value={d.renewable_energy_share_pct} onChange={e => updateDraft("renewable_energy_share_pct", e.target.value)} placeholder="e.g. 65" style={wizardErrors.renewable_energy_share_pct ? { borderColor: COLORS.red, background: "rgba(166,61,47,0.04)" } : {}} /></FormField>
            <FormField label="Renewable Energy Source" required tooltip="Tier 1 (matched PPA or on-site generation) satisfies EU Taxonomy additionality requirements. Tier 2 (GOs/RECs) is accepted by most Article 8 funds. Tier 3 (green tariff) does not satisfy additionality requirements.">
              <select value={d.renewable_energy_source} onChange={e => updateDraft("renewable_energy_source", e.target.value)}>
                <option value="">Select source</option><option value="ppa">PPA</option><option value="rec">REC</option><option value="onsite">Onsite</option><option value="utility_green_tariff">Utility Green Tariff</option><option value="mixed">Mixed</option>
              </select>
            </FormField>
            <FormField label="Renewable Source Quality Tier" tooltip="Tier 1 (matched PPA or on-site generation) satisfies EU Taxonomy additionality requirements. Tier 2 (GOs/RECs) is accepted by most Article 8 funds. Tier 3 (green tariff) does not satisfy additionality requirements.">
              <select value={d.renewable_source_tier} onChange={e => updateDraft("renewable_source_tier", e.target.value)}>
                <option value="">Auto-detect from source</option>
                <option value="1">Tier 1 — Matched PPA / On-site generation</option>
                <option value="2">Tier 2 — Guarantees of Origin (GOs) / RECs</option>
                <option value="3">Tier 3 — Utility green tariff only</option>
              </select>
            </FormField>
            <FormField label="PPA Secured?" help="Whether a Power Purchase Agreement is in place">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.ppa_secured} onChange={e => updateDraft("ppa_secured", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.ppa_secured ? "Yes" : "No"}</span>
              </div>
            </FormField>
          </div>
        );
        case 3: return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <FormField label="K1 — Climate Zone" tooltip="Cooling degree days above 21°C. Defaults are set based on your project location's climate classification. Affects your WUEmax target under the CNDCP formula.">
              <select value={d.k1_climate} onChange={e => updateDraft("k1_climate", e.target.value)}>
                <option value="">Select climate zone</option>
                <option value="cold">Cold (&lt; 50 CDD above 21°C) — K1 = 1.0</option>
                <option value="warm">Warm (≥ 50 CDD above 21°C) — K1 = 1.1</option>
              </select>
            </FormField>
            <FormField label="K2 — Water Stress Level" tooltip="Based on the EU Water Exploitation Index (WEI+) for your location. Defaults are set based on your project location's water stress classification. This affects your site-specific WUEmax target under the Climate Neutral Data Centre Pact.">
              <select value={d.k2_stress} onChange={e => updateDraft("k2_stress", e.target.value)}>
                <option value="">Select water stress</option>
                <option value="low">Low stress (WEI+ ≤ 10) — K2 = 5.0</option>
                <option value="low_medium">Low-medium stress (WEI+ 11–20) — K2 = 4.0</option>
                <option value="medium_high">Medium-high stress (WEI+ 21–40) — K2 = 2.5</option>
                <option value="high">High stress (WEI+ &gt; 40) — K2 = 1.0</option>
              </select>
            </FormField>
            <FormField label="K3 — Water Source Type (CNDCP)" tooltip="The type of water used for cooling affects your WUEmax target. Using brackish or sea water allows a higher WUE target than potable water under the CNDCP formula.">
              <select value={d.k3_water} onChange={e => updateDraft("k3_water", e.target.value)}>
                <option value="">Select water source</option>
                <option value="potable">Potable / fresh water — K3 = 1.0</option>
                <option value="grey">Grey water — K3 = 3.0</option>
                <option value="brackish">Brackish / sea water — K3 = 6.0</option>
              </select>
            </FormField>
            <FormField label="Water Recycling Included?">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.water_recycling_included} onChange={e => updateDraft("water_recycling_included", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.water_recycling_included ? "Yes" : "No"}</span>
              </div>
            </FormField>
            <FormField label="Waste Heat Recovery?">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.waste_heat_recovery} onChange={e => updateDraft("waste_heat_recovery", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.waste_heat_recovery ? "Yes" : "No"}</span>
              </div>
            </FormField>
          </div>
        );
        case 4: return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <FormField label="Flood Risk Score (0-100)" help="Higher = greater risk. Leave blank if unknown."><input type="number" min="0" max="100" value={d.flood_risk_score} onChange={e => updateDraft("flood_risk_score", e.target.value)} placeholder="e.g. 22" /></FormField>
            <FormField label="Extreme Heat Risk Score (0-100)"><input type="number" min="0" max="100" value={d.extreme_heat_risk_score} onChange={e => updateDraft("extreme_heat_risk_score", e.target.value)} placeholder="e.g. 58" /></FormField>
            <FormField label="Storm Risk Score (0-100)"><input type="number" min="0" max="100" value={d.storm_risk_score} onChange={e => updateDraft("storm_risk_score", e.target.value)} placeholder="e.g. 30" /></FormField>
            <FormField label="Adaptation Measures Present?">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.adaptation_measures_present} onChange={e => updateDraft("adaptation_measures_present", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.adaptation_measures_present ? "Yes" : "No"}</span>
              </div>
            </FormField>
            <FormField label="Business Continuity Plan Ready?">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.business_continuity_plan_ready} onChange={e => updateDraft("business_continuity_plan_ready", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.business_continuity_plan_ready ? "Yes" : "No"}</span>
              </div>
            </FormField>
          </div>
        );
        case 5: return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <FormField label="Target Financing Label" help="What type of capital are you seeking?">
              <select value={d.target_financing_label} onChange={e => updateDraft("target_financing_label", e.target.value)}>
                <option value="">Select label</option>
                <optgroup label="EU Frameworks — Fund Level">
                  <option value="sfdr_article_8">SFDR Article 8 — promotes environmental/social characteristics</option>
                  <option value="sfdr_article_9">SFDR Article 9 — sustainable investment objective</option>
                </optgroup>
                <optgroup label="EU Taxonomy">
                  <option value="eu_taxonomy_8_1">EU Taxonomy aligned — Activity 8.1 (climate change mitigation)</option>
                </optgroup>
                <optgroup label="EU Bond Instruments">
                  <option value="eugbs">European Green Bond (EuGBS) — Regulation (EU) 2023/2631</option>
                  <option value="icma_green_bond">ICMA Green Bond Principles</option>
                  <option value="icma_slb">ICMA Sustainability-Linked Bond Principles</option>
                  <option value="icma_social_bond">ICMA Social Bond Principles</option>
                </optgroup>
                <optgroup label="UK Frameworks">
                  <option value="uk_sdr_focus">UK SDR — Sustainability Focus</option>
                  <option value="uk_sdr_improvers">UK SDR — Sustainability Improvers</option>
                  <option value="uk_sdr_impact">UK SDR — Sustainability Impact</option>
                  <option value="uk_sdr_mixed">UK SDR — Sustainability Mixed Goals</option>
                </optgroup>
                <optgroup label="Development Finance">
                  <option value="eib">EIB green finance</option>
                  <option value="ifc">IFC / World Bank green finance</option>
                  <option value="ebrd">EBRD green finance</option>
                  <option value="afdb">AfDB green finance</option>
                </optgroup>
              </select>
            </FormField>
            <FormField label="Third-Party Certification Target">
              <select value={d.third_party_certification_target} onChange={e => updateDraft("third_party_certification_target", e.target.value)}>
                <option value="">Select certification</option><option value="leed">LEED</option><option value="breeam">BREEAM</option><option value="nabers">NABERS</option><option value="green_star">Green Star</option><option value="estidama">Estidama</option><option value="none">None</option>
              </select>
            </FormField>
            <FormField label="Taxonomy Alignment Claimed?">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.taxonomy_alignment_claimed} onChange={e => updateDraft("taxonomy_alignment_claimed", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.taxonomy_alignment_claimed ? "Yes" : "No"}</span>
              </div>
            </FormField>
            <FormField label="Net-Zero Commitment?">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.net_zero_commitment_present} onChange={e => updateDraft("net_zero_commitment_present", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.net_zero_commitment_present ? "Yes" : "No"}</span>
              </div>
            </FormField>
            <FormField label="Sustainability Disclosures Ready?">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.sustainability_disclosures_ready} onChange={e => updateDraft("sustainability_disclosures_ready", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.sustainability_disclosures_ready ? "Yes" : "No"}</span>
              </div>
            </FormField>
            <FormField label="Carbon Reduction Strategy?">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.carbon_reduction_strategy_present} onChange={e => updateDraft("carbon_reduction_strategy_present", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.carbon_reduction_strategy_present ? "Yes" : "No"}</span>
              </div>
            </FormField>
            <div style={{ gridColumn: "1 / -1", borderTop: `1px solid ${COLORS.border}`, paddingTop: 20, marginTop: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>DNSH & Minimum Social Safeguards Checklist</div>
              <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>EU Taxonomy — Do No Significant Harm requirements and Article 18 minimum safeguards</div>
            </div>
            <FormField label="Climate vulnerability & physical risk assessment conducted?" help="Including identification of physical climate risks per the IPCC risk taxonomy (DNSH Objective 2 — Climate adaptation)">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.dnsh_climate_vulnerability} onChange={e => updateDraft("dnsh_climate_vulnerability", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.dnsh_climate_vulnerability ? "Yes" : "No"}</span>
              </div>
            </FormField>
            <FormField label="Site outside protected areas?" help="Natura 2000, UNESCO World Heritage, Key Biodiversity Areas, primary forests (DNSH Objective 6 — Biodiversity)">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.dnsh_protected_areas} onChange={e => updateDraft("dnsh_protected_areas", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.dnsh_protected_areas ? "Yes" : "No"}</span>
              </div>
            </FormField>
            <FormField label="Low-GWP refrigerants in cooling system?" help="Compliant with EU F-Gas Regulation (EU) 517/2014 (DNSH Objective 5 — Pollution prevention)">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.dnsh_low_gwp_refrigerants} onChange={e => updateDraft("dnsh_low_gwp_refrigerants", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.dnsh_low_gwp_refrigerants ? "Yes" : "No"}</span>
              </div>
            </FormField>
            <FormField label="IT equipment end-of-life plan (WEEE)?" help="Compliant with the WEEE Directive (2012/19/EU) (DNSH Objective 4 — Circular economy)">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.dnsh_weee_compliance} onChange={e => updateDraft("dnsh_weee_compliance", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.dnsh_weee_compliance ? "Yes" : "No"}</span>
              </div>
            </FormField>
            <FormField label="Human rights due diligence policy?" help="Aligned to UN Guiding Principles (UNGPs) and OECD Guidelines for Multinational Enterprises (Article 18 Minimum Social Safeguards)">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.dnsh_human_rights_dd} onChange={e => updateDraft("dnsh_human_rights_dd", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.dnsh_human_rights_dd ? "Yes" : "No"}</span>
              </div>
            </FormField>
            <FormField label="Supply chain labour standards policy?" help="Article 18 Minimum Social Safeguards — EU Taxonomy">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.dnsh_supply_chain_labour} onChange={e => updateDraft("dnsh_supply_chain_labour", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.dnsh_supply_chain_labour ? "Yes" : "No"}</span>
              </div>
            </FormField>
          </div>
        );
        case 6: return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <FormField label="Financing Strategy Defined?" required>
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.financing_strategy_defined} onChange={e => updateDraft("financing_strategy_defined", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.financing_strategy_defined ? "Yes" : "No"}</span>
              </div>
            </FormField>
            <FormField label="Investment Memo Ready?">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.investment_memo_ready} onChange={e => updateDraft("investment_memo_ready", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.investment_memo_ready ? "Yes" : "No"}</span>
              </div>
            </FormField>
            <FormField label="Site Control Secured?">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.site_control_secured} onChange={e => updateDraft("site_control_secured", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.site_control_secured ? "Yes" : "No"}</span>
              </div>
            </FormField>
            <FormField label="Permitting Status">
              <select value={d.permitting_status} onChange={e => updateDraft("permitting_status", e.target.value)}>
                <option value="">Select status</option><option value="not_started">Not Started</option><option value="underway">Underway</option><option value="partially_approved">Partially Approved</option><option value="approved">Approved</option>
              </select>
            </FormField>
            <FormField label="EPC / Contractor Identified?">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.contractor_or_epc_identified} onChange={e => updateDraft("contractor_or_epc_identified", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.contractor_or_epc_identified ? "Yes" : "No"}</span>
              </div>
            </FormField>
            <FormField label="Schedule Confidence">
              <select value={d.schedule_confidence_level} onChange={e => updateDraft("schedule_confidence_level", e.target.value)}>
                <option value="">Select level</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </FormField>
          </div>
        );
        case 7: {
          const sections = [
            { name: "Project Basics", fields: ["project_name", "projectRegionGroup", "country", "development_stage"], step: 0 },
            { name: "Technical Specs", fields: ["planned_capacity_mw", "pue", "cooling_type", "backup_power_type"], step: 1 },
            { name: "Energy Profile", fields: ["grid_connection_status", "renewable_energy_share_pct", "renewable_energy_source"], step: 2 },
            { name: "Water & Resources", fields: ["water_recycling_included"], step: 3 },
            { name: "Site & Climate", fields: ["adaptation_measures_present"], step: 4 },
            { name: "Sustainability", fields: ["sustainability_disclosures_ready"], step: 5 },
            { name: "Delivery Readiness", fields: ["financing_strategy_defined"], step: 6 },
          ];
          return (
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 24 }}>Review Your Project</h3>
              {sections.map((section, si) => {
                const filled = section.fields.filter(f => d[f] !== "" && d[f] !== undefined && d[f] !== false).length;
                const total = section.fields.length;
                const pct = Math.round((filled / total) * 100);
                return (
                  <div key={si} style={{ marginBottom: 16, padding: 16, borderRadius: 10, background: COLORS.bg, border: `1px solid ${COLORS.border}`, cursor: "pointer" }} onClick={() => setWizardStep(section.step)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{section.name}</span>
                      <span style={{ fontSize: 12, color: pct === 100 ? COLORS.green : COLORS.amber }}>{pct}% complete</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: COLORS.border }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? COLORS.green : COLORS.amber, borderRadius: 2, transition: "width 0.3s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }
      }
    }

    return (
      <>
        <style>{css}</style>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 32px", borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: `linear-gradient(135deg, #1B6B4A, #2A8C62)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="shield" size={14} color="#fff" />
              </div>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Perennity</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setScreen("app"); setNavItem("dashboard"); }}>Exit Wizard</Button>
          </nav>
          <div style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>
            <div style={{ maxWidth: 800, margin: "0 auto" }}>
              <StepIndicator steps={steps} currentStep={wizardStep} onStepClick={setWizardStep} />
              <Card style={{ marginTop: 24, animation: "slideInRight 0.3s ease-out" }}>
                <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{steps[wizardStep]}</h2>
                <p style={{ color: COLORS.textSecondary, fontSize: 14, marginBottom: 24 }}>
                  {wizardStep === 7 ? "Review your project data before running the assessment." : "Complete the fields below. Required fields are marked with *."}
                </p>
                {renderWizardContent()}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 20, borderTop: `1px solid ${COLORS.border}` }}>
                  <Button variant="secondary" icon="arrowLeft" onClick={() => wizardStep > 0 ? setWizardStep(wizardStep - 1) : null} disabled={wizardStep === 0}>Back</Button>
                  <div style={{ display: "flex", gap: 12 }}>
                    <Button variant="secondary" onClick={d.id ? handleUpdateProject : handleSaveProject}>Save Draft</Button>
                    {wizardStep < 7 ? (
                      <Button icon="arrow" onClick={() => setWizardStep(wizardStep + 1)} disabled={hasWizardErrors}>Continue</Button>
                    ) : (
                      <Button onClick={() => {
                        if (!d.id) handleSaveProject();
                        else handleUpdateProject();
                        setTimeout(() => {
                          const p = d.id ? { ...d } : { ...d, id: Date.now().toString() };
                          handleRunAssessment(p);
                        }, 100);
                      }}>Submit for Assessment</Button>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ─── MAIN APP SHELL ───────────────────────────────────────
  const PILLAR_NAMES = {
    sa: { name: "Sustainability Alignment", icon: "shield" },
    epv: { name: "Energy & Power Viability", icon: "zap" },
    wre: { name: "Water & Resource Efficiency", icon: "droplet" },
    csr: { name: "Climate & Site Resilience", icon: "cloud" },
    dfr: { name: "Delivery & Funding Readiness", icon: "target" },
  };

  function renderContent() {
    // ─── DASHBOARD ────────────────────────────────────
    if (navItem === "dashboard") {
      const totalProjects = projects.length;
      const assessedProjects = Object.keys(assessments).length;
      const latestScore = currentAssessment?.capitalReadinessScore;

      return (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
            <p style={{ color: COLORS.textSecondary, fontSize: 15 }}>Here's an overview of your capital readiness activity.</p>
          </div>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
            {[
              { label: "Total Projects", value: totalProjects, icon: "projects" },
              { label: "Assessments Run", value: assessedProjects, icon: "assessment" },
              { label: "Latest Score", value: latestScore ?? "—", icon: "star" },
              { label: "Reports Generated", value: assessedProjects, icon: "reports" },
            ].map((stat, i) => (
              <Card key={i} style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 8 }}>{stat.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'JetBrains Mono'" }}>{stat.value}</div>
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: COLORS.accentSubtle, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name={stat.icon} size={16} color={COLORS.accent} />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {projects.length === 0 ? (
            <EmptyState icon="projects" title="No projects yet" description="Create your first project to start assessing capital readiness." action="Create New Project" onAction={handleCreateProject} />
          ) : (
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Recent Projects</h3>
                <Button size="sm" icon="plus" onClick={handleCreateProject}>New Project</Button>
              </div>
              {projects.slice(0, 5).map((p, i) => {
                const assessment = assessments[p.id];
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderTop: i > 0 ? `1px solid ${COLORS.border}` : "none" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{p.project_name || "Untitled Project"}</div>
                      <div style={{ fontSize: 12, color: COLORS.textMuted }}>{p.region} · {p.country} · {p.development_stage?.replace(/_/g, " ")}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {assessment ? (
                        <div style={{ fontSize: 18, fontWeight: 700, color: assessment.band.color, fontFamily: "'JetBrains Mono'" }}>{assessment.capitalReadinessScore}</div>
                      ) : (
                        <span style={{ fontSize: 12, color: COLORS.textMuted }}>Not assessed</span>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => { setCurrentProject(p); if (assessment) setNavItem("results"); else handleEditProject(p); }}>
                        {assessment ? "View" : "Edit"}
                      </Button>
                      {!assessment && <Button size="sm" onClick={() => handleRunAssessment(p)}>Assess</Button>}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      );
    }

    // ─── PROJECTS ─────────────────────────────────────
    if (navItem === "projects") {
      return (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Projects</h1>
              <p style={{ color: COLORS.textSecondary, fontSize: 15 }}>Manage your data center project portfolio.</p>
            </div>
            <Button icon="plus" onClick={handleCreateProject}>New Project</Button>
          </div>
          {projects.length === 0 ? (
            <EmptyState icon="projects" title="No projects yet" description="Create your first project to get started." action="Create New Project" onAction={handleCreateProject} />
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {projects.map((p, i) => {
                const assessment = assessments[p.id];
                return (
                  <Card key={i} style={{ padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{p.project_name || "Untitled"}</div>
                        <div style={{ fontSize: 13, color: COLORS.textSecondary }}>{p.region} · {p.country}{p.city ? ` · ${p.city}` : ""}</div>
                        <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>Stage: {p.development_stage?.replace(/_/g, " ")} · Created: {new Date(p.created_at).toLocaleDateString()}</div>
                      </div>
                      {assessment && (
                        <div style={{ textAlign: "center", marginRight: 24 }}>
                          <div style={{ fontSize: 32, fontWeight: 700, color: assessment.band.color, fontFamily: "'JetBrains Mono'" }}>{assessment.capitalReadinessScore}</div>
                          <div style={{ fontSize: 11, color: assessment.band.color }}>{assessment.band.label}</div>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button size="sm" variant="secondary" onClick={() => handleEditProject(p)}>Edit</Button>
                        <Button size="sm" onClick={() => { if (assessment) { setCurrentProject(p); setNavItem("results"); } else handleRunAssessment(p); }}>
                          {assessment ? "View Results" : "Run Assessment"}
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // ─── RESULTS ──────────────────────────────────────
    if (navItem === "results" && currentAssessment) {
      const a = currentAssessment;
      if (selectedPillar) {
        const pillar = a.pillarDetails[selectedPillar];
        const meta = PILLAR_NAMES[selectedPillar];
        return (
          <div style={{ animation: "slideInRight 0.3s ease-out" }}>
            <Button variant="ghost" icon="arrowLeft" size="sm" onClick={() => setSelectedPillar(null)} style={{ marginBottom: 24 }}>Back to Results</Button>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: COLORS.accentSubtle, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={meta.icon} size={22} color={COLORS.accent} />
              </div>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700 }}>{meta.name}</h1>
                <p style={{ color: COLORS.textSecondary, fontSize: 14 }}>Weight: {Math.round(pillar.weight * 100)}% of total score · Contributes {Math.round(pillar.score * pillar.weight)} points</p>
              </div>
              <div style={{ marginLeft: "auto", fontSize: 40, fontWeight: 700, color: pillar.score >= 80 ? COLORS.green : pillar.score >= 60 ? COLORS.amber : COLORS.red, fontFamily: "'JetBrains Mono'" }}>{pillar.score}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <Card>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: COLORS.green }}>Positive Drivers</h3>
                {pillar.explanations.positive.length === 0 ? (
                  <p style={{ color: COLORS.textMuted, fontSize: 13 }}>No positive drivers identified.</p>
                ) : pillar.explanations.positive.map((e, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: i > 0 ? `1px solid ${COLORS.border}` : "none" }}>
                    <Icon name="check" size={14} color={COLORS.green} />
                    <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{e}</span>
                  </div>
                ))}
              </Card>
              <Card>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: COLORS.red }}>Negative Drivers</h3>
                {pillar.explanations.negative.length === 0 ? (
                  <p style={{ color: COLORS.textMuted, fontSize: 13 }}>No negative drivers identified.</p>
                ) : pillar.explanations.negative.map((e, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: i > 0 ? `1px solid ${COLORS.border}` : "none" }}>
                    <Icon name="alert" size={14} color={COLORS.red} />
                    <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{e}</span>
                  </div>
                ))}
              </Card>
            </div>
            
            {a.recommendations.filter(r => r.pillar === meta.name).length > 0 && (
              <Card style={{ marginTop: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Related Recommendations</h3>
                {a.recommendations.filter(r => r.pillar === meta.name).map((rec, i) => (
                  <div key={i} style={{ padding: "12px 0", borderTop: i > 0 ? `1px solid ${COLORS.border}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{rec.action}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.green }}>+{rec.uplift} pts</span>
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>{rec.reason}</div>
                  </div>
                ))}
              </Card>
            )}
          </div>
        );
      }

      return (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>{currentProject?.project_name} · {a.region} · {new Date(a.assessedAt).toLocaleDateString()}</div>
            <h1 style={{ fontSize: 26, fontWeight: 700 }}>Assessment Results</h1>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>Assessment generated: {new Date(a.assessedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · Methodology: Perennity Bridge v3.1 · April 2026</div>
          </div>

          {a.hardStopTriggered && (
            <div style={{ padding: 16, borderRadius: 10, background: COLORS.redBg, border: `1px solid ${COLORS.red}33`, display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 24 }}>
              <Icon name="alert" size={18} color={COLORS.red} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.red }}>Hard-Stop Triggered</div>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>{a.hardStopReason} — Score capped.</div>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 24, marginBottom: 32 }}>
            <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
              <ScoreRing score={a.capitalReadinessScore} size={180} />
              <div style={{ fontSize: 16, fontWeight: 600, color: a.band.color, marginTop: 12 }}>{a.band.label}</div>
              <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>Confidence: {a.confidenceScore}%</div>
            </Card>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {Object.entries(PILLAR_NAMES).map(([key, meta]) => (
                <PillarCard key={key} name={meta.name} icon={meta.icon} score={a.subscores[key]} weight={a.weights[key]} onClick={() => setSelectedPillar(key)} />
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <Card>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Top Risks</h3>
              {a.risks.length === 0 ? <p style={{ color: COLORS.textMuted, fontSize: 13 }}>No major risks identified.</p> : a.risks.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderTop: i > 0 ? `1px solid ${COLORS.border}` : "none" }}>
                  <Icon name="alert" size={14} color={COLORS.red} />
                  <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{r}</span>
                </div>
              ))}
            </Card>
            <Card>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Top Recommendations</h3>
              {a.recommendations.slice(0, 3).map((rec, i) => (
                <div key={i} style={{ padding: "10px 0", borderTop: i > 0 ? `1px solid ${COLORS.border}` : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{rec.action}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.green }}>+{rec.uplift}</span>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>{rec.impact} impact · {rec.difficulty} difficulty</div>
                </div>
              ))}
              <Button variant="ghost" size="sm" style={{ marginTop: 12 }} onClick={() => setNavItem("recommendations")}>View all recommendations</Button>
            </Card>
          </div>

          {/* SFDR + Taxonomy badges */}
          {currentAssessment.sfdr && (
            <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
              <div style={{ padding: "8px 16px", borderRadius: 8, background: currentAssessment.sfdr.classification === "Article 9" ? "#05966922" : currentAssessment.sfdr.classification === "Article 8" ? "#2563eb22" : COLORS.surfaceRaised, border: `1px solid ${currentAssessment.sfdr.classification === "Article 9" ? "#059669" : currentAssessment.sfdr.classification === "Article 8" ? "#2563eb" : COLORS.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: currentAssessment.sfdr.classification === "Article 9" ? "#059669" : currentAssessment.sfdr.classification === "Article 8" ? "#2563eb" : COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>SFDR</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{currentAssessment.sfdr.classification}</div>
                <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 1 }}>{currentAssessment.sfdr.label}</div>
              </div>
              {currentAssessment.taxonomy && (
                <div style={{ padding: "8px 16px", borderRadius: 8, background: currentAssessment.taxonomy.aligned ? COLORS.greenBg : COLORS.redBg, border: `1px solid ${currentAssessment.taxonomy.aligned ? COLORS.green : COLORS.red}33` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: currentAssessment.taxonomy.aligned ? COLORS.green : COLORS.red, textTransform: "uppercase", letterSpacing: "0.04em" }}>EU Taxonomy</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{currentAssessment.taxonomy.aligned ? "Aligned" : "Not Aligned"}</div>
                  <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 1 }}>{currentAssessment.taxonomy.aligned ? "Activity 8.1 criteria met" : `${currentAssessment.taxonomy.criteria?.filter(c => !c.met).length || 0} criteria unmet`}</div>
                </div>
              )}
            </div>
          )}

          {/* Applicable Regulatory Frameworks — driven by Tab 5 Target Financing Label */}
          {(() => {
            const fw = getApplicableFrameworks(currentProject?.target_financing_label);
            return (
              <Card style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Applicable Regulatory Frameworks</h3>
                {fw.labelSelected ? (
                  <p style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 16 }}>
                    Based on your selected target financing label: <strong>{fw.labelName}</strong>
                  </p>
                ) : (
                  <p style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 16 }}>
                    No target financing label selected. The following frameworks are commonly considered for data centre projects and may apply depending on your final capital sourcing strategy.
                  </p>
                )}
                {fw.primary.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Primary framework{fw.primary.length > 1 ? "s" : ""}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {fw.primary.map((f, i) => (
                        <div key={i} style={{ padding: "6px 14px", borderRadius: 6, background: COLORS.accent, fontSize: 13, fontWeight: 500, color: "#FFFFFF" }}>{f}</div>
                      ))}
                    </div>
                  </div>
                )}
                {fw.secondary.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{fw.labelSelected ? "Cross-check against" : "Consider"}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {fw.secondary.map((f, i) => (
                        <div key={i} style={{ padding: "6px 14px", borderRadius: 6, background: COLORS.accentSubtle, border: `1px solid ${COLORS.accent}33`, fontSize: 13, fontWeight: 500, color: COLORS.accent }}>{f}</div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })()}

          {/* DNSH & Minimum Social Safeguards checklist */}
          {currentAssessment.dnsh?.details && (
            <Card style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>DNSH & Minimum Social Safeguards</h3>
              <p style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>EU Taxonomy Article 18 + DNSH requirements per 2020/852. Score: <strong>{currentAssessment.dnsh.score}/100</strong></p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {currentAssessment.dnsh.details.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 10, borderRadius: 8, background: d.met ? COLORS.greenBg : COLORS.redBg, border: `1px solid ${d.met ? COLORS.green : COLORS.red}22` }}>
                    <Icon name={d.met ? "check" : "alert"} size={14} color={d.met ? COLORS.green : COLORS.red} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.text }}>{d.label}</div>
                      <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{d.citation}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* AI Narrative Panel */}
          {(aiLoading || aiNarrative) && (
            <Card style={{ marginTop: 24, background: COLORS.accentSubtle, borderColor: `${COLORS.accent}33` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Icon name="star" size={16} color={COLORS.accent} />
                <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.accent }}>AI Regulatory Analysis</span>
                {aiLoading && <span style={{ fontSize: 12, color: COLORS.textMuted, animation: "pulse 1s infinite" }}>Generating…</span>}
              </div>
              <div style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{aiNarrative}</div>
            </Card>
          )}

          {/* Regulatory Q&A */}
          <Card style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Regulatory Q&A</h3>
            <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 12 }}>
              {qaHistory.map((msg, i) => (
                <div key={i} style={{ marginBottom: 12, display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "80%", padding: "8px 12px", borderRadius: 8, background: msg.role === "user" ? COLORS.accent : COLORS.surfaceRaised, color: msg.role === "user" ? "#fff" : COLORS.text, fontSize: 13 }}>{msg.content}</div>
                </div>
              ))}
              {qaStreaming && <div style={{ fontSize: 13, color: COLORS.textMuted, animation: "pulse 1s infinite" }}>Answering…</div>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={qaQuestion} onChange={e => setQaQuestion(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && qaQuestion.trim() && !qaStreaming) handleQaSubmit(); }} placeholder="Ask about regulatory requirements…" style={{ flex: 1 }} />
              <Button size="sm" disabled={!qaQuestion.trim() || qaStreaming} onClick={handleQaSubmit}>Ask</Button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {["Why didn't I qualify for Article 9?", "What's needed for EU Taxonomy alignment?", "How can I improve my score?"].map(q => (
                <button key={q} onClick={() => { setQaQuestion(q); }} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "transparent", cursor: "pointer", color: COLORS.textSecondary }}>{q}</button>
              ))}
            </div>
          </Card>

          <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
            <Button variant="secondary" icon="download" onClick={() => { const id = `PER-${currentProject.id.slice(-6).toUpperCase()}`; downloadPdf(currentProject, currentAssessment, id); }}>Download PDF</Button>
            <Button variant="secondary" icon="download" onClick={() => { const id = `PER-${currentProject.id.slice(-6).toUpperCase()}`; downloadExcel(currentProject, currentAssessment, id); }}>Download Excel</Button>
            <Button onClick={() => setNavItem("advisory")} icon="advisory">Request Advisory Support</Button>
          </div>
        </div>
      );
    }

    if (navItem === "results" && !currentAssessment) {
      return <EmptyState icon="assessment" title="No assessment available" description="Run an assessment on a project to see results here." action="Go to Projects" onAction={() => setNavItem("projects")} />;
    }

    // ─── RECOMMENDATIONS ─────────────────────────────
    if (navItem === "recommendations") {
      if (!currentAssessment) return <EmptyState icon="star" title="No recommendations yet" description="Run an assessment first." action="Go to Projects" onAction={() => setNavItem("projects")} />;
      const recs = currentAssessment.recommendations;
      return (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Recommendations</h1>
          <p style={{ color: COLORS.textSecondary, fontSize: 15, marginBottom: 32 }}>Priority improvements ranked by potential score uplift.</p>
          <div style={{ display: "grid", gap: 16 }}>
            {recs.map((rec, i) => (
              <Card key={i} style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{rec.action}</div>
                    <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 12 }}>{rec.reason}</div>
                    <div style={{ display: "flex", gap: 16 }}>
                      <span style={{ fontSize: 12, color: COLORS.textMuted }}>Impact: <strong style={{ color: rec.impact === "High" ? COLORS.green : COLORS.amber }}>{rec.impact}</strong></span>
                      <span style={{ fontSize: 12, color: COLORS.textMuted }}>Difficulty: <strong style={{ color: rec.difficulty === "Low" ? COLORS.green : rec.difficulty === "Medium" ? COLORS.amber : COLORS.red }}>{rec.difficulty}</strong></span>
                      <span style={{ fontSize: 12, color: COLORS.textMuted }}>Pillar: {rec.pillar}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "center", marginLeft: 24 }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.green, fontFamily: "'JetBrains Mono'" }}>+{rec.uplift}</div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted }}>est. uplift</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Card style={{ marginTop: 24, background: COLORS.accentSubtle, borderColor: `${COLORS.accent}33` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Need help implementing these improvements?</div>
                <div style={{ fontSize: 13, color: COLORS.textSecondary }}>Our advisory team specialises in data center sustainability and capital readiness.</div>
              </div>
              <Button onClick={() => setNavItem("advisory")}>Talk to Perennity Advisory</Button>
            </div>
          </Card>
        </div>
      );
    }

    // ─── REPORTS ──────────────────────────────────────
    if (navItem === "reports") {
      const assessedList = projects.filter(p => assessments[p.id]);
      if (assessedList.length === 0) return <EmptyState icon="reports" title="No reports available" description="Complete an assessment to generate reports." action="Go to Projects" onAction={() => setNavItem("projects")} />;
      return (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Reports</h1>
          <p style={{ color: COLORS.textSecondary, fontSize: 15, marginBottom: 32 }}>Generate and download investor-ready assessment outputs.</p>
          <div style={{ display: "grid", gap: 16 }}>
            {assessedList.map((p, i) => {
              const a = assessments[p.id];
              return (
                <Card key={i} style={{ padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{p.project_name}</div>
                      <div style={{ fontSize: 12, color: COLORS.textMuted }}>Score: {a.capitalReadinessScore} · {a.band.label} · {new Date(a.assessedAt).toLocaleDateString()}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button size="sm" variant="secondary" icon="download" onClick={() => { const id = `PER-${p.id.slice(-6).toUpperCase()}`; downloadPdf(p, a, id); }}>PDF Report</Button>
                      <Button size="sm" variant="secondary" icon="download" onClick={() => { const id = `PER-${p.id.slice(-6).toUpperCase()}`; downloadExcel(p, a, id); }}>Excel</Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      );
    }

    // ─── ADVISORY ─────────────────────────────────────
    if (navItem === "advisory") {
      return (
        <div style={{ animation: "fadeIn 0.4s ease-out", maxWidth: 640 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Request Advisory Support</h1>
          <p style={{ color: COLORS.textSecondary, fontSize: 15, marginBottom: 32 }}>Connect with Perennity's advisory team for expert support on your project.</p>
          <Card>
            <FormField label="Support Area" required>
              <select value={advisoryForm.request_type} onChange={e => setAdvisoryForm({...advisoryForm, request_type: e.target.value})}>
                <option value="">Select area</option>
                <option value="sustainability_alignment">Sustainability Alignment Support</option>
                <option value="power_strategy">Power Strategy Review</option>
                <option value="site_selection">Site Selection Support</option>
                <option value="investor_readiness">Investor Readiness Support</option>
                <option value="cooling_design">Cooling Design Advisory</option>
                <option value="regulatory_compliance">Regulatory Compliance</option>
              </select>
            </FormField>
            <FormField label="Tell us about your challenge">
              <textarea value={advisoryForm.message} onChange={e => setAdvisoryForm({...advisoryForm, message: e.target.value})} placeholder="Describe what you need help with..." />
            </FormField>
            <Button
              style={{ width: "100%", justifyContent: "center" }}
              disabled={!advisoryForm.request_type}
              onClick={() => {
                sendToAirtable("Advisory Requests", {
                  "Support Area": advisoryForm.request_type,
                  "Message": advisoryForm.message,
                  "User Name": user?.name,
                  "User Email": user?.email,
                  "User Company": user?.company,
                  "Timestamp": new Date().toISOString(),
                });
                setAdvisoryForm({ request_type: "", message: "" });
                alert("Request submitted successfully! We'll be in touch soon.");
              }}
            >
              Submit Request
            </Button>
          </Card>
        </div>
      );
    }

    return null;
  }

  // ─── APP SHELL ──────────────────────────────────────
  const navItems = [
    { key: "dashboard", label: "Dashboard", icon: "dashboard" },
    { key: "projects", label: "Projects", icon: "projects" },
    { key: "results", label: "Assessments", icon: "assessment" },
    { key: "recommendations", label: "Recommendations", icon: "star" },
    { key: "reports", label: "Reports", icon: "reports" },
    { key: "advisory", label: "Advisory", icon: "advisory" },
  ];

  return (
    <>
      <style>{css}</style>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: sidebarCollapsed ? 48 : 240, borderRight: `1px solid #1a3040`, display: "flex", flexDirection: "column", background: "#0d2030", flexShrink: 0, transition: "width 0.2s ease", overflow: "hidden" }}>
          <div style={{ padding: sidebarCollapsed ? "20px 8px 24px" : "20px 20px 24px", display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "space-between" }}>
            {!sidebarCollapsed && <img src={pbDarkLogo} alt="Perennity Bridge" style={{ display: "block", width: "140px", height: "auto" }} />}
            <div onClick={() => setSidebarCollapsed(c => !c)} style={{ cursor: "pointer", padding: 4, borderRadius: 4, transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <Icon name={sidebarCollapsed ? "panelOpen" : "panelClose"} size={16} color="rgba(255,255,255,0.55)" />
            </div>
          </div>
          <nav style={{ flex: 1, padding: sidebarCollapsed ? "0 4px" : "0 12px" }}>
            {navItems.map(item => (
              <div key={item.key} onClick={() => { setNavItem(item.key); setSelectedPillar(null); }}
                title={sidebarCollapsed ? item.label : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: sidebarCollapsed ? "10px 0" : "10px 12px", borderRadius: 8,
                  cursor: "pointer", marginBottom: 2, fontSize: 14, fontWeight: navItem === item.key ? 500 : 400,
                  color: navItem === item.key ? "#ffffff" : "rgba(255,255,255,0.55)",
                  background: navItem === item.key ? "rgba(78, 205, 164, 0.15)" : "transparent",
                  transition: "all 0.15s", justifyContent: sidebarCollapsed ? "center" : "flex-start",
                }}
                onMouseEnter={e => { if (navItem !== item.key) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { if (navItem !== item.key) e.currentTarget.style.background = "transparent"; }}
              >
                <Icon name={item.icon} size={16} color={navItem === item.key ? "#4ECDA4" : "rgba(255,255,255,0.55)"} />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </div>
            ))}
          </nav>
          <div style={{ padding: sidebarCollapsed ? "0 4px 8px" : "0 12px 8px" }}>
            <div onClick={() => setShowHistory(true)} title={sidebarCollapsed ? "History" : undefined} style={{ display: "flex", alignItems: "center", gap: 10, padding: sidebarCollapsed ? "10px 0" : "10px 12px", borderRadius: 8, cursor: "pointer", fontSize: 14, color: "rgba(255,255,255,0.55)", transition: "all 0.15s", justifyContent: sidebarCollapsed ? "center" : "flex-start" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <Icon name="reports" size={16} color="rgba(255,255,255,0.55)" />
              {!sidebarCollapsed && <span>History</span>}
            </div>
          </div>
          {!sidebarCollapsed && (
            <div style={{ padding: "16px 20px", borderTop: `1px solid #1a3040` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="user" size={14} color="rgba(255,255,255,0.7)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#ffffff" }}>{user?.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{user?.role}</div>
                </div>
              </div>
              <div
                onClick={() => setShowTos(true)}
                style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", cursor: "pointer", padding: "4px 0" }}
                onMouseEnter={e => e.currentTarget.style.color = "#4ECDA4"}
                onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.55)"}
              >
                Terms of Service & Confidentiality
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <div style={{ padding: "12px 4px", borderTop: `1px solid #1a3040`, display: "flex", justifyContent: "center" }}>
              <div onClick={() => setShowTos(true)} title="User" style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Icon name="user" size={14} color="rgba(255,255,255,0.7)" />
              </div>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="main-scroll" style={{ flex: 1, padding: "32px 40px" }}>
          <div style={{ maxWidth: 1100 }}>
            {renderContent()}
          </div>
        </div>
      </div>
      {showTos && <TOSModal onClose={() => setShowTos(false)} onAccept={() => setShowTos(false)} />}

      {/* Draft restore banner */}
      {draftBanner && screen === "app" && navItem === "dashboard" && (
        <div style={{ position: "fixed", bottom: 24, left: 260, right: 24, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 100 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Unsaved assessment draft from {new Date(draftBanner.savedAt).toLocaleDateString()}</span>
            <span style={{ fontSize: 13, color: COLORS.textSecondary, marginLeft: 8 }}>Resume where you left off?</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="sm" onClick={() => { setProjectDraft(draftBanner.wizardData); setWizardStep(0); setScreen("wizard"); setDraftBanner(null); }}>Resume Draft</Button>
            <Button size="sm" variant="ghost" onClick={() => { clearDraft(); setDraftBanner(null); }}>Dismiss</Button>
          </div>
        </div>
      )}

      {/* History slide-over */}
      {showHistory && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200 }} onClick={() => setShowHistory(false)}>
          <div style={{ position: "absolute", top: 0, right: 0, width: 400, height: "100%", background: COLORS.surface, borderLeft: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", animation: "slideInRight 0.25s ease-out" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 17, fontWeight: 600 }}>Assessment History</h3>
              <div onClick={() => setShowHistory(false)} style={{ cursor: "pointer", padding: 4 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary} strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
              {historyList.length === 0 ? (
                <div style={{ textAlign: "center", color: COLORS.textMuted, fontSize: 14, marginTop: 40 }}>No saved assessments yet.</div>
              ) : historyList.map(item => (
                <Card key={item.id} style={{ marginBottom: 12, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{item.projectName}</div>
                      <div style={{ fontSize: 12, color: COLORS.textMuted }}>{item.region} · {new Date(item.savedAt).toLocaleDateString()}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: item.score >= 80 ? COLORS.green : item.score >= 60 ? COLORS.amber : COLORS.red }}>{item.score}/100</span>
                        {item.sfdr && <span style={{ fontSize: 11, color: COLORS.textSecondary }}>{item.sfdr}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button size="sm" variant="secondary" onClick={() => { if (item.project && item.assessment) { setCurrentProject(item.project); setAssessments(prev => ({ ...prev, [item.project.id]: item.assessment })); setNavItem("results"); setShowHistory(false); } }}>Load</Button>
                      <Button size="sm" variant="danger" onClick={() => { deleteAssessment(item.id).then(() => listAssessments().then(setHistoryList)); }}>Delete</Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
