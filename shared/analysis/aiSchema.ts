/**
 * Strict validation for AI output.
 *
 * The LLM is untrusted input. Nothing here coerces or "repairs" a bad response
 * into something usable — the previous `sanitizeAISignal` did exactly that and
 * would happily manufacture a stop-loss for a model that never returned one.
 * A malformed response is an error, full stop.
 */

import type { AIAnalysis, MarketAnalysis, SignalQuality } from '../types';

export interface ValidationSuccess {
  ok: true;
  value: AIAnalysis;
  /** Non-fatal observations, surfaced to the user as warnings. */
  notes: string[];
}

export interface ValidationFailure {
  ok: false;
  errors: string[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

const SIGNALS = ['BUY', 'SELL', 'HOLD'] as const;
const TRENDS = ['BULLISH', 'BEARISH', 'NEUTRAL'] as const;

/**
 * Extracts a JSON object from a model response that may be wrapped in prose or
 * a markdown fence. Does not attempt to fix invalid JSON.
 */
export function extractJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: 'AI returned an empty response.' };
  }

  let text = raw.trim();

  // Strip a ```json ... ``` fence if present.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  // Otherwise take the outermost object.
  if (!text.startsWith('{')) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return { ok: false, error: 'AI response did not contain a JSON object.' };
    }
    text = text.slice(start, end + 1);
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: `AI response was not valid JSON: ${(err as Error).message}` };
  }
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Validates the parsed object against the required schema and against reality
 * (prices must be near the real market price, stop/target must sit on the
 * correct side of entry for the stated direction).
 */
export function validateAIAnalysis(input: unknown, market: { price: number }): ValidationResult {
  const errors: string[] = [];
  const notes: string[] = [];

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['AI response was not a JSON object.'] };
  }

  const o = input as Record<string, unknown>;

  // --- enums
  const signal = o.signal;
  if (typeof signal !== 'string' || !SIGNALS.includes(signal as any)) {
    errors.push(`Field "signal" must be one of BUY, SELL, HOLD (received: ${JSON.stringify(signal)}).`);
  }

  const trend = o.trend;
  if (typeof trend !== 'string' || !TRENDS.includes(trend as any)) {
    errors.push(`Field "trend" must be one of BULLISH, BEARISH, NEUTRAL (received: ${JSON.stringify(trend)}).`);
  }

  // --- numbers
  // Note: no position-size field. This application never sizes a position in
  // currency terms because it does not know the user's account.
  const numericFields = [
    'confidence',
    'entry',
    'stopLoss',
    'takeProfit',
    'riskReward',
    'durationMinutes',
  ] as const;

  for (const field of numericFields) {
    if (!isFiniteNumber(o[field])) {
      errors.push(`Field "${field}" must be a finite number (received: ${JSON.stringify(o[field])}).`);
    }
  }

  if (isFiniteNumber(o.confidence) && (o.confidence < 0 || o.confidence > 100)) {
    errors.push(`Field "confidence" must be between 0 and 100 (received: ${o.confidence}).`);
  }

  // --- strings
  if (typeof o.reason !== 'string' || o.reason.trim().length === 0) {
    errors.push('Field "reason" must be a non-empty string.');
  }

  if (!Array.isArray(o.warnings) || o.warnings.some((w) => typeof w !== 'string')) {
    errors.push('Field "warnings" must be an array of strings.');
  }

  if (errors.length) return { ok: false, errors };

  const value: AIAnalysis = {
    signal: signal as AIAnalysis['signal'],
    confidence: o.confidence as number,
    trend: trend as AIAnalysis['trend'],
    entry: o.entry as number,
    stopLoss: o.stopLoss as number,
    takeProfit: o.takeProfit as number,
    riskReward: o.riskReward as number,
    durationMinutes: o.durationMinutes as number,
    reason: (o.reason as string).trim(),
    warnings: o.warnings as string[],
  };

  // --- semantic checks against live market data
  if (value.signal !== 'HOLD') {
    if (value.entry <= 0) errors.push('Entry price must be greater than zero for a BUY/SELL signal.');
    if (value.stopLoss <= 0) errors.push('Stop loss must be greater than zero for a BUY/SELL signal.');
    if (value.takeProfit <= 0) errors.push('Take profit must be greater than zero for a BUY/SELL signal.');

    // Guard against invented prices: entry must be within 10% of the real price.
    if (market.price > 0 && value.entry > 0) {
      const drift = Math.abs(value.entry - market.price) / market.price;
      if (drift > 0.1) {
        errors.push(
          `AI entry price (${value.entry}) is ${(drift * 100).toFixed(1)}% away from the live market price (${market.price}). Rejecting as unreliable.`
        );
      } else if (drift > 0.02) {
        notes.push(
          `AI entry price differs from the live price by ${(drift * 100).toFixed(2)}%.`
        );
      }
    }

    // Direction sanity: stop and target must straddle entry correctly.
    if (value.signal === 'BUY') {
      if (value.stopLoss >= value.entry) {
        errors.push('For a BUY signal the stop loss must be below the entry price.');
      }
      if (value.takeProfit <= value.entry) {
        errors.push('For a BUY signal the take profit must be above the entry price.');
      }
    } else if (value.signal === 'SELL') {
      if (value.stopLoss <= value.entry) {
        errors.push('For a SELL signal the stop loss must be above the entry price.');
      }
      if (value.takeProfit >= value.entry) {
        errors.push('For a SELL signal the take profit must be below the entry price.');
      }
    }
  }

  if (errors.length) return { ok: false, errors };

  // Recompute risk/reward from the model's own levels; never trust its arithmetic.
  const risk = Math.abs(value.entry - value.stopLoss);
  const reward = Math.abs(value.takeProfit - value.entry);
  if (value.signal !== 'HOLD' && risk > 0) {
    const actualRR = reward / risk;
    if (Math.abs(actualRR - value.riskReward) > 0.15) {
      notes.push(
        `AI reported R:R of ${value.riskReward} but its own levels imply ${actualRR.toFixed(2)}. Using the recalculated value.`
      );
    }
    value.riskReward = Number(actualRR.toFixed(2));
  }

  return { ok: true, value, notes };
}

/**
 * Combines the deterministic technical score with the AI's confidence.
 *
 * Technical analysis is weighted more heavily (60/40) because it is reproducible
 * and cannot hallucinate. Agreement between the two is rewarded; disagreement is
 * penalised, so a confident AI fighting the indicators does not produce a high score.
 */
export function computeSignalQuality(
  analysis: MarketAnalysis,
  ai: { signal: AIAnalysis['signal']; confidence: number }
): SignalQuality {
  const technical = analysis.technicalScore;
  const aiConfidence = ai.confidence;

  const components: Array<{ label: string; value: number }> = [
    { label: 'Technical score (60%)', value: Number((technical * 0.6).toFixed(1)) },
    { label: 'AI confidence (40%)', value: Number((aiConfidence * 0.4).toFixed(1)) },
  ];

  let final = technical * 0.6 + aiConfidence * 0.4;

  // Agreement check: does the AI direction match the technical bias?
  const technicalBias = technical >= 60 ? 'BUY' : technical <= 40 ? 'SELL' : 'NEUTRAL';
  if (ai.signal !== 'HOLD' && technicalBias !== 'NEUTRAL') {
    if (ai.signal === technicalBias) {
      final += 5;
      components.push({ label: 'AI agrees with technical bias', value: 5 });
    } else {
      final -= 15;
      components.push({ label: 'AI contradicts technical bias', value: -15 });
    }
  }

  // Data quality and market condition penalties.
  if (analysis.insufficientData) {
    final -= 10;
    components.push({ label: 'Insufficient candle history', value: -10 });
  }
  if (analysis.regime === 'HIGH_VOLATILITY') {
    final -= 5;
    components.push({ label: 'High volatility regime', value: -5 });
  }
  if (analysis.volume === 'LOW') {
    final -= 5;
    components.push({ label: 'Low volume confirmation', value: -5 });
  }

  return {
    technicalScore: Number(technical.toFixed(1)),
    aiConfidence: Number(aiConfidence.toFixed(1)),
    finalScore: Number(Math.max(0, Math.min(100, final)).toFixed(1)),
    components,
  };
}
