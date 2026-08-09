/**
 * Unit tests for AI response validation.
 *
 * The point of these tests is to prove that malformed, hallucinated, or
 * internally inconsistent model output is REJECTED rather than repaired.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSignalQuality,
  extractJson,
  validateAIAnalysis,
} from '../shared/analysis/aiSchema';
import type { MarketAnalysis } from '../shared/types';

const MARKET = { price: 100 };

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    signal: 'BUY',
    confidence: 75,
    trend: 'BULLISH',
    entry: 100,
    stopLoss: 98,
    takeProfit: 106,
    riskReward: 3,
    suggestedAmount: 50,
    durationMinutes: 60,
    reason: 'EMA structure is bullish and MACD histogram is positive.',
    warnings: ['Volatility is elevated.'],
    ...overrides,
  };
}

// ------------------------------------------------------------- JSON extraction

test('extractJson parses a plain JSON object', () => {
  const result = extractJson('{"a":1}');
  assert.equal(result.ok, true);
});

test('extractJson unwraps a markdown code fence', () => {
  const result = extractJson('```json\n{"a":1}\n```');
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value, { a: 1 });
});

test('extractJson recovers an object embedded in prose', () => {
  const result = extractJson('Here is my analysis: {"a":1} — hope that helps.');
  assert.equal(result.ok, true);
});

test('extractJson fails on an empty response', () => {
  assert.equal(extractJson('').ok, false);
  assert.equal(extractJson('   ').ok, false);
});

test('extractJson fails on prose with no JSON', () => {
  assert.equal(extractJson('I think you should buy.').ok, false);
});

test('extractJson fails on broken JSON rather than guessing', () => {
  assert.equal(extractJson('{"a": 1,}').ok, false);
  assert.equal(extractJson('{"a": ').ok, false);
});

// ---------------------------------------------------------------- validation

test('validateAIAnalysis accepts a well-formed response', () => {
  const result = validateAIAnalysis(validPayload(), MARKET);
  assert.equal(result.ok, true);
});

test('validateAIAnalysis rejects a non-object', () => {
  assert.equal(validateAIAnalysis('BUY', MARKET).ok, false);
  assert.equal(validateAIAnalysis(null, MARKET).ok, false);
  assert.equal(validateAIAnalysis([1, 2], MARKET).ok, false);
});

test('validateAIAnalysis rejects an invalid signal value', () => {
  const result = validateAIAnalysis(validPayload({ signal: 'STRONG_BUY' }), MARKET);
  assert.equal(result.ok, false);
});

test('validateAIAnalysis rejects missing numeric fields', () => {
  const payload = validPayload();
  delete (payload as any).stopLoss;
  const result = validateAIAnalysis(payload, MARKET);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.includes('stopLoss')));
});

test('validateAIAnalysis rejects a string where a number is required', () => {
  const result = validateAIAnalysis(validPayload({ entry: '100' }), MARKET);
  assert.equal(result.ok, false);
});

test('validateAIAnalysis rejects NaN and Infinity', () => {
  assert.equal(validateAIAnalysis(validPayload({ entry: NaN }), MARKET).ok, false);
  assert.equal(validateAIAnalysis(validPayload({ takeProfit: Infinity }), MARKET).ok, false);
});

test('validateAIAnalysis rejects confidence outside 0-100', () => {
  assert.equal(validateAIAnalysis(validPayload({ confidence: 150 }), MARKET).ok, false);
  assert.equal(validateAIAnalysis(validPayload({ confidence: -5 }), MARKET).ok, false);
});

test('validateAIAnalysis rejects an empty reason', () => {
  assert.equal(validateAIAnalysis(validPayload({ reason: '   ' }), MARKET).ok, false);
});

test('validateAIAnalysis rejects a non-array warnings field', () => {
  assert.equal(validateAIAnalysis(validPayload({ warnings: 'be careful' }), MARKET).ok, false);
});

test('validateAIAnalysis rejects a hallucinated entry price', () => {
  // Model claims entry at 5000 while the market is at 100.
  const result = validateAIAnalysis(validPayload({ entry: 5000 }), MARKET);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.includes('away from the live market price')));
});

test('validateAIAnalysis rejects a BUY whose stop is above entry', () => {
  const result = validateAIAnalysis(
    validPayload({ signal: 'BUY', entry: 100, stopLoss: 105, takeProfit: 110 }),
    MARKET
  );
  assert.equal(result.ok, false);
});

test('validateAIAnalysis rejects a BUY whose target is below entry', () => {
  const result = validateAIAnalysis(
    validPayload({ signal: 'BUY', entry: 100, stopLoss: 95, takeProfit: 98 }),
    MARKET
  );
  assert.equal(result.ok, false);
});

test('validateAIAnalysis rejects a SELL whose stop is below entry', () => {
  const result = validateAIAnalysis(
    validPayload({ signal: 'SELL', entry: 100, stopLoss: 95, takeProfit: 90, trend: 'BEARISH' }),
    MARKET
  );
  assert.equal(result.ok, false);
});

test('validateAIAnalysis accepts a correctly oriented SELL', () => {
  const result = validateAIAnalysis(
    validPayload({ signal: 'SELL', entry: 100, stopLoss: 103, takeProfit: 94, trend: 'BEARISH' }),
    MARKET
  );
  assert.equal(result.ok, true);
});

test('validateAIAnalysis skips level checks for HOLD', () => {
  const result = validateAIAnalysis(
    validPayload({ signal: 'HOLD', entry: 0, stopLoss: 0, takeProfit: 0, riskReward: 0, trend: 'NEUTRAL' }),
    MARKET
  );
  assert.equal(result.ok, true);
});

test('validateAIAnalysis recomputes an incorrect risk/reward', () => {
  // Model claims 1:10 but its own levels imply 1:3.
  const result = validateAIAnalysis(
    validPayload({ entry: 100, stopLoss: 98, takeProfit: 106, riskReward: 10 }),
    MARKET
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.riskReward, 3);
    assert.ok(result.notes.some((n) => n.includes('recalculated')));
  }
});

// ------------------------------------------------------------ signal quality

function analysisWith(overrides: Partial<MarketAnalysis> = {}): MarketAnalysis {
  return {
    instrumentId: 'binance:BTCUSDT',
    displaySymbol: 'BTC/USDT',
    timeframe: '1h',
    price: 100,
    trend: 'BULLISH',
    momentum: 'UP',
    volatility: 'NORMAL',
    volume: 'NORMAL',
    regime: 'TRENDING_UP',
    support: 95,
    resistance: 110,
    indicators: {
      ema20: 101, ema50: 100, ema200: 95, rsi: 60,
      macd: { macd: 1, signal: 0.5, histogram: 0.5 },
      atr: 1, atrPercent: 1, volumeMa20: 100, lastVolume: 100,
      support: 95, resistance: 110,
    },
    technicalScore: 70,
    scoreBreakdown: [],
    candleCount: 250,
    insufficientData: false,
    warnings: [],
    computedAt: Date.now(),
    ...overrides,
  };
}

test('computeSignalQuality blends technical and AI scores', () => {
  const quality = computeSignalQuality(analysisWith(), { signal: 'BUY', confidence: 80 });
  // 70*0.6 + 80*0.4 = 74, +5 for agreement
  assert.equal(quality.finalScore, 79);
});

test('computeSignalQuality penalises AI that contradicts the indicators', () => {
  const agreeing = computeSignalQuality(analysisWith(), { signal: 'BUY', confidence: 80 });
  const opposing = computeSignalQuality(analysisWith(), { signal: 'SELL', confidence: 80 });
  assert.ok(opposing.finalScore < agreeing.finalScore - 15);
});

test('computeSignalQuality penalises insufficient data', () => {
  const full = computeSignalQuality(analysisWith(), { signal: 'BUY', confidence: 80 });
  const thin = computeSignalQuality(
    analysisWith({ insufficientData: true }),
    { signal: 'BUY', confidence: 80 }
  );
  assert.equal(full.finalScore - thin.finalScore, 10);
});

test('computeSignalQuality penalises high volatility and low volume', () => {
  const penalised = computeSignalQuality(
    analysisWith({ regime: 'HIGH_VOLATILITY', volume: 'LOW' }),
    { signal: 'BUY', confidence: 80 }
  );
  assert.ok(penalised.finalScore < 79);
});

test('computeSignalQuality always stays within 0-100', () => {
  const worst = computeSignalQuality(
    analysisWith({ technicalScore: 0, insufficientData: true, regime: 'HIGH_VOLATILITY', volume: 'LOW' }),
    { signal: 'BUY', confidence: 0 }
  );
  const best = computeSignalQuality(
    analysisWith({ technicalScore: 100 }),
    { signal: 'BUY', confidence: 100 }
  );
  assert.ok(worst.finalScore >= 0);
  assert.ok(best.finalScore <= 100);
});
