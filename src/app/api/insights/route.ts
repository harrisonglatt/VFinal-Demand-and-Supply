// ─── AI Executive Insights Route ──────────────────────────────────────
// Generates "So What" insights using Claude API.
// Falls back to rule-based insights when ANTHROPIC_API_KEY is not set.
// Caches response for 30 minutes to avoid excessive API calls.

import { NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

interface InsightsResponse {
  insights: string[];
  risks: string[];
  actions: string[];
  source: 'ai' | 'rules';
  cached: boolean;
}

let cache: { data: InsightsResponse; timestamp: number } | null = null;

export async function POST(req: Request) {
  // Check cache
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json({ ...cache.data, cached: true });
  }

  const metrics = await req.json();

  // If no API key, use rule-based fallback
  if (!ANTHROPIC_API_KEY) {
    const rulesBased = generateRuleBasedInsights(metrics);
    cache = { data: rulesBased, timestamp: Date.now() };
    return NextResponse.json(rulesBased);
  }

  try {
    const prompt = buildPrompt(metrics);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      console.error('Claude API error:', res.status);
      const rulesBased = generateRuleBasedInsights(metrics);
      cache = { data: rulesBased, timestamp: Date.now() };
      return NextResponse.json(rulesBased);
    }

    const result = await res.json();
    const text = result.content?.[0]?.text ?? '';

    // Parse the structured response
    const parsed = parseAIResponse(text);
    const data: InsightsResponse = { ...parsed, source: 'ai', cached: false };
    cache = { data, timestamp: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    console.error('Insights generation failed:', err);
    const rulesBased = generateRuleBasedInsights(metrics);
    cache = { data: rulesBased, timestamp: Date.now() };
    return NextResponse.json(rulesBased);
  }
}

function buildPrompt(m: Record<string, unknown>): string {
  return `You are a CPG supply chain analyst for Little Spoon, a baby/kids food brand sold at Target.

Based on this week's data, generate exactly 3 insights, 3 risks, and 3 recommended actions. Be specific, cite numbers, and write like a human operator — not generic filler.

DATA:
- LW Sell-Through: $${((m.lwSales as number) / 1000).toFixed(0)}K (${((m.wowSales as number) * 100).toFixed(1)}% WoW), ${m.lwUnits} units
- L4W Sell-Through: $${((m.l4wSales as number) / 1000).toFixed(0)}K, ${m.l4wUnits} units
- SKUs growing WoW: ${m.growingCount}/${m.totalSkus}
- SKUs declining WoW: ${m.decliningCount}/${m.totalSkus}
- 52-Wk Revenue Forecast: $${((m.rev52 as number) / 1_000_000).toFixed(1)}M (base)
- Forecast Accuracy: ${m.mape}% MAPE (L4W), bias ${m.bias}%
- OOS at Target: ${m.oosCount} SKUs >3% OOS, ~$${((m.oosLost as number) / 1000).toFixed(0)}K/wk lost revenue
- Inventory at Risk: $${((m.riskUsd as number) / 1000).toFixed(0)}K bear exposure
- PO Coverage: ${m.coveragePct}% of 13-wk plan covered
- Stockout risk SKUs: ${m.stockoutRiskCount}
- Excess risk SKUs: ${m.excessRiskCount}
- Top performer: ${m.topSku}
- Worst performer: ${m.bottomSku}

Respond in this exact JSON format:
{"insights":["...","...","..."],"risks":["...","...","..."],"actions":["...","...","..."]}`;
}

function parseAIResponse(text: string): { insights: string[]; risks: string[]; actions: string[] } {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        insights: parsed.insights?.slice(0, 3) ?? [],
        risks: parsed.risks?.slice(0, 3) ?? [],
        actions: parsed.actions?.slice(0, 3) ?? [],
      };
    }
  } catch { /* fall through */ }
  return { insights: [], risks: [], actions: [] };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateRuleBasedInsights(m: any): InsightsResponse {
  const insights: string[] = [];
  const risks: string[] = [];
  const actions: string[] = [];

  // Insights
  if (m.wowSales > 0.03)
    insights.push(`Sell-through momentum is positive: LW revenue hit $${((m.lwSales as number) / 1000).toFixed(0)}K, up ${((m.wowSales as number) * 100).toFixed(1)}% WoW. ${m.growingCount} of ${m.totalSkus} SKUs are trending up.`);
  else if (m.wowSales < -0.03)
    insights.push(`Sell-through is softening: LW revenue was $${((m.lwSales as number) / 1000).toFixed(0)}K, down ${((m.wowSales as number) * 100).toFixed(1)}% WoW. ${m.decliningCount} SKUs declining.`);
  else
    insights.push(`Sell-through is stable at $${((m.lwSales as number) / 1000).toFixed(0)}K/week. L4W total: $${((m.l4wSales as number) / 1000).toFixed(0)}K across ${m.totalSkus} active SKUs.`);

  insights.push(`52-week revenue forecast is tracking at $${((m.rev52 as number) / 1_000_000).toFixed(1)}M (base). PO coverage sits at ${m.coveragePct}% of the 13-week plan.`);
  insights.push(`Forecast model MAPE is ${m.mape}% with ${((m.bias as number) > 0 ? '+' : '')}${m.bias}% bias. ${m.mape < 20 ? 'Accuracy is within acceptable range.' : 'Accuracy needs improvement — review high-error SKUs.'}`);

  // Risks
  if (m.oosCount > 0)
    risks.push(`${m.oosCount} SKUs are >3% out-of-stock at Target, costing an estimated $${((m.oosLost as number) / 1000).toFixed(0)}K/week in lost revenue. Top offender needs immediate replenishment.`);
  if (m.stockoutRiskCount > 0)
    risks.push(`${m.stockoutRiskCount} SKUs show POS outpacing orders by >20% — potential stockout risk if ordering cadence doesn't accelerate.`);
  if (m.riskUsd > 0)
    risks.push(`$${((m.riskUsd as number) / 1000).toFixed(0)}K in inventory at risk (bear scenario) across stop-ship constrained SKUs. Clearance or promotional velocity needed.`);

  if (risks.length === 0) risks.push('No critical risks detected this week. Monitor OOS trends and PO coverage.');
  while (risks.length < 3) risks.push('Continue monitoring weekly velocity trends for emerging issues.');

  // Actions
  if (m.oosCount > 0)
    actions.push(`Priority: Submit emergency POs for top OOS SKUs to close the $${((m.oosLost as number) / 1000).toFixed(0)}K/week revenue gap.`);
  if (m.coveragePct < 90)
    actions.push(`PO coverage at ${m.coveragePct}% — accelerate PO submissions to close the gap before week 13.`);
  else
    actions.push(`PO coverage is healthy at ${m.coveragePct}%. Maintain current ordering cadence.`);
  actions.push(`Review forecast accuracy for high-MAPE categories (Kids Snacks: ${m.catMapeWorst ?? 'N/A'}%) and adjust model inputs.`);

  while (actions.length < 3) actions.push('Schedule weekly demand review with Target replenishment team.');

  return { insights: insights.slice(0, 3), risks: risks.slice(0, 3), actions: actions.slice(0, 3), source: 'rules', cached: false };
}
