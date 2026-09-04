import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  AppText,
  Avatar,
  BrandLockup,
  Button,
  colors,
  FeedbackBanner,
  radii,
  spacing,
  StatusPill,
  Surface,
} from '@teamizer/ui';

import { ApiClientError } from '../../../src/api/authenticated-api-client';
import type {
  PlayerDetail,
  PlayerMatchHistoryItem,
} from '../../../src/api/contracts';
import {
  formatMatchDate,
  matchRouteFor,
} from '../../../src/matches/match-flow';
import { useAppServices } from '../../../src/providers/app-services-context';
import { statisticsQueryKeys } from '../../../src/statistics/statistics-query-keys';
import {
  formatGoalsPerMatch,
  formatWinRate,
  historyRows,
  statisticsViewState,
} from '../../../src/statistics/statistics';
import { AppScreen } from '../../../src/ui/app-screen';

const PAGE_SIZE = 10;

export default function PlayerDetailRoute() {
  const parameters = useLocalSearchParams<{
    playerId?: string | string[];
  }>();
  const playerId =
    typeof parameters.playerId === 'string' ? parameters.playerId : null;
  const { apiClient } = useAppServices();
  const detailQuery = useQuery({
    queryKey: statisticsQueryKeys.player(playerId ?? 'invalid'),
    queryFn: () => apiClient.getPlayerDetail(playerId ?? ''),
    enabled: playerId !== null,
  });
  const historyQuery = useInfiniteQuery({
    queryKey: statisticsQueryKeys.history(playerId ?? 'invalid'),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiClient.getPlayerMatchHistory(playerId ?? '', {
        limit: PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor,
    enabled: playerId !== null,
  });

  if (!playerId) {
    return (
      <PlayerPageFrame>
        <FeedbackBanner
          tone="error"
          title="Player unavailable"
          message="This Player link is missing a valid Player ID."
        />
      </PlayerPageFrame>
    );
  }

  if (detailQuery.isPending) {
    return (
      <PlayerPageFrame>
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="heading">Loading Player…</AppText>
          <AppText tone="muted">
            Checking authoritative statistics and recent results.
          </AppText>
        </Surface>
      </PlayerPageFrame>
    );
  }

  if (detailQuery.isError) {
    const notFound =
      detailQuery.error instanceof ApiClientError &&
      detailQuery.error.status === 404;
    return (
      <PlayerPageFrame>
        <FeedbackBanner
          tone="error"
          title={notFound ? 'Player unavailable' : 'Player could not load'}
          message={
            notFound
              ? 'This Player does not exist.'
              : 'Check your connection and try again.'
          }
        />
        {!notFound ? (
          <Button
            label="Try again"
            onPress={() => void detailQuery.refetch()}
            variant="secondary"
          />
        ) : null}
      </PlayerPageFrame>
    );
  }

  return (
    <PlayerPageFrame>
      <PlayerHeading player={detailQuery.data} />
      <StatisticsSummary player={detailQuery.data} />
      <MatchHistory
        error={historyQuery.isError}
        fetchingMore={historyQuery.isFetchingNextPage}
        hasMore={historyQuery.hasNextPage}
        loading={historyQuery.isPending}
        matches={historyRows(historyQuery.data?.pages)}
        onLoadMore={() => void historyQuery.fetchNextPage()}
        onRetry={() => void historyQuery.refetch()}
      />
    </PlayerPageFrame>
  );
}

function PlayerPageFrame({ children }: { children: React.ReactNode }) {
  return (
    <AppScreen scroll contentStyle={styles.screen}>
      <View style={styles.topBar}>
        <BrandLockup compact />
        <Button
          fullWidth={false}
          label="Back"
          onPress={() => returnToRanking()}
          variant="ghost"
        />
      </View>
      {children}
    </AppScreen>
  );
}

function PlayerHeading({ player }: { player: PlayerDetail }) {
  return (
    <View style={styles.heading}>
      <Avatar name={player.name} size="large" url={player.avatarUrl} />
      <View style={styles.headingCopy}>
        <View style={styles.headingPills}>
          <StatusPill
            label={player.status}
            tone={player.status === 'ACTIVE' ? 'success' : 'neutral'}
          />
          {player.type === 'GUEST' ? (
            <StatusPill label="GUEST" tone="neutral" />
          ) : null}
        </View>
        <AppText accessibilityRole="header" variant="title">
          {player.name}
        </AppText>
        <AppText tone="muted">Performance from completed Matches only.</AppText>
      </View>
    </View>
  );
}

function StatisticsSummary({ player }: { player: PlayerDetail }) {
  const { statistics } = player;
  const metrics = [
    ['Matches', String(statistics.matches)],
    ['Win rate', formatWinRate(statistics.winRate)],
    ['Wins', String(statistics.wins)],
    ['Draws', String(statistics.draws)],
    ['Losses', String(statistics.losses)],
    ['Goals', String(statistics.goals)],
    ['Goals / Match', formatGoalsPerMatch(statistics.goalsPerMatch)],
  ] as const;

  return (
    <Surface style={styles.summary}>
      <View style={styles.sectionHeading}>
        <AppText variant="eyebrow" tone="brand">
          PERFORMANCE
        </AppText>
        <AppText variant="heading">Career statistics</AppText>
      </View>
      <View style={styles.summaryGrid}>
        {metrics.map(([label, value]) => (
          <View key={label} style={styles.summaryMetric}>
            <AppText variant="title">{value}</AppText>
            <AppText variant="caption" tone="muted">
              {label}
            </AppText>
          </View>
        ))}
      </View>
    </Surface>
  );
}

function MatchHistory({
  error,
  fetchingMore,
  hasMore,
  loading,
  matches,
  onLoadMore,
  onRetry,
}: {
  error: boolean;
  fetchingMore: boolean;
  hasMore: boolean;
  loading: boolean;
  matches: PlayerMatchHistoryItem[];
  onLoadMore(): void;
  onRetry(): void;
}) {
  const state = statisticsViewState(loading, error, matches.length);

  return (
    <View style={styles.historySection}>
      <View style={styles.sectionHeading}>
        <AppText variant="eyebrow" tone="brand">
          RECENT MATCHES
        </AppText>
        <AppText variant="heading">Finished-Match history</AppText>
      </View>

      {state === 'loading' ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="bodyStrong">Loading Match history…</AppText>
          <AppText tone="muted">Reading completed results.</AppText>
        </Surface>
      ) : null}
      {state === 'error' ? (
        <View style={styles.stateCard}>
          <FeedbackBanner
            tone="error"
            title="History unavailable"
            message="The Player statistics loaded, but recent Matches did not."
          />
          <Button label="Try again" onPress={onRetry} variant="secondary" />
        </View>
      ) : null}
      {state === 'empty' ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="bodyStrong">No finished Matches yet</AppText>
          <AppText tone="muted">
            Win rate and goals per Match remain N/A until the first result.
          </AppText>
        </Surface>
      ) : null}
      {state === 'success' ? (
        <View style={styles.matchList}>
          {matches.map((match) => (
            <HistoryCard key={match.id} match={match} />
          ))}
          {hasMore ? (
            <Button
              busy={fetchingMore}
              label="Load more Matches"
              onPress={onLoadMore}
              variant="secondary"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function HistoryCard({ match }: { match: PlayerMatchHistoryItem }) {
  const { width } = useWindowDimensions();
  const goals = new Map(
    match.playerGoals.map(({ playerId, goals }) => [playerId, goals]),
  );
  const teams = [...match.teams].sort((first, second) =>
    first.side < second.side ? -1 : 1,
  );
  const resultLabel =
    match.subjectResult === 'WIN'
      ? 'WIN'
      : match.subjectResult === 'LOSS'
        ? 'LOSS'
        : 'DRAW';

  return (
    <Surface style={styles.historyCard}>
      <View style={styles.historyTopline}>
        <View style={styles.matchMeta}>
          <AppText variant="bodyStrong">{match.sport.name}</AppText>
          <AppText variant="caption" tone="muted">
            {formatMatchDate(match.startsAt)}
            {match.location ? ` · ${match.location}` : ''}
          </AppText>
        </View>
        <StatusPill
          label={resultLabel}
          tone={resultLabel === 'WIN' ? 'success' : 'neutral'}
        />
      </View>

      <View
        accessibilityLabel={`Final score Team A ${match.score.teamA}, Team B ${match.score.teamB}`}
        style={styles.finalScore}
      >
        <AppText variant="eyebrow" tone="muted">
          FINAL
        </AppText>
        <AppText variant="title">
          Team A {match.score.teamA}–{match.score.teamB} Team B
        </AppText>
        <AppText variant="caption" tone="muted">
          Player goals: {match.subjectGoals}
        </AppText>
      </View>

      <View style={[styles.teams, width >= 700 && styles.teamsTablet]}>
        {teams.map((team) => (
          <View key={team.id} style={styles.team}>
            <View
              style={[
                styles.teamLabel,
                team.side === 'A' ? styles.teamALabel : styles.teamBLabel,
              ]}
            >
              <AppText variant="label">Team {team.side}</AppText>
            </View>
            {team.players.map((player) => (
              <View key={player.id} style={styles.playerRow}>
                <Avatar
                  name={player.name}
                  size="small"
                  url={player.avatarUrl}
                />
                <View style={styles.playerIdentity}>
                  <AppText variant="bodyStrong">{player.name}</AppText>
                  {player.type === 'GUEST' ? (
                    <AppText variant="caption" tone="muted">
                      Guest
                    </AppText>
                  ) : null}
                </View>
                <AppText variant="caption" tone="muted">
                  {goals.get(player.id) ?? 0}{' '}
                  {(goals.get(player.id) ?? 0) === 1 ? 'goal' : 'goals'}
                </AppText>
              </View>
            ))}
          </View>
        ))}
      </View>

      <Button
        label="Open full result"
        onPress={() => router.push(matchRouteFor(match.id))}
        variant="secondary"
      />
    </Surface>
  );
}

function returnToRanking(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/statistics');
}

const styles = StyleSheet.create({
  screen: { gap: spacing.xxl },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  headingPills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  headingCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  sectionHeading: { gap: spacing.xs },
  summary: { gap: spacing.xl },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  summaryMetric: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    flexBasis: 132,
    flexGrow: 1,
    gap: spacing.xxs,
    minWidth: 112,
    padding: spacing.md,
  },
  historySection: { gap: spacing.lg },
  stateCard: { gap: spacing.md },
  matchList: { gap: spacing.lg },
  historyCard: { gap: spacing.lg },
  historyTopline: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  matchMeta: { flex: 1, gap: spacing.xxs },
  finalScore: { alignItems: 'center', gap: spacing.xs },
  teams: { gap: spacing.md },
  teamsTablet: { flexDirection: 'row' },
  team: { flex: 1, gap: spacing.xs },
  teamLabel: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  teamALabel: { backgroundColor: colors.teamASoft },
  teamBLabel: { backgroundColor: colors.teamBSoft },
  playerRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: spacing.xs,
  },
  playerIdentity: { flex: 1 },
});
