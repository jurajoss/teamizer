import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Avatar,
  borderWidths,
  radii,
  sizes,
  spacing,
  useTheme,
} from '@teamizer/ui';

export type AvatarStackPlayer = {
  avatarUrl: string | null;
  id: string;
  name: string;
};

export function playerAvatarStackCounts(
  playerCount: number,
  maxVisible: number,
): { hidden: number; visible: number } {
  const visible = Math.min(playerCount, Math.max(0, maxVisible));
  return { hidden: Math.max(0, playerCount - visible), visible };
}

export function PlayerAvatarStack({
  maxVisible = 5,
  players,
}: {
  maxVisible?: number;
  players: AvatarStackPlayer[];
}) {
  const { colors } = useTheme();
  const counts = playerAvatarStackCounts(players.length, maxVisible);
  const visiblePlayers = players.slice(0, counts.visible);

  return (
    <View
      accessibilityLabel={players.map(({ name }) => name).join(', ')}
      style={styles.stack}
    >
      {visiblePlayers.map((player, index) => (
        <View
          key={player.id}
          style={[
            styles.item,
            {
              borderColor: colors.surfaceElevated,
              zIndex: visiblePlayers.length - index,
            },
            index > 0 && styles.overlap,
          ]}
        >
          <Avatar name={player.name} size="small" url={player.avatarUrl} />
        </View>
      ))}
      {counts.hidden > 0 ? (
        <View
          style={[
            styles.overflow,
            styles.overlap,
            {
              backgroundColor: colors.surfaceStrong,
              borderColor: colors.surfaceElevated,
            },
          ]}
        >
          <AppText variant="label">+{counts.hidden}</AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: sizes.avatar.small + borderWidths.emphasized * 2,
  },
  item: {
    borderRadius: radii.pill,
    borderWidth: borderWidths.emphasized,
  },
  overlap: { marginLeft: -spacing.sm },
  overflow: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: borderWidths.emphasized,
    height: sizes.avatar.small + borderWidths.emphasized * 2,
    justifyContent: 'center',
    width: sizes.avatar.small + borderWidths.emphasized * 2,
  },
});
