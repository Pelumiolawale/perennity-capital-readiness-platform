import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ChevronRight, ChevronLeft, CheckCircle, AlertTriangle, XCircle,
  Building2, Zap, Droplets, Recycle, ThermometerSun, Award, FileText, TrendingUp,
  History, Share2, Save, X
} from 'lucide-react';

import { calculateComplianceScore } from '../engine/scoring.js';
import { MENA_COUNTRIES, COOLING_TECHNOLOGIES, CERTIFICATIONS } from '../constants/regulatoryData.js';
import { useFormValidation } from '../hooks/useFormValidation.js';
import { useAutoDraft, loadDraft, clearDraft, saveAssessment } from '../hooks/useAssessmentStore.js';
import { encodeFormDataToUrl, decodeFormDataFromUrl, clearAssessmentParam } from '../hooks/useShareableUrl.js';
import { FormStep, InputField, ProgressBar } from './shared/UIComponents.jsx';
import DownloadMenu from './download/DownloadMenu.jsx';
import AiNarrativePanel from './results/AiNarrativePanel.jsx';
import RegulatoryQA from './results/RegulatoryQA.jsx';
import CsrdPanel from './results/CsrdPanel.jsx';
import RegulatoryCalendar from './shared/RegulatoryCalendar.jsx';
import AssessmentHistory from './history/AssessmentHistory.jsx';

const INITIAL_FORM = {
  // Step 0
  projectName: '', country: '', powerCapacity: '', coolingType: '', isNewBuild: true,
  // Step 1
  pueTarget: '', renewablePercent: '', gridPercent: '', onsiteGeneration: '',
  renewableType: [], ppaSigned: false, gridCarbonIntensity: '',
  // Step 2
  wueMetric: '', waterRecycling: false, alternativeWaterSource: false, recycledWaterLevel: 'none',
  // Step 3
  ewasteProgram: '', serverLifecycle: '', equipmentReuse: false, sustainableProcurement: false,
  wasteGenerated: '', wasteRecoveryRate: '',
  // Step 4
  climateRiskAssessment: false, heatResilience: false, transitionPlan: false,
  tcfdGovernance: false, tcfdStrategy: false, tcfdRiskManagement: false, tcfdMetrics: false,
  pollutionPrevention: 'none', biodiversityAssessment: false, certifications: [],
  // CSRD (optional)
  scope1Emissions: '', scope2EmissionsMarket: '', scope2EmissionsLocation: '',
  totalEnergyMwh: '', waterWithdrawal: ''
};

const STEPS = [
  { title: 'Project Basics', icon: Building2 },
  { title: 'Energy Profile', icon: Zap },
  { title: 'Water Management', icon: Droplets },
  { title: 'Circular Economy', icon: Recycle },
  { title: 'Climate & Governance', icon: ThermometerSun }
];

const inputClass = 'w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all';
const selectClass = `${inputClass} bg-white`;
const checkboxClass = 'w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500';

export default function ComplianceAssessmentTool() {
  const [currentStep, setCurrentStep] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [draftBanner, setDraftBanner] = useState(null); // { savedAt }
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [savingToHistory, setSavingToHistory] = useState(false);
  const { errors, validateStep, clearFieldError } = useFormValidation();
  const assessmentId = useMemo(() => crypto.randomUUID().slice(0, 8), []);

  // Auto-save draft on every form change
  useAutoDraft(formData);

  // On mount: check URL for shared assessment, then check for draft
  useEffect(() => {
    decodeFormDataFromUrl().then(shared => {
      if (shared) {
        setFormData(prev => ({ ...prev, ...shared }));
        clearAssessmentParam();
        return;
      }
      const draft = loadDraft();
      if (draft) setDraftBanner({ savedAt: draft.savedAt, formData: draft.formData });
    });
  }, []);

  const updateField = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    clearFieldError(field);
  }, [clearFieldError]);

  const toggleCertification = useCallback((certId) => {
    setFormData(prev => ({
      ...prev,
      certifications: prev.certifications.includes(certId)
        ? prev.certifications.filter(c => c !== certId)
        : [...prev.certifications, certId]
    }));
  }, []);

  const toggleRenewableType = useCallback((type) => {
    setFormData(prev => ({
      ...prev,
      renewableType: prev.renewableType.includes(type)
        ? prev.renewableType.filter(t => t !== type)
        : [...prev.renewableType, type]
    }));
  }, []);

  const results = useMemo(() => {
    if (!showResults) return null;
    return calculateComplianceScore(formData);
  }, [showResults, formData]);

  function handleNext() {
    if (validateStep(currentStep, formData)) {
      setCurrentStep(prev => Math.min(STEPS.length - 1, prev + 1));
    }
  }

  function handleSubmit() {
    if (validateStep(currentStep, formData)) {
      setShowResults(true);
    }
  }

  function handleReset() {
    setShowResults(false);
    setCurrentStep(0);
    setFormData(INITIAL_FORM);
    clearDraft();
  }

  async function handleSaveToHistory() {
    if (!results) return;
    setSavingToHistory(true);
    try {
      await saveAssessment(assessmentId, formData, results);
    } finally {
      setSavingToHistory(false);
    }
  }

  async function handleCopyShareLink() {
    const url = await encodeFormDataToUrl(formData);
    await navigator.clipboard.writeText(url);
    setShareToast(true);
    setTimeout(() => setShareToast(false), 2500);
  }

  function handleLoadFromHistory(record) {
    setFormData(record.formData);
    setShowResults(!!record.results);
    setCurrentStep(0);
    setHistoryOpen(false);
  }

  function handleRestoreDraft() {
    if (draftBanner?.formData) setFormData(draftBanner.formData);
    setDraftBanner(null);
  }

  // ─── RESULTS VIEW ──────────────────────────────────────────────────────────
  if (showResults && results) {
    return (
      <>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-emerald-50/20">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-700 text-white">
          <div className="max-w-6xl mx-auto px-6 py-12">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-teal-200 text-sm font-medium mb-1">Assessment Complete</p>
                <h1 className="text-3xl font-bold">{formData.projectName || 'Data Centre Project'}</h1>
                <p className="text-teal-100 mt-1">
                  {MENA_COUNTRIES.find(c => c.code === formData.country)?.name || 'MENA Region'} • {formData.powerCapacity} MW
                </p>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <button
                  onClick={handleReset}
                  className="px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg font-medium transition-colors text-sm"
                >
                  New Assessment
                </button>
                <button
                  onClick={handleSaveToHistory}
                  disabled={savingToHistory}
                  className="px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg font-medium flex items-center gap-2 transition-colors text-sm disabled:opacity-60"
                  title="Save to browser history"
                >
                  <Save className="w-4 h-4" />
                  {savingToHistory ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={handleCopyShareLink}
                  className="px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg font-medium flex items-center gap-2 transition-colors text-sm"
                  title="Copy shareable link (includes all form inputs)"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </button>
                <DownloadMenu formData={formData} results={results} assessmentId={assessmentId} />
              </div>
            </div>
          </div>
        </div>

        {/* Score Overview */}
        <div className="max-w-6xl mx-auto px-6 -mt-8">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
            <div className="grid md:grid-cols-3 gap-8">
              {/* Score circle */}
              <div className="flex flex-col items-center justify-center">
                <div className="relative w-40 h-40">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="80" cy="80" r="70" fill="none" stroke="#e2e8f0" strokeWidth="12" />
                    <circle
                      cx="80" cy="80" r="70" fill="none"
                      stroke={results.overall >= 70 ? '#0d9488' : results.overall >= 50 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="12" strokeLinecap="round"
                      strokeDasharray={`${results.overall * 4.4} 440`}
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-slate-800">{results.overall}%</span>
                    <span className="text-sm text-slate-500">Overall Score</span>
                  </div>
                </div>
              </div>

              {/* SFDR */}
              <div className={`rounded-xl p-6 ${
                results.sfdr.classification === 'Article 9' ? 'bg-emerald-50 border-2 border-emerald-200' :
                results.sfdr.classification === 'Article 8' ? 'bg-blue-50 border-2 border-blue-200' :
                'bg-slate-50 border-2 border-slate-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className={`w-5 h-5 ${results.sfdr.classification === 'Article 9' ? 'text-emerald-600' : results.sfdr.classification === 'Article 8' ? 'text-blue-600' : 'text-slate-600'}`} />
                  <span className="text-sm font-medium text-slate-600">SFDR Classification</span>
                </div>
                <p className={`text-2xl font-bold ${results.sfdr.classification === 'Article 9' ? 'text-emerald-700' : results.sfdr.classification === 'Article 8' ? 'text-blue-700' : 'text-slate-700'}`}>
                  {results.sfdr.classification}
                </p>
                <p className="text-sm text-slate-600 mt-1">{results.sfdr.label}</p>
              </div>

              {/* EU Taxonomy */}
              <div className={`rounded-xl p-6 ${results.taxonomy.aligned ? 'bg-emerald-50 border-2 border-emerald-200' : 'bg-amber-50 border-2 border-amber-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Award className={`w-5 h-5 ${results.taxonomy.aligned ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <span className="text-sm font-medium text-slate-600">EU Taxonomy</span>
                </div>
                <p className={`text-2xl font-bold ${results.taxonomy.aligned ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {results.taxonomy.aligned ? 'Aligned' : 'Not Aligned'}
                </p>
                <p className="text-sm text-slate-600 mt-1">{results.taxonomy.aligned ? 'Meets all criteria' : 'Gaps identified'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="max-w-6xl mx-auto px-6 py-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Category Performance</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { key: 'energy', label: 'Energy Efficiency', icon: Zap },
              { key: 'water', label: 'Water Management', icon: Droplets },
              { key: 'circularEconomy', label: 'Circular Economy', icon: Recycle },
              { key: 'climateRisk', label: 'Climate Risk', icon: ThermometerSun }
            ].map(({ key, label, icon: Icon }) => (
              <div key={key} className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    results.categories[key].score >= 70 ? 'bg-teal-100 text-teal-600' :
                    results.categories[key].score >= 50 ? 'bg-amber-100 text-amber-600' :
                    'bg-red-100 text-red-600'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{label}</p>
                    <p className="text-xl font-bold text-slate-800">{results.categories[key].score}%</p>
                  </div>
                </div>
                <ProgressBar value={results.categories[key].score} />
                {results.categories[key].gaps.length > 0 && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {results.categories[key].gaps.length} gap{results.categories[key].gaps.length > 1 ? 's' : ''} identified
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* AI Narrative */}
        <div className="max-w-6xl mx-auto px-6 pb-6">
          <AiNarrativePanel formData={formData} results={results} />
        </div>

        {/* UK SDR */}
        <div className="max-w-6xl mx-auto px-6 pb-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">UK SDR Fund Label Eligibility</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {results.sdr.map((label, idx) => (
              <div key={idx} className={`bg-white rounded-xl p-5 shadow-sm border-2 ${label.eligible ? 'border-emerald-200' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-800">{label.label}</span>
                  {label.eligible ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-slate-400" />}
                </div>
                <p className="text-sm text-slate-600">{label.eligible ? label.description : label.gap}</p>
              </div>
            ))}
          </div>
        </div>

        {/* EU Taxonomy DNSH detail */}
        <div className="max-w-6xl mx-auto px-6 pb-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">EU Taxonomy DNSH Assessment</h2>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
              {/* Substantial contribution */}
              <div className="p-5">
                <p className="text-sm font-semibold text-slate-700 mb-3">Substantial Contribution</p>
                <div className="space-y-2">
                  {results.taxonomy.substantialContribution.criteria.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {c.met ? <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                      <span className={c.met ? 'text-slate-700' : 'text-slate-500'}>{c.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* DNSH */}
              <div className="p-5">
                <p className="text-sm font-semibold text-slate-700 mb-3">Do No Significant Harm</p>
                <div className="space-y-2">
                  {Object.values(results.taxonomy.dnsh).map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {d.met ? <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                      <span className={d.met ? 'text-slate-700' : 'text-slate-500'}>{d.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CSRD Readiness */}
        <div className="max-w-6xl mx-auto px-6 pb-6">
          <CsrdPanel csrd={results.csrd} />
        </div>

        {/* Recommendations */}
        <div className="max-w-6xl mx-auto px-6 pb-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Remediation Roadmap</h2>
          <div className="space-y-4">
            {results.recommendations.map((rec, idx) => (
              <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          rec.priority === 'High' ? 'bg-red-100 text-red-700' :
                          rec.priority === 'Medium' ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>{rec.priority} Priority</span>
                        <span className="text-xs text-slate-500">{rec.category}</span>
                      </div>
                      <h3 className="font-semibold text-slate-800">{rec.action}</h3>
                      <p className="text-sm text-teal-600 mt-1">{rec.impact}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm text-slate-500">Timeline</span>
                      <p className="font-medium text-slate-800">{rec.timeline}</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-sm font-medium text-slate-600 mb-2">Implementation Steps:</p>
                    <ul className="grid md:grid-cols-2 gap-2">
                      {rec.details.map((detail, i) => (
                        <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                          <span className="text-teal-500 mt-1">•</span>
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Regulatory Q&A */}
        <div className="max-w-6xl mx-auto px-6 pb-8">
          <RegulatoryQA formData={formData} results={results} />
        </div>

        {/* Regulatory Calendar */}
        <div className="max-w-6xl mx-auto px-6 pb-12">
          <RegulatoryCalendar sfdrClassification={results.sfdr.classification} />
        </div>
      </div>

      {/* Share toast */}
      {shareToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-sm px-5 py-3 rounded-xl shadow-xl z-50 flex items-center gap-2">
          <Share2 className="w-4 h-4 text-teal-400" />
          Share link copied to clipboard
        </div>
      )}

      {/* Assessment history slide-over */}
      <AssessmentHistory open={historyOpen} onClose={() => setHistoryOpen(false)} onLoad={handleLoadFromHistory} />
      </>
    );
  }

  // ─── FORM VIEW ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-emerald-50/20">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-700 text-white py-8">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <span className="text-teal-200 text-sm font-medium">Perennity</span>
            </div>
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
            >
              <History className="w-4 h-4" />
              History
            </button>
          </div>
          <h1 className="text-3xl font-bold mb-2">Green Finance Compliance Assessment</h1>
          <p className="text-teal-100">Assess your data centre against SFDR, UK SDR, EU Taxonomy, and CSRD</p>
        </div>
      </div>

      {/* Draft restore banner */}
      {draftBanner && (
        <div className="max-w-4xl mx-auto px-6 pt-4">
          <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-sm text-amber-800">
              You have an unsaved assessment from {new Date(draftBanner.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Resume?
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleRestoreDraft}
                className="text-sm font-medium text-amber-800 hover:text-amber-900 underline"
              >
                Restore
              </button>
              <button onClick={() => { setDraftBanner(null); clearDraft(); }} className="p-1 hover:bg-amber-100 rounded">
                <X className="w-4 h-4 text-amber-600" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assessment history slide-over */}
      <AssessmentHistory open={historyOpen} onClose={() => setHistoryOpen(false)} onLoad={handleLoadFromHistory} />

      {/* Step progress */}
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((step, idx) => (
            <div key={idx} className="flex items-center">
              <button
                onClick={() => idx < currentStep && setCurrentStep(idx)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  idx === currentStep ? 'bg-teal-600 text-white shadow-lg' :
                  idx < currentStep ? 'bg-teal-500 text-white cursor-pointer' :
                  'bg-slate-200 text-slate-500'
                }`}
              >
                {idx < currentStep ? <CheckCircle className="w-5 h-5" /> : <step.icon className="w-5 h-5" />}
              </button>
              {idx < STEPS.length - 1 && (
                <div className={`w-16 h-1 mx-2 rounded ${idx < currentStep ? 'bg-teal-500' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-slate-500 px-2">
          {STEPS.map((step, idx) => (
            <span key={idx} className={idx === currentStep ? 'text-teal-600 font-medium' : ''}>{step.title}</span>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="max-w-4xl mx-auto px-6 pb-12">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">

          {/* ── Step 0: Project Basics ── */}
          {currentStep === 0 && (
            <FormStep title="Project Basics" subtitle="Tell us about your data centre project" icon={Building2}>
              <div className="grid md:grid-cols-2 gap-6">
                <InputField label="Project Name" helper="Internal reference name for this assessment" error={errors.projectName}>
                  <input type="text" value={formData.projectName} onChange={e => updateField('projectName', e.target.value)}
                    placeholder="e.g., Dubai DC Phase 2" className={inputClass} />
                </InputField>
                <InputField label="Location" helper="Country where the facility will be located" error={errors.country}>
                  <select value={formData.country} onChange={e => updateField('country', e.target.value)} className={selectClass}>
                    <option value="">Select country…</option>
                    {MENA_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </InputField>
                <InputField label="Power Capacity (MW)" helper="Total IT load capacity" error={errors.powerCapacity}>
                  <input type="number" value={formData.powerCapacity} onChange={e => updateField('powerCapacity', e.target.value)}
                    placeholder="e.g., 50" className={inputClass} />
                </InputField>
                <InputField label="Cooling Technology" helper="Primary cooling system type" error={errors.coolingType}>
                  <select value={formData.coolingType} onChange={e => updateField('coolingType', e.target.value)} className={selectClass}>
                    <option value="">Select technology…</option>
                    {COOLING_TECHNOLOGIES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </InputField>
              </div>
              <div className="mt-4">
                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                  <input type="checkbox" checked={formData.isNewBuild} onChange={e => updateField('isNewBuild', e.target.checked)} className={checkboxClass} />
                  <div>
                    <p className="font-medium text-slate-700">New Build</p>
                    <p className="text-xs text-slate-500">Uncheck for existing facility — different EU Taxonomy PUE thresholds apply (1.8 vs 1.5)</p>
                  </div>
                </label>
              </div>
            </FormStep>
          )}

          {/* ── Step 1: Energy ── */}
          {currentStep === 1 && (
            <FormStep title="Energy Profile" subtitle="Energy efficiency and renewable sourcing" icon={Zap}>
              <div className="grid md:grid-cols-2 gap-6">
                <InputField label="Target PUE" metricKey="pue" helper={`EU Taxonomy requires ≤${formData.isNewBuild ? '1.5' : '1.8'} for ${formData.isNewBuild ? 'new' : 'existing'} builds`} error={errors.pueTarget}>
                  <input type="number" step="0.01" value={formData.pueTarget} onChange={e => updateField('pueTarget', e.target.value)}
                    placeholder="e.g., 1.4" className={inputClass} />
                </InputField>
                <InputField label="Renewable Energy %" metricKey="renewablePercent" helper="Total from all renewable sources" error={errors.renewablePercent}>
                  <input type="number" value={formData.renewablePercent} onChange={e => updateField('renewablePercent', e.target.value)}
                    placeholder="e.g., 80" className={inputClass} />
                </InputField>
                <InputField label="Grid Electricity %" helper="% drawn from public grid">
                  <input type="number" value={formData.gridPercent} onChange={e => updateField('gridPercent', e.target.value)}
                    placeholder="e.g., 70" className={inputClass} />
                </InputField>
                <InputField label="On-site Generation %" helper="% from on-site renewables (solar, wind)">
                  <input type="number" value={formData.onsiteGeneration} onChange={e => updateField('onsiteGeneration', e.target.value)}
                    placeholder="e.g., 30" className={inputClass} />
                </InputField>
                <InputField label="Grid Carbon Intensity (gCO2e/kWh)" helper="Grid emission factor for Scope 2 location-based calculation">
                  <input type="number" value={formData.gridCarbonIntensity} onChange={e => updateField('gridCarbonIntensity', e.target.value)}
                    placeholder="e.g., 450" className={inputClass} />
                </InputField>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-slate-700">Renewable Energy Type (select all that apply)</p>
                <p className="text-xs text-slate-500">Type matters for SFDR Article 9 additionality — EAC/GO alone may not satisfy requirements</p>
                <div className="grid md:grid-cols-2 gap-2">
                  {[
                    { id: 'onsite', label: 'On-site generation (solar/wind)' },
                    { id: 'ppa_direct', label: 'Direct-wire / sleeved PPA' },
                    { id: 'ppa_virtual', label: 'Virtual PPA' },
                    { id: 'eac', label: 'EAC / GO purchase only' }
                  ].map(opt => (
                    <label key={opt.id} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors border ${
                      formData.renewableType.includes(opt.id) ? 'bg-teal-50 border-teal-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}>
                      <input type="checkbox" checked={formData.renewableType.includes(opt.id)} onChange={() => toggleRenewableType(opt.id)} className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                      <span className="text-sm text-slate-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="mt-4 p-4 bg-teal-50 rounded-lg border border-teal-100">
                <p className="text-sm text-teal-800">
                  <strong>Tip:</strong> For SFDR Article 9, aim for ≥75% renewable energy via direct-wire PPAs or on-site generation. EAC/GO-only purchases may not satisfy additionality requirements.
                </p>
              </div>
            </FormStep>
          )}

          {/* ── Step 2: Water ── */}
          {currentStep === 2 && (
            <FormStep title="Water Management" subtitle="Water usage and efficiency metrics" icon={Droplets}>
              <div className="grid md:grid-cols-2 gap-6">
                <InputField label="WUE (L/kWh)" metricKey="wue" helper="Water Usage Effectiveness — calculated against CNDCP target for your climate zone" error={errors.wueMetric}>
                  <input type="number" step="0.1" value={formData.wueMetric} onChange={e => updateField('wueMetric', e.target.value)}
                    placeholder="e.g., 0.5" className={inputClass} />
                </InputField>
                <InputField label="Recycled Water Level" helper="Proportion of cooling water from recycled sources">
                  <select value={formData.recycledWaterLevel} onChange={e => updateField('recycledWaterLevel', e.target.value)} className={selectClass}>
                    <option value="none">None / minimal</option>
                    <option value="partial">Partial (&gt;20% recycled)</option>
                    <option value="majority">Majority (&gt;60% recycled)</option>
                  </select>
                </InputField>
                <InputField label="Annual Water Withdrawal (m³)" helper="For CSRD ESRS E3 disclosure (optional)">
                  <input type="number" value={formData.waterWithdrawal} onChange={e => updateField('waterWithdrawal', e.target.value)}
                    placeholder="e.g., 12000" className={inputClass} />
                </InputField>
              </div>
              <div className="mt-6 space-y-3">
                {[
                  { key: 'waterRecycling', label: 'Water Recycling Program', desc: 'Active greywater or condensate recycling' },
                  { key: 'alternativeWaterSource', label: 'Alternative Water Source', desc: 'Non-potable water (treated wastewater, seawater, etc.)' }
                ].map(item => (
                  <label key={item.key} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                    <input type="checkbox" checked={formData[item.key]} onChange={e => updateField(item.key, e.target.checked)} className={checkboxClass} />
                    <div>
                      <p className="font-medium text-slate-700">{item.label}</p>
                      <p className="text-xs text-slate-500">{item.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              {formData.country && MENA_COUNTRIES.find(c => c.code === formData.country)?.waterStress === 'high' && (
                <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-sm text-amber-800">
                    <strong>⚠ Water-Stressed Region:</strong> {MENA_COUNTRIES.find(c => c.code === formData.country)?.name} applies a climate zone multiplier to the CNDCP WUE target. Water recycling and alternative sources are strongly recommended.
                  </p>
                </div>
              )}
            </FormStep>
          )}

          {/* ── Step 3: Circular Economy ── */}
          {currentStep === 3 && (
            <FormStep title="Circular Economy" subtitle="Waste management and resource efficiency" icon={Recycle}>
              <div className="grid md:grid-cols-2 gap-6">
                <InputField label="E-Waste Management Programme">
                  <select value={formData.ewasteProgram} onChange={e => updateField('ewasteProgram', e.target.value)} className={selectClass}>
                    <option value="">Select level…</option>
                    <option value="none">No formal programme</option>
                    <option value="basic">Basic recycling</option>
                    <option value="certified">Certified recycling partners (R2/e-Stewards)</option>
                    <option value="comprehensive">Comprehensive lifecycle management</option>
                  </select>
                </InputField>
                <InputField label="Server Refresh Cycle (years)" helper="Target server lifetime before replacement" error={errors.serverLifecycle}>
                  <input type="number" value={formData.serverLifecycle} onChange={e => updateField('serverLifecycle', e.target.value)}
                    placeholder="e.g., 5" className={inputClass} />
                </InputField>
                <InputField label="Total Waste Generated (tonnes/year)" helper="For CSRD ESRS E5 disclosure (optional)">
                  <input type="number" value={formData.wasteGenerated} onChange={e => updateField('wasteGenerated', e.target.value)}
                    placeholder="e.g., 45" className={inputClass} />
                </InputField>
                <InputField label="Waste Recovery Rate (%)" helper="% of waste recovered via recycling or reuse (optional)">
                  <input type="number" value={formData.wasteRecoveryRate} onChange={e => updateField('wasteRecoveryRate', e.target.value)}
                    placeholder="e.g., 75" className={inputClass} />
                </InputField>
              </div>
              <div className="mt-6 space-y-3">
                {[
                  { key: 'equipmentReuse', label: 'Equipment Reuse Programme', desc: 'Refurbishment and resale of decommissioned equipment' },
                  { key: 'sustainableProcurement', label: 'Sustainable Procurement Policy', desc: 'ESG criteria in supplier selection and contracts' }
                ].map(item => (
                  <label key={item.key} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                    <input type="checkbox" checked={formData[item.key]} onChange={e => updateField(item.key, e.target.checked)} className={checkboxClass} />
                    <div>
                      <p className="font-medium text-slate-700">{item.label}</p>
                      <p className="text-xs text-slate-500">{item.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </FormStep>
          )}

          {/* ── Step 4: Climate & Governance ── */}
          {currentStep === 4 && (
            <FormStep title="Climate & Governance" subtitle="TCFD alignment, DNSH, and certifications" icon={ThermometerSun}>
              <div className="space-y-6">
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-3">TCFD Pillars (tick all that are formally documented and disclosed)</p>
                  <div className="space-y-2">
                    {[
                      { key: 'tcfdGovernance', label: 'Governance — Board oversight of climate risks' },
                      { key: 'tcfdStrategy', label: 'Strategy — Climate scenarios used in strategic planning' },
                      { key: 'tcfdRiskManagement', label: 'Risk Management — Climate risks in ERM process' },
                      { key: 'tcfdMetrics', label: 'Metrics & Targets — GHG emissions disclosed with targets' },
                      { key: 'climateRiskAssessment', label: 'Physical & Transition Risk Assessment completed' }
                    ].map(item => (
                      <label key={item.key} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors border border-slate-200">
                        <input type="checkbox" checked={formData[item.key]} onChange={e => updateField(item.key, e.target.checked)} className={checkboxClass} />
                        <span className="text-sm text-slate-700">{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-700 mb-3">Transition & Resilience</p>
                  <div className="space-y-2">
                    {[
                      { key: 'heatResilience', label: 'Heat Resilience Planning', desc: 'Design for extreme temperature scenarios' },
                      { key: 'transitionPlan', label: 'Net-Zero Transition Plan', desc: 'Documented decarbonisation pathway with milestones' }
                    ].map(item => (
                      <label key={item.key} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors border border-slate-200">
                        <input type="checkbox" checked={formData[item.key]} onChange={e => updateField(item.key, e.target.checked)} className={checkboxClass} />
                        <div>
                          <p className="font-medium text-slate-700">{item.label}</p>
                          <p className="text-xs text-slate-500">{item.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <InputField label="Pollution Prevention Programme" helper="Required for EU Taxonomy DNSH">
                    <select value={formData.pollutionPrevention} onChange={e => updateField('pollutionPrevention', e.target.value)} className={selectClass}>
                      <option value="none">None</option>
                      <option value="basic">Basic monitoring</option>
                      <option value="certified">Certified / formally reported</option>
                    </select>
                  </InputField>
                </div>

                <div>
                  <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors border border-slate-200">
                    <input type="checkbox" checked={formData.biodiversityAssessment} onChange={e => updateField('biodiversityAssessment', e.target.checked)} className={checkboxClass} />
                    <div>
                      <p className="font-medium text-slate-700">Biodiversity Impact Assessment</p>
                      <p className="text-xs text-slate-500">Required for EU Taxonomy DNSH on Biodiversity & Ecosystems</p>
                    </div>
                  </label>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-700 mb-3">Certifications</p>
                  <div className="grid md:grid-cols-2 gap-2">
                    {CERTIFICATIONS.map(cert => (
                      <label key={cert.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border ${
                        formData.certifications.includes(cert.id) ? 'bg-teal-50 border-teal-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}>
                        <input type="checkbox" checked={formData.certifications.includes(cert.id)} onChange={() => toggleCertification(cert.id)}
                          className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                        <span className="text-sm text-slate-700">{cert.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* CSRD optional section */}
                <details className="border border-slate-200 rounded-lg">
                  <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg">
                    CSRD Data Disclosures (optional — for ESRS E1 readiness scoring)
                  </summary>
                  <div className="p-4 grid md:grid-cols-2 gap-4 border-t border-slate-100">
                    {[
                      { key: 'scope1Emissions', label: 'Scope 1 Emissions (tCO2e/year)', placeholder: 'e.g., 850' },
                      { key: 'scope2EmissionsMarket', label: 'Scope 2 Market-Based (tCO2e/year)', placeholder: 'e.g., 0' },
                      { key: 'scope2EmissionsLocation', label: 'Scope 2 Location-Based (tCO2e/year)', placeholder: 'e.g., 12000' },
                      { key: 'totalEnergyMwh', label: 'Total Energy Consumption (MWh/year)', placeholder: 'e.g., 25000' }
                    ].map(field => (
                      <InputField key={field.key} label={field.label}>
                        <input type="number" value={formData[field.key]} onChange={e => updateField(field.key, e.target.value)}
                          placeholder={field.placeholder} className={inputClass} />
                      </InputField>
                    ))}
                  </div>
                </details>
              </div>
            </FormStep>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t border-slate-200">
            <button
              onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
              disabled={currentStep === 0}
              className="flex items-center gap-2 px-5 py-2.5 text-slate-600 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
              Previous
            </button>
            {currentStep === STEPS.length - 1 ? (
              <button
                onClick={handleSubmit}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-lg font-medium hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-500/25"
              >
                Generate Assessment
                <CheckCircle className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors"
              >
                Next
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
