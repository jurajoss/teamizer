import { useInfiniteQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Button,
  Card,
  FeedbackBanner,
  spacing,
  useResponsiveLayout,
} from '@teamizer/ui';

import { matchRouteFor } from '../matches/match-flow';
import { usePreferences } from '../preferences/preferences-context';
import { useAppServices } from '../providers/app-services-context';
import { AppScreen } from '../ui/app-screen';
import { PlayerHistoryMatchRow } from './player-history-match-row';
import { statisticsQueryKeys } from './statistics-query-keys';
import { historyRows } from './statistics';

const historyPageSize = 20;

export function PlayerMatchHistoryScreen() {
  const { apiClient } = useAppServices();
  const { language } = usePreferences();
  const { mode, width } = useResponsiveLayout();
  const { t } = useTranslation();
  const parameters = useLocalSearchParams<{
    playerId?: string | string[];
  }>();
  const playerId =
    typeof parameters.playerId === 'string' ? parameters.playerId : null;
  const historyQuery = useInfiniteQuery({
    queryKey: statisticsQueryKeys.history(playerId ?? 'invalid'),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiClient.getPlayerMatchHistory(playerId ?? '', {
        limit: historyPageSize,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor,
    enabled: playerId !== null,
  });
  const matches = historyRows(historyQuery.data?.pages);

  return (
    <AppScreen scroll underHeader contentStyle={styles.screen}>
      {!playerId ? (
        <FeedbackBanner
          message={t('playerDetail.missingId')}
          title={t('playerDetail.unavailable')}
          tone="error"
        />
      ) : null}
      {playerId && historyQuery.isPending ? (
        <AppText tone="muted">{t('playerDetail.historyLoading')}</AppText>
      ) : null}
      {playerId && historyQuery.isError ? (
        <View style={styles.state}>
          <FeedbackBanner
            message={t('playerDetail.historyError')}
            title={t('playerDetail.historyUnavailable')}
            tone="error"
          />
          <Button
            label={t('common.retry')}
            onPress={() => void historyQuery.refetch()}
            variant="secondary"
          />
        </View>
      ) : null}
      {playerId && historyQuery.isSuccess && matches.length === 0 ? (
        <AppText tone="muted">{t('playerDetail.noHistory')}</AppText>
      ) : null}
      {playerId && historyQuery.isSuccess && matches.length > 0 ? (
        <Card
          accessibilityLabel={t('playerDetail.historyListLabel')}
          padding="compact"
          style={styles.list}
        >
          {matches.map((match) => (
            <PlayerHistoryMatchRow
              key={match.id}
              language={language}
              match={match}
              mode={mode}
              viewportWidth={width}
              onOpen={() => router.push(matchRouteFor(match.id))}
            />
          ))}
          {historyQuery.hasNextPage ? (
            <Button
              busy={historyQuery.isFetchingNextPage}
              disabled={historyQuery.isFetchingNextPage}
              label={t('playerDetail.loadMore')}
              onPress={() => void historyQuery.fetchNextPage()}
              variant="secondary"
            />
          ) : null}
        </Card>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  state: { gap: spacing.md },
  list: { gap: spacing.xxs },
});
