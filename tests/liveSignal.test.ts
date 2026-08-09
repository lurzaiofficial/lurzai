/**
 * Unit tests for live signal re-evaluation.
 *
 * The plan (entry/stop/target) is immutable once issued. What these tests pin
 * down is the OTHER half: correctly reporting when that plan has stopped being
 * worth acting on, so the UI never shows a stale "TAKE" on a dead setup.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveLifecycle, evaluateLive } from '../server/lib/advice';
import {
  DEFAULT_SERVER_SETTINGS,
  type AIAnalysis,
  type MarketAnalysis,
  type SignalRecord,
} from '../shared/types';

const ANALYSIS: MarketAnalysis = {
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
    atr: 2, atrPercent: 2, volumeMa20: 100, lastVolume: 100,
    support: 95, resistance: 110,
  },
  technicalScore: 75,
  scoreBreakdown: [],
  candleCount: 300,
  insufficientData: false,
  warnings: [],
  computedAt: Date.now(),
};

function makeSignal(ai: Partial<AIAnalysis> = {}, ageMs = 0): SignalRecord {
  const full: AIAnalysis = {
    signal: 'BUY',
    confidence: 80,
    trend: 'BULLISH',
    entry: 100,
    stopLoss: 96,
    takeProfit: 112,
    riskReward: 3,
    durationMinutes: 60,
    reason: 'test',
    warnings: [],
    ...ai,
  };

  return {
    id: 'sig_test',
    userId: 'u',
    timestamp: Date.now() - ageMs,
    instrumentId: 'binance:BTCUSDT',
    provider: 'binance',
    displaySymbol: 'BTC/USDT',
    assetClass: 'CRYPTO',
    timeframe: '1h',
    priceAtSignal: full.entry,
    currency: 'USDT',
    ai: full,
    analysis: ANALYSIS,
    quality: { technicalScore: 75, aiConfidence: 80, finalScore: 82, components: [] },
    advice: {
      verdict: 'TAKE',
      headline: 'Valid BUY setup',
      summary: '',
      checks: [],
      sizing: {
        stopDistancePercent: 4,
        targetDistancePercent: 12,
        riskReward: 3,
        positionPercentOfAccount: 25,
        note: '',
      },
      warnings: [],
    },
    tracked: false,
    outcome: 'PENDING',
  };
}

// ------------------------------------------------------------------- valid

test('a signal at its entry price is VALID', () => {
  const { lifecycle } = deriveLifecycle({ signal: makeSignal(), currentPrice: 100 });
  assert.equal(lifecycle, 'VALID');
});

test('small drift toward the stop stays VALID', () => {
  // 1 point of a 4-point risk = 25%, under the 50% threshold.
  const { lifecycle } = deriveLifecycle({ signal: makeSignal(), currentPrice: 99 });
  assert.equal(lifecycle, 'VALID');
});

test('small drift toward the target stays VALID', () => {
  // 3 points of a 12-point reward = 25%, under the 33% threshold.
  const { lifecycle } = deriveLifecycle({ signal: makeSignal(), currentPrice: 103 });
  assert.equal(lifecycle, 'VALID');
});

// ------------------------------------------------------------- terminal states

test('price reaching the stop marks the signal INVALIDATED', () => {
  const { lifecycle, statusNote } = deriveLifecycle({ signal: makeSignal(), currentPrice: 96 });
  assert.equal(lifecycle, 'INVALIDATED');
  assert.match(statusNote, /no longer valid/i);
});

test('price below the stop is also INVALIDATED', () => {
  const { lifecycle } = deriveLifecycle({ signal: makeSignal(), currentPrice: 90 });
  assert.equal(lifecycle, 'INVALIDATED');
});

test('price reaching the target marks the signal TARGET_HIT', () => {
  const { lifecycle, statusNote } = deriveLifecycle({ signal: makeSignal(), currentPrice: 112 });
  assert.equal(lifecycle, 'TARGET_HIT');
  assert.match(statusNote, /chasing/i);
});

test('a SELL signal inverts the stop and target checks', () => {
  const short = makeSignal({ signal: 'SELL', entry: 100, stopLoss: 104, takeProfit: 88 });

  assert.equal(deriveLifecycle({ signal: short, currentPrice: 104 }).lifecycle, 'INVALIDATED');
  assert.equal(deriveLifecycle({ signal: short, currentPrice: 88 }).lifecycle, 'TARGET_HIT');
  assert.equal(deriveLifecycle({ signal: short, currentPrice: 100 }).lifecycle, 'VALID');
});

test('an aged signal EXPIRES', () => {
  // 60-minute horizon, 90 minutes old.
  const old = makeSignal({}, 90 * 60_000);
  const { lifecycle, statusNote } = deriveLifecycle({ signal: old, currentPrice: 100 });
  assert.equal(lifecycle, 'EXPIRED');
  assert.match(statusNote, /90 minutes old/);
});

test('a timed trade window EXPIRES at endsAt even if AI duration differs', () => {
  const signal = makeSignal({ durationMinutes: 999 });
  signal.tradeIntent = {
    windowMinutes: 15,
    endsAt: Date.now() - 1_000,
    sizeAmount: 100,
    sizeUnit: 'QUOTE',
    status: 'ACTIVE',
  };
  const { lifecycle, statusNote } = deriveLifecycle({ signal, currentPrice: 100 });
  assert.equal(lifecycle, 'EXPIRED');
  assert.match(statusNote, /trade window has ended/i);
});

test('an active trade window keeps the signal VALID before endsAt', () => {
  const signal = makeSignal({ durationMinutes: 1 });
  signal.tradeIntent = {
    windowMinutes: 60,
    endsAt: Date.now() + 30 * 60_000,
    sizeAmount: 5,
    sizeUnit: 'PERCENT',
    status: 'ACTIVE',
  };
  // Signal is "old" vs AI durationMinutes=1, but user window still open.
  signal.timestamp = Date.now() - 5 * 60_000;
  assert.equal(deriveLifecycle({ signal, currentPrice: 100 }).lifecycle, 'VALID');
});

test('terminal outcomes take priority over expiry', () => {
  // Old AND stopped out: the stop is the more important fact.
  const old = makeSignal({}, 999 * 60_000);
  assert.equal(deriveLifecycle({ signal: old, currentPrice: 96 }).lifecycle, 'INVALIDATED');
});

// -------------------------------------------------------------- entry missed

test('drifting more than half the risk marks ENTRY_MISSED', () => {
  // 2.5 of a 4-point risk = 62.5%, over the 50% threshold.
  const { lifecycle, statusNote } = deriveLifecycle({ signal: makeSignal(), currentPrice: 97.5 });
  assert.equal(lifecycle, 'ENTRY_MISSED');
  assert.match(statusNote, /before entry/i);
});

test('running more than a third toward the target marks ENTRY_MISSED', () => {
  // 5 of a 12-point reward = 42%, over the 33% threshold.
  const { lifecycle, statusNote } = deriveLifecycle({ signal: makeSignal(), currentPrice: 105 });
  assert.equal(lifecycle, 'ENTRY_MISSED');
  assert.match(statusNote, /worse risk\/reward/i);
});

test('HOLD signals report the HOLD lifecycle', () => {
  const hold = makeSignal({ signal: 'HOLD', entry: 0, stopLoss: 0, takeProfit: 0 });
  assert.equal(deriveLifecycle({ signal: hold, currentPrice: 100 }).lifecycle, 'HOLD');
});

// ------------------------------------------------------------- evaluateLive

function live(currentPrice: number, ageMs = 0) {
  return evaluateLive({
    signal: makeSignal({}, ageMs),
    currentPrice,
    analysis: ANALYSIS,
    settings: DEFAULT_SERVER_SETTINGS,
    marketDataAgeSeconds: 1,
    todaySignals: [],
    lastTrackedAt: null,
  });
}

test('evaluateLive keeps a valid setup actionable', () => {
  const result = live(100);
  assert.equal(result.lifecycle, 'VALID');
  assert.notEqual(result.advice.verdict, 'AVOID');
});

test('evaluateLive forces AVOID once a signal is invalidated', () => {
  const result = live(95);
  assert.equal(result.lifecycle, 'INVALIDATED');
  assert.equal(result.advice.verdict, 'AVOID');
  assert.equal(result.advice.headline, 'Signal invalidated');
  // The reason must be surfaced as a failed check, not buried.
  assert.ok(result.advice.checks.some((c) => c.code === 'LIFECYCLE' && !c.passed));
});

test('evaluateLive forces AVOID once the target is hit', () => {
  const result = live(115);
  assert.equal(result.lifecycle, 'TARGET_HIT');
  assert.equal(result.advice.verdict, 'AVOID');
});

test('evaluateLive computes movement relative to entry', () => {
  const result = live(105);
  assert.equal(result.currentPrice, 105);
  assert.equal(result.movePercent, 5);      // +5 from an entry of 100
  assert.equal(result.driftPercent, 5);
});

test('movePercent is positive when a short moves down', () => {
  const short = makeSignal({ signal: 'SELL', entry: 100, stopLoss: 104, takeProfit: 88 });
  const result = evaluateLive({
    signal: short,
    currentPrice: 98,
    analysis: ANALYSIS,
    settings: DEFAULT_SERVER_SETTINGS,
    marketDataAgeSeconds: 1,
    todaySignals: [],
    lastTrackedAt: null,
  });
  // Price fell, which favours a short, so the move is positive.
  assert.equal(result.movePercent, 2);
  assert.equal(result.driftPercent, -2); // raw price change is still negative
});

test('progress toward the target is reported as a percentage', () => {
  // 6 of a 12-point reward = 50%.
  assert.equal(live(106).progressPercent, 50);
  // Moving against the trade reports negative progress.
  assert.ok((live(98).progressPercent ?? 0) < 0);
});

test('evaluateLive never emits non-finite numbers', () => {
  // A degenerate plan where entry, stop and target coincide.
  const degenerate = makeSignal({ entry: 0, stopLoss: 0, takeProfit: 0 });
  const result = evaluateLive({
    signal: degenerate,
    currentPrice: 100,
    analysis: ANALYSIS,
    settings: DEFAULT_SERVER_SETTINGS,
    marketDataAgeSeconds: 1,
    todaySignals: [],
    lastTrackedAt: null,
  });

  assert.ok(Number.isFinite(result.driftPercent));
  assert.ok(Number.isFinite(result.movePercent));
  assert.ok(result.progressPercent === null || Number.isFinite(result.progressPercent));
});

test('evaluateLive reflects stale market data in the verdict', () => {
  const result = evaluateLive({
    signal: makeSignal(),
    currentPrice: 100,
    analysis: ANALYSIS,
    settings: DEFAULT_SERVER_SETTINGS,
    marketDataAgeSeconds: 9999, // far beyond the configured limit
    todaySignals: [],
    lastTrackedAt: null,
  });

  const freshness = result.advice.checks.find((c) => c.code === 'DATA_FRESHNESS');
  assert.ok(freshness);
  assert.equal(freshness!.passed, false);
  assert.equal(result.advice.verdict, 'AVOID');
});

test('age is reported from the signal timestamp', () => {
  const result = live(100, 5 * 60_000);
  assert.ok(result.ageMs >= 5 * 60_000 - 1000);
  assert.ok(result.ageMs <= 5 * 60_000 + 1000);
});
