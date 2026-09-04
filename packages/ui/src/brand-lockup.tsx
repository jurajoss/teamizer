import { StyleSheet, View } from 'react-native';

import { AppText } from './app-text';
import { colors, radii, spacing } from './theme';

export function BrandLockup({ compact = false }: { compact?: boolean }) {
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
            height: markSize,
            width: markSize,
            borderRadius: compact ? 12 : 16,
          },
        ]}
      >
        <View style={styles.midfield} />
        <View style={[styles.player, styles.playerA]} />
        <View style={[styles.player, styles.playerB]} />
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
    backgroundColor: colors.brand,
    overflow: 'hidden',
    position: 'relative',
  },
  midfield: {
    backgroundColor: 'rgba(255,255,255,0.58)',
    bottom: 8,
    left: '50%',
    position: 'absolute',
    top: 8,
    width: 1,
  },
  player: {
    backgroundColor: colors.onBrand,
    borderRadius: radii.pill,
    height: 8,
    position: 'absolute',
    width: 8,
  },
  playerA: { left: 10, top: 12 },
  playerB: { bottom: 12, right: 10 },
});
