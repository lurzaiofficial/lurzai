import React, { useState } from 'react';
import { Activity, ChevronDown, ChevronUp, Info, RefreshCw, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import type { SignalRecord } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

interface SignalHistoryProps {
  signals: SignalRecord[];
  onEvaluate: () => void;
  isEvaluating: boolean;
}

/** Outcome badge. PENDING is shown honestly rather than assumed correct. */
function OutcomeBadge({ outcome }: { outcome?: string }) {
  if (!outcome || outcome === 'PENDING') {
    return (
      <Badge variant="outline" className="text-[10px] border-border text-muted-foreground gap-1">
        <MinusCircle className="h-3 w-3" />
        PENDING
      </Badge>
    );
  }
  if (outcome === 'CORRECT') {
    return (
      <Badge variant="buy" className="text-[10px] gap-1">
        <CheckCircle2 className="h-3 w-3" />
        CORRECT
      </Badge>
    );
  }
  if (outcome === 'INCORRECT') {
    return (
      <Badge variant="sell" className="text-[10px] gap-1">
        <XCircle className="h-3 w-3" />
        INCORRECT
      </Badge>
    );
  }
  return (
    <Badge variant="hold" className="text-[10px] gap-1">
      <MinusCircle className="h-3 w-3" />
      NEUTRAL
    </Badge>
  );
}

export const SignalHistory: React.FC<SignalHistoryProps> = ({
  signals,
  onEvaluate,
  isEvaluating,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Card className="border-border bg-card text-card-foreground shadow-sm">
      <CardHeader className="p-4 pb-3 border-b border-border flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-foreground" />
          <CardTitle className="text-base font-bold">Signal Archive</CardTitle>
          <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
            {signals.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEvaluate}
          disabled={isEvaluating}
          className="h-7 gap-1.5 text-xs text-muted-foreground"
          title="Check past signals against subsequent price action"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isEvaluating ? 'animate-spin' : ''}`} />
          Evaluate
        </Button>
      </CardHeader>

      <CardContent className="p-4 space-y-3 max-h-[560px] overflow-y-auto overscroll-contain scrollbar-subtle">
        {signals.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-xs">
            No signals recorded yet.
          </div>
        ) : (
          signals.map((sig) => {
            const isExpanded = expandedId === sig.id;
            const ai = sig.ai;

            return (
              <div
                key={sig.id}
                className="bg-muted/40 rounded-xl border border-border overflow-hidden"
              >
                <div
                  onClick={() => setExpandedId(isExpanded ? null : sig.id)}
                  className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-muted/70 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge
                      variant={ai.signal === 'BUY' ? 'buy' : ai.signal === 'SELL' ? 'sell' : 'hold'}
                      className="font-bold text-xs shrink-0"
                    >
                      {ai.signal}
                    </Badge>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm truncate">{sig.displaySymbol}</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          ({sig.timeframe})
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[9px] py-0 px-1 border-border text-muted-foreground"
                        >
                          {sig.assetClass}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {sig.priceAtSignal.toLocaleString()} · {sig.advice.verdict} · Quality{' '}
                        {sig.quality.finalScore.toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <OutcomeBadge outcome={sig.outcome} />
                    <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
                      {new Date(sig.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-3.5 pt-0 border-t border-border bg-card/50 space-y-3 text-xs">
                    {ai.signal !== 'HOLD' && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono mt-2">
                        <div className="bg-muted/60 p-2 rounded border border-border">
                          <span className="text-muted-foreground text-[10px] block">Entry</span>
                          <span className="font-bold">{ai.entry.toLocaleString()}</span>
                        </div>
                        <div className="bg-rose-500/10 p-2 rounded border border-rose-500/20">
                          <span className="text-rose-500 text-[10px] block">Stop Loss</span>
                          <span className="text-rose-500 font-bold">{ai.stopLoss.toLocaleString()}</span>
                        </div>
                        <div className="bg-emerald-500/10 p-2 rounded border border-emerald-500/20">
                          <span className="text-emerald-500 text-[10px] block">Take Profit</span>
                          <span className="text-emerald-500 font-bold">
                            {ai.takeProfit.toLocaleString()}
                          </span>
                        </div>
                        <div className="bg-muted/60 p-2 rounded border border-border">
                          <span className="text-muted-foreground text-[10px] block">R:R</span>
                          <span className="font-bold">1:{ai.riskReward.toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    <div className="bg-muted/40 p-3 rounded-lg border border-border">
                      <p className="font-semibold mb-1 flex items-center gap-1">
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        AI Reasoning
                      </p>
                      <p className="text-muted-foreground">{ai.reason}</p>
                    </div>

                    {sig.outcomeNote && (
                      <div className="bg-muted/40 p-3 rounded-lg border border-border">
                        <p className="font-semibold mb-1">Evaluation</p>
                        <p className="text-muted-foreground">{sig.outcomeNote}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};
