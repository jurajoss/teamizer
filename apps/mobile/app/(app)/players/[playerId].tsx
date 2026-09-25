import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
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
  useResponsiveLayout,
  useTheme,
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
import { usePreferences } from '../../../src/preferences/preferences-context';
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
  const { t } = useTranslation();
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
          title={t('playerDetail.unavailable')}
          message={t('playerDetail.missingId')}
        />
      </PlayerPageFrame>
    );
  }

  if (detailQuery.isPending) {
    return (
      <PlayerPageFrame>
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="heading">{t('playerDetail.loading')}</AppText>
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
          title={
            notFound
              ? t('playerDetail.unavailable')
              : t('playerDetail.loadFailed')
          }
          message={
            notFound ? t('playerDetail.notFound') : t('common.connectionRetry')
          }
        />
        {!notFound ? (
          <Button
            label={t('common.retry')}
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
    <AppScreen scroll underHeader contentStyle={styles.screen}>
      {children}
    </AppScreen>
  );
}

function PlayerHeading({ player }: { player: PlayerDetail }) {
  const { t } = useTranslation();
  return (
    <View style={styles.heading}>
      <Avatar name={player.name} size="large" url={player.avatarUrl} />
      <View style={styles.headingCopy}>
        <View style={styles.headingPills}>
          <StatusPill
            label={
              player.status === 'ACTIVE'
                ? t('status.active')
                : t('status.inactive')
            }
            tone={player.status === 'ACTIVE' ? 'success' : 'neutral'}
          />
          {player.type === 'GUEST' ? (
            <StatusPill label={t('status.guest')} tone="neutral" />
          ) : null}
        </View>
        <AppText accessibilityRole="header" variant="title">
          {player.name}
        </AppText>
        <AppText tone="muted">{t('playerDetail.performanceOnly')}</AppText>
      </View>
    </View>
  );
}

function StatisticsSummary({ player }: { player: PlayerDetail }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { language } = usePreferences();
  const { statistics } = player;
  const metrics = [
    [t('common.matches'), String(statistics.matches)],
    [t('common.winRate'), formatWinRate(statistics.winRate, language)],
    [t('common.wins'), String(statistics.wins)],
    [t('common.draws'), String(statistics.draws)],
    [t('common.losses'), String(statistics.losses)],
    [t('common.goals'), String(statistics.goals)],
    [
      t('common.goalsPerMatch'),
      formatGoalsPerMatch(statistics.goalsPerMatch, language),
    ],
  ] as const;

  return (
    <Surface style={styles.summary}>
      <View style={styles.sectionHeading}>
        <AppText variant="eyebrow" tone="brand">
          {t('playerDetail.performance').toUpperCase()}
        </AppText>
        <AppText variant="heading">{t('playerDetail.career')}</AppText>
      </View>
      <View style={styles.summaryGrid}>
        {metrics.map(([label, value]) => (
          <View
            key={label}
            style={[
              styles.summaryMetric,
              { backgroundColor: colors.surfaceSubtle },
            ]}
          >
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
  const { t } = useTranslation();
  const state = statisticsViewState(loading, error, matches.length);

  return (
    <View style={styles.historySection}>
      <View style={styles.sectionHeading}>
        <AppText variant="eyebrow" tone="brand">
          {t('playerDetail.recent').toUpperCase()}
        </AppText>
        <AppText variant="heading">{t('playerDetail.history')}</AppText>
      </View>

      {state === 'loading' ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="bodyStrong">
            {t('playerDetail.historyLoading')}
          </AppText>
        </Surface>
      ) : null}
      {state === 'error' ? (
        <View style={styles.stateCard}>
          <FeedbackBanner
            tone="error"
            title={t('playerDetail.historyUnavailable')}
            message={t('playerDetail.historyError')}
          />
          <Button
            label={t('common.retry')}
            onPress={onRetry}
            variant="secondary"
          />
        </View>
      ) : null}
      {state === 'empty' ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="bodyStrong">{t('playerDetail.noHistory')}</AppText>
          <AppText tone="muted">{t('playerDetail.noHistoryHint')}</AppText>
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
              label={t('playerDetail.loadMore')}
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
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { language } = usePreferences();
  const { isTablet } = useResponsiveLayout();
  const goals = new Map(
    match.playerGoals.map(({ playerId, goals }) => [playerId, goals]),
  );
  const teams = [...match.teams].sort((first, second) =>
    first.side < second.side ? -1 : 1,
  );
  const resultLabel =
    match.subjectResult === 'WIN'
      ? t('status.win')
      : match.subjectResult === 'LOSS'
        ? t('status.loss')
        : t('status.draw');

  return (
    <Surface style={styles.historyCard}>
      <View style={styles.historyTopline}>
        <View style={styles.matchMeta}>
          <AppText variant="bodyStrong">{match.sport.name}</AppText>
          <AppText variant="caption" tone="muted">
            {formatMatchDate(match.startsAt, language)}
            {match.location ? ` · ${match.location}` : ''}
          </AppText>
        </View>
        <StatusPill
          label={resultLabel}
          tone={match.subjectResult === 'WIN' ? 'success' : 'neutral'}
        />
      </View>

      <View
        accessibilityLabel={t('playerDetail.finalScore', {
          teamA: match.score.teamA,
          teamB: match.score.teamB,
        })}
        style={styles.finalScore}
      >
        <AppText variant="eyebrow" tone="muted">
          {t('playerDetail.final')}
        </AppText>
        <AppText variant="title">
          {t('common.team', { side: 'A' })} {match.score.teamA}–
          {match.score.teamB} {t('common.team', { side: 'B' })}
        </AppText>
        <AppText variant="caption" tone="muted">
          {t('playerDetail.playerGoals', { count: match.subjectGoals })}
        </AppText>
      </View>

      <View style={[styles.teams, isTablet && styles.teamsTablet]}>
        {teams.map((team) => (
          <View key={team.id} style={styles.team}>
            <View
              style={[
                styles.teamLabel,
                {
                  backgroundColor:
                    team.side === 'A'
                      ? colors.teamASurface
                      : colors.teamBSurface,
                },
              ]}
            >
              <AppText variant="label">
                {t('common.team', { side: team.side })}
              </AppText>
            </View>
            {team.players.map((player) => (
              <View
                key={player.id}
                style={[styles.playerRow, { borderBottomColor: colors.border }]}
              >
                <Avatar
                  name={player.name}
                  size="small"
                  url={player.avatarUrl}
                />
                <View style={styles.playerIdentity}>
                  <AppText variant="bodyStrong">{player.name}</AppText>
                  {player.type === 'GUEST' ? (
                    <AppText variant="caption" tone="muted">
                      {t('common.guest')}
                    </AppText>
                  ) : null}
                </View>
                <AppText variant="caption" tone="muted">
                  {t('common.goalCount', { count: goals.get(player.id) ?? 0 })}
                </AppText>
              </View>
            ))}
          </View>
        ))}
      </View>

      <Button
        label={t('playerDetail.openResult')}
        onPress={() => router.push(matchRouteFor(match.id))}
        variant="secondary"
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  headingPills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  headingCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  sectionHeading: { gap: spacing.xs },
  summary: { gap: spacing.xl },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  summaryMetric: {
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
  playerRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: sizes.controlHeight,
    paddingHorizontal: spacing.xs,
  },
  playerIdentity: { flex: 1 },
});
