export function buildJsonPayload(formData, results, assessmentId) {
  return {
    meta: {
      assessmentId,
      version: '2.0',
      generatedAt: new Date().toISOString(),
      toolVersion: 'perennity-cat-v2',
      regulatoryFrameworks: ['SFDR', 'EU_TAXONOMY_8.1', 'UK_SDR', 'CSRD', 'TCFD', 'GHG_PROTOCOL']
    },
    project: {
      name: formData.projectName,
      country: formData.country,
      powerCapacityMW: parseFloat(formData.powerCapacity) || null,
      isNewBuild: formData.isNewBuild !== false
    },
    inputs: { ...formData },
    results: {
      overallScore: results.overall,
      categories: results.categories,
      sfdrClassification: results.sfdr.classification,
      euTaxonomyAligned: results.taxonomy.aligned,
      euTaxonomyDetail: results.taxonomy,
      ukSdrEligibility: results.sdr,
      csrdReadiness: results.csrd,
      gaps: results.gaps,
      recommendations: results.recommendations
    }
  };
}

export function downloadJson(formData, results, assessmentId) {
  const payload = buildJsonPayload(formData, results, assessmentId);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `perennity-assessment-${assessmentId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
