/**
 * Signal tracking.
 *
 * When a user chooses to follow a signal, this records a JOURNAL ENTRY. The
 * application never opened a position, holds no funds, and places no orders —
 * it simply watches the price so the user can later see whether the signal was
 * right. All results are expressed as percentages, never currency amounts,
 * because we do not know what the user actually risked.
 */

import crypto from 'node:crypto';
import { logger } from './logger';
import { store } from './store';
import type {
  Direction,
  SignalRecord,
  SignalStats,
  TrackedSignal,
} from '../../shared/types';

function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/** Starts tracking a signal the user has decided to follow. */
export function trackSignal(signal: SignalRecord, note?: string): TrackedSignal {
  const direction: Direction = signal.ai.signal === 'SELL' ? 'SHORT' : 'LONG';

  const tracked: TrackedSignal = {
    id: id('track'),
    userId: signal.userId,
    signalId: signal.id,
    instrumentId: signal.instrumentId,
    displaySymbol: signal.displaySymbol,
    provider: signal.provider,
    assetClass: signal.assetClass,
    direction,
    entryPrice: signal.ai.entry,
    stopLoss: signal.ai.stopLoss,
    takeProfit: signal.ai.takeProfit,
    currency: signal.currency,
    timeframe: signal.timeframe,
    openedAt: Date.now(),
    status: 'ACTIVE',
    note,
    aiConfidence: signal.ai.confidence,
    technicalScore: signal.analysis.technicalScore,
    finalScore: signal.quality.finalScore,
  };

  store.insertTracked(tracked);
  store.updateSignal(signal.id, { tracked: true });

  logger.info('tracking: signal followed', {
    trackedId: tracked.id,
    instrument: tracked.instrumentId,
    direction,
    entry: tracked.entryPrice,
  });

  return tracked;
}

/** Percentage move in the direction of the trade. */
export function computeResultPercent(
  direction: Direction,
  entryPrice: number,
  exitPrice: number
): number {
  if (entryPrice <= 0) return 0;
  const raw = ((exitPrice - entryPrice) / entryPrice) * 100;
  return Number((direction === 'LONG' ? raw : -raw).toFixed(3));
}

/**
 * Checks a tracked signal against the live price and resolves it if a level
 * was reached. Returns the updated record, or null if it is still running.
 */
export function checkTrackedSignal(
  tracked: TrackedSignal,
  currentPrice: number
): TrackedSignal | null {
  if (tracked.status !== 'ACTIVE') return null;

  const hitStop =
    tracked.direction === 'LONG'
      ? currentPrice <= tracked.stopLoss
      : currentPrice >= tracked.stopLoss;

  const hitTarget =
    tracked.direction === 'LONG'
      ? currentPrice >= tracked.takeProfit
      : currentPrice <= tracked.takeProfit;

  if (!hitStop && !hitTarget) return null;

  const exitPrice = hitTarget ? tracked.takeProfit : tracked.stopLoss;

  const updated = store.updateTracked(tracked.id, {
    status: hitTarget ? 'HIT_TARGET' : 'HIT_STOP',
    closedAt: Date.now(),
    closePrice: exitPrice,
    resultPercent: computeResultPercent(tracked.direction, tracked.entryPrice, exitPrice),
  });

  // Keep the originating signal's outcome in step with the tracked result.
  store.updateSignal(tracked.signalId, {
    outcome: hitTarget ? 'CORRECT' : 'INCORRECT',
    outcomeCheckedAt: Date.now(),
    outcomePercent: updated?.resultPercent,
    outcomeNote: hitTarget
      ? `Take profit at ${tracked.takeProfit} was reached.`
      : `Stop loss at ${tracked.stopLoss} was reached.`,
  });

  logger.info('tracking: signal resolved', {
    trackedId: tracked.id,
    outcome: hitTarget ? 'HIT_TARGET' : 'HIT_STOP',
    resultPercent: updated?.resultPercent,
  });

  return updated;
}

/** Closes a tracked signal early at the user's request. */
export function closeTracked(
  tracked: TrackedSignal,
  currentPrice: number
): TrackedSignal | null {
  const resultPercent = computeResultPercent(tracked.direction, tracked.entryPrice, currentPrice);

  const updated = store.updateTracked(tracked.id, {
    status: 'CLOSED_MANUALLY',
    closedAt: Date.now(),
    closePrice: currentPrice,
    resultPercent,
  });

  store.updateSignal(tracked.signalId, {
    // A manual exit is not evidence the signal itself was right or wrong.
    outcome: 'NEUTRAL',
    outcomeCheckedAt: Date.now(),
    outcomePercent: resultPercent,
    outcomeNote: `Closed manually at ${currentPrice} for ${resultPercent > 0 ? '+' : ''}${resultPercent}%.`,
  });

  logger.info('tracking: signal closed manually', {
    trackedId: tracked.id,
    resultPercent,
  });

  return updated;
}

/**
 * Aggregate statistics across resolved signals.
 * Percentages only — the app never knows position sizes.
 */
export function computeStats(userId: string): SignalStats {
  const signals = store.listSignals(userId, 1000);
  const tracked = store.listTracked(userId);

  const resolved = tracked
    .filter((t) => t.status !== 'ACTIVE' && typeof t.resultPercent === 'number')
    .sort((a, b) => (a.closedAt || 0) - (b.closedAt || 0));

  const wins = resolved.filter((t) => (t.resultPercent || 0) > 0);
  const losses = resolved.filter((t) => (t.resultPercent || 0) < 0);

  const correct = tracked.filter((t) => t.status === 'HIT_TARGET').length;
  const incorrect = tracked.filter((t) => t.status === 'HIT_STOP').length;
  const neutral = tracked.filter(
    (t) => t.status === 'CLOSED_MANUALLY' || t.status === 'EXPIRED'
  ).length;
  const decisive = correct + incorrect;

  // Trailing run of same-sign results.
  let streak = 0;
  let streakType: 'WIN' | 'LOSS' | 'NONE' = 'NONE';
  for (let i = resolved.length - 1; i >= 0; i--) {
    const isWin = (resolved[i].resultPercent || 0) > 0;
    const type = isWin ? 'WIN' : 'LOSS';
    if (streakType === 'NONE') {
      streakType = type;
      streak = 1;
    } else if (streakType === type) streak++;
    else break;
  }

  const avg = (rows: TrackedSignal[]) =>
    rows.length
      ? Number((rows.reduce((s, t) => s + (t.resultPercent || 0), 0) / rows.length).toFixed(2))
      : 0;

  return {
    totalSignals: signals.length,
    tracked: tracked.length,
    correct,
    incorrect,
    neutral,
    pending: tracked.filter((t) => t.status === 'ACTIVE').length,
    accuracy: decisive > 0 ? Number(((correct / decisive) * 100).toFixed(1)) : null,
    averageWinPercent: avg(wins),
    averageLossPercent: avg(losses),
    bestPercent: resolved.length ? Math.max(...resolved.map((t) => t.resultPercent || 0)) : 0,
    worstPercent: resolved.length ? Math.min(...resolved.map((t) => t.resultPercent || 0)) : 0,
    currentStreak: streak,
    currentStreakType: streakType,
    netPercent: Number(resolved.reduce((s, t) => s + (t.resultPercent || 0), 0).toFixed(2)),
  };
}
