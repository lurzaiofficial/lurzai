import React from 'react';
import { Activity, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import type { MarketAnalysis } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';

interface QuantitativeScoreCardProps {
  analysis: MarketAnalysis | null;
}

/** Renders a value or an explicit "unavailable" — never a placeholder number. */
function Metric({
  label,
  value,
  suffix = '',
  tone,
}: {
  label: string;
  value: number | null | undefined;
  suffix?: string;
  tone?: 'good' | 'bad' | 'neutral';
}) {
  const color =
    tone === 'good' ? 'text-emerald-500' : tone === 'bad' ? 'text-rose-500' : 'text-foreground';
  return (
    <div className="bg-muted/40 p-2.5 rounded-lg border border-border/80">
      <span className="text-muted-foreground text-[10px] uppercase block">{label}</span>
      {value === null || value === undefined ? (
        <span className="text-muted-foreground italic text-xs flex items-center gap-1">
          <HelpCircle className="h-3 w-3" />
          unavailable
        </span>
      ) : (
        <span className={`font-bold text-sm ${color}`}>
          {value.toLocaleString(undefined, { maximumFractionDigits: 6 })}
          {suffix}
        </span>
      )}
    </div>
  );
}

const REGIME_STYLE: Record<string, string> = {
  TRENDING_UP: 'text-emerald-500 border-emerald-500/40 bg-emerald-500/10',
  TRENDING_DOWN: 'text-rose-500 border-rose-500/40 bg-rose-500/10',
  RANGING: 'text-muted-foreground border-border bg-muted/60',
  HIGH_VOLATILITY: 'text-amber-500 border-amber-500/40 bg-amber-500/10',
  LOW_VOLATILITY: 'text-stone-600 border-stone-500/40 bg-stone-500/10 dark:text-stone-400',
};

export const QuantitativeScoreCard: React.FC<QuantitativeScoreCardProps> = ({ analysis }) => {
  const score = analysis?.technicalScore ?? null;
  const breakdown = analysis?.scoreBreakdown ?? [];
  const ind = analysis?.indicators;

  const scoreColor =
    score === null
      ? 'text-muted-foreground border-border bg-muted/60'
      : score >= 65
        ? 'text-emerald-500 border-emerald-500/40 bg-emerald-500/10'
        : score <= 35
          ? 'text-rose-500 border-rose-500/40 bg-rose-500/10'
          : 'text-foreground border-border bg-muted/60';

  return (
    <Card className="border-border bg-card text-card-foreground shadow-sm">
      <CardHeader className="p-4 pb-3 border-b border-border flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-500" />
          <CardTitle className="text-base font-bold">Technical Analysis</CardTitle>
        </div>
        <Badge variant="outline" className="text-[11px] border-border text-muted-foreground">
          Computed locally · no AI
        </Badge>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between bg-muted/50 p-3.5 rounded-xl border border-border">
          <div>
            <p className="text-xs font-semibold">Technical Score</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Trend, momentum, volume and volatility
            </p>
          </div>
          <div
            className={`px-4 py-1.5 rounded-xl border font-mono font-extrabold text-lg flex items-baseline gap-1 ${scoreColor}`}
          >
            <span>{score === null ? '--' : score.toFixed(0)}</span>
            <span className="text-xs font-normal text-muted-foreground">/ 100</span>
          </div>
        </div>

        {analysis && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div className="bg-muted/40 p-2 rounded-lg border border-border/80">
              <span className="text-muted-foreground text-[10px] uppercase block">Momentum</span>
              <span className="font-bold">{analysis.momentum.replace('_', ' ')}</span>
            </div>
            <div className="bg-muted/40 p-2 rounded-lg border border-border/80">
              <span className="text-muted-foreground text-[10px] uppercase block">Volatility</span>
              <span className="font-bold">{analysis.volatility}</span>
            </div>
            <div className="bg-muted/40 p-2 rounded-lg border border-border/80">
              <span className="text-muted-foreground text-[10px] uppercase block">Volume</span>
              <span className="font-bold">{analysis.volume}</span>
            </div>
            <div
              className={`p-2 rounded-lg border ${REGIME_STYLE[analysis.regime] ?? 'border-border'}`}
            >
              <span className="text-muted-foreground text-[10px] uppercase block">Regime</span>
              <span className="font-bold">{analysis.regime.replace(/_/g, ' ')}</span>
            </div>
          </div>
        )}

        {/* Data-quality warnings are surfaced, not hidden. */}
        {analysis && analysis.warnings.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 space-y-1">
            {analysis.warnings.map((w, i) => (
              <p key={i} className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                {w}
              </p>
            ))}
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Score Factors
          </p>
          {breakdown.length > 0 ? (
            <div className="space-y-1.5">
              {breakdown.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs bg-muted/40 p-2 rounded-md border border-border/80"
                >
                  <div className="flex items-center gap-2">
                    {item.points >= 0 ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                    )}
                    <span>{item.label}</span>
                  </div>
                  <span
                    className={`font-mono font-bold ${
                      item.points >= 0 ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {item.points > 0 ? `+${item.points}` : item.points}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic p-2">No analysis loaded.</p>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-border">
          <Metric
            label="RSI (14)"
            value={ind?.rsi}
            tone={
              ind?.rsi === null || ind?.rsi === undefined
                ? 'neutral'
                : ind.rsi > 70
                  ? 'bad'
                  : ind.rsi < 30
                    ? 'good'
                    : 'neutral'
            }
          />
          <Metric
            label="MACD Hist"
            value={ind?.macd?.histogram ?? null}
            tone={(ind?.macd?.histogram ?? 0) >= 0 ? 'good' : 'bad'}
          />
          <Metric label="ATR %" value={ind?.atrPercent} suffix="%" />
          <Metric label="EMA 20" value={ind?.ema20} />
          <Metric label="EMA 50" value={ind?.ema50} />
          <Metric label="EMA 200" value={ind?.ema200} />
          <Metric label="Support" value={ind?.support} tone="good" />
          <Metric label="Resistance" value={ind?.resistance} tone="bad" />
          <Metric label="Candles" value={analysis?.candleCount ?? null} />
        </div>
      </CardContent>
    </Card>
  );
};
