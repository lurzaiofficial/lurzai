/**
 * Binance Spot public market data.
 *
 * Public endpoints only — this application holds no Binance credentials and
 * never places orders.
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

const BASE_URL = process.env.BINANCE_BASE_URL || 'https://api.binance.com';

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

export class BinanceProvider implements MarketDataProvider {
  readonly id = 'binance' as const;
  readonly label = 'Binance';
  readonly assetClasses: AssetClass[] = ['CRYPTO'];
  readonly requiresKey = false;
  readonly supportsStreaming = true;

  private instruments = new TtlCache<Instrument[]>(60 * 60 * 1000);
  /** Set when Binance blocks the server region (common on Vercel US → HTTP 451). */
  private geoBlockedReason: string | undefined;

  isAvailable(): boolean {
    return !this.geoBlockedReason;
  }

  unavailableReason(): string | undefined {
    return this.geoBlockedReason;
  }

  async listInstruments(): Promise<Instrument[]> {
    if (this.geoBlockedReason) {
      throw new ProviderError(
        'Binance geo-blocked',
        this.id,
        451,
        this.geoBlockedReason
      );
    }

    try {
      return await this.instruments.get(async () => {
        const data = await providerFetch<any>(
          this.id,
          `${BASE_URL}/api/v3/exchangeInfo?permissions=SPOT`,
          { timeoutMs: 20000 }
        );

        const list: Instrument[] = (data?.symbols || [])
          // Only surface pairs a user can actually act on right now.
          .filter((s: any) => s.status === 'TRADING' && s.isSpotTradingAllowed)
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

        logger.info('binance: instrument list loaded', { count: list.length });
        return list;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('451') || /unavailable.*region|restricted location/i.test(message)) {
        this.geoBlockedReason =
          'Binance is blocked in this server region. Use Coinbase, Kraken, Bybit, or OKX instead.';
        logger.warn('binance: geo-blocked; marking unavailable', { message });
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
    const d = await providerFetch<any>(
      this.id,
      `${BASE_URL}/api/v3/ticker/24hr?symbol=${instrument.providerSymbol}`
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

    const rows = await providerFetch<any[]>(
      this.id,
      `${BASE_URL}/api/v3/klines?symbol=${instrument.providerSymbol}&interval=${interval}&limit=${Math.min(limit, 1000)}`
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
    return {
      kind: this.id,
      url: `wss://stream.binance.com:9443/stream?streams=${s}@ticker/${s}@kline_${INTERVALS[timeframe]}`,
    };
  }
}
