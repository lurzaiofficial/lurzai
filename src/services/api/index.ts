/**
 * Client API layer.
 *
 * Thin wrapper over the server endpoints. There are deliberately no fallbacks:
 * if the server or a market is unavailable the caller gets an error and the UI
 * says so. Inventing a plausible price would be worse than showing nothing.
 */

import type {
  Candlestick,
  ConnectionStatus,
  Instrument,
  LiveSignalState,
  MarketAnalysis,
  ProviderStatus,
  Quote,
  ServerSettings,
  SignalRecord,
  SignalStats,
  Timeframe,
  TradeIntent,
  TradeSizeUnit,
  TrackedSignal,
  TrackedSignalView,
  AssetClass,
} from '../../../shared/types';
import type { UserPlanView } from '../../../shared/plans';

export type { UserPlanView };

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly detail?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin', // carries the httpOnly session cookie
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    });
  } catch {
    throw new ApiError('Could not reach the server. Check that it is running.', 0);
  }

  const text = await res.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError('The server returned an unreadable response.', res.status);
    }
  }

  if (!res.ok) {
    throw new ApiError(body?.error || `Request failed (HTTP ${res.status}).`, res.status, body?.detail);
  }
  return body as T;
}

// ------------------------------------------------------------------ search

export const searchApi = {
  /** Ranked, prefix-first search across every available market. */
  search: (query: string, options: { limit?: number; assetClass?: AssetClass } = {}) => {
    const params = new URLSearchParams({ q: query });
    if (options.limit) params.set('limit', String(options.limit));
    if (options.assetClass) params.set('assetClass', options.assetClass);
    return request<Instrument[]>(`/search?${params.toString()}`);
  },

  getInstrument: (id: string) => request<Instrument>(`/instrument?id=${encodeURIComponent(id)}`),
};

// ------------------------------------------------------------------ market

export interface StreamConfigResponse {
  supported: boolean;
  config: { url: string; subscribe?: unknown; kind: string } | null;
  pollIntervalMs: number | null;
}

export const marketApi = {
  getQuote: (id: string) => request<Quote>(`/market/quote?id=${encodeURIComponent(id)}`),

  getCandles: (id: string, timeframe: Timeframe, limit = 300) =>
    request<Candlestick[]>(
      `/market/candles?id=${encodeURIComponent(id)}&timeframe=${timeframe}&limit=${limit}`
    ),

  getAnalysis: (id: string, timeframe: Timeframe) =>
    request<MarketAnalysis>(
      `/market/analysis?id=${encodeURIComponent(id)}&timeframe=${timeframe}`
    ),

  getStreamConfig: (id: string, timeframe: Timeframe) =>
    request<StreamConfigResponse>(
      `/market/stream-config?id=${encodeURIComponent(id)}&timeframe=${timeframe}`
    ),
};

// ------------------------------------------------------------------ status

export const statusApi = {
  get: () => request<ConnectionStatus>('/status'),
  providers: () => request<ProviderStatus[]>('/providers'),
};

// ---------------------------------------------------------------- settings

export const settingsApi = {
  get: () => request<ServerSettings>('/settings'),
  update: (patch: Partial<ServerSettings>) =>
    request<ServerSettings>('/settings', { method: 'PUT', body: JSON.stringify(patch) }),
};

export const planApi = {
  get: () => request<UserPlanView>('/plan'),
};

// ---------------------------------------------------------------- analysis

export interface AnalyzeResponse {
  signal: SignalRecord;
  quote: Quote;
  instrument: Instrument;
  notes: string[];
  model: string;
}

export interface LiveSignalResponse {
  live: LiveSignalState;
  quote: Quote;
  analysis: MarketAnalysis;
  tradeIntent: TradeIntent | null;
}

export interface AnalyzeRequest {
  instrumentId: string;
  timeframe: Timeframe;
  /** Timed advisory window in minutes. */
  windowMinutes: number;
  /** Intended size — advisory only. */
  sizeAmount: number;
  sizeUnit: TradeSizeUnit;
}

export const analysisApi = {
  analyze: (params: AnalyzeRequest) =>
    request<AnalyzeResponse>('/analyze', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  /** Re-checks an existing signal against the live price. No AI call involved. */
  live: (signalId: string) =>
    request<LiveSignalResponse>(`/signals/${encodeURIComponent(signalId)}/live`),
};

// ----------------------------------------------------------------- tracking

export const trackingApi = {
  list: () => request<TrackedSignalView[]>('/tracked'),

  track: (signalId: string, note?: string) =>
    request<{ tracked: TrackedSignal }>('/tracked', {
      method: 'POST',
      body: JSON.stringify({ signalId, note }),
    }),

  close: (id: string) =>
    request<{ tracked: TrackedSignal }>(`/tracked/${encodeURIComponent(id)}/close`, {
      method: 'POST',
    }),
};

// ------------------------------------------------------------------ history

export interface StatsResponse {
  stats: SignalStats;
  signalsToday: number;
  maxSignalsPerDay: number;
  plan: UserPlanView;
}

export const signalsApi = {
  list: (limit = 100) => request<SignalRecord[]>(`/signals?limit=${limit}`),
  evaluate: () =>
    request<{ updated: number; stats: SignalStats }>('/signals/evaluate', { method: 'POST' }),
};

export const statsApi = {
  get: () => request<StatsResponse>('/stats'),
};
