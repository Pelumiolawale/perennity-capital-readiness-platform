// ============================================
// AI ANALYSIS — Claude API Integration
// Uses loaded regulation files as prompt-cached context
// ============================================
//
// SECURITY NOTE: VITE_ANTHROPIC_API_KEY is exposed to the browser.
// Before public client deployment, proxy these calls through a
// serverless function (e.g. Vercel /api/analyse) so the key stays server-side.
// ============================================

import regulationIndex from '../regulations/index.json';

// Use import.meta.glob to eagerly bundle all regulation JSON files.
// Vite resolves this at build time — no dynamic path issues.
const ALL_REGULATION_MODULES = import.meta.glob('../regulations/frameworks/*.json', { eager: true });

async function loadRegulations() {
  const frameworks = {};
  const activeIds = new Set(
    regulationIndex.activeFrameworks
      .filter(e => e.status === 'active' || e.status === 'proposed')
      .map(e => e.id)
  );

  for (const [path, mod] of Object.entries(ALL_REGULATION_MODULES)) {
    const data = mod.default || mod;
    if (data?.id && activeIds.has(data.id)) {
      frameworks[data.id] = data;
    }
  }
  return frameworks;
}

function buildSystemPrompt(frameworks) {
  const frameworkText = Object.values(frameworks)
    .map(f => `## ${f.name} (v${f.version}, status: ${f.status})\n${JSON.stringify(f, null, 2)}`)
    .join('\n\n');

  return `You are a senior green finance compliance expert specialising in EU Taxonomy, SFDR, UK SDR, CSRD, and TCFD requirements for data centre projects in the MENA region.

The following regulatory frameworks are active in this assessment tool (treat these as authoritative):

${frameworkText}

When answering:
- Always cite specific regulatory articles and thresholds from the frameworks above
- Distinguish between current law and proposed reforms
- Be direct and actionable — clients need to know what to fix and by when
- Do not introduce regulatory information not present in the frameworks above
- Keep responses concise (3-5 paragraphs for narratives, shorter for Q&A)`;
}

// Generate AI narrative gap analysis — streamed
// Yields text delta chunks
export async function* generateGapNarrative(formData, results) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    yield '[AI analysis unavailable — VITE_ANTHROPIC_API_KEY not configured]';
    return;
  }

  const frameworks = await loadRegulations();
  const systemPrompt = buildSystemPrompt(frameworks);

  const body = {
    model: 'claude-opus-4-6',
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    stream: true,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Analyse the following data centre green finance compliance assessment results and provide a 3-5 paragraph expert narrative covering:
1. Overall compliance position and key risks
2. The most critical gaps to address (ranked by regulatory urgency)
3. A clear recommended priority action for the client

Assessment scores: ${JSON.stringify({
  overall: results.overall,
  categories: Object.fromEntries(
    Object.entries(results.categories).map(([k, v]) => [k, { score: v.score, topGap: v.gaps[0]?.gap }])
  ),
  sfdr: results.sfdr?.classification,
  taxonomyAligned: results.taxonomy?.aligned,
  csrdScore: results.csrd?.overallScore
}, null, 2)}

Project: ${formData.projectName}, ${formData.country}, ${formData.powerCapacity} MW
Top gaps: ${results.gaps?.slice(0, 5).map(g => `${g.metric} (${g.severity}): ${g.gap}`).join('; ')}`
    }]
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    yield `[AI analysis error: ${response.status} ${response.statusText}]`;
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') return;
      try {
        const event = JSON.parse(data);
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          yield event.delta.text;
        }
      } catch {
        // skip malformed SSE lines
      }
    }
  }
}

// Answer regulatory questions — streamed chat
export async function* answerRegulatoryQuestion(question, scores, formData, conversationHistory = []) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    yield '[AI Q&A unavailable — VITE_ANTHROPIC_API_KEY not configured]';
    return;
  }

  const frameworks = await loadRegulations();
  const systemPrompt = buildSystemPrompt(frameworks);

  const messages = [
    ...conversationHistory,
    {
      role: 'user',
      content: `Assessment context — Overall score: ${scores?.overall}%, SFDR: ${scores?.sfdr?.classification}, Taxonomy aligned: ${scores?.taxonomy?.aligned}. Project: ${formData?.projectName}, ${formData?.country}.

Question: ${question}`
    }
  ];

  const body = {
    model: 'claude-opus-4-6',
    max_tokens: 1000,
    stream: true,
    system: systemPrompt,
    messages
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    yield `[Error: ${response.status} ${response.statusText}]`;
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') return;
      try {
        const event = JSON.parse(data);
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          yield event.delta.text;
        }
      } catch {
        // skip
      }
    }
  }
}
