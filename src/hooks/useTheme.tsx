import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'lumina' | 'deepspace' | 'clean';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = 'appearance';
const VALID_THEMES: Theme[] = ['lumina', 'deepspace', 'clean'];

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
  return 'lumina';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;

    // Clear old attributes
    root.removeAttribute('data-theme');
    root.classList.remove('dark');

    if (theme === 'deepspace') {
      root.setAttribute('data-theme', 'deepspace');
      root.classList.add('dark');
    } else if (theme === 'clean') {
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
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
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
