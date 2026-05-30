/**
 * TallyTracker — Theme Definitions
 *
 * 7 user-selectable color palettes for the app.
 * Each theme provides colors for light and dark modes.
 */

import { COLORS } from './tokens';

export interface ThemeColors {
  // Primary accent
  primary: string;
  primaryLight: string;
  primaryDark: string;

  // Backgrounds
  background: string;
  surface: string;
  surfaceElevated: string;

  // Text
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;

  // Borders
  border: string;
  borderLight: string;

  // Status bar
  statusBar: 'light' | 'dark';

  // Status Colors
  success: string;
  danger: string;
}

export interface Theme {
  name: string;
  light: ThemeColors;
  dark: ThemeColors;
}

const createTheme = (
  name: string,
  primary: string,
  primaryLight: string,
  primaryDark: string
): Theme => ({
  name,
  light: {
    primary,
    primaryLight,
    primaryDark,
    background: '#F9FAFB',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    text: COLORS.gray900,
    textSecondary: COLORS.gray600,
    textMuted: COLORS.gray400,
    textInverse: '#FFFFFF',
    border: COLORS.gray200,
    borderLight: COLORS.gray100,
    statusBar: 'dark',
    success: '#10B981',
    danger: '#EF4444',
  },
  dark: {
    primary,
    primaryLight: primaryDark, // Swap in dark mode
    primaryDark: primaryLight,
    background: '#0F1419',
    surface: '#1A1F2E',
    surfaceElevated: '#242B3D',
    text: '#F0F2F5',
    textSecondary: '#9BA1B0',
    textMuted: '#5C6370',
    textInverse: '#0F1419',
    border: '#2A3144',
    borderLight: '#1E2535',
    statusBar: 'light',
    success: '#10B981',
    danger: '#EF4444',
  },
});

export const THEMES: Record<string, Theme> = {
  default: createTheme('Teal', '#0D9488', '#CCFBF1', '#065F53'),
  professional: createTheme('Slate', '#475569', '#F1F5F9', '#1E293B'),
  ocean: createTheme('Ocean', '#0284C7', '#E0F2FE', '#075985'),
  sunset: createTheme('Sunset', '#D97706', '#FEF3C7', '#92400E'),
  forest: createTheme('Forest', '#059669', '#D1FAE5', '#065F46'),
  plum: createTheme('Plum', '#7C3AED', '#EDE9FE', '#5B21B6'),
  mono: createTheme('Mono', '#525252', '#F5F5F5', '#292929'),
} as const;

export const THEME_KEYS = Object.keys(THEMES) as (keyof typeof THEMES)[];

export const DEFAULT_THEME_KEY = 'default';
export const DEFAULT_COLOR_MODE: 'light' | 'dark' | 'system' = 'system';
