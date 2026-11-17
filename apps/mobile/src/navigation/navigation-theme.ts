import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

import type { AppTheme } from '@teamizer/ui';

export function navigationThemeFor(
  theme: Pick<AppTheme, 'colors' | 'mode'>,
): Theme {
  const base = theme.mode === 'dark' ? DarkTheme : DefaultTheme;

  return {
    ...base,
    colors: {
      ...base.colors,
      background: theme.colors.background,
      border: theme.colors.border,
      card: theme.colors.background,
      notification: theme.colors.accent,
      primary: theme.colors.accent,
      text: theme.colors.textPrimary,
    },
  };
}
