// ============================================
// INDUSTRY BENCHMARK DATA
// Sources: Uptime Institute Global DC Survey 2024,
//          IEA Data Centres & Networks report 2024,
//          EU JRC Data Centre Study 2023
// ============================================

export const INDUSTRY_BENCHMARKS = {
  pue: {
    global: { p10: 1.2, p25: 1.3, p50: 1.46, p75: 1.6, p90: 1.8 },
    mena:   { p10: 1.3, p25: 1.4, p50: 1.56, p75: 1.7, p90: 1.9 }
  },
  wue: {
    global: { p10: 0.2, p25: 0.4, p50: 0.8,  p75: 1.4, p90: 2.2 },
    mena:   { p10: 0.4, p25: 0.7, p50: 1.1,  p75: 1.7, p90: 2.5 }
  },
  renewablePercent: {
    global: { p10: 95, p25: 75, p50: 42, p75: 20, p90: 5  },
    mena:   { p10: 60, p25: 40, p50: 20, p75: 8,  p90: 2  }
  },
  serverLifecycle: {
    global: { p10: 6, p25: 5, p50: 4, p75: 3, p90: 2 }
  }
};

// Return user's percentile rank (0-100) for a given metric and value
// Higher is better for all metrics except pue and wue
export function getPercentileRank(metric, value, region = 'global') {
  const benchmarks = INDUSTRY_BENCHMARKS[metric]?.[region] ?? INDUSTRY_BENCHMARKS[metric]?.global;
  if (!benchmarks) return null;

  const higherIsBetter = !['pue', 'wue'].includes(metric);
  const v = parseFloat(value);
  if (isNaN(v)) return null;

  if (higherIsBetter) {
    if (v >= benchmarks.p10) return 90;
    if (v >= benchmarks.p25) return 75;
    if (v >= benchmarks.p50) return 50;
    if (v >= benchmarks.p75) return 25;
    return 10;
  } else {
    if (v <= benchmarks.p10) return 90;
    if (v <= benchmarks.p25) return 75;
    if (v <= benchmarks.p50) return 50;
    if (v <= benchmarks.p75) return 25;
    return 10;
  }
}

export function getBenchmarkLabel(percentile) {
  if (percentile >= 75) return 'Top quartile';
  if (percentile >= 50) return 'Above median';
  if (percentile >= 25) return 'Below median';
  return 'Bottom quartile';
}
