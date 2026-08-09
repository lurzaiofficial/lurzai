var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server/vercel-handler.ts
var vercel_handler_exports = {};
__export(vercel_handler_exports, {
  default: () => handler
});
module.exports = __toCommonJS(vercel_handler_exports);

// server/createApp.ts
var import_express2 = __toESM(require("express"), 1);
var import_cookie_parser = __toESM(require("cookie-parser"), 1);

// server/routes/api.ts
var import_express = require("express");

// server/providers/types.ts
var ProviderError = class extends Error {
  constructor(message, provider, httpStatus = 502, userMessage) {
    super(message);
    this.provider = provider;
    this.httpStatus = httpStatus;
    this.userMessage = userMessage;
    this.name = "ProviderError";
  }
};
function makeInstrumentId(provider, providerSymbol) {
  return `${provider}:${providerSymbol}`;
}
function parseInstrumentId(id2) {
  const index = id2.indexOf(":");
  if (index <= 0) return null;
  return {
    provider: id2.slice(0, index),
    providerSymbol: id2.slice(index + 1)
  };
}
var TtlCache = class {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.value = null;
    this.expiresAt = 0;
    this.inflight = null;
  }
  /**
   * Returns the cached value, or loads it.
   * Concurrent callers share one in-flight request, so a user typing quickly on
   * a cold cache cannot trigger several large downloads at once.
   */
  async get(loader) {
    if (this.value !== null && this.expiresAt > Date.now()) return this.value;
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const loaded = await loader();
        this.value = loaded;
        this.expiresAt = Date.now() + this.ttlMs;
        return loaded;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }
  peek() {
    return this.value !== null && this.expiresAt > Date.now() ? this.value : null;
  }
};
async function providerFetch(provider, url, options = {}) {
  const { timeoutMs = 12e3, headers, userMessage } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 429) {
        throw new ProviderError(
          `${provider} rate limited: ${text.slice(0, 200)}`,
          provider,
          429,
          `${provider} is rate limiting requests. Please wait a moment and try again.`
        );
      }
      throw new ProviderError(
        `${provider} request failed (${res.status}): ${text.slice(0, 200)}`,
        provider,
        res.status,
        userMessage || `${provider} returned an error (HTTP ${res.status}).`
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new ProviderError(
        `${provider} returned unparseable JSON`,
        provider,
        502,
        `${provider} returned an unreadable response.`
      );
    }
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err.name === "AbortError") {
      throw new ProviderError(
        `${provider} timed out`,
        provider,
        504,
        `${provider} did not respond in time. Check your connection and retry.`
      );
    }
    throw new ProviderError(
      `${provider} network error: ${err.message}`,
      provider,
      503,
      `Could not reach ${provider}.`
    );
  } finally {
    clearTimeout(timer);
  }
}

// server/lib/logger.ts
var LEVEL_ORDER = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};
var MIN_LEVEL = process.env.LOG_LEVEL || "info";
var SECRET_KEYS = /* @__PURE__ */ new Set([
  "apisecret",
  "api_secret",
  "binanceapisecret",
  "binance_api_secret",
  "secret",
  "secretkey",
  "secret_key",
  "signature",
  "password",
  "token",
  "accesstoken",
  "access_token",
  "authorization",
  "cookie",
  "openrouterapikey",
  "openrouter_api_key",
  "resendapikey",
  "resend_api_key",
  "privatekey",
  "private_key"
]);
var MASKED_KEYS = /* @__PURE__ */ new Set(["apikey", "api_key", "binanceapikey", "binance_api_key", "key"]);
function maskSecret(value) {
  if (typeof value !== "string" || value.length === 0) return "";
  if (value.length <= 4) return "*".repeat(value.length);
  return "*".repeat(Math.min(value.length - 4, 16)) + value.slice(-4);
}
function redact(input, depth = 0) {
  if (depth > 6) return "[truncated]";
  if (input === null || input === void 0) return input;
  if (typeof input === "string") return input;
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (Array.isArray(input)) return input.map((item) => redact(item, depth + 1));
  if (input instanceof Error) {
    return { name: input.name, message: input.message };
  }
  if (typeof input === "object") {
    const out = {};
    for (const [key, value] of Object.entries(input)) {
      const normalized = key.toLowerCase().replace(/[^a-z_]/g, "");
      if (SECRET_KEYS.has(normalized)) {
        out[key] = "[redacted]";
      } else if (MASKED_KEYS.has(normalized) && typeof value === "string") {
        out[key] = maskSecret(value);
      } else {
        out[key] = redact(value, depth + 1);
      }
    }
    return out;
  }
  return "[unloggable]";
}
function emit(level, message, meta) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  const entry = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    msg: message,
    ...meta === void 0 ? {} : { meta: redact(meta) }
  };
  const line = JSON.stringify(entry);
  if (level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}
var logger = {
  debug: (msg, meta) => emit("debug", msg, meta),
  info: (msg, meta) => emit("info", msg, meta),
  warn: (msg, meta) => emit("warn", msg, meta),
  error: (msg, meta) => emit("error", msg, meta)
};

// server/providers/binance.ts
var BASE_URL = process.env.BINANCE_BASE_URL || "https://api.binance.com";
var INTERVALS = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d"
};
var ASSET_NAMES = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  BNB: "BNB",
  SOL: "Solana",
  XRP: "Ripple",
  ADA: "Cardano",
  DOGE: "Dogecoin",
  AVAX: "Avalanche",
  DOT: "Polkadot",
  MATIC: "Polygon",
  LINK: "Chainlink",
  LTC: "Litecoin",
  TRX: "TRON",
  SHIB: "Shiba Inu",
  UNI: "Uniswap",
  ATOM: "Cosmos",
  XLM: "Stellar",
  NEAR: "NEAR Protocol",
  APT: "Aptos",
  ARB: "Arbitrum",
  OP: "Optimism",
  FIL: "Filecoin",
  ICP: "Internet Computer",
  HBAR: "Hedera",
  VET: "VeChain",
  INJ: "Injective",
  SUI: "Sui",
  SEI: "Sei",
  TIA: "Celestia",
  PEPE: "Pepe",
  WIF: "dogwifhat",
  BCH: "Bitcoin Cash",
  ETC: "Ethereum Classic",
  AAVE: "Aave",
  MKR: "Maker",
  RUNE: "THORChain",
  ALGO: "Algorand"
};
var BinanceProvider = class {
  constructor() {
    this.id = "binance";
    this.label = "Binance";
    this.assetClasses = ["CRYPTO"];
    this.requiresKey = false;
    this.supportsStreaming = true;
    this.instruments = new TtlCache(60 * 60 * 1e3);
  }
  isAvailable() {
    return true;
  }
  unavailableReason() {
    return void 0;
  }
  async listInstruments() {
    return this.instruments.get(async () => {
      const data = await providerFetch(
        this.id,
        `${BASE_URL}/api/v3/exchangeInfo?permissions=SPOT`,
        { timeoutMs: 2e4 }
      );
      const list = (data?.symbols || []).filter((s) => s.status === "TRADING" && s.isSpotTradingAllowed).map((s) => ({
        id: makeInstrumentId(this.id, s.symbol),
        provider: this.id,
        providerLabel: this.label,
        providerSymbol: s.symbol,
        displaySymbol: `${s.baseAsset}/${s.quoteAsset}`,
        name: ASSET_NAMES[s.baseAsset] || s.baseAsset,
        assetClass: "CRYPTO",
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        currency: s.quoteAsset
      }));
      logger.info("binance: instrument list loaded", { count: list.length });
      return list;
    });
  }
  async getInstrument(providerSymbol) {
    const all = await this.listInstruments();
    const wanted = providerSymbol.toUpperCase();
    return all.find((i) => i.providerSymbol === wanted) || null;
  }
  async getQuote(instrument) {
    const d = await providerFetch(
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
      fetchedAt: Date.now()
    };
  }
  async getCandles(instrument, timeframe, limit) {
    const interval = INTERVALS[timeframe];
    if (!interval) {
      throw new ProviderError(
        `Unsupported timeframe ${timeframe}`,
        this.id,
        400,
        `Binance does not support the ${timeframe} timeframe here.`
      );
    }
    const rows = await providerFetch(
      this.id,
      `${BASE_URL}/api/v3/klines?symbol=${instrument.providerSymbol}&interval=${interval}&limit=${Math.min(limit, 1e3)}`
    );
    const now = Date.now();
    return rows.map((r) => ({
      time: Math.floor(r[0] / 1e3),
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
      volume: parseFloat(r[5]),
      // r[6] is the close time; the final candle is still forming until then.
      closed: Number(r[6]) < now
    }));
  }
  getStreamConfig(instrument, timeframe) {
    const s = instrument.providerSymbol.toLowerCase();
    return {
      kind: this.id,
      url: `wss://stream.binance.com:9443/stream?streams=${s}@ticker/${s}@kline_${INTERVALS[timeframe]}`
    };
  }
};

// server/providers/bybit.ts
var BASE_URL2 = "https://api.bybit.com";
var INTERVALS2 = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1h": "60",
  "4h": "240",
  "1d": "D"
};
var INTERVAL_SECONDS = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400
};
function unwrap(data, providerId, context) {
  if (data?.retCode !== 0) {
    throw new ProviderError(
      `Bybit ${context} failed: ${data?.retMsg || "unknown error"}`,
      providerId,
      502,
      `Bybit could not return ${context}.`
    );
  }
  return data.result;
}
var BybitProvider = class {
  constructor() {
    this.id = "bybit";
    this.label = "Bybit";
    this.assetClasses = ["CRYPTO"];
    this.requiresKey = false;
    this.supportsStreaming = true;
    this.instruments = new TtlCache(60 * 60 * 1e3);
  }
  isAvailable() {
    return true;
  }
  unavailableReason() {
    return void 0;
  }
  async listInstruments() {
    return this.instruments.get(async () => {
      const data = await providerFetch(
        this.id,
        `${BASE_URL2}/v5/market/instruments-info?category=spot&limit=1000`,
        { timeoutMs: 2e4 }
      );
      const result = unwrap(data, this.id, "its market list");
      const list = (result?.list || []).filter((s) => s.status === "Trading").map((s) => ({
        id: makeInstrumentId(this.id, s.symbol),
        provider: this.id,
        providerLabel: this.label,
        providerSymbol: s.symbol,
        displaySymbol: `${s.baseCoin}/${s.quoteCoin}`,
        name: s.baseCoin,
        assetClass: "CRYPTO",
        baseAsset: s.baseCoin,
        quoteAsset: s.quoteCoin,
        currency: s.quoteCoin
      }));
      logger.info("bybit: instrument list loaded", { count: list.length });
      return list;
    });
  }
  async getInstrument(providerSymbol) {
    const all = await this.listInstruments();
    const wanted = providerSymbol.toUpperCase();
    return all.find((i) => i.providerSymbol === wanted) || null;
  }
  async getQuote(instrument) {
    const data = await providerFetch(
      this.id,
      `${BASE_URL2}/v5/market/tickers?category=spot&symbol=${instrument.providerSymbol}`
    );
    const result = unwrap(data, this.id, "a price");
    const t = result?.list?.[0];
    if (!t) {
      throw new ProviderError(
        "Bybit returned no ticker",
        this.id,
        404,
        `Bybit has no price data for ${instrument.displaySymbol}.`
      );
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
      fetchedAt: Date.now()
    };
  }
  async getCandles(instrument, timeframe, limit) {
    const interval = INTERVALS2[timeframe];
    if (!interval) {
      throw new ProviderError(
        `Unsupported timeframe ${timeframe}`,
        this.id,
        400,
        `Bybit does not support the ${timeframe} timeframe.`
      );
    }
    const data = await providerFetch(
      this.id,
      `${BASE_URL2}/v5/market/kline?category=spot&symbol=${instrument.providerSymbol}&interval=${interval}&limit=${Math.min(limit, 1e3)}`
    );
    const result = unwrap(data, this.id, "candles");
    const now = Math.floor(Date.now() / 1e3);
    const seconds = INTERVAL_SECONDS[timeframe];
    return (result?.list || []).map((r) => {
      const time = Math.floor(Number(r[0]) / 1e3);
      return {
        time,
        open: parseFloat(r[1]),
        high: parseFloat(r[2]),
        low: parseFloat(r[3]),
        close: parseFloat(r[4]),
        volume: parseFloat(r[5]),
        closed: time + seconds <= now
      };
    }).sort((a, b) => a.time - b.time);
  }
  getStreamConfig(instrument, timeframe) {
    return {
      kind: this.id,
      url: "wss://stream.bybit.com/v5/public/spot",
      // Bybit requires an explicit subscribe frame after the socket opens.
      subscribe: {
        op: "subscribe",
        args: [
          `tickers.${instrument.providerSymbol}`,
          `kline.${INTERVALS2[timeframe]}.${instrument.providerSymbol}`
        ]
      }
    };
  }
};

// server/providers/coinbase.ts
var BASE_URL3 = "https://api.exchange.coinbase.com";
var GRANULARITY = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  // Coinbase has no native 4h; 6h is the closest supported bucket.
  "4h": 21600,
  "1d": 86400
};
var CoinbaseProvider = class {
  constructor() {
    this.id = "coinbase";
    this.label = "Coinbase";
    this.assetClasses = ["CRYPTO"];
    this.requiresKey = false;
    // Coinbase does have a public feed, but candles are polled for simplicity.
    this.supportsStreaming = false;
    this.instruments = new TtlCache(60 * 60 * 1e3);
  }
  isAvailable() {
    return true;
  }
  unavailableReason() {
    return void 0;
  }
  async listInstruments() {
    return this.instruments.get(async () => {
      const data = await providerFetch(this.id, `${BASE_URL3}/products`, { timeoutMs: 2e4 });
      const list = (data || []).filter((p) => p.status === "online" && !p.trading_disabled).map((p) => ({
        id: makeInstrumentId(this.id, p.id),
        provider: this.id,
        providerLabel: this.label,
        providerSymbol: p.id,
        // e.g. BTC-USD
        displaySymbol: `${p.base_currency}/${p.quote_currency}`,
        name: p.display_name || p.base_currency,
        assetClass: "CRYPTO",
        baseAsset: p.base_currency,
        quoteAsset: p.quote_currency,
        currency: p.quote_currency
      }));
      logger.info("coinbase: instrument list loaded", { count: list.length });
      return list;
    });
  }
  async getInstrument(providerSymbol) {
    const all = await this.listInstruments();
    const wanted = providerSymbol.toUpperCase();
    return all.find((i) => i.providerSymbol.toUpperCase() === wanted) || null;
  }
  async getQuote(instrument) {
    const [ticker, stats] = await Promise.all([
      providerFetch(this.id, `${BASE_URL3}/products/${instrument.providerSymbol}/ticker`),
      providerFetch(this.id, `${BASE_URL3}/products/${instrument.providerSymbol}/stats`)
    ]);
    const price = parseFloat(ticker.price);
    const open = parseFloat(stats.open);
    const change = Number.isFinite(open) && open > 0 ? price - open : 0;
    return {
      instrumentId: instrument.id,
      displaySymbol: instrument.displaySymbol,
      price,
      change24h: change,
      change24hPercent: open > 0 ? change / open * 100 : 0,
      high24h: parseFloat(stats.high) || null,
      low24h: parseFloat(stats.low) || null,
      // Coinbase reports base volume; convert to quote terms for consistency.
      volume24h: parseFloat(stats.volume) * price || null,
      currency: instrument.currency,
      fetchedAt: Date.now()
    };
  }
  async getCandles(instrument, timeframe, limit) {
    const granularity = GRANULARITY[timeframe];
    if (!granularity) {
      throw new ProviderError(
        `Unsupported timeframe ${timeframe}`,
        this.id,
        400,
        `Coinbase does not support the ${timeframe} timeframe.`
      );
    }
    const count = Math.min(limit, 300);
    const end = /* @__PURE__ */ new Date();
    const start = new Date(end.getTime() - count * granularity * 1e3);
    const rows = await providerFetch(
      this.id,
      `${BASE_URL3}/products/${instrument.providerSymbol}/candles?granularity=${granularity}&start=${start.toISOString()}&end=${end.toISOString()}`
    );
    const now = Math.floor(Date.now() / 1e3);
    return (rows || []).map((r) => ({
      time: Number(r[0]),
      low: Number(r[1]),
      high: Number(r[2]),
      open: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
      closed: Number(r[0]) + granularity <= now
    })).sort((a, b) => a.time - b.time);
  }
};

// server/providers/kraken.ts
var BASE_URL4 = "https://api.kraken.com/0/public";
var INTERVAL_MINUTES = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "1h": 60,
  "4h": 240,
  "1d": 1440
};
function normalizeAsset(code) {
  const map = {
    XBT: "BTC",
    XXBT: "BTC",
    XDG: "DOGE",
    XXDG: "DOGE",
    ZUSD: "USD",
    ZEUR: "EUR",
    ZGBP: "GBP",
    ZJPY: "JPY",
    ZCAD: "CAD",
    ZAUD: "AUD",
    XETH: "ETH",
    XLTC: "LTC",
    XXRP: "XRP",
    XXLM: "XLM",
    XETC: "ETC",
    XZEC: "ZEC",
    XMLN: "MLN",
    XREP: "REP",
    XXMR: "XMR"
  };
  return map[code] || code;
}
var KrakenProvider = class {
  constructor() {
    this.id = "kraken";
    this.label = "Kraken";
    this.assetClasses = ["CRYPTO"];
    this.requiresKey = false;
    this.supportsStreaming = false;
    this.instruments = new TtlCache(60 * 60 * 1e3);
  }
  isAvailable() {
    return true;
  }
  unavailableReason() {
    return void 0;
  }
  async listInstruments() {
    return this.instruments.get(async () => {
      const data = await providerFetch(this.id, `${BASE_URL4}/AssetPairs`, { timeoutMs: 2e4 });
      if (data?.error?.length) {
        throw new ProviderError(
          `Kraken error: ${data.error.join(", ")}`,
          this.id,
          502,
          "Kraken could not return its market list."
        );
      }
      const list = Object.entries(data?.result || {}).filter(([, p]) => p.status === "online").filter(([key]) => !key.endsWith(".d")).map(([, p]) => {
        const base = normalizeAsset(p.base);
        const quote = normalizeAsset(p.quote);
        return {
          id: makeInstrumentId(this.id, p.altname),
          provider: this.id,
          providerLabel: this.label,
          providerSymbol: p.altname,
          displaySymbol: `${base}/${quote}`,
          name: base,
          assetClass: "CRYPTO",
          baseAsset: base,
          quoteAsset: quote,
          currency: quote
        };
      });
      logger.info("kraken: instrument list loaded", { count: list.length });
      return list;
    });
  }
  async getInstrument(providerSymbol) {
    const all = await this.listInstruments();
    const wanted = providerSymbol.toUpperCase();
    return all.find((i) => i.providerSymbol.toUpperCase() === wanted) || null;
  }
  async getQuote(instrument) {
    const data = await providerFetch(
      this.id,
      `${BASE_URL4}/Ticker?pair=${encodeURIComponent(instrument.providerSymbol)}`
    );
    if (data?.error?.length) {
      throw new ProviderError(
        `Kraken error: ${data.error.join(", ")}`,
        this.id,
        502,
        `Kraken could not return a price for ${instrument.displaySymbol}.`
      );
    }
    const entry = Object.values(data?.result || {})[0];
    if (!entry) {
      throw new ProviderError(
        "Kraken returned no ticker",
        this.id,
        404,
        `Kraken has no price data for ${instrument.displaySymbol}.`
      );
    }
    const price = parseFloat(entry.c?.[0]);
    const open = parseFloat(entry.o);
    const change = Number.isFinite(open) && open > 0 ? price - open : 0;
    return {
      instrumentId: instrument.id,
      displaySymbol: instrument.displaySymbol,
      price,
      change24h: change,
      change24hPercent: open > 0 ? change / open * 100 : 0,
      // h/l are [today, last 24h]; the 24h figure is the second element.
      high24h: parseFloat(entry.h?.[1]) || null,
      low24h: parseFloat(entry.l?.[1]) || null,
      volume24h: parseFloat(entry.v?.[1]) * price || null,
      currency: instrument.currency,
      fetchedAt: Date.now()
    };
  }
  async getCandles(instrument, timeframe, limit) {
    const interval = INTERVAL_MINUTES[timeframe];
    if (!interval) {
      throw new ProviderError(
        `Unsupported timeframe ${timeframe}`,
        this.id,
        400,
        `Kraken does not support the ${timeframe} timeframe.`
      );
    }
    const data = await providerFetch(
      this.id,
      `${BASE_URL4}/OHLC?pair=${encodeURIComponent(instrument.providerSymbol)}&interval=${interval}`
    );
    if (data?.error?.length) {
      throw new ProviderError(
        `Kraken error: ${data.error.join(", ")}`,
        this.id,
        502,
        `Kraken could not return candles for ${instrument.displaySymbol}.`
      );
    }
    const series = Object.entries(data?.result || {}).find(([k]) => k !== "last")?.[1];
    if (!Array.isArray(series)) {
      throw new ProviderError(
        "Kraken returned no OHLC series",
        this.id,
        502,
        `Kraken has no candle data for ${instrument.displaySymbol}.`
      );
    }
    const now = Math.floor(Date.now() / 1e3);
    const seconds = interval * 60;
    return series.map((r) => ({
      time: Number(r[0]),
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
      volume: parseFloat(r[6]),
      closed: Number(r[0]) + seconds <= now
    })).slice(-limit);
  }
};

// server/providers/okx.ts
var BASE_URL5 = "https://www.okx.com";
var BAR = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1H",
  "4h": "4H",
  "1d": "1D"
};
var INTERVAL_SECONDS2 = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400
};
function unwrap2(data, context) {
  if (data?.code !== "0") {
    throw new ProviderError(
      `OKX ${context} failed: ${data?.msg || "unknown error"}`,
      "okx",
      502,
      `OKX could not return ${context}.`
    );
  }
  return data.data;
}
var OkxProvider = class {
  constructor() {
    this.id = "okx";
    this.label = "OKX";
    this.assetClasses = ["CRYPTO"];
    this.requiresKey = false;
    this.supportsStreaming = true;
    this.instruments = new TtlCache(60 * 60 * 1e3);
  }
  isAvailable() {
    return true;
  }
  unavailableReason() {
    return void 0;
  }
  async listInstruments() {
    return this.instruments.get(async () => {
      const data = await providerFetch(
        this.id,
        `${BASE_URL5}/api/v5/public/instruments?instType=SPOT`,
        { timeoutMs: 2e4 }
      );
      const rows = unwrap2(data, "its market list");
      const list = (rows || []).filter((s) => s.state === "live").map((s) => ({
        id: makeInstrumentId(this.id, s.instId),
        provider: this.id,
        providerLabel: this.label,
        providerSymbol: s.instId,
        // e.g. BTC-USDT
        displaySymbol: `${s.baseCcy}/${s.quoteCcy}`,
        name: s.baseCcy,
        assetClass: "CRYPTO",
        baseAsset: s.baseCcy,
        quoteAsset: s.quoteCcy,
        currency: s.quoteCcy
      }));
      logger.info("okx: instrument list loaded", { count: list.length });
      return list;
    });
  }
  async getInstrument(providerSymbol) {
    const all = await this.listInstruments();
    const wanted = providerSymbol.toUpperCase();
    return all.find((i) => i.providerSymbol.toUpperCase() === wanted) || null;
  }
  async getQuote(instrument) {
    const data = await providerFetch(
      this.id,
      `${BASE_URL5}/api/v5/market/ticker?instId=${instrument.providerSymbol}`
    );
    const rows = unwrap2(data, "a price");
    const t = rows?.[0];
    if (!t) {
      throw new ProviderError(
        "OKX returned no ticker",
        this.id,
        404,
        `OKX has no price data for ${instrument.displaySymbol}.`
      );
    }
    const price = parseFloat(t.last);
    const open = parseFloat(t.open24h);
    const change = Number.isFinite(open) && open > 0 ? price - open : 0;
    return {
      instrumentId: instrument.id,
      displaySymbol: instrument.displaySymbol,
      price,
      change24h: change,
      change24hPercent: open > 0 ? change / open * 100 : 0,
      high24h: parseFloat(t.high24h) || null,
      low24h: parseFloat(t.low24h) || null,
      volume24h: parseFloat(t.volCcy24h) || null,
      currency: instrument.currency,
      fetchedAt: Date.now()
    };
  }
  async getCandles(instrument, timeframe, limit) {
    const bar = BAR[timeframe];
    if (!bar) {
      throw new ProviderError(
        `Unsupported timeframe ${timeframe}`,
        this.id,
        400,
        `OKX does not support the ${timeframe} timeframe.`
      );
    }
    const data = await providerFetch(
      this.id,
      `${BASE_URL5}/api/v5/market/candles?instId=${instrument.providerSymbol}&bar=${bar}&limit=${Math.min(limit, 300)}`
    );
    const rows = unwrap2(data, "candles");
    const now = Math.floor(Date.now() / 1e3);
    const seconds = INTERVAL_SECONDS2[timeframe];
    return (rows || []).map((r) => {
      const time = Math.floor(Number(r[0]) / 1e3);
      return {
        time,
        open: parseFloat(r[1]),
        high: parseFloat(r[2]),
        low: parseFloat(r[3]),
        close: parseFloat(r[4]),
        volume: parseFloat(r[5]),
        // r[8] === '1' means the bar is confirmed/closed.
        closed: r[8] === "1" || time + seconds <= now
      };
    }).sort((a, b) => a.time - b.time);
  }
  getStreamConfig(instrument, timeframe) {
    return {
      kind: this.id,
      url: "wss://ws.okx.com:8443/ws/v5/public",
      subscribe: {
        op: "subscribe",
        args: [
          { channel: "tickers", instId: instrument.providerSymbol },
          { channel: `candle${BAR[timeframe]}`, instId: instrument.providerSymbol }
        ]
      }
    };
  }
};

// server/providers/twelvedata.ts
var BASE_URL6 = "https://api.twelvedata.com";
var INTERVALS3 = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "1h": "1h",
  "4h": "4h",
  "1d": "1day"
};
var INTERVAL_SECONDS3 = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400
};
var CURATED = [
  // US large caps
  { symbol: "AAPL", name: "Apple Inc.", assetClass: "STOCK", currency: "USD", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corporation", assetClass: "STOCK", currency: "USD", exchange: "NASDAQ" },
  { symbol: "GOOGL", name: "Alphabet Inc.", assetClass: "STOCK", currency: "USD", exchange: "NASDAQ" },
  { symbol: "AMZN", name: "Amazon.com Inc.", assetClass: "STOCK", currency: "USD", exchange: "NASDAQ" },
  { symbol: "NVDA", name: "NVIDIA Corporation", assetClass: "STOCK", currency: "USD", exchange: "NASDAQ" },
  { symbol: "META", name: "Meta Platforms Inc.", assetClass: "STOCK", currency: "USD", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla Inc.", assetClass: "STOCK", currency: "USD", exchange: "NASDAQ" },
  { symbol: "NFLX", name: "Netflix Inc.", assetClass: "STOCK", currency: "USD", exchange: "NASDAQ" },
  { symbol: "AMD", name: "Advanced Micro Devices", assetClass: "STOCK", currency: "USD", exchange: "NASDAQ" },
  { symbol: "INTC", name: "Intel Corporation", assetClass: "STOCK", currency: "USD", exchange: "NASDAQ" },
  { symbol: "BABA", name: "Alibaba Group", assetClass: "STOCK", currency: "USD", exchange: "NYSE" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", assetClass: "STOCK", currency: "USD", exchange: "NYSE" },
  { symbol: "V", name: "Visa Inc.", assetClass: "STOCK", currency: "USD", exchange: "NYSE" },
  { symbol: "WMT", name: "Walmart Inc.", assetClass: "STOCK", currency: "USD", exchange: "NYSE" },
  { symbol: "DIS", name: "The Walt Disney Company", assetClass: "STOCK", currency: "USD", exchange: "NYSE" },
  { symbol: "BA", name: "The Boeing Company", assetClass: "STOCK", currency: "USD", exchange: "NYSE" },
  { symbol: "KO", name: "The Coca-Cola Company", assetClass: "STOCK", currency: "USD", exchange: "NYSE" },
  { symbol: "PFE", name: "Pfizer Inc.", assetClass: "STOCK", currency: "USD", exchange: "NYSE" },
  { symbol: "XOM", name: "Exxon Mobil Corporation", assetClass: "STOCK", currency: "USD", exchange: "NYSE" },
  { symbol: "COIN", name: "Coinbase Global Inc.", assetClass: "STOCK", currency: "USD", exchange: "NASDAQ" },
  { symbol: "PLTR", name: "Palantir Technologies", assetClass: "STOCK", currency: "USD", exchange: "NASDAQ" },
  { symbol: "UBER", name: "Uber Technologies", assetClass: "STOCK", currency: "USD", exchange: "NYSE" },
  // ETFs and indices
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", assetClass: "ETF", currency: "USD", exchange: "NYSE" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", assetClass: "ETF", currency: "USD", exchange: "NASDAQ" },
  { symbol: "IWM", name: "iShares Russell 2000 ETF", assetClass: "ETF", currency: "USD", exchange: "NYSE" },
  { symbol: "GLD", name: "SPDR Gold Shares", assetClass: "ETF", currency: "USD", exchange: "NYSE" },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", assetClass: "ETF", currency: "USD", exchange: "NYSE" },
  // Forex majors and popular crosses
  { symbol: "EUR/USD", name: "Euro / US Dollar", assetClass: "FOREX", currency: "USD" },
  { symbol: "GBP/USD", name: "British Pound / US Dollar", assetClass: "FOREX", currency: "USD" },
  { symbol: "USD/JPY", name: "US Dollar / Japanese Yen", assetClass: "FOREX", currency: "JPY" },
  { symbol: "USD/CHF", name: "US Dollar / Swiss Franc", assetClass: "FOREX", currency: "CHF" },
  { symbol: "AUD/USD", name: "Australian Dollar / US Dollar", assetClass: "FOREX", currency: "USD" },
  { symbol: "USD/CAD", name: "US Dollar / Canadian Dollar", assetClass: "FOREX", currency: "CAD" },
  { symbol: "NZD/USD", name: "New Zealand Dollar / US Dollar", assetClass: "FOREX", currency: "USD" },
  { symbol: "EUR/GBP", name: "Euro / British Pound", assetClass: "FOREX", currency: "GBP" },
  { symbol: "EUR/JPY", name: "Euro / Japanese Yen", assetClass: "FOREX", currency: "JPY" },
  { symbol: "GBP/JPY", name: "British Pound / Japanese Yen", assetClass: "FOREX", currency: "JPY" },
  { symbol: "USD/INR", name: "US Dollar / Indian Rupee", assetClass: "FOREX", currency: "INR" },
  { symbol: "USD/LKR", name: "US Dollar / Sri Lankan Rupee", assetClass: "FOREX", currency: "LKR" },
  // Commodities
  { symbol: "XAU/USD", name: "Gold Spot", assetClass: "COMMODITY", currency: "USD" },
  { symbol: "XAG/USD", name: "Silver Spot", assetClass: "COMMODITY", currency: "USD" },
  { symbol: "XPT/USD", name: "Platinum Spot", assetClass: "COMMODITY", currency: "USD" },
  { symbol: "WTI/USD", name: "Crude Oil (WTI)", assetClass: "COMMODITY", currency: "USD" },
  { symbol: "BRENT/USD", name: "Crude Oil (Brent)", assetClass: "COMMODITY", currency: "USD" },
  { symbol: "NG/USD", name: "Natural Gas", assetClass: "COMMODITY", currency: "USD" },
  { symbol: "XCU/USD", name: "Copper", assetClass: "COMMODITY", currency: "USD" }
];
var TwelveDataProvider = class {
  constructor() {
    this.id = "twelvedata";
    this.label = "Twelve Data";
    this.assetClasses = ["STOCK", "FOREX", "COMMODITY", "INDEX", "ETF"];
    this.requiresKey = true;
    this.supportsStreaming = false;
    this.instruments = new TtlCache(24 * 60 * 60 * 1e3);
    /** Short-lived quote cache to protect the free-tier request budget. */
    this.quoteCache = /* @__PURE__ */ new Map();
    /** Symbols resolved on demand that were not in the curated list. */
    this.resolved = /* @__PURE__ */ new Map();
  }
  get apiKey() {
    return process.env.TWELVEDATA_API_KEY || void 0;
  }
  isAvailable() {
    return Boolean(this.apiKey);
  }
  unavailableReason() {
    return this.isAvailable() ? void 0 : "Stocks, forex and commodities need a Twelve Data API key. Set TWELVEDATA_API_KEY on the server.";
  }
  requireKey() {
    const key = this.apiKey;
    if (!key) {
      throw new ProviderError(
        "Twelve Data API key not configured",
        this.id,
        503,
        this.unavailableReason()
      );
    }
    return key;
  }
  toInstrument(entry) {
    const [base, quote] = entry.symbol.includes("/") ? entry.symbol.split("/") : [entry.symbol, entry.currency];
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
      exchange: entry.exchange
    };
  }
  async listInstruments() {
    if (!this.isAvailable()) return [];
    return this.instruments.get(async () => {
      const list = CURATED.map((c) => this.toInstrument(c));
      logger.info("twelvedata: instrument list loaded", { count: list.length });
      return list;
    });
  }
  /**
   * Resolves a symbol, falling back to the reference API for anything outside
   * the curated list, so an arbitrary valid ticker still works.
   */
  async getInstrument(providerSymbol) {
    if (!this.isAvailable()) return null;
    const wanted = providerSymbol.toUpperCase();
    const curated = CURATED.find((c) => c.symbol.toUpperCase() === wanted);
    if (curated) return this.toInstrument(curated);
    const cached = this.resolved.get(wanted);
    if (cached) return cached;
    try {
      const data = await providerFetch(
        this.id,
        `${BASE_URL6}/symbol_search?symbol=${encodeURIComponent(wanted)}&outputsize=1&apikey=${this.requireKey()}`
      );
      const match = data?.data?.[0];
      if (!match) return null;
      const assetClass = /etf/i.test(match.instrument_type || "") ? "ETF" : /index/i.test(match.instrument_type || "") ? "INDEX" : "STOCK";
      const instrument = {
        id: makeInstrumentId(this.id, match.symbol),
        provider: this.id,
        providerLabel: this.label,
        providerSymbol: match.symbol,
        displaySymbol: match.symbol,
        name: match.instrument_name || match.symbol,
        assetClass,
        baseAsset: match.symbol,
        quoteAsset: match.currency || "USD",
        currency: match.currency || "USD",
        exchange: match.exchange
      };
      this.resolved.set(wanted, instrument);
      return instrument;
    } catch (err) {
      logger.warn("twelvedata: symbol resolution failed", { symbol: wanted, err });
      return null;
    }
  }
  async getQuote(instrument) {
    const cached = this.quoteCache.get(instrument.providerSymbol);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const data = await providerFetch(
      this.id,
      `${BASE_URL6}/quote?symbol=${encodeURIComponent(instrument.providerSymbol)}&apikey=${this.requireKey()}`
    );
    if (data?.status === "error" || data?.code >= 400) {
      throw new ProviderError(
        `Twelve Data error: ${data?.message || "unknown"}`,
        this.id,
        data?.code === 429 ? 429 : 502,
        data?.code === 429 ? "The market data plan has hit its request limit. Please wait a minute and try again." : `Twelve Data could not return a price for ${instrument.displaySymbol}.`
      );
    }
    const price = parseFloat(data.close ?? data.price);
    if (!Number.isFinite(price)) {
      throw new ProviderError(
        "Twelve Data returned no price",
        this.id,
        502,
        `No price is currently available for ${instrument.displaySymbol}.`
      );
    }
    const quote = {
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
      marketClosed: data?.is_market_open === false
    };
    this.quoteCache.set(instrument.providerSymbol, { value: quote, expiresAt: Date.now() + 1e4 });
    return quote;
  }
  async getCandles(instrument, timeframe, limit) {
    const interval = INTERVALS3[timeframe];
    if (!interval) {
      throw new ProviderError(
        `Unsupported timeframe ${timeframe}`,
        this.id,
        400,
        `The ${timeframe} timeframe is not supported for this market.`
      );
    }
    const data = await providerFetch(
      this.id,
      `${BASE_URL6}/time_series?symbol=${encodeURIComponent(instrument.providerSymbol)}&interval=${interval}&outputsize=${Math.min(limit, 5e3)}&order=ASC&apikey=${this.requireKey()}`
    );
    if (data?.status === "error" || data?.code >= 400) {
      throw new ProviderError(
        `Twelve Data error: ${data?.message || "unknown"}`,
        this.id,
        data?.code === 429 ? 429 : 502,
        data?.code === 429 ? "The market data plan has hit its request limit. Please wait a minute and try again." : `Twelve Data could not return candles for ${instrument.displaySymbol}.`
      );
    }
    const values = data?.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new ProviderError(
        "Twelve Data returned no candles",
        this.id,
        502,
        `No historical data is available for ${instrument.displaySymbol} on ${timeframe}.`
      );
    }
    const now = Math.floor(Date.now() / 1e3);
    const seconds = INTERVAL_SECONDS3[timeframe];
    return values.map((v) => {
      const time = Math.floor((/* @__PURE__ */ new Date(v.datetime.replace(" ", "T") + "Z")).getTime() / 1e3);
      return {
        time,
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: parseFloat(v.volume) || 0,
        closed: time + seconds <= now
      };
    }).filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close)).sort((a, b) => a.time - b.time);
  }
};

// server/providers/index.ts
var providers = [
  new BinanceProvider(),
  new CoinbaseProvider(),
  new KrakenProvider(),
  new BybitProvider(),
  new OkxProvider(),
  new TwelveDataProvider()
];
var byId = new Map(providers.map((p) => [p.id, p]));
function getProvider(id2) {
  const provider = byId.get(id2);
  if (!provider) {
    throw new ProviderError(`Unknown provider ${id2}`, id2, 404, `Unknown data source "${id2}".`);
  }
  return provider;
}
function listProviders() {
  return providers.map((p) => ({
    id: p.id,
    label: p.label,
    assetClasses: p.assetClasses,
    available: p.isAvailable(),
    reason: p.unavailableReason(),
    requiresKey: p.requiresKey,
    supportsStreaming: p.supportsStreaming
  }));
}
async function resolveInstrument(instrumentId) {
  const parsed = parseInstrumentId(instrumentId);
  if (!parsed) {
    throw new ProviderError(
      `Malformed instrument id ${instrumentId}`,
      "binance",
      400,
      "That market identifier is not valid."
    );
  }
  const provider = getProvider(parsed.provider);
  if (!provider.isAvailable()) {
    throw new ProviderError(
      `${provider.label} unavailable`,
      provider.id,
      503,
      provider.unavailableReason()
    );
  }
  const instrument = await provider.getInstrument(parsed.providerSymbol);
  if (!instrument) {
    throw new ProviderError(
      `Instrument not found: ${instrumentId}`,
      provider.id,
      404,
      `${parsed.providerSymbol} was not found on ${provider.label}.`
    );
  }
  return instrument;
}
var QUOTE_PRIORITY = {
  USDT: 0,
  USD: 0,
  USDC: 1,
  FDUSD: 1,
  EUR: 2,
  GBP: 2,
  BTC: 3,
  ETH: 4,
  BNB: 5
};
var PROVIDER_PRIORITY = {
  binance: 0,
  twelvedata: 0,
  coinbase: 1,
  kraken: 2,
  bybit: 3,
  okx: 4
};
var MAJORS = /* @__PURE__ */ new Set([
  "BTC",
  "ETH",
  "BNB",
  "SOL",
  "XRP",
  "ADA",
  "DOGE",
  "AVAX",
  "LINK",
  "DOT",
  "MATIC",
  "LTC",
  "TRX",
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "NVDA",
  "META",
  "TSLA",
  "SPY",
  "QQQ",
  "EUR",
  "GBP",
  "USD",
  "JPY",
  "XAU",
  "XAG"
]);
function scoreInstrument(instrument, query) {
  const q = query.trim().toUpperCase();
  if (!q) return 100;
  const stripped = q.replace(/[\/\-_\s]/g, "");
  const base = instrument.baseAsset.toUpperCase();
  const display = instrument.displaySymbol.toUpperCase();
  const displayStripped = display.replace(/[\/\-_\s]/g, "");
  const providerSymbol = instrument.providerSymbol.toUpperCase().replace(/[\/\-_\s]/g, "");
  const name = instrument.name.toUpperCase();
  let tier;
  if (base === q || display === q || providerSymbol === stripped) tier = 0;
  else if (base.startsWith(stripped)) tier = 10;
  else if (display.startsWith(q) || displayStripped.startsWith(stripped)) tier = 20;
  else if (providerSymbol.startsWith(stripped)) tier = 30;
  else if (name.startsWith(q)) tier = 40;
  else if (name.includes(q) && q.length >= 2) tier = 50;
  else if (base.includes(stripped) && stripped.length >= 2) tier = 60;
  else return -1;
  let score = tier;
  score += Math.min(QUOTE_PRIORITY[instrument.quoteAsset.toUpperCase()] ?? 6, 6);
  score += MAJORS.has(base) ? 0 : 1;
  score += PROVIDER_PRIORITY[instrument.provider] * 0.1;
  score += Math.min(base.length / 100, 0.09);
  return score;
}
async function searchInstruments(query, options = {}) {
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
        logger.warn("search: provider list failed, skipping", { provider: p.id, err });
        return [];
      }
    })
  );
  const q = query.trim();
  const scored = [];
  for (const list of lists) {
    for (const instrument of list) {
      if (assetClass && instrument.assetClass !== assetClass) continue;
      const score = scoreInstrument(instrument, q);
      if (score >= 0) scored.push({ instrument, score });
    }
  }
  scored.sort(
    (a, b) => a.score !== b.score ? a.score - b.score : a.instrument.displaySymbol.localeCompare(b.instrument.displaySymbol)
  );
  const seen = /* @__PURE__ */ new Set();
  const results = [];
  for (const { instrument } of scored) {
    const key = `${instrument.assetClass}:${instrument.baseAsset}/${instrument.quoteAsset}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(instrument);
    if (results.length >= limit) break;
  }
  if (results.length === 0 && q.length >= 1 && !provider) {
    const td = byId.get("twelvedata");
    if (td?.isAvailable()) {
      const resolved = await td.getInstrument(q).catch(() => null);
      if (resolved) results.push(resolved);
    }
  }
  return results;
}

// server/lib/appUrl.ts
function resolveAppUrl() {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercelHost = process.env.VERCEL_URL?.trim();
  if (vercelHost) {
    const host = vercelHost.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${host}`;
  }
  const port = process.env.PORT || "3000";
  return `http://localhost:${port}`;
}

// shared/analysis/aiSchema.ts
var SIGNALS = ["BUY", "SELL", "HOLD"];
var TRENDS = ["BULLISH", "BEARISH", "NEUTRAL"];
function extractJson(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "AI returned an empty response." };
  }
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return { ok: false, error: "AI response did not contain a JSON object." };
    }
    text = text.slice(start, end + 1);
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: `AI response was not valid JSON: ${err.message}` };
  }
}
function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}
function validateAIAnalysis(input, market) {
  const errors = [];
  const notes = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: ["AI response was not a JSON object."] };
  }
  const o = input;
  const signal = o.signal;
  if (typeof signal !== "string" || !SIGNALS.includes(signal)) {
    errors.push(`Field "signal" must be one of BUY, SELL, HOLD (received: ${JSON.stringify(signal)}).`);
  }
  const trend = o.trend;
  if (typeof trend !== "string" || !TRENDS.includes(trend)) {
    errors.push(`Field "trend" must be one of BULLISH, BEARISH, NEUTRAL (received: ${JSON.stringify(trend)}).`);
  }
  const numericFields = [
    "confidence",
    "entry",
    "stopLoss",
    "takeProfit",
    "riskReward",
    "durationMinutes"
  ];
  for (const field of numericFields) {
    if (!isFiniteNumber(o[field])) {
      errors.push(`Field "${field}" must be a finite number (received: ${JSON.stringify(o[field])}).`);
    }
  }
  if (isFiniteNumber(o.confidence) && (o.confidence < 0 || o.confidence > 100)) {
    errors.push(`Field "confidence" must be between 0 and 100 (received: ${o.confidence}).`);
  }
  if (typeof o.reason !== "string" || o.reason.trim().length === 0) {
    errors.push('Field "reason" must be a non-empty string.');
  }
  if (!Array.isArray(o.warnings) || o.warnings.some((w) => typeof w !== "string")) {
    errors.push('Field "warnings" must be an array of strings.');
  }
  if (errors.length) return { ok: false, errors };
  const value = {
    signal,
    confidence: o.confidence,
    trend,
    entry: o.entry,
    stopLoss: o.stopLoss,
    takeProfit: o.takeProfit,
    riskReward: o.riskReward,
    durationMinutes: o.durationMinutes,
    reason: o.reason.trim(),
    warnings: o.warnings
  };
  if (value.signal !== "HOLD") {
    if (value.entry <= 0) errors.push("Entry price must be greater than zero for a BUY/SELL signal.");
    if (value.stopLoss <= 0) errors.push("Stop loss must be greater than zero for a BUY/SELL signal.");
    if (value.takeProfit <= 0) errors.push("Take profit must be greater than zero for a BUY/SELL signal.");
    if (market.price > 0 && value.entry > 0) {
      const drift = Math.abs(value.entry - market.price) / market.price;
      if (drift > 0.1) {
        errors.push(
          `AI entry price (${value.entry}) is ${(drift * 100).toFixed(1)}% away from the live market price (${market.price}). Rejecting as unreliable.`
        );
      } else if (drift > 0.02) {
        notes.push(
          `AI entry price differs from the live price by ${(drift * 100).toFixed(2)}%.`
        );
      }
    }
    if (value.signal === "BUY") {
      if (value.stopLoss >= value.entry) {
        errors.push("For a BUY signal the stop loss must be below the entry price.");
      }
      if (value.takeProfit <= value.entry) {
        errors.push("For a BUY signal the take profit must be above the entry price.");
      }
    } else if (value.signal === "SELL") {
      if (value.stopLoss <= value.entry) {
        errors.push("For a SELL signal the stop loss must be above the entry price.");
      }
      if (value.takeProfit >= value.entry) {
        errors.push("For a SELL signal the take profit must be below the entry price.");
      }
    }
  }
  if (errors.length) return { ok: false, errors };
  const risk = Math.abs(value.entry - value.stopLoss);
  const reward = Math.abs(value.takeProfit - value.entry);
  if (value.signal !== "HOLD" && risk > 0) {
    const actualRR = reward / risk;
    if (Math.abs(actualRR - value.riskReward) > 0.15) {
      notes.push(
        `AI reported R:R of ${value.riskReward} but its own levels imply ${actualRR.toFixed(2)}. Using the recalculated value.`
      );
    }
    value.riskReward = Number(actualRR.toFixed(2));
  }
  return { ok: true, value, notes };
}
function computeSignalQuality(analysis, ai) {
  const technical = analysis.technicalScore;
  const aiConfidence = ai.confidence;
  const components = [
    { label: "Technical score (60%)", value: Number((technical * 0.6).toFixed(1)) },
    { label: "AI confidence (40%)", value: Number((aiConfidence * 0.4).toFixed(1)) }
  ];
  let final = technical * 0.6 + aiConfidence * 0.4;
  const technicalBias = technical >= 60 ? "BUY" : technical <= 40 ? "SELL" : "NEUTRAL";
  if (ai.signal !== "HOLD" && technicalBias !== "NEUTRAL") {
    if (ai.signal === technicalBias) {
      final += 5;
      components.push({ label: "AI agrees with technical bias", value: 5 });
    } else {
      final -= 15;
      components.push({ label: "AI contradicts technical bias", value: -15 });
    }
  }
  if (analysis.insufficientData) {
    final -= 10;
    components.push({ label: "Insufficient candle history", value: -10 });
  }
  if (analysis.regime === "HIGH_VOLATILITY") {
    final -= 5;
    components.push({ label: "High volatility regime", value: -5 });
  }
  if (analysis.volume === "LOW") {
    final -= 5;
    components.push({ label: "Low volume confirmation", value: -5 });
  }
  return {
    technicalScore: Number(technical.toFixed(1)),
    aiConfidence: Number(aiConfidence.toFixed(1)),
    finalScore: Number(Math.max(0, Math.min(100, final)).toFixed(1)),
    components
  };
}

// server/lib/ai.ts
var OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
var AIError = class extends Error {
  constructor(message, detail) {
    super(message);
    this.detail = detail;
    this.name = "AIError";
  }
};
function isAIConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}
var SYSTEM_PROMPT = `You are a careful market ANALYSIS ASSISTANT inside a trading-signal application. Many of your users are BEGINNERS with no trading experience, and they rely on you to tell them honestly whether a trade is worth taking.

YOUR ROLE AND ITS LIMITS
- You provide analysis and education only. You do NOT place trades and you do NOT control any account.
- The application executes nothing. The user decides and acts manually elsewhere.
- You cannot predict the future and you must never imply certainty or guaranteed profit.
- A separate deterministic risk layer reviews your output and can overrule you.

DATA RULES
- Use ONLY the market data supplied in the user message. It is real data from a live exchange or market data provider.
- All indicator values were computed by the application from actual candles. Treat them as authoritative.
- NEVER invent, estimate, or recall prices from memory. If something is marked "unavailable", treat it as unknown and say so.
- Base your entry on the supplied current price. Do not drift away from it.

DECISION RULES
- Prefer HOLD whenever evidence is weak, mixed, or contradictory. HOLD is the correct answer most of the time and is never a failure.
- A beginner losing money on a marginal setup is far worse than a beginner missing an opportunity.
- Explicitly name conflicting indicators (for example bullish EMA structure but bearish MACD, or a strong move on weak volume).
- Respect volatility: in a high-volatility regime widen the stop or choose HOLD, rather than proposing a tight stop that noise will trigger.
- Place stops beyond structure (support/resistance), not inside obvious noise.
- Require a sensible reward for the risk taken. If the reward does not justify the risk, say HOLD.
- Do not manufacture a signal just to seem useful.

DIFFERENT MARKETS
- Crypto trades 24/7 and is typically more volatile.
- Stocks and ETFs trade only during market hours and can gap overnight.
- Forex is usually lower volatility, so percentage moves are smaller.
- Commodities can react sharply to news. Adjust expectations accordingly.

WRITING STYLE
- Write for someone who does not know jargon. If you use a term like RSI, add a short plain-language clause explaining what it indicates here.
- Be direct and specific. Cite the actual indicator values that drove your decision.

LEVEL RULES
- BUY: stopLoss MUST be below entry, takeProfit MUST be above entry.
- SELL: stopLoss MUST be above entry, takeProfit MUST be below entry.
- HOLD: set entry, stopLoss, takeProfit and riskReward to 0.
- riskReward = |takeProfit - entry| / |entry - stopLoss|.

OUTPUT FORMAT
Respond with a single valid JSON object and nothing else. No markdown, no commentary, no code fence.
{
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence": <number 0-100>,
  "trend": "BULLISH" | "BEARISH" | "NEUTRAL",
  "entry": <number>,
  "stopLoss": <number>,
  "takeProfit": <number>,
  "riskReward": <number>,
  "durationMinutes": <number>,
  "reason": "<2-4 plain-English sentences citing specific indicator values>",
  "warnings": ["<short, specific warning>", "..."]
}

Confidence guidance: 0-40 weak or conflicting, 40-60 marginal, 60-80 solid multi-indicator agreement, 80+ only for strong agreement across trend, momentum and volume.`;
function fmt(value, dp = 2) {
  return value === null ? "unavailable" : value.toFixed(dp);
}
function assetContext(assetClass, marketClosed) {
  switch (assetClass) {
    case "CRYPTO":
      return "Asset class: CRYPTO. Trades 24/7, no market close, typically high volatility.";
    case "STOCK":
    case "ETF":
      return `Asset class: ${assetClass}. Trades during exchange hours only and can gap overnight.${marketClosed ? " THE MARKET IS CURRENTLY CLOSED \u2014 the price shown is the last close." : ""}`;
    case "FOREX":
      return "Asset class: FOREX. Trades 24/5, typically lower percentage volatility, so targets and stops are proportionally tighter.";
    case "COMMODITY":
      return "Asset class: COMMODITY. Sensitive to macro news and supply shocks.";
    case "INDEX":
      return "Asset class: INDEX. Broad-market exposure, usually smoother than single stocks.";
    default:
      return `Asset class: ${assetClass}.`;
  }
}
function buildUserPrompt(params) {
  const { analysis, quote, candles } = params;
  const ind = analysis.indicators;
  const recent = candles.filter((c) => c.closed).slice(-12).map(
    (c) => `${new Date(c.time * 1e3).toISOString().slice(0, 16).replace("T", " ")} O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume.toFixed(2)}`
  ).join("\n");
  const windowLine = params.tradeWindowMinutes ? `USER TRADE WINDOW: ${params.tradeWindowMinutes} minutes. Set durationMinutes to ${params.tradeWindowMinutes}. Judge whether a trade is worth taking INSIDE this window only \u2014 if the setup needs more time, return HOLD.` : "USER TRADE WINDOW: not specified \u2014 choose a realistic durationMinutes for the setup.";
  const sizeLine = params.intendedSizeNote ? `INTENDED SIZE (advisory only, never executed by this app): ${params.intendedSizeNote}` : "INTENDED SIZE: not specified.";
  return `MARKET: ${params.displaySymbol} (${params.instrumentName}) on ${params.providerLabel}
${assetContext(params.assetClass, quote.marketClosed)}
TIMEFRAME: ${analysis.timeframe}
QUOTE CURRENCY: ${params.currency}
DATA AGE: ${Math.round((Date.now() - quote.fetchedAt) / 1e3)}s

CURRENT PRICE: ${quote.price}
24H CHANGE: ${quote.change24hPercent.toFixed(2)}%
24H HIGH: ${quote.high24h ?? "unavailable"}
24H LOW: ${quote.low24h ?? "unavailable"}
24H VOLUME: ${quote.volume24h ? quote.volume24h.toFixed(0) : "unavailable"}

APPLICATION-COMPUTED INDICATORS (authoritative):
EMA20: ${fmt(ind.ema20, 4)}
EMA50: ${fmt(ind.ema50, 4)}
EMA200: ${fmt(ind.ema200, 4)}
RSI(14): ${fmt(ind.rsi)}
MACD: ${ind.macd ? `${ind.macd.macd} / signal ${ind.macd.signal} / histogram ${ind.macd.histogram}` : "unavailable"}
ATR(14): ${fmt(ind.atr, 6)} (${fmt(ind.atrPercent, 2)}% of price)
Volume MA20: ${fmt(ind.volumeMa20, 2)} | Last volume: ${fmt(ind.lastVolume, 2)}
Support: ${fmt(ind.support, 4)}
Resistance: ${fmt(ind.resistance, 4)}

APPLICATION CLASSIFICATION:
Trend: ${analysis.trend}
Momentum: ${analysis.momentum}
Volatility: ${analysis.volatility}
Volume: ${analysis.volume}
Market regime: ${analysis.regime}
Technical score: ${analysis.technicalScore}/100
Candles analysed: ${analysis.candleCount}${analysis.insufficientData ? " (LIMITED HISTORY \u2014 be more cautious)" : ""}
${analysis.warnings.length ? `Data warnings: ${analysis.warnings.join("; ")}` : ""}

RECENT CLOSED CANDLES:
${recent || "unavailable"}

${windowLine}
${sizeLine}

USER IS ALREADY FOLLOWING: ${params.activeSignal ? `a ${params.activeSignal.direction} signal on this market entered at ${params.activeSignal.entryPrice}. Take this into account and avoid recommending a conflicting new position.` : "nothing on this market."}

The user's minimum acceptable risk/reward is ${params.minRiskReward}. If you cannot find a setup meeting it, return HOLD.

Analyse this data and respond with the required JSON object only.`;
}
async function requestAIAnalysis(params) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new AIError("AI analysis is not available right now. The service is missing its configuration.");
  }
  const started = Date.now();
  let res;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45e3);
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": resolveAppUrl(),
        "X-Title": "LURZ AI",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: params.model,
        temperature: params.temperature,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: params.userPrompt }
        ]
      }),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new AIError("The analysis took too long and was cancelled. Please try again.");
    }
    throw new AIError("Could not reach the AI service. Please try again in a moment.");
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok) {
    logger.error("ai: openrouter request failed", { status: res.status, body: text.slice(0, 400) });
    if (res.status === 401) throw new AIError("AI analysis is unavailable: the service key was rejected.");
    if (res.status === 402) throw new AIError("AI analysis is temporarily unavailable: the service has run out of credit.");
    if (res.status === 429) throw new AIError("Too many analysis requests right now. Please wait a moment and try again.");
    if (res.status === 404) throw new AIError(`The configured AI model "${params.model}" is not available.`);
    throw new AIError("The AI service returned an error. Please try again.");
  }
  let content;
  try {
    content = JSON.parse(text)?.choices?.[0]?.message?.content ?? "";
  } catch {
    logger.error("ai: non-JSON envelope from openrouter", { body: text.slice(0, 400) });
    throw new AIError("The AI service returned an unreadable response.");
  }
  const parsed = extractJson(content);
  if (parsed.ok === false) {
    logger.error("ai: model output was not parseable JSON", {
      model: params.model,
      error: parsed.error,
      content: content.slice(0, 400)
    });
    throw new AIError(
      "The AI returned a malformed response, so no signal was produced. Nothing was acted on.",
      [parsed.error]
    );
  }
  const validated = validateAIAnalysis(parsed.value, { price: params.marketPrice });
  if (validated.ok === false) {
    logger.error("ai: model output failed schema validation", {
      model: params.model,
      errors: validated.errors,
      content: content.slice(0, 400)
    });
    throw new AIError(
      "The AI response failed validation and was rejected. No signal was produced.",
      validated.errors
    );
  }
  return {
    analysis: validated.value,
    notes: validated.notes,
    model: params.model,
    latencyMs: Date.now() - started
  };
}

// server/lib/chat.ts
var OPENROUTER_URL2 = "https://openrouter.ai/api/v1/chat/completions";
var ChatError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ChatError";
  }
};
var CHAT_SYSTEM_PROMPT = `You are the assistant inside LURZ AI, a trading-signal application. You help people understand markets and the signals this app produces. Many users are complete beginners.

WHAT THIS APPLICATION IS
- It analyses markets (crypto, stocks, forex, commodities) and produces advisory signals.
- It does NOT place trades, connect to any exchange account, or hold anyone's money.
- The user acts manually on their own broker or exchange if they choose to.
- If asked to buy, sell, or execute anything, explain clearly that you cannot and that the app never trades.

HOW TO ANSWER
- Be direct, warm and concise. Short paragraphs. No walls of text.
- Write for a beginner unless the user clearly demonstrates expertise. Explain jargon the first time you use it.
- When market data is provided below, use it and cite the actual numbers. Never invent a price or an indicator value.
- If you are not given data for something the user asks about, say so plainly and offer to analyse it instead of guessing.
- Use markdown for structure: short bullet lists and **bold** for key figures. Never use headings larger than ###.

RISK AND HONESTY
- Never guarantee an outcome or imply a trade is certain. Markets are probabilistic.
- Never tell someone how much money to risk in currency terms; talk in percentages of their account.
- If a user seems to be chasing losses, overtrading, or using money they cannot afford to lose, say so kindly and directly.
- If a user asks for a prediction, explain what the current evidence supports and what would invalidate it, rather than refusing outright.
- You are not a licensed financial adviser and this is not financial advice. Mention this only when genuinely relevant, not in every message.

SCOPE
- Happily explain indicators (RSI, MACD, EMA, ATR), risk/reward, position sizing, stop losses, market structure, and how this app's verdicts work.
- If asked something entirely unrelated to markets or the app, answer briefly and steer back.`;
function buildChatContext(params) {
  const { quote, analysis, signal } = params;
  if (!params.displaySymbol) {
    return "\n\nCURRENT CONTEXT: The user has not selected a market yet.";
  }
  const lines = [
    "",
    "",
    "--- LIVE CONTEXT (real data, use these exact numbers) ---",
    `Market: ${params.displaySymbol}${params.instrumentName ? ` (${params.instrumentName})` : ""}`,
    `Asset class: ${params.assetClass ?? "unknown"} | Source: ${params.providerLabel ?? "unknown"}`,
    `Timeframe on screen: ${params.timeframe ?? "unknown"}`
  ];
  if (quote) {
    lines.push(
      `Current price: ${quote.price} ${params.currency ?? ""}`,
      `24h change: ${quote.change24hPercent.toFixed(2)}%`,
      `24h high/low: ${quote.high24h ?? "unavailable"} / ${quote.low24h ?? "unavailable"}`
    );
    if (quote.marketClosed) lines.push("NOTE: this market is currently CLOSED.");
  } else {
    lines.push("Price: unavailable right now.");
  }
  if (analysis) {
    const i = analysis.indicators;
    lines.push(
      `Trend: ${analysis.trend} | Momentum: ${analysis.momentum} | Volatility: ${analysis.volatility} | Volume: ${analysis.volume}`,
      `Market regime: ${analysis.regime}`,
      `Technical score: ${analysis.technicalScore}/100`,
      `RSI(14): ${i.rsi ?? "unavailable"} | MACD hist: ${i.macd?.histogram ?? "unavailable"} | ATR: ${i.atrPercent ?? "unavailable"}% of price`,
      `EMA20/50/200: ${i.ema20 ?? "n/a"} / ${i.ema50 ?? "n/a"} / ${i.ema200 ?? "n/a"}`,
      `Support: ${i.support ?? "unavailable"} | Resistance: ${i.resistance ?? "unavailable"}`
    );
  }
  if (signal) {
    lines.push(
      "",
      "MOST RECENT SIGNAL FOR THIS MARKET:",
      `Direction: ${signal.ai.signal} | AI confidence: ${signal.ai.confidence}% | Combined quality: ${signal.quality.finalScore}%`,
      `Verdict: ${signal.advice.verdict} - ${signal.advice.headline}`
    );
    if (signal.ai.signal !== "HOLD") {
      lines.push(
        `Entry ${signal.ai.entry} | Stop ${signal.ai.stopLoss} | Target ${signal.ai.takeProfit} | R:R 1:${signal.ai.riskReward}`
      );
    }
    lines.push(`Reasoning given: ${signal.ai.reason}`);
    const failed = signal.advice.checks.filter((c) => !c.passed);
    if (failed.length) {
      lines.push(`Failed checks: ${failed.map((c) => `${c.label} (${c.detail})`).join(" | ")}`);
    }
  } else {
    lines.push("", "No signal has been generated for this market yet.");
  }
  lines.push("--- END CONTEXT ---");
  return lines.join("\n");
}
async function streamChat(params) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new ChatError("Chat is unavailable: this server has no AI service configured.");
  }
  const started = Date.now();
  let res;
  try {
    res = await fetch(OPENROUTER_URL2, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": resolveAppUrl(),
        "X-Title": "LURZ AI",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: params.model,
        temperature: params.temperature,
        max_tokens: 1500,
        stream: true,
        messages: [
          { role: "system", content: params.systemPrompt },
          ...params.messages
        ]
      }),
      signal: params.signal
    });
  } catch (err) {
    if (err.name === "AbortError") throw new ChatError("Cancelled.");
    throw new ChatError("Could not reach the AI service. Please try again.");
  }
  if (!res.ok) {
    const body = await res.text();
    logger.error("chat: openrouter request failed", { status: res.status, body: body.slice(0, 300) });
    if (res.status === 401) throw new ChatError("Chat is unavailable: the service key was rejected.");
    if (res.status === 402) throw new ChatError("Chat is temporarily unavailable: the service has run out of credit.");
    if (res.status === 429) throw new ChatError("Too many messages right now. Please wait a moment.");
    throw new ChatError("The AI service returned an error. Please try again.");
  }
  if (!res.body) throw new ChatError("The AI service returned an empty response.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            full += delta;
            params.onDelta(delta);
          }
        } catch {
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (!full.trim()) throw new ChatError("The AI returned an empty response. Please try again.");
  return { full, latencyMs: Date.now() - started };
}

// server/lib/advice.ts
function buildAdvice(input) {
  const { ai, analysis, quality, settings } = input;
  const checks = [];
  const warnings = [];
  const risk = Math.abs(ai.entry - ai.stopLoss);
  const reward = Math.abs(ai.takeProfit - ai.entry);
  const riskReward = risk > 0 ? reward / risk : 0;
  const stopDistancePercent = ai.entry > 0 ? risk / ai.entry * 100 : 0;
  const targetDistancePercent = ai.entry > 0 ? reward / ai.entry * 100 : 0;
  const add = (code, label, passed, detail, severity) => checks.push({ code, label, passed, detail, severity });
  const isDirectional = ai.signal === "BUY" || ai.signal === "SELL";
  add(
    "DIRECTION",
    "Actionable signal",
    isDirectional,
    isDirectional ? `The model sees a ${ai.signal} setup.` : "The model recommends HOLD. There is no setup worth taking right now \u2014 waiting is the correct action.",
    "CRITICAL"
  );
  const qualityOk = quality.finalScore >= settings.minSignalQuality;
  add(
    "QUALITY",
    "Signal quality",
    qualityOk,
    qualityOk ? `Quality is ${quality.finalScore.toFixed(0)}%, at or above your ${settings.minSignalQuality}% minimum.` : `Quality is only ${quality.finalScore.toFixed(0)}%, below your ${settings.minSignalQuality}% minimum. The technical picture and the AI are not aligned enough.`,
    "CRITICAL"
  );
  if (isDirectional) {
    const hasStop = ai.stopLoss > 0;
    add(
      "STOP_LOSS",
      "Stop loss defined",
      hasStop || !settings.requireStopLoss,
      hasStop ? `Stop loss at ${ai.stopLoss}, ${stopDistancePercent.toFixed(2)}% from entry.` : "No stop loss was provided. Never enter a trade without one.",
      "CRITICAL"
    );
    const hasTarget = ai.takeProfit > 0;
    add(
      "TAKE_PROFIT",
      "Take profit defined",
      hasTarget,
      hasTarget ? `Take profit at ${ai.takeProfit}, ${targetDistancePercent.toFixed(2)}% from entry.` : "No take profit level was provided.",
      "IMPORTANT"
    );
    const rrOk = riskReward >= settings.minRiskReward;
    add(
      "RISK_REWARD",
      "Risk / reward",
      rrOk,
      rrOk ? `Risk/reward is 1:${riskReward.toFixed(2)} \u2014 you stand to gain ${riskReward.toFixed(2)}x what you risk.` : `Risk/reward is only 1:${riskReward.toFixed(2)}, below your 1:${settings.minRiskReward} minimum. The potential gain does not justify the risk.`,
      "CRITICAL"
    );
    const atr2 = analysis.indicators.atr;
    if (atr2 !== null && atr2 > 0) {
      const stopInAtr = risk / atr2;
      const stopSensible = stopInAtr >= 1;
      add(
        "STOP_VS_VOLATILITY",
        "Stop vs volatility",
        stopSensible,
        stopSensible ? `The stop is ${stopInAtr.toFixed(1)}x the average candle range, so normal noise is unlikely to trigger it.` : `The stop is only ${stopInAtr.toFixed(1)}x the average candle range. Ordinary price noise will probably hit it before the trade can work.`,
        "IMPORTANT"
      );
    }
  }
  if (isDirectional) {
    const expected = ai.signal === "BUY" ? "BULLISH" : "BEARISH";
    const agrees = analysis.trend === expected || analysis.trend === "NEUTRAL";
    add(
      "TREND_ALIGNMENT",
      "Trend alignment",
      agrees,
      agrees ? `The ${ai.signal} direction is consistent with the ${analysis.trend.toLowerCase()} technical trend.` : `The model wants to ${ai.signal} but the indicators read ${analysis.trend.toLowerCase()}. Trading against the trend is lower probability.`,
      "IMPORTANT"
    );
  }
  const dataOk = !analysis.insufficientData;
  add(
    "DATA_QUALITY",
    "Data sufficiency",
    dataOk,
    dataOk ? `Analysis used ${analysis.candleCount} candles, enough for reliable indicators.` : `Only ${analysis.candleCount} candles were available. Indicators are less reliable on this little history.`,
    "IMPORTANT"
  );
  const fresh = input.marketDataAgeSeconds <= settings.maxMarketDataAgeSeconds;
  add(
    "DATA_FRESHNESS",
    "Price freshness",
    fresh,
    fresh ? `Price data is ${Math.round(input.marketDataAgeSeconds)}s old.` : `Price data is ${Math.round(input.marketDataAgeSeconds)}s old, beyond your ${settings.maxMarketDataAgeSeconds}s limit. Refresh before acting.`,
    "CRITICAL"
  );
  const regimeOk = analysis.regime !== "HIGH_VOLATILITY";
  add(
    "MARKET_REGIME",
    "Market conditions",
    regimeOk,
    regimeOk ? `Market regime is ${analysis.regime.replace(/_/g, " ").toLowerCase()}.` : "Volatility is extreme right now. Price can move violently in both directions and stops are easily hit.",
    "MINOR"
  );
  const volumeOk = analysis.volume !== "LOW";
  add(
    "VOLUME",
    "Volume confirmation",
    volumeOk,
    volumeOk ? `Volume is ${analysis.volume.toLowerCase()}, supporting the move.` : "Volume is below average, so there is weak conviction behind this move.",
    "MINOR"
  );
  if (input.marketClosed) {
    add(
      "MARKET_HOURS",
      "Market open",
      false,
      "This market is currently closed. The price shown is the last close and you cannot act until it reopens.",
      "IMPORTANT"
    );
  }
  if (settings.maxSignalsPerDay > 0 && input.todaySignals.length >= settings.maxSignalsPerDay) {
    warnings.push(
      `You have generated ${input.todaySignals.length} signals today. Analysing constantly encourages overtrading \u2014 the best traders take few, high-quality setups.`
    );
  }
  if (settings.cooldownMinutes > 0 && input.lastTrackedAt) {
    const elapsedMinutes = (Date.now() - input.lastTrackedAt) / 6e4;
    if (elapsedMinutes < settings.cooldownMinutes) {
      warnings.push(
        `You followed a signal on this market ${Math.round(elapsedMinutes)} minute(s) ago. Consider waiting the remaining ${Math.ceil(settings.cooldownMinutes - elapsedMinutes)} minute(s) before taking another.`
      );
    }
  }
  warnings.push(...ai.warnings);
  if (analysis.warnings.length) warnings.push(...analysis.warnings);
  const failedCritical = checks.filter((c) => !c.passed && c.severity === "CRITICAL");
  const failedImportant = checks.filter((c) => !c.passed && c.severity === "IMPORTANT");
  let verdict;
  let headline;
  let summary;
  if (!isDirectional) {
    verdict = "AVOID";
    headline = "Do not trade \u2014 wait";
    summary = "There is no worthwhile setup here at the moment. Sitting out is a decision in itself, and often the right one.";
  } else if (failedCritical.length > 0) {
    verdict = "AVOID";
    headline = "Do not take this trade";
    summary = `This setup fails ${failedCritical.length} essential ${failedCritical.length === 1 ? "check" : "checks"}: ${failedCritical.map((c) => c.label.toLowerCase()).join(", ")}. ${failedCritical[0].detail}`;
  } else if (failedImportant.length >= 2) {
    verdict = "CAUTION";
    headline = "Risky \u2014 proceed only if experienced";
    summary = `The basics are sound but ${failedImportant.length} things are working against this setup: ${failedImportant.map((c) => c.label.toLowerCase()).join(", ")}. If you are new, skip it.`;
  } else if (failedImportant.length === 1) {
    verdict = "CAUTION";
    headline = "Acceptable, with one concern";
    summary = `${failedImportant[0].detail} Everything else checks out, with quality at ${quality.finalScore.toFixed(0)}% and risk/reward at 1:${riskReward.toFixed(2)}.`;
  } else {
    verdict = "TAKE";
    headline = `Valid ${ai.signal} setup`;
    summary = `All key checks pass. Quality is ${quality.finalScore.toFixed(0)}%, risk/reward is 1:${riskReward.toFixed(2)}, and the stop sits ${stopDistancePercent.toFixed(2)}% from entry. Risk only what you can afford to lose.`;
  }
  const positionPercentOfAccount = stopDistancePercent > 0 ? Number((settings.accountRiskPercent / (stopDistancePercent / 100) / 100).toFixed(2)) : null;
  let sizingNote = positionPercentOfAccount === null ? "A position size cannot be suggested without a valid stop loss." : `To risk ${settings.accountRiskPercent}% of your account with a stop ${stopDistancePercent.toFixed(2)}% away, your position should be about ${positionPercentOfAccount.toFixed(2)}% of your account value. On a $1,000 account that is roughly $${(positionPercentOfAccount * 10).toFixed(2)}.`;
  const intent = input.tradeIntent;
  if (intent && intent.sizeAmount > 0) {
    if (intent.sizeUnit === "PERCENT") {
      sizingNote = `You said you intend to use about ${intent.sizeAmount}% of your account for this idea (advisory only \u2014 nothing is placed). With a ${stopDistancePercent.toFixed(2)}% stop, that implies roughly ${(intent.sizeAmount * (stopDistancePercent / 100)).toFixed(2)}% account risk if the stop is hit. ${sizingNote}`;
    } else {
      sizingNote = `You said you intend to trade about ${intent.sizeAmount} (quote notional \u2014 advisory only). With a ${stopDistancePercent.toFixed(2)}% stop, approximate risk on that size is ~${(intent.sizeAmount * (stopDistancePercent / 100)).toFixed(2)} in quote terms if the stop is hit. ${sizingNote}`;
    }
  }
  return {
    verdict,
    headline,
    summary,
    checks,
    sizing: {
      stopDistancePercent: Number(stopDistancePercent.toFixed(3)),
      targetDistancePercent: Number(targetDistancePercent.toFixed(3)),
      riskReward: Number(riskReward.toFixed(2)),
      positionPercentOfAccount,
      note: sizingNote
    },
    warnings: [...new Set(warnings)]
  };
}
function deriveLifecycle(params) {
  const { signal, currentPrice } = params;
  const now = params.now ?? Date.now();
  const ai = signal.ai;
  if (ai.signal === "HOLD") {
    return {
      lifecycle: "HOLD",
      statusNote: "This was a HOLD \u2014 there was no trade to take."
    };
  }
  const isLong = ai.signal === "BUY";
  const hitStop = isLong ? currentPrice <= ai.stopLoss : currentPrice >= ai.stopLoss;
  if (hitStop) {
    return {
      lifecycle: "INVALIDATED",
      statusNote: `Price reached the stop level of ${ai.stopLoss}. This idea is no longer valid \u2014 do not enter now.`
    };
  }
  const hitTarget = isLong ? currentPrice >= ai.takeProfit : currentPrice <= ai.takeProfit;
  if (hitTarget) {
    return {
      lifecycle: "TARGET_HIT",
      statusNote: `Price already reached the target of ${ai.takeProfit}. The move has played out; entering now means chasing it.`
    };
  }
  const ageMs = now - signal.timestamp;
  const intent = signal.tradeIntent;
  if (intent) {
    if (now >= intent.endsAt || intent.status === "COMPLETE") {
      const windowMin = intent.windowMinutes;
      return {
        lifecycle: "EXPIRED",
        statusNote: `Your ${windowMin}-minute trade window has ended. Live updates have stopped \u2014 run a fresh analysis if you still want a view.`
      };
    }
  } else {
    const horizonMs = Math.max(ai.durationMinutes, 1) * 6e4;
    if (ageMs > horizonMs) {
      return {
        lifecycle: "EXPIRED",
        statusNote: `This signal was for roughly ${ai.durationMinutes} minutes and is now ${Math.round(ageMs / 6e4)} minutes old. Run a fresh analysis.`
      };
    }
  }
  const riskDistance = Math.abs(ai.entry - ai.stopLoss);
  const rewardDistance = Math.abs(ai.takeProfit - ai.entry);
  const moved = isLong ? currentPrice - ai.entry : ai.entry - currentPrice;
  if (riskDistance > 0) {
    if (moved < 0 && Math.abs(moved) / riskDistance > 0.5) {
      return {
        lifecycle: "ENTRY_MISSED",
        statusNote: `Price has moved ${Math.abs(moved / riskDistance * 100).toFixed(0)}% of the way to the stop before entry. The original risk no longer applies.`
      };
    }
    if (rewardDistance > 0 && moved > 0 && moved / rewardDistance > 0.33) {
      return {
        lifecycle: "ENTRY_MISSED",
        statusNote: `Price has already covered ${(moved / rewardDistance * 100).toFixed(0)}% of the distance to the target. Entering now gives a worse risk/reward than the signal described.`
      };
    }
  }
  return {
    lifecycle: "VALID",
    statusNote: "Price is still close to the planned entry \u2014 this setup is current."
  };
}
function evaluateLive(params) {
  const now = params.now ?? Date.now();
  const { signal, currentPrice } = params;
  const { lifecycle, statusNote } = deriveLifecycle({ signal, currentPrice, now });
  const advice = buildAdvice({
    ai: signal.ai,
    analysis: params.analysis,
    quality: signal.quality,
    settings: params.settings,
    marketDataAgeSeconds: params.marketDataAgeSeconds,
    todaySignals: params.todaySignals,
    lastTrackedAt: params.lastTrackedAt,
    marketClosed: params.marketClosed,
    tradeIntent: signal.tradeIntent
  });
  if (lifecycle !== "VALID" && lifecycle !== "HOLD") {
    advice.verdict = "AVOID";
    advice.headline = lifecycle === "INVALIDATED" ? "Signal invalidated" : lifecycle === "TARGET_HIT" ? "Move already happened" : lifecycle === "EXPIRED" ? "Signal expired" : "Entry no longer valid";
    advice.summary = statusNote;
    advice.checks.unshift({
      code: "LIFECYCLE",
      label: "Still actionable",
      passed: false,
      detail: statusNote,
      severity: "CRITICAL"
    });
  }
  const ai = signal.ai;
  const isLong = ai.signal === "BUY";
  const moved = ai.signal === "HOLD" ? 0 : isLong ? currentPrice - ai.entry : ai.entry - currentPrice;
  const rewardDistance = Math.abs(ai.takeProfit - ai.entry);
  const driftPercent = ai.entry > 0 ? (currentPrice - ai.entry) / ai.entry * 100 : 0;
  const movePercent = ai.entry > 0 ? moved / ai.entry * 100 : 0;
  const progress = rewardDistance > 0 ? moved / rewardDistance * 100 : null;
  return {
    signalId: signal.id,
    lifecycle,
    currentPrice,
    driftPercent: safeNumber(driftPercent, 3),
    movePercent: safeNumber(movePercent, 3),
    progressPercent: progress === null ? null : safeNumber(progress, 1),
    ageMs: now - signal.timestamp,
    advice,
    statusNote,
    evaluatedAt: now
  };
}
function safeNumber(value, dp) {
  if (!Number.isFinite(value)) return 0;
  const f = Math.pow(10, dp);
  return Math.round(value * f) / f;
}

// server/lib/store.ts
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);

// shared/types.ts
var DEFAULT_SERVER_SETTINGS = {
  aiModel: "google/gemini-2.5-flash",
  aiTemperature: 0.2,
  minSignalQuality: 60,
  minRiskReward: 1.5,
  accountRiskPercent: 1,
  maxSignalsPerDay: 25,
  cooldownMinutes: 0,
  requireStopLoss: true,
  maxMarketDataAgeSeconds: 120,
  defaultTimeframe: "1h",
  favourites: ["binance:BTCUSDT", "binance:ETHUSDT", "binance:SOLUSDT"]
};

// server/lib/store.ts
function dataDir() {
  return process.env.DATA_DIR || import_node_path.default.join(process.cwd(), ".data");
}
function dbFile() {
  return import_node_path.default.join(dataDir(), "tradepilot.json");
}
var EMPTY_DB = {
  version: 2,
  settings: {},
  signals: [],
  tracked: []
};
var Store = class {
  constructor() {
    this.db = structuredClone(EMPTY_DB);
    this.writeQueued = false;
    this.loaded = false;
    /** Secondary indexes, rebuilt on load and kept in sync on insert. */
    this.idx = {
      signalsByUser: /* @__PURE__ */ new Map(),
      signalsById: /* @__PURE__ */ new Map(),
      trackedByUser: /* @__PURE__ */ new Map(),
      trackedById: /* @__PURE__ */ new Map()
    };
  }
  load() {
    if (this.loaded) return;
    const dir = dataDir();
    const file = dbFile();
    try {
      if (!import_node_fs.default.existsSync(dir)) import_node_fs.default.mkdirSync(dir, { recursive: true });
      if (import_node_fs.default.existsSync(file)) {
        const parsed = JSON.parse(import_node_fs.default.readFileSync(file, "utf8"));
        this.db = { ...structuredClone(EMPTY_DB), ...parsed };
      }
    } catch (err) {
      logger.error("store: failed to load database, starting empty", err);
      try {
        if (import_node_fs.default.existsSync(file)) import_node_fs.default.renameSync(file, `${file}.corrupt.${Date.now()}`);
      } catch {
      }
      this.db = structuredClone(EMPTY_DB);
    }
    this.rebuildIndexes();
    this.loaded = true;
  }
  rebuildIndexes() {
    this.idx.signalsByUser.clear();
    this.idx.signalsById.clear();
    this.idx.trackedByUser.clear();
    this.idx.trackedById.clear();
    for (const s of this.db.signals) {
      push(this.idx.signalsByUser, s.userId, s);
      this.idx.signalsById.set(s.id, s);
    }
    for (const t of this.db.tracked) {
      push(this.idx.trackedByUser, t.userId, t);
      this.idx.trackedById.set(t.id, t);
    }
  }
  /** Debounced atomic persist (write temp file, then rename). */
  persist() {
    if (this.writeQueued) return;
    this.writeQueued = true;
    setTimeout(() => {
      this.writeQueued = false;
      try {
        const dir = dataDir();
        const file = dbFile();
        if (!import_node_fs.default.existsSync(dir)) import_node_fs.default.mkdirSync(dir, { recursive: true });
        const tmp = `${file}.tmp`;
        import_node_fs.default.writeFileSync(tmp, JSON.stringify(this.db), "utf8");
        import_node_fs.default.renameSync(tmp, file);
      } catch (err) {
        logger.error("store: persist failed", err);
      }
    }, 150);
  }
  // ---------------------------------------------------------------- settings
  getSettings(userId) {
    this.load();
    return { ...DEFAULT_SERVER_SETTINGS, ...this.db.settings[userId] || {} };
  }
  saveSettings(userId, patch) {
    this.load();
    const next = { ...this.getSettings(userId), ...patch };
    this.db.settings[userId] = next;
    this.persist();
    return next;
  }
  // ----------------------------------------------------------------- signals
  insertSignal(signal) {
    this.load();
    this.db.signals.push(signal);
    push(this.idx.signalsByUser, signal.userId, signal);
    this.idx.signalsById.set(signal.id, signal);
    const all = this.idx.signalsByUser.get(signal.userId) || [];
    if (all.length > 500) {
      const cutoff = [...all].sort((a, b) => b.timestamp - a.timestamp).slice(500);
      const doomed = new Set(cutoff.map((s) => s.id));
      const protectedIds = new Set(this.db.tracked.map((t) => t.signalId));
      this.db.signals = this.db.signals.filter(
        (s) => !doomed.has(s.id) || protectedIds.has(s.id)
      );
      this.rebuildIndexes();
    }
    this.persist();
    return signal;
  }
  getSignal(id2) {
    this.load();
    return this.idx.signalsById.get(id2) || null;
  }
  updateSignal(id2, patch) {
    this.load();
    const found = this.idx.signalsById.get(id2);
    if (!found) return null;
    Object.assign(found, patch);
    this.persist();
    return found;
  }
  listSignals(userId, limit = 100) {
    this.load();
    return [...this.idx.signalsByUser.get(userId) || []].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }
  listSignalsSince(userId, sinceMs) {
    return this.listSignals(userId, 1e3).filter((s) => s.timestamp >= sinceMs);
  }
  // ----------------------------------------------------------------- tracked
  insertTracked(tracked) {
    this.load();
    this.db.tracked.push(tracked);
    push(this.idx.trackedByUser, tracked.userId, tracked);
    this.idx.trackedById.set(tracked.id, tracked);
    this.persist();
    return tracked;
  }
  getTracked(id2) {
    this.load();
    return this.idx.trackedById.get(id2) || null;
  }
  updateTracked(id2, patch) {
    this.load();
    const found = this.idx.trackedById.get(id2);
    if (!found) return null;
    Object.assign(found, patch);
    this.persist();
    return found;
  }
  listTracked(userId) {
    this.load();
    return [...this.idx.trackedByUser.get(userId) || []].sort((a, b) => b.openedAt - a.openedAt);
  }
  listActiveTracked(userId) {
    return this.listTracked(userId).filter((t) => t.status === "ACTIVE");
  }
};
function push(map, key, value) {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}
var store = new Store();

// server/lib/evaluator.ts
var HORIZON_MS = {
  "1m": 30 * 60 * 1e3,
  "5m": 2 * 60 * 60 * 1e3,
  "15m": 6 * 60 * 60 * 1e3,
  "1h": 24 * 60 * 60 * 1e3,
  "4h": 3 * 24 * 60 * 60 * 1e3,
  "1d": 7 * 24 * 60 * 60 * 1e3
};
async function evaluateSignal(signal) {
  if (signal.ai.signal === "HOLD") {
    return store.updateSignal(signal.id, {
      outcome: "NEUTRAL",
      outcomeCheckedAt: Date.now(),
      outcomeNote: "HOLD signals are not scored as correct or incorrect."
    });
  }
  const horizon = HORIZON_MS[signal.timeframe] ?? 24 * 60 * 60 * 1e3;
  if (Date.now() - signal.timestamp < horizon) return null;
  let candles;
  try {
    const instrument = await resolveInstrument(signal.instrumentId);
    const provider = getProvider(instrument.provider);
    candles = await provider.getCandles(instrument, signal.timeframe, 500);
  } catch (err) {
    logger.warn("evaluator: could not fetch candles", { signalId: signal.id, err });
    return null;
  }
  const after = candles.filter((c) => c.time * 1e3 > signal.timestamp && c.closed);
  if (after.length === 0) return null;
  const { stopLoss, takeProfit, signal: direction, entry } = signal.ai;
  const pct = (price) => entry > 0 ? Number(
    ((direction === "BUY" ? price - entry : entry - price) / entry * 100).toFixed(3)
  ) : 0;
  for (const candle of after) {
    const hitTp = direction === "BUY" ? candle.high >= takeProfit : candle.low <= takeProfit;
    const hitSl = direction === "BUY" ? candle.low <= stopLoss : candle.high >= stopLoss;
    if (hitTp && hitSl) {
      return store.updateSignal(signal.id, {
        outcome: "NEUTRAL",
        outcomeCheckedAt: Date.now(),
        outcomeNote: "Both the take profit and the stop loss were touched within the same candle, so the true order cannot be determined from the data."
      });
    }
    if (hitTp) {
      return store.updateSignal(signal.id, {
        outcome: "CORRECT",
        outcomeCheckedAt: Date.now(),
        outcomePercent: pct(takeProfit),
        outcomeNote: `Take profit at ${takeProfit} was reached on ${new Date(candle.time * 1e3).toISOString().slice(0, 16).replace("T", " ")}.`
      });
    }
    if (hitSl) {
      return store.updateSignal(signal.id, {
        outcome: "INCORRECT",
        outcomeCheckedAt: Date.now(),
        outcomePercent: pct(stopLoss),
        outcomeNote: `Stop loss at ${stopLoss} was reached on ${new Date(candle.time * 1e3).toISOString().slice(0, 16).replace("T", " ")}.`
      });
    }
  }
  const last = after[after.length - 1];
  return store.updateSignal(signal.id, {
    outcome: "NEUTRAL",
    outcomeCheckedAt: Date.now(),
    outcomePercent: pct(last.close),
    outcomeNote: "Neither the take profit nor the stop loss was reached within the evaluation window."
  });
}
async function evaluatePendingSignals(userId) {
  const pending = store.listSignals(userId, 200).filter((s) => !s.outcome || s.outcome === "PENDING");
  let updated = 0;
  for (const signal of pending) {
    try {
      if (await evaluateSignal(signal)) updated++;
    } catch (err) {
      logger.warn("evaluator: signal evaluation failed", { signalId: signal.id, err });
    }
  }
  return updated;
}

// shared/analysis/indicators.ts
function ema(values, period) {
  if (period <= 0 || values.length < period) return null;
  const k = 2 / (period + 1);
  let acc = 0;
  for (let i = 0; i < period; i++) acc += values[i];
  let value = acc / period;
  for (let i = period; i < values.length; i++) {
    value = values[i] * k + value * (1 - k);
  }
  return value;
}
function emaSeries(values, period) {
  if (period <= 0 || values.length < period) return [];
  const out = [];
  const k = 2 / (period + 1);
  let acc = 0;
  for (let i = 0; i < period; i++) acc += values[i];
  let value = acc / period;
  out.push(value);
  for (let i = period; i < values.length; i++) {
    value = values[i] * k + value * (1 - k);
    out.push(value);
  }
  return out;
}
function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return round(100 - 100 / (1 + rs), 2);
}
function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  if (closes.length < slow + signalPeriod) return null;
  const fastSeries = emaSeries(closes, fast);
  const slowSeries = emaSeries(closes, slow);
  if (!fastSeries.length || !slowSeries.length) return null;
  const offset = fastSeries.length - slowSeries.length;
  const macdLine = slowSeries.map((slowVal, i) => fastSeries[i + offset] - slowVal);
  const signalSeries = emaSeries(macdLine, signalPeriod);
  if (!signalSeries.length) return null;
  const macdValue = macdLine[macdLine.length - 1];
  const signalValue = signalSeries[signalSeries.length - 1];
  return {
    macd: round(macdValue, 6),
    signal: round(signalValue, 6),
    histogram: round(macdValue - signalValue, 6)
  };
}
function atr(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  if (trs.length < period) return null;
  let value = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    value = (value * (period - 1) + trs[i]) / period;
  }
  return round(value, 8);
}
function sma(values, period) {
  if (values.length < period || period <= 0) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}
function supportResistance(candles, lookback = 60, strength = 2) {
  if (candles.length < strength * 2 + 1) return { support: null, resistance: null };
  const window = candles.slice(-lookback);
  const price = window[window.length - 1].close;
  const swingHighs = [];
  const swingLows = [];
  for (let i = strength; i < window.length - strength; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= strength; j++) {
      if (window[i].high <= window[i - j].high || window[i].high <= window[i + j].high) isHigh = false;
      if (window[i].low >= window[i - j].low || window[i].low >= window[i + j].low) isLow = false;
    }
    if (isHigh) swingHighs.push(window[i].high);
    if (isLow) swingLows.push(window[i].low);
  }
  const below = swingLows.filter((l) => l < price);
  const above = swingHighs.filter((h) => h > price);
  const support = below.length ? Math.max(...below) : Math.min(...window.map((c) => c.low));
  const resistance = above.length ? Math.min(...above) : Math.max(...window.map((c) => c.high));
  return { support: round(support, 8), resistance: round(resistance, 8) };
}
function computeIndicators(candles) {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const price = closes[closes.length - 1] ?? 0;
  const atrValue = atr(candles, 14);
  const { support, resistance } = supportResistance(candles);
  return {
    ema20: nullableRound(ema(closes, 20), 8),
    ema50: nullableRound(ema(closes, 50), 8),
    ema200: nullableRound(ema(closes, 200), 8),
    rsi: rsi(closes, 14),
    macd: macd(closes),
    atr: atrValue,
    atrPercent: atrValue !== null && price > 0 ? round(atrValue / price * 100, 3) : null,
    volumeMa20: nullableRound(sma(volumes, 20), 4),
    lastVolume: volumes[volumes.length - 1] ?? null,
    support,
    resistance
  };
}
function detectRegime(ind, price) {
  const atrPct = ind.atrPercent;
  if (atrPct !== null && atrPct >= 4) return "HIGH_VOLATILITY";
  if (atrPct !== null && atrPct <= 0.4) return "LOW_VOLATILITY";
  const { ema20, ema50, ema200 } = ind;
  if (ema20 !== null && ema50 !== null) {
    const longOk = ema200 === null || ema50 > ema200;
    const longBear = ema200 === null || ema50 < ema200;
    if (ema20 > ema50 && longOk && price > ema20) return "TRENDING_UP";
    if (ema20 < ema50 && longBear && price < ema20) return "TRENDING_DOWN";
  }
  return "RANGING";
}
function classifyTrend(ind, price) {
  const { ema20, ema50, ema200 } = ind;
  let score = 0;
  if (ema20 !== null && ema50 !== null) score += ema20 > ema50 ? 1 : -1;
  if (ema50 !== null && ema200 !== null) score += ema50 > ema200 ? 1 : -1;
  if (ema50 !== null) score += price > ema50 ? 1 : -1;
  if (score >= 2) return "BULLISH";
  if (score <= -2) return "BEARISH";
  return "NEUTRAL";
}
function classifyMomentum(ind) {
  const r = ind.rsi;
  const hist = ind.macd?.histogram ?? null;
  if (r === null && hist === null) return "FLAT";
  let score = 0;
  if (r !== null) {
    if (r >= 65) score += 2;
    else if (r >= 55) score += 1;
    else if (r <= 35) score -= 2;
    else if (r <= 45) score -= 1;
  }
  if (hist !== null) score += hist > 0 ? 1 : hist < 0 ? -1 : 0;
  if (score >= 3) return "STRONG_UP";
  if (score >= 1) return "UP";
  if (score <= -3) return "STRONG_DOWN";
  if (score <= -1) return "DOWN";
  return "FLAT";
}
function classifyVolatility(ind) {
  const p = ind.atrPercent;
  if (p === null) return "NORMAL";
  if (p >= 3) return "HIGH";
  if (p <= 0.6) return "LOW";
  return "NORMAL";
}
function classifyVolume(ind) {
  if (ind.volumeMa20 === null || ind.lastVolume === null || ind.volumeMa20 === 0) return "NORMAL";
  const ratio = ind.lastVolume / ind.volumeMa20;
  if (ratio >= 1.5) return "HIGH";
  if (ratio <= 0.6) return "LOW";
  return "NORMAL";
}
function computeTechnicalScore(ind, price) {
  const breakdown = [];
  let score = 50;
  const add = (label, points) => {
    score += points;
    breakdown.push({ label, points });
  };
  const { ema20, ema50, ema200 } = ind;
  if (ema20 !== null && ema50 !== null && ema200 !== null) {
    if (ema20 > ema50 && ema50 > ema200) add("Full bullish EMA stack (20>50>200)", 20);
    else if (ema20 < ema50 && ema50 < ema200) add("Full bearish EMA stack (20<50<200)", -20);
    else if (ema20 > ema50) add("Short-term EMA above medium-term", 8);
    else add("Short-term EMA below medium-term", -8);
  } else if (ema20 !== null && ema50 !== null) {
    add(
      ema20 > ema50 ? "EMA20 above EMA50 (limited history)" : "EMA20 below EMA50 (limited history)",
      ema20 > ema50 ? 8 : -8
    );
  }
  if (ema50 !== null) {
    add(price > ema50 ? "Price trading above EMA50" : "Price trading below EMA50", price > ema50 ? 8 : -8);
  }
  if (ind.rsi !== null) {
    const r = ind.rsi;
    if (r >= 70) add(`RSI overbought (${r})`, -10);
    else if (r >= 55) add(`RSI bullish (${r})`, 12);
    else if (r > 45) add(`RSI neutral (${r})`, 0);
    else if (r > 30) add(`RSI bearish (${r})`, -12);
    else add(`RSI oversold (${r})`, 10);
  }
  if (ind.macd) {
    const h = ind.macd.histogram;
    if (h > 0) add("MACD histogram positive", 10);
    else if (h < 0) add("MACD histogram negative", -10);
  }
  const vol = classifyVolume(ind);
  if (vol === "HIGH") add("Volume above 20-period average", 6);
  else if (vol === "LOW") add("Volume below average (weak conviction)", -6);
  if (ind.atrPercent !== null && ind.atrPercent >= 4) {
    add(`Extreme volatility (ATR ${ind.atrPercent}% of price)`, -10);
  }
  return { score: clamp(round(score, 1), 0, 100), breakdown };
}
function analyzeMarket(candles, instrumentId, displaySymbol, timeframe) {
  const warnings = [];
  const price = candles[candles.length - 1]?.close ?? 0;
  const ind = computeIndicators(candles);
  if (candles.length < 200) {
    warnings.push(
      `Only ${candles.length} candles available; long-term indicators (EMA200) may be unavailable.`
    );
  }
  if (ind.ema200 === null) warnings.push("EMA200 unavailable \u2014 insufficient candle history.");
  if (ind.macd === null) warnings.push("MACD unavailable \u2014 insufficient candle history.");
  if (ind.rsi === null) warnings.push("RSI unavailable \u2014 insufficient candle history.");
  if (ind.atr === null) warnings.push("ATR unavailable \u2014 volatility could not be measured.");
  const { score, breakdown } = computeTechnicalScore(ind, price);
  return {
    instrumentId,
    displaySymbol,
    timeframe,
    price,
    trend: classifyTrend(ind, price),
    momentum: classifyMomentum(ind),
    volatility: classifyVolatility(ind),
    volume: classifyVolume(ind),
    regime: detectRegime(ind, price),
    support: ind.support,
    resistance: ind.resistance,
    indicators: ind,
    technicalScore: score,
    scoreBreakdown: breakdown,
    candleCount: candles.length,
    // 60 candles is the practical floor for RSI+MACD to both be meaningful.
    insufficientData: candles.length < 60,
    warnings,
    computedAt: Date.now()
  };
}
function round(value, dp) {
  const f = Math.pow(10, dp);
  return Math.round(value * f) / f;
}
function nullableRound(value, dp) {
  return value === null ? null : round(value, dp);
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// server/lib/tracking.ts
var import_node_crypto = __toESM(require("node:crypto"), 1);
function id(prefix) {
  return `${prefix}_${Date.now()}_${import_node_crypto.default.randomBytes(4).toString("hex")}`;
}
function trackSignal(signal, note) {
  const direction = signal.ai.signal === "SELL" ? "SHORT" : "LONG";
  const tracked = {
    id: id("track"),
    userId: signal.userId,
    signalId: signal.id,
    instrumentId: signal.instrumentId,
    displaySymbol: signal.displaySymbol,
    provider: signal.provider,
    assetClass: signal.assetClass,
    direction,
    entryPrice: signal.ai.entry,
    stopLoss: signal.ai.stopLoss,
    takeProfit: signal.ai.takeProfit,
    currency: signal.currency,
    timeframe: signal.timeframe,
    openedAt: Date.now(),
    status: "ACTIVE",
    note,
    aiConfidence: signal.ai.confidence,
    technicalScore: signal.analysis.technicalScore,
    finalScore: signal.quality.finalScore
  };
  store.insertTracked(tracked);
  store.updateSignal(signal.id, { tracked: true });
  logger.info("tracking: signal followed", {
    trackedId: tracked.id,
    instrument: tracked.instrumentId,
    direction,
    entry: tracked.entryPrice
  });
  return tracked;
}
function computeResultPercent(direction, entryPrice, exitPrice) {
  if (entryPrice <= 0) return 0;
  const raw = (exitPrice - entryPrice) / entryPrice * 100;
  return Number((direction === "LONG" ? raw : -raw).toFixed(3));
}
function checkTrackedSignal(tracked, currentPrice) {
  if (tracked.status !== "ACTIVE") return null;
  const hitStop = tracked.direction === "LONG" ? currentPrice <= tracked.stopLoss : currentPrice >= tracked.stopLoss;
  const hitTarget = tracked.direction === "LONG" ? currentPrice >= tracked.takeProfit : currentPrice <= tracked.takeProfit;
  if (!hitStop && !hitTarget) return null;
  const exitPrice = hitTarget ? tracked.takeProfit : tracked.stopLoss;
  const updated = store.updateTracked(tracked.id, {
    status: hitTarget ? "HIT_TARGET" : "HIT_STOP",
    closedAt: Date.now(),
    closePrice: exitPrice,
    resultPercent: computeResultPercent(tracked.direction, tracked.entryPrice, exitPrice)
  });
  store.updateSignal(tracked.signalId, {
    outcome: hitTarget ? "CORRECT" : "INCORRECT",
    outcomeCheckedAt: Date.now(),
    outcomePercent: updated?.resultPercent,
    outcomeNote: hitTarget ? `Take profit at ${tracked.takeProfit} was reached.` : `Stop loss at ${tracked.stopLoss} was reached.`
  });
  logger.info("tracking: signal resolved", {
    trackedId: tracked.id,
    outcome: hitTarget ? "HIT_TARGET" : "HIT_STOP",
    resultPercent: updated?.resultPercent
  });
  return updated;
}
function closeTracked(tracked, currentPrice) {
  const resultPercent = computeResultPercent(tracked.direction, tracked.entryPrice, currentPrice);
  const updated = store.updateTracked(tracked.id, {
    status: "CLOSED_MANUALLY",
    closedAt: Date.now(),
    closePrice: currentPrice,
    resultPercent
  });
  store.updateSignal(tracked.signalId, {
    // A manual exit is not evidence the signal itself was right or wrong.
    outcome: "NEUTRAL",
    outcomeCheckedAt: Date.now(),
    outcomePercent: resultPercent,
    outcomeNote: `Closed manually at ${currentPrice} for ${resultPercent > 0 ? "+" : ""}${resultPercent}%.`
  });
  logger.info("tracking: signal closed manually", {
    trackedId: tracked.id,
    resultPercent
  });
  return updated;
}
function computeStats(userId) {
  const signals = store.listSignals(userId, 1e3);
  const tracked = store.listTracked(userId);
  const resolved = tracked.filter((t) => t.status !== "ACTIVE" && typeof t.resultPercent === "number").sort((a, b) => (a.closedAt || 0) - (b.closedAt || 0));
  const wins = resolved.filter((t) => (t.resultPercent || 0) > 0);
  const losses = resolved.filter((t) => (t.resultPercent || 0) < 0);
  const correct = tracked.filter((t) => t.status === "HIT_TARGET").length;
  const incorrect = tracked.filter((t) => t.status === "HIT_STOP").length;
  const neutral = tracked.filter(
    (t) => t.status === "CLOSED_MANUALLY" || t.status === "EXPIRED"
  ).length;
  const decisive = correct + incorrect;
  let streak = 0;
  let streakType = "NONE";
  for (let i = resolved.length - 1; i >= 0; i--) {
    const isWin = (resolved[i].resultPercent || 0) > 0;
    const type = isWin ? "WIN" : "LOSS";
    if (streakType === "NONE") {
      streakType = type;
      streak = 1;
    } else if (streakType === type) streak++;
    else break;
  }
  const avg = (rows) => rows.length ? Number((rows.reduce((s, t) => s + (t.resultPercent || 0), 0) / rows.length).toFixed(2)) : 0;
  return {
    totalSignals: signals.length,
    tracked: tracked.length,
    correct,
    incorrect,
    neutral,
    pending: tracked.filter((t) => t.status === "ACTIVE").length,
    accuracy: decisive > 0 ? Number((correct / decisive * 100).toFixed(1)) : null,
    averageWinPercent: avg(wins),
    averageLossPercent: avg(losses),
    bestPercent: resolved.length ? Math.max(...resolved.map((t) => t.resultPercent || 0)) : 0,
    worstPercent: resolved.length ? Math.min(...resolved.map((t) => t.resultPercent || 0)) : 0,
    currentStreak: streak,
    currentStreakType: streakType,
    netPercent: Number(resolved.reduce((s, t) => s + (t.resultPercent || 0), 0).toFixed(2))
  };
}

// server/lib/email.ts
var import_resend = require("resend");
var DEFAULT_FROM = "LURZ AI <onboarding@resend.dev>";
function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new import_resend.Resend(apiKey);
}
function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}
function fromAddress() {
  return process.env.RESEND_FROM?.trim() || DEFAULT_FROM;
}
async function sendWelcomeEmail(params) {
  const resend = getResendClient();
  if (!resend) {
    return { ok: false, skipped: true, error: "RESEND_API_KEY is not configured." };
  }
  const to = params.to.trim().toLowerCase();
  const name = params.name.trim() || "Trader";
  const appUrl = resolveAppUrl();
  const idempotencyKey = `welcome-email/${params.userId || to}`;
  const { data, error } = await resend.emails.send(
    {
      from: fromAddress(),
      to: [to],
      subject: "Welcome to LURZ AI",
      html: `
        <div style="font-family:Georgia,serif;line-height:1.5;color:#111;max-width:520px">
          <p style="font-size:20px;margin:0 0 12px">Welcome to LURZ AI, ${escapeHtml(name)}.</p>
          <p style="margin:0 0 16px">Your account is ready. Open the desk to review live markets and AI-scored setups.</p>
          <p style="margin:0 0 24px">
            <a href="${appUrl}/app" style="display:inline-block;padding:12px 18px;background:#0f172a;color:#fff;text-decoration:none">
              Open LURZ AI
            </a>
          </p>
          <p style="margin:0;font-size:13px;color:#555">If you did not create this account, you can ignore this email.</p>
        </div>
      `.trim(),
      text: `Welcome to LURZ AI, ${name}.

Your account is ready. Open the desk: ${appUrl}/app

If you did not create this account, you can ignore this email.`
    },
    { idempotencyKey }
  );
  if (error) {
    logger.error("email: welcome send failed", { message: error.message, to });
    return { ok: false, skipped: false, error: error.message };
  }
  logger.info("email: welcome sent", { id: data?.id, to });
  return { ok: true, id: data?.id ?? "" };
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// server/lib/session.ts
var import_node_crypto2 = __toESM(require("node:crypto"), 1);
var SESSION_COOKIE = "tp_sid";
var SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
function ensureSession(req, res) {
  const existing = readCookie(req, SESSION_COOKIE);
  if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing;
  const sid = import_node_crypto2.default.randomBytes(16).toString("hex");
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    // unreadable from JavaScript
    sameSite: "lax",
    // blocks cross-site submission
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/"
  });
  return sid;
}
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

// server/routes/api.ts
var api = (0, import_express.Router)();
var VALID_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];
var VALID_ASSET_CLASSES = ["CRYPTO", "STOCK", "FOREX", "COMMODITY", "INDEX", "ETF"];
var VALID_SIZE_UNITS = ["QUOTE", "PERCENT"];
var MIN_WINDOW_MINUTES = 5;
var MAX_WINDOW_MINUTES = 24 * 60;
function fail(res, status, message, detail) {
  return res.status(status).json({ error: message, detail: detail ?? void 0 });
}
function handleError(res, err, fallback) {
  if (err instanceof ProviderError) {
    return fail(res, err.httpStatus, err.userMessage || fallback);
  }
  if (err instanceof AIError) {
    return res.status(502).json({ error: err.message, detail: err.detail, kind: "AI_ERROR" });
  }
  logger.error("api: unhandled route error", err);
  return fail(res, 500, fallback);
}
function parseTimeframe(value) {
  return VALID_TIMEFRAMES.includes(value) ? value : null;
}
function parseWindowMinutes(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < MIN_WINDOW_MINUTES || rounded > MAX_WINDOW_MINUTES) return null;
  return rounded;
}
function parseSizeAmount(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
function parseSizeUnit(value) {
  return VALID_SIZE_UNITS.includes(value) ? value : null;
}
function startOfDay(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
api.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "LURZ AI", time: Date.now() });
});
var welcomeEmailCooldown = /* @__PURE__ */ new Map();
var WELCOME_COOLDOWN_MS = 6e4;
api.post("/email/welcome", async (req, res) => {
  ensureSession(req, res);
  if (!isEmailConfigured()) {
    return res.status(503).json({
      error: "Transactional email is not configured on this server.",
      skipped: true
    });
  }
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : void 0;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail(res, 400, "A valid email is required.");
  }
  if (!name) {
    return fail(res, 400, "Name is required.");
  }
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const last = welcomeEmailCooldown.get(ip) ?? 0;
  if (now - last < WELCOME_COOLDOWN_MS) {
    return fail(res, 429, "Please wait before requesting another welcome email.");
  }
  welcomeEmailCooldown.set(ip, now);
  try {
    const result = await sendWelcomeEmail({ to: email, name, userId });
    if (result.ok === true) {
      return res.json({ ok: true, id: result.id });
    }
    if (result.skipped) {
      return res.status(503).json({ error: result.error, skipped: true });
    }
    return fail(res, 502, "Failed to send welcome email.", result.error);
  } catch (err) {
    return handleError(res, err, "Failed to send welcome email.");
  }
});
api.get("/status", async (req, res) => {
  ensureSession(req, res);
  const providers2 = listProviders();
  const result = {
    marketData: "DISCONNECTED",
    ai: isAIConfigured() ? "CONNECTED" : "UNAVAILABLE",
    email: isEmailConfigured() ? "CONNECTED" : "UNAVAILABLE",
    providers: providers2,
    details: {
      ai: isAIConfigured() ? "AI analysis service is configured" : "AI analysis is not configured on this server",
      email: isEmailConfigured() ? "Resend transactional email is configured" : "RESEND_API_KEY is not configured"
    }
  };
  try {
    const binance = getProvider("binance");
    const list = await binance.listInstruments();
    result.marketData = list.length > 0 ? "CONNECTED" : "ERROR";
    const available = providers2.filter((p) => p.available).length;
    result.details.marketData = `${available} of ${providers2.length} data sources available`;
  } catch (err) {
    result.marketData = "ERROR";
    result.details.marketData = err instanceof ProviderError ? err.userMessage || "Market data unavailable" : "Market data unavailable";
  }
  res.json(result);
});
api.get("/providers", (req, res) => {
  ensureSession(req, res);
  res.json(listProviders());
});
api.get("/search", async (req, res) => {
  ensureSession(req, res);
  const query = String(req.query.q ?? "");
  const limit = Math.min(Number(req.query.limit) || 25, 50);
  const assetClassRaw = req.query.assetClass ? String(req.query.assetClass).toUpperCase() : null;
  const assetClass = assetClassRaw && VALID_ASSET_CLASSES.includes(assetClassRaw) ? assetClassRaw : void 0;
  const providerRaw = req.query.provider ? String(req.query.provider) : null;
  const provider = providerRaw ? providerRaw : void 0;
  try {
    res.json(await searchInstruments(query, { limit, assetClass, provider }));
  } catch (err) {
    handleError(res, err, "Symbol search failed.");
  }
});
api.get("/instrument", async (req, res) => {
  ensureSession(req, res);
  const id2 = String(req.query.id || "");
  if (!id2) return fail(res, 400, "An instrument id is required.");
  try {
    res.json(await resolveInstrument(id2));
  } catch (err) {
    handleError(res, err, "Could not load that market.");
  }
});
api.get("/market/quote", async (req, res) => {
  ensureSession(req, res);
  const id2 = String(req.query.id || "");
  if (!id2) return fail(res, 400, "An instrument id is required.");
  try {
    const instrument = await resolveInstrument(id2);
    res.json(await getProvider(instrument.provider).getQuote(instrument));
  } catch (err) {
    handleError(res, err, "Could not load the current price.");
  }
});
api.get("/market/candles", async (req, res) => {
  ensureSession(req, res);
  const id2 = String(req.query.id || "");
  const timeframe = parseTimeframe(req.query.timeframe);
  const limit = Math.min(Number(req.query.limit) || 300, 1e3);
  if (!id2) return fail(res, 400, "An instrument id is required.");
  if (!timeframe) return fail(res, 400, `Timeframe must be one of ${VALID_TIMEFRAMES.join(", ")}.`);
  try {
    const instrument = await resolveInstrument(id2);
    res.json(await getProvider(instrument.provider).getCandles(instrument, timeframe, limit));
  } catch (err) {
    handleError(res, err, "Could not load candle data.");
  }
});
api.get("/market/analysis", async (req, res) => {
  ensureSession(req, res);
  const id2 = String(req.query.id || "");
  const timeframe = parseTimeframe(req.query.timeframe) || "1h";
  if (!id2) return fail(res, 400, "An instrument id is required.");
  try {
    const instrument = await resolveInstrument(id2);
    const candles = await getProvider(instrument.provider).getCandles(instrument, timeframe, 300);
    res.json(analyzeMarket(candles, instrument.id, instrument.displaySymbol, timeframe));
  } catch (err) {
    handleError(res, err, "Could not compute the analysis.");
  }
});
api.get("/market/stream-config", async (req, res) => {
  ensureSession(req, res);
  const id2 = String(req.query.id || "");
  const timeframe = parseTimeframe(req.query.timeframe) || "1h";
  if (!id2) return fail(res, 400, "An instrument id is required.");
  try {
    const instrument = await resolveInstrument(id2);
    const provider = getProvider(instrument.provider);
    const config = provider.getStreamConfig?.(instrument, timeframe) ?? null;
    res.json({
      supported: Boolean(config),
      config,
      // Polling interval for providers without a public stream.
      pollIntervalMs: config ? null : instrument.assetClass === "CRYPTO" ? 1e4 : 3e4
    });
  } catch (err) {
    handleError(res, err, "Could not load streaming configuration.");
  }
});
api.get("/settings", (req, res) => {
  res.json(store.getSettings(ensureSession(req, res)));
});
api.put("/settings", (req, res) => {
  const sid = ensureSession(req, res);
  const body = req.body || {};
  const numeric = [
    ["minSignalQuality", 0, 100],
    ["minRiskReward", 0.1, 100],
    ["accountRiskPercent", 0.1, 100],
    ["maxSignalsPerDay", 1, 500],
    ["cooldownMinutes", 0, 1440],
    ["maxMarketDataAgeSeconds", 5, 3600],
    ["aiTemperature", 0, 2]
  ];
  const patch = {};
  for (const [key, min, max] of numeric) {
    if (body[key] !== void 0) {
      const value = Number(body[key]);
      if (!Number.isFinite(value)) return fail(res, 400, `Setting "${key}" must be a number.`);
      patch[key] = Math.max(min, Math.min(max, value));
    }
  }
  if (typeof body.aiModel === "string" && body.aiModel.trim()) patch.aiModel = body.aiModel.trim();
  if (typeof body.requireStopLoss === "boolean") patch.requireStopLoss = body.requireStopLoss;
  if (parseTimeframe(body.defaultTimeframe)) patch.defaultTimeframe = body.defaultTimeframe;
  if (Array.isArray(body.favourites)) {
    patch.favourites = body.favourites.filter((f) => typeof f === "string").slice(0, 50);
  }
  res.json(store.saveSettings(sid, patch));
});
api.post("/analyze", async (req, res) => {
  const sid = ensureSession(req, res);
  const settings = store.getSettings(sid);
  const instrumentId = String(req.body?.instrumentId || "");
  const timeframe = parseTimeframe(req.body?.timeframe) || settings.defaultTimeframe;
  const windowMinutes = parseWindowMinutes(req.body?.windowMinutes);
  const sizeAmount = parseSizeAmount(req.body?.sizeAmount);
  const sizeUnit = parseSizeUnit(req.body?.sizeUnit) || "QUOTE";
  if (!instrumentId) return fail(res, 400, "An instrument id is required.");
  if (windowMinutes === null) {
    return fail(
      res,
      400,
      `Choose a trade window between ${MIN_WINDOW_MINUTES} and ${MAX_WINDOW_MINUTES} minutes.`
    );
  }
  if (sizeAmount === null) {
    return fail(res, 400, "Enter how much you intend to trade (a positive number). Advisory only \u2014 nothing is executed.");
  }
  if (sizeUnit === "PERCENT" && sizeAmount > 100) {
    return fail(res, 400, "Percent of account cannot exceed 100.");
  }
  if (!isAIConfigured()) {
    return fail(
      res,
      503,
      "AI analysis is not available on this server. The operator has not configured an AI service key."
    );
  }
  try {
    const instrument = await resolveInstrument(instrumentId);
    const provider = getProvider(instrument.provider);
    const [quote, candles] = await Promise.all([
      provider.getQuote(instrument),
      provider.getCandles(instrument, timeframe, 300)
    ]);
    if (candles.length < 30) {
      return fail(
        res,
        422,
        `Only ${candles.length} candles are available for ${instrument.displaySymbol} on ${timeframe}. That is not enough for a reliable analysis \u2014 try a longer timeframe.`
      );
    }
    const analysis = analyzeMarket(candles, instrument.id, instrument.displaySymbol, timeframe);
    const activeTracked = store.listActiveTracked(sid).find((t) => t.instrumentId === instrument.id);
    const intendedSizeNote = sizeUnit === "PERCENT" ? `${sizeAmount}% of account` : `${sizeAmount} ${instrument.currency}`;
    const prompt = buildUserPrompt({
      analysis,
      quote,
      candles,
      displaySymbol: instrument.displaySymbol,
      instrumentName: instrument.name,
      assetClass: instrument.assetClass,
      providerLabel: instrument.providerLabel,
      currency: instrument.currency,
      minRiskReward: settings.minRiskReward,
      activeSignal: activeTracked ? {
        direction: activeTracked.direction,
        entryPrice: activeTracked.entryPrice,
        openedAt: activeTracked.openedAt
      } : null,
      tradeWindowMinutes: windowMinutes,
      intendedSizeNote
    });
    const ai = await requestAIAnalysis({
      model: settings.aiModel,
      temperature: settings.aiTemperature,
      userPrompt: prompt,
      marketPrice: quote.price
    });
    ai.analysis.durationMinutes = windowMinutes;
    const quality = computeSignalQuality(analysis, ai.analysis);
    const todaySignals = store.listSignalsSince(sid, startOfDay());
    const lastTracked = store.listTracked(sid).filter((t) => t.instrumentId === instrument.id).sort((a, b) => b.openedAt - a.openedAt)[0];
    const now = Date.now();
    const tradeIntent = {
      windowMinutes,
      endsAt: now + windowMinutes * 6e4,
      sizeAmount,
      sizeUnit,
      status: "ACTIVE"
    };
    const advice = buildAdvice({
      ai: ai.analysis,
      analysis,
      quality,
      settings,
      marketDataAgeSeconds: (Date.now() - quote.fetchedAt) / 1e3,
      todaySignals,
      lastTrackedAt: lastTracked?.openedAt ?? null,
      marketClosed: quote.marketClosed,
      tradeIntent
    });
    const record = {
      id: `sig_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      userId: sid,
      timestamp: now,
      instrumentId: instrument.id,
      provider: instrument.provider,
      displaySymbol: instrument.displaySymbol,
      assetClass: instrument.assetClass,
      timeframe,
      priceAtSignal: quote.price,
      currency: instrument.currency,
      ai: ai.analysis,
      analysis,
      quality,
      advice,
      tradeIntent,
      tracked: false,
      outcome: "PENDING"
    };
    store.insertSignal(record);
    logger.info("ai: signal generated", {
      instrument: instrument.id,
      timeframe,
      windowMinutes,
      signal: ai.analysis.signal,
      verdict: advice.verdict,
      finalScore: quality.finalScore,
      model: ai.model,
      latencyMs: ai.latencyMs
    });
    res.json({ signal: record, quote, instrument, notes: ai.notes, model: ai.model });
  } catch (err) {
    handleError(res, err, "The analysis could not be completed. Please try again.");
  }
});
api.get("/signals/:id/live", async (req, res) => {
  const sid = ensureSession(req, res);
  const settings = store.getSettings(sid);
  const signal = store.getSignal(req.params.id);
  if (!signal || signal.userId !== sid) {
    return fail(res, 404, "That signal no longer exists. Run a new analysis.");
  }
  try {
    const instrument = await resolveInstrument(signal.instrumentId);
    const provider = getProvider(instrument.provider);
    const [quote, candles] = await Promise.all([
      provider.getQuote(instrument),
      provider.getCandles(instrument, signal.timeframe, 300)
    ]);
    const analysis = candles.length >= 30 ? analyzeMarket(candles, instrument.id, instrument.displaySymbol, signal.timeframe) : signal.analysis;
    const lastTracked = store.listTracked(sid).filter((t) => t.instrumentId === signal.instrumentId).sort((a, b) => b.openedAt - a.openedAt)[0];
    const live = evaluateLive({
      signal,
      currentPrice: quote.price,
      analysis,
      settings,
      marketDataAgeSeconds: (Date.now() - quote.fetchedAt) / 1e3,
      todaySignals: store.listSignalsSince(sid, startOfDay()),
      lastTrackedAt: lastTracked?.openedAt ?? null,
      marketClosed: quote.marketClosed
    });
    if (signal.tradeIntent && signal.tradeIntent.status === "ACTIVE" && (live.lifecycle === "EXPIRED" || live.lifecycle === "INVALIDATED" || live.lifecycle === "TARGET_HIT")) {
      store.updateSignal(signal.id, {
        tradeIntent: { ...signal.tradeIntent, status: "COMPLETE" }
      });
      signal.tradeIntent = { ...signal.tradeIntent, status: "COMPLETE" };
    }
    res.json({ live, quote, analysis, tradeIntent: signal.tradeIntent ?? null });
  } catch (err) {
    handleError(res, err, "Could not refresh this signal.");
  }
});
api.post("/tracked", (req, res) => {
  const sid = ensureSession(req, res);
  const signalId = String(req.body?.signalId || "");
  const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 280) : void 0;
  if (!signalId) return fail(res, 400, "A signal id is required.");
  const signal = store.getSignal(signalId);
  if (!signal || signal.userId !== sid) {
    return fail(res, 404, "That signal no longer exists. Run a new analysis.");
  }
  if (signal.ai.signal === "HOLD") {
    return fail(res, 400, "A HOLD signal cannot be followed \u2014 there is no trade to track.");
  }
  if (signal.tracked) {
    return fail(res, 409, "You are already following this signal.");
  }
  res.json({ tracked: trackSignal(signal, note) });
});
api.get("/tracked", async (req, res) => {
  const sid = ensureSession(req, res);
  const tracked = store.listTracked(sid);
  const views = [];
  const priceCache = /* @__PURE__ */ new Map();
  for (const t of tracked) {
    let price = priceCache.get(t.instrumentId);
    if (price === void 0) {
      if (t.status !== "ACTIVE") {
        price = null;
      } else {
        try {
          const instrument = await resolveInstrument(t.instrumentId);
          const quote = await getProvider(instrument.provider).getQuote(instrument);
          price = quote.price;
        } catch {
          price = null;
        }
      }
      priceCache.set(t.instrumentId, price);
    }
    let current = t;
    if (t.status === "ACTIVE" && price !== null) {
      current = checkTrackedSignal(t, price) ?? t;
    }
    const reference = current.closePrice ?? price;
    const unrealized = reference === null || reference === void 0 ? null : (current.direction === "LONG" ? reference - current.entryPrice : current.entryPrice - reference) / current.entryPrice * 100;
    const span = Math.abs(current.takeProfit - current.entryPrice);
    const moved = reference === null || reference === void 0 ? null : current.direction === "LONG" ? reference - current.entryPrice : current.entryPrice - reference;
    const safeUnrealized = unrealized === null || !Number.isFinite(unrealized) ? null : Number(unrealized.toFixed(3));
    const rawProgress = moved === null || span <= 0 ? null : moved / span * 100;
    const safeProgress = rawProgress === null || !Number.isFinite(rawProgress) ? null : Number(rawProgress.toFixed(1));
    views.push({
      ...current,
      currentPrice: current.status === "ACTIVE" ? price ?? null : current.closePrice ?? null,
      unrealizedPercent: safeUnrealized,
      progressPercent: safeProgress,
      durationMs: (current.closedAt ?? Date.now()) - current.openedAt
    });
  }
  res.json(views);
});
api.post("/tracked/:id/close", async (req, res) => {
  const sid = ensureSession(req, res);
  const tracked = store.getTracked(req.params.id);
  if (!tracked || tracked.userId !== sid) return fail(res, 404, "That tracked signal was not found.");
  if (tracked.status !== "ACTIVE") return fail(res, 409, "That signal is already closed.");
  try {
    const instrument = await resolveInstrument(tracked.instrumentId);
    const quote = await getProvider(instrument.provider).getQuote(instrument);
    res.json({ tracked: closeTracked(tracked, quote.price) });
  } catch (err) {
    handleError(res, err, "Could not close the tracked signal because the price is unavailable.");
  }
});
api.get("/signals", (req, res) => {
  const sid = ensureSession(req, res);
  res.json(store.listSignals(sid, Math.min(Number(req.query.limit) || 100, 500)));
});
api.get("/stats", (req, res) => {
  const sid = ensureSession(req, res);
  const settings = store.getSettings(sid);
  const todaySignals = store.listSignalsSince(sid, startOfDay());
  res.json({
    stats: computeStats(sid),
    signalsToday: todaySignals.length,
    maxSignalsPerDay: settings.maxSignalsPerDay
  });
});
api.post("/signals/evaluate", async (req, res) => {
  const sid = ensureSession(req, res);
  try {
    const updated = await evaluatePendingSignals(sid);
    res.json({ updated, stats: computeStats(sid) });
  } catch (err) {
    handleError(res, err, "Signal evaluation failed.");
  }
});
api.post("/chat", async (req, res) => {
  const sid = ensureSession(req, res);
  const settings = store.getSettings(sid);
  const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const instrumentId = req.body?.instrumentId ? String(req.body.instrumentId) : null;
  const timeframe = parseTimeframe(req.body?.timeframe) || settings.defaultTimeframe;
  const messages = rawMessages.filter(
    (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0
  ).slice(-20).map((m) => ({ role: m.role, content: m.content.slice(0, 4e3) }));
  if (messages.length === 0) return fail(res, 400, "A message is required.");
  if (messages[messages.length - 1].role !== "user") {
    return fail(res, 400, "The last message must be from the user.");
  }
  if (!isAIConfigured()) {
    return fail(res, 503, "Chat is not available: this server has no AI service configured.");
  }
  let context = "";
  if (instrumentId) {
    try {
      const instrument = await resolveInstrument(instrumentId);
      const provider = getProvider(instrument.provider);
      const [quote, candles] = await Promise.all([
        provider.getQuote(instrument).catch(() => null),
        provider.getCandles(instrument, timeframe, 300).catch(() => [])
      ]);
      const analysis = candles.length >= 30 ? analyzeMarket(candles, instrument.id, instrument.displaySymbol, timeframe) : null;
      const latestSignal = store.listSignals(sid, 100).find((s) => s.instrumentId === instrument.id) ?? null;
      context = buildChatContext({
        displaySymbol: instrument.displaySymbol,
        instrumentName: instrument.name,
        assetClass: instrument.assetClass,
        providerLabel: instrument.providerLabel,
        currency: instrument.currency,
        timeframe,
        quote,
        analysis,
        signal: latestSignal
      });
    } catch (err) {
      logger.warn("chat: could not build market context", { instrumentId, err });
      context = "\n\nCURRENT CONTEXT: market data could not be loaded for this conversation.";
    }
  } else {
    context = buildChatContext({});
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  const send = (event, data) => {
    res.write(`event: ${event}
data: ${JSON.stringify(data)}

`);
  };
  const controller = new AbortController();
  req.on("close", () => controller.abort());
  try {
    const result = await streamChat({
      model: settings.aiModel,
      temperature: 0.6,
      // conversational, versus the analytical path's low temp
      systemPrompt: CHAT_SYSTEM_PROMPT + context,
      messages,
      onDelta: (text) => send("delta", { text }),
      signal: controller.signal
    });
    logger.info("chat: response streamed", {
      instrumentId,
      turns: messages.length,
      chars: result.full.length,
      latencyMs: result.latencyMs
    });
    send("done", { latencyMs: result.latencyMs });
  } catch (err) {
    if (controller.signal.aborted) {
      res.end();
      return;
    }
    const message = err instanceof ChatError ? err.message : "The assistant could not respond. Please try again.";
    logger.error("chat: stream failed", err);
    send("error", { message });
  } finally {
    res.end();
  }
});

// server/createApp.ts
function createApp() {
  if (process.env.VERCEL && !process.env.DATA_DIR) {
    process.env.DATA_DIR = "/tmp/lurz-data";
  }
  store.load();
  const app2 = (0, import_express2.default)();
  app2.use(import_express2.default.json({ limit: "256kb" }));
  app2.use((0, import_cookie_parser.default)());
  app2.use((req, res, next) => {
    if (!req.path.startsWith("/api")) return next();
    const started = Date.now();
    res.on("finish", () => {
      logger.info("http", {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - started
      });
    });
    next();
  });
  app2.use("/api", api);
  app2.use("/api", (_req, res) => {
    res.status(404).json({ error: "Unknown API endpoint." });
  });
  app2.use((err, _req, res, _next) => {
    logger.error("http: unhandled error", err);
    if (res.headersSent) return;
    res.status(500).json({ error: "An unexpected server error occurred." });
  });
  return app2;
}

// server/vercel-handler.ts
if (process.env.VERCEL && !process.env.DATA_DIR) {
  process.env.DATA_DIR = "/tmp/lurz-data";
}
var app = createApp();
function handler(req, res) {
  return app(req, res);
}
