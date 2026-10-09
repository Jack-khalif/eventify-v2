import { createContext, useContext } from 'react';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'eventify-theme';

/** The visitor's own choice, if they have used the toggle on this device. */
export function storedTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Storage can be blocked (private mode); treat it as no choice made.
  }
  return null;
}

/**
 * Stored choice first, then the device's own setting, and dark when the device doesn't say.
 * index.html runs the same logic before React loads to avoid a flash.
 */
export function initialTheme(): Theme {
  const stored = storedTheme();
  if (stored) return stored;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export type ThemeContextValue = { theme: Theme; toggleTheme: () => void };

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}
