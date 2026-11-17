import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Avatar,
  Button,
  Card,
  FeedbackBanner,
  radii,
  sizes,
  spacing,
  useResponsiveLayout,
  useTheme,
} from '@teamizer/ui';

import { ApiClientError } from '../api/authenticated-api-client';
import type { PlayerDetail, PlayerMatchHistoryItem } from '../api/contracts';
import { homeGoalHistory } from '../home/home-screen-model';
import { matchRouteFor } from '../matches/match-flow';
import { FinishedMatchResultIndicator } from '../matches/match-list-row';
import { HeaderIconAction } from '../navigation/header-controls';
import { iosPlayerProfileHeaderItems } from '../navigation/native-header-items';
import { usePreferences } from '../preferences/preferences-context';
import { useAppServices } from '../providers/app-services-context';
import { useSession } from '../session/session-context';
import { AppScreen } from '../ui/app-screen';
import { AppIcon } from '../ui/icons/app-icon';
import type { TeamizerIconName } from '../ui/icons/app-icon-map';
import { GoalHistoryChart } from './goal-history-chart';
import { PlayerHistoryMatchRow } from './player-history-match-row';
import {
  formatAttendancePercentage,
  formatPlayerPercentage,
  recentPlayerForm,
  recentPlayerMatches,
  type RecentPlayerForm,
} from './player-statistics-model';
import { statisticsQueryKeys } from './statistics-query-keys';
import { formatGoalsPerMatch, playerEditRouteFor } from './statistics';
import { canEditPlayerProfile } from '../profiles/player-admin';

const recentHistoryLimit = 10;

export function PlayerStatisticsScreen() {
  const { t } = useTranslation();
  const parameters = useLocalSearchParams<{
    playerId?: string | string[];
  }>();
  const playerId =
    typeof parameters.playerId === 'string' ? parameters.playerId : null;
  const { apiClient } = useAppServices();
  const { state } = useSession();
  const onEdit =
    playerId &&
    state.status === 'AUTHENTICATED' &&
    canEditPlayerProfile(
      state.currentUser.user.role,
      state.currentUser.player.id,
      playerId,
    )
      ? () => router.push(playerEditRouteFor(playerId))
      : undefined;
  const detailQuery = useQuery({
    queryKey: statisticsQueryKeys.player(playerId ?? 'invalid'),
    queryFn: () => apiClient.getPlayerDetail(playerId ?? ''),
    enabled: playerId !== null,
  });
  const historyQuery = useQuery({
    queryKey: statisticsQueryKeys.recentHistory(playerId ?? 'invalid'),
    queryFn: () =>
      apiClient.getPlayerMatchHistory(playerId ?? '', {
        limit: recentHistoryLimit,
      }),
    enabled: playerId !== null,
  });

  if (!playerId) {
    return (
      <PlayerStatisticsFrame>
        <FeedbackBanner
          message={t('playerDetail.missingId')}
          title={t('playerDetail.unavailable')}
          tone="error"
        />
      </PlayerStatisticsFrame>
    );
  }

  if (detailQuery.isPending) {
    return (
      <PlayerStatisticsFrame {...(onEdit ? { onEdit } : {})}>
        <AppText tone="muted">{t('playerDetail.loading')}</AppText>
      </PlayerStatisticsFrame>
    );
  }

  if (detailQuery.isError) {
    const notFound =
      detailQuery.error instanceof ApiClientError &&
      detailQuery.error.status === 404;
    return (
      <PlayerStatisticsFrame {...(onEdit ? { onEdit } : {})}>
        <FeedbackBanner
          message={
            notFound ? t('playerDetail.notFound') : t('common.connectionRetry')
          }
          title={
            notFound
              ? t('playerDetail.unavailable')
              : t('playerDetail.loadFailed')
          }
          tone="error"
        />
        {!notFound ? (
          <Button
            label={t('common.retry')}
            onPress={() => void detailQuery.refetch()}
            variant="secondary"
          />
        ) : null}
      </PlayerStatisticsFrame>
    );
  }

  return (
    <PlayerStatisticsContent
      history={historyQuery.data?.items ?? []}
      historyError={historyQuery.isError}
      historyLoading={historyQuery.isPending}
      player={detailQuery.data}
      {...(onEdit ? { onEdit } : {})}
      onOpenHistory={() => router.dismissTo('/matches' as Href)}
      onOpenMatch={(matchId) => router.push(matchRouteFor(matchId))}
      onRetryHistory={() => void historyQuery.refetch()}
    />
  );
}

function PlayerStatisticsFrame({
  children,
  onEdit,
}: {
  children: ReactNode;
  onEdit?(): void;
}) {
  const { t } = useTranslation();
  const usesIosNativeItems = Platform.OS === 'ios';

  return (
    <>
      <Stack.Screen
        options={{
          title: t('playerDetail.title'),
          ...(usesIosNativeItems
            ? {
                unstable_headerRightItems: () =>
                  iosPlayerProfileHeaderItems({
                    editLabel: t('profile.edit'),
                    ...(onEdit ? { onEdit } : {}),
                  }),
              }
            : {
                headerRight: () => (
                  <PlayerProfileHeaderActions {...(onEdit ? { onEdit } : {})} />
                ),
              }),
        }}
      />
      <AppScreen scroll underHeader contentStyle={styles.screen}>
        {children}
      </AppScreen>
    </>
  );
}

export function PlayerProfileHeaderActions({ onEdit }: { onEdit?(): void }) {
  const { t } = useTranslation();

  return onEdit ? (
    <HeaderIconAction icon="edit" label={t('profile.edit')} onPress={onEdit} />
  ) : null;
}

export function PlayerStatisticsContent({
  history,
  historyError,
  historyLoading,
  player,
  onOpenHistory,
  onOpenMatch,
  onEdit,
  onRetryHistory,
}: {
  history: PlayerMatchHistoryItem[];
  historyError: boolean;
  historyLoading: boolean;
  player: PlayerDetail;
  onOpenHistory(): void;
  onOpenMatch(matchId: string): void;
  onEdit?(): void;
  onRetryHistory(): void;
}) {
  const { language } = usePreferences();
  const { mode, width } = useResponsiveLayout();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const goalPoints = homeGoalHistory(history, language);
  const recentMatches = recentPlayerMatches(history);

  return (
    <PlayerStatisticsFrame {...(onEdit ? { onEdit } : {})}>
      <PlayerProfile player={player} />
      <StatisticsGrid
        history={history}
        historyError={historyError}
        historyLoading={historyLoading}
        player={player}
      />
      <Card padding="compact" style={styles.chartCard}>
        <CardTitle icon="rankings" title={t('playerDetail.goalsChartTitle')} />
        {historyLoading ? (
          <AppText tone="muted">{t('playerDetail.historyLoading')}</AppText>
        ) : null}
        {historyError ? <InlineHistoryError onRetry={onRetryHistory} /> : null}
        {!historyLoading && !historyError && goalPoints.length === 0 ? (
          <AppText tone="muted">{t('playerDetail.noGoalHistory')}</AppText>
        ) : null}
        {!historyLoading && !historyError && goalPoints.length > 0 ? (
          <GoalHistoryChart
            accessibilityLabel={t('playerDetail.goalsChartAccessibility', {
              count: goalPoints.length,
              name: player.name,
            })}
            points={goalPoints}
            variant="bars"
          />
        ) : null}
      </Card>
      <Card padding="compact" style={styles.historyCard}>
        <Pressable
          accessibilityLabel={t('playerDetail.openHistory')}
          accessibilityRole="button"
          onPress={onOpenHistory}
          style={({ pressed }) => [
            styles.historyHeader,
            pressed && styles.pressed,
          ]}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={styles.historyHeaderContent}
          >
            <View style={styles.historyTitle}>
              <CardTitle icon="matches" title={t('playerDetail.recentTitle')} />
            </View>
            <View style={styles.historyChevron}>
              <AppIcon
                color={colors.textSecondary}
                name="next"
                size={sizes.icon.medium}
              />
            </View>
          </View>
        </Pressable>
        {historyLoading ? (
          <AppText tone="muted">{t('playerDetail.historyLoading')}</AppText>
        ) : null}
        {historyError ? <InlineHistoryError onRetry={onRetryHistory} /> : null}
        {!historyLoading && !historyError && recentMatches.length === 0 ? (
          <AppText tone="muted">{t('playerDetail.noHistory')}</AppText>
        ) : null}
        {!historyLoading && !historyError && recentMatches.length > 0 ? (
          <View style={styles.matchRows}>
            {recentMatches.map((match) => (
              <PlayerHistoryMatchRow
                key={match.id}
                language={language}
                match={match}
                mode={mode}
                viewportWidth={width}
                onOpen={() => onOpenMatch(match.id)}
              />
            ))}
          </View>
        ) : null}
      </Card>
    </PlayerStatisticsFrame>
  );
}

export function PlayerProfile({ player }: { player: PlayerDetail }) {
  const { t } = useTranslation();
  return (
    <View style={styles.profile}>
      <Avatar name={player.name} size="hero" url={player.avatarUrl} />
      <View style={styles.profileCopy}>
        <AppText
          accessibilityRole="header"
          numberOfLines={2}
          style={styles.profileName}
          variant="title"
        >
          {player.name}
        </AppText>
        <AppText tone="muted">
          {t('playerDetail.playedMatches', {
            count: player.statistics.matches,
          })}
        </AppText>
        {player.type === 'GUEST' ? (
          <AppText tone="brand" variant="caption">
            {t('common.guest')}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

export function StatisticsGrid({
  history,
  historyError,
  historyLoading,
  player,
}: {
  history: PlayerMatchHistoryItem[];
  historyError: boolean;
  historyLoading: boolean;
  player: PlayerDetail;
}) {
  const { language } = usePreferences();
  const { t } = useTranslation();
  const { statistics } = player;
  const { attendance } = statistics;
  const form = recentPlayerForm(history);

  return (
    <View style={styles.statisticsGrid}>
      <View style={styles.statisticsRow}>
        <Card padding="compact" style={styles.percentageCard}>
          <CardTitle icon="trophy" title={t('playerDetail.winRate')} />
          <AppText variant="metric">
            {formatPlayerPercentage(statistics.winRate, language)}
          </AppText>
          <View style={styles.results}>
            <ResultCount count={statistics.wins} result="WIN" />
            <ResultCount count={statistics.draws} result="DRAW" />
            <ResultCount count={statistics.losses} result="LOSS" />
          </View>
          <ProgressBar value={statistics.winRate ?? 0} />
        </Card>
        <Card padding="compact" style={styles.percentageCard}>
          <CardTitle icon="players" title={t('playerDetail.attendance')} />
          <AppText variant="metric">
            {formatAttendancePercentage(attendance.percentage, language)}
          </AppText>
          <AppText numberOfLines={2} tone="muted" variant="caption">
            {t('playerDetail.attendanceSummary', {
              attended: attendance.playedMatches,
              eligible: attendance.totalMatches,
            })}
          </AppText>
          <ProgressBar value={(attendance.percentage ?? 0) / 100} />
        </Card>
      </View>
      <View style={styles.statisticsRow}>
        <RecentWinsCard
          error={historyError}
          form={form}
          loading={historyLoading}
        />
        <GoalsCard
          goalsPerMatch={formatGoalsPerMatch(
            statistics.goalsPerMatch,
            language,
          )}
          totalGoals={String(statistics.goals)}
        />
      </View>
    </View>
  );
}

export function GoalsCard({
  goalsPerMatch,
  totalGoals,
}: {
  goalsPerMatch: string;
  totalGoals: string;
}) {
  const { t } = useTranslation();

  return (
    <Card padding="compact" style={styles.summaryCard}>
      <CardTitle icon="football" title={t('common.goals')} />
      <View style={styles.goalsMetrics}>
        <View style={styles.goalMetricRow}>
          <AppText
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            numberOfLines={1}
            style={styles.goalMetricValue}
            variant="metric"
          >
            {goalsPerMatch}
          </AppText>
          <AppText
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            numberOfLines={1}
            style={styles.goalMetricLabel}
            tone="muted"
            variant="caption"
          >
            {t('playerDetail.goalsPerMatchShort')}
          </AppText>
        </View>
        <View style={styles.goalMetricRow}>
          <AppText
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            numberOfLines={1}
            style={styles.goalMetricValue}
            variant="metric"
          >
            {totalGoals}
          </AppText>
          <AppText
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            numberOfLines={1}
            style={styles.goalMetricLabel}
            tone="muted"
            variant="caption"
          >
            {t('playerDetail.goalsTotal')}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

export function RecentWinsCard({
  error,
  form,
  loading,
}: {
  error: boolean;
  form: RecentPlayerForm;
  loading: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const unavailableLabel = loading
    ? t('playerDetail.recentWinsLoading')
    : error
      ? t('playerDetail.recentWinsUnavailable')
      : t('playerDetail.recentWinsEmpty');
  const resultLabels = form.results.map((result) =>
    result === 'WIN'
      ? t('matchesIndex.win')
      : result === 'DRAW'
        ? t('matchesIndex.draw')
        : t('matchesIndex.loss'),
  );
  const accessibilityLabel =
    loading || error || form.results.length === 0
      ? `${t('common.wins')}. ${unavailableLabel}`
      : t('playerDetail.recentWinsAccessibility', {
          matches: form.results.length,
          results: resultLabels.join(', '),
          wins: form.wins,
        });

  return (
    <Card
      accessible
      accessibilityLabel={accessibilityLabel}
      padding="compact"
      style={styles.summaryCard}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.formAccessibleContent}
      >
        <CardTitle icon="history" title={t('common.wins')} />
        {loading || error || form.results.length === 0 ? (
          <View style={styles.formEmpty}>
            <AppText numberOfLines={1} tone="muted" variant="caption">
              {unavailableLabel}
            </AppText>
          </View>
        ) : (
          <View style={styles.formContent}>
            <View style={styles.formCopy}>
              <AppText
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                numberOfLines={1}
                variant="metric"
              >
                {t('playerDetail.recentWinsValue', {
                  matches: form.results.length,
                  wins: form.wins,
                })}
              </AppText>
              <AppText
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                numberOfLines={1}
                tone="muted"
                variant="caption"
              >
                {t('playerDetail.recentWinsMatches', {
                  count: form.results.length,
                })}
              </AppText>
            </View>
            <View style={styles.formSegments}>
              {form.results.map((result, index) => (
                <View
                  key={`${result}-${index}`}
                  style={[
                    styles.formSegment,
                    {
                      backgroundColor:
                        result === 'WIN'
                          ? colors.success
                          : result === 'LOSS'
                            ? colors.danger
                            : colors.textSecondary,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        )}
      </View>
    </Card>
  );
}

function CardTitle({ icon, title }: { icon: TeamizerIconName; title: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.cardTitle}>
      <AppIcon color={colors.accent} name={icon} size={sizes.icon.large} />
      <AppText
        numberOfLines={2}
        style={styles.cardTitleText}
        variant="bodyStrong"
      >
        {title}
      </AppText>
    </View>
  );
}

function ResultCount({
  count,
  result,
}: {
  count: number;
  result: 'DRAW' | 'LOSS' | 'WIN';
}) {
  const { t } = useTranslation();
  const labelKey =
    result === 'WIN'
      ? 'common.wins'
      : result === 'DRAW'
        ? 'common.draws'
        : 'common.losses';
  return (
    <View
      accessible
      accessibilityLabel={`${t(labelKey)}: ${count}`}
      style={styles.resultCount}
    >
      <FinishedMatchResultIndicator result={result} size="compact" />
      <AppText variant="caption">{count}</AppText>
    </View>
  );
}

function ProgressBar({ value }: { value: number }) {
  const { colors } = useTheme();
  const percentage =
    `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` as const;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: Math.round(value * 100) }}
      style={[styles.progressTrack, { backgroundColor: colors.surfaceStrong }]}
    >
      <View
        style={[
          styles.progressValue,
          { backgroundColor: colors.accent, width: percentage },
        ]}
      />
    </View>
  );
}

function InlineHistoryError({ onRetry }: { onRetry(): void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.inlineError}>
      <AppText tone="muted">{t('playerDetail.historyError')}</AppText>
      <Button
        fullWidth={false}
        label={t('common.retry')}
        onPress={onRetry}
        variant="secondary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  profile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  profileCopy: { flex: 1, gap: spacing.xxs, minWidth: 0 },
  profileName: { minWidth: 0 },
  statisticsGrid: { gap: spacing.sm },
  statisticsRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  percentageCard: { flex: 1, gap: spacing.sm, minWidth: 0 },
  summaryCard: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 108,
    minWidth: 0,
  },
  cardTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  cardTitleText: { flex: 1, minWidth: 0 },
  goalsMetrics: {
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  goalMetricRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  goalMetricValue: { flex: 1, minWidth: 0 },
  goalMetricLabel: { flex: 1, minWidth: 0 },
  formContent: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  formCopy: { gap: spacing.xxs },
  formAccessibleContent: {
    flex: 1,
    gap: spacing.sm,
  },
  formEmpty: { flex: 1, justifyContent: 'center' },
  formSegments: {
    flexDirection: 'row',
    gap: spacing.xxs,
    width: '100%',
  },
  formSegment: {
    borderRadius: radii.pill,
    flex: 1,
    height: spacing.sm,
  },
  results: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  resultCount: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxs },
  progressTrack: {
    borderRadius: radii.pill,
    height: spacing.sm,
    marginTop: 'auto',
    overflow: 'hidden',
    width: '100%',
  },
  progressValue: { borderRadius: radii.pill, height: '100%' },
  chartCard: { gap: spacing.md },
  historyCard: { gap: 0 },
  historyHeader: {
    borderRadius: radii.sm,
    minHeight: sizes.minimumTouchTarget,
  },
  historyHeaderContent: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xxs,
    justifyContent: 'space-between',
    width: '100%',
  },
  historyTitle: { flex: 1, minWidth: 0 },
  historyChevron: {
    alignItems: 'center',
    flexShrink: 0,
    height: sizes.icon.large,
    justifyContent: 'center',
    width: sizes.icon.medium,
  },
  matchRows: { gap: spacing.xxs },
  inlineError: { alignItems: 'flex-start', gap: spacing.sm },
  pressed: { opacity: 0.72 },
});
