import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import perennityLogo from "./assets/perennity-logo.png";

// ============================================================
// PERENNITY CAPITAL READINESS PLATFORM — FULL MVP APPLICATION
// ============================================================

// ─── AIRTABLE BACKEND ───────────────────────────────────────
const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID;
const AIRTABLE_API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY;

async function sendToAirtable(tableName, fields) {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
    console.warn("Airtable credentials not configured");
    return false;
  }
  try {
    const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) console.warn("Airtable error:", await res.json());
    return res.ok;
  } catch (e) { console.warn("Airtable send failed:", e); return false; }
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

const READINESS_BANDS = [
  { min: 80, label: "Green Ready", color: COLORS.green },
  { min: 60, label: "Needs Optimization", color: COLORS.amber },
  { min: 0, label: "High Risk", color: COLORS.red },
];

// ─── SCORING ENGINE ─────────────────────────────────────────
function calculateSustainabilityAlignment(project, region) {
  let score = 100;
  const thresholds = REGION_THRESHOLDS[region] || REGION_THRESHOLDS.UK;
  const explanations = { positive: [], negative: [] };

  if (project.pue && project.pue > thresholds.pue) {
    const penalty = Math.min(20, Math.round((project.pue - thresholds.pue) * 40));
    score -= penalty;
    explanations.negative.push(`PUE ${project.pue} above ${region} threshold ${thresholds.pue} (−${penalty})`);
  } else if (project.pue) {
    explanations.positive.push(`PUE ${project.pue} meets ${region} benchmark`);
  }

  const renewPct = project.renewable_energy_share_pct || 0;
  if (renewPct < thresholds.renewableMin) {
    const penalty = Math.min(25, Math.round((thresholds.renewableMin - renewPct) * 0.5));
    score -= penalty;
    explanations.negative.push(`Renewable share ${renewPct}% below ${thresholds.renewableMin}% target (−${penalty})`);
  } else {
    explanations.positive.push(`Renewable energy share ${renewPct}% exceeds regional target`);
  }

  if (project.backup_power_type === "diesel") {
    score -= 12;
    explanations.negative.push("Diesel-only backup power strategy (−12)");
  } else if (project.backup_power_type === "battery" || project.backup_power_type === "hydrogen") {
    explanations.positive.push("Clean backup power strategy");
  }

  if (!project.sustainability_disclosures_ready) {
    score -= 10;
    explanations.negative.push("Sustainability disclosures not ready (−10)");
  }

  if (project.taxonomy_alignment_claimed) {
    explanations.positive.push("Targeting taxonomy alignment");
  }

  if (project.net_zero_commitment_present) {
    score += 5;
    explanations.positive.push("Net-zero commitment in place (+5)");
  }

  if (project.carbon_reduction_strategy_present) {
    score += 3;
    explanations.positive.push("Carbon reduction strategy defined (+3)");
  }

  if (project.third_party_certification_target && project.third_party_certification_target !== "none") {
    score += 5;
    explanations.positive.push(`Targeting ${project.third_party_certification_target} certification (+5)`);
  }

  return { score: Math.max(0, Math.min(100, score)), explanations };
}

function calculateEnergyPowerViability(project, region) {
  const explanations = { positive: [], negative: [] };
  
  // Grid availability subscore (35%)
  let gridScore = 50;
  if (project.grid_connection_status === "secured") {
    gridScore = 95;
    explanations.positive.push("Grid capacity fully secured");
  } else if (project.grid_connection_status === "partially_secured") {
    gridScore = 75;
  } else if (project.grid_connection_status === "application_submitted") {
    gridScore = 60;
  } else if (project.grid_connection_status === "in_discussion") {
    gridScore = 45;
    explanations.negative.push("Grid connection only in discussion phase");
  } else {
    gridScore = 20;
    explanations.negative.push("Grid connection process not started");
  }

  // Interconnection feasibility (25%)
  let interScore = 50;
  const months = project.interconnection_timeline_months;
  if (months && months <= 12) { interScore = 92; explanations.positive.push("Fast interconnection timeline (<12 months)"); }
  else if (months && months <= 24) { interScore = 72; }
  else if (months && months <= 36) { interScore = 48; explanations.negative.push("Interconnection timeline 24–36 months"); }
  else if (months && months > 36) { interScore = 28; explanations.negative.push("Interconnection timeline exceeds 36 months"); }

  // Renewable power access (25%)
  let renewScore = 40;
  const renewPct = project.renewable_energy_share_pct || 0;
  if (project.ppa_secured && renewPct >= 50) { renewScore = 92; explanations.positive.push("PPA secured with strong renewable share"); }
  else if (project.ppa_secured) { renewScore = 78; }
  else if (renewPct >= 50) { renewScore = 65; }
  else if (renewPct >= 25) { renewScore = 45; }
  else { renewScore = 25; explanations.negative.push("Weak renewable power access"); }

  // Backup power resilience (15%)
  let backupScore = 50;
  if (project.backup_power_type === "hybrid") { backupScore = 85; }
  else if (project.backup_power_type === "battery") { backupScore = 80; }
  else if (project.backup_power_type === "gas") { backupScore = 60; }
  else if (project.backup_power_type === "diesel") { backupScore = 35; }
  if (project.battery_storage_mwh && project.battery_storage_mwh > 0) { backupScore = Math.min(100, backupScore + 10); }

  const score = gridScore * 0.35 + interScore * 0.25 + renewScore * 0.25 + backupScore * 0.15;
  return { score: Math.max(0, Math.min(100, Math.round(score))), explanations };
}

function calculateWaterResourceEfficiency(project, region) {
  const explanations = { positive: [], negative: [] };
  const thresholds = REGION_THRESHOLDS[region] || REGION_THRESHOLDS.UK;

  // WUE score (50%)
  let wueScore = 50;
  if (project.wue) {
    if (project.wue <= 0.3) { wueScore = 95; explanations.positive.push("Best-in-class WUE"); }
    else if (project.wue <= 0.6) { wueScore = 80; }
    else if (project.wue <= 1.0) { wueScore = 60; }
    else if (project.wue <= 1.5) { wueScore = 40; explanations.negative.push("WUE above acceptable range"); }
    else { wueScore = 20; explanations.negative.push("Poor WUE performance"); }
  }

  // Cooling efficiency (25%)
  let coolingScore = 50;
  if (project.cooling_type === "liquid") { coolingScore = 90; explanations.positive.push("Liquid cooling — highly efficient"); }
  else if (project.cooling_type === "hybrid") { coolingScore = 75; }
  else if (project.cooling_type === "evaporative") { coolingScore = 55; }
  else if (project.cooling_type === "air") { coolingScore = 45; }

  // Water context fit (25%)
  let contextScore = 60;
  const waterStress = project.water_stress_index || 0.5;
  if (waterStress > 0.7 && project.cooling_type === "evaporative" && !project.water_recycling_included) {
    contextScore = 15;
    explanations.negative.push("High water use in water-stressed region without recycling");
  } else if (project.water_recycling_included) {
    contextScore = 85;
    explanations.positive.push("Water recycling systems planned");
  }

  if (project.waste_heat_recovery) {
    contextScore = Math.min(100, contextScore + 10);
    explanations.positive.push("Waste heat recovery planned");
  }

  const score = wueScore * 0.50 + coolingScore * 0.25 + contextScore * 0.25;
  return { score: Math.max(0, Math.min(100, Math.round(score))), explanations };
}

function calculateClimateSiteResilience(project) {
  const explanations = { positive: [], negative: [] };

  const flood = project.flood_risk_score ?? 50;
  const heat = project.extreme_heat_risk_score ?? 50;
  const storm = project.storm_risk_score ?? 30;
  const wildfire = project.wildfire_risk_score ?? 20;

  // Convert risk scores (0-100 where 100=highest risk) to resilience scores
  let floodScore = Math.max(0, 100 - flood);
  let heatScore = Math.max(0, 100 - heat);
  let stormScore = Math.max(0, 100 - storm * 0.8);
  let weatherScore = Math.max(0, 100 - (storm + wildfire) / 2);

  if (flood > 60 && !project.adaptation_measures_present) {
    explanations.negative.push("High flood risk with no adaptation measures");
  } else if (flood > 60 && project.adaptation_measures_present) {
    floodScore = Math.min(100, floodScore + 25);
    explanations.positive.push("Flood risk mitigated by adaptation measures");
  }

  if (heat > 60) {
    explanations.negative.push("Significant extreme heat exposure");
  }

  let adaptScore = 40;
  if (project.adaptation_measures_present) {
    adaptScore = 80;
    explanations.positive.push("Climate adaptation measures in design");
  }
  if (project.business_continuity_plan_ready) {
    adaptScore = Math.min(100, adaptScore + 15);
    explanations.positive.push("Business continuity plan ready");
  }

  const score = floodScore * 0.25 + heatScore * 0.20 + stormScore * 0.20 + weatherScore * 0.20 + adaptScore * 0.15;
  return { score: Math.max(0, Math.min(100, Math.round(score))), explanations };
}

function calculateDeliveryFundingReadiness(project) {
  const explanations = { positive: [], negative: [] };

  // Project maturity (30%)
  let maturityScore = 40;
  const stage = project.development_stage;
  if (stage === "shovel_ready") { maturityScore = 95; explanations.positive.push("Shovel-ready project"); }
  else if (stage === "permitted") { maturityScore = 85; }
  else if (stage === "pre_permitting") { maturityScore = 68; }
  else if (stage === "site_selected") { maturityScore = 55; }
  else if (stage === "site_shortlisted") { maturityScore = 40; }
  else if (stage === "concept") { maturityScore = 30; explanations.negative.push("Concept stage — low maturity for investors"); }

  // Data completeness (25%)
  const criticalFields = [
    "pue", "planned_capacity_mw", "cooling_type", "backup_power_type",
    "grid_connection_status", "renewable_energy_share_pct", "development_stage",
    "financing_strategy_defined"
  ];
  const filled = criticalFields.filter(f => project[f] !== undefined && project[f] !== null && project[f] !== "").length;
  const completeness = Math.round((filled / criticalFields.length) * 100);
  let dataScore = completeness;
  if (completeness < 50) explanations.negative.push("Critical data fields missing — reduces confidence");

  // Financing prep (25%)
  let financeScore = 30;
  if (project.financing_strategy_defined) financeScore += 25;
  if (project.investment_memo_ready) { financeScore += 20; explanations.positive.push("Investment memo ready"); }
  if (project.site_control_secured) { financeScore += 15; explanations.positive.push("Site control secured"); }
  if (!project.financing_strategy_defined) explanations.negative.push("No financing strategy defined");

  // Execution credibility (20%)
  let execScore = 40;
  if (project.permitting_status === "approved") { execScore = 90; }
  else if (project.permitting_status === "partially_approved") { execScore = 70; }
  else if (project.permitting_status === "underway") { execScore = 55; }
  if (project.contractor_or_epc_identified) { execScore = Math.min(100, execScore + 15); }
  if (project.schedule_confidence_level === "high") execScore = Math.min(100, execScore + 10);

  const score = maturityScore * 0.30 + dataScore * 0.25 + financeScore * 0.25 + execScore * 0.20;
  return { score: Math.max(0, Math.min(100, Math.round(score))), explanations, dataCompleteness: completeness };
}

function evaluateHardStops(project, region) {
  const stops = [];

  if (project.grid_connection_status === "not_started" && (region === "US" || region === "EU")) {
    stops.push({ reason: "No realistic grid access pathway", cap: 45 });
  }

  if ((project.flood_risk_score || 0) > 80 && !project.adaptation_measures_present) {
    stops.push({ reason: "Extreme unmitigated flood risk", cap: 50 });
  }

  if ((project.water_stress_index || 0) > 0.85 && project.cooling_type === "evaporative" && !project.water_recycling_included) {
    stops.push({ reason: "Very high water stress with water-intensive cooling and no recycling", cap: 50 });
  }

  const criticalFields = ["pue", "planned_capacity_mw", "cooling_type", "grid_connection_status"];
  const missing = criticalFields.filter(f => !project[f]);
  if (missing.length >= 3) {
    stops.push({ reason: "Missing critical technical data", cap: 55 });
  }

  if ((region === "EU" || region === "UK") && project.target_financing_label && 
      (project.target_financing_label === "green" || project.target_financing_label === "article_8_9") &&
      !project.taxonomy_alignment_claimed && (project.renewable_energy_share_pct || 0) < 30) {
    stops.push({ reason: `Sustainability framework non-eligibility for ${region} green raise`, cap: 59 });
  }

  return stops;
}

function generateRecommendations(project, subscores, region) {
  const recs = [];
  const thresholds = REGION_THRESHOLDS[region] || REGION_THRESHOLDS.UK;

  if (!project.ppa_secured && subscores.epv < 80) {
    recs.push({ action: "Secure renewable PPA", uplift: 8, impact: "High", difficulty: "Medium", 
      reason: "Improves sustainability alignment and funding attractiveness", pillar: "Energy & Power Viability" });
  }

  if (project.pue && project.pue > thresholds.pue) {
    recs.push({ action: "Reduce projected PUE", uplift: 6, impact: "High", difficulty: "Medium",
      reason: `Current PUE ${project.pue} exceeds ${region} benchmark of ${thresholds.pue}`, pillar: "Sustainability Alignment" });
  }

  if (project.cooling_type !== "liquid" && project.cooling_type !== "hybrid") {
    recs.push({ action: "Adopt liquid or hybrid cooling", uplift: 5, impact: "Medium", difficulty: "High",
      reason: "Improves WUE and energy efficiency", pillar: "Water & Resource Efficiency" });
  }

  if (!project.water_recycling_included) {
    recs.push({ action: "Add water recycling measures", uplift: 4, impact: "Medium", difficulty: "Low",
      reason: "Reduces water dependency and improves resource score", pillar: "Water & Resource Efficiency" });
  }

  if ((project.flood_risk_score || 0) > 40 && !project.adaptation_measures_present) {
    recs.push({ action: "Validate flood mitigation measures", uplift: 5, impact: "High", difficulty: "Medium",
      reason: "Unmitigated flood risk significantly reduces climate resilience score", pillar: "Climate & Site Resilience" });
  }

  if (!project.financing_strategy_defined) {
    recs.push({ action: "Define financing strategy", uplift: 6, impact: "High", difficulty: "Low",
      reason: "A clear strategy signals maturity to investors", pillar: "Delivery & Funding Readiness" });
  }

  if (!project.investment_memo_ready) {
    recs.push({ action: "Prepare investment memo", uplift: 4, impact: "Medium", difficulty: "Medium",
      reason: "Required by most institutional investors", pillar: "Delivery & Funding Readiness" });
  }

  if (project.backup_power_type === "diesel") {
    recs.push({ action: "Transition backup power from diesel", uplift: 5, impact: "Medium", difficulty: "High",
      reason: "Diesel-heavy strategy weakens sustainability alignment", pillar: "Sustainability Alignment" });
  }

  return recs.sort((a, b) => b.uplift - a.uplift).slice(0, 5);
}

function calculateConfidence(project) {
  const weightedFields = {
    pue: 3, planned_capacity_mw: 3, cooling_type: 2, backup_power_type: 2,
    grid_connection_status: 3, renewable_energy_share_pct: 3, ppa_secured: 2,
    wue: 2, development_stage: 2, financing_strategy_defined: 2,
    interconnection_timeline_months: 2, flood_risk_score: 1, extreme_heat_risk_score: 1,
    water_recycling_included: 1, site_control_secured: 1, permitting_status: 1,
    adaptation_measures_present: 1, sustainability_disclosures_ready: 1,
  };
  let totalWeight = 0, completedWeight = 0;
  for (const [field, weight] of Object.entries(weightedFields)) {
    totalWeight += weight;
    if (project[field] !== undefined && project[field] !== null && project[field] !== "") {
      completedWeight += weight;
    }
  }
  return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
}

function runAssessment(project, region) {
  const sa = calculateSustainabilityAlignment(project, region);
  const epv = calculateEnergyPowerViability(project, region);
  const wre = calculateWaterResourceEfficiency(project, region);
  const csr = calculateClimateSiteResilience(project);
  const dfr = calculateDeliveryFundingReadiness(project);

  const weights = REGION_WEIGHTS[region] || REGION_WEIGHTS.UK;
  const rawScore = sa.score * weights.sa + epv.score * weights.epv + wre.score * weights.wre + csr.score * weights.csr + dfr.score * weights.dfr;

  const hardStops = evaluateHardStops(project, region);
  let finalScore = Math.round(rawScore);
  let hardStopTriggered = false;
  let hardStopReason = null;

  if (hardStops.length > 0) {
    const lowestCap = Math.min(...hardStops.map(s => s.cap));
    if (finalScore > lowestCap) {
      finalScore = lowestCap;
      hardStopTriggered = true;
      hardStopReason = hardStops[0].reason;
    }
  }

  const subscores = { sa: sa.score, epv: epv.score, wre: wre.score, csr: csr.score, dfr: dfr.score };
  const confidence = calculateConfidence(project);
  const recommendations = generateRecommendations(project, subscores, region);
  const band = READINESS_BANDS.find(b => finalScore >= b.min);

  const allExplanations = {
    positive: [...sa.explanations.positive, ...epv.explanations.positive, ...wre.explanations.positive, ...csr.explanations.positive, ...dfr.explanations.positive],
    negative: [...sa.explanations.negative, ...epv.explanations.negative, ...wre.explanations.negative, ...csr.explanations.negative, ...dfr.explanations.negative],
  };

  const risks = allExplanations.negative.slice(0, 3);

  return {
    capitalReadinessScore: finalScore,
    confidenceScore: confidence,
    band,
    subscores,
    hardStopTriggered,
    hardStopReason,
    hardStops,
    recommendations,
    risks,
    explanations: allExplanations,
    pillarDetails: {
      sa: { ...sa, weight: weights.sa },
      epv: { ...epv, weight: weights.epv },
      wre: { ...wre, weight: weights.wre },
      csr: { ...csr, weight: weights.csr },
      dfr: { ...dfr, weight: weights.dfr, dataCompleteness: dfr.dataCompleteness },
    },
    region,
    weights,
    assessedAt: new Date().toISOString(),
  };
}

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

function FormField({ label, help, required, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: COLORS.textSecondary, marginBottom: 6 }}>
        {label} {required && <span style={{ color: COLORS.red }}>*</span>}
      </label>
      {children}
      {help && <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>{help}</div>}
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
  return (
    <div style={{ display: "flex", gap: 4, padding: "16px 0" }}>
      {steps.map((step, i) => (
        <div key={i} onClick={() => onStepClick?.(i)} style={{
          flex: 1, cursor: "pointer", textAlign: "center",
        }}>
          <div style={{
            height: 3, borderRadius: 2, marginBottom: 8,
            background: i <= currentStep ? COLORS.accent : COLORS.border,
            transition: "background 0.3s",
          }} />
          <div style={{ fontSize: 11, color: i <= currentStep ? COLORS.text : COLORS.textMuted, fontWeight: i === currentStep ? 600 : 400 }}>
            {step}
          </div>
        </div>
      ))}
    </div>
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
    "Applying regional weighting",
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
  project_name: "", region: "", country: "", state_or_province: "", city: "",
  development_stage: "", expected_commissioning_date: "",
  planned_capacity_mw: "", it_load_mw: "", pue: "", wue: "",
  cooling_type: "", cooling_redundancy: "", backup_power_type: "",
  backup_duration_hours: "", battery_storage_mwh: "", onsite_generation_type: "",
  grid_connection_status: "", grid_capacity_secured_mw: "",
  interconnection_timeline_months: "", renewable_energy_share_pct: "",
  renewable_energy_source: "", ppa_secured: false, ppa_term_years: "",
  utility_engagement_started: false,
  annual_water_demand_m3: "", water_source_type: "", water_recycling_included: false,
  water_stress_index: "", land_area_hectares: "", brownfield_or_greenfield: "",
  waste_heat_recovery: false,
  flood_risk_score: "", extreme_heat_risk_score: "", storm_risk_score: "",
  adaptation_measures_present: false, flood_mitigation_details: "",
  thermal_resilience_strategy: "", business_continuity_plan_ready: false,
  target_financing_label: "", taxonomy_alignment_claimed: false,
  net_zero_commitment_present: false, sustainability_disclosures_ready: false,
  third_party_certification_target: "", carbon_reduction_strategy_present: false,
  financing_strategy_defined: false, target_investor_type: "",
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

  const currentAssessment = currentProject ? assessments[currentProject.id] : null;

  function handleLogin(userData) {
    setUser(userData);
    setScreen("app");
    setNavItem("dashboard");

    // Send to Airtable Users table
    sendToAirtable("Users", {
      Name: userData.name,
      Company: userData.company,
      Role: userData.role,
      Email: userData.email,
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
    const result = runAssessment(flatProject, currentProject.region || "UK");
    setAssessments(prev => ({ ...prev, [currentProject.id]: result }));
    setScreen("app");
    setNavItem("results");

    // Send to Airtable Assessments table
    sendToAirtable("Assessments", {
      "Project Name": currentProject.project_name || "Untitled",
      "Capital Readiness Score": result.capitalReadinessScore,
      "Confidence Score": result.confidenceScore,
      "Band": result.band?.label,
      "Region": currentProject.region,
      "Country": currentProject.country,
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
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, #1B6B4A, #2A8C62)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="shield" size={16} color="#fff" />
              </div>
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>Perennity</span>
            </div>
            <Button onClick={() => setScreen("onboarding")}>Get Started</Button>
          </nav>

          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
            <div style={{ maxWidth: 640, textAlign: "center", animation: "fadeIn 0.6s ease-out" }}>
              <div style={{ display: "inline-block", fontSize: 12, fontWeight: 600, color: "#FFFFFF", background: COLORS.accent, padding: "4px 12px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 20 }}>Capital Readiness Platform</div>
              <h1 style={{ fontSize: 48, lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 24 }}>
                Assess your data center's readiness for sustainable capital
              </h1>
              <p style={{ fontSize: 17, color: COLORS.textSecondary, lineHeight: 1.6, marginBottom: 40 }}>
                Evaluate sustainability alignment, infrastructure viability, and funding readiness against EU Taxonomy, SFDR, and UK SDR frameworks. Get investor-grade assessments in minutes, not months.
              </p>
              <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
                <Button size="lg" onClick={() => setScreen("onboarding")}>Create Account</Button>
                <Button variant="secondary" size="lg">View Example Assessment</Button>
              </div>
              <div style={{ display: "flex", gap: 32, justifyContent: "center", marginTop: 48 }}>
                {[
                  { icon: "shield", label: "Tri-framework coverage" },
                  { icon: "zap", label: "Region-specific scoring" },
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
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `linear-gradient(135deg, #1B6B4A, #2A8C62)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="shield" size={18} color="#fff" />
              </div>
              <span style={{ fontSize: 20, fontWeight: 700 }}>Perennity</span>
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
  if (screen === "wizard") {
    const steps = ["Project Basics", "Technical Specs", "Energy Profile", "Water & Resources", "Site & Climate", "Sustainability", "Delivery Readiness", "Review & Submit"];
    const d = projectDraft;

    function renderWizardContent() {
      switch (wizardStep) {
        case 0: return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ gridColumn: "1 / -1" }}><FormField label="Project Name" required><input value={d.project_name} onChange={e => updateDraft("project_name", e.target.value)} placeholder="e.g. Dubai South Data Campus" /></FormField></div>
            <FormField label="Region" required help="Determines the scoring ruleset applied">
              <select value={d.region} onChange={e => updateDraft("region", e.target.value)}>
                <option value="">Select region</option><option value="EU">EU</option><option value="UK">UK</option><option value="US">US</option><option value="MENA">MENA</option>
              </select>
            </FormField>
            <FormField label="Country" required><input value={d.country} onChange={e => updateDraft("country", e.target.value)} placeholder="e.g. United Arab Emirates" /></FormField>
            <FormField label="State / Province"><input value={d.state_or_province} onChange={e => updateDraft("state_or_province", e.target.value)} placeholder="e.g. Dubai" /></FormField>
            <FormField label="City"><input value={d.city} onChange={e => updateDraft("city", e.target.value)} placeholder="e.g. Dubai South" /></FormField>
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
            <FormField label="Planned Capacity (MW)" required help="Total planned power load"><input type="number" step="0.1" value={d.planned_capacity_mw} onChange={e => updateDraft("planned_capacity_mw", e.target.value)} placeholder="e.g. 80" /></FormField>
            <FormField label="IT Load (MW)" help="IT load only, if known"><input type="number" step="0.1" value={d.it_load_mw} onChange={e => updateDraft("it_load_mw", e.target.value)} placeholder="e.g. 60" /></FormField>
            <FormField label="PUE" required help="Power Usage Effectiveness — ratio of total power to IT load. Industry average is ~1.58, best-in-class below 1.2"><input type="number" step="0.01" value={d.pue} onChange={e => updateDraft("pue", e.target.value)} placeholder="e.g. 1.30" /></FormField>
            <FormField label="WUE" help="Water Usage Effectiveness — litres per kWh. Lower is better."><input type="number" step="0.01" value={d.wue} onChange={e => updateDraft("wue", e.target.value)} placeholder="e.g. 0.45" /></FormField>
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
            <FormField label="Grid Capacity Secured (MW)"><input type="number" step="0.1" value={d.grid_capacity_secured_mw} onChange={e => updateDraft("grid_capacity_secured_mw", e.target.value)} placeholder="e.g. 40" /></FormField>
            <FormField label="Interconnection Timeline (months)" help="Estimated time to grid connection"><input type="number" value={d.interconnection_timeline_months} onChange={e => updateDraft("interconnection_timeline_months", e.target.value)} placeholder="e.g. 18" /></FormField>
            <FormField label="Renewable Energy Share (%)" required help="Percentage of power from renewable sources"><input type="number" step="1" value={d.renewable_energy_share_pct} onChange={e => updateDraft("renewable_energy_share_pct", e.target.value)} placeholder="e.g. 65" /></FormField>
            <FormField label="Renewable Energy Source" required>
              <select value={d.renewable_energy_source} onChange={e => updateDraft("renewable_energy_source", e.target.value)}>
                <option value="">Select source</option><option value="ppa">PPA</option><option value="rec">REC</option><option value="onsite">Onsite</option><option value="utility_green_tariff">Utility Green Tariff</option><option value="mixed">Mixed</option>
              </select>
            </FormField>
            <FormField label="PPA Secured?" help="Whether a Power Purchase Agreement is in place">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.ppa_secured} onChange={e => updateDraft("ppa_secured", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.ppa_secured ? "Yes" : "No"}</span>
              </div>
            </FormField>
            <FormField label="PPA Term (years)"><input type="number" value={d.ppa_term_years} onChange={e => updateDraft("ppa_term_years", e.target.value)} placeholder="e.g. 10" /></FormField>
            <FormField label="Utility Engagement Started?">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <input type="checkbox" checked={d.utility_engagement_started} onChange={e => updateDraft("utility_engagement_started", e.target.checked)} />
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>{d.utility_engagement_started ? "Yes" : "No"}</span>
              </div>
            </FormField>
          </div>
        );
        case 3: return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <FormField label="Annual Water Demand (m³)"><input type="number" value={d.annual_water_demand_m3} onChange={e => updateDraft("annual_water_demand_m3", e.target.value)} placeholder="e.g. 50000" /></FormField>
            <FormField label="Water Source Type">
              <select value={d.water_source_type} onChange={e => updateDraft("water_source_type", e.target.value)}>
                <option value="">Select source</option><option value="municipal">Municipal</option><option value="recycled">Recycled</option><option value="groundwater">Groundwater</option><option value="mixed">Mixed</option>
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
            <FormField label="Land Area (hectares)"><input type="number" step="0.1" value={d.land_area_hectares} onChange={e => updateDraft("land_area_hectares", e.target.value)} placeholder="e.g. 12" /></FormField>
            <FormField label="Site Type">
              <select value={d.brownfield_or_greenfield} onChange={e => updateDraft("brownfield_or_greenfield", e.target.value)}>
                <option value="">Select type</option><option value="brownfield">Brownfield</option><option value="greenfield">Greenfield</option>
              </select>
            </FormField>
          </div>
        );
        case 4: return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <FormField label="Flood Risk Score (0-100)" help="Higher = greater risk. Leave blank if unknown."><input type="number" min="0" max="100" value={d.flood_risk_score} onChange={e => updateDraft("flood_risk_score", e.target.value)} placeholder="e.g. 22" /></FormField>
            <FormField label="Extreme Heat Risk Score (0-100)"><input type="number" min="0" max="100" value={d.extreme_heat_risk_score} onChange={e => updateDraft("extreme_heat_risk_score", e.target.value)} placeholder="e.g. 58" /></FormField>
            <FormField label="Storm Risk Score (0-100)"><input type="number" min="0" max="100" value={d.storm_risk_score} onChange={e => updateDraft("storm_risk_score", e.target.value)} placeholder="e.g. 30" /></FormField>
            <FormField label="Water Stress Index (0-1)" help="Regional water stress. 0 = low, 1 = extreme."><input type="number" step="0.01" min="0" max="1" value={d.water_stress_index} onChange={e => updateDraft("water_stress_index", e.target.value)} placeholder="e.g. 0.65" /></FormField>
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
            <div style={{ gridColumn: "1 / -1" }}><FormField label="Flood Mitigation Details"><textarea value={d.flood_mitigation_details} onChange={e => updateDraft("flood_mitigation_details", e.target.value)} placeholder="Describe drainage, barriers, elevation measures..." /></FormField></div>
            <div style={{ gridColumn: "1 / -1" }}><FormField label="Thermal Resilience Strategy"><textarea value={d.thermal_resilience_strategy} onChange={e => updateDraft("thermal_resilience_strategy", e.target.value)} placeholder="Describe cooling adaptations for extreme heat..." /></FormField></div>
          </div>
        );
        case 5: return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <FormField label="Target Financing Label" help="What type of capital are you seeking?">
              <select value={d.target_financing_label} onChange={e => updateDraft("target_financing_label", e.target.value)}>
                <option value="">Select label</option><option value="conventional">Conventional</option><option value="green">Green</option><option value="sustainable">Sustainable</option><option value="article_8_9">Article 8/9 Style</option>
              </select>
            </FormField>
            <FormField label="Third-Party Certification Target">
              <select value={d.third_party_certification_target} onChange={e => updateDraft("third_party_certification_target", e.target.value)}>
                <option value="">Select certification</option><option value="leed">LEED</option><option value="breeam">BREEAM</option><option value="estidama">Estidama</option><option value="none">None</option>
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
            <FormField label="Target Investor Type">
              <select value={d.target_investor_type} onChange={e => updateDraft("target_investor_type", e.target.value)}>
                <option value="">Select type</option><option value="infra_fund">Infrastructure Fund</option><option value="pension">Pension Fund</option><option value="pe">Private Equity</option><option value="sovereign_wealth">Sovereign Wealth Fund</option><option value="dfi">Development Finance Institution</option>
              </select>
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
            { name: "Project Basics", fields: ["project_name", "region", "country", "development_stage"], step: 0 },
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
                      <Button icon="arrow" onClick={() => setWizardStep(wizardStep + 1)}>Continue</Button>
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

          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <Button variant="secondary" icon="download">Download Report</Button>
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
                      <Button size="sm" variant="secondary" icon="download">Capital Readiness Report</Button>
                      <Button size="sm" variant="secondary" icon="download">Investor Summary</Button>
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
        <div style={{ width: 240, borderRight: `1px solid #1a3040`, display: "flex", flexDirection: "column", background: "#0d2030", flexShrink: 0 }}>
          <div style={{ padding: "20px 20px 24px", display: "flex", alignItems: "center", gap: 10 }}>
            {/* TODO: Replace with <img src={perennityLogo} alt="Perennity" style={{ width: 32, height: 32 }} /> once logo is added */}
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, #1B6B4A, #2A8C62)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="shield" size={16} color="#fff" />
            </div>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", color: "#ffffff" }}>Perennity</span>
          </div>
          <nav style={{ flex: 1, padding: "0 12px" }}>
            {navItems.map(item => (
              <div key={item.key} onClick={() => { setNavItem(item.key); setSelectedPillar(null); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
                  cursor: "pointer", marginBottom: 2, fontSize: 14, fontWeight: navItem === item.key ? 500 : 400,
                  color: navItem === item.key ? "#ffffff" : "rgba(255,255,255,0.55)",
                  background: navItem === item.key ? "rgba(78, 205, 164, 0.15)" : "transparent",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { if (navItem !== item.key) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { if (navItem !== item.key) e.currentTarget.style.background = "transparent"; }}
              >
                <Icon name={item.icon} size={16} color={navItem === item.key ? "#4ECDA4" : "rgba(255,255,255,0.55)"} />
                <span>{item.label}</span>
              </div>
            ))}
          </nav>
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
        </div>

        {/* Main content */}
        <div className="main-scroll" style={{ flex: 1, padding: "32px 40px" }}>
          <div style={{ maxWidth: 1100 }}>
            {renderContent()}
          </div>
        </div>
      </div>
      {showTos && <TOSModal onClose={() => setShowTos(false)} onAccept={() => setShowTos(false)} />}
    </>
  );
}
