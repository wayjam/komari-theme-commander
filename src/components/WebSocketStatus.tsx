import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { WifiOff, Loader2 } from 'lucide-react';
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
      <button className="flex items-center gap-1.5 text-yellow-500 font-mono text-xs cursor-pointer">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>{t('ws.connecting')}</span>
      </button>
    );
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-1.5 text-green-500 font-mono text-xs">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span>{t('ws.live')}</span>
      </div>
    );
  }

  return (
    <button
      onClick={handleReconnect}
      className="flex items-center gap-1.5 text-red-500 font-mono text-xs hover:text-red-400 transition-colors cursor-pointer"
    >
      <WifiOff className="h-3 w-3" />
      <span>{t('ws.offline')}</span>
    </button>
  );
}
