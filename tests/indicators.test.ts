/**
 * Unit tests for the technical analysis engine.
 *
 * Focus: correctness of the maths and, critically, the insufficient-history
 * behaviour — an indicator must return null rather than a plausible fake value.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeMarket,
  atr,
  computeIndicators,
  detectRegime,
  ema,
  macd,
  rsi,
  sma,
  supportResistance,
} from '../shared/analysis/indicators';
import type { Candlestick } from '../shared/types';

function candle(close: number, i: number, high?: number, low?: number, volume = 100): Candlestick {
  return {
    time: 1_700_000_000 + i * 3600,
    open: close,
    high: high ?? close * 1.01,
    low: low ?? close * 0.99,
    close,
    volume,
    closed: true,
  };
}

function series(values: number[]): Candlestick[] {
  return values.map((v, i) => candle(v, i));
}

// ------------------------------------------------------------------------ EMA

test('ema returns null when history is shorter than the period', () => {
  assert.equal(ema([1, 2, 3], 5), null);
  assert.equal(ema([], 20), null);
});

test('ema of a constant series equals that constant', () => {
  const result = ema(new Array(50).fill(10), 20);
  assert.ok(result !== null);
  assert.ok(Math.abs(result! - 10) < 1e-9);
});

test('ema reacts to a recent move faster than a simple average', () => {
  // A perfectly linear ramp is a poor discriminator: EMA and SMA both lag by
  // exactly (period-1)/2 and coincide. Use a step change instead, where the
  // faster weighting of the EMA is the distinguishing property.
  const values = [...new Array(40).fill(100), ...new Array(5).fill(200)];
  const emaValue = ema(values, 20)!;
  const smaValue = sma(values, 20)!;
  assert.ok(emaValue > smaValue, `expected EMA ${emaValue} > SMA ${smaValue}`);
});

test('ema tracks a linear ramp with the expected lag', () => {
  const values = Array.from({ length: 60 }, (_, i) => i + 1);
  const emaValue = ema(values, 20)!;
  // For a unit-slope ramp the EMA settles (period-1)/2 = 9.5 behind the last value.
  assert.ok(Math.abs(emaValue - (60 - 9.5)) < 0.5, `unexpected EMA ${emaValue}`);
});

// ------------------------------------------------------------------------ RSI

test('rsi returns null without period+1 candles', () => {
  assert.equal(rsi([1, 2, 3], 14), null);
  assert.equal(rsi(new Array(14).fill(1), 14), null);
});

test('rsi is 100 for a series that only rises', () => {
  const values = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(rsi(values, 14), 100);
});

test('rsi is 0 for a series that only falls', () => {
  const values = Array.from({ length: 30 }, (_, i) => 100 - i);
  assert.equal(rsi(values, 14), 0);
});

test('rsi of a flat series is neutral', () => {
  assert.equal(rsi(new Array(30).fill(50), 14), 50);
});

test('rsi stays within 0-100 on volatile data', () => {
  const values = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i) * 20);
  const value = rsi(values, 14)!;
  assert.ok(value >= 0 && value <= 100);
});

// ----------------------------------------------------------------------- MACD

test('macd returns null without enough history', () => {
  assert.equal(macd(new Array(30).fill(10)), null);
});

test('macd of a constant series is zero', () => {
  const result = macd(new Array(100).fill(42));
  assert.ok(result !== null);
  assert.ok(Math.abs(result!.macd) < 1e-6);
  assert.ok(Math.abs(result!.histogram) < 1e-6);
});

test('macd is positive for a consistently rising series', () => {
  const values = Array.from({ length: 120 }, (_, i) => 100 + i * 2);
  const result = macd(values)!;
  assert.ok(result.macd > 0, `expected positive MACD, got ${result.macd}`);
});

test('macd histogram equals macd minus signal', () => {
  const values = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 5) * 10);
  const result = macd(values)!;
  assert.ok(Math.abs(result.histogram - (result.macd - result.signal)) < 1e-6);
});

// ------------------------------------------------------------------------ ATR

test('atr returns null without period+1 candles', () => {
  assert.equal(atr(series([1, 2, 3]), 14), null);
});

test('atr of a flat market is zero', () => {
  const flat = Array.from({ length: 30 }, (_, i) => ({
    ...candle(100, i),
    high: 100,
    low: 100,
    open: 100,
  }));
  assert.equal(atr(flat, 14), 0);
});

test('atr grows with wider candle ranges', () => {
  const narrow = Array.from({ length: 30 }, (_, i) => candle(100, i, 101, 99));
  const wide = Array.from({ length: 30 }, (_, i) => candle(100, i, 110, 90));
  assert.ok(atr(wide, 14)! > atr(narrow, 14)!);
});

// -------------------------------------------------------- support/resistance

test('supportResistance places support below and resistance above price', () => {
  const values = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 3) * 10);
  const { support, resistance } = supportResistance(series(values));
  const price = values[values.length - 1];

  assert.ok(support !== null && resistance !== null);
  assert.ok(support! <= price, `support ${support} should be <= price ${price}`);
  assert.ok(resistance! >= price, `resistance ${resistance} should be >= price ${price}`);
});

test('supportResistance handles very short input without throwing', () => {
  const result = supportResistance(series([1, 2]));
  assert.equal(result.support, null);
  assert.equal(result.resistance, null);
});

// ----------------------------------------------------------------- indicators

test('computeIndicators reports nulls rather than fabricated values', () => {
  const ind = computeIndicators(series([100, 101, 102]));
  assert.equal(ind.ema20, null);
  assert.equal(ind.ema200, null);
  assert.equal(ind.rsi, null);
  assert.equal(ind.macd, null);
  assert.equal(ind.atr, null);
});

test('computeIndicators populates values with sufficient history', () => {
  const values = Array.from({ length: 250 }, (_, i) => 100 + i * 0.5);
  const ind = computeIndicators(series(values));
  assert.ok(ind.ema20 !== null);
  assert.ok(ind.ema50 !== null);
  assert.ok(ind.ema200 !== null);
  assert.ok(ind.rsi !== null);
  assert.ok(ind.macd !== null);
  assert.ok(ind.atr !== null);
  assert.ok(ind.atrPercent !== null);
});

test('computeIndicators does not throw on an empty array', () => {
  const ind = computeIndicators([]);
  assert.equal(ind.ema20, null);
  assert.equal(ind.lastVolume, null);
});

// --------------------------------------------------------------------- regime

test('detectRegime flags high volatility ahead of trend', () => {
  const regime = detectRegime(
    {
      ema20: 110, ema50: 100, ema200: 90,
      rsi: 60, macd: null, atr: 10, atrPercent: 8,
      volumeMa20: null, lastVolume: null, support: null, resistance: null,
    },
    100
  );
  assert.equal(regime, 'HIGH_VOLATILITY');
});

test('detectRegime identifies an uptrend', () => {
  const regime = detectRegime(
    {
      ema20: 110, ema50: 100, ema200: 90,
      rsi: 60, macd: null, atr: 1, atrPercent: 1,
      volumeMa20: null, lastVolume: null, support: null, resistance: null,
    },
    115
  );
  assert.equal(regime, 'TRENDING_UP');
});

test('detectRegime falls back to ranging when structure is unclear', () => {
  const regime = detectRegime(
    {
      ema20: 100, ema50: 100.5, ema200: 100.2,
      rsi: 50, macd: null, atr: 1, atrPercent: 1,
      volumeMa20: null, lastVolume: null, support: null, resistance: null,
    },
    100
  );
  assert.equal(regime, 'RANGING');
});

// ------------------------------------------------------------------ analysis

test('analyzeMarket flags insufficient data and stays in range', () => {
  const result = analyzeMarket(series([100, 101, 102, 103]), 'binance:BTCUSDT', 'BTC/USDT', '1h');
  assert.equal(result.insufficientData, true);
  assert.ok(result.warnings.length > 0);
  assert.ok(result.technicalScore >= 0 && result.technicalScore <= 100);
});

test('analyzeMarket scores a strong uptrend above neutral', () => {
  const values = Array.from({ length: 250 }, (_, i) => 100 + i);
  const result = analyzeMarket(series(values), 'binance:BTCUSDT', 'BTCUSDT', '1h');
  assert.equal(result.trend, 'BULLISH');
  assert.ok(result.technicalScore > 50, `expected bullish score, got ${result.technicalScore}`);
  assert.equal(result.insufficientData, false);
});

test('analyzeMarket scores a strong downtrend below neutral', () => {
  const values = Array.from({ length: 250 }, (_, i) => 400 - i);
  const result = analyzeMarket(series(values), 'binance:BTCUSDT', 'BTCUSDT', '1h');
  assert.equal(result.trend, 'BEARISH');
  assert.ok(result.technicalScore < 50, `expected bearish score, got ${result.technicalScore}`);
});

test('analyzeMarket keeps the score clamped to 0-100', () => {
  for (const generator of [
    (i: number) => 100 + i * 10,
    (i: number) => 5000 - i * 20,
    (i: number) => 100 + Math.sin(i) * 50,
  ]) {
    const values = Array.from({ length: 250 }, (_, i) => Math.max(1, generator(i)));
    const result = analyzeMarket(series(values), 'binance:TESTUSDT', 'TESTUSDT', '1h');
    assert.ok(result.technicalScore >= 0 && result.technicalScore <= 100);
  }
});
