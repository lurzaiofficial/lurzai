import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, X, TrendingUp, Building2, DollarSign, Fuel, LineChart } from 'lucide-react';
import type { AssetClass, Instrument } from '../types';
import { searchApi, ApiError } from '../services/api';
import { Input } from './ui/input';
import { Badge } from './ui/badge';

interface SymbolSearchProps {
  value: string;
  placeholder?: string;
  onSelect: (instrument: Instrument) => void;
  /** Restricts results to one asset class. */
  assetClass?: AssetClass;
  className?: string;
  autoFocus?: boolean;
}

/** Icon per asset class so the list is scannable at a glance. */
const CLASS_ICON: Record<AssetClass, typeof TrendingUp> = {
  CRYPTO: TrendingUp,
  STOCK: Building2,
  FOREX: DollarSign,
  COMMODITY: Fuel,
  INDEX: LineChart,
  ETF: LineChart,
};

const CLASS_STYLE: Record<AssetClass, string> = {
  CRYPTO: 'text-amber-500 border-amber-500/30 bg-amber-500/10',
  STOCK: 'text-blue-500 border-blue-500/30 bg-blue-500/10',
  FOREX: 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10',
  COMMODITY: 'text-orange-500 border-orange-500/30 bg-orange-500/10',
  INDEX: 'text-stone-600 border-stone-500/30 bg-stone-500/10 dark:text-stone-400',
  ETF: 'text-yellow-700 border-yellow-700/30 bg-yellow-700/10 dark:text-yellow-500',
};

/**
 * Highlights the matched prefix so it is obvious why a result appeared.
 */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().replace(/[\/\-_\s]/g, '').toUpperCase();
  if (!q) return <>{text}</>;

  const upper = text.toUpperCase();
  const index = upper.indexOf(q);
  if (index === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-primary/25 text-foreground rounded-sm px-0.5">
        {text.slice(index, index + q.length)}
      </mark>
      {text.slice(index + q.length)}
    </>
  );
}

/**
 * Instrument autocomplete.
 *
 * Typing a letter lists markets whose ticker STARTS with it, ranked by the
 * server. Supports arrow-key navigation, Enter to choose and Escape to dismiss.
 */
export const SymbolSearch: React.FC<SymbolSearchProps> = ({
  value,
  placeholder = 'Search any market…',
  onSelect,
  assetClass,
  className,
  autoFocus,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Instrument[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Guards against an older, slower response overwriting a newer one. */
  const requestSeq = useRef(0);

  const runSearch = useCallback(
    async (term: string) => {
      const seq = ++requestSeq.current;
      setIsLoading(true);
      setError(null);

      try {
        const found = await searchApi.search(term, { limit: 25, assetClass });
        if (seq !== requestSeq.current) return; // a newer search superseded this one
        setResults(found);
        setActiveIndex(0);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setResults([]);
        setError(err instanceof ApiError ? err.message : 'Search failed.');
      } finally {
        if (seq === requestSeq.current) setIsLoading(false);
      }
    },
    [assetClass]
  );

  // Debounced search. 180ms is short enough to feel instant while still
  // collapsing a burst of keystrokes into one request.
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => void runSearch(query), 180);
    return () => clearTimeout(timer);
  }, [query, isOpen, runSearch]);

  // Close when clicking away.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  const choose = (instrument: Instrument) => {
    onSelect(instrument);
    setQuery('');
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setIsOpen(true);
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
        break;
      case 'Enter':
        event.preventDefault();
        if (results[activeIndex]) choose(results[activeIndex]);
        break;
      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        inputRef.current?.blur();
        break;
      default:
        break;
    }
  };

  /**
   * Group results by asset class, preserving the server's ranking.
   *
   * Each row carries a precomputed flat index. Previously this was tracked with
   * a counter mutated during render, which desynchronised from keyboard
   * navigation whenever React re-rendered without re-running the loop.
   */
  const grouped = useMemo(() => {
    const groups = new Map<AssetClass, Array<{ item: Instrument; index: number }>>();
    results.forEach((item, index) => {
      const row = { item, index };
      const list = groups.get(item.assetClass);
      if (list) list.push(row);
      else groups.set(item.assetClass, [row]);
    });
    return [...groups.entries()];
  }, [results]);

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <div className="relative">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value || placeholder}
          className="h-9 pl-8 pr-8 font-mono text-sm bg-muted border-border font-semibold"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
        />
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {isOpen && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1.5 w-full min-w-[340px] max-h-[420px] overflow-y-auto overscroll-contain scrollbar-subtle rounded-xl border border-border bg-popover shadow-xl"
          role="listbox"
        >
          {error && (
            <div className="p-3 text-xs text-rose-500">{error}</div>
          )}

          {!error && results.length === 0 && !isLoading && (
            <div className="p-4 text-xs text-muted-foreground text-center">
              {query ? `No markets found for "${query}".` : 'Start typing to search markets.'}
            </div>
          )}

          {grouped.map(([cls, items]) => {
            const Icon = CLASS_ICON[cls];
            return (
              <div key={cls}>
                <div className="sticky top-0 px-3 py-1.5 bg-popover/95 backdrop-blur-sm border-b border-border/60 flex items-center gap-1.5">
                  <Icon className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {cls}
                  </span>
                </div>

                {items.map(({ item, index }) => {
                  const isActive = index === activeIndex;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-active={isActive}
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(item)}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 transition-colors ${
                        isActive ? 'bg-accent' : 'hover:bg-accent/50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-bold text-sm truncate">
                          <Highlight text={item.displaySymbol} query={query} />
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {item.name}
                          {item.exchange ? ` · ${item.exchange}` : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          variant="outline"
                          className={`text-[9px] py-0 px-1.5 ${CLASS_STYLE[item.assetClass]}`}
                        >
                          {item.assetClass}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {item.providerLabel}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}

          <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground flex items-center justify-between">
            <span>↑↓ navigate · ↵ select · esc close</span>
            {results.length > 0 && <span>{results.length} results</span>}
          </div>
        </div>
      )}
    </div>
  );
};
