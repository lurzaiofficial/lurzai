import React, { useEffect, useState } from 'react';
import { Compass, LogOut, Settings, Sun, Moon, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { ProfileSettingsModal } from '@/components/ProfileSettingsModal';
import {
  loadProfilePrefs,
  PROFILE_PREFS_EVENT,
} from '@/lib/profilePrefs';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { SidebarTrigger } from './ui/sidebar';
import { ConnectionStatusBar } from './ConnectionStatusBar';
import { PlanBadge } from './PlanBadge';
import type { UserPlanView } from '../services/api';
import type { ConnectionState, ConnectionStatus, ServerSettings } from '../types';

interface HeaderProps {
  onOpenSettings: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  connection: ConnectionStatus | null;
  streamState: ConnectionState;
  streamDetail: string;
  isDataStale: boolean;
  settings: ServerSettings;
  plan: UserPlanView | null;
  onSaveSettings: (patch: Partial<ServerSettings>) => Promise<void>;
}

function getInitials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0]!.length >= 2) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  if (parts.length === 1 && parts[0]!.length === 1) {
    return parts[0]!.toUpperCase();
  }
  return email.slice(0, 2).toUpperCase() || '?';
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  theme,
  onToggleTheme,
  connection,
  streamState,
  streamDetail,
  isDataStale,
  settings,
  plan,
  onSaveSettings,
}) => {
  const { user, signOut } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [compactHeader, setCompactHeader] = useState(
    () => loadProfilePrefs().compactHeader
  );
  const initials = user ? getInitials(user.name, user.email) : '';

  useEffect(() => {
    const sync = () => setCompactHeader(loadProfilePrefs().compactHeader);
    window.addEventListener(PROFILE_PREFS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PROFILE_PREFS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      toast.success('Signed out.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not sign out.');
      setSigningOut(false);
    }
  };

  return (
    <header
      className={`border-b border-border bg-card/95 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 flex flex-wrap items-center justify-between gap-3 text-card-foreground ${
        compactHeader ? 'py-2' : 'py-3.5 gap-4'
      }`}
    >
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <div
          className={`rounded-md bg-primary text-primary-foreground flex items-center justify-center shrink-0 ${
            compactHeader ? 'h-8 w-8' : 'h-9 w-9'
          }`}
        >
          <Compass className={compactHeader ? 'h-4 w-4' : 'h-5 w-5'} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1
              className={`font-semibold tracking-tight ${
                compactHeader ? 'text-base' : 'text-lg'
              }`}
            >
              LURZ
              <span className="text-muted-foreground font-mono text-xs uppercase px-2 py-0.5 rounded-sm bg-muted border border-border ml-1.5">
                AI
              </span>
            </h1>
          </div>
          {!compactHeader && (
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              AI trade signals for crypto, stocks, forex and commodities
              {user?.name ? ` · ${user.name}` : ''}
            </p>
          )}
        </div>
        <PlanBadge plan={plan} showUsage={!compactHeader} className="hidden md:flex" />
      </div>

      <ConnectionStatusBar
        status={connection}
        streamState={streamState}
        streamDetail={streamDetail}
        isDataStale={isDataStale}
      />

      <div className="flex items-center gap-2 sm:gap-3">
        <PlanBadge plan={plan} compact className="md:hidden" />
        <Button
          variant="outline"
          size="icon"
          onClick={onToggleTheme}
          className="h-9 w-9 border-border hover:bg-muted"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 text-slate-700" />
          )}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onOpenSettings}
          className="gap-2 border-border hover:bg-muted"
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span className="hidden sm:inline">Settings</span>
        </Button>

        {user && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold tracking-wide text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Open account menu"
                  title={user.name}
                >
                  {initials || <UserRound className="h-4 w-4" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="space-y-1.5 font-normal">
                  <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  {plan && (
                    <p className="text-[11px] font-mono text-foreground/80 pt-1">
                      {plan.name} plan · {plan.aiModelLabel}
                      <span className="block text-muted-foreground normal-case tracking-normal mt-0.5">
                        {plan.analysesUsedToday}/{plan.maxAnalysesPerDay} analyses today
                      </span>
                    </p>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
                  <UserRound />
                  Profile settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={signingOut}
                  onSelect={(event) => {
                    event.preventDefault();
                    void handleSignOut();
                  }}
                >
                  <LogOut />
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <ProfileSettingsModal
              open={profileOpen}
              onOpenChange={setProfileOpen}
              theme={theme}
              onToggleTheme={onToggleTheme}
              settings={settings}
              plan={plan}
              onSaveSettings={onSaveSettings}
            />
          </>
        )}
      </div>
    </header>
  );
};
