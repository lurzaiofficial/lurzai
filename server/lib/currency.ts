const CACHE_TTL = 60 * 1000; // 1 minute cache for FX rates
const rateCache: { [key: string]: { ts: number; rate: number } } = {};

export async function convertAmount(amount: number, from: string, to: string): Promise<number> {
  if (!from || !to || from.toUpperCase() === to.toUpperCase()) return amount;
  const key = `${from.toUpperCase()}_${to.toUpperCase()}`;
  const now = Date.now();
  const cached = rateCache[key];
  if (cached && now - cached.ts < CACHE_TTL) {
    return amount * cached.rate;
  }

  // Use exchangerate.host free API
  const url = `https://api.exchangerate.host/convert?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fx request failed: ${res.status}`);
    const body = await res.json();
    const rate = body?.info?.rate ?? body?.result ?? null;
    if (!rate || typeof rate !== 'number') throw new Error('invalid rate');
    rateCache[key] = { ts: now, rate };
    return amount * rate;
  } catch (err) {
    // On any error, fall back to returning the original amount (no conversion).
    return amount;
  }
}
