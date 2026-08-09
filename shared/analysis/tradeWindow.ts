/**
 * Trade-window presets for timed advisory sessions.
 *
 * Windows align with existing Timeframe values where possible so chart data
 * and the AI horizon stay coherent. "session" means the remainder of the
 * local calendar day (capped), not an exchange session calendar.
 */

import type { Timeframe, TradeAction, TradeSizeUnit, VerdictLevel, SignalType } from '../types';

/** Minimum advisory trade window (minutes). Custom timers cannot go below this. */
export const MIN_WINDOW_MINUTES = 1;
/** Maximum advisory trade window (minutes) — 24 hours. */
export const MAX_WINDOW_MINUTES = 24 * 60;

export type AnalysisWindowId = '15m' | '1h' | '4h' | 'session' | 'custom';

export interface AnalysisWindowPreset {
  id: AnalysisWindowId;
  label: string;
  /** Fixed minutes, or null when computed / entered at confirm time. */
  minutes: number | null;
  /** Chart/analysis timeframe that best matches this window (null for custom). */
  timeframe: Timeframe | null;
  hint: string;
}

export const ANALYSIS_WINDOW_PRESETS: AnalysisWindowPreset[] = [
  {
    id: '15m',
    label: '15 minutes',
    minutes: 15,
    timeframe: '15m',
    hint: 'Short scalp / quick move',
  },
  {
    id: '1h',
    label: '1 hour',
    minutes: 60,
    timeframe: '1h',
    hint: 'Intraday swing',
  },
  {
    id: '4h',
    label: '4 hours',
    minutes: 240,
    timeframe: '4h',
    hint: 'Larger intraday move',
  },
  {
    id: 'session',
    label: 'Rest of session',
    minutes: null,
    timeframe: '1h',
    hint: 'Until end of your local day',
  },
  {
    id: 'custom',
    label: 'Custom',
    minutes: null,
    timeframe: null,
    hint: 'Set your own timer (min 1m)',
  },
];

/** Pick a chart timeframe that fits a custom window length. */
export function timeframeForWindowMinutes(minutes: number): Timeframe {
  if (minutes <= 5) return '1m';
  if (minutes <= 15) return '5m';
  if (minutes <= 60) return '15m';
  if (minutes <= 240) return '1h';
  return '4h';
}

/** Minutes remaining until local midnight, clamped to a useful advisory range. */
export function restOfSessionMinutes(now = Date.now()): number {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const raw = Math.round((end.getTime() - now) / 60_000);
  // At least 30m so a late-night click still gets a usable window; cap at 12h.
  return Math.max(30, Math.min(12 * 60, raw));
}

export function clampWindowMinutes(minutes: number): number {
  const rounded = Math.round(minutes);
  if (!Number.isFinite(rounded)) return MIN_WINDOW_MINUTES;
  return Math.max(MIN_WINDOW_MINUTES, Math.min(MAX_WINDOW_MINUTES, rounded));
}

export function resolveWindowMinutes(
  id: AnalysisWindowId,
  now = Date.now(),
  customMinutes?: number
): number {
  if (id === 'custom') {
    return clampWindowMinutes(customMinutes ?? 5);
  }
  const preset = ANALYSIS_WINDOW_PRESETS.find((p) => p.id === id);
  if (!preset) return 60;
  if (preset.minutes !== null) return preset.minutes;
  return restOfSessionMinutes(now);
}

export function windowPresetForMinutes(minutes: number): AnalysisWindowPreset | undefined {
  return ANALYSIS_WINDOW_PRESETS.find((p) => p.minutes === minutes);
}

/** Allowed intentional size units for the Analyse prompt. */
export const TRADE_SIZE_UNITS: { value: TradeSizeUnit; label: string }[] = [
  { value: 'QUOTE', label: 'Quote currency' },
  { value: 'PERCENT', label: '% of account' },
];

/**
 * Maps advisory verdict + AI direction into a single action word for the UI.
 * TAKE → TRADE, HOLD/avoid-wait → WAIT, hard avoid → DON'T TRADE.
 */
export function tradeActionFromVerdict(
  verdict: VerdictLevel,
  signal: SignalType
): TradeAction {
  if (signal === 'HOLD') return 'WAIT';
  if (verdict === 'TAKE') return 'TRADE';
  if (verdict === 'CAUTION') return 'WAIT';
  return 'DONT_TRADE';
}

export function tradeActionLabel(action: TradeAction): string {
  switch (action) {
    case 'TRADE':
      return 'TRADE';
    case 'WAIT':
      return 'WAIT';
    case 'DONT_TRADE':
      return "DON'T TRADE";
  }
}
