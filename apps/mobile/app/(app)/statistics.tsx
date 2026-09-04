import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  AppText,
  Avatar,
  BrandLockup,
  Button,
  colors,
  FeedbackBanner,
  layout,
  radii,
  spacing,
  StatusPill,
  Surface,
} from '@teamizer/ui';

import type { RankingRow } from '../../src/api/contracts';
import { useAppServices } from '../../src/providers/app-services-context';
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
      <View style={styles.heading}>
        <StatusPill label="STATISTICS" />
        <View style={styles.headingCopy}>
          <AppText accessibilityRole="header" variant="title">
            Player ranking.
          </AppText>
          <AppText tone="muted">
            Authoritative results from finished Matches, ordered by win rate and
            the approved tie-breakers.
          </AppText>
        </View>
      </View>

      {viewState === 'loading' ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="heading">Loading ranking…</AppText>
          <AppText tone="muted">
            Calculating the latest finished results.
          </AppText>
        </Surface>
      ) : null}

      {viewState === 'error' ? (
        <View style={styles.stateCard}>
          <FeedbackBanner
            tone="error"
            title="Ranking unavailable"
            message="Check your connection and try again."
          />
          <Button
            label="Try again"
            onPress={() => void rankingQuery.refetch()}
            variant="secondary"
          />
        </View>
      ) : null}

      {viewState === 'empty' ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="heading">No Players to rank</AppText>
          <AppText tone="muted">
            Active Players will appear here, including Players whose first Match
            has not finished yet.
          </AppText>
        </Surface>
      ) : null}

      {viewState === 'success' ? (
        <View accessibilityLabel="Player ranking" style={styles.list}>
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
              label="Load more Players"
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
    <AppScreen scroll contentStyle={styles.screen}>
      <View style={styles.topBar}>
        <BrandLockup compact />
        <Button
          fullWidth={false}
          label="Back"
          onPress={() => returnHome()}
          variant="ghost"
        />
      </View>
      {children}
    </AppScreen>
  );
}

function RankingListRow({ row, onOpen }: { row: RankingRow; onOpen(): void }) {
  return (
    <Pressable
      accessibilityHint="Opens Player statistics and recent Matches"
      accessibilityLabel={`${row.rank}. ${row.player.name}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => [
        styles.rankingRow,
        pressed && styles.rankingRowPressed,
      ]}
    >
      <View style={styles.rankBadge}>
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
            <StatusPill label="GUEST" tone="neutral" />
          ) : null}
        </View>
        <View style={styles.metrics}>
          <Metric
            label="Win rate"
            value={formatWinRate(row.statistics.winRate)}
          />
          <Metric label="Matches" value={String(row.statistics.matches)} />
          <Metric
            label="Goals / Match"
            value={formatGoalsPerMatch(row.statistics.goalsPerMatch)}
          />
          <Metric label="Goals" value={String(row.statistics.goals)} />
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

function returnHome(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

const styles = StyleSheet.create({
  screen: { gap: spacing.xxl },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heading: { gap: spacing.lg, marginTop: spacing.lg },
  headingCopy: { gap: spacing.sm, maxWidth: 620 },
  stateCard: { gap: spacing.md },
  list: { gap: spacing.sm },
  rankingRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 104,
    padding: spacing.md,
  },
  rankingRowPressed: { backgroundColor: colors.brandSoft },
  rankBadge: {
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    minWidth: layout.minimumTouchTarget,
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
