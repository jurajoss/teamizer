import type { ComponentProps, ReactNode } from 'react';
import { Text } from 'react-native';

import { typography } from './theme';
import { useTheme } from './theme-provider';

export type TextVariant = keyof typeof typography;
export type TextTone = 'default' | 'muted' | 'subtle' | 'brand' | 'error';

export function AppText({
  children,
  variant = 'body',
  tone = 'default',
  style,
  ...props
}: ComponentProps<typeof Text> & {
  children: ReactNode;
  variant?: TextVariant;
  tone?: TextTone;
}) {
  const { colors } = useTheme();
  const toneColor = {
    default: colors.textPrimary,
    muted: colors.textSecondary,
    subtle: colors.textSubtle,
    brand: colors.accent,
    error: colors.danger,
  }[tone];

  return (
    <Text {...props} style={[typography[variant], { color: toneColor }, style]}>
      {children}
    </Text>
  );
}
