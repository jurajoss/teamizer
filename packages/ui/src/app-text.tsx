import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { colors, typography } from './theme';

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
  return (
    <Text {...props} style={[typography[variant], toneStyles[tone], style]}>
      {children}
    </Text>
  );
}

const toneStyles = StyleSheet.create({
  default: { color: colors.ink },
  muted: { color: colors.inkMuted },
  subtle: { color: colors.inkSubtle },
  brand: { color: colors.brand },
  error: { color: colors.error },
});
