import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  borderWidths,
  Button,
  FeedbackBanner,
  radii,
  sizes,
  spacing,
  useResponsiveLayout,
  useTheme,
} from '@teamizer/ui';

import type {
  MatchDetail,
  MatchSummary,
  UpcomingMatch,
} from '../api/contracts';
import { usePreferences } from '../preferences/preferences-context';
import { useAppServices } from '../providers/app-services-context';
import { useSession } from '../session/session-context';
import { AppScreen } from '../ui/app-screen';
import { FoundationScreen } from '../ui/foundation-screen';
import { matchRouteFor } from './match-flow';
import {
  MatchListRow as SharedMatchListRow,
  FinishedMatchResultIndicator,
  FinishedMatchScore,
} from './match-list-row';
import { matchQueryKeys } from './match-query-keys';
import {
  defaultMatchesFilter,
  matchListPlayers,
  matchListScore,
  matchesIndexEmptyState,
  matchesIndexSections,
  personalMatchGoals,
  personalMatchResult,
  type MatchesFilter,
} from './matches-index-model';

export { FinishedMatchResultIndicator, FinishedMatchScore };

const finishedPageSize = 10;

export function MatchesIndexScreen() {
  const { apiClient } = useAppServices();
  const { language } = usePreferences();
  const { mode, width: viewportWidth } = useResponsiveLayout();
  const { state } = useSession();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<MatchesFilter>(defaultMatchesFilter);
  const upcomingQuery = useQuery({
    queryKey: matchQueryKeys.upcoming,
    queryFn: () => apiClient.getUpcomingMatches(),
    enabled: state.status === 'AUTHENTICATED',
  });
  const finishedQuery = useInfiniteQuery({
    queryKey: matchQueryKeys.finished,
    queryFn: ({ pageParam }) =>
      apiClient.getMatches({
        ...(pageParam ? { cursor: pageParam } : {}),
        limit: finishedPageSize,
        status: 'FINISHED',
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: ({ nextCursor }) => nextCursor ?? undefined,
    enabled: state.status === 'AUTHENTICATED',
  });
  const upcoming = upcomingQuery.data ?? [];
  const finished =
    finishedQuery.data?.pages.flatMap(({ items }) => items) ?? [];
  const sections = matchesIndexSections(filter, upcoming, finished);
  const visibleMatches: Array<UpcomingMatch | MatchSummary> = sections.flatMap(
    ({ matches }) => matches,
  );
  const detailQueries = useQueries({
    queries: visibleMatches.map((match) => ({
      queryKey: matchQueryKeys.detail(match.id),
      queryFn: () => apiClient.getMatch(match.id),
      enabled: state.status === 'AUTHENTICATED',
    })),
  });
  const detailsByMatchId = new Map<string, MatchDetail>();
  visibleMatches.forEach((match, index) => {
    const detail = detailQueries[index]?.data;
    if (detail) detailsByMatchId.set(match.id, detail);
  });

  if (state.status !== 'AUTHENTICATED') {
    return <FoundationScreen busy message={t('home.checking')} />;
  }

  const summariesPending =
    filter === 'upcoming'
      ? upcomingQuery.isPending
      : filter === 'finished'
        ? finishedQuery.isPending
        : upcomingQuery.isPending || finishedQuery.isPending;
  const summariesFailed =
    filter === 'upcoming'
      ? upcomingQuery.isError
      : filter === 'finished'
        ? finishedQuery.isError
        : upcomingQuery.isError || finishedQuery.isError;
  const detailFailed = detailQueries.some(({ isError }) => isError);

  const retrySummaries = () => {
    if (filter !== 'finished') void upcomingQuery.refetch();
    if (filter !== 'upcoming') void finishedQuery.refetch();
  };
  const retryDetails = () => {
    for (const query of detailQueries) {
      if (query.isError) void query.refetch();
    }
  };

  return (
    <AppScreen
      scroll
      underHeader
      contentWidth="readable"
      contentStyle={styles.screen}
    >
      <MatchesFilterControl filter={filter} onChange={setFilter} />

      {summariesPending ? (
        <View style={styles.lightweightState}>
          <AppText tone="muted">{t('matchesIndex.loading')}</AppText>
        </View>
      ) : null}

      {summariesFailed ? (
        <View style={styles.errorState}>
          <FeedbackBanner
            message={t('common.connectionRetry')}
            title={t('matchesIndex.unavailable')}
            tone="error"
          />
          <Button
            fullWidth={false}
            label={t('common.retry')}
            onPress={retrySummaries}
            variant="secondary"
          />
        </View>
      ) : null}

      {!summariesPending && !summariesFailed ? (
        <>
          {detailFailed ? (
            <View style={styles.detailError}>
              <AppText tone="muted" variant="caption">
                {t('matchesIndex.detailsUnavailable')}
              </AppText>
              <Button
                fullWidth={false}
                label={t('common.retry')}
                onPress={retryDetails}
                variant="secondary"
              />
            </View>
          ) : null}
          <MatchesListContent
            currentPlayerId={state.currentUser.player.id}
            detailsByMatchId={detailsByMatchId}
            filter={filter}
            finished={finished}
            language={language}
            mode={mode}
            upcoming={upcoming}
            viewportWidth={viewportWidth}
            onOpen={(matchId) => router.push(matchRouteFor(matchId))}
          />
          {filter !== 'upcoming' && finishedQuery.hasNextPage ? (
            <Button
              busy={finishedQuery.isFetchingNextPage}
              fullWidth={false}
              label={t('matchesIndex.loadMore')}
              onPress={() => void finishedQuery.fetchNextPage()}
              variant="secondary"
            />
          ) : null}
        </>
      ) : null}
    </AppScreen>
  );
}

export function MatchesFilterControl({
  filter,
  onChange,
}: {
  filter: MatchesFilter;
  onChange(filter: MatchesFilter): void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const items: Array<{ key: MatchesFilter; label: string }> = [
    { key: 'all', label: t('matchesIndex.filters.all') },
    { key: 'upcoming', label: t('matchesIndex.filters.upcoming') },
    { key: 'finished', label: t('matchesIndex.filters.finished') },
  ];

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.filters,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {items.map((item) => {
        const selected = filter === item.key;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={item.key}
            onPress={() => onChange(item.key)}
            style={({ pressed }) => [
              styles.filter,
              selected && { backgroundColor: colors.accent },
              pressed && !selected && { backgroundColor: colors.surfaceSubtle },
            ]}
          >
            <AppText
              numberOfLines={1}
              variant="label"
              style={{
                color: selected ? colors.accentContrast : colors.textPrimary,
              }}
            >
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MatchesListContent({
  currentPlayerId,
  detailsByMatchId,
  filter,
  finished,
  language,
  mode,
  upcoming,
  viewportWidth,
  onOpen,
}: {
  currentPlayerId: string;
  detailsByMatchId: ReadonlyMap<string, MatchDetail>;
  filter: MatchesFilter;
  finished: MatchSummary[];
  language: 'cs' | 'en';
  mode: 'phone' | 'tablet';
  upcoming: UpcomingMatch[];
  viewportWidth: number;
  onOpen(matchId: string): void;
}) {
  const { t } = useTranslation();
  const sections = matchesIndexSections(filter, upcoming, finished);
  const emptyState = matchesIndexEmptyState(
    filter,
    upcoming.length,
    finished.length,
  );

  if (emptyState) {
    const emptyCopy = {
      all: {
        hint: t('matchesIndex.emptyStates.all.hint'),
        title: t('matchesIndex.emptyStates.all.title'),
      },
      upcoming: {
        hint: t('matchesIndex.emptyStates.upcoming.hint'),
        title: t('matchesIndex.emptyStates.upcoming.title'),
      },
      finished: {
        hint: t('matchesIndex.emptyStates.finished.hint'),
        title: t('matchesIndex.emptyStates.finished.title'),
      },
    }[emptyState];

    return (
      <View style={styles.emptyState}>
        <AppText variant="bodyStrong">{emptyCopy.title}</AppText>
        <AppText tone="muted">{emptyCopy.hint}</AppText>
      </View>
    );
  }

  return (
    <View style={styles.sections}>
      {sections.map((section) => (
        <View key={section.kind} style={styles.section}>
          <AppText accessibilityRole="header" variant="bodyStrong">
            {section.kind === 'upcoming'
              ? t('matchesIndex.sections.upcoming')
              : t('matchesIndex.sections.finished')}
          </AppText>
          <View
            accessibilityLabel={
              section.kind === 'upcoming'
                ? t('matchesIndex.upcomingListLabel')
                : t('matchesIndex.finishedListLabel')
            }
            style={styles.rows}
          >
            {section.matches.map((match) => (
              <MatchListRow
                currentPlayerId={currentPlayerId}
                detail={detailsByMatchId.get(match.id)}
                key={match.id}
                kind={section.kind}
                language={language}
                match={match}
                mode={mode}
                onOpen={() => onOpen(match.id)}
                viewportWidth={viewportWidth}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export function MatchListRow({
  currentPlayerId,
  detail,
  kind,
  language,
  match,
  mode,
  onOpen,
  viewportWidth,
}: {
  currentPlayerId: string;
  detail: MatchDetail | undefined;
  kind: 'upcoming' | 'finished';
  language: 'cs' | 'en';
  match: MatchSummary | UpcomingMatch;
  mode: 'phone' | 'tablet';
  onOpen(): void;
  viewportWidth: number;
}) {
  const players = matchListPlayers(detail);
  const score = kind === 'finished' ? matchListScore(detail) : null;
  const result =
    kind === 'finished' ? personalMatchResult(detail, currentPlayerId) : null;
  const personalGoals =
    kind === 'finished' ? personalMatchGoals(detail, currentPlayerId) : null;
  const attendance =
    kind === 'upcoming' && 'myAttendance' in match ? match.myAttendance : null;

  return (
    <SharedMatchListRow
      attendance={attendance}
      kind={kind}
      language={language}
      mode={mode}
      personalGoals={personalGoals}
      players={players}
      result={result}
      score={score}
      startsAt={match.startsAt}
      viewportWidth={viewportWidth}
      onOpen={onOpen}
    />
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.sm },
  filters: {
    borderRadius: radii.md,
    borderWidth: borderWidths.subtle,
    flexDirection: 'row',
    gap: spacing.xxs,
    padding: spacing.xxs,
  },
  filter: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flex: 1,
    justifyContent: 'center',
    minHeight: sizes.minimumTouchTarget,
    paddingHorizontal: spacing.xs,
  },
  lightweightState: { paddingVertical: spacing.md },
  errorState: { alignItems: 'flex-start', gap: spacing.sm },
  detailError: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  emptyState: { gap: spacing.xs, paddingVertical: spacing.lg },
  sections: { gap: spacing.lg },
  section: { gap: spacing.sm },
  rows: { gap: spacing.xxs },
});
