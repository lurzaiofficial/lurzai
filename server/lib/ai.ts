/**
 * AI analysis service (OpenRouter).
 *
 * The API key is supplied by the OPERATOR via OPENROUTER_API_KEY and never
 * leaves the server. End users do not provide keys and can never see this one.
 *
 * Validation is strict: a malformed response is an error, not something to
 * repair. There is no fabricated fallback signal.
 */

import { logger } from './logger';
import { extractJson, validateAIAnalysis } from '../../shared/analysis/aiSchema';
import type {
  AIAnalysis,
  AssetClass,
  Candlestick,
  MarketAnalysis,
  Quote,
} from '../../shared/types';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class AIError extends Error {
  constructor(message: string, readonly detail?: string[]) {
    super(message);
    this.name = 'AIError';
  }
}

/** True when the operator has configured a key. */
export function isAIConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/**
 * System prompt.
 *
 * Frames the model as an educational advisor for inexperienced users: it must
 * default to HOLD, explain itself plainly, and never imply certainty.
 */
export const SYSTEM_PROMPT = `You are a careful market ANALYSIS ASSISTANT inside a trading-signal application. Many of your users are BEGINNERS with no trading experience, and they rely on you to tell them honestly whether a trade is worth taking.

YOUR ROLE AND ITS LIMITS
- You provide analysis and education only. You do NOT place trades and you do NOT control any account.
- The application executes nothing. The user decides and acts manually elsewhere.
- You cannot predict the future and you must never imply certainty or guaranteed profit.
- A separate deterministic risk layer reviews your output and can overrule you.

DATA RULES
- Use ONLY the market data supplied in the user message. It is real data from a live exchange or market data provider.
- All indicator values were computed by the application from actual candles. Treat them as authoritative.
- NEVER invent, estimate, or recall prices from memory. If something is marked "unavailable", treat it as unknown and say so.
- Base your entry on the supplied current price. Do not drift away from it.

DECISION RULES
- Prefer HOLD whenever evidence is weak, mixed, or contradictory. HOLD is the correct answer most of the time and is never a failure.
- A beginner losing money on a marginal setup is far worse than a beginner missing an opportunity.
- Explicitly name conflicting indicators (for example bullish EMA structure but bearish MACD, or a strong move on weak volume).
- Respect volatility: in a high-volatility regime widen the stop or choose HOLD, rather than proposing a tight stop that noise will trigger.
- Place stops beyond structure (support/resistance), not inside obvious noise.
- Require a sensible reward for the risk taken. If the reward does not justify the risk, say HOLD.
- Do not manufacture a signal just to seem useful.

DIFFERENT MARKETS
- Crypto trades 24/7 and is typically more volatile.
- Stocks and ETFs trade only during market hours and can gap overnight.
- Forex is usually lower volatility, so percentage moves are smaller.
- Commodities can react sharply to news. Adjust expectations accordingly.

WRITING STYLE
- Write for someone who does not know jargon. If you use a term like RSI, add a short plain-language clause explaining what it indicates here.
- Be direct and specific. Cite the actual indicator values that drove your decision.

LEVEL RULES
- BUY: stopLoss MUST be below entry, takeProfit MUST be above entry.
- SELL: stopLoss MUST be above entry, takeProfit MUST be below entry.
- HOLD: set entry, stopLoss, takeProfit and riskReward to 0.
- riskReward = |takeProfit - entry| / |entry - stopLoss|.

OUTPUT FORMAT
Respond with a single valid JSON object and nothing else. No markdown, no commentary, no code fence.
{
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence": <number 0-100>,
  "trend": "BULLISH" | "BEARISH" | "NEUTRAL",
  "entry": <number>,
  "stopLoss": <number>,
  "takeProfit": <number>,
  "riskReward": <number>,
  "durationMinutes": <number>,
  "reason": "<2-4 plain-English sentences citing specific indicator values>",
  "warnings": ["<short, specific warning>", "..."]
}

Confidence guidance: 0-40 weak or conflicting, 40-60 marginal, 60-80 solid multi-indicator agreement, 80+ only for strong agreement across trend, momentum and volume.`;

function fmt(value: number | null, dp = 2): string {
  return value === null ? 'unavailable' : value.toFixed(dp);
}

/** Context describing how the asset class behaves, so advice suits the market. */
function assetContext(assetClass: AssetClass, marketClosed?: boolean): string {
  switch (assetClass) {
    case 'CRYPTO':
      return 'Asset class: CRYPTO. Trades 24/7, no market close, typically high volatility.';
    case 'STOCK':
    case 'ETF':
      return `Asset class: ${assetClass}. Trades during exchange hours only and can gap overnight.${marketClosed ? ' THE MARKET IS CURRENTLY CLOSED — the price shown is the last close.' : ''}`;
    case 'FOREX':
      return 'Asset class: FOREX. Trades 24/5, typically lower percentage volatility, so targets and stops are proportionally tighter.';
    case 'COMMODITY':
      return 'Asset class: COMMODITY. Sensitive to macro news and supply shocks.';
    case 'INDEX':
      return 'Asset class: INDEX. Broad-market exposure, usually smoother than single stocks.';
    default:
      return `Asset class: ${assetClass}.`;
  }
}

export function buildUserPrompt(params: {
  analysis: MarketAnalysis;
  quote: Quote;
  candles: Candlestick[];
  displaySymbol: string;
  instrumentName: string;
  assetClass: AssetClass;
  providerLabel: string;
  currency: string;
  minRiskReward: number;
  activeSignal: { direction: string; entryPrice: number; openedAt: number } | null;
  /** User-selected advisory horizon in minutes (timed Analyse session). */
  tradeWindowMinutes?: number;
  /** Intended size string for context only — never executed. */
  intendedSizeNote?: string;
}): string {
  const { analysis, quote, candles } = params;
  const ind = analysis.indicators;

  // Only a small candle summary is sent: enough for recent context, without
  // wasting tokens (and money) on hundreds of raw rows.
  const recent = candles
    .filter((c) => c.closed)
    .slice(-12)
    .map(
      (c) =>
        `${new Date(c.time * 1000).toISOString().slice(0, 16).replace('T', ' ')} O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume.toFixed(2)}`
    )
    .join('\n');

  const windowLine = params.tradeWindowMinutes
    ? `USER TRADE WINDOW: ${params.tradeWindowMinutes} minutes. Set durationMinutes to ${params.tradeWindowMinutes}. Judge whether a trade is worth taking INSIDE this window only — if the setup needs more time, return HOLD.`
    : 'USER TRADE WINDOW: not specified — choose a realistic durationMinutes for the setup.';

  const sizeLine = params.intendedSizeNote
    ? `INTENDED SIZE (advisory only, never executed by this app): ${params.intendedSizeNote}`
    : 'INTENDED SIZE: not specified.';

  return `MARKET: ${params.displaySymbol} (${params.instrumentName}) on ${params.providerLabel}
${assetContext(params.assetClass, quote.marketClosed)}
TIMEFRAME: ${analysis.timeframe}
QUOTE CURRENCY: ${params.currency}
DATA AGE: ${Math.round((Date.now() - quote.fetchedAt) / 1000)}s

CURRENT PRICE: ${quote.price}
24H CHANGE: ${quote.change24hPercent.toFixed(2)}%
24H HIGH: ${quote.high24h ?? 'unavailable'}
24H LOW: ${quote.low24h ?? 'unavailable'}
24H VOLUME: ${quote.volume24h ? quote.volume24h.toFixed(0) : 'unavailable'}

APPLICATION-COMPUTED INDICATORS (authoritative):
EMA20: ${fmt(ind.ema20, 4)}
EMA50: ${fmt(ind.ema50, 4)}
EMA200: ${fmt(ind.ema200, 4)}
RSI(14): ${fmt(ind.rsi)}
MACD: ${ind.macd ? `${ind.macd.macd} / signal ${ind.macd.signal} / histogram ${ind.macd.histogram}` : 'unavailable'}
ATR(14): ${fmt(ind.atr, 6)} (${fmt(ind.atrPercent, 2)}% of price)
Volume MA20: ${fmt(ind.volumeMa20, 2)} | Last volume: ${fmt(ind.lastVolume, 2)}
Support: ${fmt(ind.support, 4)}
Resistance: ${fmt(ind.resistance, 4)}

APPLICATION CLASSIFICATION:
Trend: ${analysis.trend}
Momentum: ${analysis.momentum}
Volatility: ${analysis.volatility}
Volume: ${analysis.volume}
Market regime: ${analysis.regime}
Technical score: ${analysis.technicalScore}/100
Candles analysed: ${analysis.candleCount}${analysis.insufficientData ? ' (LIMITED HISTORY — be more cautious)' : ''}
${analysis.warnings.length ? `Data warnings: ${analysis.warnings.join('; ')}` : ''}

RECENT CLOSED CANDLES:
${recent || 'unavailable'}

${windowLine}
${sizeLine}

USER IS ALREADY FOLLOWING: ${
    params.activeSignal
      ? `a ${params.activeSignal.direction} signal on this market entered at ${params.activeSignal.entryPrice}. Take this into account and avoid recommending a conflicting new position.`
      : 'nothing on this market.'
  }

The user's minimum acceptable risk/reward is ${params.minRiskReward}. If you cannot find a setup meeting it, return HOLD.

Analyse this data and respond with the required JSON object only.`;
}

export interface AIRequestResult {
  analysis: AIAnalysis;
  notes: string[];
  model: string;
  latencyMs: number;
}

export async function requestAIAnalysis(params: {
  model: string;
  temperature: number;
  userPrompt: string;
  marketPrice: number;
}): Promise<AIRequestResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    // Operator misconfiguration; the user cannot fix this, so say so plainly.
    throw new AIError('AI analysis is not available right now. The service is missing its configuration.');
  }

  const started = Date.now();
  let res: Response;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'LURZ AI',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        temperature: params.temperature,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: params.userPrompt },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new AIError('The analysis took too long and was cancelled. Please try again.');
    }
    throw new AIError('Could not reach the AI service. Please try again in a moment.');
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();

  if (!res.ok) {
    // Technical detail is logged; the user gets something actionable.
    logger.error('ai: openrouter request failed', { status: res.status, body: text.slice(0, 400) });

    if (res.status === 401) throw new AIError('AI analysis is unavailable: the service key was rejected.');
    if (res.status === 402) throw new AIError('AI analysis is temporarily unavailable: the service has run out of credit.');
    if (res.status === 429) throw new AIError('Too many analysis requests right now. Please wait a moment and try again.');
    if (res.status === 404) throw new AIError(`The configured AI model "${params.model}" is not available.`);
    throw new AIError('The AI service returned an error. Please try again.');
  }

  let content: string;
  try {
    content = JSON.parse(text)?.choices?.[0]?.message?.content ?? '';
  } catch {
    logger.error('ai: non-JSON envelope from openrouter', { body: text.slice(0, 400) });
    throw new AIError('The AI service returned an unreadable response.');
  }

  const parsed = extractJson(content);
  if (parsed.ok === false) {
    logger.error('ai: model output was not parseable JSON', {
      model: params.model,
      error: parsed.error,
      content: content.slice(0, 400),
    });
    throw new AIError(
      'The AI returned a malformed response, so no signal was produced. Nothing was acted on.',
      [parsed.error]
    );
  }

  const validated = validateAIAnalysis(parsed.value, { price: params.marketPrice });
  if (validated.ok === false) {
    logger.error('ai: model output failed schema validation', {
      model: params.model,
      errors: validated.errors,
      content: content.slice(0, 400),
    });
    throw new AIError(
      'The AI response failed validation and was rejected. No signal was produced.',
      validated.errors
    );
  }

  return {
    analysis: validated.value,
    notes: validated.notes,
    model: params.model,
    latencyMs: Date.now() - started,
  };
}
