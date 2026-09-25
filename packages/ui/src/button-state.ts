import type { ThemeColors } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export type ButtonVisualState = 'default' | 'pressed' | 'disabled';

export type ButtonColorSet = {
  background: string;
  border: string;
  foreground: string;
};

export function buttonColorSet(
  colors: ThemeColors,
  variant: ButtonVariant,
  state: ButtonVisualState,
): ButtonColorSet {
  if (state === 'disabled') {
    return variant === 'ghost'
      ? {
          background: 'transparent',
          border: 'transparent',
          foreground: colors.textDisabled,
        }
      : {
          background: colors.disabledSurface,
          border: colors.borderDisabled,
          foreground: colors.textDisabled,
        };
  }

  if (variant === 'primary') {
    return {
      background: state === 'pressed' ? colors.accentPressed : colors.accent,
      border: state === 'pressed' ? colors.accentPressed : colors.accent,
      foreground: colors.accentContrast,
    };
  }

  if (variant === 'secondary') {
    return {
      background: state === 'pressed' ? colors.accentSoft : colors.surface,
      border: colors.borderStrong,
      foreground: colors.accent,
    };
  }

  if (variant === 'destructive') {
    return {
      background:
        state === 'pressed'
          ? colors.dangerSurfacePressed
          : colors.dangerSurface,
      border: colors.dangerBorder,
      foreground: colors.danger,
    };
  }

  return {
    background: state === 'pressed' ? colors.surfaceSubtle : 'transparent',
    border: 'transparent',
    foreground: colors.textSecondary,
  };
}
