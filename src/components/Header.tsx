import React from 'react';
import { Compass, LogOut, Settings, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from './ui/button';
import { SidebarTrigger } from './ui/sidebar';
import { ConnectionStatusBar } from './ConnectionStatusBar';
import type { ConnectionState, ConnectionStatus } from '../types';

interface HeaderProps {
  onOpenSettings: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  connection: ConnectionStatus | null;
  streamState: ConnectionState;
  streamDetail: string;
  isDataStale: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  theme,
  onToggleTheme,
  connection,
  streamState,
  streamDetail,
  isDataStale,
}) => {
  const { user, signOut } = useAuth();

  return (
    <header className="border-b border-border bg-card/95 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4 text-card-foreground">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center shrink-0">
          <Compass className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-lg tracking-tight">
              LURZ
              <span className="text-muted-foreground font-mono text-xs uppercase px-2 py-0.5 rounded-sm bg-muted border border-border ml-1.5">
                AI
              </span>
            </h1>
          </div>
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            AI trade signals for crypto, stocks, forex and commodities
            {user?.name ? ` · ${user.name}` : ''}
          </p>
        </div>
      </div>

      <ConnectionStatusBar
        status={connection}
        streamState={streamState}
        streamDetail={streamDetail}
        isDataStale={isDataStale}
      />

      <div className="flex items-center gap-3">
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

        <Button
          variant="outline"
          size="sm"
          onClick={signOut}
          className="gap-2 border-border hover:bg-muted"
          title="Sign out"
        >
          <LogOut className="h-4 w-4 text-muted-foreground" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
};
