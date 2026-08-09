/**
 * Unit tests for instrument search ranking.
 *
 * The central requirement: typing a letter must list markets whose ticker
 * STARTS with that letter first, rather than anything that merely contains it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreInstrument } from '../server/providers/index';
import type { AssetClass, Instrument, ProviderId } from '../shared/types';

function inst(
  overrides: Partial<Instrument> & { baseAsset: string; quoteAsset?: string }
): Instrument {
  const base = overrides.baseAsset;
  const quote = overrides.quoteAsset ?? 'USDT';
  return {
    id: `binance:${base}${quote}`,
    provider: (overrides.provider ?? 'binance') as ProviderId,
    providerLabel: overrides.providerLabel ?? 'Binance',
    providerSymbol: overrides.providerSymbol ?? `${base}${quote}`,
    displaySymbol: overrides.displaySymbol ?? `${base}/${quote}`,
    name: overrides.name ?? base,
    assetClass: (overrides.assetClass ?? 'CRYPTO') as AssetClass,
    baseAsset: base,
    quoteAsset: quote,
    currency: overrides.currency ?? quote,
    exchange: overrides.exchange,
  };
}

/** Sorts by score the way the registry does, returning display symbols. */
function rank(instruments: Instrument[], query: string): string[] {
  return instruments
    .map((i) => ({ i, score: scoreInstrument(i, query) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) =>
      a.score !== b.score
        ? a.score - b.score
        : a.i.displaySymbol.localeCompare(b.i.displaySymbol)
    )
    .map((x) => x.i.displaySymbol);
}

const BTC = inst({ baseAsset: 'BTC', name: 'Bitcoin' });
const BNB = inst({ baseAsset: 'BNB', name: 'BNB' });
const BCH = inst({ baseAsset: 'BCH', name: 'Bitcoin Cash' });
const ETH = inst({ baseAsset: 'ETH', name: 'Ethereum' });
const SOL = inst({ baseAsset: 'SOL', name: 'Solana' });
const ARB = inst({ baseAsset: 'ARB', name: 'Arbitrum' });
const AAPL = inst({
  baseAsset: 'AAPL', quoteAsset: 'USD', name: 'Apple Inc.',
  assetClass: 'STOCK', provider: 'twelvedata', displaySymbol: 'AAPL', providerSymbol: 'AAPL',
});
const BA = inst({
  baseAsset: 'BA', quoteAsset: 'USD', name: 'The Boeing Company',
  assetClass: 'STOCK', provider: 'twelvedata', displaySymbol: 'BA', providerSymbol: 'BA',
});
const KO = inst({
  baseAsset: 'KO', quoteAsset: 'USD', name: 'The Coca-Cola Company',
  assetClass: 'STOCK', provider: 'twelvedata', displaySymbol: 'KO', providerSymbol: 'KO',
});
const EURUSD = inst({
  baseAsset: 'EUR', quoteAsset: 'USD', name: 'Euro / US Dollar',
  assetClass: 'FOREX', provider: 'twelvedata', displaySymbol: 'EUR/USD', providerSymbol: 'EUR/USD',
});

const UNIVERSE = [BTC, BNB, BCH, ETH, SOL, ARB, AAPL, BA, KO, EURUSD];

// ------------------------------------------------------------ prefix search

test('a single letter returns only markets starting with it', () => {
  const results = rank(UNIVERSE, 'B');
  // Every result must begin with B; ETH/SOL/AAPL/KO must not appear.
  for (const symbol of results) {
    assert.ok(symbol.startsWith('B'), `"${symbol}" should not match query "B"`);
  }
  assert.ok(results.includes('BTC/USDT'));
  assert.ok(results.includes('BNB/USDT'));
  assert.ok(results.includes('BCH/USDT'));
  assert.ok(results.includes('BA'));
  assert.ok(!results.includes('ETH/USDT'));
  assert.ok(!results.includes('SOL/USDT'));
});

test('a major asset outranks a minor one on the same prefix', () => {
  const results = rank(UNIVERSE, 'B');
  // BTC is a major; BCH is not. BTC must come first.
  assert.ok(
    results.indexOf('BTC/USDT') < results.indexOf('BCH/USDT'),
    `expected BTC before BCH, got ${results.join(', ')}`
  );
});

test('an exact ticker match ranks above a longer prefix match', () => {
  const results = rank(UNIVERSE, 'BA');
  assert.equal(results[0], 'BA', `expected exact match first, got ${results.join(', ')}`);
});

test('typing more letters narrows the results', () => {
  const one = rank(UNIVERSE, 'B');
  const two = rank(UNIVERSE, 'BN');
  assert.ok(two.length < one.length);
  assert.equal(two[0], 'BNB/USDT');
});

test('search is case insensitive', () => {
  assert.deepEqual(rank(UNIVERSE, 'btc'), rank(UNIVERSE, 'BTC'));
});

test('separators are ignored so BTCUSDT and BTC/USDT both match', () => {
  assert.ok(rank(UNIVERSE, 'BTCUSDT').includes('BTC/USDT'));
  assert.ok(rank(UNIVERSE, 'BTC/USDT').includes('BTC/USDT'));
  assert.ok(rank(UNIVERSE, 'btc-usdt').includes('BTC/USDT'));
});

test('forex pairs are found by either side of the slash', () => {
  assert.ok(rank(UNIVERSE, 'EUR').includes('EUR/USD'));
  assert.ok(rank(UNIVERSE, 'EUR/USD').includes('EUR/USD'));
});

// -------------------------------------------------------------- name search

test('a company can be found by name', () => {
  const results = rank(UNIVERSE, 'APPLE');
  assert.ok(results.includes('AAPL'));
});

test('a mid-name word still matches', () => {
  const results = rank(UNIVERSE, 'COCA');
  assert.ok(results.includes('KO'));
});

test('a ticker prefix outranks a name match', () => {
  // "BA" is Boeing's exact ticker; nothing else should precede it.
  const results = rank(UNIVERSE, 'BA');
  assert.equal(results[0], 'BA');
});

// ------------------------------------------------------------- non-matching

test('an unrelated query returns nothing', () => {
  assert.equal(rank(UNIVERSE, 'ZZZZZ').length, 0);
});

test('a single letter does not match by substring', () => {
  // "O" appears inside SOL and KO, but neither starts with it.
  const results = rank(UNIVERSE, 'O');
  for (const symbol of results) {
    assert.ok(symbol.startsWith('O'), `"${symbol}" should not match single letter "O"`);
  }
});

test('two or more letters may match inside a ticker, but rank last', () => {
  const results = rank([BNB, inst({ baseAsset: 'NB', name: 'Test' })], 'NB');
  // The exact "NB" ticker must beat BNB, which only contains it.
  assert.equal(results[0], 'NB/USDT');
  assert.ok(results.includes('BNB/USDT'));
});

// --------------------------------------------------------------- edge cases

test('an empty query matches everything with a neutral score', () => {
  assert.equal(scoreInstrument(BTC, ''), 100);
  assert.equal(scoreInstrument(AAPL, ''), 100);
});

test('whitespace-only queries behave like an empty query', () => {
  assert.equal(scoreInstrument(BTC, '   '), 100);
});

test('a preferred quote asset wins when everything else ties', () => {
  const usdt = inst({ baseAsset: 'BTC', quoteAsset: 'USDT' });
  const eth = inst({ baseAsset: 'BTC', quoteAsset: 'ETH' });
  assert.ok(scoreInstrument(usdt, 'BTC') < scoreInstrument(eth, 'BTC'));
});

test('scores never cross tier boundaries', () => {
  // Worst-case prefix match (obscure ticker, unfavoured quote) must still beat
  // the best-case contains match (major-looking ticker, preferred quote).
  // A 2-character query is required because single characters deliberately do
  // not match by substring at all.
  const prefix = inst({ baseAsset: 'BNXY', quoteAsset: 'ETH', name: 'Obscure' });
  const contains = inst({ baseAsset: 'ABNC', quoteAsset: 'USDT', name: 'Major' });

  const prefixScore = scoreInstrument(prefix, 'BN');
  const containsScore = scoreInstrument(contains, 'BN');

  assert.ok(prefixScore >= 0 && containsScore >= 0, 'both should match');
  assert.ok(
    prefixScore < containsScore,
    `prefix ${prefixScore} should rank ahead of contains ${containsScore}`
  );
});

test('every asset class is searchable', () => {
  assert.ok(rank(UNIVERSE, 'BTC').length > 0);   // crypto
  assert.ok(rank(UNIVERSE, 'AAPL').length > 0);  // stock
  assert.ok(rank(UNIVERSE, 'EUR').length > 0);   // forex
});
