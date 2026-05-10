import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';

/** Visual themes that map to actual CSS styling */
export type VisualTheme = 'lumina' | 'deepspace' | 'clean';

/** User-selectable appearance preference (includes "auto" which follows system) */
export type Theme = VisualTheme | 'auto';

interface ThemeContextType {
  /** The user's stored preference (may be "auto") */
  theme: Theme;
  /** The actually-applied visual theme (never "auto") */
  resolvedTheme: VisualTheme;
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = 'appearance';
const VALID_THEMES: Theme[] = ['lumina', 'deepspace', 'clean', 'auto'];

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && VALID_THEMES.includes(saved as Theme)) {
      return saved as Theme;
    }
    const legacy = localStorage.getItem('komari-theme');
    if (legacy === 'night') {
      return 'deepspace';
    }
  } catch {
    // localStorage not available
  }
  return 'clean';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );

  // Listen for system color-scheme changes (only relevant when theme === 'auto')
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: VisualTheme = useMemo(() => {
    if (theme === 'auto') {
      return systemDark ? 'deepspace' : 'lumina';
    }
    return theme;
  }, [theme, systemDark]);

  useEffect(() => {
    const root = document.documentElement;

    // Clear old attributes
    root.removeAttribute('data-theme');
    root.classList.remove('dark');

    if (resolvedTheme === 'deepspace') {
      root.setAttribute('data-theme', 'deepspace');
      root.classList.add('dark');
    } else if (resolvedTheme === 'clean') {
      root.setAttribute('data-theme', 'clean');
    }
    // lumina uses default :root, no attribute needed

    // Persist preference
    localStorage.setItem(STORAGE_KEY, theme);

    try {
      localStorage.removeItem('komari-theme');
    } catch {
      // ignore
    }
  }, [theme, resolvedTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
