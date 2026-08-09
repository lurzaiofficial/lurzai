/**
 * Coinbase Exchange public market data.
 *
 * Docs: https://docs.cdp.coinbase.com/exchange/reference
 * Public endpoints only; no credentials are used.
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

const BASE_URL = 'https://api.exchange.coinbase.com';

/** Coinbase granularity is expressed in seconds. */
const GRANULARITY: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  // Coinbase has no native 4h; 6h is the closest supported bucket.
  '4h': 21600,
  '1d': 86400,
};

export class CoinbaseProvider implements MarketDataProvider {
  readonly id = 'coinbase' as const;
  readonly label = 'Coinbase';
  readonly assetClasses: AssetClass[] = ['CRYPTO'];
  readonly requiresKey = false;
  // Coinbase does have a public feed, but candles are polled for simplicity.
  readonly supportsStreaming = false;

  private instruments = new TtlCache<Instrument[]>(60 * 60 * 1000);

  isAvailable(): boolean {
    return true;
  }

  unavailableReason(): string | undefined {
    return undefined;
  }

  async listInstruments(): Promise<Instrument[]> {
    return this.instruments.get(async () => {
      const data = await providerFetch<any[]>(this.id, `${BASE_URL}/products`, { timeoutMs: 20000 });

      const list: Instrument[] = (data || [])
        // Exclude delisted and non-trading products.
        .filter((p) => p.status === 'online' && !p.trading_disabled)
        .map((p) => ({
          id: makeInstrumentId(this.id, p.id),
          provider: this.id,
          providerLabel: this.label,
          providerSymbol: p.id, // e.g. BTC-USD
          displaySymbol: `${p.base_currency}/${p.quote_currency}`,
          name: p.display_name || p.base_currency,
          assetClass: 'CRYPTO' as const,
          baseAsset: p.base_currency,
          quoteAsset: p.quote_currency,
          currency: p.quote_currency,
        }));

      logger.info('coinbase: instrument list loaded', { count: list.length });
      return list;
    });
  }

  async getInstrument(providerSymbol: string): Promise<Instrument | null> {
    const all = await this.listInstruments();
    const wanted = providerSymbol.toUpperCase();
    return all.find((i) => i.providerSymbol.toUpperCase() === wanted) || null;
  }

  async getQuote(instrument: Instrument): Promise<Quote> {
    // Coinbase splits last price and 24h aggregates across two endpoints.
    const [ticker, stats] = await Promise.all([
      providerFetch<any>(this.id, `${BASE_URL}/products/${instrument.providerSymbol}/ticker`),
      providerFetch<any>(this.id, `${BASE_URL}/products/${instrument.providerSymbol}/stats`),
    ]);

    const price = parseFloat(ticker.price);
    const open = parseFloat(stats.open);
    const change = Number.isFinite(open) && open > 0 ? price - open : 0;

    return {
      instrumentId: instrument.id,
      displaySymbol: instrument.displaySymbol,
      price,
      change24h: change,
      change24hPercent: open > 0 ? (change / open) * 100 : 0,
      high24h: parseFloat(stats.high) || null,
      low24h: parseFloat(stats.low) || null,
      // Coinbase reports base volume; convert to quote terms for consistency.
      volume24h: parseFloat(stats.volume) * price || null,
      currency: instrument.currency,
      fetchedAt: Date.now(),
    };
  }

  async getCandles(
    instrument: Instrument,
    timeframe: Timeframe,
    limit: number
  ): Promise<Candlestick[]> {
    const granularity = GRANULARITY[timeframe];
    if (!granularity) {
      throw new ProviderError(`Unsupported timeframe ${timeframe}`, this.id, 400,
        `Coinbase does not support the ${timeframe} timeframe.`);
    }

    // Coinbase caps a response at 300 candles and requires an explicit window.
    const count = Math.min(limit, 300);
    const end = new Date();
    const start = new Date(end.getTime() - count * granularity * 1000);

    const rows = await providerFetch<any[]>(
      this.id,
      `${BASE_URL}/products/${instrument.providerSymbol}/candles` +
        `?granularity=${granularity}&start=${start.toISOString()}&end=${end.toISOString()}`
    );

    const now = Math.floor(Date.now() / 1000);

    // Rows are [time, low, high, open, close, volume], newest first.
    return (rows || [])
      .map((r) => ({
        time: Number(r[0]),
        low: Number(r[1]),
        high: Number(r[2]),
        open: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5]),
        closed: Number(r[0]) + granularity <= now,
      }))
      .sort((a, b) => a.time - b.time);
  }
}
