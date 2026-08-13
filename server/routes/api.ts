/**
 * API routes.
 *
 * This is a signal ADVISOR: it analyses markets and issues a verdict. It never
 * places orders and holds no exchange credentials, so there are no execution,
 * balance or order endpoints.
 */

import { Router, type Request, type Response } from 'express';
import {
  getProvider,
  listProviders,
  resolveInstrument,
  searchInstruments,
} from '../providers';
import { ProviderError } from '../providers/types';
import { AIError, buildUserPrompt, isAIConfigured, requestAIAnalysis } from '../lib/ai';
import {
  CHAT_SYSTEM_PROMPT,
  ChatError,
  buildChatContext,
  streamChat,
  type ChatMessage,
} from '../lib/chat';
import { buildAdvice, evaluateLive } from '../lib/advice';
import { evaluatePendingSignals } from '../lib/evaluator';
import { analyzeMarket } from '../../shared/analysis/indicators';
import { computeSignalQuality } from '../../shared/analysis/aiSchema';
import {
  MAX_WINDOW_MINUTES,
  MIN_WINDOW_MINUTES,
} from '../../shared/analysis/tradeWindow';
import {
  applyPlanToSettings,
  buildUserPlanView,
  planModelForRequest,
  resolvePlan,
} from '../lib/plan';
import { checkTrackedSignal, closeTracked, computeStats, trackSignal } from '../lib/tracking';
import { logger } from '../lib/logger';
import { isEmailConfigured, sendWelcomeEmail } from '../lib/email';
import { store } from '../lib/store';
import { convertAmount } from '../lib/currency';
import { ensureSession } from '../lib/session';
import type {
  AssetClass,
  ProviderId,
  SignalRecord,
  Timeframe,
  TradeIntent,
  TradeSizeUnit,
  TrackedSignalView,
} from '../../shared/types';

export const api = Router();

const VALID_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const VALID_ASSET_CLASSES: AssetClass[] = ['CRYPTO', 'STOCK', 'FOREX', 'COMMODITY', 'INDEX', 'ETF'];
const VALID_SIZE_UNITS: TradeSizeUnit[] = ['QUOTE', 'PERCENT'];

function fail(res: Response, status: number, message: string, detail?: unknown) {
  return res.status(status).json({ error: message, detail: detail ?? undefined });
}

/** Maps any thrown value to an appropriate HTTP response. */
function handleError(res: Response, err: unknown, fallback: string) {
  if (err instanceof ProviderError) {
    return fail(res, err.httpStatus, err.userMessage || fallback);
  }
  if (err instanceof AIError) {
    return res.status(502).json({ error: err.message, detail: err.detail, kind: 'AI_ERROR' });
  }
  logger.error('api: unhandled route error', err);
  return fail(res, 500, fallback);
}

function parseTimeframe(value: unknown): Timeframe | null {
  return VALID_TIMEFRAMES.includes(value as Timeframe) ? (value as Timeframe) : null;
}

function parseWindowMinutes(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < MIN_WINDOW_MINUTES || rounded > MAX_WINDOW_MINUTES) return null;
  return rounded;
}

function parseSizeAmount(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseSizeUnit(value: unknown): TradeSizeUnit | null {
  return VALID_SIZE_UNITS.includes(value as TradeSizeUnit) ? (value as TradeSizeUnit) : null;
}

function startOfDay(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ------------------------------------------------------------------- health

api.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'LURZ AI', time: Date.now() });
});

/** Simple per-IP cooldown for welcome emails (abuse guard). */
const welcomeEmailCooldown = new Map<string, number>();
const WELCOME_COOLDOWN_MS = 60_000;

api.post('/email/welcome', async (req, res) => {
  ensureSession(req, res);

  if (!isEmailConfigured()) {
    return res.status(503).json({
      error: 'Transactional email is not configured on this server.',
      skipped: true,
    });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : undefined;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail(res, 400, 'A valid email is required.');
  }
  if (!name) {
    return fail(res, 400, 'Name is required.');
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const last = welcomeEmailCooldown.get(ip) ?? 0;
  if (now - last < WELCOME_COOLDOWN_MS) {
    return fail(res, 429, 'Please wait before requesting another welcome email.');
  }
  welcomeEmailCooldown.set(ip, now);

  try {
    const result = await sendWelcomeEmail({ to: email, name, userId });
    if (result.ok === true) {
      return res.json({ ok: true, id: result.id });
    }
    if (result.skipped) {
      return res.status(503).json({ error: result.error, skipped: true });
    }
    return fail(res, 502, 'Failed to send welcome email.', result.error);
  } catch (err) {
    return handleError(res, err, 'Failed to send welcome email.');
  }
});

/** Honest connection status: nothing is reported healthy without evidence. */
api.get('/status', async (req, res) => {
  ensureSession(req, res);
  const providers = listProviders();

  const result: any = {
    marketData: 'DISCONNECTED',
    ai: isAIConfigured() ? 'CONNECTED' : 'UNAVAILABLE',
    email: isEmailConfigured() ? 'CONNECTED' : 'UNAVAILABLE',
    providers,
    details: {
      ai: isAIConfigured()
        ? 'AI analysis service is configured'
        : 'AI analysis is not configured on this server',
      email: isEmailConfigured()
        ? 'Resend transactional email is configured'
        : 'RESEND_API_KEY is not configured',
    },
  };

  // Probe providers until one responds — Binance is often geo-blocked (HTTP 451)
  // from Vercel/US regions, so we must not hard-depend on it for status.
  const probeOrder = ['binance', 'coinbase', 'kraken', 'bybit', 'okx', 'twelvedata'] as const;
  let connectedVia: string | null = null;
  let lastError: string | null = null;

  for (const id of probeOrder) {
    try {
      const provider = getProvider(id);
      if (!provider.isAvailable()) continue;
      const list = await provider.listInstruments();
      if (list.length > 0) {
        connectedVia = provider.label;
        break;
      }
    } catch (err) {
      lastError =
        err instanceof ProviderError
          ? err.userMessage || `${id} unavailable`
          : `${id} unavailable`;
    }
  }

  if (connectedVia) {
    result.marketData = 'CONNECTED';
    const available = providers.filter((p) => p.available).length;
    result.details.marketData = `${available} of ${providers.length} data sources available (via ${connectedVia})`;
  } else {
    result.marketData = 'ERROR';
    result.details.marketData = lastError || 'Market data unavailable';
  }

  res.json(result);
});

api.get('/providers', (req, res) => {
  ensureSession(req, res);
  res.json(listProviders());
});

// ------------------------------------------------------------------- search

/**
 * Ranked instrument search across every available market.
 *
 * Prefix matches rank highest, so typing "B" returns BTC, BNB, BCH, BA and so
 * on before anything that merely contains a "b".
 */
api.get('/search', async (req, res) => {
  ensureSession(req, res);

  const query = String(req.query.q ?? '');
  const limit = Math.min(Number(req.query.limit) || 25, 50);

  const assetClassRaw = req.query.assetClass ? String(req.query.assetClass).toUpperCase() : null;
  const assetClass =
    assetClassRaw && VALID_ASSET_CLASSES.includes(assetClassRaw as AssetClass)
      ? (assetClassRaw as AssetClass)
      : undefined;

  const providerRaw = req.query.provider ? String(req.query.provider) : null;
  const provider = providerRaw ? (providerRaw as ProviderId) : undefined;

  try {
    res.json(await searchInstruments(query, { limit, assetClass, provider }));
  } catch (err) {
    handleError(res, err, 'Symbol search failed.');
  }
});

api.get('/instrument', async (req, res) => {
  ensureSession(req, res);
  const id = String(req.query.id || '');
  if (!id) return fail(res, 400, 'An instrument id is required.');

  try {
    res.json(await resolveInstrument(id));
  } catch (err) {
    handleError(res, err, 'Could not load that market.');
  }
});

// -------------------------------------------------------------- market data

api.get('/market/quote', async (req, res) => {
  ensureSession(req, res);
  const id = String(req.query.id || '');
  if (!id) return fail(res, 400, 'An instrument id is required.');

  try {
    const instrument = await resolveInstrument(id);
    res.json(await getProvider(instrument.provider).getQuote(instrument));
  } catch (err) {
    handleError(res, err, 'Could not load the current price.');
  }
});

api.get('/market/candles', async (req, res) => {
  ensureSession(req, res);
  const id = String(req.query.id || '');
  const timeframe = parseTimeframe(req.query.timeframe);
  const limit = Math.min(Number(req.query.limit) || 300, 1000);

  if (!id) return fail(res, 400, 'An instrument id is required.');
  if (!timeframe) return fail(res, 400, `Timeframe must be one of ${VALID_TIMEFRAMES.join(', ')}.`);

  try {
    const instrument = await resolveInstrument(id);
    res.json(await getProvider(instrument.provider).getCandles(instrument, timeframe, limit));
  } catch (err) {
    handleError(res, err, 'Could not load candle data.');
  }
});

/** Locally-computed technical analysis. No AI involved. */
api.get('/market/analysis', async (req, res) => {
  ensureSession(req, res);
  const id = String(req.query.id || '');
  const timeframe = parseTimeframe(req.query.timeframe) || '1h';
  if (!id) return fail(res, 400, 'An instrument id is required.');

  try {
    const instrument = await resolveInstrument(id);
    const candles = await getProvider(instrument.provider).getCandles(instrument, timeframe, 300);
    res.json(analyzeMarket(candles, instrument.id, instrument.displaySymbol, timeframe));
  } catch (err) {
    handleError(res, err, 'Could not compute the analysis.');
  }
});

/** WebSocket configuration for providers that support live streaming. */
api.get('/market/stream-config', async (req, res) => {
  ensureSession(req, res);
  const id = String(req.query.id || '');
  const timeframe = parseTimeframe(req.query.timeframe) || '1h';
  if (!id) return fail(res, 400, 'An instrument id is required.');

  try {
    const instrument = await resolveInstrument(id);
    const provider = getProvider(instrument.provider);
    const config = provider.getStreamConfig?.(instrument, timeframe) ?? null;

    res.json({
      supported: Boolean(config),
      config,
      // Polling interval for providers without a public stream.
      pollIntervalMs: config ? null : instrument.assetClass === 'CRYPTO' ? 10_000 : 30_000,
    });
  } catch (err) {
    handleError(res, err, 'Could not load streaming configuration.');
  }
});

// ----------------------------------------------------------------- settings

api.get('/plan', (req, res) => {
  const sid = ensureSession(req, res);
  const todaySignals = store.listSignalsSince(sid, startOfDay());
  res.json(buildUserPlanView(sid, todaySignals.length));
});

api.get('/settings', (req, res) => {
  const sid = ensureSession(req, res);
  const plan = resolvePlan(sid);
  res.json(applyPlanToSettings(store.getSettings(sid), plan));
});

api.put('/settings', (req, res) => {
  const sid = ensureSession(req, res);
  const plan = resolvePlan(sid);
  const body = req.body || {};

  // Whitelist and clamp: these values drive the advisory verdict.
  const numeric: Array<[string, number, number]> = [
    ['minSignalQuality', 0, 100],
    ['minRiskReward', 0.1, 100],
    ['accountRiskPercent', 0.1, 100],
    ['maxSignalsPerDay', 1, plan.maxAnalysesPerDay],
    ['cooldownMinutes', 0, 1440],
    ['maxMarketDataAgeSeconds', 5, 3600],
    ['aiTemperature', 0, 2],
  ];

  const patch: Record<string, unknown> = {};
  for (const [key, min, max] of numeric) {
    if (body[key] !== undefined) {
      const value = Number(body[key]);
      if (!Number.isFinite(value)) return fail(res, 400, `Setting "${key}" must be a number.`);
      patch[key] = Math.max(min, Math.min(max, value));
    }
  }

  // Free / Pro lock the model to the plan tier. Max may choose later.
  if (plan.canChangeModel && typeof body.aiModel === 'string' && body.aiModel.trim()) {
    patch.aiModel = body.aiModel.trim();
  } else {
    patch.aiModel = plan.aiModel;
  }

  if (typeof body.requireStopLoss === 'boolean') patch.requireStopLoss = body.requireStopLoss;
  if (parseTimeframe(body.defaultTimeframe)) patch.defaultTimeframe = body.defaultTimeframe;
  if (Array.isArray(body.favourites)) {
    patch.favourites = body.favourites
      .filter((f: unknown) => typeof f === 'string')
      .slice(0, plan.maxFavourites);
  }

  res.json(applyPlanToSettings(store.saveSettings(sid, patch), plan));
});

// -------------------------------------------------------------- AI analysis

/**
 * Generates a signal: real market data -> local indicators -> AI ->
 * strict validation -> combined quality score -> advisory verdict.
 */
api.post('/analyze', async (req, res) => {
  const sid = ensureSession(req, res);
  const plan = resolvePlan(sid);
  const settings = applyPlanToSettings(store.getSettings(sid), plan);

  const instrumentId = String(req.body?.instrumentId || '');
  const timeframe = parseTimeframe(req.body?.timeframe) || settings.defaultTimeframe;
  const windowMinutes = parseWindowMinutes(req.body?.windowMinutes);
  const sizeAmount = parseSizeAmount(req.body?.sizeAmount);
  const sizeUnit = parseSizeUnit(req.body?.sizeUnit) || 'QUOTE';

  if (!instrumentId) return fail(res, 400, 'An instrument id is required.');
  if (windowMinutes === null) {
    return fail(res, 400,
      `Choose a trade window between ${MIN_WINDOW_MINUTES} and ${MAX_WINDOW_MINUTES} minutes.`);
  }
  if (sizeAmount === null) {
    return fail(res, 400, 'Enter how much you intend to trade (a positive number). Advisory only — nothing is executed.');
  }
  if (sizeUnit === 'PERCENT' && sizeAmount > 100) {
    return fail(res, 400, 'Percent of account cannot exceed 100.');
  }
  if (!isAIConfigured()) {
    return fail(res, 503,
      'AI analysis is not available on this server. The operator has not configured an AI service key.');
  }

  // Reserve an analysis slot atomically to avoid race conditions across concurrent requests.
  let reserved = false;
  let reservedConsumed = false;
  try {
    const reservedCount = store.incrementAnalysisUsage(sid);
    reserved = true;
    if (reservedCount > plan.maxAnalysesPerDay) {
      // Immediately roll back and reject if the limit was already reached.
      store.decrementAnalysisUsage(sid);
      return fail(
        res,
        429,
        `${plan.name} plan limit reached: ${plan.maxAnalysesPerDay} analyses per day.${
          plan.id === 'free' ? ' Pro and Max plans with stronger models are coming soon.' : ''
        }`
      );
    }
  } catch (e) {
    // If the store fails for any reason, fall back to the previous defensive check.
    const todaySignals = store.listSignalsSince(sid, startOfDay());
    if (todaySignals.length >= plan.maxAnalysesPerDay) {
      return fail(
        res,
        429,
        `${plan.name} plan limit reached: ${plan.maxAnalysesPerDay} analyses per day.${
          plan.id === 'free' ? ' Pro and Max plans with stronger models are coming soon.' : ''
        }`
      );
    }
  }

  try {
    const instrument = await resolveInstrument(instrumentId);
    const provider = getProvider(instrument.provider);

    // Quote + candles in parallel — largest latency win before the AI call.
    const [quote, candles] = await Promise.all([
      provider.getQuote(instrument),
      provider.getCandles(instrument, timeframe, 300),
    ]);

    // Convert the quote for display in the user's preferred currency when possible.
    const preferredCurrency = settings.preferredCurrency || 'USD';
    let convertedQuote = null as null | { price: number; currency: string };
    try {
      const converted = await convertAmount(quote.price, quote.currency || 'USD', preferredCurrency);
      convertedQuote = { price: converted, currency: preferredCurrency };
    } catch (e) {
      // best-effort: if conversion fails, leave convertedQuote null
    }

    if (candles.length < 30) {
      return fail(res, 422,
        `Only ${candles.length} candles are available for ${instrument.displaySymbol} on ${timeframe}. That is not enough for a reliable analysis — try a longer timeframe.`);
    }

    const analysis = analyzeMarket(candles, instrument.id, instrument.displaySymbol, timeframe);

    const activeTracked = store
      .listActiveTracked(sid)
      .find((t) => t.instrumentId === instrument.id);

    const intendedSizeNote =
      sizeUnit === 'PERCENT'
        ? `${sizeAmount}% of account`
        : `${sizeAmount} ${instrument.currency}`;

    const prompt = buildUserPrompt({
      analysis,
      quote,
      candles,
      displaySymbol: instrument.displaySymbol,
      instrumentName: instrument.name,
      assetClass: instrument.assetClass,
      providerLabel: instrument.providerLabel,
      currency: instrument.currency,
      minRiskReward: settings.minRiskReward,
      activeSignal: activeTracked
        ? {
            direction: activeTracked.direction,
            entryPrice: activeTracked.entryPrice,
            openedAt: activeTracked.openedAt,
          }
        : null,
      tradeWindowMinutes: windowMinutes,
      intendedSizeNote,
    });

    const ai = await requestAIAnalysis({
      model: planModelForRequest(sid, settings),
      temperature: settings.aiTemperature,
      userPrompt: prompt,
      marketPrice: quote.price,
    });

    // Anchor the plan's horizon to the user's window so live expiry matches UX.
    ai.analysis.durationMinutes = windowMinutes;

    const quality = computeSignalQuality(analysis, ai.analysis);

    const lastTracked = store
      .listTracked(sid)
      .filter((t) => t.instrumentId === instrument.id)
      .sort((a, b) => b.openedAt - a.openedAt)[0];

    const now = Date.now();
    const tradeIntent: TradeIntent = {
      windowMinutes,
      endsAt: now + windowMinutes * 60_000,
      sizeAmount,
      sizeUnit,
      status: 'ACTIVE',
    };

    const advice = buildAdvice({
      ai: ai.analysis,
      analysis,
      quality,
      settings,
      marketDataAgeSeconds: (Date.now() - quote.fetchedAt) / 1000,
      todaySignals,
      lastTrackedAt: lastTracked?.openedAt ?? null,
      marketClosed: quote.marketClosed,
      tradeIntent,
    });

    const record: SignalRecord = {
      id: `sig_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      userId: sid,
      timestamp: now,
      instrumentId: instrument.id,
      provider: instrument.provider,
      displaySymbol: instrument.displaySymbol,
      assetClass: instrument.assetClass,
      timeframe,
      priceAtSignal: quote.price,
      currency: instrument.currency,
      ai: ai.analysis,
      analysis,
      quality,
      advice,
      tradeIntent,
      tracked: false,
      outcome: 'PENDING',
    };
    store.insertSignal(record);
    // Mark the reserved slot as consumed so it is not rolled back on error.
    reservedConsumed = true;

    // Fresh count after insert so the client can update usage live without a refresh.
    const analysesUsedToday = store.getAnalysisUsageToday(sid); // use the atomic counter

    logger.info('ai: signal generated', {
      instrument: instrument.id,
      timeframe,
      windowMinutes,
      signal: ai.analysis.signal,
      verdict: advice.verdict,
      finalScore: quality.finalScore,
      model: ai.model,
      latencyMs: ai.latencyMs,
      analysesUsedToday,
    });

    res.json({
      signal: record,
      quote,
      convertedQuote,
      instrument,
      notes: ai.notes,
      model: ai.model,
      plan: buildUserPlanView(sid, analysesUsedToday),
    });
  } catch (err) {
    // Release the reserved analysis slot if it was not consumed.
    try {
      if (reserved && !reservedConsumed) {
        store.decrementAnalysisUsage(sid);
      }
    } catch (e) {
      // best-effort
    }
    handleError(res, err, 'The analysis could not be completed. Please try again.');
  }
});

/**
 * Re-evaluates an existing signal against the CURRENT market price.
 *
 * The trade plan itself never moves — shifting a stop to chase price is the
 * habit this app exists to discourage. What this reports is whether the plan is
 * still worth acting on right now: has price invalidated it, run past the
 * entry, already hit the target, or aged out.
 *
 * Cheap enough to poll every few seconds: no AI call is involved.
 */
api.get('/signals/:id/live', async (req, res) => {
  const sid = ensureSession(req, res);
  const settings = store.getSettings(sid);

  const signal = store.getSignal(req.params.id);
  if (!signal || signal.userId !== sid) {
    return fail(res, 404, 'That signal no longer exists. Run a new analysis.');
  }

  try {
    const instrument = await resolveInstrument(signal.instrumentId);
    const provider = getProvider(instrument.provider);

    const [quote, candles] = await Promise.all([
      provider.getQuote(instrument),
      provider.getCandles(instrument, signal.timeframe, 300),
    ]);

    const analysis =
      candles.length >= 30
        ? analyzeMarket(candles, instrument.id, instrument.displaySymbol, signal.timeframe)
        : signal.analysis; // fall back to the original rather than inventing one

    const lastTracked = store
      .listTracked(sid)
      .filter((t) => t.instrumentId === signal.instrumentId)
      .sort((a, b) => b.openedAt - a.openedAt)[0];

    const live = evaluateLive({
      signal,
      currentPrice: quote.price,
      analysis,
      settings,
      marketDataAgeSeconds: (Date.now() - quote.fetchedAt) / 1000,
      todaySignals: store.listSignalsSince(sid, startOfDay()),
      lastTrackedAt: lastTracked?.openedAt ?? null,
      marketClosed: quote.marketClosed,
    });

    // Persist session completion so a reload does not restart live polling.
    if (
      signal.tradeIntent &&
      signal.tradeIntent.status === 'ACTIVE' &&
      (live.lifecycle === 'EXPIRED' ||
        live.lifecycle === 'INVALIDATED' ||
        live.lifecycle === 'TARGET_HIT')
    ) {
      store.updateSignal(signal.id, {
        tradeIntent: { ...signal.tradeIntent, status: 'COMPLETE' },
      });
      signal.tradeIntent = { ...signal.tradeIntent, status: 'COMPLETE' };
    }

    res.json({ live, quote, analysis, tradeIntent: signal.tradeIntent ?? null });
  } catch (err) {
    handleError(res, err, 'Could not refresh this signal.');
  }
});

// ----------------------------------------------------------------- tracking

/** Records that the user has chosen to follow a signal. */
api.post('/tracked', (req, res) => {
  const sid = ensureSession(req, res);
  const plan = resolvePlan(sid);
  const signalId = String(req.body?.signalId || '');
  const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 280) : undefined;

  if (!signalId) return fail(res, 400, 'A signal id is required.');

  const signal = store.getSignal(signalId);
  if (!signal || signal.userId !== sid) {
    return fail(res, 404, 'That signal no longer exists. Run a new analysis.');
  }
  if (signal.ai.signal === 'HOLD') {
    return fail(res, 400, 'A HOLD signal cannot be followed — there is no trade to track.');
  }
  if (signal.tracked) {
    return fail(res, 409, 'You are already following this signal.');
  }

  const activeCount = store.listActiveTracked(sid).length;
  if (activeCount >= plan.maxActiveTracked) {
    return fail(
      res,
      429,
      `${plan.name} plan limit reached: follow up to ${plan.maxActiveTracked} active signals.${
        plan.id === 'free' ? ' Pro and Max are coming soon.' : ''
      }`
    );
  }

  res.json({ tracked: trackSignal(signal, note) });
});

/** Active and historical tracked signals, marked to live prices. */
api.get('/tracked', async (req, res) => {
  const sid = ensureSession(req, res);
  const tracked = store.listTracked(sid);

  const views: TrackedSignalView[] = [];
  const priceCache = new Map<string, number | null>();

  for (const t of tracked) {
    let price = priceCache.get(t.instrumentId);

    if (price === undefined) {
      if (t.status !== 'ACTIVE') {
        price = null; // no need to price a resolved entry
      } else {
        try {
          const instrument = await resolveInstrument(t.instrumentId);
          const quote = await getProvider(instrument.provider).getQuote(instrument);
          price = quote.price;
        } catch {
          price = null; // unknown price is reported as unknown, never guessed
        }
      }
      priceCache.set(t.instrumentId, price);
    }

    // Resolve any level that has been reached since the last check.
    let current = t;
    if (t.status === 'ACTIVE' && price !== null) {
      current = checkTrackedSignal(t, price) ?? t;
    }

    const reference = current.closePrice ?? price;
    const unrealized =
      reference === null || reference === undefined
        ? null
        : ((current.direction === 'LONG'
            ? reference - current.entryPrice
            : current.entryPrice - reference) /
            current.entryPrice) *
          100;

    // Progress toward target: 100 means the target was reached.
    const span = Math.abs(current.takeProfit - current.entryPrice);
    const moved =
      reference === null || reference === undefined
        ? null
        : current.direction === 'LONG'
          ? reference - current.entryPrice
          : current.entryPrice - reference;

    // Non-finite values must never reach the UI: a NaN in a trading statistic is
    // worse than an honest "unavailable".
    const safeUnrealized =
      unrealized === null || !Number.isFinite(unrealized) ? null : Number(unrealized.toFixed(3));
    const rawProgress = moved === null || span <= 0 ? null : (moved / span) * 100;
    const safeProgress =
      rawProgress === null || !Number.isFinite(rawProgress) ? null : Number(rawProgress.toFixed(1));

    views.push({
      ...current,
      currentPrice: current.status === 'ACTIVE' ? (price ?? null) : (current.closePrice ?? null),
      unrealizedPercent: safeUnrealized,
      progressPercent: safeProgress,
      durationMs: (current.closedAt ?? Date.now()) - current.openedAt,
    });
  }

  res.json(views);
});

api.post('/tracked/:id/close', async (req, res) => {
  const sid = ensureSession(req, res);
  const tracked = store.getTracked(req.params.id);

  if (!tracked || tracked.userId !== sid) return fail(res, 404, 'That tracked signal was not found.');
  if (tracked.status !== 'ACTIVE') return fail(res, 409, 'That signal is already closed.');

  try {
    const instrument = await resolveInstrument(tracked.instrumentId);
    const quote = await getProvider(instrument.provider).getQuote(instrument);
    res.json({ tracked: closeTracked(tracked, quote.price) });
  } catch (err) {
    handleError(res, err, 'Could not close the tracked signal because the price is unavailable.');
  }
});

// ------------------------------------------------------------------ history

api.get('/signals', (req, res) => {
  const sid = ensureSession(req, res);
  res.json(store.listSignals(sid, Math.min(Number(req.query.limit) || 100, 500)));
});

api.get('/stats', (req, res) => {
  const sid = ensureSession(req, res);
  const plan = resolvePlan(sid);
  const settings = applyPlanToSettings(store.getSettings(sid), plan);
  const todaySignals = store.listSignalsSince(sid, startOfDay());

  res.json({
    stats: computeStats(sid),
    signalsToday: todaySignals.length,
    maxSignalsPerDay: Math.min(settings.maxSignalsPerDay, plan.maxAnalysesPerDay),
    plan: buildUserPlanView(sid, todaySignals.length),
  });
});

api.post('/signals/evaluate', async (req, res) => {
  const sid = ensureSession(req, res);
  try {
    const updated = await evaluatePendingSignals(sid);
    res.json({ updated, stats: computeStats(sid) });
  } catch (err) {
    handleError(res, err, 'Signal evaluation failed.');
  }
});

// --------------------------------------------------------------------- chat

/**
 * Streaming chat, delivered as Server-Sent Events.
 *
 * Real market context for the instrument the user is viewing is injected into
 * the system prompt, so the assistant discusses actual numbers rather than
 * recalling stale ones from training data.
 */
api.post('/chat', async (req, res) => {
  const sid = ensureSession(req, res);
  const plan = resolvePlan(sid);
  const settings = applyPlanToSettings(store.getSettings(sid), plan);

  const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const instrumentId = req.body?.instrumentId ? String(req.body.instrumentId) : null;
  const timeframe = parseTimeframe(req.body?.timeframe) || settings.defaultTimeframe;

  // Validate and bound the transcript before it reaches the model.
  const messages: ChatMessage[] = rawMessages
    .filter(
      (m: any) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0
    )
    .slice(-20) // keep the last 20 turns to bound cost and latency
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (messages.length === 0) return fail(res, 400, 'A message is required.');
  if (messages[messages.length - 1].role !== 'user') {
    return fail(res, 400, 'The last message must be from the user.');
  }
  if (!isAIConfigured()) {
    return fail(res, 503, 'Chat is not available: this server has no AI service configured.');
  }

  const chatUsed = store.getChatUsageToday(sid);
  if (chatUsed >= plan.maxChatMessagesPerDay) {
    return fail(
      res,
      429,
      `${plan.name} plan limit reached: ${plan.maxChatMessagesPerDay} chat messages per day.${
        plan.id === 'free' ? ' Pro and Max are coming soon.' : ''
      }`
    );
  }
  store.incrementChatUsage(sid);

  // Assemble live context. Failures here degrade the answer but must not
  // prevent the user from chatting.
  let context = '';
  if (instrumentId) {
    try {
      const instrument = await resolveInstrument(instrumentId);
      const provider = getProvider(instrument.provider);

      const [quote, candles] = await Promise.all([
        provider.getQuote(instrument).catch(() => null),
        provider.getCandles(instrument, timeframe, 300).catch(() => []),
      ]);

      const analysis =
        candles.length >= 30
          ? analyzeMarket(candles, instrument.id, instrument.displaySymbol, timeframe)
          : null;

      const latestSignal =
        store.listSignals(sid, 100).find((s) => s.instrumentId === instrument.id) ?? null;

      context = buildChatContext({
        displaySymbol: instrument.displaySymbol,
        instrumentName: instrument.name,
        assetClass: instrument.assetClass,
        providerLabel: instrument.providerLabel,
        currency: instrument.currency,
        timeframe,
        quote,
        analysis,
        signal: latestSignal,
      });
    } catch (err) {
      logger.warn('chat: could not build market context', { instrumentId, err });
      context = '\n\nCURRENT CONTEXT: market data could not be loaded for this conversation.';
    }
  } else {
    context = buildChatContext({});
  }

  // SSE headers. Buffering must be disabled or tokens arrive in one lump.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Abort the upstream request if the client disconnects mid-stream.
  const controller = new AbortController();
  req.on('close', () => controller.abort());

  try {
    const result = await streamChat({
      model: planModelForRequest(sid, settings),
      temperature: 0.6, // conversational, versus the analytical path's low temp
      systemPrompt: CHAT_SYSTEM_PROMPT + context,
      messages,
      onDelta: (text) => send('delta', { text }),
      signal: controller.signal,
    });

    logger.info('chat: response streamed', {
      instrumentId,
      turns: messages.length,
      chars: result.full.length,
      latencyMs: result.latencyMs,
    });

    send('done', { latencyMs: result.latencyMs });
  } catch (err) {
    if (controller.signal.aborted) {
      res.end();
      return;
    }
    const message =
      err instanceof ChatError ? err.message : 'The assistant could not respond. Please try again.';
    logger.error('chat: stream failed', err);
    send('error', { message });
  } finally {
    res.end();
  }
});
