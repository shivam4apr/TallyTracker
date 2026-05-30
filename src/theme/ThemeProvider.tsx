/**
 * TallyTracker — ThemeProvider
 *
 * Provides theme context to the entire app.
 * Supports light/dark/system mode and 7 accent palettes.
 */

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { safeStorage } from '@/utils/safeStorage';
import { Theme, ThemeColors, THEMES, DEFAULT_THEME_KEY, DEFAULT_COLOR_MODE } from './themes';

// ─── Storage Keys ──────────────────────────────────────────────
const STORAGE_KEY_THEME = '@tallytracker/theme';
const STORAGE_KEY_COLOR_MODE = '@tallytracker/colorMode';

// ─── Context Types ─────────────────────────────────────────────
export type ColorMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  /** Current resolved theme colors */
  colors: ThemeColors;
  /** Current theme key (e.g. 'default', 'ocean') */
  themeKey: string;
  /** Current color mode setting */
  colorMode: ColorMode;
  /** Whether dark mode is currently active */
  isDark: boolean;
  /** Change the accent theme */
  setThemeKey: (key: string) => void;
  /** Change the color mode */
  setColorMode: (mode: ColorMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// ─── Provider ──────────────────────────────────────────────────
interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const [themeKey, setThemeKeyState] = useState<string>(DEFAULT_THEME_KEY);
  const [colorMode, setColorModeState] = useState<ColorMode>(DEFAULT_COLOR_MODE);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const [savedTheme, savedMode] = await Promise.all([
          safeStorage.getItem(STORAGE_KEY_THEME),
          safeStorage.getItem(STORAGE_KEY_COLOR_MODE),
        ]);
        if (savedTheme && savedTheme in THEMES) {
          setThemeKeyState(savedTheme);
        }
        if (savedMode && ['light', 'dark', 'system'].includes(savedMode)) {
          setColorModeState(savedMode as ColorMode);
        }
      } catch {
        // Ignore storage errors — use defaults
      } finally {
        setIsLoaded(true);
      }
    };
    loadPreferences();
  }, []);

  // Resolve whether dark mode is active
  const isDark = useMemo(() => {
    if (colorMode === 'system') {
      return systemScheme === 'dark';
    }
    return colorMode === 'dark';
  }, [colorMode, systemScheme]);

  // Get the current theme object
  const theme: Theme = THEMES[themeKey] ?? THEMES[DEFAULT_THEME_KEY]!;
  const colors = isDark ? theme.dark : theme.light;

  // Setters that persist to AsyncStorage
  const setThemeKey = useCallback(async (key: string) => {
    if (key in THEMES) {
      setThemeKeyState(key);
      try {
        await safeStorage.setItem(STORAGE_KEY_THEME, key);
      } catch {
        // Ignore
      }
    }
  }, []);

  const setColorMode = useCallback(async (mode: ColorMode) => {
    setColorModeState(mode);
    try {
      await safeStorage.setItem(STORAGE_KEY_COLOR_MODE, mode);
    } catch {
      // Ignore
    }
  }, []);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      colors,
      themeKey,
      colorMode,
      isDark,
      setThemeKey,
      setColorMode,
    }),
    [colors, themeKey, colorMode, isDark, setThemeKey, setColorMode]
  );

  // Don't render until preferences are loaded
  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
