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

  // Update the meta theme-color tag to match the active theme
  const updateThemeColor = useCallback((t: string) => {
    const color = t === 'dark' ? '#131110' : '#FAF7F4';
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (meta) {
      meta.setAttribute('content', color);
    } else {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = color;
      document.head.appendChild(meta);
    }
  }, []);

  // Read stored theme on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('theme') || 'light';
      setThemeState(stored);
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(stored);
      updateThemeColor(stored);
    } catch {}
  }, [updateThemeColor]);

  const setTheme = useCallback((newTheme: string) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('theme', newTheme);
    } catch {}
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(newTheme);
    updateThemeColor(newTheme);
  }, [updateThemeColor]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
