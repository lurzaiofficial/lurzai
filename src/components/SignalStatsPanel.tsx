import React from 'react';
import { Target, TrendingUp, AlertTriangle } from 'lucide-react';
import type { StatsResponse } from '../services/api';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';

interface SignalStatsPanelProps {
  data: StatsResponse | null;
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'bad';
}) {
  const color =
    tone === 'good' ? 'text-emerald-500' : tone === 'bad' ? 'text-rose-500' : 'text-foreground';
  return (
    <div className="bg-muted/40 p-2.5 rounded-lg border border-border/80">
      <span className="text-muted-foreground text-[10px] uppercase block tracking-wider">{label}</span>
      <span className={`font-bold text-sm font-mono ${color}`}>{value}</span>
    </div>
  );
}

/**
 * Formats a percentage defensively.
 *
 * Guards against NaN/Infinity ever reaching the screen — a nonsensical number in
 * a trading statistic is worse than an honest dash.
 */
function pct(value: number | null | undefined, options: { sign?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const prefix = options.sign && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

/**
 * Track record of the signals themselves.
 *
 * Everything is expressed in percentage terms: the application never knows how
 * much a user actually risked, so quoting currency amounts would be fiction.
 */
export const SignalStatsPanel: React.FC<SignalStatsPanelProps> = ({ data }) => {
  if (!data) {
    return (
      <Card className="border-border bg-card text-card-foreground shadow-sm">
        <CardContent className="p-6 text-center text-xs text-muted-foreground">
          Loading statistics…
        </CardContent>
      </Card>
    );
  }

  const s = data.stats;
  const overtrading = data.signalsToday >= data.maxSignalsPerDay;

  return (
    <Card className="border-border bg-card text-card-foreground shadow-sm">
      <CardHeader className="p-4 pb-3 border-b border-border flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          <CardTitle className="text-base font-bold">Track Record</CardTitle>
        </div>
        <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
          {data.signalsToday}/{data.maxSignalsPerDay} today
        </Badge>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {overtrading && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-foreground/90">
              You have run {data.signalsToday} analyses today. Constantly hunting for setups usually
              leads to worse decisions — the best trades are rare.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <Stat label="Signals" value={String(s.totalSignals)} />
          <Stat label="Followed" value={String(s.tracked)} />
          <Stat label="Running" value={String(s.pending)} />
          <Stat label="Target hit" value={String(s.correct)} tone="good" />
          <Stat label="Stopped out" value={String(s.incorrect)} tone="bad" />
          <Stat
            label="Hit rate"
            /* null means nothing has resolved yet — better than showing 0%. */
            value={
              s.accuracy === null || !Number.isFinite(s.accuracy)
                ? 'n/a'
                : `${s.accuracy.toFixed(1)}%`
            }
            tone={s.accuracy !== null && s.accuracy >= 50 ? 'good' : 'neutral'}
          />
          <Stat
            label="Net move"
            value={pct(s.netPercent, { sign: true })}
            tone={s.netPercent >= 0 ? 'good' : 'bad'}
          />
          {/* averageLossPercent is already negative, so no extra sign is added
              (it previously rendered as "--1.20%"). */}
          <Stat label="Avg win" value={pct(s.averageWinPercent, { sign: true })} tone="good" />
          <Stat label="Avg loss" value={pct(s.averageLossPercent)} tone="bad" />
          <Stat label="Best" value={pct(s.bestPercent, { sign: true })} tone="good" />
          <Stat label="Worst" value={pct(s.worstPercent)} tone="bad" />
          <Stat
            label="Streak"
            value={s.currentStreakType === 'NONE' ? '—' : `${s.currentStreak} ${s.currentStreakType}`}
            tone={
              s.currentStreakType === 'WIN' ? 'good' : s.currentStreakType === 'LOSS' ? 'bad' : 'neutral'
            }
          />
        </div>

        <div className="pt-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
            <Target className="h-3 w-3 shrink-0 mt-0.5" />
            <span>
              Percentages describe price movement from entry to exit, not your profit or loss. Your
              actual result depends on the position size you chose on your own exchange.
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
