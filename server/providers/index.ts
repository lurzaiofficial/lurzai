/**
 * Provider registry and unified instrument search.
 *
 * Owns the ranking logic that makes typing a letter useful: entering "B" lists
 * BTC, BNB, BCH, BA (Boeing) and so on — instruments whose ticker STARTS with
 * "B" — rather than an arbitrary set that merely contains the letter.
 */

import { BinanceProvider } from './binance';
import { BybitProvider } from './bybit';
import { CoinbaseProvider } from './coinbase';
import { KrakenProvider } from './kraken';
import { OkxProvider } from './okx';
import { TwelveDataProvider } from './twelvedata';
import { ProviderError, parseInstrumentId, type MarketDataProvider } from './types';
import { logger } from '../lib/logger';
import type { AssetClass, Instrument, ProviderId, ProviderStatus } from '../../shared/types';

const providers: MarketDataProvider[] = [
  new BinanceProvider(),
  new CoinbaseProvider(),
  new KrakenProvider(),
  new BybitProvider(),
  new OkxProvider(),
  new TwelveDataProvider(),
];

const byId = new Map<ProviderId, MarketDataProvider>(providers.map((p) => [p.id, p]));

export function getProvider(id: ProviderId): MarketDataProvider {
  const provider = byId.get(id);
  if (!provider) {
    throw new ProviderError(`Unknown provider ${id}`, id, 404, `Unknown data source "${id}".`);
  }
  return provider;
}

export function listProviders(): ProviderStatus[] {
  return providers.map((p) => ({
    id: p.id,
    label: p.label,
    assetClasses: p.assetClasses,
    available: p.isAvailable(),
    reason: p.unavailableReason(),
    requiresKey: p.requiresKey,
    supportsStreaming: p.supportsStreaming,
  }));
}

/** Resolves a canonical `provider:symbol` id to a full instrument record. */
export async function resolveInstrument(instrumentId: string): Promise<Instrument> {
  const parsed = parseInstrumentId(instrumentId);
  if (!parsed) {
    throw new ProviderError(`Malformed instrument id ${instrumentId}`, 'binance', 400,
      'That market identifier is not valid.');
  }

  const provider = getProvider(parsed.provider);
  if (!provider.isAvailable()) {
    throw new ProviderError(`${provider.label} unavailable`, provider.id, 503,
      provider.unavailableReason());
  }

  const instrument = await provider.getInstrument(parsed.providerSymbol);
  if (!instrument) {
    throw new ProviderError(`Instrument not found: ${instrumentId}`, provider.id, 404,
      `${parsed.providerSymbol} was not found on ${provider.label}.`);
  }
  return instrument;
}

// ------------------------------------------------------------------ ranking

/** Quote assets preferred when two matches are otherwise equal. */
const QUOTE_PRIORITY: Record<string, number> = {
  USDT: 0, USD: 0, USDC: 1, FDUSD: 1, EUR: 2, GBP: 2, BTC: 3, ETH: 4, BNB: 5,
};

/** Venue preference, so the same coin does not fill the list five times over. */
const PROVIDER_PRIORITY: Record<ProviderId, number> = {
  // Prefer venues that work from common serverless regions (Binance often 451s).
  coinbase: 0,
  twelvedata: 0,
  kraken: 1,
  bybit: 2,
  okx: 3,
  binance: 4,
};

/** Instruments that should surface first when they tie on match quality. */
const MAJORS = new Set([
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'DOT', 'MATIC', 'LTC', 'TRX',
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'SPY', 'QQQ',
  'EUR', 'GBP', 'USD', 'JPY', 'XAU', 'XAG',
]);

/**
 * Scores an instrument against a query. LOWER IS BETTER; -1 means no match.
 *
 * Tiers, in order of usefulness to someone typing:
 *    0  exact ticker match          "AAPL" -> AAPL
 *   10  base asset starts with query "B"   -> BTC, BNB, BCH, BA
 *   20  display symbol starts        "BTC/" -> BTC/USDT
 *   30  full pair symbol starts      "BTCU" -> BTCUSDT
 *   40  name starts with query       "app" -> Apple Inc.
 *   50  name contains query          "cola" -> The Coca-Cola Company
 *   60  base contains query          "NB"  -> BNB
 *   -1  no match
 *
 * Tie-breakers add at most ~9 so they can never promote a lower tier above a
 * higher one.
 */
export function scoreInstrument(instrument: Instrument, query: string): number {
  const q = query.trim().toUpperCase();
  if (!q) return 100;

  // Compare ignoring separators so "btcusdt", "btc/usdt" and "BTC-USDT" all work.
  const stripped = q.replace(/[\/\-_\s]/g, '');
  const base = instrument.baseAsset.toUpperCase();
  const display = instrument.displaySymbol.toUpperCase();
  const displayStripped = display.replace(/[\/\-_\s]/g, '');
  const providerSymbol = instrument.providerSymbol.toUpperCase().replace(/[\/\-_\s]/g, '');
  const name = instrument.name.toUpperCase();

  let tier: number;

  if (base === q || display === q || providerSymbol === stripped) tier = 0;
  else if (base.startsWith(stripped)) tier = 10;
  else if (display.startsWith(q) || displayStripped.startsWith(stripped)) tier = 20;
  else if (providerSymbol.startsWith(stripped)) tier = 30;
  else if (name.startsWith(q)) tier = 40;
  else if (name.includes(q) && q.length >= 2) tier = 50;
  else if (base.includes(stripped) && stripped.length >= 2) tier = 60;
  else return -1;

  // --- tie-breakers (max ~9 total)
  let score = tier;
  score += Math.min(QUOTE_PRIORITY[instrument.quoteAsset.toUpperCase()] ?? 6, 6); // 0-6
  score += MAJORS.has(base) ? 0 : 1;                                              // 0-1
  score += PROVIDER_PRIORITY[instrument.provider] * 0.1;                          // 0-0.4
  score += Math.min(base.length / 100, 0.09);                                     // prefer short tickers

  return score;
}

export interface SearchOptions {
  limit?: number;
  assetClass?: AssetClass;
  provider?: ProviderId;
}

/**
 * Searches every available provider and returns a single ranked list.
 *
 * A provider that fails is skipped rather than failing the whole search — one
 * exchange being down must not break symbol lookup for the others.
 */
export async function searchInstruments(
  query: string,
  options: SearchOptions = {}
): Promise<Instrument[]> {
  const { limit = 25, assetClass, provider } = options;

  const active = providers.filter((p) => {
    if (!p.isAvailable()) return false;
    if (provider && p.id !== provider) return false;
    if (assetClass && !p.assetClasses.includes(assetClass)) return false;
    return true;
  });

  const lists = await Promise.all(
    active.map(async (p) => {
      try {
        return await p.listInstruments();
      } catch (err) {
        logger.warn('search: provider list failed, skipping', { provider: p.id, err });
        return [] as Instrument[];
      }
    })
  );

  const q = query.trim();
  const scored: Array<{ instrument: Instrument; score: number }> = [];

  for (const list of lists) {
    for (const instrument of list) {
      if (assetClass && instrument.assetClass !== assetClass) continue;
      const score = scoreInstrument(instrument, q);
      if (score >= 0) scored.push({ instrument, score });
    }
  }

  scored.sort((a, b) =>
    a.score !== b.score
      ? a.score - b.score
      : a.instrument.displaySymbol.localeCompare(b.instrument.displaySymbol)
  );

  // Collapse duplicates of the same asset+quote across venues, keeping the
  // best-ranked one, so "B" does not return BTC/USDT five times.
  const seen = new Set<string>();
  const results: Instrument[] = [];

  for (const { instrument } of scored) {
    const key = `${instrument.assetClass}:${instrument.baseAsset}/${instrument.quoteAsset}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(instrument);
    if (results.length >= limit) break;
  }

  // If the query looks like an exact ticker nobody listed, try resolving it
  // on demand (covers stocks outside the curated Twelve Data universe).
  if (results.length === 0 && q.length >= 1 && !provider) {
    const td = byId.get('twelvedata');
    if (td?.isAvailable()) {
      const resolved = await td.getInstrument(q).catch(() => null);
      if (resolved) results.push(resolved);
    }
  }

  return results;
}

/** Preloads instrument lists so the first keystroke is fast. */
export async function warmProviderCaches(): Promise<void> {
  await Promise.all(
    providers
      .filter((p) => p.isAvailable())
      .map((p) =>
        p.listInstruments().catch((err) => {
          logger.warn('search: cache warm failed', { provider: p.id, err });
        })
      )
  );
}
