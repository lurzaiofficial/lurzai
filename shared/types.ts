/**
 * Types shared between the Express server and the React client.
 *
 * This application is a SIGNAL ADVISOR, not an execution bot. It never places
 * orders and holds no exchange trading credentials. It analyses real market
 * data across several venues and tells the user whether a setup looks worth
 * taking; the user trades manually elsewhere.
 */

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export type SignalType = 'BUY' | 'SELL' | 'HOLD';
export type MarketTrend = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type Direction = 'LONG' | 'SHORT';

// ----------------------------------------------------------------- providers

/** Data sources. Crypto venues are public; twelvedata needs a server-side key. */
export type ProviderId = 'binance' | 'coinbase' | 'kraken' | 'bybit' | 'okx' | 'twelvedata';

export type AssetClass = 'CRYPTO' | 'STOCK' | 'FOREX' | 'COMMODITY' | 'INDEX' | 'ETF';

/**
 * A tradable-or-watchable market.
 *
 * `id` is the canonical application-wide identifier, formatted
 * `<provider>:<providerSymbol>` so two venues listing "BTC/USDT" never collide.
 */
export interface Instrument {
  id: string;
  provider: ProviderId;
  providerLabel: string;
  /** Symbol in the form the provider's own API expects. */
  providerSymbol: string;
  /** Human-facing symbol, e.g. BTC/USDT or AAPL. */
  displaySymbol: string;
  /** Full name where known, e.g. "Apple Inc." or "Bitcoin". */
  name: string;
  assetClass: AssetClass;
  /** Base/quote for pairs; base only for single-name instruments. */
  baseAsset: string;
  quoteAsset: string;
  /** Currency that prices are quoted in, for display formatting. */
  currency: string;
  /** Exchange/venue name where relevant, e.g. NASDAQ. */
  exchange?: string;
}

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  assetClasses: AssetClass[];
  available: boolean;
  /** Why a provider is unavailable, e.g. a missing API key. */
  reason?: string;
  requiresKey: boolean;
  supportsStreaming: boolean;
}

// --------------------------------------------------------------- market data

export interface Candlestick {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** False while the candle is still forming. */
  closed: boolean;
}

export interface Quote {
  instrumentId: string;
  displaySymbol: string;
  price: number;
  change24h: number;
  change24hPercent: number;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  currency: string;
  /** When this data was produced, for staleness checks. */
  fetchedAt: number;
  /** True when the venue is closed (stocks outside market hours). */
  marketClosed?: boolean;
}

// ---------------------------------------------------------------- indicators

export type VolumeTrend = 'HIGH' | 'NORMAL' | 'LOW';

export type MarketRegime =
  | 'TRENDING_UP'
  | 'TRENDING_DOWN'
  | 'RANGING'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY';

export interface Indicators {
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  atr: number | null;
  atrPercent: number | null;
  volumeMa20: number | null;
  lastVolume: number | null;
  support: number | null;
  resistance: number | null;
}

/**
 * Normalized analysis object. Every field is derived locally from candles —
 * the LLM never computes these.
 */
export interface MarketAnalysis {
  instrumentId: string;
  displaySymbol: string;
  timeframe: Timeframe;
  price: number;
  trend: MarketTrend;
  momentum: 'STRONG_UP' | 'UP' | 'FLAT' | 'DOWN' | 'STRONG_DOWN';
  volatility: 'HIGH' | 'NORMAL' | 'LOW';
  volume: VolumeTrend;
  regime: MarketRegime;
  support: number | null;
  resistance: number | null;
  indicators: Indicators;
  /** 0-100 deterministic quality score computed from indicators only. */
  technicalScore: number;
  scoreBreakdown: Array<{ label: string; points: number }>;
  candleCount: number;
  insufficientData: boolean;
  warnings: string[];
  computedAt: number;
}

// ------------------------------------------------------------------------ AI

/** Exact shape the model must return. Validated before any use. */
export interface AIAnalysis {
  signal: SignalType;
  confidence: number;
  trend: MarketTrend;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  durationMinutes: number;
  reason: string;
  warnings: string[];
}

export interface SignalQuality {
  technicalScore: number;
  aiConfidence: number;
  finalScore: number;
  components: Array<{ label: string; value: number }>;
}

/**
 * The advisory verdict shown to the user.
 *
 * This replaces the execution-time risk engine: nothing is blocked because
 * nothing is executed. Instead the app states plainly whether a setup meets
 * sound trading criteria, and why not when it does not.
 */
export type VerdictLevel = 'TAKE' | 'CAUTION' | 'AVOID';

export interface AdviceCheck {
  code: string;
  label: string;
  passed: boolean;
  /** Explanation shown whether the check passed or failed. */
  detail: string;
  severity: 'CRITICAL' | 'IMPORTANT' | 'MINOR';
}

/**
 * What has happened to a signal since it was produced.
 *
 * A signal is a plan made at a moment in time. The plan itself does not move,
 * but the market does — so the app continuously re-checks whether the plan is
 * still worth acting on.
 */
export type SignalLifecycle =
  /** Price is still near the entry; the plan is actionable. */
  | 'VALID'
  /** Price ran too far past the entry to take the trade at the stated risk. */
  | 'ENTRY_MISSED'
  /** Price hit the stop level; the idea is dead. */
  | 'INVALIDATED'
  /** Price reached the target; the move already played out. */
  | 'TARGET_HIT'
  /** The suggested duration has elapsed. */
  | 'EXPIRED'
  /** Never actionable in the first place. */
  | 'HOLD';

/** A signal re-evaluated against the current market price. */
export interface LiveSignalState {
  signalId: string;
  lifecycle: SignalLifecycle;
  /** Present price used for this evaluation. */
  currentPrice: number;
  /** How far price has moved from the planned entry, in percent. */
  driftPercent: number;
  /** Percentage move in the trade's favour since entry. */
  movePercent: number;
  /** Progress toward the target: 100 = target reached, negative = toward stop. */
  progressPercent: number | null;
  /** Age of the signal in milliseconds. */
  ageMs: number;
  /** Verdict recomputed against the live price. */
  advice: TradeAdvice;
  /** Short explanation of the lifecycle state, for display. */
  statusNote: string;
  evaluatedAt: number;
}

export interface TradeAdvice {
  verdict: VerdictLevel;
  headline: string;
  summary: string;
  checks: AdviceCheck[];
  /** Suggested risk sizing, expressed in percentages so no balance is needed. */
  sizing: {
    stopDistancePercent: number;
    targetDistancePercent: number;
    riskReward: number;
    /** Position value implied by risking `accountRiskPercent` of an account. */
    positionPercentOfAccount: number | null;
    note: string;
  };
  warnings: string[];
}

/**
 * How the user expressed the size they intend to trade elsewhere.
 * Advisory only — this app never executes or holds balances.
 */
export type TradeSizeUnit = 'QUOTE' | 'PERCENT';

/**
 * Timed advisory session attached to a signal.
 *
 * Created when the user confirms Analyse with a trade window and size.
 * Live re-evaluation runs until `endsAt` (or a terminal lifecycle), then
 * `status` becomes COMPLETE and polling stops.
 */
export interface TradeIntent {
  /** User-selected advisory window length. */
  windowMinutes: number;
  /** Absolute end of the live session. */
  endsAt: number;
  /** Intended notional or % of account — never executed by this app. */
  sizeAmount: number;
  sizeUnit: TradeSizeUnit;
  status: 'ACTIVE' | 'COMPLETE';
}

/** Plain-language action derived from the live verdict. */
export type TradeAction = 'TRADE' | 'DONT_TRADE' | 'WAIT';

export interface SignalRecord {
  id: string;
  userId: string;
  timestamp: number;
  instrumentId: string;
  provider: ProviderId;
  displaySymbol: string;
  assetClass: AssetClass;
  timeframe: Timeframe;
  priceAtSignal: number;
  currency: string;
  ai: AIAnalysis;
  analysis: MarketAnalysis;
  quality: SignalQuality;
  advice: TradeAdvice;
  /** Timed window + intended size chosen at Analyse time. */
  tradeIntent?: TradeIntent;
  /** Set when the user chooses to follow a signal, for outcome scoring. */
  tracked: boolean;
  outcome?: 'CORRECT' | 'INCORRECT' | 'NEUTRAL' | 'PENDING';
  outcomeCheckedAt?: number;
  outcomeNote?: string;
  /** Price movement achieved before resolution, in percent. */
  outcomePercent?: number;
}

// ------------------------------------------------------------------ tracking

/**
 * A signal the user decided to follow. This is a JOURNAL ENTRY, not a position:
 * the application never opened anything and holds no funds.
 */
export interface TrackedSignal {
  id: string;
  userId: string;
  signalId: string;
  instrumentId: string;
  displaySymbol: string;
  provider: ProviderId;
  assetClass: AssetClass;
  direction: Direction;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  currency: string;
  timeframe: Timeframe;
  openedAt: number;
  status: 'ACTIVE' | 'HIT_TARGET' | 'HIT_STOP' | 'CLOSED_MANUALLY' | 'EXPIRED';
  closedAt?: number;
  closePrice?: number;
  resultPercent?: number;
  /** Optional user note, e.g. how much they actually risked elsewhere. */
  note?: string;
  aiConfidence: number;
  technicalScore: number;
  finalScore: number;
}

/** A tracked signal enriched with the live price. */
export interface TrackedSignalView extends TrackedSignal {
  currentPrice: number | null;
  unrealizedPercent: number | null;
  /** Progress toward target, 0-100; negative means moving toward the stop. */
  progressPercent: number | null;
  durationMs: number;
}

// ------------------------------------------------------------------ settings

/**
 * User preferences. Note the absence of any exchange credentials: this
 * application never holds them because it never trades.
 */
export interface ServerSettings {
  aiModel: string;
  aiTemperature: number;

  /** Advisory thresholds used to produce the verdict. */
  minSignalQuality: number;
  minRiskReward: number;
  accountRiskPercent: number;
  maxSignalsPerDay: number;
  cooldownMinutes: number;
  requireStopLoss: boolean;
  maxMarketDataAgeSeconds: number;

  defaultTimeframe: Timeframe;
  favourites: string[];
}

export const DEFAULT_SERVER_SETTINGS: ServerSettings = {
  aiModel: 'google/gemini-2.5-flash',
  aiTemperature: 0.2,

  minSignalQuality: 60,
  minRiskReward: 1.5,
  accountRiskPercent: 1,
  maxSignalsPerDay: 25,
  cooldownMinutes: 0,
  requireStopLoss: true,
  maxMarketDataAgeSeconds: 120,

  defaultTimeframe: '1h',
  favourites: ['binance:BTCUSDT', 'binance:ETHUSDT', 'binance:SOLUSDT'],
};

// --------------------------------------------------------------- performance

export interface SignalStats {
  totalSignals: number;
  tracked: number;
  correct: number;
  incorrect: number;
  neutral: number;
  pending: number;
  accuracy: number | null;
  averageWinPercent: number;
  averageLossPercent: number;
  bestPercent: number;
  worstPercent: number;
  currentStreak: number;
  currentStreakType: 'WIN' | 'LOSS' | 'NONE';
  /** Net percentage across resolved tracked signals. */
  netPercent: number;
}

// --------------------------------------------------------------- connections

export type ConnectionState =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'RECONNECTING'
  | 'ERROR'
  | 'UNAVAILABLE';

export interface ConnectionStatus {
  marketData: ConnectionState;
  ai: ConnectionState;
  providers: ProviderStatus[];
  details: {
    marketData?: string;
    ai?: string;
  };
}
