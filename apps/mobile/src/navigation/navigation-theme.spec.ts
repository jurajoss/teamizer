import { describe, expect, it, vi } from 'vitest';

import type { AppTheme } from '@teamizer/ui';

vi.mock('expo-router', () => ({
  DarkTheme: baseNavigationTheme(true),
  DefaultTheme: baseNavigationTheme(false),
}));

import { navigationThemeFor } from './navigation-theme';

describe('native navigation theme', () => {
  it.each([teamizerTheme('light'), teamizerTheme('dark')])(
    'matches Teamizer $mode appearance and semantic header colors',
    (theme) => {
      const navigationTheme = navigationThemeFor(theme);

      expect(navigationTheme).toMatchObject({
        dark: theme.mode === 'dark',
        colors: {
          background: theme.colors.background,
          border: theme.colors.border,
          card: theme.colors.background,
          notification: theme.colors.accent,
          primary: theme.colors.accent,
          text: theme.colors.textPrimary,
        },
      });
    },
  );
});

function teamizerTheme(mode: AppTheme['mode']): AppTheme {
  return {
    colors: {
      accent: `${mode}-accent`,
      background: `${mode}-background`,
      border: `${mode}-border`,
      textPrimary: `${mode}-text`,
    },
    mode,
  } as AppTheme;
}

function baseNavigationTheme(dark: boolean) {
  return {
    colors: {
      background: 'base-background',
      border: 'base-border',
      card: 'base-card',
      notification: 'base-notification',
      primary: 'base-primary',
      text: 'base-text',
    },
    dark,
    fonts: {},
  };
}
