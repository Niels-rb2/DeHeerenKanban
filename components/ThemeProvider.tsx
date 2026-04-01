'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface ThemeContextValue {
  theme: string;
  setTheme: (theme: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState('light');

  // Read stored theme on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('theme') || 'light';
      setThemeState(stored);
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(stored);
    } catch {}
  }, []);

  const setTheme = useCallback((newTheme: string) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('theme', newTheme);
    } catch {}
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(newTheme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
