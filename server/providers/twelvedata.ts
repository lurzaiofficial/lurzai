/**
 * Twelve Data — stocks, forex, commodities, indices and ETFs.
 *
 * Docs: https://twelvedata.com/docs
 *
 * This is the only provider that needs a key, supplied by the operator via
 * TWELVEDATA_API_KEY. When absent the provider reports itself unavailable and
 * is simply excluded from search — it never degrades into fake data.
 *
 * The free tier is rate limited (~8 requests/minute), so the instrument list is
 * cached aggressively and quotes are cached for a few seconds.
 */

import {
  ProviderError,
  TtlCache,
  makeInstrumentId,
  providerFetch,
  type MarketDataProvider,
} from './types';
import { logger } from '../lib/logger';
import type { AssetClass, Candlestick, Instrument, Quote, Timeframe } from '../../shared/types';

const BASE_URL = 'https://api.twelvedata.com';

const INTERVALS: Record<Timeframe, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '1h': '1h',
  '4h': '4h',
  '1d': '1day',
};

const INTERVAL_SECONDS: Record<Timeframe, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
};

/**
 * A curated cross-asset universe.
 *
 * Twelve Data's full reference list runs to tens of thousands of rows across
 * several endpoints and would exhaust the free-tier quota on startup. This
 * covers the instruments a retail user actually searches for; anything else can
 * still be reached by typing its exact ticker, which resolves on demand.
 */
const CURATED: Array<{
  symbol: string;
  name: string;
  assetClass: AssetClass;
  currency: string;
  exchange?: string;
}> = [
  // US large caps
  { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'STOCK', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', assetClass: 'STOCK', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', assetClass: 'STOCK', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', assetClass: 'STOCK', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', assetClass: 'STOCK', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'META', name: 'Meta Platforms Inc.', assetClass: 'STOCK', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'TSLA', name: 'Tesla Inc.', assetClass: 'STOCK', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'NFLX', name: 'Netflix Inc.', assetClass: 'STOCK', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'AMD', name: 'Advanced Micro Devices', assetClass: 'STOCK', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'INTC', name: 'Intel Corporation', assetClass: 'STOCK', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'BABA', name: 'Alibaba Group', assetClass: 'STOCK', currency: 'USD', exchange: 'NYSE' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', assetClass: 'STOCK', currency: 'USD', exchange: 'NYSE' },
  { symbol: 'V', name: 'Visa Inc.', assetClass: 'STOCK', currency: 'USD', exchange: 'NYSE' },
  { symbol: 'WMT', name: 'Walmart Inc.', assetClass: 'STOCK', currency: 'USD', exchange: 'NYSE' },
  { symbol: 'DIS', name: 'The Walt Disney Company', assetClass: 'STOCK', currency: 'USD', exchange: 'NYSE' },
  { symbol: 'BA', name: 'The Boeing Company', assetClass: 'STOCK', currency: 'USD', exchange: 'NYSE' },
  { symbol: 'KO', name: 'The Coca-Cola Company', assetClass: 'STOCK', currency: 'USD', exchange: 'NYSE' },
  { symbol: 'PFE', name: 'Pfizer Inc.', assetClass: 'STOCK', currency: 'USD', exchange: 'NYSE' },
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', assetClass: 'STOCK', currency: 'USD', exchange: 'NYSE' },
  { symbol: 'COIN', name: 'Coinbase Global Inc.', assetClass: 'STOCK', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'PLTR', name: 'Palantir Technologies', assetClass: 'STOCK', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'UBER', name: 'Uber Technologies', assetClass: 'STOCK', currency: 'USD', exchange: 'NYSE' },

  // ETFs and indices
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', assetClass: 'ETF', currency: 'USD', exchange: 'NYSE' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', assetClass: 'ETF', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', assetClass: 'ETF', currency: 'USD', exchange: 'NYSE' },
  { symbol: 'GLD', name: 'SPDR Gold Shares', assetClass: 'ETF', currency: 'USD', exchange: 'NYSE' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', assetClass: 'ETF', currency: 'USD', exchange: 'NYSE' },

  // Forex majors and popular crosses
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', assetClass: 'FOREX', currency: 'USD' },
  { symbol: 'GBP/USD', name: 'British Pound / US Dollar', assetClass: 'FOREX', currency: 'USD' },
  { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', assetClass: 'FOREX', currency: 'JPY' },
  { symbol: 'USD/CHF', name: 'US Dollar / Swiss Franc', assetClass: 'FOREX', currency: 'CHF' },
  { symbol: 'AUD/USD', name: 'Australian Dollar / US Dollar', assetClass: 'FOREX', currency: 'USD' },
  { symbol: 'USD/CAD', name: 'US Dollar / Canadian Dollar', assetClass: 'FOREX', currency: 'CAD' },
  { symbol: 'NZD/USD', name: 'New Zealand Dollar / US Dollar', assetClass: 'FOREX', currency: 'USD' },
  { symbol: 'EUR/GBP', name: 'Euro / British Pound', assetClass: 'FOREX', currency: 'GBP' },
  { symbol: 'EUR/JPY', name: 'Euro / Japanese Yen', assetClass: 'FOREX', currency: 'JPY' },
  { symbol: 'GBP/JPY', name: 'British Pound / Japanese Yen', assetClass: 'FOREX', currency: 'JPY' },
  { symbol: 'USD/INR', name: 'US Dollar / Indian Rupee', assetClass: 'FOREX', currency: 'INR' },
  { symbol: 'USD/LKR', name: 'US Dollar / Sri Lankan Rupee', assetClass: 'FOREX', currency: 'LKR' },

  // Commodities
  { symbol: 'XAU/USD', name: 'Gold Spot', assetClass: 'COMMODITY', currency: 'USD' },
  { symbol: 'XAG/USD', name: 'Silver Spot', assetClass: 'COMMODITY', currency: 'USD' },
  { symbol: 'XPT/USD', name: 'Platinum Spot', assetClass: 'COMMODITY', currency: 'USD' },
  { symbol: 'WTI/USD', name: 'Crude Oil (WTI)', assetClass: 'COMMODITY', currency: 'USD' },
  { symbol: 'BRENT/USD', name: 'Crude Oil (Brent)', assetClass: 'COMMODITY', currency: 'USD' },
  { symbol: 'NG/USD', name: 'Natural Gas', assetClass: 'COMMODITY', currency: 'USD' },
  { symbol: 'XCU/USD', name: 'Copper', assetClass: 'COMMODITY', currency: 'USD' },
];

export class TwelveDataProvider implements MarketDataProvider {
  readonly id = 'twelvedata' as const;
  readonly label = 'Twelve Data';
  readonly assetClasses: AssetClass[] = ['STOCK', 'FOREX', 'COMMODITY', 'INDEX', 'ETF'];
  readonly requiresKey = true;
  readonly supportsStreaming = false;

  private instruments = new TtlCache<Instrument[]>(24 * 60 * 60 * 1000);
  /** Short-lived quote cache to protect the free-tier request budget. */
  private quoteCache = new Map<string, { value: Quote; expiresAt: number }>();
  /** Symbols resolved on demand that were not in the curated list. */
  private resolved = new Map<string, Instrument>();

  private get apiKey(): string | undefined {
    return process.env.TWELVEDATA_API_KEY || undefined;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  unavailableReason(): string | undefined {
    return this.isAvailable()
      ? undefined
      : 'Stocks, forex and commodities need a Twelve Data API key. Set TWELVEDATA_API_KEY on the server.';
  }

  private requireKey(): string {
    const key = this.apiKey;
    if (!key) {
      throw new ProviderError('Twelve Data API key not configured', this.id, 503,
        this.unavailableReason());
    }
    return key;
  }

  private toInstrument(entry: (typeof CURATED)[number]): Instrument {
    const [base, quote] = entry.symbol.includes('/')
      ? entry.symbol.split('/')
      : [entry.symbol, entry.currency];

    return {
      id: makeInstrumentId(this.id, entry.symbol),
      provider: this.id,
      providerLabel: this.label,
      providerSymbol: entry.symbol,
      displaySymbol: entry.symbol,
      name: entry.name,
      assetClass: entry.assetClass,
      baseAsset: base,
      quoteAsset: quote,
      currency: entry.currency,
      exchange: entry.exchange,
    };
  }

  async listInstruments(): Promise<Instrument[]> {
    if (!this.isAvailable()) return [];
    return this.instruments.get(async () => {
      const list = CURATED.map((c) => this.toInstrument(c));
      logger.info('twelvedata: instrument list loaded', { count: list.length });
      return list;
    });
  }

  /**
   * Resolves a symbol, falling back to the reference API for anything outside
   * the curated list, so an arbitrary valid ticker still works.
   */
  async getInstrument(providerSymbol: string): Promise<Instrument | null> {
    if (!this.isAvailable()) return null;

    const wanted = providerSymbol.toUpperCase();

    const curated = CURATED.find((c) => c.symbol.toUpperCase() === wanted);
    if (curated) return this.toInstrument(curated);

    const cached = this.resolved.get(wanted);
    if (cached) return cached;

    try {
      const data = await providerFetch<any>(
        this.id,
        `${BASE_URL}/symbol_search?symbol=${encodeURIComponent(wanted)}&outputsize=1&apikey=${this.requireKey()}`
      );
      const match = data?.data?.[0];
      if (!match) return null;

      const assetClass: AssetClass =
        /etf/i.test(match.instrument_type || '') ? 'ETF'
        : /index/i.test(match.instrument_type || '') ? 'INDEX'
        : 'STOCK';

      const instrument: Instrument = {
        id: makeInstrumentId(this.id, match.symbol),
        provider: this.id,
        providerLabel: this.label,
        providerSymbol: match.symbol,
        displaySymbol: match.symbol,
        name: match.instrument_name || match.symbol,
        assetClass,
        baseAsset: match.symbol,
        quoteAsset: match.currency || 'USD',
        currency: match.currency || 'USD',
        exchange: match.exchange,
      };

      this.resolved.set(wanted, instrument);
      return instrument;
    } catch (err) {
      logger.warn('twelvedata: symbol resolution failed', { symbol: wanted, err });
      return null;
    }
  }

  async getQuote(instrument: Instrument): Promise<Quote> {
    const cached = this.quoteCache.get(instrument.providerSymbol);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const data = await providerFetch<any>(
      this.id,
      `${BASE_URL}/quote?symbol=${encodeURIComponent(instrument.providerSymbol)}&apikey=${this.requireKey()}`
    );

    // Twelve Data signals errors inside a 200 response.
    if (data?.status === 'error' || data?.code >= 400) {
      throw new ProviderError(
        `Twelve Data error: ${data?.message || 'unknown'}`,
        this.id,
        data?.code === 429 ? 429 : 502,
        data?.code === 429
          ? 'The market data plan has hit its request limit. Please wait a minute and try again.'
          : `Twelve Data could not return a price for ${instrument.displaySymbol}.`
      );
    }

    const price = parseFloat(data.close ?? data.price);
    if (!Number.isFinite(price)) {
      throw new ProviderError('Twelve Data returned no price', this.id, 502,
        `No price is currently available for ${instrument.displaySymbol}.`);
    }

    const quote: Quote = {
      instrumentId: instrument.id,
      displaySymbol: instrument.displaySymbol,
      price,
      change24h: parseFloat(data.change) || 0,
      change24hPercent: parseFloat(data.percent_change) || 0,
      high24h: parseFloat(data.high) || null,
      low24h: parseFloat(data.low) || null,
      volume24h: parseFloat(data.volume) || null,
      currency: instrument.currency,
      fetchedAt: Date.now(),
      // Reported by the API for exchange-traded instruments outside session hours.
      marketClosed: data?.is_market_open === false,
    };

    this.quoteCache.set(instrument.providerSymbol, { value: quote, expiresAt: Date.now() + 10_000 });
    return quote;
  }

  async getCandles(
    instrument: Instrument,
    timeframe: Timeframe,
    limit: number
  ): Promise<Candlestick[]> {
    const interval = INTERVALS[timeframe];
    if (!interval) {
      throw new ProviderError(`Unsupported timeframe ${timeframe}`, this.id, 400,
        `The ${timeframe} timeframe is not supported for this market.`);
    }

    const data = await providerFetch<any>(
      this.id,
      `${BASE_URL}/time_series?symbol=${encodeURIComponent(instrument.providerSymbol)}` +
        `&interval=${interval}&outputsize=${Math.min(limit, 5000)}&order=ASC&apikey=${this.requireKey()}`
    );

    if (data?.status === 'error' || data?.code >= 400) {
      throw new ProviderError(
        `Twelve Data error: ${data?.message || 'unknown'}`,
        this.id,
        data?.code === 429 ? 429 : 502,
        data?.code === 429
          ? 'The market data plan has hit its request limit. Please wait a minute and try again.'
          : `Twelve Data could not return candles for ${instrument.displaySymbol}.`
      );
    }

    const values = data?.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new ProviderError('Twelve Data returned no candles', this.id, 502,
        `No historical data is available for ${instrument.displaySymbol} on ${timeframe}.`);
    }

    const now = Math.floor(Date.now() / 1000);
    const seconds = INTERVAL_SECONDS[timeframe];

    return values
      .map((v: any) => {
        // Timestamps are exchange-local strings; parse as UTC for consistency.
        const time = Math.floor(new Date(v.datetime.replace(' ', 'T') + 'Z').getTime() / 1000);
        return {
          time,
          open: parseFloat(v.open),
          high: parseFloat(v.high),
          low: parseFloat(v.low),
          close: parseFloat(v.close),
          volume: parseFloat(v.volume) || 0,
          closed: time + seconds <= now,
        };
      })
      .filter((c: Candlestick) => Number.isFinite(c.time) && Number.isFinite(c.close))
      .sort((a: Candlestick, b: Candlestick) => a.time - b.time);
  }
}
