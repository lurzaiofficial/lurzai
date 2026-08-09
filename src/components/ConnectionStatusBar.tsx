import React from 'react';
import { Activity, Cpu, Radio, Wifi, WifiOff, AlertTriangle, CheckCircle2, Ban } from 'lucide-react';
import type { ConnectionState, ConnectionStatus } from '../types';

interface ConnectionStatusBarProps {
  status: ConnectionStatus | null;
  streamState: ConnectionState;
  streamDetail: string;
  isDataStale: boolean;
}

/** Only CONNECTED is ever shown as green — nothing is optimistic. */
function stateStyle(state: ConnectionState): { color: string; Icon: typeof Wifi } {
  switch (state) {
    case 'CONNECTED':
      return { color: 'text-emerald-500', Icon: CheckCircle2 };
    case 'CONNECTING':
    case 'RECONNECTING':
      return { color: 'text-amber-500', Icon: Radio };
    case 'ERROR':
      return { color: 'text-rose-500', Icon: AlertTriangle };
    case 'UNAVAILABLE':
      return { color: 'text-muted-foreground', Icon: Ban };
    default:
      return { color: 'text-muted-foreground', Icon: WifiOff };
  }
}

function StatusPill({
  label,
  state,
  detail,
  Icon,
}: {
  label: string;
  state: ConnectionState;
  detail?: string;
  Icon: typeof Wifi;
}) {
  const { color, Icon: StateIcon } = stateStyle(state);
  return (
    <div className="flex items-center gap-1.5" title={detail || state}>
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground hidden lg:inline">{label}:</span>
      <span className={`font-semibold ${color} flex items-center gap-1`}>
        <StateIcon className="h-3 w-3" />
        {state}
      </span>
    </div>
  );
}

export const ConnectionStatusBar: React.FC<ConnectionStatusBarProps> = ({
  status,
  streamState,
  streamDetail,
  isDataStale,
}) => {
  const availableProviders = status?.providers.filter((p) => p.available).length ?? 0;
  const totalProviders = status?.providers.length ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-muted/60 p-1.5 px-3 rounded-lg border border-border text-xs">
      <StatusPill
        label="Market data"
        state={status?.marketData ?? 'DISCONNECTED'}
        detail={status?.details?.marketData}
        Icon={Activity}
      />

      <div className="h-3 w-[1px] bg-border" />

      <StatusPill label="Live feed" state={streamState} detail={streamDetail} Icon={Wifi} />

      <div className="h-3 w-[1px] bg-border" />

      <StatusPill
        label="AI"
        state={status?.ai ?? 'DISCONNECTED'}
        detail={status?.details?.ai}
        Icon={Cpu}
      />

      {totalProviders > 0 && (
        <>
          <div className="h-3 w-[1px] bg-border" />
          <span
            className="text-muted-foreground hidden xl:inline"
            title={status?.providers
              .map((p) => `${p.label}: ${p.available ? 'available' : p.reason || 'unavailable'}`)
              .join('\n')}
          >
            Sources:{' '}
            <span className="font-semibold text-foreground">
              {availableProviders}/{totalProviders}
            </span>
          </span>
        </>
      )}

      {isDataStale && (
        <>
          <div className="h-3 w-[1px] bg-border" />
          <span className="text-amber-500 font-semibold flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            STALE
          </span>
        </>
      )}
    </div>
  );
};
