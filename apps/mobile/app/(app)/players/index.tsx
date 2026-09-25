import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Avatar,
  Button,
  Card,
  FeedbackBanner,
  spacing,
  StatusPill,
} from '@teamizer/ui';

import type { PlayersPage } from '../../../src/api/contracts';
import { profileQueryKeys } from '../../../src/profiles/profile-query-keys';
import { useAppServices } from '../../../src/providers/app-services-context';
import { playerRouteFor } from '../../../src/statistics/statistics';
import { AppScreen } from '../../../src/ui/app-screen';

const PAGE_SIZE = 25;

export default function PlayersIndexRoute() {
  const { apiClient } = useAppServices();
  const { t } = useTranslation();
  const playersQuery = useInfiniteQuery({
    queryKey: profileQueryKeys.list,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiClient.getPlayers({
        limit: PAGE_SIZE,
        status: 'ACTIVE',
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor,
  });
  const players = flattenPlayers(playersQuery.data?.pages);

  return (
    <AppScreen scroll underHeader contentStyle={styles.screen}>
      {playersQuery.isPending ? (
        <Card style={styles.stateCard}>
          <AppText variant="heading">{t('playersIndex.loading')}</AppText>
        </Card>
      ) : null}

      {playersQuery.isError ? (
        <View style={styles.stateCard}>
          <FeedbackBanner
            message={t('common.connectionRetry')}
            title={t('playersIndex.unavailable')}
            tone="error"
          />
          <Button
            label={t('common.retry')}
            onPress={() => void playersQuery.refetch()}
            variant="secondary"
          />
        </View>
      ) : null}

      {playersQuery.isSuccess && players.length === 0 ? (
        <Card style={styles.stateCard}>
          <AppText variant="heading">{t('playersIndex.empty')}</AppText>
          <AppText tone="muted">{t('playersIndex.emptyHint')}</AppText>
        </Card>
      ) : null}

      {playersQuery.isSuccess && players.length > 0 ? (
        <View
          accessibilityLabel={t('playersIndex.listLabel')}
          style={styles.list}
        >
          {players.map((player) => (
            <Pressable
              accessibilityHint={t('playersIndex.openHint')}
              accessibilityLabel={player.name}
              accessibilityRole="button"
              key={player.id}
              onPress={() => router.push(playerRouteFor(player.id))}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Card padding="compact" style={styles.playerCard}>
                <Avatar
                  name={player.name}
                  size="small"
                  url={player.avatarUrl}
                />
                <View style={styles.playerCopy}>
                  <AppText variant="bodyStrong">{player.name}</AppText>
                  <AppText tone="muted" variant="caption">
                    {player.type === 'GUEST'
                      ? t('common.guest')
                      : t('common.regular')}
                  </AppText>
                </View>
                {player.type === 'GUEST' ? (
                  <StatusPill label={t('status.guest')} tone="neutral" />
                ) : null}
              </Card>
            </Pressable>
          ))}
          {playersQuery.hasNextPage ? (
            <Button
              busy={playersQuery.isFetchingNextPage}
              label={t('ranking.loadMore')}
              onPress={() => void playersQuery.fetchNextPage()}
              variant="secondary"
            />
          ) : null}
        </View>
      ) : null}
    </AppScreen>
  );
}

function flattenPlayers(pages: PlayersPage[] | undefined) {
  return pages?.flatMap(({ items }) => items) ?? [];
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  stateCard: { gap: spacing.md },
  list: { gap: spacing.sm },
  playerCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 68,
  },
  playerCopy: { flex: 1, minWidth: 120 },
  pressed: { opacity: 0.72 },
});
