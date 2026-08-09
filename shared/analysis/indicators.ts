/**
 * Technical analysis engine.
 *
 * Pure functions over candle arrays. Shared by the server (for the AI prompt and
 * the risk engine) and the client (for display), so the number a user sees is the
 * same number that gated their trade.
 *
 * Insufficient-history policy: every indicator returns `null` rather than a
 * plausible-looking fake value when there are not enough candles. Callers must
 * handle null; that is deliberate, because a fabricated EMA200 is worse than none.
 */

import type {
  Candlestick,
  Indicators,
  MarketAnalysis,
  MarketRegime,
  MarketTrend,
  Timeframe,
  VolumeTrend,
} from '../types';

/** Wilder/standard EMA over the full series. Returns null if history < period. */
export function ema(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;

  const k = 2 / (period + 1);
  let acc = 0;
  for (let i = 0; i < period; i++) acc += values[i];
  let value = acc / period; // seed with SMA

  for (let i = period; i < values.length; i++) {
    value = values[i] * k + value * (1 - k);
  }
  return value;
}

/** Full EMA series (needed for MACD signal line). */
export function emaSeries(values: number[], period: number): number[] {
  if (period <= 0 || values.length < period) return [];

  const out: number[] = [];
  const k = 2 / (period + 1);
  let acc = 0;
  for (let i = 0; i < period; i++) acc += values[i];
  let value = acc / period;
  out.push(value);

  for (let i = period; i < values.length; i++) {
    value = values[i] * k + value * (1 - k);
    out.push(value);
  }
  return out;
}

/**
 * Wilder's RSI. Needs period+1 closes minimum.
 * Returns 100 when there are no losses in the window (a real, meaningful edge case).
 */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return round(100 - 100 / (1 + rs), 2);
}

/**
 * MACD(12,26,9).
 *
 * Computed from proper EMA series — the previous implementation recomputed an
 * EMA from scratch for every index, which was both O(n^2) and produced a signal
 * line seeded incorrectly.
 */
export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < slow + signalPeriod) return null;

  const fastSeries = emaSeries(closes, fast);
  const slowSeries = emaSeries(closes, slow);
  if (!fastSeries.length || !slowSeries.length) return null;

  // Align: the fast series starts earlier, so trim its head.
  const offset = fastSeries.length - slowSeries.length;
  const macdLine = slowSeries.map((slowVal, i) => fastSeries[i + offset] - slowVal);

  const signalSeries = emaSeries(macdLine, signalPeriod);
  if (!signalSeries.length) return null;

  const macdValue = macdLine[macdLine.length - 1];
  const signalValue = signalSeries[signalSeries.length - 1];

  return {
    macd: round(macdValue, 6),
    signal: round(signalValue, 6),
    histogram: round(macdValue - signalValue, 6),
  };
}

/** Wilder's ATR. Needs period+1 candles. */
export function atr(candles: Candlestick[], period = 14): number | null {
  if (candles.length < period + 1) return null;

  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  if (trs.length < period) return null;

  let value = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    value = (value * (period - 1) + trs[i]) / period;
  }
  return round(value, 8);
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Support/resistance from swing pivots.
 *
 * Uses fractal highs/lows (a bar higher/lower than `strength` bars on each side)
 * within a lookback window, then picks the nearest level below/above price.
 * Falls back to window extremes when no fractal is found.
 */
export function supportResistance(
  candles: Candlestick[],
  lookback = 60,
  strength = 2
): { support: number | null; resistance: number | null } {
  if (candles.length < strength * 2 + 1) return { support: null, resistance: null };

  const window = candles.slice(-lookback);
  const price = window[window.length - 1].close;

  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = strength; i < window.length - strength; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= strength; j++) {
      if (window[i].high <= window[i - j].high || window[i].high <= window[i + j].high) isHigh = false;
      if (window[i].low >= window[i - j].low || window[i].low >= window[i + j].low) isLow = false;
    }
    if (isHigh) swingHighs.push(window[i].high);
    if (isLow) swingLows.push(window[i].low);
  }

  const below = swingLows.filter((l) => l < price);
  const above = swingHighs.filter((h) => h > price);

  const support = below.length
    ? Math.max(...below)
    : Math.min(...window.map((c) => c.low));
  const resistance = above.length
    ? Math.min(...above)
    : Math.max(...window.map((c) => c.high));

  return { support: round(support, 8), resistance: round(resistance, 8) };
}

export function computeIndicators(candles: Candlestick[]): Indicators {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const price = closes[closes.length - 1] ?? 0;

  const atrValue = atr(candles, 14);
  const { support, resistance } = supportResistance(candles);

  return {
    ema20: nullableRound(ema(closes, 20), 8),
    ema50: nullableRound(ema(closes, 50), 8),
    ema200: nullableRound(ema(closes, 200), 8),
    rsi: rsi(closes, 14),
    macd: macd(closes),
    atr: atrValue,
    atrPercent: atrValue !== null && price > 0 ? round((atrValue / price) * 100, 3) : null,
    volumeMa20: nullableRound(sma(volumes, 20), 4),
    lastVolume: volumes[volumes.length - 1] ?? null,
    support,
    resistance,
  };
}

/**
 * Classifies the market regime from indicators alone.
 * Volatility is checked first because a violently volatile market should be
 * labelled as such even when it happens to be drifting upward.
 */
export function detectRegime(ind: Indicators, price: number): MarketRegime {
  const atrPct = ind.atrPercent;

  if (atrPct !== null && atrPct >= 4) return 'HIGH_VOLATILITY';
  if (atrPct !== null && atrPct <= 0.4) return 'LOW_VOLATILITY';

  const { ema20, ema50, ema200 } = ind;
  if (ema20 !== null && ema50 !== null) {
    const longOk = ema200 === null || ema50 > ema200;
    const longBear = ema200 === null || ema50 < ema200;
    // Require price confirmation so a flat crossover is not called a trend.
    if (ema20 > ema50 && longOk && price > ema20) return 'TRENDING_UP';
    if (ema20 < ema50 && longBear && price < ema20) return 'TRENDING_DOWN';
  }

  return 'RANGING';
}

function classifyTrend(ind: Indicators, price: number): MarketTrend {
  const { ema20, ema50, ema200 } = ind;
  let score = 0;

  if (ema20 !== null && ema50 !== null) score += ema20 > ema50 ? 1 : -1;
  if (ema50 !== null && ema200 !== null) score += ema50 > ema200 ? 1 : -1;
  if (ema50 !== null) score += price > ema50 ? 1 : -1;

  if (score >= 2) return 'BULLISH';
  if (score <= -2) return 'BEARISH';
  return 'NEUTRAL';
}

function classifyMomentum(ind: Indicators): MarketAnalysis['momentum'] {
  const r = ind.rsi;
  const hist = ind.macd?.histogram ?? null;
  if (r === null && hist === null) return 'FLAT';

  let score = 0;
  if (r !== null) {
    if (r >= 65) score += 2;
    else if (r >= 55) score += 1;
    else if (r <= 35) score -= 2;
    else if (r <= 45) score -= 1;
  }
  if (hist !== null) score += hist > 0 ? 1 : hist < 0 ? -1 : 0;

  if (score >= 3) return 'STRONG_UP';
  if (score >= 1) return 'UP';
  if (score <= -3) return 'STRONG_DOWN';
  if (score <= -1) return 'DOWN';
  return 'FLAT';
}

function classifyVolatility(ind: Indicators): 'HIGH' | 'NORMAL' | 'LOW' {
  const p = ind.atrPercent;
  if (p === null) return 'NORMAL';
  if (p >= 3) return 'HIGH';
  if (p <= 0.6) return 'LOW';
  return 'NORMAL';
}

function classifyVolume(ind: Indicators): VolumeTrend {
  if (ind.volumeMa20 === null || ind.lastVolume === null || ind.volumeMa20 === 0) return 'NORMAL';
  const ratio = ind.lastVolume / ind.volumeMa20;
  if (ratio >= 1.5) return 'HIGH';
  if (ratio <= 0.6) return 'LOW';
  return 'NORMAL';
}

/**
 * Deterministic 0-100 technical score.
 *
 * Starts neutral at 50 and applies bounded adjustments, so a missing indicator
 * simply contributes nothing instead of skewing the result.
 */
export function computeTechnicalScore(
  ind: Indicators,
  price: number
): { score: number; breakdown: Array<{ label: string; points: number }> } {
  const breakdown: Array<{ label: string; points: number }> = [];
  let score = 50;

  const add = (label: string, points: number) => {
    score += points;
    breakdown.push({ label, points });
  };

  // Trend structure (max +/-20)
  const { ema20, ema50, ema200 } = ind;
  if (ema20 !== null && ema50 !== null && ema200 !== null) {
    if (ema20 > ema50 && ema50 > ema200) add('Full bullish EMA stack (20>50>200)', 20);
    else if (ema20 < ema50 && ema50 < ema200) add('Full bearish EMA stack (20<50<200)', -20);
    else if (ema20 > ema50) add('Short-term EMA above medium-term', 8);
    else add('Short-term EMA below medium-term', -8);
  } else if (ema20 !== null && ema50 !== null) {
    add(ema20 > ema50 ? 'EMA20 above EMA50 (limited history)' : 'EMA20 below EMA50 (limited history)',
      ema20 > ema50 ? 8 : -8);
  }

  // Price vs medium trend (max +/-8)
  if (ema50 !== null) {
    add(price > ema50 ? 'Price trading above EMA50' : 'Price trading below EMA50', price > ema50 ? 8 : -8);
  }

  // Momentum: RSI (max +/-12)
  if (ind.rsi !== null) {
    const r = ind.rsi;
    if (r >= 70) add(`RSI overbought (${r})`, -10);
    else if (r >= 55) add(`RSI bullish (${r})`, 12);
    else if (r > 45) add(`RSI neutral (${r})`, 0);
    else if (r > 30) add(`RSI bearish (${r})`, -12);
    else add(`RSI oversold (${r})`, 10);
  }

  // Momentum: MACD (max +/-10)
  if (ind.macd) {
    const h = ind.macd.histogram;
    if (h > 0) add('MACD histogram positive', 10);
    else if (h < 0) add('MACD histogram negative', -10);
  }

  // Volume confirmation (max +/-6)
  const vol = classifyVolume(ind);
  if (vol === 'HIGH') add('Volume above 20-period average', 6);
  else if (vol === 'LOW') add('Volume below average (weak conviction)', -6);

  // Volatility penalty — extreme ATR makes any signal less reliable.
  if (ind.atrPercent !== null && ind.atrPercent >= 4) {
    add(`Extreme volatility (ATR ${ind.atrPercent}% of price)`, -10);
  }

  return { score: clamp(round(score, 1), 0, 100), breakdown };
}

/** Builds the full normalized analysis object from raw candles. */
export function analyzeMarket(
  candles: Candlestick[],
  instrumentId: string,
  displaySymbol: string,
  timeframe: Timeframe
): MarketAnalysis {
  const warnings: string[] = [];
  const price = candles[candles.length - 1]?.close ?? 0;
  const ind = computeIndicators(candles);

  if (candles.length < 200) {
    warnings.push(
      `Only ${candles.length} candles available; long-term indicators (EMA200) may be unavailable.`
    );
  }
  if (ind.ema200 === null) warnings.push('EMA200 unavailable — insufficient candle history.');
  if (ind.macd === null) warnings.push('MACD unavailable — insufficient candle history.');
  if (ind.rsi === null) warnings.push('RSI unavailable — insufficient candle history.');
  if (ind.atr === null) warnings.push('ATR unavailable — volatility could not be measured.');

  const { score, breakdown } = computeTechnicalScore(ind, price);

  return {
    instrumentId,
    displaySymbol,
    timeframe,
    price,
    trend: classifyTrend(ind, price),
    momentum: classifyMomentum(ind),
    volatility: classifyVolatility(ind),
    volume: classifyVolume(ind),
    regime: detectRegime(ind, price),
    support: ind.support,
    resistance: ind.resistance,
    indicators: ind,
    technicalScore: score,
    scoreBreakdown: breakdown,
    candleCount: candles.length,
    // 60 candles is the practical floor for RSI+MACD to both be meaningful.
    insufficientData: candles.length < 60,
    warnings,
    computedAt: Date.now(),
  };
}

// ------------------------------------------------------------------ helpers

function round(value: number, dp: number): number {
  const f = Math.pow(10, dp);
  return Math.round(value * f) / f;
}

function nullableRound(value: number | null, dp: number): number | null {
  return value === null ? null : round(value, dp);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
