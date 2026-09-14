import { StyleSheet, View } from 'react-native';

import { AppText } from './app-text';
import { radii, spacing } from './theme';
import { useTheme } from './theme-provider';

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();
  const markSize = compact ? 38 : 52;

  return (
    <View
      accessibilityLabel="Teamizer"
      accessibilityRole="text"
      style={styles.lockup}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.mark,
          {
            backgroundColor: colors.accent,
            height: markSize,
            width: markSize,
            borderRadius: compact ? 12 : 16,
          },
        ]}
      >
        <View
          style={[styles.midfield, { backgroundColor: colors.accentContrast }]}
        />
        <View
          style={[
            styles.player,
            styles.playerA,
            { backgroundColor: colors.accentContrast },
          ]}
        />
        <View
          style={[
            styles.player,
            styles.playerB,
            { backgroundColor: colors.accentContrast },
          ]}
        />
      </View>
      <AppText variant={compact ? 'heading' : 'title'}>Teamizer</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  mark: {
    overflow: 'hidden',
    position: 'relative',
  },
  midfield: {
    bottom: 8,
    left: '50%',
    opacity: 0.58,
    position: 'absolute',
    top: 8,
    width: 1,
  },
  player: {
    borderRadius: radii.pill,
    height: 8,
    position: 'absolute',
    width: 8,
  },
  playerA: { left: 10, top: 12 },
  playerB: { bottom: 12, right: 10 },
});
