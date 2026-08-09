import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  CandlestickData,
  LineData,
  HistogramData,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
} from 'lightweight-charts';
import { motion, AnimatePresence } from 'motion/react';
import { Candlestick, Timeframe, MarketAnalysis } from '../types';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  BarChart2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sliders,
  Activity,
  Layers,
  X,
  TrendingUp,
} from 'lucide-react';

interface TradingChartProps {
  symbol: string;
  providerLabel?: string;
  timeframe: Timeframe;
  onSelectTimeframe: (tf: Timeframe) => void;
  candles: Candlestick[];
  analysis: MarketAnalysis | null;
  isLoading: boolean;
  theme?: 'dark' | 'light';
}

/** Drop invalid / non-monotonic bars that crash or scramble lightweight-charts. */
function sanitizeCandles(candles: Candlestick[]): Candlestick[] {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const out: Candlestick[] = [];
  for (const c of sorted) {
    const time = Math.floor(Number(c.time));
    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    const volume = Number(c.volume);
    if (
      !Number.isFinite(time) ||
      time <= 0 ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      high < low ||
      high < Math.max(open, close) ||
      low > Math.min(open, close)
    ) {
      continue;
    }
    if (out.length > 0 && time <= out[out.length - 1].time) {
      // Same timestamp → keep the newer bar (live forming candle).
      if (time === out[out.length - 1].time) {
        out[out.length - 1] = {
          time,
          open,
          high,
          low,
          close,
          volume: Number.isFinite(volume) ? volume : 0,
          closed: c.closed,
        };
      }
      continue;
    }
    out.push({
      time,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
      closed: c.closed,
    });
  }
  return out;
}

function pricePrecision(price: number): number {
  if (!Number.isFinite(price) || price === 0) return 2;
  if (Math.abs(price) >= 1000) return 2;
  if (Math.abs(price) >= 1) return 4;
  return 8;
}

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

interface HoverData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  changePercent: number;
  volume: number;
  ema20?: number;
  ema50?: number;
  ema200?: number;
}

export const TradingChart: React.FC<TradingChartProps> = ({
  symbol,
  providerLabel,
  timeframe,
  onSelectTimeframe,
  candles,
  analysis,
  isLoading,
  theme = 'light',
}) => {
  // Indicator values come from the shared engine so the chart readout matches
  // the values the risk engine used.
  const indicators = analysis?.indicators ?? null;
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Series Refs
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbMiddleSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // Support & Resistance Price Line Refs
  const supportLineRef = useRef<IPriceLine | null>(null);
  const resistanceLineRef = useRef<IPriceLine | null>(null);

  /**
   * Fingerprint of the last rendered dataset.
   *
   * Used to distinguish a streaming tick (update the last bar, preserve zoom)
   * from a genuine dataset change (rebuild the series and refit).
   */
  const lastRenderRef = useRef<{
    seriesKey: string;
    firstTime: number;
    lastTime: number;
    length: number;
  } | null>(null);

  /** Changes only when the underlying dataset changes, not on every tick. */
  const seriesKey = `${symbol}|${timeframe}`;

  /** True once the user has zoomed or panned; suppresses automatic refitting. */
  const userInteractedRef = useRef(false);

  // Toggles & Settings
  const [showEMA20, setShowEMA20] = useState(true);
  const [showEMA50, setShowEMA50] = useState(true);
  const [showEMA200, setShowEMA200] = useState(true);
  const [showBollinger, setShowBollinger] = useState(true);
  const [showSRLevels, setShowSRLevels] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  // Hover Crosshair State
  const [hoverData, setHoverData] = useState<HoverData | null>(null);

  // Handle ESC key to exit expanded view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  // Initialize Lightweight Chart (Runs only when container mounts, expanded state changes, or theme changes)
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;
    const isDark = theme === 'dark';
    // Warm neutrals aligned with landing / app theme tokens.
    const bgColor = isDark ? '#2A261F' : '#FAFAF7';
    const textColor = isDark ? '#B8B0A4' : '#6B6358';
    const gridColor = isDark ? 'rgba(74, 68, 58, 0.45)' : 'rgba(222, 220, 214, 0.9)';
    const borderColor = isDark ? '#4A443A' : '#DEDCD6';

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: bgColor },
        textColor: textColor,
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace, system-ui',
      },
      grid: {
        vertLines: { color: gridColor, style: 1 },
        horzLines: { color: gridColor, style: 1 },
      },
      width: container.clientWidth || 600,
      height: container.clientHeight || 420,
      rightPriceScale: {
        borderColor: borderColor,
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
        autoScale: true,
      },
      timeScale: {
        borderColor: borderColor,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
      },
      crosshair: {
        vertLine: {
          color: '#10b981',
          width: 1,
          style: 3,
          labelBackgroundColor: '#10b981',
        },
        horzLine: {
          color: '#10b981',
          width: 1,
          style: 3,
          labelBackgroundColor: '#10b981',
        },
      },
    });

    chartRef.current = chart;

    // 1. Candlestick Series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });
    candlestickSeriesRef.current = candlestickSeries;

    // 2. EMA Lines
    const ema20Series = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 1,
      title: 'EMA 20',
      crosshairMarkerVisible: false,
    });
    ema20SeriesRef.current = ema20Series;

    const ema50Series = chart.addSeries(LineSeries, {
      color: '#f97316',
      lineWidth: 1,
      title: 'EMA 50',
      crosshairMarkerVisible: false,
    });
    ema50SeriesRef.current = ema50Series;

    const ema200Series = chart.addSeries(LineSeries, {
      color: '#78716c',
      lineWidth: 2,
      title: 'EMA 200',
      crosshairMarkerVisible: false,
    });
    ema200SeriesRef.current = ema200Series;

    // 3. Bollinger Bands Series
    const bbUpperSeries = chart.addSeries(LineSeries, {
      color: 'rgba(6, 182, 212, 0.7)',
      lineWidth: 1,
      lineStyle: 2,
      title: 'BB Upper',
      crosshairMarkerVisible: false,
    });
    bbUpperSeriesRef.current = bbUpperSeries;

    const bbMiddleSeries = chart.addSeries(LineSeries, {
      color: 'rgba(6, 182, 212, 0.4)',
      lineWidth: 1,
      title: 'BB Mid',
      crosshairMarkerVisible: false,
    });
    bbMiddleSeriesRef.current = bbMiddleSeries;

    const bbLowerSeries = chart.addSeries(LineSeries, {
      color: 'rgba(6, 182, 212, 0.7)',
      lineWidth: 1,
      lineStyle: 2,
      title: 'BB Lower',
      crosshairMarkerVisible: false,
    });
    bbLowerSeriesRef.current = bbLowerSeries;

    // 4. Volume Sub-chart — own scale so volume doesn't crush candle prices.
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#27272a',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    // Crosshair Listener for OHLCV hover
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || param.point === undefined || param.point.x < 0 || param.point.y < 0) {
        setHoverData(null);
        return;
      }

      const candle = param.seriesData.get(candlestickSeries) as CandlestickData;
      if (candle) {
        const e20 = param.seriesData.get(ema20Series) as LineData;
        const e50 = param.seriesData.get(ema50Series) as LineData;
        const e200 = param.seriesData.get(ema200Series) as LineData;
        const vol = param.seriesData.get(volumeSeries) as HistogramData;

        const open = candle.open;
        const close = candle.close;
        const change = close - open;
        const changePercent = open !== 0 ? (change / open) * 100 : 0;

        let timeStr = '';
        if (typeof param.time === 'number') {
          timeStr = new Date(param.time * 1000).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
        }

        setHoverData({
          time: timeStr,
          open,
          high: candle.high,
          low: candle.low,
          close,
          change,
          changePercent,
          volume: vol?.value ?? 0,
          ema20: e20?.value,
          ema50: e50?.value,
          ema200: e200?.value,
        });
      }
    });

    /**
     * Detect deliberate zoom/pan so automatic refitting can stand down.
     *
     * lightweight-charts fires this for programmatic changes too, so the flag is
     * only raised for genuine input gestures on the canvas.
     */
    const markUserInteraction = () => {
      userInteractedRef.current = true;
    };

    container.addEventListener('wheel', markUserInteraction, { passive: true });
    container.addEventListener('pointerdown', markUserInteraction, { passive: true });
    container.addEventListener('touchstart', markUserInteraction, { passive: true });

    // ResizeObserver to smoothly resize canvas
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length > 0 && container) {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height });
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('wheel', markUserInteraction);
      container.removeEventListener('pointerdown', markUserInteraction);
      container.removeEventListener('touchstart', markUserInteraction);
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      // The chart instance is gone, so the next render must rebuild the series
      // rather than trying to update a disposed one.
      lastRenderRef.current = null;
    };
  }, [isExpanded, theme]);

  /**
   * Switching market or timeframe is a fresh dataset, so the reader's previous
   * zoom is no longer meaningful — allow one automatic refit.
   */
  useEffect(() => {
    userInteractedRef.current = false;
  }, [seriesKey]);

  // Update Data & Technical Overlays
  useEffect(() => {
    if (!candles || candles.length === 0 || !candlestickSeriesRef.current || !chartRef.current) return;

    const sorted = sanitizeCandles(candles);
    if (sorted.length === 0) return;

    const digits = pricePrecision(sorted[sorted.length - 1].close);

    const candleData: CandlestickData[] = sorted.map((c) => ({
      time: c.time as CandlestickData['time'],
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    /**
     * Live ticks must not reset the reader's zoom or pan.
     *
     * `setData` rebuilds the series and drops the visible range, so it is only
     * used when the dataset genuinely changes (new market, new timeframe, or a
     * history reload). For an ordinary streaming tick — which only mutates the
     * last candle or appends one — `update` is used instead, which leaves the
     * time scale exactly where the user put it.
     */
    const firstTime = sorted[0]?.time ?? 0;
    const lastTime = sorted[sorted.length - 1]?.time ?? 0;
    const prev = lastRenderRef.current;

    const isIncrementalTick =
      prev !== null &&
      prev.seriesKey === seriesKey &&
      prev.firstTime === firstTime &&
      sorted.length >= prev.length &&
      // Same final candle (in-progress update) or exactly one new candle appended.
      (lastTime === prev.lastTime ||
        (sorted.length === prev.length + 1 && lastTime > prev.lastTime));

    try {
      if (isIncrementalTick) {
        const latest = candleData[candleData.length - 1];
        if (latest) candlestickSeriesRef.current.update(latest);
      } else {
        candlestickSeriesRef.current.setData(candleData);
      }
    } catch {
      // Bad tick / race after dispose — force a clean rebuild next pass.
      lastRenderRef.current = null;
      return;
    }

    lastRenderRef.current = {
      seriesKey,
      firstTime,
      lastTime,
      length: sorted.length,
    };

    // Visibility toggles for EMA
    ema20SeriesRef.current?.applyOptions({ visible: showEMA20 });
    ema50SeriesRef.current?.applyOptions({ visible: showEMA50 });
    ema200SeriesRef.current?.applyOptions({ visible: showEMA200 });

    const ema20Data: LineData[] = [];
    const ema50Data: LineData[] = [];
    const ema200Data: LineData[] = [];

    let e20 = sorted[0].close;
    let e50 = sorted[0].close;
    let e200 = sorted[0].close;
    const k20 = 2 / 21;
    const k50 = 2 / 51;
    const k200 = 2 / 201;

    sorted.forEach((c, i) => {
      e20 = i === 0 ? c.close : c.close * k20 + e20 * (1 - k20);
      e50 = i === 0 ? c.close : c.close * k50 + e50 * (1 - k50);
      e200 = i === 0 ? c.close : c.close * k200 + e200 * (1 - k200);

      if (i >= 19) ema20Data.push({ time: c.time as LineData['time'], value: Number(e20.toFixed(digits)) });
      if (i >= 49) ema50Data.push({ time: c.time as LineData['time'], value: Number(e50.toFixed(digits)) });
      if (i >= 199) ema200Data.push({ time: c.time as LineData['time'], value: Number(e200.toFixed(digits)) });
    });

    const applySeries = (
      series: ISeriesApi<'Line'> | null,
      data: LineData[],
      visible: boolean
    ) => {
      if (!series) return;
      series.applyOptions({ visible });
      if (!visible || data.length === 0) {
        if (!visible) series.setData([]);
        return;
      }
      try {
        if (isIncrementalTick) series.update(data[data.length - 1]);
        else series.setData(data);
      } catch {
        series.setData(data);
      }
    };

    applySeries(ema20SeriesRef.current, ema20Data, showEMA20);
    applySeries(ema50SeriesRef.current, ema50Data, showEMA50);
    applySeries(ema200SeriesRef.current, ema200Data, showEMA200);

    bbUpperSeriesRef.current?.applyOptions({ visible: showBollinger });
    bbMiddleSeriesRef.current?.applyOptions({ visible: showBollinger });
    bbLowerSeriesRef.current?.applyOptions({ visible: showBollinger });

    if (showBollinger) {
      const period = 20;
      const multiplier = 2;
      const bbUpperData: LineData[] = [];
      const bbMiddleData: LineData[] = [];
      const bbLowerData: LineData[] = [];

      for (let i = period - 1; i < sorted.length; i++) {
        const slice = sorted.slice(i - period + 1, i + 1);
        const mean = slice.reduce((acc, curr) => acc + curr.close, 0) / period;
        const variance =
          slice.reduce((acc, curr) => acc + Math.pow(curr.close - mean, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        const time = sorted[i].time as LineData['time'];
        bbMiddleData.push({ time, value: Number(mean.toFixed(digits)) });
        bbUpperData.push({ time, value: Number((mean + stdDev * multiplier).toFixed(digits)) });
        bbLowerData.push({ time, value: Number((mean - stdDev * multiplier).toFixed(digits)) });
      }

      applySeries(bbUpperSeriesRef.current, bbUpperData, true);
      applySeries(bbMiddleSeriesRef.current, bbMiddleData, true);
      applySeries(bbLowerSeriesRef.current, bbLowerData, true);
    } else {
      bbUpperSeriesRef.current?.setData([]);
      bbMiddleSeriesRef.current?.setData([]);
      bbLowerSeriesRef.current?.setData([]);
    }

    volumeSeriesRef.current?.applyOptions({ visible: showVolume });
    if (showVolume) {
      const volumeData: HistogramData[] = sorted.map((c) => ({
        time: c.time as HistogramData['time'],
        value: c.volume,
        color: c.close >= c.open ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)',
      }));
      try {
        if (isIncrementalTick && volumeData.length > 0) {
          volumeSeriesRef.current?.update(volumeData[volumeData.length - 1]);
        } else {
          volumeSeriesRef.current?.setData(volumeData);
        }
      } catch {
        volumeSeriesRef.current?.setData(volumeData);
      }
    } else {
      volumeSeriesRef.current?.setData([]);
    }

    if (!isIncrementalTick && !userInteractedRef.current) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [candles, seriesKey, showEMA20, showEMA50, showEMA200, showBollinger, showVolume]);

  // Support / resistance lines — update only when levels or toggle change (not every tick).
  useEffect(() => {
    const series = candlestickSeriesRef.current;
    if (!series) return;

    if (supportLineRef.current) {
      series.removePriceLine(supportLineRef.current);
      supportLineRef.current = null;
    }
    if (resistanceLineRef.current) {
      series.removePriceLine(resistanceLineRef.current);
      resistanceLineRef.current = null;
    }

    if (!showSRLevels || !indicators) return;

    if (indicators.support && Number.isFinite(indicators.support)) {
      supportLineRef.current = series.createPriceLine({
        price: indicators.support,
        color: '#10b981',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'SUP',
      });
    }
    if (indicators.resistance && Number.isFinite(indicators.resistance)) {
      resistanceLineRef.current = series.createPriceLine({
        price: indicators.resistance,
        color: '#f43f5e',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'RES',
      });
    }
  }, [showSRLevels, indicators?.support, indicators?.resistance, seriesKey, isExpanded, theme]);

  /** Explicit user action: refit and hand control back to auto-fitting. */
  const handleResetZoom = () => {
    userInteractedRef.current = false;
    chartRef.current?.timeScale().fitContent();
  };

  const latestCandle = candles && candles.length > 0 ? candles[candles.length - 1] : null;
  const isUp = latestCandle ? latestCandle.close >= latestCandle.open : true;

  // Shared Inner Chart UI Layout
  const renderChartUI = (inModal = false) => (
    <div className="flex flex-col gap-3.5 h-full">
      {/* Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm text-foreground tracking-tight">{symbol}</span>
            <Badge variant="outline" className="text-[10px] font-mono border-border text-muted-foreground">
              {(providerLabel || 'MARKET').toUpperCase()}
            </Badge>
            {inModal && (
              <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] font-mono">
                EXPANDED TERMINAL
              </Badge>
            )}
          </div>

          <div className="h-4 w-[1px] bg-border hidden sm:block" />

          {/* Timeframe Buttons */}
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => onSelectTimeframe(tf)}
                className={`h-6 px-2.5 rounded text-xs font-mono font-medium transition-colors ${
                  timeframe === tf
                    ? 'bg-primary/20 border border-primary/40 text-primary font-bold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Technical Toggles & Expand Button */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => setShowEMA20(!showEMA20)}
            className={`h-7 px-2 rounded-md border flex items-center gap-1.5 font-mono text-[11px] transition-colors ${
              showEMA20
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-500 font-semibold'
                : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground'
            }`}
            title="Toggle Exponential Moving Average 20"
          >
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            EMA20
          </button>

          <button
            onClick={() => setShowEMA50(!showEMA50)}
            className={`h-7 px-2 rounded-md border flex items-center gap-1.5 font-mono text-[11px] transition-colors ${
              showEMA50
                ? 'border-orange-500/40 bg-orange-500/10 text-orange-500 font-semibold'
                : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground'
            }`}
            title="Toggle Exponential Moving Average 50"
          >
            <div className="h-2 w-2 rounded-full bg-orange-500" />
            EMA50
          </button>

          <button
            onClick={() => setShowEMA200(!showEMA200)}
            className={`h-7 px-2 rounded-md border flex items-center gap-1.5 font-mono text-[11px] transition-colors ${
              showEMA200
                ? 'border-stone-500/40 bg-stone-500/10 text-stone-600 dark:text-stone-400 font-semibold'
                : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground'
            }`}
            title="Toggle Exponential Moving Average 200"
          >
            <div className="h-2 w-2 rounded-full bg-stone-500" />
            EMA200
          </button>

          <button
            onClick={() => setShowBollinger(!showBollinger)}
            className={`h-7 px-2 rounded-md border flex items-center gap-1.5 font-mono text-[11px] transition-colors ${
              showBollinger
                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-500 font-semibold'
                : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground'
            }`}
            title="Toggle Bollinger Bands (20, 2)"
          >
            <Layers className="h-3 w-3 text-cyan-500" />
            BB (20,2)
          </button>

          <button
            onClick={() => setShowSRLevels(!showSRLevels)}
            className={`h-7 px-2 rounded-md border flex items-center gap-1.5 font-mono text-[11px] transition-colors ${
              showSRLevels
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500 font-semibold'
                : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground'
            }`}
            title="Toggle Support & Resistance Levels"
          >
            <Sliders className="h-3 w-3 text-emerald-500" />
            S/R Levels
          </button>

          <button
            onClick={() => setShowVolume(!showVolume)}
            className={`h-7 px-2 rounded-md border flex items-center gap-1.5 font-mono text-[11px] transition-colors ${
              showVolume
                ? 'border-border bg-muted text-foreground'
                : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground'
            }`}
            title="Toggle Volume Sub-chart"
          >
            <BarChart2 className="h-3 w-3" />
            Vol
          </button>

          <Button
            variant="outline"
            size="icon"
            onClick={handleResetZoom}
            className="h-7 w-7 border-border text-muted-foreground hover:text-foreground"
            title="Fit Content / Reset Chart Zoom"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 w-7 border-border text-muted-foreground hover:text-foreground"
            title={isExpanded ? 'Minimize Chart (ESC)' : 'Expand Chart View'}
          >
            {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Terminal Inspection Bar */}
      <div className="bg-muted/50 border border-border rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-muted-foreground shrink-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {hoverData ? (
            <>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-[10px] uppercase">TIME:</span>
                <span className="text-foreground font-semibold">{hoverData.time}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-[10px] uppercase">O:</span>
                <span className="text-foreground">${hoverData.open.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-[10px] uppercase">H:</span>
                <span className="text-emerald-500">${hoverData.high.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-[10px] uppercase">L:</span>
                <span className="text-rose-500">${hoverData.low.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-[10px] uppercase">C:</span>
                <span className={`font-bold ${hoverData.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  ${hoverData.close.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-[10px] uppercase">CHG:</span>
                <span className={`font-semibold ${hoverData.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {hoverData.change >= 0 ? '+' : ''}
                  {hoverData.changePercent.toFixed(2)}%
                </span>
              </div>
            </>
          ) : latestCandle ? (
            <>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-[10px] uppercase">LATEST CANDLE</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-[10px] uppercase">O:</span>
                <span className="text-foreground">${latestCandle.open.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-[10px] uppercase">H:</span>
                <span className="text-emerald-500">${latestCandle.high.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-[10px] uppercase">L:</span>
                <span className="text-rose-500">${latestCandle.low.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-[10px] uppercase">C:</span>
                <span className={`font-bold ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
                  ${latestCandle.close.toFixed(2)}
                </span>
              </div>
            </>
          ) : (
            <span className="text-muted-foreground">Hover crosshair over chart to inspect candlestick metrics</span>
          )}
        </div>

        {/* Indicator summary readout */}
        <div className="flex items-center gap-3 text-[11px]">
          {showEMA20 && indicators?.ema20 && (
            <span className="text-blue-500">
              <span className="text-muted-foreground text-[10px]">E20:</span> ${indicators.ema20}
            </span>
          )}
          {showEMA50 && indicators?.ema50 && (
            <span className="text-orange-500">
              <span className="text-muted-foreground text-[10px]">E50:</span> ${indicators.ema50}
            </span>
          )}
          {showEMA200 && indicators?.ema200 && (
            <span className="text-stone-600 dark:text-stone-400 hidden lg:inline">
              <span className="text-muted-foreground text-[10px]">E200:</span> ${indicators.ema200}
            </span>
          )}
          {indicators?.rsi && (
            <span className={indicators.rsi >= 70 ? 'text-rose-500' : indicators.rsi <= 30 ? 'text-emerald-500' : 'text-foreground'}>
              <span className="text-muted-foreground text-[10px]">RSI:</span> {indicators.rsi}
            </span>
          )}
        </div>
      </div>

      {/* Chart Canvas Host */}
      <div className={`relative w-full rounded-lg overflow-hidden border border-border bg-card shadow-inner flex-1 min-h-[350px] ${inModal ? 'min-h-[500px]' : 'h-[420px]'}`}>
        {isLoading && (
          <div className="absolute inset-0 z-20 bg-background/80 backdrop-blur-xs flex items-center justify-center text-sm text-primary font-mono font-medium gap-2">
            <Activity className="h-4 w-4 animate-spin text-primary" />
            <span>Fetching Live Market Orderbook & Klines...</span>
          </div>
        )}

        {/* Live Ticker Pulse Badge */}
        <div className="absolute top-3 right-3 z-10 pointer-events-none flex items-center gap-2 bg-card/90 backdrop-blur-md px-2.5 py-1 rounded-md border border-border text-xs font-mono">
          <span className={`h-2 w-2 rounded-full ${isUp ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-pulse'}`} />
          <span className="text-muted-foreground">FEED:</span>
          <span className={`font-bold ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
            ${latestCandle ? latestCandle.close.toFixed(2) : '---'}
          </span>
        </div>

        <div ref={chartContainerRef} className="w-full h-full" />
      </div>
    </div>
  );

  return (
    <>
      {/*
        Only one chart host mounts at a time. Sharing a single ref between the
        card and the expand modal previously left a blank / broken canvas.
      */}
      {!isExpanded && (
        <div className="bg-card border border-border text-card-foreground rounded-xl p-4 shadow-sm flex flex-col gap-3.5 relative transition-colors duration-150">
          {renderChartUI(false)}
        </div>
      )}

      <AnimatePresence>
        {isExpanded && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsExpanded(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-md"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="relative w-full max-w-7xl h-[88vh] bg-card border border-border text-card-foreground rounded-2xl p-5 shadow-2xl z-10 flex flex-col overflow-hidden"
            >
              <button
                onClick={() => setIsExpanded(false)}
                className="absolute top-4 right-4 z-30 p-1.5 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors"
                title="Exit Fullscreen (ESC)"
              >
                <X className="h-4 w-4" />
              </button>

              {renderChartUI(true)}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
