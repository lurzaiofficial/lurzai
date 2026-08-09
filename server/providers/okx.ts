/**
 * OKX v5 public spot market data.
 *
 * Docs: https://www.okx.com/docs-v5/en/
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

const BASE_URL = 'https://www.okx.com';

/** OKX uses uppercase suffixes for hour/day bars. */
const BAR: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
};

const INTERVAL_SECONDS: Record<Timeframe, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
};

function unwrap<T>(data: any, context: string): T {
  if (data?.code !== '0') {
    throw new ProviderError(
      `OKX ${context} failed: ${data?.msg || 'unknown error'}`,
      'okx',
      502,
      `OKX could not return ${context}.`
    );
  }
  return data.data as T;
}

export class OkxProvider implements MarketDataProvider {
  readonly id = 'okx' as const;
  readonly label = 'OKX';
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
        `${BASE_URL}/api/v5/public/instruments?instType=SPOT`,
        { timeoutMs: 20000 }
      );
      const rows = unwrap<any[]>(data, 'its market list');

      const list: Instrument[] = (rows || [])
        .filter((s) => s.state === 'live')
        .map((s) => ({
          id: makeInstrumentId(this.id, s.instId),
          provider: this.id,
          providerLabel: this.label,
          providerSymbol: s.instId, // e.g. BTC-USDT
          displaySymbol: `${s.baseCcy}/${s.quoteCcy}`,
          name: s.baseCcy,
          assetClass: 'CRYPTO' as const,
          baseAsset: s.baseCcy,
          quoteAsset: s.quoteCcy,
          currency: s.quoteCcy,
        }));

      logger.info('okx: instrument list loaded', { count: list.length });
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
      `${BASE_URL}/api/v5/market/ticker?instId=${instrument.providerSymbol}`
    );
    const rows = unwrap<any[]>(data, 'a price');
    const t = rows?.[0];

    if (!t) {
      throw new ProviderError('OKX returned no ticker', this.id, 404,
        `OKX has no price data for ${instrument.displaySymbol}.`);
    }

    const price = parseFloat(t.last);
    // OKX gives open price for the rolling 24h window as open24h.
    const open = parseFloat(t.open24h);
    const change = Number.isFinite(open) && open > 0 ? price - open : 0;

    return {
      instrumentId: instrument.id,
      displaySymbol: instrument.displaySymbol,
      price,
      change24h: change,
      change24hPercent: open > 0 ? (change / open) * 100 : 0,
      high24h: parseFloat(t.high24h) || null,
      low24h: parseFloat(t.low24h) || null,
      volume24h: parseFloat(t.volCcy24h) || null,
      currency: instrument.currency,
      fetchedAt: Date.now(),
    };
  }

  async getCandles(
    instrument: Instrument,
    timeframe: Timeframe,
    limit: number
  ): Promise<Candlestick[]> {
    const bar = BAR[timeframe];
    if (!bar) {
      throw new ProviderError(`Unsupported timeframe ${timeframe}`, this.id, 400,
        `OKX does not support the ${timeframe} timeframe.`);
    }

    const data = await providerFetch<any>(
      this.id,
      `${BASE_URL}/api/v5/market/candles?instId=${instrument.providerSymbol}` +
        `&bar=${bar}&limit=${Math.min(limit, 300)}`
    );
    const rows = unwrap<any[]>(data, 'candles');

    const now = Math.floor(Date.now() / 1000);
    const seconds = INTERVAL_SECONDS[timeframe];

    // Rows are [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm], newest first.
    return (rows || [])
      .map((r: string[]) => {
        const time = Math.floor(Number(r[0]) / 1000);
        return {
          time,
          open: parseFloat(r[1]),
          high: parseFloat(r[2]),
          low: parseFloat(r[3]),
          close: parseFloat(r[4]),
          volume: parseFloat(r[5]),
          // r[8] === '1' means the bar is confirmed/closed.
          closed: r[8] === '1' || time + seconds <= now,
        };
      })
      .sort((a: Candlestick, b: Candlestick) => a.time - b.time);
  }

  getStreamConfig(instrument: Instrument, timeframe: Timeframe) {
    return {
      kind: this.id,
      url: 'wss://ws.okx.com:8443/ws/v5/public',
      subscribe: {
        op: 'subscribe',
        args: [
          { channel: 'tickers', instId: instrument.providerSymbol },
          { channel: `candle${BAR[timeframe]}`, instId: instrument.providerSymbol },
        ],
      },
    };
  }
}
