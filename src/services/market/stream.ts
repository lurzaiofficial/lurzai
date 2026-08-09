/**
 * Live market data stream.
 *
 * Providers differ: Binance uses a URL-encoded multi-stream, Bybit and OKX
 * require a subscribe frame after connecting, and the rest have no public
 * browser feed at all. This class normalizes those differences and falls back
 * to REST polling where streaming is unavailable — so the UI updates either
 * way, and the connection indicator always tells the truth.
 */

import type { Candlestick, ConnectionState, Quote, Timeframe } from '../../../shared/types';
import { marketApi } from '../api';

/** A socket that is open but silent for this long is treated as stale. */
const STALE_AFTER_MS = 30_000;

export interface StreamHandlers {
  onQuote?: (quote: Partial<Quote> & { price: number }) => void;
  onCandle?: (candle: Candlestick) => void;
  onStateChange?: (state: ConnectionState, detail: string) => void;
  onStale?: (isStale: boolean) => void;
}

export class MarketStream {
  private ws: WebSocket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private reconnectAttempts = 0;
  private lastMessageAt = 0;
  private isStale = false;
  private disposed = false;
  /** Incremented on every (re)start so stale async work can be discarded. */
  private generation = 0;

  constructor(
    private instrumentId: string,
    private timeframe: Timeframe,
    private handlers: StreamHandlers
  ) {}

  async start(): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.generation;
    this.teardown();

    this.setState('CONNECTING', 'Connecting to market data');

    let config: Awaited<ReturnType<typeof marketApi.getStreamConfig>>;
    try {
      config = await marketApi.getStreamConfig(this.instrumentId, this.timeframe);
    } catch {
      // Streaming config is optional; polling still works.
      if (generation !== this.generation) return;
      this.startPolling(15_000, 'Live streaming unavailable — polling for updates');
      return;
    }

    if (generation !== this.generation || this.disposed) return;

    if (config.supported && config.config) {
      this.connectSocket(config.config, generation);
    } else {
      this.startPolling(
        config.pollIntervalMs ?? 20_000,
        'This market has no live feed — updating periodically'
      );
    }
  }

  // ---------------------------------------------------------------- socket

  private connectSocket(
    config: { url: string; subscribe?: unknown; kind: string },
    generation: number
  ): void {
    try {
      this.ws = new WebSocket(config.url);
    } catch {
      this.scheduleReconnect('Could not open the market stream');
      return;
    }

    this.ws.onopen = () => {
      if (generation !== this.generation) return;
      this.reconnectAttempts = 0;
      this.lastMessageAt = Date.now();
      this.setStale(false);
      this.setState('CONNECTED', 'Live market stream');

      // Bybit and OKX only send data after an explicit subscribe frame.
      if (config.subscribe) {
        try {
          this.ws?.send(JSON.stringify(config.subscribe));
        } catch {
          /* the socket will error or close on its own */
        }
      }
      this.startStaleWatch();
    };

    this.ws.onmessage = (event) => {
      if (generation !== this.generation) return;
      this.lastMessageAt = Date.now();
      if (this.isStale) this.setStale(false);

      try {
        const payload = JSON.parse(event.data as string);
        if (config.kind === 'binance') this.handleBinance(payload);
        else if (config.kind === 'bybit') this.handleBybit(payload);
        else if (config.kind === 'okx') this.handleOkx(payload);
      } catch {
        // One malformed frame is not worth tearing the connection down.
      }
    };

    this.ws.onerror = () => {
      if (generation !== this.generation) return;
      this.setState('ERROR', 'Market stream error');
    };

    this.ws.onclose = (event) => {
      if (generation !== this.generation || this.disposed) return;
      this.stopStaleWatch();
      this.scheduleReconnect(
        event.wasClean ? 'Stream closed by the server' : `Connection lost (code ${event.code})`
      );
    };
  }

  private handleBinance(payload: any): void {
    // Combined streams wrap the event in `{ stream, data }`; single `/ws` does not.
    const data = payload?.data ?? payload;
    if (!data || typeof data !== 'object') return;

    if (data.e === '24hrTicker' || data.e === '24hrMiniTicker') {
      this.handlers.onQuote?.({
        price: parseFloat(data.c),
        change24h: parseFloat(data.p),
        change24hPercent: parseFloat(data.P),
        high24h: parseFloat(data.h),
        low24h: parseFloat(data.l),
        volume24h: parseFloat(data.q),
        fetchedAt: Date.now(),
      });
    } else if (data.e === 'kline') {
      const k = data.k;
      this.handlers.onCandle?.({
        time: Math.floor(k.t / 1000),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
        closed: Boolean(k.x),
      });
    }
  }

  private handleBybit(payload: any): void {
    const topic: string = payload?.topic || '';

    if (topic.startsWith('tickers.')) {
      const d = payload.data;
      if (!d) return;
      const price = parseFloat(d.lastPrice);
      if (!Number.isFinite(price)) return; // Bybit sends partial delta frames

      this.handlers.onQuote?.({
        price,
        change24hPercent: parseFloat(d.price24hPcnt) * 100,
        high24h: parseFloat(d.highPrice24h),
        low24h: parseFloat(d.lowPrice24h),
        volume24h: parseFloat(d.turnover24h),
        fetchedAt: Date.now(),
      });
    } else if (topic.startsWith('kline.')) {
      const k = payload.data?.[0];
      if (!k) return;
      this.handlers.onCandle?.({
        time: Math.floor(Number(k.start) / 1000),
        open: parseFloat(k.open),
        high: parseFloat(k.high),
        low: parseFloat(k.low),
        close: parseFloat(k.close),
        volume: parseFloat(k.volume),
        closed: Boolean(k.confirm),
      });
    }
  }

  private handleOkx(payload: any): void {
    const channel: string = payload?.arg?.channel || '';
    const row = payload?.data?.[0];
    if (!row) return;

    if (channel === 'tickers') {
      const price = parseFloat(row.last);
      const open = parseFloat(row.open24h);
      this.handlers.onQuote?.({
        price,
        change24h: Number.isFinite(open) ? price - open : 0,
        change24hPercent: open > 0 ? ((price - open) / open) * 100 : 0,
        high24h: parseFloat(row.high24h),
        low24h: parseFloat(row.low24h),
        volume24h: parseFloat(row.volCcy24h),
        fetchedAt: Date.now(),
      });
    } else if (channel.startsWith('candle')) {
      this.handlers.onCandle?.({
        time: Math.floor(Number(row[0]) / 1000),
        open: parseFloat(row[1]),
        high: parseFloat(row[2]),
        low: parseFloat(row[3]),
        close: parseFloat(row[4]),
        volume: parseFloat(row[5]),
        closed: row[8] === '1',
      });
    }
  }

  // --------------------------------------------------------------- polling

  /** REST polling for providers without a public browser feed. */
  private startPolling(intervalMs: number, detail: string): void {
    this.setState('CONNECTED', detail);
    let tick = 0;

    const poll = async () => {
      const generation = this.generation;
      try {
        const quote = await marketApi.getQuote(this.instrumentId);
        if (generation !== this.generation || this.disposed) return;
        this.lastMessageAt = Date.now();
        this.setStale(false);
        this.handlers.onQuote?.(quote);

        // Refresh the latest candle every few polls so the chart stays aligned.
        tick += 1;
        if (tick === 1 || tick % 3 === 0) {
          const candles = await marketApi.getCandles(this.instrumentId, this.timeframe, 2);
          if (generation !== this.generation || this.disposed) return;
          const latest = candles[candles.length - 1];
          if (latest) this.handlers.onCandle?.(latest);
        }
      } catch {
        if (generation !== this.generation) return;
        // Report the failure honestly rather than silently showing old data.
        this.setStale(true);
        this.setState('ERROR', 'Could not refresh the price');
      }
    };

    void poll();
    this.pollTimer = setInterval(poll, intervalMs);
  }

  // ----------------------------------------------------------------- state

  /**
   * Detects a socket that is open but silent. Without this the UI would show
   * CONNECTED indefinitely on a half-dead connection.
   */
  private startStaleWatch(): void {
    this.stopStaleWatch();
    this.staleTimer = setInterval(() => {
      if (Date.now() - this.lastMessageAt > STALE_AFTER_MS) {
        this.setStale(true);
        this.setState('RECONNECTING', 'No data received — reconnecting');
        void this.start();
      }
    }, 5000);
  }

  private stopStaleWatch(): void {
    if (this.staleTimer) {
      clearInterval(this.staleTimer);
      this.staleTimer = null;
    }
  }

  private setStale(value: boolean): void {
    if (this.isStale === value) return;
    this.isStale = value;
    this.handlers.onStale?.(value);
  }

  private scheduleReconnect(reason: string): void {
    if (this.disposed || this.reconnectTimer) return;

    this.reconnectAttempts++;
    // Exponential backoff capped at 30s so a long outage does not hammer the venue.
    const delay = Math.min(1000 * 2 ** (this.reconnectAttempts - 1), 30_000);
    this.setState('RECONNECTING', `${reason}. Retrying in ${Math.round(delay / 1000)}s`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.start();
    }, delay);
  }

  private setState(state: ConnectionState, detail: string): void {
    this.handlers.onStateChange?.(state, detail);
  }

  private teardown(): void {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        /* already closing */
      }
      this.ws = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.stopStaleWatch();
  }

  /** Switches market without recreating the consumer. */
  update(instrumentId: string, timeframe: Timeframe): void {
    if (instrumentId === this.instrumentId && timeframe === this.timeframe) return;
    this.instrumentId = instrumentId;
    this.timeframe = timeframe;
    this.reconnectAttempts = 0;
    void this.start();
  }

  close(): void {
    this.disposed = true;
    this.generation++;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.teardown();
    this.setState('DISCONNECTED', 'Stream closed');
  }
}
