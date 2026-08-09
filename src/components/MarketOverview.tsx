import React from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle, Clock, Star } from 'lucide-react';
import type { Instrument, MarketAnalysis, Quote } from '../types';
import { SymbolSearch } from './SymbolSearch';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

interface MarketOverviewProps {
  instrument: Instrument | null;
  quote: Quote | null;
  analysis: MarketAnalysis | null;
  isLoading: boolean;
  onSelect: (instrument: Instrument) => void;
  onRefresh: () => void;
  error: string | null;
  isLive: boolean;
  isFavourite: boolean;
  onToggleFavourite: () => void;
}

function fmt(value: number | null | undefined, currency = ''): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const digits = Math.abs(value) >= 100 ? 2 : Math.abs(value) >= 1 ? 4 : 6;
  const text = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  });
  return currency ? `${text} ${currency}` : text;
}

function fmtVolume(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(2);
}

export const MarketOverview: React.FC<MarketOverviewProps> = ({
  instrument,
  quote,
  analysis,
  isLoading,
  onSelect,
  onRefresh,
  error,
  isLive,
  isFavourite,
  onToggleFavourite,
}) => {
  const isPositive = (quote?.change24hPercent ?? 0) >= 0;
  const trend = analysis?.trend ?? 'NEUTRAL';
  const currency = instrument?.currency ?? '';

  return (
    <div className="bg-card border border-border text-card-foreground rounded-xl p-4 lg:p-5 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search across every market: crypto, stocks, forex, commodities. */}
          <SymbolSearch
            value={instrument?.displaySymbol ?? ''}
            onSelect={onSelect}
            className="w-64"
            placeholder="Search BTC, AAPL, EUR/USD, gold…"
          />

          {instrument && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleFavourite}
                className="h-9 w-9 text-muted-foreground hover:text-amber-500"
                title={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
              >
                <Star className={`h-4 w-4 ${isFavourite ? 'fill-amber-500 text-amber-500' : ''}`} />
              </Button>

              <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                {instrument.assetClass}
              </Badge>
              <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                {instrument.providerLabel}
              </Badge>
            </>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            title="Refresh market data"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-primary' : ''}`} />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-6 lg:gap-8 text-sm">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1">
              Price
              {isLive && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"
                  title="Live updates"
                />
              )}
            </p>
            <p className="text-xl lg:text-2xl font-extrabold font-mono mt-0.5">
              {quote ? fmt(quote.price, currency) : <span className="text-muted-foreground text-base">unavailable</span>}
            </p>
          </div>

          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
              24h change
            </p>
            <div className="mt-1">
              {quote ? (
                <Badge variant={isPositive ? 'buy' : 'sell'} className="text-xs font-mono py-0.5 px-2">
                  {isPositive ? (
                    <TrendingUp className="h-3 w-3 mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 mr-1" />
                  )}
                  {isPositive ? '+' : ''}
                  {quote.change24hPercent.toFixed(2)}%
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          </div>

          <div className="hidden sm:block">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
              24h high / low
            </p>
            <p className="font-mono text-xs mt-1">
              {quote ? `${fmt(quote.high24h)} / ${fmt(quote.low24h)}` : '—'}
            </p>
          </div>

          <div className="hidden md:block">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
              24h volume
            </p>
            <p className="font-mono text-xs mt-1">{fmtVolume(quote?.volume24h)}</p>
          </div>

          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
              Trend
            </p>
            <div className="mt-1">
              <Badge
                variant={trend === 'BULLISH' ? 'bullish' : trend === 'BEARISH' ? 'bearish' : 'hold'}
                className="text-xs font-bold py-0.5 px-2.5"
              >
                {trend === 'BULLISH' && <TrendingUp className="h-3 w-3 mr-1" />}
                {trend === 'BEARISH' && <TrendingDown className="h-3 w-3 mr-1" />}
                {trend === 'NEUTRAL' && <Minus className="h-3 w-3 mr-1" />}
                {analysis ? trend : '—'}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Stocks and ETFs are only tradable in session hours — say so. */}
      {quote?.marketClosed && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 flex items-start gap-2">
          <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs">
            This market is currently <strong>closed</strong>. The price shown is the last close, and
            it may gap when trading resumes.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-2.5 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-xs">{error}</p>
        </div>
      )}
    </div>
  );
};
