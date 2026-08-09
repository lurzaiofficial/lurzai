/**
 * Kraken public market data.
 *
 * Docs: https://docs.kraken.com/rest/
 * Kraken uses its own asset codes (XBT for BTC, ZUSD for USD), which are
 * normalized here so the rest of the application sees conventional names.
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

const BASE_URL = 'https://api.kraken.com/0/public';

/** Kraken OHLC interval, in minutes. */
const INTERVAL_MINUTES: Record<Timeframe, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '4h': 240,
  '1d': 1440,
};

/** Kraken's legacy asset codes mapped to conventional tickers. */
function normalizeAsset(code: string): string {
  const map: Record<string, string> = {
    XBT: 'BTC', XXBT: 'BTC', XDG: 'DOGE', XXDG: 'DOGE',
    ZUSD: 'USD', ZEUR: 'EUR', ZGBP: 'GBP', ZJPY: 'JPY', ZCAD: 'CAD', ZAUD: 'AUD',
    XETH: 'ETH', XLTC: 'LTC', XXRP: 'XRP', XXLM: 'XLM', XETC: 'ETC', XZEC: 'ZEC',
    XMLN: 'MLN', XREP: 'REP', XXMR: 'XMR',
  };
  return map[code] || code;
}

export class KrakenProvider implements MarketDataProvider {
  readonly id = 'kraken' as const;
  readonly label = 'Kraken';
  readonly assetClasses: AssetClass[] = ['CRYPTO'];
  readonly requiresKey = false;
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
      const data = await providerFetch<any>(this.id, `${BASE_URL}/AssetPairs`, { timeoutMs: 20000 });
      if (data?.error?.length) {
        throw new ProviderError(`Kraken error: ${data.error.join(', ')}`, this.id, 502,
          'Kraken could not return its market list.');
      }

      const list: Instrument[] = Object.entries<any>(data?.result || {})
        .filter(([, p]) => p.status === 'online')
        // Skip dark-pool duplicates, which are not generally accessible.
        .filter(([key]) => !key.endsWith('.d'))
        .map(([, p]) => {
          const base = normalizeAsset(p.base);
          const quote = normalizeAsset(p.quote);
          return {
            id: makeInstrumentId(this.id, p.altname),
            provider: this.id,
            providerLabel: this.label,
            providerSymbol: p.altname,
            displaySymbol: `${base}/${quote}`,
            name: base,
            assetClass: 'CRYPTO' as const,
            baseAsset: base,
            quoteAsset: quote,
            currency: quote,
          };
        });

      logger.info('kraken: instrument list loaded', { count: list.length });
      return list;
    });
  }

  async getInstrument(providerSymbol: string): Promise<Instrument | null> {
    const all = await this.listInstruments();
    const wanted = providerSymbol.toUpperCase();
    return all.find((i) => i.providerSymbol.toUpperCase() === wanted) || null;
  }

  async getQuote(instrument: Instrument): Promise<Quote> {
    const data = await providerFetch<any>(
      this.id,
      `${BASE_URL}/Ticker?pair=${encodeURIComponent(instrument.providerSymbol)}`
    );
    if (data?.error?.length) {
      throw new ProviderError(`Kraken error: ${data.error.join(', ')}`, this.id, 502,
        `Kraken could not return a price for ${instrument.displaySymbol}.`);
    }

    const entry = Object.values<any>(data?.result || {})[0];
    if (!entry) {
      throw new ProviderError('Kraken returned no ticker', this.id, 404,
        `Kraken has no price data for ${instrument.displaySymbol}.`);
    }

    const price = parseFloat(entry.c?.[0]);
    const open = parseFloat(entry.o);
    const change = Number.isFinite(open) && open > 0 ? price - open : 0;

    return {
      instrumentId: instrument.id,
      displaySymbol: instrument.displaySymbol,
      price,
      change24h: change,
      change24hPercent: open > 0 ? (change / open) * 100 : 0,
      // h/l are [today, last 24h]; the 24h figure is the second element.
      high24h: parseFloat(entry.h?.[1]) || null,
      low24h: parseFloat(entry.l?.[1]) || null,
      volume24h: parseFloat(entry.v?.[1]) * price || null,
      currency: instrument.currency,
      fetchedAt: Date.now(),
    };
  }

  async getCandles(
    instrument: Instrument,
    timeframe: Timeframe,
    limit: number
  ): Promise<Candlestick[]> {
    const interval = INTERVAL_MINUTES[timeframe];
    if (!interval) {
      throw new ProviderError(`Unsupported timeframe ${timeframe}`, this.id, 400,
        `Kraken does not support the ${timeframe} timeframe.`);
    }

    const data = await providerFetch<any>(
      this.id,
      `${BASE_URL}/OHLC?pair=${encodeURIComponent(instrument.providerSymbol)}&interval=${interval}`
    );
    if (data?.error?.length) {
      throw new ProviderError(`Kraken error: ${data.error.join(', ')}`, this.id, 502,
        `Kraken could not return candles for ${instrument.displaySymbol}.`);
    }

    const series = Object.entries<any>(data?.result || {}).find(([k]) => k !== 'last')?.[1];
    if (!Array.isArray(series)) {
      throw new ProviderError('Kraken returned no OHLC series', this.id, 502,
        `Kraken has no candle data for ${instrument.displaySymbol}.`);
    }

    const now = Math.floor(Date.now() / 1000);
    const seconds = interval * 60;

    // Rows are [time, open, high, low, close, vwap, volume, count].
    return series
      .map((r: any[]) => ({
        time: Number(r[0]),
        open: parseFloat(r[1]),
        high: parseFloat(r[2]),
        low: parseFloat(r[3]),
        close: parseFloat(r[4]),
        volume: parseFloat(r[6]),
        closed: Number(r[0]) + seconds <= now,
      }))
      .slice(-limit);
  }
}
