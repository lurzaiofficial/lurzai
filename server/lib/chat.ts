/**
 * Chat service.
 *
 * A conversational companion to the signal engine. The user can ask questions
 * about the market they are viewing, about trading concepts, or about a signal
 * they were just given.
 *
 * Constraints mirror the analysis engine:
 *  - The operator's API key is used; users never supply one.
 *  - Real market context is injected so the model never guesses prices.
 *  - The assistant gives education and interpretation, never instructions to
 *    trade, and never claims to act on the user's behalf.
 */

import { logger } from './logger';
import { resolveAppUrl } from './appUrl';
import type { AssetClass, MarketAnalysis, Quote, SignalRecord } from '../../shared/types';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent';

export class ChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatError';
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const CHAT_SYSTEM_PROMPT = `You are the assistant inside LURZ AI, a trading-signal application. You help people understand markets and the signals this app produces. Many users are complete beginners.

WHAT THIS APPLICATION IS
- It analyses markets (crypto, stocks, forex, commodities) and produces advisory signals.
- It does NOT place trades, connect to any exchange account, or hold anyone's money.
- The user acts manually on their own broker or exchange if they choose to.
- If asked to buy, sell, or execute anything, explain clearly that you cannot and that the app never trades.

HOW TO ANSWER
- Be direct, warm and concise. Short paragraphs. No walls of text.
- Write for a beginner unless the user clearly demonstrates expertise. Explain jargon the first time you use it.
- When market data is provided below, use it and cite the actual numbers. Never invent a price or an indicator value.
- If you are not given data for something the user asks about, say so plainly and offer to analyse it instead of guessing.
- Use markdown for structure: short bullet lists and **bold** for key figures. Never use headings larger than ###.

RISK AND HONESTY
- Never guarantee an outcome or imply a trade is certain. Markets are probabilistic.
- Never tell someone how much money to risk in currency terms; talk in percentages of their account.
- If a user seems to be chasing losses, overtrading, or using money they cannot afford to lose, say so kindly and directly.
- If a user asks for a prediction, explain what the current evidence supports and what would invalidate it, rather than refusing outright.
- You are not a licensed financial adviser and this is not financial advice. Mention this only when genuinely relevant, not in every message.

SCOPE
- Happily explain indicators (RSI, MACD, EMA, ATR), risk/reward, position sizing, stop losses, market structure, and how this app's verdicts work.
- If asked something entirely unrelated to markets or the app, answer briefly and steer back.`;

/** Builds the market-context block appended to the system prompt. */
export function buildChatContext(params: {
  displaySymbol?: string;
  instrumentName?: string;
  assetClass?: AssetClass;
  providerLabel?: string;
  currency?: string;
  timeframe?: string;
  quote?: Quote | null;
  analysis?: MarketAnalysis | null;
  signal?: SignalRecord | null;
}): string {
  const { quote, analysis, signal } = params;

  if (!params.displaySymbol) {
    return '\n\nCURRENT CONTEXT: The user has not selected a market yet.';
  }

  const lines: string[] = [
    '',
    '',
    '--- LIVE CONTEXT (real data, use these exact numbers) ---',
    `Market: ${params.displaySymbol}${params.instrumentName ? ` (${params.instrumentName})` : ''}`,
    `Asset class: ${params.assetClass ?? 'unknown'} | Source: ${params.providerLabel ?? 'unknown'}`,
    `Timeframe on screen: ${params.timeframe ?? 'unknown'}`,
  ];

  if (quote) {
    lines.push(
      `Current price: ${quote.price} ${params.currency ?? ''}`,
      `24h change: ${quote.change24hPercent.toFixed(2)}%`,
      `24h high/low: ${quote.high24h ?? 'unavailable'} / ${quote.low24h ?? 'unavailable'}`
    );
    if (quote.marketClosed) lines.push('NOTE: this market is currently CLOSED.');
  } else {
    lines.push('Price: unavailable right now.');
  }

  if (analysis) {
    const i = analysis.indicators;
    lines.push(
      `Trend: ${analysis.trend} | Momentum: ${analysis.momentum} | Volatility: ${analysis.volatility} | Volume: ${analysis.volume}`,
      `Market regime: ${analysis.regime}`,
      `Technical score: ${analysis.technicalScore}/100`,
      `RSI(14): ${i.rsi ?? 'unavailable'} | MACD hist: ${i.macd?.histogram ?? 'unavailable'} | ATR: ${i.atrPercent ?? 'unavailable'}% of price`,
      `EMA20/50/200: ${i.ema20 ?? 'n/a'} / ${i.ema50 ?? 'n/a'} / ${i.ema200 ?? 'n/a'}`,
      `Support: ${i.support ?? 'unavailable'} | Resistance: ${i.resistance ?? 'unavailable'}`
    );
  }

  if (signal) {
    lines.push(
      '',
      'MOST RECENT SIGNAL FOR THIS MARKET:',
      `Direction: ${signal.ai.signal} | AI confidence: ${signal.ai.confidence}% | Combined quality: ${signal.quality.finalScore}%`,
      `Verdict: ${signal.advice.verdict} - ${signal.advice.headline}`
    );
    if (signal.ai.signal !== 'HOLD') {
      lines.push(
        `Entry ${signal.ai.entry} | Stop ${signal.ai.stopLoss} | Target ${signal.ai.takeProfit} | R:R 1:${signal.ai.riskReward}`
      );
    }
    lines.push(`Reasoning given: ${signal.ai.reason}`);

    const failed = signal.advice.checks.filter((c) => !c.passed);
    if (failed.length) {
      lines.push(`Failed checks: ${failed.map((c) => `${c.label} (${c.detail})`).join(' | ')}`);
    }
  } else {
    lines.push('', 'No signal has been generated for this market yet.');
  }

  lines.push('--- END CONTEXT ---');
  return lines.join('\n');
}

/**
 * Streams a chat completion, invoking `onDelta` for each token.
 *
 * Streaming is used so the UI can render progressively — the MessageScroller
 * is built for exactly this, and a 10-second silent wait feels broken.
 */
export async function streamChat(params: {
  model: string;
  temperature: number;
  systemPrompt: string;
  messages: ChatMessage[];
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}): Promise<{ full: string; latencyMs: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ChatError('Chat is unavailable: this server has no AI service configured.');
  }

  const started = Date.now();

  // Build Gemini request format with system instruction
  const contents = [
    ...params.messages.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    })),
  ];

  let res: Response;
  try {
    res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system_instruction: {
          role: 'user',
          parts: [{ text: params.systemPrompt }],
        },
        contents,
        generationConfig: {
          temperature: params.temperature,
          maxOutputTokens: 1500,
          topP: 0.95,
          topK: 40,
        },
      }),
      signal: params.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new ChatError('Cancelled.');
    throw new ChatError('Could not reach the AI service. Please try again.');
  }

  if (!res.ok) {
    const body = await res.text();
    logger.error('chat: gemini request failed', { status: res.status, body: body.slice(0, 300) });

    if (res.status === 401 || res.status === 403)
      throw new ChatError('Chat is unavailable: the service key was rejected.');
    if (res.status === 429) throw new ChatError('Too many messages right now. Please wait a moment.');
    throw new ChatError('The AI service returned an error. Please try again.');
  }

  if (!res.body) throw new ChatError('The AI service returned an empty response.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Gemini streams newline-delimited JSON objects
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const chunk = JSON.parse(line);
          const delta = chunk?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (typeof delta === 'string' && delta.length > 0) {
            full += delta;
            params.onDelta(delta);
          }
        } catch {
          // Ignore unparseable frames
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!full.trim()) throw new ChatError('The AI returned an empty response. Please try again.');

  return { full, latencyMs: Date.now() - started };
}
