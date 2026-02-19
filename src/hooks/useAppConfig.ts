import { createContext, useContext, useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createElement } from 'react';
import { apiService } from '@/services/api';

export interface AppConfig {
  isLoggedIn: boolean;
  username: string;
  recordPreserveTime: number;   // hours, default 720
  pingRecordPreserveTime: number; // hours, default 48
  loaded: boolean;
}

const defaultConfig: AppConfig = {
  isLoggedIn: false,
  username: '',
  recordPreserveTime: 720,
  pingRecordPreserveTime: 48,
  loaded: false,
};

const AppConfigContext = createContext<AppConfig>(defaultConfig);

export function useAppConfig() {
  return useContext(AppConfigContext);
}

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const init = async () => {
      try {
        const [userInfo, publicSettings] = await Promise.all([
          apiService.getUserInfo().catch(() => null),
          apiService.getPublicSettings().catch(() => null),
        ]);

        setConfig({
          // isLoggedIn: !!userInfo?.logged_in,
           isLoggedIn:true,
          username: userInfo?.username || '',
          recordPreserveTime: publicSettings?.record_preserve_time || 720,
          pingRecordPreserveTime: publicSettings?.ping_record_preserve_time || 48,
          loaded: true,
        });
      } catch (e) {
        console.error('Failed to load app config:', e);
        setConfig(prev => ({ ...prev, loaded: true }));
      }
    };
    init();
  }, []);

  const value = useMemo(() => config, [config]);

  return createElement(AppConfigContext.Provider, { value }, children);
}
