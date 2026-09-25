import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Avatar,
  Button,
  FeedbackBanner,
  spacing,
  StatusPill,
  Surface,
  useTheme,
} from '@teamizer/ui';

import {
  formatMatchDate,
  matchRouteFor,
  primaryUpcomingMatch,
} from '../../src/matches/match-flow';
import { matchQueryKeys } from '../../src/matches/match-query-keys';
import { usePreferences } from '../../src/preferences/preferences-context';
import { useAppServices } from '../../src/providers/app-services-context';
import { useSession } from '../../src/session/session-context';
import { statisticsRoute } from '../../src/statistics/statistics';
import { AppScreen } from '../../src/ui/app-screen';
import { FoundationScreen } from '../../src/ui/foundation-screen';

export default function AuthenticatedHomeScreen() {
  const { state } = useSession();
  const { apiClient } = useAppServices();
  const { t } = useTranslation();
  const { language } = usePreferences();
  const { colors } = useTheme();
  const upcomingQuery = useQuery({
    queryKey: matchQueryKeys.upcoming,
    queryFn: () => apiClient.getUpcomingMatches(),
    enabled: state.status === 'AUTHENTICATED',
  });

  if (state.status !== 'AUTHENTICATED') {
    return <FoundationScreen busy message={t('home.checking')} />;
  }

  const roleLabel =
    state.currentUser.user.role === 'ADMIN'
      ? t('common.admin')
      : t('common.player');
  const active = state.currentUser.player.status === 'ACTIVE';

  return (
    <AppScreen scroll underHeader contentStyle={styles.screen}>
      <View style={styles.hero}>
        <AppText accessibilityRole="header" variant="display">
          {t('home.title')}
        </AppText>
        <AppText tone="muted">
          {t('home.welcome', { name: state.currentUser.player.name })}
        </AppText>
      </View>

      <UpcomingMatchSection
        error={upcomingQuery.isError}
        language={language}
        loading={upcomingQuery.isPending}
        match={primaryUpcomingMatch(upcomingQuery.data ?? [])}
        onOpen={(matchId) => router.push(matchRouteFor(matchId))}
        onRetry={() => void upcomingQuery.refetch()}
      />

      <Surface tone="brand" padding="medium" style={styles.compactCard}>
        <View style={styles.compactCopy}>
          <AppText variant="eyebrow" tone="brand">
            {t('home.performance').toUpperCase()}
          </AppText>
          <AppText variant="heading">{t('home.statistics')}</AppText>
        </View>
        <Button
          fullWidth={false}
          label={t('home.viewRanking')}
          onPress={() => router.dismissTo(statisticsRoute())}
          variant="secondary"
        />
      </Surface>

      <Surface padding="medium" style={styles.profileCard}>
        <View style={styles.profileIdentity}>
          <Avatar
            name={state.currentUser.player.name}
            url={state.currentUser.player.avatarUrl}
          />
          <View style={styles.profileCopy}>
            <AppText variant="bodyStrong">
              {state.currentUser.player.name}
            </AppText>
            <AppText variant="caption" tone="muted">
              {roleLabel}
            </AppText>
          </View>
          <StatusPill
            label={active ? t('status.active') : t('status.inactive')}
            tone={active ? 'success' : 'neutral'}
          />
        </View>
        <View style={[styles.profileAction, { borderTopColor: colors.border }]}>
          <Button
            label={t('home.editProfile')}
            onPress={() => router.push('/profile' as Href)}
            variant="secondary"
          />
        </View>
      </Surface>
    </AppScreen>
  );
}

function UpcomingMatchSection({
  error,
  language,
  loading,
  match,
  onOpen,
  onRetry,
}: {
  error: boolean;
  language: 'cs' | 'en';
  loading: boolean;
  match: ReturnType<typeof primaryUpcomingMatch>;
  onOpen(matchId: string): void;
  onRetry(): void;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <Surface tone="muted" padding="medium" style={styles.stateCard}>
        <AppText variant="heading">{t('home.loadingMatch')}</AppText>
      </Surface>
    );
  }
  if (error) {
    return (
      <View style={styles.stateCard}>
        <FeedbackBanner
          tone="error"
          title={t('home.matchUnavailable')}
          message={t('common.connectionRetry')}
        />
        <Button
          label={t('common.retry')}
          onPress={onRetry}
          variant="secondary"
        />
      </View>
    );
  }
  if (!match) {
    return (
      <Surface tone="muted" padding="medium" style={styles.stateCard}>
        <AppText variant="heading">{t('home.noMatch')}</AppText>
        <AppText tone="muted">{t('home.noMatchHint')}</AppText>
      </Surface>
    );
  }

  const attendance =
    match.myAttendance === 'GOING'
      ? t('home.attendanceGoing')
      : match.myAttendance === 'NOT_GOING'
        ? t('home.attendanceNotGoing')
        : t('home.attendanceUnanswered');
  return (
    <Surface style={styles.upcomingCard}>
      <View style={styles.matchTopline}>
        <StatusPill
          label={
            match.status === 'IN_PROGRESS'
              ? t('status.inProgress')
              : t('status.open')
          }
          tone={match.status === 'IN_PROGRESS' ? 'info' : 'success'}
        />
        <AppText variant="caption" tone="muted">
          {attendance}
        </AppText>
      </View>
      <View style={styles.matchCopy}>
        <AppText variant="heading">{match.sport.name}</AppText>
        <AppText variant="bodyStrong">
          {formatMatchDate(match.startsAt, language)}
        </AppText>
        {match.location ? (
          <AppText tone="muted">{match.location}</AppText>
        ) : null}
      </View>
      <Button
        label={
          match.status === 'IN_PROGRESS'
            ? t('home.openMatch')
            : t('home.viewAttendance')
        }
        onPress={() => onOpen(match.id)}
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  hero: { gap: spacing.xs, maxWidth: 600 },
  stateCard: { gap: spacing.sm },
  upcomingCard: { gap: spacing.md },
  matchTopline: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  matchCopy: { gap: spacing.xxs },
  compactCard: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  compactCopy: { flex: 1, gap: spacing.xxs, minWidth: 180 },
  profileCard: { gap: spacing.md },
  profileIdentity: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  profileCopy: { flex: 1, minWidth: 120 },
  profileAction: { borderTopWidth: 1, paddingTop: spacing.md },
});
