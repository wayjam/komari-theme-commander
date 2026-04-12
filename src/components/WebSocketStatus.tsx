import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react';
import { HudSpinner } from './HudSpinner';
import { rpc2Client, RPC2ConnectionState } from '@/lib/rpc2';
import { wsService } from '../services/api';

export function WebSocketStatus() {
  const { t } = useTranslation();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const checkConnection = () => {
      const state = rpc2Client.state;
      setIsConnected(state === RPC2ConnectionState.CONNECTED);
      setIsConnecting(
        state === RPC2ConnectionState.CONNECTING ||
        state === RPC2ConnectionState.RECONNECTING
      );
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
        className="flex items-center gap-1.5 text-warning font-mono text-xs cursor-default opacity-90"
        aria-busy="true"
      >
        <HudSpinner size="sm" className="text-warning" />
        <span>{t('ws.connecting')}</span>
      </button>
    );
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-1.5 text-success font-mono text-xs" role="status" aria-live="polite">
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-success/70 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
        </span>
        <span>{t('ws.live')}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleReconnect}
      className="flex items-center gap-1.5 rounded-sm text-destructive font-mono text-xs hover:text-destructive/90 transition-colors duration-200 ease-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <WifiOff className="h-3 w-3 shrink-0" aria-hidden />
      <span>{t('ws.offline')}</span>
    </button>
  );
}
