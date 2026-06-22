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
  /** Name of the central hub node for globe-view arcs. Always the original
   *  (pre-privacy-mask) node name — the matching is done before names are
   *  replaced. Empty string disables arcs. */
  globe_hub_node: string;
  /** Default globe rotation behaviour. `dynamic` auto-rotates on load;
   *  `static` stays still until the viewer starts rotation via the on-page
   *  control (manual drag always works regardless). */
  globe_mode: 'dynamic' | 'static';
  /** When true, viewers with `prefers-reduced-motion: reduce` see a static
   *  globe (auto-rotation disabled, manual drag still works). When false
   *  (default), the globe always auto-rotates regardless of the visitor's
   *  system motion preference. */
  globe_respect_reduced_motion: boolean;
}

const defaultThemeConfig: ThemeConfig = {
  default_view: 'globe',
  enable_globe: true,
  enable_uptime: true,
  default_theme: 'clean',
  custom_footer: '',
  enable_privacy_mode: false,
  globe_hub_node: '',
  globe_mode: 'dynamic',
  globe_respect_reduced_motion: false,
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

        // Parse theme configuration from public settings.
        //
        // Newer Komari builds nest every managed theme value inside a
        // `theme_settings` object (sometimes serialized as a JSON string),
        // while older builds expose the same keys at the top level. Read
        // from the nested source when available and fall back to the flat
        // shape so both backends keep working.
        const tc: ThemeConfig = { ...defaultThemeConfig };
        if (publicSettings) {
          let themeSettings: Record<string, unknown> = {};
          const rawTs = publicSettings.theme_settings;
          if (rawTs && typeof rawTs === 'object' && !Array.isArray(rawTs)) {
            themeSettings = rawTs as Record<string, unknown>;
          } else if (typeof rawTs === 'string' && rawTs.trim()) {
            try {
              const parsed = JSON.parse(rawTs);
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                themeSettings = parsed as Record<string, unknown>;
              }
            } catch {
              // ignore — fall back to flat keys
            }
          }
          const pick = (key: string): unknown =>
            themeSettings[key] !== undefined ? themeSettings[key] : publicSettings[key];

          const dv = pick('default_view');
          if (typeof dv === 'string' && ['globe', 'grid', 'table', 'uptime'].includes(dv)) {
            tc.default_view = dv as ThemeConfig['default_view'];
          }
          const eg = pick('enable_globe');
          if (typeof eg === 'boolean') tc.enable_globe = eg;
          if (eg === 'true') tc.enable_globe = true;
          if (eg === 'false') tc.enable_globe = false;
          const eu = pick('enable_uptime');
          if (typeof eu === 'boolean') tc.enable_uptime = eu;
          if (eu === 'true') tc.enable_uptime = true;
          if (eu === 'false') tc.enable_uptime = false;
          const dt = pick('default_theme');
          if (typeof dt === 'string' && ['lumina', 'deepspace', 'clean', 'auto'].includes(dt)) {
            tc.default_theme = dt as ThemeConfig['default_theme'];
          }
          const cf = pick('custom_footer');
          if (typeof cf === 'string') tc.custom_footer = cf;
          const epm = pick('enable_privacy_mode');
          if (typeof epm === 'boolean') tc.enable_privacy_mode = epm;
          if (epm === 'true') tc.enable_privacy_mode = true;
          if (epm === 'false') tc.enable_privacy_mode = false;
          const ghn = pick('globe_hub_node');
          if (typeof ghn === 'string') tc.globe_hub_node = ghn.trim();
          const ggm = pick('globe_mode');
          if (typeof ggm === 'string' && ['dynamic', 'static'].includes(ggm)) {
            tc.globe_mode = ggm as ThemeConfig['globe_mode'];
          }
          const grrm = pick('globe_respect_reduced_motion');
          if (typeof grrm === 'boolean') tc.globe_respect_reduced_motion = grrm;
          if (grrm === 'true') tc.globe_respect_reduced_motion = true;
          if (grrm === 'false') tc.globe_respect_reduced_motion = false;
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
