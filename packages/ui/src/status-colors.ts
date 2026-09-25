import type { ThemeColors } from './theme';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'info' | 'danger';

export type StatusColorSet = {
  background: string;
  border: string;
  foreground: string;
};

export function statusColorSet(
  colors: ThemeColors,
  tone: StatusTone,
): StatusColorSet {
  if (tone === 'success') {
    return {
      background: colors.successSurface,
      border: colors.successBorder,
      foreground: colors.success,
    };
  }

  if (tone === 'warning') {
    return {
      background: colors.warningSurface,
      border: colors.warningBorder,
      foreground: colors.warning,
    };
  }

  if (tone === 'info') {
    return {
      background: colors.infoSurface,
      border: colors.infoBorder,
      foreground: colors.info,
    };
  }

  if (tone === 'danger') {
    return {
      background: colors.dangerSurface,
      border: colors.dangerBorder,
      foreground: colors.danger,
    };
  }

  return {
    background: colors.surfaceSubtle,
    border: colors.border,
    foreground: colors.textSecondary,
  };
}
