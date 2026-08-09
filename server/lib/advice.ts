/**
 * Advisory engine.
 *
 * This application does not execute trades, so there is nothing to "block".
 * Instead it renders an honest verdict on whether a setup meets sound trading
 * criteria, and explains every check either way — that is the whole product for
 * a user with no experience.
 *
 * Verdict levels:
 *   TAKE    — every critical check passes and quality clears the threshold
 *   CAUTION — tradable in principle, but something meaningful is wrong
 *   AVOID   — a critical check failed, or the signal is HOLD
 */

import type {
  AIAnalysis,
  AdviceCheck,
  LiveSignalState,
  MarketAnalysis,
  ServerSettings,
  SignalLifecycle,
  SignalQuality,
  SignalRecord,
  TradeAdvice,
  VerdictLevel,
} from '../../shared/types';

export interface AdviceInput {
  ai: AIAnalysis;
  analysis: MarketAnalysis;
  quality: SignalQuality;
  settings: ServerSettings;
  /** Age of the price data behind this signal. */
  marketDataAgeSeconds: number;
  /** Signals already generated today, for overtrading guidance. */
  todaySignals: SignalRecord[];
  /** Most recent tracked signal on this instrument, for cooldown guidance. */
  lastTrackedAt: number | null;
  /** True when the venue is closed (relevant for stocks). */
  marketClosed?: boolean;
  /** User-selected window + size from the Analyse prompt, if any. */
  tradeIntent?: SignalRecord['tradeIntent'];
}

export function buildAdvice(input: AdviceInput): TradeAdvice {
  const { ai, analysis, quality, settings } = input;
  const checks: AdviceCheck[] = [];
  const warnings: string[] = [];

  const risk = Math.abs(ai.entry - ai.stopLoss);
  const reward = Math.abs(ai.takeProfit - ai.entry);
  const riskReward = risk > 0 ? reward / risk : 0;

  const stopDistancePercent = ai.entry > 0 ? (risk / ai.entry) * 100 : 0;
  const targetDistancePercent = ai.entry > 0 ? (reward / ai.entry) * 100 : 0;

  const add = (
    code: string,
    label: string,
    passed: boolean,
    detail: string,
    severity: AdviceCheck['severity']
  ) => checks.push({ code, label, passed, detail, severity });

  // 1. Is there a directional signal at all?
  const isDirectional = ai.signal === 'BUY' || ai.signal === 'SELL';
  add(
    'DIRECTION',
    'Actionable signal',
    isDirectional,
    isDirectional
      ? `The model sees a ${ai.signal} setup.`
      : 'The model recommends HOLD. There is no setup worth taking right now — waiting is the correct action.',
    'CRITICAL'
  );

  // 2. Combined quality vs the user's threshold.
  const qualityOk = quality.finalScore >= settings.minSignalQuality;
  add(
    'QUALITY',
    'Signal quality',
    qualityOk,
    qualityOk
      ? `Quality is ${quality.finalScore.toFixed(0)}%, at or above your ${settings.minSignalQuality}% minimum.`
      : `Quality is only ${quality.finalScore.toFixed(0)}%, below your ${settings.minSignalQuality}% minimum. The technical picture and the AI are not aligned enough.`,
    'CRITICAL'
  );

  // 3. Protective levels present.
  if (isDirectional) {
    const hasStop = ai.stopLoss > 0;
    add(
      'STOP_LOSS',
      'Stop loss defined',
      hasStop || !settings.requireStopLoss,
      hasStop
        ? `Stop loss at ${ai.stopLoss}, ${stopDistancePercent.toFixed(2)}% from entry.`
        : 'No stop loss was provided. Never enter a trade without one.',
      'CRITICAL'
    );

    const hasTarget = ai.takeProfit > 0;
    add(
      'TAKE_PROFIT',
      'Take profit defined',
      hasTarget,
      hasTarget
        ? `Take profit at ${ai.takeProfit}, ${targetDistancePercent.toFixed(2)}% from entry.`
        : 'No take profit level was provided.',
      'IMPORTANT'
    );

    // 4. Risk/reward.
    const rrOk = riskReward >= settings.minRiskReward;
    add(
      'RISK_REWARD',
      'Risk / reward',
      rrOk,
      rrOk
        ? `Risk/reward is 1:${riskReward.toFixed(2)} — you stand to gain ${riskReward.toFixed(2)}x what you risk.`
        : `Risk/reward is only 1:${riskReward.toFixed(2)}, below your 1:${settings.minRiskReward} minimum. The potential gain does not justify the risk.`,
      'CRITICAL'
    );

    // 5. Is the stop realistic given volatility? A stop inside one ATR is noise.
    const atr = analysis.indicators.atr;
    if (atr !== null && atr > 0) {
      const stopInAtr = risk / atr;
      const stopSensible = stopInAtr >= 1;
      add(
        'STOP_VS_VOLATILITY',
        'Stop vs volatility',
        stopSensible,
        stopSensible
          ? `The stop is ${stopInAtr.toFixed(1)}x the average candle range, so normal noise is unlikely to trigger it.`
          : `The stop is only ${stopInAtr.toFixed(1)}x the average candle range. Ordinary price noise will probably hit it before the trade can work.`,
        'IMPORTANT'
      );
    }
  }

  // 6. Trend agreement between the deterministic model and the AI.
  if (isDirectional) {
    const expected = ai.signal === 'BUY' ? 'BULLISH' : 'BEARISH';
    const agrees = analysis.trend === expected || analysis.trend === 'NEUTRAL';
    add(
      'TREND_ALIGNMENT',
      'Trend alignment',
      agrees,
      agrees
        ? `The ${ai.signal} direction is consistent with the ${analysis.trend.toLowerCase()} technical trend.`
        : `The model wants to ${ai.signal} but the indicators read ${analysis.trend.toLowerCase()}. Trading against the trend is lower probability.`,
      'IMPORTANT'
    );
  }

  // 7. Data quality.
  const dataOk = !analysis.insufficientData;
  add(
    'DATA_QUALITY',
    'Data sufficiency',
    dataOk,
    dataOk
      ? `Analysis used ${analysis.candleCount} candles, enough for reliable indicators.`
      : `Only ${analysis.candleCount} candles were available. Indicators are less reliable on this little history.`,
    'IMPORTANT'
  );

  // 8. Freshness.
  const fresh = input.marketDataAgeSeconds <= settings.maxMarketDataAgeSeconds;
  add(
    'DATA_FRESHNESS',
    'Price freshness',
    fresh,
    fresh
      ? `Price data is ${Math.round(input.marketDataAgeSeconds)}s old.`
      : `Price data is ${Math.round(input.marketDataAgeSeconds)}s old, beyond your ${settings.maxMarketDataAgeSeconds}s limit. Refresh before acting.`,
    'CRITICAL'
  );

  // 9. Market regime.
  const regimeOk = analysis.regime !== 'HIGH_VOLATILITY';
  add(
    'MARKET_REGIME',
    'Market conditions',
    regimeOk,
    regimeOk
      ? `Market regime is ${analysis.regime.replace(/_/g, ' ').toLowerCase()}.`
      : 'Volatility is extreme right now. Price can move violently in both directions and stops are easily hit.',
    'MINOR'
  );

  // 10. Volume confirmation.
  const volumeOk = analysis.volume !== 'LOW';
  add(
    'VOLUME',
    'Volume confirmation',
    volumeOk,
    volumeOk
      ? `Volume is ${analysis.volume.toLowerCase()}, supporting the move.`
      : 'Volume is below average, so there is weak conviction behind this move.',
    'MINOR'
  );

  // 11. Venue open (matters for stocks, not crypto).
  if (input.marketClosed) {
    add(
      'MARKET_HOURS',
      'Market open',
      false,
      'This market is currently closed. The price shown is the last close and you cannot act until it reopens.',
      'IMPORTANT'
    );
  }

  // 12. Overtrading guidance.
  if (settings.maxSignalsPerDay > 0 && input.todaySignals.length >= settings.maxSignalsPerDay) {
    warnings.push(
      `You have generated ${input.todaySignals.length} signals today. Analysing constantly encourages overtrading — the best traders take few, high-quality setups.`
    );
  }

  if (settings.cooldownMinutes > 0 && input.lastTrackedAt) {
    const elapsedMinutes = (Date.now() - input.lastTrackedAt) / 60000;
    if (elapsedMinutes < settings.cooldownMinutes) {
      warnings.push(
        `You followed a signal on this market ${Math.round(elapsedMinutes)} minute(s) ago. Consider waiting the remaining ${Math.ceil(settings.cooldownMinutes - elapsedMinutes)} minute(s) before taking another.`
      );
    }
  }

  // AI's own caveats are surfaced alongside ours.
  warnings.push(...ai.warnings);
  if (analysis.warnings.length) warnings.push(...analysis.warnings);

  // ------------------------------------------------------------- verdict
  const failedCritical = checks.filter((c) => !c.passed && c.severity === 'CRITICAL');
  const failedImportant = checks.filter((c) => !c.passed && c.severity === 'IMPORTANT');

  let verdict: VerdictLevel;
  let headline: string;
  let summary: string;

  if (!isDirectional) {
    verdict = 'AVOID';
    headline = 'Do not trade — wait';
    summary =
      'There is no worthwhile setup here at the moment. Sitting out is a decision in itself, and often the right one.';
  } else if (failedCritical.length > 0) {
    verdict = 'AVOID';
    headline = 'Do not take this trade';
    summary = `This setup fails ${failedCritical.length} essential ${failedCritical.length === 1 ? 'check' : 'checks'}: ${failedCritical.map((c) => c.label.toLowerCase()).join(', ')}. ${failedCritical[0].detail}`;
  } else if (failedImportant.length >= 2) {
    verdict = 'CAUTION';
    headline = 'Risky — proceed only if experienced';
    summary = `The basics are sound but ${failedImportant.length} things are working against this setup: ${failedImportant.map((c) => c.label.toLowerCase()).join(', ')}. If you are new, skip it.`;
  } else if (failedImportant.length === 1) {
    verdict = 'CAUTION';
    headline = 'Acceptable, with one concern';
    summary = `${failedImportant[0].detail} Everything else checks out, with quality at ${quality.finalScore.toFixed(0)}% and risk/reward at 1:${riskReward.toFixed(2)}.`;
  } else {
    verdict = 'TAKE';
    headline = `Valid ${ai.signal} setup`;
    summary = `All key checks pass. Quality is ${quality.finalScore.toFixed(0)}%, risk/reward is 1:${riskReward.toFixed(2)}, and the stop sits ${stopDistancePercent.toFixed(2)}% from entry. Risk only what you can afford to lose.`;
  }

  /**
   * Sizing is expressed as a PERCENTAGE of the account, because this app never
   * sees a balance. Risking `accountRiskPercent` with a stop `s`% away implies a
   * position worth `accountRiskPercent / s` percent of the account.
   */
  const positionPercentOfAccount =
    stopDistancePercent > 0
      ? Number((settings.accountRiskPercent / (stopDistancePercent / 100) / 100).toFixed(2))
      : null;

  let sizingNote =
    positionPercentOfAccount === null
      ? 'A position size cannot be suggested without a valid stop loss.'
      : `To risk ${settings.accountRiskPercent}% of your account with a stop ${stopDistancePercent.toFixed(2)}% away, your position should be about ${positionPercentOfAccount.toFixed(2)}% of your account value. On a $1,000 account that is roughly $${(positionPercentOfAccount * 10).toFixed(2)}.`;

  const intent = input.tradeIntent;
  if (intent && intent.sizeAmount > 0) {
    if (intent.sizeUnit === 'PERCENT') {
      sizingNote = `You said you intend to use about ${intent.sizeAmount}% of your account for this idea (advisory only — nothing is placed). With a ${stopDistancePercent.toFixed(2)}% stop, that implies roughly ${(intent.sizeAmount * (stopDistancePercent / 100)).toFixed(2)}% account risk if the stop is hit. ${sizingNote}`;
    } else {
      sizingNote = `You said you intend to trade about ${intent.sizeAmount} (quote notional — advisory only). With a ${stopDistancePercent.toFixed(2)}% stop, approximate risk on that size is ~${(intent.sizeAmount * (stopDistancePercent / 100)).toFixed(2)} in quote terms if the stop is hit. ${sizingNote}`;
    }
  }

  return {
    verdict,
    headline,
    summary,
    checks,
    sizing: {
      stopDistancePercent: Number(stopDistancePercent.toFixed(3)),
      targetDistancePercent: Number(targetDistancePercent.toFixed(3)),
      riskReward: Number(riskReward.toFixed(2)),
      positionPercentOfAccount,
      note: sizingNote,
    },
    warnings: [...new Set(warnings)],
  };
}

// ---------------------------------------------------------------- live state

/**
 * Determines what has happened to a signal since it was issued.
 *
 * The plan (entry, stop, target) is deliberately immutable — moving a stop to
 * follow price is exactly the habit that ruins beginners. What changes is
 * whether the plan is still worth acting on, which is what this reports.
 */
export function deriveLifecycle(params: {
  signal: SignalRecord;
  currentPrice: number;
  now?: number;
}): { lifecycle: SignalLifecycle; statusNote: string } {
  const { signal, currentPrice } = params;
  const now = params.now ?? Date.now();
  const ai = signal.ai;

  if (ai.signal === 'HOLD') {
    return {
      lifecycle: 'HOLD',
      statusNote: 'This was a HOLD — there was no trade to take.',
    };
  }

  const isLong = ai.signal === 'BUY';

  // Terminal outcomes are checked first: once a level is reached, nothing else
  // about the plan matters.
  const hitStop = isLong ? currentPrice <= ai.stopLoss : currentPrice >= ai.stopLoss;
  if (hitStop) {
    return {
      lifecycle: 'INVALIDATED',
      statusNote: `Price reached the stop level of ${ai.stopLoss}. This idea is no longer valid — do not enter now.`,
    };
  }

  const hitTarget = isLong ? currentPrice >= ai.takeProfit : currentPrice <= ai.takeProfit;
  if (hitTarget) {
    return {
      lifecycle: 'TARGET_HIT',
      statusNote: `Price already reached the target of ${ai.takeProfit}. The move has played out; entering now means chasing it.`,
    };
  }

  // Time-based expiry: prefer the user's selected trade window when present.
  const ageMs = now - signal.timestamp;
  const intent = signal.tradeIntent;
  if (intent) {
    if (now >= intent.endsAt || intent.status === 'COMPLETE') {
      const windowMin = intent.windowMinutes;
      return {
        lifecycle: 'EXPIRED',
        statusNote: `Your ${windowMin}-minute trade window has ended. Live updates have stopped — run a fresh analysis if you still want a view.`,
      };
    }
  } else {
    const horizonMs = Math.max(ai.durationMinutes, 1) * 60_000;
    if (ageMs > horizonMs) {
      return {
        lifecycle: 'EXPIRED',
        statusNote: `This signal was for roughly ${ai.durationMinutes} minutes and is now ${Math.round(ageMs / 60_000)} minutes old. Run a fresh analysis.`,
      };
    }
  }

  /*
   * Entry drift.
   *
   * Measured against the distance to the stop rather than a flat percentage,
   * because what matters is how much of the planned risk has been consumed
   * before entering. Moving a third of the way to the target also means the
   * remaining reward no longer justifies the unchanged risk.
   */
  const riskDistance = Math.abs(ai.entry - ai.stopLoss);
  const rewardDistance = Math.abs(ai.takeProfit - ai.entry);
  const moved = isLong ? currentPrice - ai.entry : ai.entry - currentPrice;

  if (riskDistance > 0) {
    // Price moved against the entry, eating into the risk budget.
    if (moved < 0 && Math.abs(moved) / riskDistance > 0.5) {
      return {
        lifecycle: 'ENTRY_MISSED',
        statusNote: `Price has moved ${Math.abs(moved / riskDistance * 100).toFixed(0)}% of the way to the stop before entry. The original risk no longer applies.`,
      };
    }
    // Price ran ahead; entering now pays more for less remaining upside.
    if (rewardDistance > 0 && moved > 0 && moved / rewardDistance > 0.33) {
      return {
        lifecycle: 'ENTRY_MISSED',
        statusNote: `Price has already covered ${((moved / rewardDistance) * 100).toFixed(0)}% of the distance to the target. Entering now gives a worse risk/reward than the signal described.`,
      };
    }
  }

  return {
    lifecycle: 'VALID',
    statusNote: 'Price is still close to the planned entry — this setup is current.',
  };
}

/**
 * Re-runs the advisory engine against the live price.
 *
 * This is what makes the card honest minute-to-minute: the freshness check, the
 * quality threshold and the lifecycle all reflect the market right now, not the
 * market at the instant the user pressed Analyse.
 */
export function evaluateLive(params: {
  signal: SignalRecord;
  currentPrice: number;
  analysis: MarketAnalysis;
  settings: ServerSettings;
  marketDataAgeSeconds: number;
  todaySignals: SignalRecord[];
  lastTrackedAt: number | null;
  marketClosed?: boolean;
  now?: number;
}): LiveSignalState {
  const now = params.now ?? Date.now();
  const { signal, currentPrice } = params;

  const { lifecycle, statusNote } = deriveLifecycle({ signal, currentPrice, now });

  // Recompute the advice using the CURRENT analysis, so indicator drift and
  // data staleness are reflected rather than frozen.
  const advice = buildAdvice({
    ai: signal.ai,
    analysis: params.analysis,
    quality: signal.quality,
    settings: params.settings,
    marketDataAgeSeconds: params.marketDataAgeSeconds,
    todaySignals: params.todaySignals,
    lastTrackedAt: params.lastTrackedAt,
    marketClosed: params.marketClosed,
    tradeIntent: signal.tradeIntent,
  });

  // A dead or stale plan overrides whatever the checks say: the numbers might
  // still look good, but the opportunity is gone.
  if (lifecycle !== 'VALID' && lifecycle !== 'HOLD') {
    advice.verdict = 'AVOID';
    advice.headline =
      lifecycle === 'INVALIDATED' ? 'Signal invalidated'
      : lifecycle === 'TARGET_HIT' ? 'Move already happened'
      : lifecycle === 'EXPIRED' ? 'Signal expired'
      : 'Entry no longer valid';
    advice.summary = statusNote;

    advice.checks.unshift({
      code: 'LIFECYCLE',
      label: 'Still actionable',
      passed: false,
      detail: statusNote,
      severity: 'CRITICAL',
    });
  }

  const ai = signal.ai;
  const isLong = ai.signal === 'BUY';
  const moved = ai.signal === 'HOLD' ? 0 : isLong ? currentPrice - ai.entry : ai.entry - currentPrice;
  const rewardDistance = Math.abs(ai.takeProfit - ai.entry);

  const driftPercent =
    ai.entry > 0 ? ((currentPrice - ai.entry) / ai.entry) * 100 : 0;
  const movePercent = ai.entry > 0 ? (moved / ai.entry) * 100 : 0;
  const progress = rewardDistance > 0 ? (moved / rewardDistance) * 100 : null;

  return {
    signalId: signal.id,
    lifecycle,
    currentPrice,
    driftPercent: safeNumber(driftPercent, 3),
    movePercent: safeNumber(movePercent, 3),
    progressPercent: progress === null ? null : safeNumber(progress, 1),
    ageMs: now - signal.timestamp,
    advice,
    statusNote,
    evaluatedAt: now,
  };
}

/** Rounds a value, returning 0 rather than letting NaN/Infinity reach the UI. */
function safeNumber(value: number, dp: number): number {
  if (!Number.isFinite(value)) return 0;
  const f = Math.pow(10, dp);
  return Math.round(value * f) / f;
}
