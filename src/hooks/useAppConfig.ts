import { createContext, useContext, useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createElement } from 'react';
import { apiService } from '@/services/api';

export interface ThemeConfig {
  default_view: 'globe' | 'grid' | 'table' | 'uptime';
  enable_globe: boolean;
  enable_uptime: boolean;
  default_theme: 'lumina' | 'deepspace' | 'clean' | 'auto';
  custom_footer: string;
  enable_privacy_mode: boolean;
}

const defaultThemeConfig: ThemeConfig = {
  default_view: 'globe',
  enable_globe: true,
  enable_uptime: true,
  default_theme: 'clean',
  custom_footer: '',
  enable_privacy_mode: false,
};

export interface AppConfig {
  isLoggedIn: boolean;
  username: string;
  recordPreserveTime: number;   // hours, default 720
  pingRecordPreserveTime: number; // hours, default 48
  themeConfig: ThemeConfig;
  loaded: boolean;
}

const defaultConfig: AppConfig = {
  isLoggedIn: false,
  username: '',
  recordPreserveTime: 720,
  pingRecordPreserveTime: 48,
  themeConfig: defaultThemeConfig,
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

        // Parse theme configuration from public settings
        const tc: ThemeConfig = { ...defaultThemeConfig };
        if (publicSettings) {
          if (typeof publicSettings.default_view === 'string' && ['globe', 'grid', 'table', 'uptime'].includes(publicSettings.default_view as string)) {
            tc.default_view = publicSettings.default_view as ThemeConfig['default_view'];
          }
          if (typeof publicSettings.enable_globe === 'boolean') tc.enable_globe = publicSettings.enable_globe;
          if (publicSettings.enable_globe === 'true') tc.enable_globe = true;
          if (publicSettings.enable_globe === 'false') tc.enable_globe = false;
          if (typeof publicSettings.enable_uptime === 'boolean') tc.enable_uptime = publicSettings.enable_uptime;
          if (publicSettings.enable_uptime === 'true') tc.enable_uptime = true;
          if (publicSettings.enable_uptime === 'false') tc.enable_uptime = false;
          if (typeof publicSettings.default_theme === 'string' && ['lumina', 'deepspace', 'clean', 'auto'].includes(publicSettings.default_theme as string)) {
            tc.default_theme = publicSettings.default_theme as ThemeConfig['default_theme'];
          }
          if (typeof publicSettings.custom_footer === 'string') tc.custom_footer = publicSettings.custom_footer as string;
          if (typeof publicSettings.enable_privacy_mode === 'boolean') tc.enable_privacy_mode = publicSettings.enable_privacy_mode;
          if (publicSettings.enable_privacy_mode === 'true') tc.enable_privacy_mode = true;
          if (publicSettings.enable_privacy_mode === 'false') tc.enable_privacy_mode = false;
        }

        // Fallback: if default_view references a disabled view, pick first available
        if ((tc.default_view === 'globe' && !tc.enable_globe) ||
            (tc.default_view === 'uptime' && !tc.enable_uptime)) {
          const fallbackOrder: ThemeConfig['default_view'][] = ['grid', 'table', 'globe', 'uptime'];
          tc.default_view = fallbackOrder.find(v => {
            if (v === 'globe') return tc.enable_globe;
            if (v === 'uptime') return tc.enable_uptime;
            return true; // grid & table always enabled
          }) ?? 'grid';
        }

        setConfig({
          isLoggedIn: !!userInfo?.logged_in,
          username: userInfo?.username || '',
          recordPreserveTime: (publicSettings?.record_preserve_time as number) || 720,
          pingRecordPreserveTime: (publicSettings?.ping_record_preserve_time as number) || 48,
          themeConfig: tc,
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
