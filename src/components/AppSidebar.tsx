import React from 'react';
import {
  Star,
  BarChart2,
  Sliders,
  Zap,
  Compass,
  Search,
  X,
  Bookmark,
} from 'lucide-react';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarRail,
} from './ui/sidebar';
import { SymbolSearch } from './SymbolSearch';
import type { UserPlanView } from '../services/api';
import type { Instrument, ServerSettings, Timeframe } from '../types';

interface AppSidebarProps {
  currentInstrument: Instrument | null;
  favourites: Instrument[];
  onSelect: (instrument: Instrument) => void;
  onRemoveFavourite: (id: string) => void;
  selectedTimeframe: Timeframe;
  onSelectTimeframe: (tf: Timeframe) => void;
  settings: ServerSettings;
  onOpenSettings: () => void;
  activeCount: number;
  signalsToday: number;
  plan: UserPlanView | null;
}

const TIMEFRAMES: { label: string; value: Timeframe }[] = [
  { label: '1 minute', value: '1m' },
  { label: '5 minutes', value: '5m' },
  { label: '15 minutes', value: '15m' },
  { label: '1 hour', value: '1h' },
  { label: '4 hours', value: '4h' },
  { label: '1 day', value: '1d' },
];

const CLASS_COLOR: Record<string, string> = {
  CRYPTO: 'text-amber-500',
  STOCK: 'text-blue-500',
  FOREX: 'text-emerald-500',
  COMMODITY: 'text-orange-500',
  INDEX: 'text-stone-600 dark:text-stone-400',
  ETF: 'text-yellow-700 dark:text-yellow-500',
};

export const AppSidebar: React.FC<AppSidebarProps> = ({
  currentInstrument,
  favourites,
  onSelect,
  onRemoveFavourite,
  selectedTimeframe,
  onSelectTimeframe,
  settings,
  onOpenSettings,
  activeCount,
  signalsToday,
  plan,
}) => {
  const analysisCap = plan?.maxAnalysesPerDay ?? settings.maxSignalsPerDay;
  const trackCap = plan?.maxActiveTracked ?? 3;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex items-center gap-2 px-3 py-3">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <Compass className="h-4 w-4" />
          </div>
          <div className="flex flex-col truncate group-data-[collapsible=icon]:hidden">
            <span className="font-bold text-sm leading-tight">LURZ AI</span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {plan ? `${plan.name} · ${plan.aiModelLabel}` : 'Signal advisor'}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Search is available directly in the sidebar, not just the top bar. */}
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            Find a market
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-1">
            <SymbolSearch
              value=""
              onSelect={onSelect}
              placeholder="BTC, AAPL, EUR/USD…"
              className="w-full"
            />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-amber-500" />
            Favourites
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {favourites.length === 0 ? (
                <div className="px-2 py-3 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                  Search for a market and press the star to pin it here.
                </div>
              ) : (
                favourites.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={currentInstrument?.id === item.id}
                      onClick={() => onSelect(item)}
                      tooltip={`${item.displaySymbol} · ${item.providerLabel}`}
                      // Reserve room on the right so the label never runs under
                      // the remove control that sits above this button.
                      className="pr-8"
                    >
                      <span
                        className={`font-mono text-[10px] font-bold shrink-0 w-4 text-center ${
                          CLASS_COLOR[item.assetClass] ?? 'text-muted-foreground'
                        }`}
                      >
                        {item.assetClass[0]}
                      </span>
                      <span className="font-medium truncate">{item.displaySymbol}</span>
                    </SidebarMenuButton>

                    {/*
                      The remove control is a SIBLING of SidebarMenuButton, not a
                      child. SidebarMenuButton renders a <button>, so nesting one
                      inside produced invalid HTML, and SidebarMenuBadge sets
                      pointer-events-none, which made the control unclickable.
                    */}
                    <button
                      type="button"
                      onClick={() => onRemoveFavourite(item.id)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 p-1 rounded text-muted-foreground opacity-0 transition-opacity hover:text-rose-500 hover:bg-sidebar-accent focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/menu-item:opacity-100 group-data-[collapsible=icon]:hidden"
                      title={`Remove ${item.displaySymbol} from favourites`}
                      aria-label={`Remove ${item.displaySymbol} from favourites`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-1.5">
            <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />
            Timeframe
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {TIMEFRAMES.map((tf) => (
                <SidebarMenuItem key={tf.value}>
                  <SidebarMenuButton
                    isActive={selectedTimeframe === tf.value}
                    onClick={() => onSelectTimeframe(tf.value)}
                    tooltip={tf.label}
                  >
                    <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span>{tf.label}</span>
                    <SidebarMenuBadge className="font-mono">{tf.value}</SidebarMenuBadge>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-1.5">
            <Bookmark className="h-3.5 w-3.5 text-emerald-500" />
            Activity
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="p-2.5 rounded-lg bg-muted/50 border border-border space-y-2 group-data-[collapsible=icon]:hidden">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Following</span>
                <span
                  className={`font-bold font-mono ${
                    activeCount >= trackCap ? 'text-amber-500' : ''
                  }`}
                >
                  {activeCount}/{trackCap}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Analyses today</span>
                <span
                  className={`font-bold font-mono ${
                    signalsToday >= analysisCap ? 'text-amber-500' : ''
                  }`}
                >
                  {signalsToday}/{analysisCap}
                </span>
              </div>
              {plan?.id === 'free' && (
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Free plan · Pro & Max models coming soon
                </p>
              )}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onOpenSettings} tooltip="Settings">
              <Sliders className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
};
