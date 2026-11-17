import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Avatar,
  borderWidths,
  radii,
  spacing,
  useTheme,
} from '@teamizer/ui';

import type { MatchDetail } from '../api/contracts';

type MatchTeamPlayer = MatchDetail['participants']['going'][number];

export function MatchTeamLabels() {
  return (
    <View style={styles.teamColumns}>
      <TeamLabel side="A" />
      <TeamLabel side="B" />
    </View>
  );
}

export function MatchTeamColumns({
  goalsByPlayerId,
  showLabels = true,
  teamAPlayers,
  teamBPlayers,
}: {
  goalsByPlayerId?: ReadonlyMap<string, number>;
  showLabels?: boolean;
  teamAPlayers: MatchTeamPlayer[];
  teamBPlayers: MatchTeamPlayer[];
}) {
  return (
    <View style={styles.teamColumns}>
      <MatchTeamColumn
        goalsByPlayerId={goalsByPlayerId}
        players={teamAPlayers}
        showLabel={showLabels}
        side="A"
      />
      <MatchTeamColumn
        goalsByPlayerId={goalsByPlayerId}
        players={teamBPlayers}
        showLabel={showLabels}
        side="B"
      />
    </View>
  );
}

function MatchTeamColumn({
  goalsByPlayerId,
  players,
  showLabel,
  side,
}: {
  goalsByPlayerId: ReadonlyMap<string, number> | undefined;
  players: MatchTeamPlayer[];
  showLabel: boolean;
  side: 'A' | 'B';
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const sideColors =
    side === 'A'
      ? {
          border: colors.teamABorder,
          surface: colors.teamASurface,
        }
      : {
          border: colors.teamBBorder,
          surface: colors.teamBSurface,
        };

  return (
    <View style={styles.teamColumn}>
      {showLabel ? <TeamLabel side={side} /> : null}
      {players.map((player) => (
        <View
          key={player.id}
          style={[
            styles.teamPlayerTile,
            {
              backgroundColor: sideColors.surface,
              borderColor: sideColors.border,
            },
          ]}
        >
          <Avatar name={player.name} size="small" url={player.avatarUrl} />
          <View style={styles.teamPlayerDetails}>
            <AppText
              numberOfLines={goalsByPlayerId ? 1 : 2}
              style={styles.teamPlayerName}
            >
              {player.name}
            </AppText>
            {goalsByPlayerId ? (
              <AppText numberOfLines={1} tone="muted" variant="caption">
                {t('common.goalCount', {
                  count: goalsByPlayerId.get(player.id) ?? 0,
                })}
              </AppText>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function TeamLabel({ side }: { side: 'A' | 'B' }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.teamLabel}>
      <AppText
        style={{ color: side === 'A' ? colors.teamAText : colors.teamBText }}
        variant="bodyStrong"
      >
        {t('common.team', { side })}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  teamColumns: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  teamColumn: { flex: 1, gap: spacing.xs, minWidth: 0 },
  teamLabel: { flex: 1, minWidth: 0 },
  teamPlayerTile: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: borderWidths.subtle,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 56,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    width: '100%',
  },
  teamPlayerDetails: { flex: 1, gap: spacing.xxs, minWidth: 0 },
  teamPlayerName: { minWidth: 0 },
});
