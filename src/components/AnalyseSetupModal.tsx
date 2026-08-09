/**
 * Prompt shown before Analyse runs.
 *
 * Collects the advisory trade window and intended size. Nothing here is
 * executed — LURZ only uses these values to scope the live verdict session.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Clock, Info, Wallet } from 'lucide-react';
import type { Instrument, Timeframe, TradeSizeUnit } from '../types';
import {
  ANALYSIS_WINDOW_PRESETS,
  type AnalysisWindowId,
  resolveWindowMinutes,
} from '../../shared/analysis/tradeWindow';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';

export interface AnalyseSetupValues {
  windowId: AnalysisWindowId;
  windowMinutes: number;
  timeframe: Timeframe;
  sizeAmount: number;
  sizeUnit: TradeSizeUnit;
}

interface AnalyseSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  instrument: Instrument | null;
  /** Chart timeframe currently selected — used as a smart default when possible. */
  chartTimeframe: Timeframe;
  onConfirm: (values: AnalyseSetupValues) => void;
}

function defaultWindowId(chartTimeframe: Timeframe): AnalysisWindowId {
  if (chartTimeframe === '15m' || chartTimeframe === '5m' || chartTimeframe === '1m') return '15m';
  if (chartTimeframe === '4h' || chartTimeframe === '1d') return '4h';
  return '1h';
}

export const AnalyseSetupModal: React.FC<AnalyseSetupModalProps> = ({
  isOpen,
  onClose,
  instrument,
  chartTimeframe,
  onConfirm,
}) => {
  const [windowId, setWindowId] = useState<AnalysisWindowId>(() => defaultWindowId(chartTimeframe));
  const [sizeAmount, setSizeAmount] = useState('100');
  const [sizeUnit, setSizeUnit] = useState<TradeSizeUnit>('QUOTE');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setWindowId(defaultWindowId(chartTimeframe));
    setError(null);
  }, [isOpen, chartTimeframe]);

  const resolvedMinutes = useMemo(() => resolveWindowMinutes(windowId), [windowId]);
  const preset = ANALYSIS_WINDOW_PRESETS.find((p) => p.id === windowId)!;

  const handleConfirm = () => {
    const amount = Number(sizeAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a positive amount you intend to trade elsewhere.');
      return;
    }
    if (sizeUnit === 'PERCENT' && amount > 100) {
      setError('Percent of account cannot exceed 100.');
      return;
    }

    onConfirm({
      windowId,
      windowMinutes: resolvedMinutes,
      timeframe: preset.timeframe,
      sizeAmount: amount,
      sizeUnit,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-card border-border text-card-foreground p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Analyse setup
          </DialogTitle>
          <DialogDescription>
            Choose how long to watch this idea and how much you intend to trade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <span className="text-sm font-semibold font-mono truncate block">
            {instrument?.displaySymbol ?? '—'}
          </span>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Trade window
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ANALYSIS_WINDOW_PRESETS.map((p) => {
                const active = windowId === p.id;
                const mins = p.minutes ?? resolvedMinutes;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setWindowId(p.id)}
                    className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                      active
                        ? 'border-foreground bg-muted'
                        : 'border-border bg-background hover:bg-muted/50'
                    }`}
                  >
                    <span className="text-sm font-bold block">{p.label}</span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">
                      {p.hint}
                      {p.id === 'session' ? ` · ~${mins}m` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug flex items-start gap-1.5">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              Live verdict updates for this window, then stops. Chart timeframe will
              align to {preset.timeframe} for the analysis.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" />
              Intended size
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                step="any"
                value={sizeAmount}
                onChange={(e) => {
                  setSizeAmount(e.target.value);
                  setError(null);
                }}
                className="font-mono bg-background border-border flex-1"
                placeholder="Amount"
              />
              <div className="flex rounded-md border border-border overflow-hidden shrink-0">
                <button
                  type="button"
                  onClick={() => setSizeUnit('QUOTE')}
                  className={`px-3 text-xs font-semibold ${
                    sizeUnit === 'QUOTE' ? 'bg-muted text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {instrument?.currency || 'Quote'}
                </button>
                <button
                  type="button"
                  onClick={() => setSizeUnit('PERCENT')}
                  className={`px-3 text-xs font-semibold border-l border-border ${
                    sizeUnit === 'PERCENT' ? 'bg-muted text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  % acct
                </button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">
              Used for risk context in the advice. You still place any trade yourself
              on your own exchange or broker.
            </p>
          </div>

          {error && (
            <p className="text-xs text-rose-500 font-medium">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="border-border">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!instrument}
            className="font-bold gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Activity className="h-4 w-4" />
            Analyse now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
