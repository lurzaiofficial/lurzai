/**
 * Bybit v5 public spot market data.
 *
 * Docs: https://bybit-exchange.github.io/docs/v5/intro
 * Public endpoints only.
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

const BASE_URL = 'https://api.bybit.com';

/** Bybit kline intervals: minutes as digits, or D/W/M. */
const INTERVALS: Record<Timeframe, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
};

const INTERVAL_SECONDS: Record<Timeframe, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
};

/** Bybit wraps every response; a non-zero retCode is a failure. */
function unwrap<T>(data: any, providerId: 'bybit', context: string): T {
  if (data?.retCode !== 0) {
    throw new ProviderError(
      `Bybit ${context} failed: ${data?.retMsg || 'unknown error'}`,
      providerId,
      502,
      `Bybit could not return ${context}.`
    );
  }
  return data.result as T;
}

export class BybitProvider implements MarketDataProvider {
  readonly id = 'bybit' as const;
  readonly label = 'Bybit';
  readonly assetClasses: AssetClass[] = ['CRYPTO'];
  readonly requiresKey = false;
  readonly supportsStreaming = true;

  private instruments = new TtlCache<Instrument[]>(60 * 60 * 1000);

  isAvailable(): boolean {
    return true;
  }

  unavailableReason(): string | undefined {
    return undefined;
  }

  async listInstruments(): Promise<Instrument[]> {
    return this.instruments.get(async () => {
      const data = await providerFetch<any>(
        this.id,
        `${BASE_URL}/v5/market/instruments-info?category=spot&limit=1000`,
        { timeoutMs: 20000 }
      );
      const result = unwrap<any>(data, this.id, 'its market list');

      const list: Instrument[] = (result?.list || [])
        .filter((s: any) => s.status === 'Trading')
        .map((s: any) => ({
          id: makeInstrumentId(this.id, s.symbol),
          provider: this.id,
          providerLabel: this.label,
          providerSymbol: s.symbol,
          displaySymbol: `${s.baseCoin}/${s.quoteCoin}`,
          name: s.baseCoin,
          assetClass: 'CRYPTO' as const,
          baseAsset: s.baseCoin,
          quoteAsset: s.quoteCoin,
          currency: s.quoteCoin,
        }));

      logger.info('bybit: instrument list loaded', { count: list.length });
      return list;
    });
  }

  async getInstrument(providerSymbol: string): Promise<Instrument | null> {
    const all = await this.listInstruments();
    const wanted = providerSymbol.toUpperCase();
    return all.find((i) => i.providerSymbol === wanted) || null;
  }

  async getQuote(instrument: Instrument): Promise<Quote> {
    const data = await providerFetch<any>(
      this.id,
      `${BASE_URL}/v5/market/tickers?category=spot&symbol=${instrument.providerSymbol}`
    );
    const result = unwrap<any>(data, this.id, 'a price');
    const t = result?.list?.[0];

    if (!t) {
      throw new ProviderError('Bybit returned no ticker', this.id, 404,
        `Bybit has no price data for ${instrument.displaySymbol}.`);
    }

    const price = parseFloat(t.lastPrice);
    const prev = parseFloat(t.prevPrice24h);

    return {
      instrumentId: instrument.id,
      displaySymbol: instrument.displaySymbol,
      price,
      change24h: Number.isFinite(prev) ? price - prev : 0,
      // Bybit reports this as a ratio, e.g. 0.0123 = 1.23%.
      change24hPercent: parseFloat(t.price24hPcnt) * 100,
      high24h: parseFloat(t.highPrice24h) || null,
      low24h: parseFloat(t.lowPrice24h) || null,
      volume24h: parseFloat(t.turnover24h) || null,
      currency: instrument.currency,
      fetchedAt: Date.now(),
    };
  }

  async getCandles(
    instrument: Instrument,
    timeframe: Timeframe,
    limit: number
  ): Promise<Candlestick[]> {
    const interval = INTERVALS[timeframe];
    if (!interval) {
      throw new ProviderError(`Unsupported timeframe ${timeframe}`, this.id, 400,
        `Bybit does not support the ${timeframe} timeframe.`);
    }

    const data = await providerFetch<any>(
      this.id,
      `${BASE_URL}/v5/market/kline?category=spot&symbol=${instrument.providerSymbol}` +
        `&interval=${interval}&limit=${Math.min(limit, 1000)}`
    );
    const result = unwrap<any>(data, this.id, 'candles');

    const now = Math.floor(Date.now() / 1000);
    const seconds = INTERVAL_SECONDS[timeframe];

    // Rows are [start, open, high, low, close, volume, turnover], newest first.
    return (result?.list || [])
      .map((r: string[]) => {
        const time = Math.floor(Number(r[0]) / 1000);
        return {
          time,
          open: parseFloat(r[1]),
          high: parseFloat(r[2]),
          low: parseFloat(r[3]),
          close: parseFloat(r[4]),
          volume: parseFloat(r[5]),
          closed: time + seconds <= now,
        };
      })
      .sort((a: Candlestick, b: Candlestick) => a.time - b.time);
  }

  getStreamConfig(instrument: Instrument, timeframe: Timeframe) {
    return {
      kind: this.id,
      url: 'wss://stream.bybit.com/v5/public/spot',
      // Bybit requires an explicit subscribe frame after the socket opens.
      subscribe: {
        op: 'subscribe',
        args: [
          `tickers.${instrument.providerSymbol}`,
          `kline.${INTERVALS[timeframe]}.${instrument.providerSymbol}`,
        ],
      },
    };
  }
}
