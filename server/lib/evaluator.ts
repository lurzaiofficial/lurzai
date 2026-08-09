/**
 * Retrospective signal evaluation.
 *
 * Purely analytical: it labels past signals so the user can judge whether the
 * advice has actually been useful. It deliberately does NOT feed back into how
 * signals are generated — adapting strategy from a handful of samples is
 * overfitting, not learning.
 */

import { getProvider } from '../providers';
import { resolveInstrument } from '../providers';
import { logger } from './logger';
import { store } from './store';
import type { SignalRecord, Timeframe } from '../../shared/types';

/** Minimum time a signal must age before it can be judged. */
const HORIZON_MS: Record<Timeframe, number> = {
  '1m': 30 * 60 * 1000,
  '5m': 2 * 60 * 60 * 1000,
  '15m': 6 * 60 * 60 * 1000,
  '1h': 24 * 60 * 60 * 1000,
  '4h': 3 * 24 * 60 * 60 * 1000,
  '1d': 7 * 24 * 60 * 60 * 1000,
};

/**
 * Replays candles after the signal to see which level was reached first.
 *
 * When both levels fall inside a single candle the result is NEUTRAL, not a
 * guess: intrabar ordering is genuinely unknowable from OHLC data.
 */
export async function evaluateSignal(signal: SignalRecord): Promise<SignalRecord | null> {
  if (signal.ai.signal === 'HOLD') {
    return store.updateSignal(signal.id, {
      outcome: 'NEUTRAL',
      outcomeCheckedAt: Date.now(),
      outcomeNote: 'HOLD signals are not scored as correct or incorrect.',
    });
  }

  const horizon = HORIZON_MS[signal.timeframe] ?? 24 * 60 * 60 * 1000;
  if (Date.now() - signal.timestamp < horizon) return null; // too early to judge

  let candles;
  try {
    const instrument = await resolveInstrument(signal.instrumentId);
    const provider = getProvider(instrument.provider);
    candles = await provider.getCandles(instrument, signal.timeframe, 500);
  } catch (err) {
    logger.warn('evaluator: could not fetch candles', { signalId: signal.id, err });
    return null;
  }

  const after = candles.filter((c) => c.time * 1000 > signal.timestamp && c.closed);
  if (after.length === 0) return null;

  const { stopLoss, takeProfit, signal: direction, entry } = signal.ai;
  const pct = (price: number) =>
    entry > 0
      ? Number(
          (((direction === 'BUY' ? price - entry : entry - price) / entry) * 100).toFixed(3)
        )
      : 0;

  for (const candle of after) {
    const hitTp = direction === 'BUY' ? candle.high >= takeProfit : candle.low <= takeProfit;
    const hitSl = direction === 'BUY' ? candle.low <= stopLoss : candle.high >= stopLoss;

    if (hitTp && hitSl) {
      return store.updateSignal(signal.id, {
        outcome: 'NEUTRAL',
        outcomeCheckedAt: Date.now(),
        outcomeNote:
          'Both the take profit and the stop loss were touched within the same candle, so the true order cannot be determined from the data.',
      });
    }
    if (hitTp) {
      return store.updateSignal(signal.id, {
        outcome: 'CORRECT',
        outcomeCheckedAt: Date.now(),
        outcomePercent: pct(takeProfit),
        outcomeNote: `Take profit at ${takeProfit} was reached on ${new Date(candle.time * 1000).toISOString().slice(0, 16).replace('T', ' ')}.`,
      });
    }
    if (hitSl) {
      return store.updateSignal(signal.id, {
        outcome: 'INCORRECT',
        outcomeCheckedAt: Date.now(),
        outcomePercent: pct(stopLoss),
        outcomeNote: `Stop loss at ${stopLoss} was reached on ${new Date(candle.time * 1000).toISOString().slice(0, 16).replace('T', ' ')}.`,
      });
    }
  }

  const last = after[after.length - 1];
  return store.updateSignal(signal.id, {
    outcome: 'NEUTRAL',
    outcomeCheckedAt: Date.now(),
    outcomePercent: pct(last.close),
    outcomeNote: 'Neither the take profit nor the stop loss was reached within the evaluation window.',
  });
}

/** Evaluates all pending signals for a user. Failures are isolated per signal. */
export async function evaluatePendingSignals(userId: string): Promise<number> {
  const pending = store
    .listSignals(userId, 200)
    .filter((s) => !s.outcome || s.outcome === 'PENDING');

  let updated = 0;
  for (const signal of pending) {
    try {
      if (await evaluateSignal(signal)) updated++;
    } catch (err) {
      logger.warn('evaluator: signal evaluation failed', { signalId: signal.id, err });
    }
  }
  return updated;
}
