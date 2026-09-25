import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Button,
  Card,
  FeedbackBanner,
  spacing,
  StatusPill,
} from '@teamizer/ui';

import type { UpcomingMatch } from '../../../src/api/contracts';
import {
  formatMatchDate,
  matchRouteFor,
} from '../../../src/matches/match-flow';
import { matchQueryKeys } from '../../../src/matches/match-query-keys';
import { usePreferences } from '../../../src/preferences/preferences-context';
import { useAppServices } from '../../../src/providers/app-services-context';
import { AppScreen } from '../../../src/ui/app-screen';

export default function MatchesIndexRoute() {
  const { apiClient } = useAppServices();
  const { language } = usePreferences();
  const { t } = useTranslation();
  const matchesQuery = useQuery({
    queryKey: matchQueryKeys.upcoming,
    queryFn: () => apiClient.getUpcomingMatches(),
  });

  return (
    <AppScreen scroll underHeader contentStyle={styles.screen}>
      {matchesQuery.isPending ? (
        <Card style={styles.stateCard}>
          <AppText variant="heading">{t('matchesIndex.loading')}</AppText>
        </Card>
      ) : null}

      {matchesQuery.isError ? (
        <View style={styles.stateCard}>
          <FeedbackBanner
            message={t('common.connectionRetry')}
            title={t('matchesIndex.unavailable')}
            tone="error"
          />
          <Button
            label={t('common.retry')}
            onPress={() => void matchesQuery.refetch()}
            variant="secondary"
          />
        </View>
      ) : null}

      {matchesQuery.isSuccess && matchesQuery.data.length === 0 ? (
        <Card style={styles.stateCard}>
          <AppText variant="heading">{t('matchesIndex.empty')}</AppText>
          <AppText tone="muted">{t('matchesIndex.emptyHint')}</AppText>
        </Card>
      ) : null}

      {matchesQuery.isSuccess && matchesQuery.data.length > 0 ? (
        <View
          accessibilityLabel={t('matchesIndex.listLabel')}
          style={styles.list}
        >
          {matchesQuery.data.map((match) => (
            <MatchListItem
              key={match.id}
              language={language}
              match={match}
              onOpen={() => router.push(matchRouteFor(match.id))}
            />
          ))}
        </View>
      ) : null}
    </AppScreen>
  );
}

function MatchListItem({
  language,
  match,
  onOpen,
}: {
  language: 'cs' | 'en';
  match: UpcomingMatch;
  onOpen(): void;
}) {
  const { t } = useTranslation();
  const attendance =
    match.myAttendance === 'GOING'
      ? t('home.attendanceGoing')
      : match.myAttendance === 'NOT_GOING'
        ? t('home.attendanceNotGoing')
        : t('home.attendanceUnanswered');

  return (
    <Pressable
      accessibilityHint={t('matchesIndex.openHint')}
      accessibilityLabel={`${match.sport.name}, ${formatMatchDate(match.startsAt, language)}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card style={styles.matchCard}>
        <View style={styles.topline}>
          <StatusPill
            label={
              match.status === 'IN_PROGRESS'
                ? t('status.inProgress')
                : t('status.open')
            }
            tone={match.status === 'IN_PROGRESS' ? 'info' : 'success'}
          />
          <AppText tone="muted" variant="caption">
            {attendance}
          </AppText>
        </View>
        <AppText variant="heading">{match.sport.name}</AppText>
        <AppText variant="bodyStrong">
          {formatMatchDate(match.startsAt, language)}
        </AppText>
        {match.location ? (
          <AppText tone="muted">{match.location}</AppText>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  stateCard: { gap: spacing.md },
  list: { gap: spacing.sm },
  matchCard: { gap: spacing.sm },
  topline: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  pressed: { opacity: 0.72 },
});
