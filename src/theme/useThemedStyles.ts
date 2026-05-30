/**
 * TallyTracker — useThemedStyles Hook
 *
 * Custom hook to generate stylesheets that adapt to the current theme colors.
 * Memoizes the created stylesheet so it is only recreated when colors change.
 */

import { useMemo } from 'react';
import { ThemeColors } from './themes';
import { useTheme } from './ThemeProvider';

export function useThemedStyles<T>(
  styleFactory: (colors: ThemeColors) => T
): T {
  const { colors } = useTheme();
  
  // We use useMemo to cache the stylesheet, only recreating it when the theme colors change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => styleFactory(colors), [colors]);
}
