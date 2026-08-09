/**
 * Market data provider contract.
 *
 * Every venue (Binance, Coinbase, Kraken, Bybit, OKX, Twelve Data) implements
 * this interface, so the analysis engine, the AI layer and the UI stay entirely
 * provider-agnostic. Adding a venue means adding one file, not touching the app.
 *
 * Rule for all implementations: never fabricate data. If a request fails, throw
 * a ProviderError; do not return an invented price or a synthetic candle.
 */

import type {
  AssetClass,
  Candlestick,
  Instrument,
  ProviderId,
  Quote,
  Timeframe,
} from '../../shared/types';

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderId,
    readonly httpStatus = 502,
    /** Message safe and useful to show a non-technical user. */
    readonly userMessage?: string
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface MarketDataProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly assetClasses: AssetClass[];
  /** True when the provider needs a server-side API key to function. */
  readonly requiresKey: boolean;
  /** True when a public WebSocket stream is available to the browser. */
  readonly supportsStreaming: boolean;

  /** Whether the provider can currently be used (e.g. key present). */
  isAvailable(): boolean;
  /** Reason it cannot be used, when unavailable. */
  unavailableReason(): string | undefined;

  /**
   * Full searchable instrument list. Implementations must cache internally —
   * this is called on every keystroke.
   */
  listInstruments(): Promise<Instrument[]>;

  /** Resolves a canonical instrument id back to its full record. */
  getInstrument(providerSymbol: string): Promise<Instrument | null>;

  getQuote(instrument: Instrument): Promise<Quote>;

  getCandles(instrument: Instrument, timeframe: Timeframe, limit: number): Promise<Candlestick[]>;

  /** Browser WebSocket URL and subscribe frame, when streaming is supported. */
  getStreamConfig?(
    instrument: Instrument,
    timeframe: Timeframe
  ): { url: string; subscribe?: unknown; kind: ProviderId } | null;
}

// ------------------------------------------------------------------ helpers

/** Builds the canonical application-wide instrument id. */
export function makeInstrumentId(provider: ProviderId, providerSymbol: string): string {
  return `${provider}:${providerSymbol}`;
}

/** Splits a canonical id back into its parts. */
export function parseInstrumentId(id: string): { provider: ProviderId; providerSymbol: string } | null {
  const index = id.indexOf(':');
  if (index <= 0) return null;
  return {
    provider: id.slice(0, index) as ProviderId,
    providerSymbol: id.slice(index + 1),
  };
}

/** Simple TTL cache used by every provider for its instrument list. */
export class TtlCache<T> {
  private value: T | null = null;
  private expiresAt = 0;
  private inflight: Promise<T> | null = null;

  constructor(private readonly ttlMs: number) {}

  /**
   * Returns the cached value, or loads it.
   * Concurrent callers share one in-flight request, so a user typing quickly on
   * a cold cache cannot trigger several large downloads at once.
   */
  async get(loader: () => Promise<T>): Promise<T> {
    if (this.value !== null && this.expiresAt > Date.now()) return this.value;
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      try {
        const loaded = await loader();
        this.value = loaded;
        this.expiresAt = Date.now() + this.ttlMs;
        return loaded;
      } finally {
        this.inflight = null;
      }
    })();

    return this.inflight;
  }

  peek(): T | null {
    return this.value !== null && this.expiresAt > Date.now() ? this.value : null;
  }
}

/** Shared fetch with timeout and consistent error translation. */
export async function providerFetch<T>(
  provider: ProviderId,
  url: string,
  options: { timeoutMs?: number; headers?: Record<string, string>; userMessage?: string } = {}
): Promise<T> {
  const { timeoutMs = 12000, headers, userMessage } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    const text = await res.text();

    if (!res.ok) {
      if (res.status === 429) {
        throw new ProviderError(
          `${provider} rate limited: ${text.slice(0, 200)}`,
          provider,
          429,
          `${provider} is rate limiting requests. Please wait a moment and try again.`
        );
      }
      throw new ProviderError(
        `${provider} request failed (${res.status}): ${text.slice(0, 200)}`,
        provider,
        res.status,
        userMessage || `${provider} returned an error (HTTP ${res.status}).`
      );
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ProviderError(
        `${provider} returned unparseable JSON`,
        provider,
        502,
        `${provider} returned an unreadable response.`
      );
    }
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new ProviderError(`${provider} timed out`, provider, 504,
        `${provider} did not respond in time. Check your connection and retry.`);
    }
    throw new ProviderError(
      `${provider} network error: ${(err as Error).message}`,
      provider,
      503,
      `Could not reach ${provider}.`
    );
  } finally {
    clearTimeout(timer);
  }
}
