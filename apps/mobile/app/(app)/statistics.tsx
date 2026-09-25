import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Avatar,
  Button,
  FeedbackBanner,
  radii,
  sizes,
  spacing,
  StatusPill,
  Surface,
  useTheme,
} from '@teamizer/ui';

import type { RankingRow } from '../../src/api/contracts';
import { useAppServices } from '../../src/providers/app-services-context';
import { usePreferences } from '../../src/preferences/preferences-context';
import { statisticsQueryKeys } from '../../src/statistics/statistics-query-keys';
import {
  formatGoalsPerMatch,
  formatWinRate,
  playerRouteFor,
  rankingRows,
  statisticsViewState,
} from '../../src/statistics/statistics';
import { AppScreen } from '../../src/ui/app-screen';

const PAGE_SIZE = 25;

export default function StatisticsRoute() {
  const { t } = useTranslation();
  const { apiClient } = useAppServices();
  const rankingQuery = useInfiniteQuery({
    queryKey: statisticsQueryKeys.rankings,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiClient.getRankings({
        limit: PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor,
  });
  const rows = rankingRows(rankingQuery.data?.pages);
  const viewState = statisticsViewState(
    rankingQuery.isPending,
    rankingQuery.isError,
    rows.length,
  );

  return (
    <StatisticsPageFrame>
      {viewState === 'loading' ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="heading">{t('ranking.loading')}</AppText>
        </Surface>
      ) : null}

      {viewState === 'error' ? (
        <View style={styles.stateCard}>
          <FeedbackBanner
            tone="error"
            title={t('ranking.unavailable')}
            message={t('common.connectionRetry')}
          />
          <Button
            label={t('common.retry')}
            onPress={() => void rankingQuery.refetch()}
            variant="secondary"
          />
        </View>
      ) : null}

      {viewState === 'empty' ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="heading">{t('ranking.empty')}</AppText>
          <AppText tone="muted">{t('ranking.emptyHint')}</AppText>
        </Surface>
      ) : null}

      {viewState === 'success' ? (
        <View accessibilityLabel={t('ranking.listLabel')} style={styles.list}>
          {rows.map((row) => (
            <RankingListRow
              key={row.player.id}
              row={row}
              onOpen={() => router.push(playerRouteFor(row.player.id))}
            />
          ))}
          {rankingQuery.hasNextPage ? (
            <Button
              busy={rankingQuery.isFetchingNextPage}
              label={t('ranking.loadMore')}
              onPress={() => void rankingQuery.fetchNextPage()}
              variant="secondary"
            />
          ) : null}
        </View>
      ) : null}
    </StatisticsPageFrame>
  );
}

function StatisticsPageFrame({ children }: { children: React.ReactNode }) {
  return (
    <AppScreen scroll underHeader contentStyle={styles.screen}>
      {children}
    </AppScreen>
  );
}

function RankingListRow({ row, onOpen }: { row: RankingRow; onOpen(): void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { language } = usePreferences();
  return (
    <Pressable
      accessibilityHint={t('ranking.openHint')}
      accessibilityLabel={`${row.rank}. ${row.player.name}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => [
        styles.rankingRow,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        pressed && { backgroundColor: colors.accentSoft },
      ]}
    >
      <View style={[styles.rankBadge, { backgroundColor: colors.accentSoft }]}>
        <AppText variant="heading" tone="brand">
          {row.rank}
        </AppText>
      </View>
      <Avatar name={row.player.name} size="small" url={row.player.avatarUrl} />
      <View style={styles.rowContent}>
        <View style={styles.identityLine}>
          <AppText variant="bodyStrong" style={styles.playerName}>
            {row.player.name}
          </AppText>
          {row.player.type === 'GUEST' ? (
            <StatusPill label={t('status.guest')} tone="neutral" />
          ) : null}
        </View>
        <View style={styles.metrics}>
          <Metric
            label={t('common.winRate')}
            value={formatWinRate(row.statistics.winRate, language)}
          />
          <Metric
            label={t('common.matches')}
            value={String(row.statistics.matches)}
          />
          <Metric
            label={t('common.goalsPerMatch')}
            value={formatGoalsPerMatch(row.statistics.goalsPerMatch, language)}
          />
          <Metric
            label={t('common.goals')}
            value={String(row.statistics.goals)}
          />
        </View>
      </View>
      <AppText accessibilityElementsHidden tone="subtle" variant="heading">
        ›
      </AppText>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <AppText variant="bodyStrong">{value}</AppText>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  stateCard: { gap: spacing.md },
  list: { gap: spacing.sm },
  rankingRow: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 104,
    padding: spacing.md,
  },
  rankBadge: {
    alignItems: 'center',
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: sizes.minimumTouchTarget,
    minWidth: sizes.minimumTouchTarget,
    paddingHorizontal: spacing.xs,
  },
  rowContent: { flex: 1, gap: spacing.sm },
  identityLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  playerName: { flexShrink: 1 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  metric: { minWidth: 58 },
});
