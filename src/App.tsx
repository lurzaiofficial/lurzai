/**
 * TradePilot AI — application shell.
 *
 * A SIGNAL ADVISOR: it analyses markets across crypto, stocks, forex and
 * commodities and tells the user whether a setup is worth taking. It never
 * places orders and never connects to an exchange account.
 *
 * Data flow:
 *   Provider REST (via server) -> instruments, candles, quotes
 *   Provider WebSocket / polling -> live price updates
 *   Server -> indicators, AI interpretation, advisory verdict, history
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Header } from './components/Header';
import { MarketOverview } from './components/MarketOverview';
import { TradingChart } from './components/TradingChart';
import { SignalCard, type AnalysisProgressStage } from './components/SignalCard';
import { QuantitativeScoreCard } from './components/QuantitativeScoreCard';
import { FollowedSignals } from './components/FollowedSignals';
import { SignalHistory } from './components/SignalHistory';
import { SignalStatsPanel } from './components/SignalStatsPanel';
import { SettingsModal } from './components/SettingsModal';
import { AnalyseSetupModal, type AnalyseSetupValues } from './components/AnalyseSetupModal';
import { ChatPanel } from './components/ChatPanel';
import { SidebarProvider, SidebarInset } from './components/ui/sidebar';
import { AppSidebar } from './components/AppSidebar';

import { MarketStream } from './services/market/stream';
import {
  ApiError,
  analysisApi,
  marketApi,
  planApi,
  searchApi,
  settingsApi,
  signalsApi,
  statsApi,
  statusApi,
  trackingApi,
  type StatsResponse,
  type UserPlanView,
} from './services/api';
import { planLimitReachedMessage } from './components/PlanBadge';

import {
  DEFAULT_SERVER_SETTINGS,
  type Candlestick,
  type ConnectionState,
  type ConnectionStatus,
  type Instrument,
  type LiveSignalState,
  type MarketAnalysis,
  type Quote,
  type ServerSettings,
  type SignalRecord,
  type Timeframe,
  type TrackedSignalView,
} from './types';

import { analyzeMarket } from '../shared/analysis/indicators';
import { tradeActionFromVerdict, tradeActionLabel } from '../shared/analysis/tradeWindow';

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

export default function App() {
  // ------------------------------------------------------------------ theme
  // Light-first to match the marketing landing page tokens/typography.
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.title = 'LURZ AI - Crypto Trading Assistant';
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  // -------------------------------------------------------------- selection
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [favourites, setFavourites] = useState<Instrument[]>([]);

  // ------------------------------------------------------------ market data
  const [quote, setQuote] = useState<Quote | null>(null);
  const [candles, setCandles] = useState<Candlestick[]>([]);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [isMarketLoading, setIsMarketLoading] = useState(false);

  // ------------------------------------------------------------ connections
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [streamState, setStreamState] = useState<ConnectionState>('DISCONNECTED');
  const [streamDetail, setStreamDetail] = useState('Not connected');
  const [isDataStale, setIsDataStale] = useState(false);
  const streamRef = useRef<MarketStream | null>(null);

  // -------------------------------------------------------------- app state
  const [settings, setSettings] = useState<ServerSettings>(DEFAULT_SERVER_SETTINGS);
  const [signal, setSignal] = useState<SignalRecord | null>(null);
  /** Continuously refreshed evaluation of the on-screen signal. */
  const [liveSignal, setLiveSignal] = useState<LiveSignalState | null>(null);
  const [signals, setSignals] = useState<SignalRecord[]>([]);
  const [tracked, setTracked] = useState<TrackedSignalView[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [plan, setPlan] = useState<UserPlanView | null>(null);

  // ------------------------------------------------------------------ flags
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<AnalysisProgressStage>('idle');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isRefreshingTracked, setIsRefreshingTracked] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [busyTrackedId, setBusyTrackedId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAnalyseSetupOpen, setIsAnalyseSetupOpen] = useState(false);

  /**
   * Analysis is recomputed locally from the live candle array so the chart and
   * the indicator panel stay in step with streaming updates. The same shared
   * engine runs on the server for the AI prompt and the verdict.
   */
  const analysis: MarketAnalysis | null = useMemo(() => {
    if (!instrument || candles.length === 0) return null;
    return analyzeMarket(candles, instrument.id, instrument.displaySymbol, timeframe);
  }, [candles, instrument, timeframe]);

  const aiAvailable = connection?.ai === 'CONNECTED';
  const isFavourite = Boolean(instrument && favourites.some((f) => f.id === instrument.id));

  // -------------------------------------------------------------- bootstrap

  const refreshStatus = useCallback(async () => {
    try {
      setConnection(await statusApi.get());
    } catch {
      setConnection({
        marketData: 'ERROR',
        ai: 'DISCONNECTED',
        providers: [],
        details: { marketData: 'Cannot reach the LURZ server' },
      });
    }
  }, []);

  const applyPlan = useCallback((next: UserPlanView, opts?: { preferHigherUsage?: boolean }) => {
    setPlan((prev) => {
      if (!prev || !opts?.preferHigherUsage) return next;
      // Ignore stale polls that would roll usage backwards right after Analyse.
      return {
        ...next,
        analysesUsedToday: Math.max(prev.analysesUsedToday, next.analysesUsedToday),
        chatUsedToday: Math.max(prev.chatUsedToday, next.chatUsedToday),
      };
    });
    setStats((prev) => {
      if (!prev) return prev;
      const merged =
        prev.plan && opts?.preferHigherUsage
          ? {
              ...next,
              analysesUsedToday: Math.max(
                prev.plan.analysesUsedToday,
                next.analysesUsedToday
              ),
              chatUsedToday: Math.max(prev.plan.chatUsedToday, next.chatUsedToday),
            }
          : next;
      return {
        ...prev,
        signalsToday: merged.analysesUsedToday,
        maxSignalsPerDay: merged.maxAnalysesPerDay,
        plan: merged,
      };
    });
  }, []);

  const bumpPlanUsage = useCallback((kind: 'analyses' | 'chat', by = 1) => {
    setPlan((prev) => {
      if (!prev) return prev;
      return kind === 'analyses'
        ? {
            ...prev,
            analysesUsedToday: Math.min(
              prev.maxAnalysesPerDay,
              prev.analysesUsedToday + by
            ),
          }
        : {
            ...prev,
            chatUsedToday: Math.min(
              prev.maxChatMessagesPerDay,
              prev.chatUsedToday + by
            ),
          };
    });
    setStats((statsPrev) => {
      if (!statsPrev?.plan) return statsPrev;
      const prevPlan = statsPrev.plan;
      const nextPlan =
        kind === 'analyses'
          ? {
              ...prevPlan,
              analysesUsedToday: Math.min(
                prevPlan.maxAnalysesPerDay,
                prevPlan.analysesUsedToday + by
              ),
            }
          : {
              ...prevPlan,
              chatUsedToday: Math.min(
                prevPlan.maxChatMessagesPerDay,
                prevPlan.chatUsedToday + by
              ),
            };
      return {
        ...statsPrev,
        signalsToday: nextPlan.analysesUsedToday,
        maxSignalsPerDay: nextPlan.maxAnalysesPerDay,
        plan: nextPlan,
      };
    });
  }, []);

  const refreshPlan = useCallback(
    async (opts?: { preferHigherUsage?: boolean }) => {
      try {
        applyPlan(await planApi.get(), {
          preferHigherUsage: opts?.preferHigherUsage ?? true,
        });
      } catch {
        // Non-blocking — limits still enforced server-side.
      }
    },
    [applyPlan]
  );

  const refreshHistory = useCallback(async () => {
    try {
      const [t, s, st] = await Promise.all([
        trackingApi.list(),
        signalsApi.list(50),
        statsApi.get(),
      ]);
      setTracked(t);
      setSignals(s);
      if (st.plan) {
        applyPlan(st.plan, { preferHigherUsage: true });
      } else {
        setStats(st);
      }
    } catch (err) {
      toast.error(`Could not load your history: ${errorMessage(err)}`);
    }
  }, [applyPlan]);

  /** Loads settings, then resolves the saved favourites into full instruments. */
  const bootstrap = useCallback(async () => {
    let loaded = DEFAULT_SERVER_SETTINGS;
    try {
      loaded = await settingsApi.get();
      setSettings(loaded);
      setTimeframe(loaded.defaultTimeframe);
    } catch (err) {
      toast.error(`Could not load settings: ${errorMessage(err)}`);
    }

    // Resolve each favourite; skip any that no longer exist rather than failing.
    const resolved: Instrument[] = [];
    for (const id of loaded.favourites) {
      try {
        resolved.push(await searchApi.getInstrument(id));
      } catch {
        /* market delisted or source unavailable */
      }
    }
    setFavourites(resolved);
    if (resolved.length > 0) setInstrument(resolved[0]);
  }, []);

  useEffect(() => {
    void bootstrap();
    void refreshStatus();
    void refreshHistory();
    void refreshPlan();
  }, [bootstrap, refreshStatus, refreshHistory, refreshPlan]);

  // Periodic re-checks so a dropped source surfaces on its own.
  useEffect(() => {
    const timer = setInterval(() => void refreshStatus(), 60_000);
    return () => clearInterval(timer);
  }, [refreshStatus]);

  // Keep desk data fresh without manual refresh: follows, history, plan usage.
  useEffect(() => {
    const timer = setInterval(() => {
      void trackingApi.list().then(setTracked).catch(() => {});
      void signalsApi.list(50).then(setSignals).catch(() => {});
      void statsApi
        .get()
        .then((st) => {
          setStats(st);
          if (st.plan) applyPlan(st.plan, { preferHigherUsage: true });
        })
        .catch(() => {});
    }, 20_000);
    return () => clearInterval(timer);
  }, [applyPlan]);

  // ---------------------------------------------------------- market loading

  /** Guards against a slow response for an old market overwriting a newer one. */
  const marketRequestSeq = useRef(0);
  /** True once the displayed signal has reached a state that cannot change. */
  const terminalRef = useRef(false);

  const loadMarket = useCallback(async () => {
    const instrumentId = instrument?.id;
    if (!instrumentId) return;

    const seq = ++marketRequestSeq.current;
    setIsMarketLoading(true);
    setMarketError(null);

    try {
      const [q, c] = await Promise.all([
        marketApi.getQuote(instrumentId),
        marketApi.getCandles(instrumentId, timeframe, 300),
      ]);
      if (seq !== marketRequestSeq.current) return; // superseded by a newer load
      setQuote(q);
      setCandles(c);
    } catch (err) {
      if (seq !== marketRequestSeq.current) return;
      // No fabricated fallback: clear the data and say what happened.
      setQuote(null);
      setCandles([]);
      setMarketError(errorMessage(err));
    } finally {
      if (seq === marketRequestSeq.current) setIsMarketLoading(false);
    }
  }, [instrument?.id, timeframe]);

  useEffect(() => {
    void loadMarket();
  }, [loadMarket]);

  // Changing market or timeframe invalidates any existing signal — unless an
  // Analyse run is in flight (the confirm handler may align the chart TF first).
  const analyzingRef = useRef(false);
  useEffect(() => {
    if (analyzingRef.current) return;
    setSignal(null);
    setLiveSignal(null);
    setAnalysisError(null);
  }, [instrument?.id, timeframe]);

  /** Prevents double-handling when both the countdown and live poll fire. */
  const sessionEndHandledRef = useRef<string | null>(null);
  const sessionResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleWindowEnded = useCallback(
    (ended: SignalRecord) => {
      if (sessionEndHandledRef.current === ended.id) return;
      sessionEndHandledRef.current = ended.id;

      toast.info('Trade window ended. Preparing a fresh Analyse…');
      void refreshHistory();
      void refreshPlan();

      if (sessionResetTimerRef.current) clearTimeout(sessionResetTimerRef.current);
      sessionResetTimerRef.current = setTimeout(() => {
        setSignal((prev) => (prev?.id === ended.id ? null : prev));
        setLiveSignal(null);
        setAnalysisError(null);

        const used = plan?.analysesUsedToday ?? 0;
        const cap = plan?.maxAnalysesPerDay ?? settings.maxSignalsPerDay;
        if (aiAvailable && used < cap) {
          // Automatically open the next Analyse setup so the desk keeps moving.
          setIsAnalyseSetupOpen(true);
        } else if (used >= cap) {
          toast.warning('Daily Analyse limit reached. Come back tomorrow or upgrade later.');
        }
      }, 1600);
    },
    [
      refreshHistory,
      refreshPlan,
      plan?.analysesUsedToday,
      plan?.maxAnalysesPerDay,
      settings.maxSignalsPerDay,
      aiAvailable,
    ]
  );

  /**
   * Keeps the on-screen signal honest for the timed trade window.
   *
   * The trade plan is fixed once generated, but whether it is still worth
   * taking is not. While the user's window is ACTIVE we re-check against the
   * live price every few seconds. Polling stops when the window ends or the
   * lifecycle becomes terminal.
   */
  useEffect(() => {
    const signalId = signal?.id;
    if (!signalId) {
      setLiveSignal(null);
      return;
    }

    let cancelled = false;
    terminalRef.current = false;

    const windowActive = signal?.tradeIntent?.status === 'ACTIVE';
    // Tighter poll during an active timed session for lower perceived latency.
    const pollMs = windowActive ? 3500 : 8000;

    const check = async () => {
      try {
        const result = await analysisApi.live(signalId);
        if (cancelled) return;

        const terminal = ['INVALIDATED', 'TARGET_HIT', 'EXPIRED', 'HOLD'].includes(
          result.live.lifecycle
        );
        const sessionDone = result.tradeIntent?.status === 'COMPLETE';
        terminalRef.current = terminal || Boolean(sessionDone);

        setLiveSignal(result.live);
        if (result.tradeIntent) {
          setSignal((prev) =>
            prev && prev.id === signalId
              ? { ...prev, tradeIntent: result.tradeIntent ?? prev.tradeIntent }
              : prev
          );
        }
        // The quote from this call is authoritative for the signal's market.
        setQuote((prev) =>
          prev && prev.instrumentId === result.quote.instrumentId ? result.quote : prev
        );

        if (
          (sessionDone || result.live.lifecycle === 'EXPIRED') &&
          signal
        ) {
          handleWindowEnded({
            ...signal,
            tradeIntent: result.tradeIntent ?? signal.tradeIntent,
          });
        }
      } catch {
        // A transient failure should not clear a valid verdict; the stale
        // indicator in the header already tells the user data is not flowing.
      }
    };

    void check();

    const timer = setInterval(async () => {
      await check();
      if (!cancelled && terminalRef.current) clearInterval(timer);
    }, pollMs);

    // Also stop cleanly when the wall-clock window ends (client-side).
    let endTimer: ReturnType<typeof setTimeout> | null = null;
    if (signal?.tradeIntent?.status === 'ACTIVE') {
      const remaining = signal.tradeIntent.endsAt - Date.now();
      if (remaining > 0) {
        endTimer = setTimeout(() => {
          void check();
          if (signal) handleWindowEnded(signal);
        }, remaining + 50);
      } else if (signal) {
        handleWindowEnded(signal);
      }
    }

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (endTimer) clearTimeout(endTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal?.id, signal?.tradeIntent?.status, signal?.tradeIntent?.endsAt, handleWindowEnded]);

  // Periodically resolve old pending outcomes without a manual Evaluate click.
  useEffect(() => {
    const timer = setInterval(() => {
      void signalsApi
        .evaluate()
        .then((result) => {
          if (result.updated > 0) {
            void refreshHistory();
            toast.message(`Auto-checked ${result.updated} past signal(s).`);
          }
        })
        .catch(() => {});
    }, 5 * 60_000);
    return () => clearInterval(timer);
  }, [refreshHistory]);

  useEffect(() => {
    return () => {
      if (sessionResetTimerRef.current) clearTimeout(sessionResetTimerRef.current);
    };
  }, []);

  // --------------------------------------------------------------- streaming

  useEffect(() => {
    const instrumentId = instrument?.id;
    if (!instrumentId) return;

    /**
     * Capturing the id in a local guards against cross-market bleed: an
     * in-flight frame from the previous socket could otherwise land after the
     * user switched markets and overwrite the new instrument's price.
     */
    const stream = new MarketStream(instrumentId, timeframe, {
      onQuote: (update) => {
        setQuote((prev) => {
          if (!prev || prev.instrumentId !== instrumentId) return prev;
          return { ...prev, ...update, fetchedAt: update.fetchedAt ?? Date.now() };
        });
        // Venues without kline streams (e.g. Coinbase) only poll quotes —
        // nudge the forming candle so the chart still moves live.
        const price = update.price;
        if (!Number.isFinite(price)) return;
        setCandles((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (last.closed) return prev;
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              close: price,
              high: Math.max(last.high, price),
              low: Math.min(last.low, price),
            },
          ];
        });
      },
      onCandle: (candle) => {
        // Replace the forming candle, or append when a new one opens.
        setCandles((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (candle.time === last.time) return [...prev.slice(0, -1), candle];
          if (candle.time > last.time) return [...prev.slice(-499), candle];
          return prev;
        });
      },
      onStateChange: (state, detail) => {
        setStreamState(state);
        setStreamDetail(detail);
      },
      onStale: setIsDataStale,
    });

    streamRef.current = stream;
    void stream.start();

    return () => {
      stream.close();
      streamRef.current = null;
      // Reset the indicator so a dead socket cannot keep showing CONNECTED
      // while the next stream is still opening.
      setIsDataStale(false);
    };
  }, [instrument?.id, timeframe]);

  // ----------------------------------------------------------------- actions

  const handleSelectInstrument = (next: Instrument) => {
    setInstrument(next);
  };

  const persistFavourites = async (list: Instrument[]) => {
    setFavourites(list);
    try {
      setSettings(await settingsApi.update({ favourites: list.map((f) => f.id) }));
    } catch (err) {
      toast.error(`Could not save favourites: ${errorMessage(err)}`);
    }
  };

  const handleToggleFavourite = () => {
    if (!instrument) return;
    const exists = favourites.some((f) => f.id === instrument.id);
    if (!exists && plan && favourites.length >= plan.maxFavourites) {
      toast.error(planLimitReachedMessage(plan, 'favourites'));
      return;
    }
    void persistFavourites(
      exists ? favourites.filter((f) => f.id !== instrument.id) : [...favourites, instrument]
    );
    toast.success(exists ? 'Removed from favourites.' : 'Added to favourites.');
  };

  const handleRemoveFavourite = (id: string) => {
    void persistFavourites(favourites.filter((f) => f.id !== id));
  };

  const openAnalyseSetup = () => {
    if (!instrument) {
      toast.error('Choose a market first.');
      return;
    }
    if (!aiAvailable) {
      toast.error('AI analysis is unavailable on this server.');
      return;
    }
    if (plan && plan.analysesUsedToday >= plan.maxAnalysesPerDay) {
      toast.error(planLimitReachedMessage(plan, 'analyses'));
      return;
    }
    setIsAnalyseSetupOpen(true);
  };

  const handleAnalyzeConfirm = async (setup: AnalyseSetupValues) => {
    if (!instrument) {
      toast.error('Choose a market first.');
      return;
    }

    setIsAnalyseSetupOpen(false);
    analyzingRef.current = true;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setSignal(null);
    setLiveSignal(null);
    setAnalysisStage('market');
    // Show usage climbing as soon as Analyse starts (reverted if the request fails).
    bumpPlanUsage('analyses');

    // Align chart TF with the selected window so streamed candles match the plan.
    if (setup.timeframe !== timeframe) {
      setTimeframe(setup.timeframe);
    }

    // Optimistic: local indicators (if already on this TF) show while AI runs.
    if (analysis && timeframe === setup.timeframe) setAnalysisStage('indicators');

    const stageTimers = [
      setTimeout(() => setAnalysisStage('indicators'), 200),
      setTimeout(() => setAnalysisStage('ai'), 600),
      setTimeout(() => setAnalysisStage('verdict'), 4_000),
    ];

    try {
      const result = await analysisApi.analyze({
        instrumentId: instrument.id,
        timeframe: setup.timeframe,
        windowMinutes: setup.windowMinutes,
        sizeAmount: setup.sizeAmount,
        sizeUnit: setup.sizeUnit,
      });
      setSignal(result.signal);
      setQuote(result.quote);
      result.notes.forEach((n) => toast.warning(n));

      const action = tradeActionFromVerdict(
        result.signal.advice.verdict,
        result.signal.ai.signal
      );
      const message = `${instrument.displaySymbol}: ${tradeActionLabel(action)} — ${result.signal.advice.headline}`;
      if (action === 'TRADE') toast.success(message);
      else if (action === 'WAIT') toast.warning(message);
      else toast.info(message);

      // Authoritative live usage from the Analyse response (includes this run).
      if (result.plan) applyPlan(result.plan);
      sessionEndHandledRef.current = null;
      if (sessionResetTimerRef.current) {
        clearTimeout(sessionResetTimerRef.current);
        sessionResetTimerRef.current = null;
      }
      void signalsApi.list(50).then(setSignals).catch(() => {});
      void refreshHistory();
    } catch (err) {
      const message = errorMessage(err);
      setAnalysisError(message);
      setSignal(null); // never leave a stale signal after a failure
      toast.error(message);
      // Undo the optimistic bump with an exact server count (allow decrease).
      void refreshPlan({ preferHigherUsage: false });
    } finally {
      stageTimers.forEach(clearTimeout);
      setAnalysisStage('idle');
      setIsAnalyzing(false);
      analyzingRef.current = false;
    }
  };

  const handleTrack = async () => {
    if (!signal) return;
    const active = tracked.filter((t) => t.status === 'ACTIVE').length;
    if (plan && active >= plan.maxActiveTracked) {
      toast.error(planLimitReachedMessage(plan, 'tracked'));
      return;
    }
    setIsTracking(true);
    try {
      await trackingApi.track(signal.id);
      setSignal({ ...signal, tracked: true });
      toast.success('Now following this signal. You can review the outcome later.');
      await refreshHistory();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setIsTracking(false);
    }
  };

  const handleCloseTracked = async (id: string) => {
    setBusyTrackedId(id);
    try {
      const result = await trackingApi.close(id);
      const pct = result.tracked.resultPercent ?? 0;
      toast.success(`Stopped tracking: ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% from entry.`);
      await refreshHistory();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyTrackedId(null);
    }
  };

  const handleRefreshTracked = async () => {
    setIsRefreshingTracked(true);
    try {
      await refreshHistory();
    } finally {
      setIsRefreshingTracked(false);
    }
  };

  const handleEvaluate = async () => {
    setIsEvaluating(true);
    try {
      const result = await signalsApi.evaluate();
      toast.success(
        result.updated > 0
          ? `Checked ${result.updated} past signal(s) against what actually happened.`
          : 'No signals are old enough to evaluate yet.'
      );
      await refreshHistory();
      void signalsApi.list(50).then(setSignals).catch(() => {});
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSaveSettings = async (patch: Partial<ServerSettings>) => {
    try {
      setSettings(await settingsApi.update(patch));
      toast.success('Settings saved.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  // -------------------------------------------------------------------- view

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background text-foreground font-sans">
        <AppSidebar
          currentInstrument={instrument}
          favourites={favourites}
          onSelect={handleSelectInstrument}
          onRemoveFavourite={handleRemoveFavourite}
          selectedTimeframe={timeframe}
          onSelectTimeframe={setTimeframe}
          settings={settings}
          onOpenSettings={() => setIsSettingsOpen(true)}
          activeCount={tracked.filter((t) => t.status === 'ACTIVE').length}
          signalsToday={plan?.analysesUsedToday ?? stats?.signalsToday ?? 0}
          plan={plan}
        />

        <SidebarInset>
          <Header
            onOpenSettings={() => setIsSettingsOpen(true)}
            theme={theme}
            onToggleTheme={toggleTheme}
            connection={connection}
            streamState={streamState}
            streamDetail={streamDetail}
            isDataStale={isDataStale}
            settings={settings}
            plan={plan}
            onSaveSettings={async (patch) => {
              setSettings(await settingsApi.update(patch));
            }}
          />

          <main className="max-w-7xl w-full mx-auto px-4 lg:px-8 py-6 space-y-6 flex-1">
            <MarketOverview
              instrument={instrument}
              quote={quote}
              analysis={analysis}
              isLoading={isMarketLoading}
              onSelect={handleSelectInstrument}
              onRefresh={loadMarket}
              error={marketError}
              isLive={streamState === 'CONNECTED' && !isDataStale}
              isFavourite={isFavourite}
              onToggleFavourite={handleToggleFavourite}
            />

            {!instrument ? (
              <div className="bg-card border border-dashed border-border rounded-xl p-12 text-center space-y-2">
                <p className="text-sm font-semibold">Choose a market to begin</p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Search for any cryptocurrency, stock, currency pair or commodity above. Typing a
                  letter shows every market starting with it.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <div className="lg:col-span-7 space-y-6">
                    <TradingChart
                      symbol={instrument.displaySymbol}
                      providerLabel={instrument.providerLabel}
                      timeframe={timeframe}
                      onSelectTimeframe={setTimeframe}
                      candles={candles}
                      analysis={analysis}
                      isLoading={isMarketLoading}
                      theme={theme}
                    />
                    <QuantitativeScoreCard analysis={analysis} />
                  </div>

                  <div className="lg:col-span-5 space-y-6">
                    <SignalCard
                      instrument={instrument}
                      currentPrice={quote?.price ?? null}
                      signal={signal}
                      live={liveSignal}
                      analysis={analysis}
                      isAnalyzing={isAnalyzing}
                      analysisStage={analysisStage}
                      isTracking={isTracking}
                      onAnalyze={openAnalyseSetup}
                      onTrack={handleTrack}
                      onWindowEnded={handleWindowEnded}
                      settings={settings}
                      analysisError={analysisError}
                      aiAvailable={aiAvailable}
                      plan={plan}
                    />
                    <SignalStatsPanel data={stats} />
                  </div>
                </div>

                <FollowedSignals
                  tracked={tracked}
                  onClose={handleCloseTracked}
                  onRefresh={handleRefreshTracked}
                  busyId={busyTrackedId}
                  isRefreshing={isRefreshingTracked}
                />

                <SignalHistory
                  signals={signals}
                  onEvaluate={handleEvaluate}
                  isEvaluating={isEvaluating}
                />
              </>
            )}
          </main>
        </SidebarInset>

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          providers={connection?.providers ?? []}
          plan={plan}
          onSave={handleSaveSettings}
        />

        <AnalyseSetupModal
          isOpen={isAnalyseSetupOpen}
          onClose={() => setIsAnalyseSetupOpen(false)}
          instrument={instrument}
          chartTimeframe={timeframe}
          onConfirm={(values) => void handleAnalyzeConfirm(values)}
        />

        {/* Floating assistant. Receives the current market so it can discuss
            real prices and the latest signal rather than guessing. */}
        <ChatPanel
          instrument={instrument}
          timeframe={timeframe}
          aiAvailable={aiAvailable}
          plan={plan}
          onPlanUsageChange={() => bumpPlanUsage('chat')}
          onPlanUsageSync={() => void refreshPlan()}
        />
      </div>
    </SidebarProvider>
  );
}
