import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Check,
  Clock,
  Cpu,
  Gauge,
  Info,
  Minus,
  ShieldAlert,
  ShieldCheck,
  X,
  Bookmark,
  BookmarkCheck,
  Radio,
} from 'lucide-react';
import type {
  Instrument,
  LiveSignalState,
  MarketAnalysis,
  ServerSettings,
  SignalRecord,
} from '../types';
import type { UserPlanView } from '../services/api';
import {
  tradeActionFromVerdict,
  tradeActionLabel,
} from '../../shared/analysis/tradeWindow';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { PlanBadge } from './PlanBadge';

export type AnalysisProgressStage =
  | 'idle'
  | 'market'
  | 'indicators'
  | 'ai'
  | 'verdict';

interface SignalCardProps {
  instrument: Instrument | null;
  currentPrice: number | null;
  signal: SignalRecord | null;
  /** Live re-evaluation of `signal` against the current price. */
  live: LiveSignalState | null;
  analysis: MarketAnalysis | null;
  isAnalyzing: boolean;
  analysisStage: AnalysisProgressStage;
  isTracking: boolean;
  onAnalyze: () => void;
  onTrack: () => void;
  /** Fired once when the local trade-window countdown hits zero. */
  onWindowEnded?: (signal: SignalRecord) => void;
  settings: ServerSettings;
  analysisError: string | null;
  aiAvailable: boolean;
  plan: UserPlanView | null;
}

const REGIME_LABEL: Record<string, string> = {
  TRENDING_UP: 'Trending up',
  TRENDING_DOWN: 'Trending down',
  RANGING: 'Ranging',
  HIGH_VOLATILITY: 'High volatility',
  LOW_VOLATILITY: 'Low volatility',
};

function fmtPrice(value: number | null | undefined, currency = ''): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const digits = Math.abs(value) >= 100 ? 2 : Math.abs(value) >= 1 ? 4 : 6;
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  });
  return currency ? `${formatted} ${currency}` : formatted;
}

/** Compact age formatter: "just now", "3m", "2h 5m". */
function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

/** Verdict styling. The three levels must be instantly distinguishable. */
const VERDICT_STYLE = {
  TAKE: {
    wrap: 'bg-emerald-500/10 border-emerald-500/50',
    text: 'text-emerald-500',
    accent: 'bg-emerald-500',
    Icon: ShieldCheck,
  },
  CAUTION: {
    wrap: 'bg-amber-500/10 border-amber-500/50',
    text: 'text-amber-500',
    accent: 'bg-amber-500',
    Icon: AlertTriangle,
  },
  AVOID: {
    wrap: 'bg-rose-500/10 border-rose-500/50',
    text: 'text-rose-500',
    accent: 'bg-rose-500',
    Icon: ShieldAlert,
  },
} as const;

const STAGE_LABEL: Record<Exclude<AnalysisProgressStage, 'idle'>, string> = {
  market: 'Fetching live quote & candles…',
  indicators: 'Computing indicators…',
  ai: 'AI interpreting the setup…',
  verdict: 'Building your verdict…',
};

function formatRemaining(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const SignalCard: React.FC<SignalCardProps> = ({
  instrument,
  currentPrice,
  signal,
  live,
  analysis,
  isAnalyzing,
  analysisStage,
  isTracking,
  onAnalyze,
  onTrack,
  onWindowEnded,
  settings,
  analysisError,
  aiAvailable,
  plan,
}) => {
  const ai = signal?.ai;
  const analysisBlocked = Boolean(
    plan && plan.analysesUsedToday >= plan.maxAnalysesPerDay
  );
  /**
   * Prefer the continuously re-evaluated advice over the snapshot taken when
   * the signal was generated. The plan does not move, but whether it is still
   * worth taking does — so the verdict on screen must reflect the live market.
   */
  const advice = live?.advice ?? signal?.advice;
  const quality = signal?.quality;
  const lifecycle = live?.lifecycle;
  const tradeIntent = signal?.tradeIntent;
  const isSettled =
    lifecycle === 'INVALIDATED' || lifecycle === 'TARGET_HIT' || lifecycle === 'EXPIRED';
  const sessionComplete =
    tradeIntent?.status === 'COMPLETE' || lifecycle === 'EXPIRED';
  const direction = ai?.signal ?? 'HOLD';
  const isHold = direction === 'HOLD';

  const verdict = advice ? VERDICT_STYLE[advice.verdict] : null;
  const currency = instrument?.currency ?? '';
  const action =
    advice && ai
      ? tradeActionFromVerdict(advice.verdict, ai.signal)
      : null;

  const [nowTick, setNowTick] = useState(Date.now());
  const windowEndedNotified = useRef<string | null>(null);

  useEffect(() => {
    if (!tradeIntent || tradeIntent.status !== 'ACTIVE' || isSettled) return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [tradeIntent?.endsAt, tradeIntent?.status, isSettled]);

  useEffect(() => {
    windowEndedNotified.current = null;
  }, [signal?.id]);

  const remainingMs =
    tradeIntent && tradeIntent.status === 'ACTIVE'
      ? Math.max(0, tradeIntent.endsAt - nowTick)
      : 0;
  const windowActive = Boolean(
    tradeIntent && tradeIntent.status === 'ACTIVE' && !isSettled && remainingMs > 0
  );
  const windowTimedOut =
    Boolean(tradeIntent && tradeIntent.status === 'ACTIVE' && remainingMs <= 0) ||
    sessionComplete;

  // Fire as soon as the local countdown hits zero — don't wait for the next poll.
  useEffect(() => {
    if (!signal || !onWindowEnded || !windowTimedOut) return;
    if (windowEndedNotified.current === signal.id) return;
    windowEndedNotified.current = signal.id;
    onWindowEnded(signal);
  }, [signal, windowTimedOut, onWindowEnded]);

  return (
    <Card className="border-border bg-card text-card-foreground shadow-sm relative overflow-hidden">
      <div className={`h-1.5 w-full ${verdict ? verdict.accent : 'bg-muted-foreground/30'}`} />

      <CardHeader className="p-5 pb-4 border-b border-border flex flex-row items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-foreground" />
            <CardTitle className="text-xl font-bold tracking-tight">Trade Signal</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Indicators calculated locally · AI interprets · you decide
          </p>
        </div>
        <PlanBadge plan={plan} compact />
      </CardHeader>

      <CardContent className="p-5 space-y-5">
        {/* Headline strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/50 p-3.5 rounded-xl border border-border">
          <div>
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider block">Market</span>
            <span className="text-base font-bold font-mono truncate block">
              {instrument?.displaySymbol ?? '—'}
            </span>
            {instrument && (
              <span className="text-[10px] text-muted-foreground truncate block">
                {instrument.providerLabel}
              </span>
            )}
          </div>

          <div>
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider block">Price</span>
            <span className="text-base font-bold font-mono">
              {currentPrice === null ? (
                <span className="text-muted-foreground text-sm">unavailable</span>
              ) : (
                fmtPrice(currentPrice, currency)
              )}
            </span>
          </div>

          <div>
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider block">Trend</span>
            <div className="mt-0.5">
              <Badge
                variant={
                  analysis?.trend === 'BULLISH' ? 'bullish'
                  : analysis?.trend === 'BEARISH' ? 'bearish'
                  : 'hold'
                }
                className="text-xs font-bold"
              >
                {analysis?.trend ?? '—'}
              </Badge>
              {analysis && (
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  {REGIME_LABEL[analysis.regime] ?? analysis.regime}
                </span>
              )}
            </div>
          </div>

          <div>
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider block">Signal</span>
            <div className="mt-0.5">
              <Badge
                variant={direction === 'BUY' ? 'buy' : direction === 'SELL' ? 'sell' : 'hold'}
                className="text-sm font-extrabold px-3 py-0.5"
              >
                {signal ? direction : '—'}
              </Badge>
            </div>
          </div>
        </div>

        {isAnalyzing && analysisStage !== 'idle' && (
          <div className="rounded-xl border border-border bg-muted/40 p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 animate-spin shrink-0" />
              Analysing live…
            </div>
            <p className="text-xs text-muted-foreground">{STAGE_LABEL[analysisStage]}</p>
            <div className="flex gap-1.5">
              {(['market', 'indicators', 'ai', 'verdict'] as const).map((step, i) => {
                const order = ['market', 'indicators', 'ai', 'verdict'] as const;
                const current = order.indexOf(analysisStage);
                const done = i <= current;
                return (
                  <div
                    key={step}
                    className={`h-1 flex-1 rounded-full ${done ? 'bg-foreground' : 'bg-muted'}`}
                  />
                );
              })}
            </div>
            {analysis && (
              <p className="text-[10px] text-muted-foreground">
                Local indicators ready · trend {analysis.trend.toLowerCase()} · score{' '}
                {analysis.technicalScore}/100
              </p>
            )}
          </div>
        )}

        {/* The verdict: the single most important thing on screen. */}
        {advice && verdict && action && (
          <div className={`rounded-xl border-2 p-4 space-y-3 ${verdict.wrap}`}>
            <div className="flex items-start gap-3">
              <verdict.Icon className={`h-7 w-7 shrink-0 ${verdict.text}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-2xl font-extrabold tracking-tight ${verdict.text}`}>
                    {tradeActionLabel(action)}
                  </p>
                  {windowActive && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-500 uppercase tracking-wider">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live
                    </span>
                  )}
                  {(sessionComplete || windowTimedOut) && (
                    <Badge variant="outline" className="text-[10px] border-border">
                      Window ended
                    </Badge>
                  )}
                </div>
                <p className={`text-sm font-bold mt-0.5 ${verdict.text}`}>{advice.headline}</p>
                <p className="text-xs text-foreground/90 mt-1 leading-relaxed">{advice.summary}</p>
                {(sessionComplete || windowTimedOut) && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Resetting the desk for a fresh Analyse…
                  </p>
                )}
                {quality && (
                  <p className="text-[11px] text-muted-foreground mt-2 font-mono">
                    Confidence {quality.finalScore.toFixed(0)}%
                    {ai ? ` · AI ${ai.confidence.toFixed(0)}%` : ''}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Timed session strip */}
        {tradeIntent && (
          <div className="bg-muted/40 rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Trade window
              </span>
              <span className="text-[11px] font-mono font-bold">
                {windowActive
                  ? `${formatRemaining(remainingMs)} left`
                  : sessionComplete || windowTimedOut || isSettled
                    ? 'Ended'
                    : `${tradeIntent.windowMinutes}m`}
              </span>
            </div>
            {windowActive && (
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden border border-border">
                <div
                  className="h-full bg-foreground/70 transition-all duration-1000"
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(
                        100,
                        ((tradeIntent.windowMinutes * 60_000 - remainingMs) /
                          (tradeIntent.windowMinutes * 60_000)) *
                          100
                      )
                    )}%`,
                  }}
                />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Intended size:{' '}
              <span className="font-mono font-semibold text-foreground">
                {tradeIntent.sizeUnit === 'PERCENT'
                  ? `${tradeIntent.sizeAmount}% of account`
                  : `${tradeIntent.sizeAmount} ${currency || 'quote'}`}
              </span>
            </p>
          </div>
        )}

        {/* Live tracking strip: how the market has moved since the signal. */}
        {live && ai && ai.signal !== 'HOLD' && (
          <div className="bg-muted/40 rounded-xl border border-border p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Radio className="h-3 w-3" />
                Since this signal
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {formatAge(live.ageMs)} old · updated {formatAge(Date.now() - live.evaluatedAt)} ago
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
              <div className="bg-background/60 rounded-md p-2 border border-border">
                <span className="text-muted-foreground block text-[10px]">Price now</span>
                <span className="font-bold">{fmtPrice(live.currentPrice)}</span>
              </div>
              <div className="bg-background/60 rounded-md p-2 border border-border">
                <span className="text-muted-foreground block text-[10px]">Vs entry</span>
                <span
                  className={`font-bold ${
                    live.movePercent >= 0 ? 'text-emerald-500' : 'text-rose-500'
                  }`}
                >
                  {live.movePercent >= 0 ? '+' : ''}
                  {live.movePercent.toFixed(2)}%
                </span>
              </div>
              <div className="bg-background/60 rounded-md p-2 border border-border">
                <span className="text-muted-foreground block text-[10px]">To target</span>
                <span className="font-bold">
                  {live.progressPercent === null ? '—' : `${live.progressPercent.toFixed(0)}%`}
                </span>
              </div>
            </div>

            {/* Progress from stop (left) through entry to target (right). */}
            {live.progressPercent !== null && (
              <div className="space-y-1">
                <div className="relative w-full bg-muted rounded-full h-2 overflow-hidden border border-border">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      live.progressPercent >= 0 ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.abs(live.progressPercent))}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
                  <span>Stop {fmtPrice(ai.stopLoss)}</span>
                  <span>Entry {fmtPrice(ai.entry)}</span>
                  <span>Target {fmtPrice(ai.takeProfit)}</span>
                </div>
              </div>
            )}

            {/* Lifecycle note, shown whenever the plan is no longer current. */}
            {lifecycle && lifecycle !== 'VALID' && lifecycle !== 'HOLD' && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-500 pt-1 border-t border-border">
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                <span>{live.statusNote}</span>
              </div>
            )}
          </div>
        )}

        {!aiAvailable && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-500">AI analysis unavailable</p>
              <p className="text-xs text-muted-foreground mt-1">
                This server has no AI service configured, so signals cannot be generated. Technical
                indicators below are still calculated from live market data.
              </p>
            </div>
          </div>
        )}

        {analysisError && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-rose-500">Analysis error</p>
              <p className="text-xs text-muted-foreground mt-1">{analysisError}</p>
            </div>
          </div>
        )}

        {signal && ai && quality && advice ? (
          <div className="space-y-4">
            {/* Combined quality with the user's threshold marked. */}
            <div className="bg-muted/40 p-3.5 rounded-xl border border-border space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                  Signal quality
                </span>
                <span
                  className={`font-bold font-mono text-lg ${
                    quality.finalScore >= settings.minSignalQuality ? 'text-emerald-500' : 'text-rose-500'
                  }`}
                >
                  {quality.finalScore.toFixed(0)}%
                </span>
              </div>

              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden border border-border relative">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    quality.finalScore >= settings.minSignalQuality ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, quality.finalScore)}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-foreground/60"
                  style={{ left: `${settings.minSignalQuality}%` }}
                  title={`Your minimum: ${settings.minSignalQuality}%`}
                />
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                <div className="bg-background/60 rounded-md p-2 border border-border">
                  <span className="text-muted-foreground block text-[10px]">Technical</span>
                  <span className="font-bold">{quality.technicalScore.toFixed(0)}</span>
                </div>
                <div className="bg-background/60 rounded-md p-2 border border-border">
                  <span className="text-muted-foreground block text-[10px]">AI confidence</span>
                  <span className="font-bold">{quality.aiConfidence.toFixed(0)}</span>
                </div>
                <div className="bg-background/60 rounded-md p-2 border border-border">
                  <span className="text-muted-foreground block text-[10px]">Your minimum</span>
                  <span className="font-bold">{settings.minSignalQuality}</span>
                </div>
              </div>
            </div>

            {/* Levels */}
            {!isHold && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
                <div className="bg-muted/40 p-3 rounded-lg border border-border">
                  <span className="text-muted-foreground text-[10px] uppercase block mb-1">Entry</span>
                  <span className="font-bold text-sm">{fmtPrice(ai.entry)}</span>
                </div>
                <div className="bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
                  <span className="text-rose-500 text-[10px] uppercase block mb-1">Stop loss</span>
                  <span className="text-rose-500 font-bold text-sm">{fmtPrice(ai.stopLoss)}</span>
                  <span className="text-[10px] text-muted-foreground block">
                    −{advice.sizing.stopDistancePercent.toFixed(2)}%
                  </span>
                </div>
                <div className="bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                  <span className="text-emerald-500 text-[10px] uppercase block mb-1">Take profit</span>
                  <span className="text-emerald-500 font-bold text-sm">{fmtPrice(ai.takeProfit)}</span>
                  <span className="text-[10px] text-muted-foreground block">
                    +{advice.sizing.targetDistancePercent.toFixed(2)}%
                  </span>
                </div>
                <div className="bg-muted/40 p-3 rounded-lg border border-border">
                  <span className="text-muted-foreground text-[10px] uppercase block mb-1">
                    R:R · duration
                  </span>
                  <span
                    className={`font-bold text-sm ${
                      advice.sizing.riskReward >= settings.minRiskReward
                        ? 'text-emerald-500'
                        : 'text-rose-500'
                    }`}
                  >
                    1:{advice.sizing.riskReward.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-muted-foreground block">
                    ~{ai.durationMinutes}m
                  </span>
                </div>
              </div>
            )}

            {/* Position sizing, in percentage terms since we know no balance. */}
            {!isHold && advice.sizing.positionPercentOfAccount !== null && (
              <div className="bg-muted/60 border border-border p-3 rounded-xl">
                <p className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  How much to risk
                </p>
                <p className="text-[11px] text-foreground/90 leading-relaxed">{advice.sizing.note}</p>
              </div>
            )}

            {/* Every check, pass or fail — this is the teaching part. */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Why this verdict
              </p>
              <div className="space-y-1.5">
                {advice.checks.map((check) => (
                  <div
                    key={check.code}
                    className={`flex items-start gap-2 text-xs p-2 rounded-md border ${
                      check.passed
                        ? 'bg-muted/40 border-border/80'
                        : check.severity === 'CRITICAL'
                          ? 'bg-rose-500/10 border-rose-500/30'
                          : 'bg-amber-500/10 border-amber-500/30'
                    }`}
                  >
                    {check.passed ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <X
                        className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${
                          check.severity === 'CRITICAL' ? 'text-rose-500' : 'text-amber-500'
                        }`}
                      />
                    )}
                    <div className="min-w-0">
                      <span className="font-semibold">{check.label}</span>
                      {!check.passed && check.severity === 'CRITICAL' && (
                        <Badge variant="sell" className="ml-1.5 text-[9px] py-0 px-1">
                          CRITICAL
                        </Badge>
                      )}
                      <p className="text-muted-foreground mt-0.5 leading-relaxed">{check.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI reasoning */}
            <div className="bg-muted/40 p-4 rounded-xl border border-border text-xs leading-relaxed">
              <p className="font-semibold mb-1 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                What the AI sees
              </p>
              <p className="text-muted-foreground">{ai.reason}</p>
            </div>

            {advice.warnings.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-amber-500 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Things to be aware of
                </p>
                {advice.warnings.map((w, i) => (
                  <p key={i} className="text-[11px] text-foreground/90 flex items-start gap-1.5">
                    <span className="text-amber-500 mt-0.5">•</span>
                    <span>{w}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : (
          !analysisError && (
            <div className="bg-muted/30 p-8 rounded-xl border border-dashed border-border text-center space-y-2">
              <BarChart2 className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-semibold">No signal yet</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Choose a market and press <strong>Analyse</strong>. Pick a trade window and size,
                then get a live TRADE / WAIT / DON&apos;T TRADE verdict for that duration.
              </p>
            </div>
          )
        )}

        {/* Actions */}
        <div className="pt-2 border-t border-border space-y-3">
          {plan && (
            <div
              className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5 space-y-2"
              aria-live="polite"
              aria-atomic="true"
            >
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-medium text-foreground">
                  {plan.name} plan · {plan.aiModelLabel}
                </span>
                <span
                  key={`${plan.analysesUsedToday}-${plan.maxAnalysesPerDay}`}
                  className={`font-mono font-bold tabular-nums transition-colors ${
                    analysisBlocked ? 'text-amber-500' : 'text-foreground'
                  }`}
                >
                  {plan.analysesUsedToday}/{plan.maxAnalysesPerDay} used today
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    analysisBlocked ? 'bg-amber-500' : 'bg-foreground/70'
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      (plan.analysesUsedToday / Math.max(1, plan.maxAnalysesPerDay)) * 100
                    )}%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {isAnalyzing
                  ? 'Counting this Analyse against today’s limit…'
                  : analysisBlocked
                    ? 'Daily Analyse limit reached — resets tomorrow.'
                    : `${Math.max(0, plan.maxAnalysesPerDay - plan.analysesUsedToday)} Analyse${
                        plan.maxAnalysesPerDay - plan.analysesUsedToday === 1 ? '' : 's'
                      } left today`}
              </p>
            </div>
          )}
          {analysisBlocked && !isAnalyzing && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-[11px] text-foreground/90">
              Daily Analyse limit reached on your {plan?.name ?? 'Free'} plan. Pro and Max are coming
              soon for higher caps and stronger models.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              size="lg"
              onClick={onAnalyze}
              disabled={isAnalyzing || !instrument || !aiAvailable || analysisBlocked}
              className="w-full font-bold gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Activity className={`h-4 w-4 shrink-0 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span className="truncate">
                {isAnalyzing
                  ? 'Analysing…'
                  : analysisBlocked
                    ? 'LIMIT REACHED'
                    : sessionComplete || windowTimedOut
                      ? 'NEW ANALYSE'
                      : signal
                        ? 'ANALYSE AGAIN'
                        : 'ANALYSE MARKET'}
              </span>
            </Button>

            <Button
              size="lg"
              variant="outline"
              onClick={onTrack}
              // A settled signal cannot be followed: the outcome already happened.
              disabled={!signal || isHold || signal.tracked || isTracking || isSettled}
              className="w-full font-bold gap-2 border-border disabled:opacity-50"
            >
              {signal?.tracked ? (
                <>
                  <BookmarkCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="truncate">FOLLOWING</span>
                </>
              ) : (
                <>
                  <Bookmark className="h-4 w-4 shrink-0" />
                  <span className="truncate">FOLLOW SIGNAL</span>
                </>
              )}
            </Button>
          </div>

          {isHold && signal && (
            <p className="text-[11px] text-amber-500 text-center font-medium flex items-center justify-center gap-1.5">
              <Minus className="h-3 w-3" />
              Nothing to follow — the recommendation is to wait.
            </p>
          )}

          {isSettled && (
            <p className="text-[11px] text-rose-500 text-center font-medium flex items-center justify-center gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              This signal has run its course. Analyse again for a current view.
            </p>
          )}

          <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
            Following a signal records it so you can review the outcome later. Trading carries risk
            of loss.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
