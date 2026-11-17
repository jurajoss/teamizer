import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  borderWidths,
  Button,
  Card,
  FeedbackBanner,
  radii,
  sizes,
  spacing,
  useResponsiveLayout,
  useTheme,
} from '@teamizer/ui';

import type { Attendance, MatchDetail, UpcomingMatch } from '../api/contracts';
import { PersonalAttendanceControl } from '../attendance/attendance-control';
import { localizedErrorMessage } from '../i18n/localized-error';
import { matchRouteFor } from '../matches/match-flow';
import { matchQueryKeys, refreshMatchState } from '../matches/match-query-keys';
import { updateOwnAttendance } from '../matches/use-open-match-participation';
import { usePreferences } from '../preferences/preferences-context';
import { useAppServices } from '../providers/app-services-context';
import { useSession } from '../session/session-context';
import { GoalHistoryChart } from '../statistics/goal-history-chart';
import { statisticsQueryKeys } from '../statistics/statistics-query-keys';
import { playerRouteFor } from '../statistics/statistics';
import { AppScreen } from '../ui/app-screen';
import { AppIcon } from '../ui/icons/app-icon';
import type { TeamizerIconName } from '../ui/icons/app-icon-map';
import { FoundationScreen } from '../ui/foundation-screen';
import { PlayerAvatarStack } from '../ui/player-avatar-stack';
import {
  formatHomeMatchDate,
  homeAttendancePresentation,
  homeFirstName,
  homeGoalHistory,
  homeGoingPlayers,
  homeStatisticsMetrics,
  homeUsesTwoColumns,
  selectHomeMatch,
  type HomeGoalHistoryPoint,
  type HomeStatisticsMetric,
} from './home-screen-model';

const historyLimit = 10;
const homeMetricTileMinHeight = 104;
const homeNextMatchDetailGap = 6;
const homeNextMatchSectionGap = 10;

export function HomeScreen() {
  const { state } = useSession();
  const { apiClient } = useAppServices();
  const { language } = usePreferences();
  const { mode } = useResponsiveLayout();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const playerId =
    state.status === 'AUTHENTICATED' ? state.currentUser.player.id : null;
  const upcomingQuery = useQuery({
    queryKey: matchQueryKeys.upcoming,
    queryFn: () => apiClient.getUpcomingMatches(),
    enabled: playerId !== null,
  });
  const match = selectHomeMatch(upcomingQuery.data ?? []);
  const matchDetailQuery = useQuery({
    queryKey: matchQueryKeys.detail(match?.id ?? 'invalid'),
    queryFn: () => apiClient.getMatch(match?.id ?? ''),
    enabled: match !== null,
  });
  const statisticsQuery = useQuery({
    queryKey: statisticsQueryKeys.summary(playerId ?? 'invalid'),
    queryFn: () => apiClient.getPlayerStatistics(playerId ?? ''),
    enabled: playerId !== null,
  });
  const historyQuery = useQuery({
    queryKey: statisticsQueryKeys.recentHistory(playerId ?? 'invalid'),
    queryFn: () =>
      apiClient.getPlayerMatchHistory(playerId ?? '', { limit: historyLimit }),
    enabled: playerId !== null,
  });
  const attendanceMutation = useMutation({
    mutationFn: (attendance: Attendance) =>
      updateOwnAttendance(
        apiClient,
        match?.id ?? '',
        playerId ?? '',
        attendance,
      ),
    onSuccess: async () => {
      if (match) await refreshMatchState(queryClient, match.id);
    },
  });

  if (state.status !== 'AUTHENTICATED') {
    return <FoundationScreen busy message={t('home.checking')} />;
  }

  const twoColumns = homeUsesTwoColumns(mode);
  const openOwnProfile = () =>
    router.navigate(playerRouteFor(state.currentUser.player.id) as Href);
  const dashboard = (
    <View
      style={[
        styles.dashboardColumn,
        twoColumns && styles.homeColumnTablet,
        twoColumns && styles.dashboardColumnTablet,
      ]}
    >
      <HomeStatisticsCard
        error={statisticsQuery.isError}
        loading={statisticsQuery.isPending}
        metrics={
          statisticsQuery.data
            ? homeStatisticsMetrics(statisticsQuery.data, language)
            : []
        }
        onOpen={openOwnProfile}
        onRetry={() => void statisticsQuery.refetch()}
      />
      <HomeGoalsCard
        error={historyQuery.isError}
        loading={historyQuery.isPending}
        onOpen={openOwnProfile}
        onRetry={() => void historyQuery.refetch()}
        points={homeGoalHistory(historyQuery.data?.items ?? [], language)}
      />
    </View>
  );

  return (
    <AppScreen
      scroll
      underHeader
      contentWidth="working"
      contentStyle={[styles.screen, twoColumns && styles.screenTablet]}
    >
      <HomeGreeting playerName={state.currentUser.player.name} />

      <View style={[styles.homeGrid, twoColumns && styles.homeGridTablet]}>
        <View
          style={[styles.matchColumn, twoColumns && styles.homeColumnTablet]}
        >
          <HomeNextMatch
            detail={matchDetailQuery.data}
            detailError={matchDetailQuery.isError}
            error={upcomingQuery.isError}
            loading={upcomingQuery.isPending}
            match={match}
            mutationError={attendanceMutation.error}
            pendingAttendance={attendanceMutation.variables}
            playerStatus={state.currentUser.player.status}
            updatingAttendance={attendanceMutation.isPending}
            onChangeAttendance={(attendance) =>
              attendanceMutation.mutateAsync(attendance)
            }
            onOpen={(matchId) => router.push(matchRouteFor(matchId))}
            onRetry={() => void upcomingQuery.refetch()}
          />
        </View>
        {dashboard}
      </View>
    </AppScreen>
  );
}

export function HomeGreeting({ playerName }: { playerName: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.greeting}>
      <AppText accessibilityRole="header" variant="title">
        {t('home.greeting', { name: homeFirstName(playerName) })}
      </AppText>
      <AppText tone="muted" variant="caption">
        {t('home.greetingSubtitle')}
      </AppText>
    </View>
  );
}

export function HomeNextMatch({
  detail,
  detailError,
  error,
  loading,
  match,
  mutationError,
  pendingAttendance,
  playerStatus,
  updatingAttendance,
  onChangeAttendance,
  onOpen,
  onRetry,
}: {
  detail: MatchDetail | undefined;
  detailError: boolean;
  error: boolean;
  loading: boolean;
  match: UpcomingMatch | null;
  mutationError: unknown;
  pendingAttendance: Attendance | undefined;
  playerStatus: 'ACTIVE' | 'INACTIVE';
  updatingAttendance: boolean;
  onChangeAttendance(attendance: Attendance): Promise<void> | void;
  onOpen(matchId: string): void;
  onRetry(): void;
}) {
  const { language } = usePreferences();
  const { mode } = useResponsiveLayout();
  const { t } = useTranslation();

  if (loading) return <HomeStateCard title={t('home.loadingMatch')} />;

  if (error) {
    return (
      <HomeErrorCard
        message={t('common.connectionRetry')}
        onRetry={onRetry}
        title={t('home.matchUnavailable')}
      />
    );
  }

  if (!match) {
    return (
      <HomeStateCard
        title={t('home.noMatch')}
        message={t('home.noMatchHint')}
      />
    );
  }

  const date = formatHomeMatchDate(match.startsAt, language);
  const players = homeGoingPlayers(detail);
  const participantCount = detail
    ? detail.participants.going.length +
      detail.participants.notGoing.length +
      detail.participants.unanswered.length
    : null;
  const attendance = homeAttendancePresentation(
    match.myAttendance,
    match.status,
    playerStatus,
  );

  return (
    <Card
      padding="compact"
      style={[
        styles.nextMatchCard,
        mode === 'phone' && styles.phoneCardTitleInset,
      ]}
    >
      <DashboardSectionHeader
        title={t('home.nextMatch')}
        accessibilityLabel={t('home.openMatch')}
        pressWholeHeader
        onPress={() => onOpen(match.id)}
      />

      <View style={styles.matchDetails}>
        <IconTextRow icon="matches">
          <AppText variant="bodyStrong">
            {date.date} · {date.time}
          </AppText>
        </IconTextRow>
        {match.location ? (
          <IconTextRow icon="location">
            <AppText tone="muted">{match.location}</AppText>
          </IconTextRow>
        ) : null}
      </View>

      {detail ? (
        <View style={styles.participants}>
          <PlayerAvatarStack players={players} />
          <AppText variant="caption" tone="muted">
            {t('home.attendanceCount', {
              going: players.length,
              total: participantCount,
            })}
          </AppText>
        </View>
      ) : detailError ? (
        <AppText variant="caption" tone="muted">
          {t('home.attendanceCountUnavailable')}
        </AppText>
      ) : (
        <AppText variant="caption" tone="muted">
          {t('home.loadingAttendance')}
        </AppText>
      )}

      <PersonalAttendanceControl
        attendance={match.myAttendance}
        disabled={!attendance.mayEdit}
        pendingAttendance={updatingAttendance ? pendingAttendance : undefined}
        onChange={onChangeAttendance}
      />

      {mutationError ? (
        <FeedbackBanner
          tone="error"
          message={localizedErrorMessage(
            mutationError,
            t,
            'attendance.updateFailed',
          )}
        />
      ) : null}
    </Card>
  );
}

export function HomeStatisticsCard({
  error,
  loading,
  metrics,
  onOpen,
  onRetry,
}: {
  error: boolean;
  loading: boolean;
  metrics: HomeStatisticsMetric[];
  onOpen(): void;
  onRetry(): void;
}) {
  const { mode } = useResponsiveLayout();
  const { t } = useTranslation();

  return (
    <Card
      padding="compact"
      style={[
        styles.dashboardCard,
        mode === 'phone' && styles.phoneCardTitleInset,
      ]}
    >
      <DashboardSectionHeader
        title={t('home.myStatistics')}
        accessibilityLabel={t('home.openRankings')}
        pressWholeHeader
        onPress={onOpen}
      />
      {loading ? (
        <AppText tone="muted">{t('home.loadingStatistics')}</AppText>
      ) : null}
      {error ? (
        <InlineError onRetry={onRetry} text={t('home.statisticsUnavailable')} />
      ) : null}
      {!loading && !error ? (
        <View style={styles.metrics}>
          {metrics.map((metric) => (
            <MetricTile key={metric.key} metric={metric} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export function HomeGoalsCard({
  error,
  loading,
  onOpen,
  onRetry,
  points,
}: {
  error: boolean;
  loading: boolean;
  onOpen(): void;
  onRetry(): void;
  points: HomeGoalHistoryPoint[];
}) {
  const { mode } = useResponsiveLayout();
  const { t } = useTranslation();

  return (
    <Card
      padding="compact"
      style={[
        styles.dashboardCard,
        mode === 'phone' && styles.phoneCardTitleInset,
      ]}
    >
      <DashboardSectionHeader
        title={t('home.myGoals')}
        accessibilityLabel={t('home.openGoalsStatistics')}
        pressWholeHeader
        onPress={onOpen}
      />
      {loading ? (
        <AppText tone="muted">{t('home.loadingGoals')}</AppText>
      ) : null}
      {error ? (
        <InlineError onRetry={onRetry} text={t('home.goalsUnavailable')} />
      ) : null}
      {!loading && !error && points.length === 0 ? (
        <AppText tone="muted">{t('home.noGoalHistory')}</AppText>
      ) : null}
      {!loading && !error && points.length > 0 ? (
        <GoalHistoryChart
          accessibilityLabel={t('home.goalsChartAccessibility', {
            count: points.length,
          })}
          points={points}
          variant="line"
        />
      ) : null}
    </Card>
  );
}

function MetricTile({ metric }: { metric: HomeStatisticsMetric }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const metadata: Record<
    HomeStatisticsMetric['key'],
    { icon: TeamizerIconName; label: string }
  > = {
    winRate: { icon: 'trophy', label: t('home.winRate') },
    goalsPerMatch: { icon: 'football', label: t('home.goalsPerMatch') },
    matches: { icon: 'matches', label: t('home.matches') },
  };
  const presentation = metadata[metric.key];

  return (
    <View
      style={[
        styles.metricTile,
        {
          backgroundColor: colors.surfaceSubtle,
          borderColor: colors.border,
        },
      ]}
    >
      <AppIcon
        color={colors.textPrimary}
        name={presentation.icon}
        size={sizes.icon.large}
      />
      <AppText variant="metric">{metric.value}</AppText>
      <AppText variant="caption" tone="muted" style={styles.metricLabel}>
        {presentation.label}
      </AppText>
    </View>
  );
}

export function DashboardSectionHeader({
  accessibilityLabel,
  onPress,
  pressWholeHeader = false,
  title,
}: {
  accessibilityLabel: string;
  onPress(): void;
  pressWholeHeader?: boolean;
  title: string;
}) {
  const { colors } = useTheme();

  if (!pressWholeHeader) {
    return (
      <View style={[styles.sectionHeader, styles.sectionHeaderContent]}>
        <AppText
          accessibilityRole="header"
          variant="heading"
          style={styles.sectionTitle}
        >
          {title}
        </AppText>
        <Pressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          hitSlop={spacing.xs}
          onPress={onPress}
          style={({ pressed }) => [
            styles.sectionAction,
            pressed && { backgroundColor: colors.accentSoft },
          ]}
        >
          <AppIcon color={colors.accent} name="next" size={sizes.icon.medium} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.sectionHeader,
        pressed && styles.sectionHeaderPressed,
      ]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.sectionHeaderContent}
      >
        <AppText variant="heading" style={styles.sectionTitle}>
          {title}
        </AppText>
        <View style={styles.sectionAction}>
          <AppIcon color={colors.accent} name="next" size={sizes.icon.medium} />
        </View>
      </View>
    </Pressable>
  );
}

function IconTextRow({
  children,
  icon,
}: {
  children: ReactNode;
  icon: TeamizerIconName;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.iconTextRow}>
      <AppIcon
        color={colors.textSecondary}
        name={icon}
        size={sizes.icon.medium}
      />
      <View style={styles.iconTextCopy}>{children}</View>
    </View>
  );
}

function HomeStateCard({
  title,
  message,
}: {
  title: string;
  message?: string;
}) {
  return (
    <Card padding="compact" style={styles.stateCard}>
      <AppText variant="heading">{title}</AppText>
      {message ? <AppText tone="muted">{message}</AppText> : null}
    </Card>
  );
}

function HomeErrorCard({
  message,
  onRetry,
  title,
}: {
  message: string;
  onRetry(): void;
  title: string;
}) {
  const { t } = useTranslation();
  return (
    <Card padding="compact" style={styles.stateCard}>
      <FeedbackBanner tone="error" title={title} message={message} />
      <Button label={t('common.retry')} onPress={onRetry} variant="secondary" />
    </Card>
  );
}

function InlineError({ onRetry, text }: { onRetry(): void; text: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.inlineError}>
      <AppText tone="muted">{text}</AppText>
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
  screen: { gap: spacing.md },
  screenTablet: { gap: spacing.lg },
  greeting: { gap: spacing.xxs },
  homeGrid: { gap: spacing.md },
  homeGridTablet: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  homeColumnTablet: { flex: 1 },
  matchColumn: { minWidth: 0 },
  dashboardColumn: { gap: spacing.md, minWidth: 0 },
  dashboardColumnTablet: { gap: spacing.lg },
  nextMatchCard: { gap: homeNextMatchSectionGap },
  dashboardCard: { gap: spacing.sm },
  phoneCardTitleInset: { paddingTop: spacing.xs },
  stateCard: { gap: spacing.sm },
  sectionHeader: {
    borderRadius: radii.sm,
    justifyContent: 'center',
    minHeight: sizes.minimumTouchTarget,
  },
  sectionHeaderContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  sectionHeaderPressed: { opacity: 0.72 },
  sectionTitle: { flex: 1 },
  sectionAction: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: sizes.minimumTouchTarget,
    justifyContent: 'center',
    width: sizes.minimumTouchTarget,
  },
  matchDetails: { gap: homeNextMatchDetailGap },
  iconTextRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconTextCopy: { flex: 1, minWidth: 0 },
  participants: { gap: spacing.xxs },
  metrics: { flexDirection: 'row', gap: spacing.sm },
  metricTile: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: borderWidths.subtle,
    flex: 1,
    gap: spacing.xxs,
    minHeight: homeMetricTileMinHeight,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  metricLabel: { textAlign: 'center' },
  inlineError: { alignItems: 'flex-start', gap: spacing.sm },
});
