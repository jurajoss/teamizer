import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { borderWidths, spacing, type ThemeLinearGradient } from './theme';
import { useTheme } from './theme-provider';

export type TeamTintAccentTone = 'strong' | 'subdued';
export type TeamTintEmphasis = 'prominent' | 'subtle';
export type TeamTintDirection = 'to left' | 'to right';
export type TeamTintEdge = 'left' | 'right';
export type TeamTintSide = 'A' | 'B';

/**
 * A non-interactive semantic team tint for placement behind content in an
 * already clipped surface. The parent remains responsible for its base color,
 * border, radius, and layout.
 */
export function TeamTintBackground({
  direction,
  emphasis,
  side,
  style,
}: {
  direction?: TeamTintDirection;
  emphasis: TeamTintEmphasis;
  side: TeamTintSide;
  style?: StyleProp<ViewStyle>;
}) {
  const { teamSurfaceTints } = useTheme();
  const team = side === 'A' ? teamSurfaceTints.teamA : teamSurfaceTints.teamB;
  const gradient = team[emphasis];
  const resolvedDirection = direction ?? gradient.direction;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.fill, gradientStyle(gradient, resolvedDirection), style]}
    />
  );
}

/**
 * A semantic team accent clipped to the inner curve of an already bordered
 * surface. Keeping the clip separate from the inset tint background lets the
 * accent meet the border without drawing over it.
 */
export function TeamTintAccent({
  edge,
  radius,
  side,
  tone,
}: {
  edge: TeamTintEdge;
  radius: number;
  side: TeamTintSide;
  tone: TeamTintAccentTone;
}) {
  const { colors } = useTheme();
  const color =
    side === 'A'
      ? tone === 'strong'
        ? colors.teamAText
        : colors.teamABorder
      : tone === 'strong'
        ? colors.teamBText
        : colors.teamBBorder;
  const innerRadius = radius - borderWidths.subtle;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.fill, styles.accentClip, { borderRadius: innerRadius }]}
    >
      <View
        style={[
          styles.accentStrip,
          edge === 'left' ? styles.accentLeft : styles.accentRight,
          { backgroundColor: color },
        ]}
      />
    </View>
  );
}

function gradientStyle(
  gradient: ThemeLinearGradient,
  direction: TeamTintDirection,
): ViewStyle {
  if (Platform.OS === 'web') {
    return {
      backgroundImage: `linear-gradient(${direction}, ${gradient.colorStops
        .map(({ color, position }) => `${color} ${position}`)
        .join(', ')})`,
    } as ViewStyle;
  }

  return {
    experimental_backgroundImage: [
      {
        colorStops: gradient.colorStops.map(({ color, position }) => ({
          color,
          positions: [position],
        })),
        direction,
        type: 'linear-gradient',
      },
    ],
  };
}

const styles = StyleSheet.create({
  accentClip: {
    overflow: 'hidden',
  },
  accentLeft: {
    left: 0,
  },
  accentRight: {
    right: 0,
  },
  accentStrip: {
    bottom: 0,
    position: 'absolute',
    top: 0,
    width: spacing.xxs,
  },
  fill: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
