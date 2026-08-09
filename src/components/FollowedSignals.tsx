import React from 'react';
import { Bookmark, RefreshCw, Target, X, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import type { TrackedSignalView } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

interface FollowedSignalsProps {
  tracked: TrackedSignalView[];
  onClose: (id: string) => void;
  onRefresh: () => void;
  busyId: string | null;
  isRefreshing: boolean;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

const STATUS_BADGE: Record<
  TrackedSignalView['status'],
  { label: string; variant: 'buy' | 'sell' | 'hold' | 'outline'; Icon: typeof CheckCircle2 }
> = {
  ACTIVE: { label: 'RUNNING', variant: 'outline', Icon: Target },
  HIT_TARGET: { label: 'TARGET HIT', variant: 'buy', Icon: CheckCircle2 },
  HIT_STOP: { label: 'STOPPED OUT', variant: 'sell', Icon: XCircle },
  CLOSED_MANUALLY: { label: 'CLOSED', variant: 'hold', Icon: MinusCircle },
  EXPIRED: { label: 'EXPIRED', variant: 'hold', Icon: MinusCircle },
};

/**
 * Signals the user chose to follow.
 *
 * These are journal entries, not positions — the application never opened
 * anything. Results are shown as percentages because we do not know how much
 * the user actually risked.
 */
export const FollowedSignals: React.FC<FollowedSignalsProps> = ({
  tracked,
  onClose,
  onRefresh,
  busyId,
  isRefreshing,
}) => {
  const active = tracked.filter((t) => t.status === 'ACTIVE');
  const resolved = tracked.filter((t) => t.status !== 'ACTIVE');

  return (
    <Card className="border-border bg-card text-card-foreground shadow-sm">
      <CardHeader className="p-4 pb-3 border-b border-border flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-foreground" />
          <CardTitle className="text-base font-bold">Followed Signals</CardTitle>
          <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
            {active.length} running · {resolved.length} finished
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="h-7 gap-1.5 text-xs text-muted-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {tracked.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-xs">
            You are not following any signals yet. Use <strong>Follow signal</strong> after an
            analysis to track how it turns out.
          </div>
        ) : (
          // Table provides its own horizontal scroll container.
          <div>
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Market</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>SL / TP</TableHead>
                  <TableHead>Quality</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tracked.map((t) => {
                  const pct = t.status === 'ACTIVE' ? t.unrealizedPercent : t.resultPercent ?? null;
                  const up = (pct ?? 0) >= 0;
                  const status = STATUS_BADGE[t.status];
                  const busy = busyId === t.id;

                  return (
                    <TableRow key={t.id} className="border-border/60 font-mono text-xs">
                      <TableCell>
                        <span className="font-bold block">{t.displaySymbol}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {t.provider} · {t.timeframe}
                        </span>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={t.direction === 'LONG' ? 'buy' : 'sell'}
                          className="text-[10px] py-0"
                        >
                          {t.direction}
                        </Badge>
                      </TableCell>

                      <TableCell>{t.entryPrice.toLocaleString()}</TableCell>

                      <TableCell>
                        {/* Unknown prices are stated, never substituted. */}
                        {t.currentPrice === null ? (
                          <span className="text-muted-foreground italic">unavailable</span>
                        ) : (
                          t.currentPrice.toLocaleString()
                        )}
                      </TableCell>

                      <TableCell>
                        {pct === null ? (
                          <span className="text-muted-foreground italic">—</span>
                        ) : (
                          <span className={`font-bold ${up ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {up ? '+' : ''}
                            {pct.toFixed(2)}%
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="w-24">
                        {t.progressPercent === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden border border-border">
                              <div
                                className={`h-full rounded-full ${
                                  t.progressPercent >= 0 ? 'bg-emerald-500' : 'bg-rose-500'
                                }`}
                                style={{
                                  width: `${Math.min(100, Math.abs(t.progressPercent))}%`,
                                }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground w-8 text-right">
                              {t.progressPercent.toFixed(0)}%
                            </span>
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="text-[11px]">
                        <span className="text-rose-500">{t.stopLoss.toLocaleString()}</span>
                        {' / '}
                        <span className="text-emerald-500">{t.takeProfit.toLocaleString()}</span>
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {t.finalScore.toFixed(0)}%
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {formatDuration(t.durationMs)}
                      </TableCell>

                      <TableCell>
                        <Badge variant={status.variant} className="text-[10px] py-0 gap-1">
                          <status.Icon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        {t.status === 'ACTIVE' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onClose(t.id)}
                            disabled={busy}
                            className="h-6 text-[11px] px-2 border-border hover:bg-rose-500/10 hover:text-rose-500"
                          >
                            <X className="h-3 w-3 mr-0.5" />
                            Stop tracking
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
