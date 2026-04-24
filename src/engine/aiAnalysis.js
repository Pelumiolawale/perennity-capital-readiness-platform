// ============================================================
// AI ANALYSIS — Claude API Integration
// Streams regulatory narrative and answers Q&A using
// regulation JSON files as system prompt context.
//
// SECURITY NOTE: VITE_ANTHROPIC_API_KEY is client-side.
// For production, proxy through a serverless function.
// ============================================================

import regionThresholds from '../regulations/frameworks/region-thresholds.json';
import euTaxonomy from '../regulations/frameworks/eu-taxonomy.json';
import sfdr from '../regulations/frameworks/sfdr.json';
import ukSdr from '../regulations/frameworks/uk-sdr.json';
import tcfd from '../regulations/frameworks/tcfd.json';

const ALL_FRAMEWORKS = { regionThresholds, euTaxonomy, sfdr, ukSdr, tcfd };

function buildSystemPrompt() {
  const frameworkText = Object.values(ALL_FRAMEWORKS)
    .map(f => `## ${f.name || f.id} (v${f.version || 'current'}, status: ${f.status || 'active'})\n${JSON.stringify(f, null, 2)}`)
    .join('\n\n---\n\n');

  return `You are a senior green finance and infrastructure compliance expert at Perennity Bridge, specialising in data centre capital readiness across EU, UK, US, and MENA markets.

The following regulatory frameworks are the authoritative source for your analysis:

${frameworkText}

When responding:
- Be precise and cite specific clauses/thresholds from the frameworks above
- Flag if a regulation has upcoming changes
- Keep responses concise and investor-grade in tone
- Do not repeat the user's question back to them
- Reference the project's region-specific thresholds when relevant`;
}

export async function* generateNarrative(project, assessment) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return;

  const systemPrompt = buildSystemPrompt();
  const userPrompt = `Generate a concise (3-4 paragraph) capital readiness narrative for the following data centre project assessment:

Project: ${project.project_name || 'Untitled'} | Region: ${project.region} | Country: ${project.country}
Capital Readiness Score: ${assessment.capitalReadinessScore}/100 (${assessment.band?.label})
Confidence: ${assessment.confidenceScore}%
SFDR: ${assessment.sfdr?.classification} | EU Taxonomy: ${assessment.taxonomy?.aligned ? 'Aligned' : 'Not Aligned'}

Pillar Scores:
- Sustainability Alignment: ${assessment.subscores.sa}/100
- Energy & Power Viability: ${assessment.subscores.epv}/100
- Water & Resource Efficiency: ${assessment.subscores.wre}/100
- Climate & Site Resilience: ${assessment.subscores.csr}/100
- Delivery & Funding Readiness: ${assessment.subscores.dfr}/100

Top risks: ${assessment.risks.join('; ') || 'None identified'}
${assessment.hardStopTriggered ? `Hard stop triggered: ${assessment.hardStopReason}` : ''}

Top recommendations: ${assessment.recommendations.slice(0, 3).map(r => r.action).join('; ')}

Write an investor-facing narrative covering: overall readiness, key strengths, critical gaps, and priority actions. Be specific and reference applicable regulatory thresholds.`;

  yield* streamClaude(systemPrompt, userPrompt);
}

export async function* answerRegulatoryQuestion(question, project, assessment, history = []) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return;

  const systemPrompt = buildSystemPrompt();

  const context = `Project context: ${project.project_name || 'Untitled'}, ${project.region}, Score: ${assessment.capitalReadinessScore}/100, SFDR: ${assessment.sfdr?.classification}, Taxonomy: ${assessment.taxonomy?.aligned ? 'Aligned' : 'Not Aligned'}`;

  const messages = [
    ...history,
    { role: 'user', content: `${context}\n\nQuestion: ${question}` }
  ];

  yield* streamClaude(systemPrompt, messages);
}

async function* streamClaude(systemPrompt, userContent) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  const messages = Array.isArray(userContent)
    ? userContent
    : [{ role: 'user', content: userContent }];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      stream: true,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          yield parsed.delta.text;
        }
      } catch { /* skip malformed */ }
    }
  }
}
