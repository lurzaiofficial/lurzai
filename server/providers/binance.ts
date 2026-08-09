/**
 * Binance Spot public market data.
 *
 * Public endpoints only — this application holds no Binance credentials and
 * never places orders.
 *
 * `api.binance.com` is frequently geo-blocked (HTTP 451) from cloud/US IPs
 * (including Vercel). Official market-data hosts (`data-api.binance.vision` /
 * `data-stream.binance.vision`) serve the same public REST + stream data and
 * are reachable from those regions.
 */

import {
  ProviderError,
  TtlCache,
  makeInstrumentId,
  providerFetch,
  type MarketDataProvider,
} from './types';
import { logger } from '../lib/logger';
import type {
  AssetClass,
  Candlestick,
  Instrument,
  Quote,
  Timeframe,
} from '../../shared/types';

/** Prefer the market-data host; fall back to classic API / regional mirrors. */
const REST_BASE_CANDIDATES = [
  process.env.BINANCE_BASE_URL,
  'https://data-api.binance.vision',
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api.binance.us',
].filter((u): u is string => Boolean(u && u.trim()));

const STREAM_BASE =
  process.env.BINANCE_STREAM_URL?.trim() || 'wss://data-stream.binance.vision';

const INTERVALS: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
};

/** Well-known base assets, used only to fill in a friendly display name. */
const ASSET_NAMES: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', BNB: 'BNB', SOL: 'Solana', XRP: 'Ripple',
  ADA: 'Cardano', DOGE: 'Dogecoin', AVAX: 'Avalanche', DOT: 'Polkadot',
  MATIC: 'Polygon', LINK: 'Chainlink', LTC: 'Litecoin', TRX: 'TRON',
  SHIB: 'Shiba Inu', UNI: 'Uniswap', ATOM: 'Cosmos', XLM: 'Stellar',
  NEAR: 'NEAR Protocol', APT: 'Aptos', ARB: 'Arbitrum', OP: 'Optimism',
  FIL: 'Filecoin', ICP: 'Internet Computer', HBAR: 'Hedera', VET: 'VeChain',
  INJ: 'Injective', SUI: 'Sui', SEI: 'Sei', TIA: 'Celestia', PEPE: 'Pepe',
  WIF: 'dogwifhat', BCH: 'Bitcoin Cash', ETC: 'Ethereum Classic',
  AAVE: 'Aave', MKR: 'Maker', RUNE: 'THORChain', ALGO: 'Algorand',
};

function isGeoBlockError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const status = err instanceof ProviderError ? err.httpStatus : 0;
  return (
    status === 451 ||
    message.includes('451') ||
    /unavailable.*region|restricted location|restricted access/i.test(message)
  );
}

export class BinanceProvider implements MarketDataProvider {
  readonly id = 'binance' as const;
  readonly label = 'Binance';
  readonly assetClasses: AssetClass[] = ['CRYPTO'];
  readonly requiresKey = false;
  readonly supportsStreaming = true;

  private instruments = new TtlCache<Instrument[]>(60 * 60 * 1000);
  /** Resolved REST host that answered successfully from this region. */
  private resolvedBaseUrl: string | null = null;
  private allHostsFailedReason: string | undefined;

  isAvailable(): boolean {
    return !this.allHostsFailedReason;
  }

  unavailableReason(): string | undefined {
    return this.allHostsFailedReason;
  }

  /** GET JSON from the first reachable Binance market-data host. */
  private async fetchFromBinance<T>(path: string, options?: { timeoutMs?: number }): Promise<T> {
    if (this.resolvedBaseUrl) {
      try {
        return await providerFetch<T>(this.id, `${this.resolvedBaseUrl}${path}`, options);
      } catch (err) {
        if (!isGeoBlockError(err)) throw err;
        // Cached host became blocked — rediscover.
        this.resolvedBaseUrl = null;
      }
    }

    const errors: string[] = [];
    for (const base of REST_BASE_CANDIDATES) {
      const url = `${base.replace(/\/$/, '')}${path}`;
      try {
        const data = await providerFetch<T>(this.id, url, options);
        this.resolvedBaseUrl = base.replace(/\/$/, '');
        this.allHostsFailedReason = undefined;
        logger.info('binance: using REST host', { base: this.resolvedBaseUrl });
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${base}: ${message.slice(0, 120)}`);
        if (!isGeoBlockError(err) && !(err instanceof ProviderError && err.httpStatus >= 500)) {
          // Non-geo client errors (400 etc.) won't be fixed by another host.
          if (err instanceof ProviderError && err.httpStatus > 0 && err.httpStatus < 500 && err.httpStatus !== 403 && err.httpStatus !== 451) {
            throw err;
          }
        }
      }
    }

    this.allHostsFailedReason =
      'Binance market data is unreachable from this server region.';
    throw new ProviderError(
      `Binance all hosts failed: ${errors.join(' | ')}`,
      this.id,
      451,
      this.allHostsFailedReason
    );
  }

  async listInstruments(): Promise<Instrument[]> {
    if (this.allHostsFailedReason) {
      throw new ProviderError(
        'Binance unavailable',
        this.id,
        451,
        this.allHostsFailedReason
      );
    }

    try {
      return await this.instruments.get(async () => {
        // `permissions=SPOT` is not supported on every host; try with, then without.
        let data: any;
        try {
          data = await this.fetchFromBinance<any>(
            '/api/v3/exchangeInfo?permissions=SPOT',
            { timeoutMs: 20000 }
          );
        } catch (err) {
          if (err instanceof ProviderError && (err.httpStatus === 400 || err.httpStatus === 404)) {
            data = await this.fetchFromBinance<any>('/api/v3/exchangeInfo', { timeoutMs: 20000 });
          } else {
            throw err;
          }
        }

        const list: Instrument[] = (data?.symbols || [])
          .filter((s: any) => {
            if (s.status !== 'TRADING') return false;
            // Some hosts omit isSpotTradingAllowed; treat missing as allowed.
            if (s.isSpotTradingAllowed === false) return false;
            return true;
          })
          .map((s: any) => ({
            id: makeInstrumentId(this.id, s.symbol),
            provider: this.id,
            providerLabel: this.label,
            providerSymbol: s.symbol,
            displaySymbol: `${s.baseAsset}/${s.quoteAsset}`,
            name: ASSET_NAMES[s.baseAsset] || s.baseAsset,
            assetClass: 'CRYPTO' as const,
            baseAsset: s.baseAsset,
            quoteAsset: s.quoteAsset,
            currency: s.quoteAsset,
          }));

        logger.info('binance: instrument list loaded', {
          count: list.length,
          host: this.resolvedBaseUrl,
        });
        return list;
      });
    } catch (err) {
      if (isGeoBlockError(err) && !this.allHostsFailedReason) {
        this.allHostsFailedReason =
          'Binance market data is unreachable from this server region.';
      }
      throw err;
    }
  }

  async getInstrument(providerSymbol: string): Promise<Instrument | null> {
    const all = await this.listInstruments();
    const wanted = providerSymbol.toUpperCase();
    return all.find((i) => i.providerSymbol === wanted) || null;
  }

  async getQuote(instrument: Instrument): Promise<Quote> {
    const d = await this.fetchFromBinance<any>(
      `/api/v3/ticker/24hr?symbol=${instrument.providerSymbol}`
    );

    return {
      instrumentId: instrument.id,
      displaySymbol: instrument.displaySymbol,
      price: parseFloat(d.lastPrice),
      change24h: parseFloat(d.priceChange),
      change24hPercent: parseFloat(d.priceChangePercent),
      high24h: parseFloat(d.highPrice),
      low24h: parseFloat(d.lowPrice),
      volume24h: parseFloat(d.quoteVolume),
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
        `Binance does not support the ${timeframe} timeframe here.`);
    }

    const rows = await this.fetchFromBinance<any[]>(
      `/api/v3/klines?symbol=${instrument.providerSymbol}&interval=${interval}&limit=${Math.min(limit, 1000)}`
    );

    const now = Date.now();
    return rows.map((r) => ({
      time: Math.floor(r[0] / 1000),
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
      volume: parseFloat(r[5]),
      // r[6] is the close time; the final candle is still forming until then.
      closed: Number(r[6]) < now,
    }));
  }

  getStreamConfig(instrument: Instrument, timeframe: Timeframe) {
    const s = instrument.providerSymbol.toLowerCase();
    const base = STREAM_BASE.replace(/\/$/, '');
    return {
      kind: this.id,
      // Market-data stream host mirrors public kline/ticker feeds.
      url: `${base}/stream?streams=${s}@ticker/${s}@kline_${INTERVALS[timeframe]}`,
    };
  }
}
