import { MENA_COUNTRIES, COOLING_TECHNOLOGIES, CERTIFICATIONS } from '../constants/regulatoryData.js';

export function generateHtmlReport(formData, results) {
  const date = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Compliance Gap Assessment Report — ${formData.projectName || 'Data Centre Project'}</title>
  <style>
    @page { size: A4; margin: 2cm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1e293b; }
    .header { background: linear-gradient(135deg, #0f766e 0%, #064e3b 100%); color: white; padding: 40px; margin: -2cm -2cm 2cm -2cm; }
    .header h1 { margin: 0 0 10px 0; font-size: 28px; }
    .section { margin-bottom: 30px; page-break-inside: avoid; }
    .section h2 { color: #0f766e; border-bottom: 2px solid #0f766e; padding-bottom: 8px; }
    .score-box { display: inline-block; padding: 20px 40px; background: #f0fdf4; border-radius: 12px; text-align: center; margin: 20px 0; }
    .score-value { font-size: 48px; font-weight: bold; color: #0f766e; }
    .score-label { font-size: 14px; color: #64748b; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .card { background: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #0f766e; }
    .card h3 { margin: 0 0 10px 0; color: #0f766e; }
    .table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    .table th { background: #f1f5f9; font-weight: 600; }
    .priority-high { background: #fef2f2; color: #dc2626; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .priority-medium { background: #fef3c7; color: #d97706; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .priority-low { background: #f0fdf4; color: #059669; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .check { color: #059669; } .cross { color: #dc2626; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
    ul { margin: 10px 0; padding-left: 20px; } li { margin: 5px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Green Finance Compliance Gap Assessment</h1>
    <p>SFDR / UK SDR / EU Taxonomy / CSRD Alignment Report</p>
    <p style="margin-top:15px;font-size:14px;">
      Project: ${formData.projectName || 'Data Centre Project'}<br>
      Location: ${MENA_COUNTRIES.find(c => c.code === formData.country)?.name || formData.country}<br>
      Generated: ${date}
    </p>
  </div>

  <div class="section">
    <h2>Executive Summary</h2>
    <div class="score-box">
      <div class="score-value">${results.overall}%</div>
      <div class="score-label">Overall Compliance Readiness</div>
    </div>
    <div class="grid">
      <div class="card">
        <h3>SFDR Classification</h3>
        <p><strong>${results.sfdr.classification}</strong> — ${results.sfdr.label}</p>
        <p style="font-size:14px;color:#64748b;">${results.sfdr.description}</p>
      </div>
      <div class="card">
        <h3>EU Taxonomy Alignment</h3>
        <p><strong>${results.taxonomy.aligned ? '✓ Aligned' : '✗ Not Aligned'}</strong></p>
        <p style="font-size:14px;color:#64748b;">
          ${results.taxonomy.aligned
            ? 'Meets substantial contribution criteria and all DNSH requirements'
            : 'Gaps identified in technical screening criteria'}
        </p>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Category Breakdown</h2>
    <table class="table">
      <tr><th>Category</th><th>Score</th><th>Status</th><th>Key Gap</th></tr>
      ${[
        ['Energy Efficiency', results.categories.energy],
        ['Water Management', results.categories.water],
        ['Circular Economy', results.categories.circularEconomy],
        ['Climate Risk', results.categories.climateRisk]
      ].map(([label, cat]) => `
      <tr>
        <td><strong>${label}</strong></td>
        <td>${cat.score}%</td>
        <td style="color:${cat.score >= 70 ? '#059669' : cat.score >= 50 ? '#d97706' : '#dc2626'}">
          ${cat.score >= 70 ? 'Compliant' : cat.score >= 50 ? 'Partial' : 'Non-Compliant'}
        </td>
        <td>${cat.gaps[0]?.gap || 'No critical gaps'}</td>
      </tr>`).join('')}
    </table>
  </div>

  <div class="section">
    <h2>EU Taxonomy Technical Screening (Activity 8.1)</h2>
    <h3>Substantial Contribution — Climate Change Mitigation</h3>
    <table class="table">
      <tr><th>Criterion</th><th>Status</th></tr>
      ${results.taxonomy.substantialContribution.criteria.map(c => `
      <tr><td>${c.name}</td><td>${c.met ? '<span class="check">✓ Met</span>' : '<span class="cross">✗ Not Met</span>'}</td></tr>`).join('')}
    </table>
    <h3>Do No Significant Harm (DNSH)</h3>
    <table class="table">
      <tr><th>Environmental Objective</th><th>Status</th></tr>
      ${Object.values(results.taxonomy.dnsh).map(d => `
      <tr><td>${d.label}</td><td>${d.met ? '<span class="check">✓ Compliant</span>' : '<span class="cross">✗ Gap Identified</span>'}</td></tr>`).join('')}
    </table>
  </div>

  <div class="section">
    <h2>UK SDR Fund Label Eligibility</h2>
    <table class="table">
      <tr><th>Label Category</th><th>Eligibility</th><th>Notes</th></tr>
      ${results.sdr.map(s => `
      <tr>
        <td><strong>${s.label}</strong></td>
        <td>${s.eligible ? '<span class="check">✓ Eligible</span>' : '<span class="cross">✗ Not Eligible</span>'}</td>
        <td>${s.eligible ? s.description : s.gap}</td>
      </tr>`).join('')}
    </table>
  </div>

  ${results.csrd ? `
  <div class="section">
    <h2>CSRD Readiness</h2>
    <p><strong>Overall CSRD Readiness: ${results.csrd.overallScore}% — ${results.csrd.label}</strong></p>
    <table class="table">
      <tr><th>ESRS Standard</th><th>Score</th><th>Key Gaps</th></tr>
      ${[results.csrd.esrsE1, results.csrd.esrsE3, results.csrd.esrsE5].map(e => `
      <tr>
        <td>${e.standard}</td>
        <td>${e.score}%</td>
        <td>${e.gaps.slice(0,2).join('; ') || 'None identified'}</td>
      </tr>`).join('')}
    </table>
  </div>` : ''}

  <div class="section" style="page-break-before:always;">
    <h2>Remediation Roadmap</h2>
    ${results.recommendations.map(r => `
    <div class="card" style="margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;">${r.action}</h3>
        <span class="priority-${r.priority.toLowerCase()}">${r.priority} Priority</span>
      </div>
      <p style="margin:10px 0;color:#0f766e;font-weight:500;">${r.impact}</p>
      <p style="margin:5px 0;font-size:14px;"><strong>Timeline:</strong> ${r.timeline}</p>
      <ul>${r.details.map(d => `<li>${d}</li>`).join('')}</ul>
    </div>`).join('')}
  </div>

  <div class="section">
    <h2>Project Specifications</h2>
    <table class="table">
      <tr><th>Parameter</th><th>Value</th></tr>
      <tr><td>Power Capacity</td><td>${formData.powerCapacity || 'N/A'} MW</td></tr>
      <tr><td>PUE Target</td><td>${formData.pueTarget || 'N/A'}</td></tr>
      <tr><td>Renewable Energy</td><td>${formData.renewablePercent || '0'}%</td></tr>
      <tr><td>Cooling Technology</td><td>${COOLING_TECHNOLOGIES.find(c => c.id === formData.coolingType)?.name || 'N/A'}</td></tr>
      <tr><td>WUE Metric</td><td>${formData.wueMetric || 'N/A'} L/kWh</td></tr>
      <tr><td>Certifications</td><td>${(formData.certifications || []).map(c => CERTIFICATIONS.find(cert => cert.id === c)?.name).filter(Boolean).join(', ') || 'None'}</td></tr>
    </table>
  </div>

  <div class="footer">
    <p><strong>Disclaimer:</strong> This assessment is for informational purposes only and does not constitute legal, financial, or regulatory advice. Actual compliance determinations should be made in consultation with qualified sustainability consultants and legal advisors.</p>
    <p>Generated by Perennity Compliance Assessment Tool | ${date} | Powered by Perennity Ltd</p>
  </div>
</body>
</html>`;
}

export function downloadHtmlReport(formData, results) {
  const assessmentId = crypto.randomUUID().slice(0, 8);
  const content = generateHtmlReport(formData, results);
  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `perennity-assessment-${formData.projectName || 'report'}-${assessmentId}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
