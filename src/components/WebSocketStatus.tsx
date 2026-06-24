import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react';
import { HudSpinner } from './HudSpinner';
import { rpc2Client, RPC2ConnectionState } from '@/lib/rpc2';
import { wsService } from '../services/api';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

/**
 * Format a timestamp as a relative-ish string suitable for the footer.
 * Falls back to a localised time when the snapshot is more than ~1 day
 * old; closer than that we use "Xm ago" / "Xs ago" so a glance tells
 * the user how stale the dashboard is.
 */
function formatStaleness(ts: number): string {
  if (!ts) return '—';
  const dt = Date.now() - ts;
  if (dt < 30_000) return 'just now';
  if (dt < 60_000) return `${Math.floor(dt / 1000)}s ago`;
  if (dt < 60 * 60_000) return `${Math.floor(dt / 60_000)}m ago`;
  if (dt < 24 * 60 * 60_000) return `${Math.floor(dt / (60 * 60_000))}h ago`;
  return new Date(ts).toLocaleString();
}

export function WebSocketStatus() {
  const { t } = useTranslation();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(0);

  useEffect(() => {
    const checkConnection = () => {
      const state = rpc2Client.state;
      setIsConnected(state === RPC2ConnectionState.CONNECTED);
      setIsConnecting(
        state === RPC2ConnectionState.CONNECTING ||
        state === RPC2ConnectionState.RECONNECTING
      );
      setLastUpdated(wsService.getLastUpdatedAt());
    };

    checkConnection();
    const interval = setInterval(checkConnection, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleReconnect = () => {
    setIsConnecting(true);
    wsService.disconnect();
    rpc2Client.reconnect();
    wsService.connect();
  };

  if (isConnecting) {
    return (
      <button
        type="button"
        disabled
        className="flex items-center gap-1.5 text-warning font-mono text-inherit leading-none cursor-default opacity-90"
        aria-busy="true"
      >
        <HudSpinner size="sm" className="text-warning" />
        <span>{t('ws.connecting')}</span>
      </button>
    );
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-1.5 text-success font-mono text-inherit leading-none" role="status" aria-live="polite">
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-success/70 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
        </span>
        <span>{t('ws.live')}</span>
      </div>
    );
  }

  // Disconnected — show OFFLINE + a "stale data, last seen X ago" hint
  // when we have a cached snapshot to fall back on. Tooltip carries the
  // full timestamp so the relative label can stay terse.
  const stale = formatStaleness(lastUpdated);
  return (
    <div className="flex items-center gap-2 font-mono text-inherit leading-none">
      <button
        type="button"
        onClick={handleReconnect}
        className="flex items-center gap-1.5 rounded-sm text-destructive hover:text-destructive/90 transition-colors duration-200 ease-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={t('ws.offline')}
      >
        <WifiOff className="h-3 w-3 shrink-0" aria-hidden />
        <span>{t('offline.badge', 'OFFLINE')}</span>
      </button>
      {lastUpdated > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warning/12 text-warning ring-1 ring-warning/25 cursor-default">
              <span className="font-bold tracking-wider">{t('offline.stale', 'STALE')}</span>
              <span className="text-warning/80">· {stale}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs font-mono">
            {t('offline.tooltip', { time: new Date(lastUpdated).toLocaleString() })}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
