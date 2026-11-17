import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Card, FeedbackBanner, spacing, useTheme } from '@teamizer/ui';

import type { MatchDetail } from '../api/contracts';
import { MatchInformation } from './open-match-view';
import { MatchTeamColumns } from './match-team-columns';

export function FinishedMatchView({
  cleanupWarning,
  match,
  message,
}: {
  cleanupWarning?: string | null;
  match: MatchDetail;
  message?: string | null;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.screenSections}>
      {message ? <FeedbackBanner tone="success" message={message} /> : null}
      {cleanupWarning ? (
        <FeedbackBanner tone="warning" message={cleanupWarning} />
      ) : null}
      <MatchInformation match={match} />
      {match.result ? (
        <FinishedMatchResultCard match={match} />
      ) : (
        <FeedbackBanner tone="error" message={t('match.unreadableResult')} />
      )}
    </View>
  );
}

export function FinishedMatchResultCard({ match }: { match: MatchDetail }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const result = match.result;

  if (!result) {
    return null;
  }

  const goalsByPlayerId = new Map(
    result.playerGoals.map(({ playerId, goals }) => [playerId, goals]),
  );
  const teamAPlayers =
    match.teams?.find(({ side }) => side === 'A')?.players ?? [];
  const teamBPlayers =
    match.teams?.find(({ side }) => side === 'B')?.players ?? [];

  return (
    <Card padding="compact" style={styles.resultCard}>
      <View style={styles.scoreRow}>
        <AppText
          accessibilityLabel={`${t('common.team', { side: 'A' })}, ${result.score.teamA}`}
          style={[styles.scoreValue, { color: colors.teamAText }]}
          variant="score"
        >
          {result.score.teamA}
        </AppText>
        <AppText
          accessibilityElementsHidden
          style={styles.scoreColon}
          variant="title"
          tone="subtle"
        >
          :
        </AppText>
        <AppText
          accessibilityLabel={`${t('common.team', { side: 'B' })}, ${result.score.teamB}`}
          style={[styles.scoreValue, { color: colors.teamBText }]}
          variant="score"
        >
          {result.score.teamB}
        </AppText>
      </View>
      <MatchTeamColumns
        goalsByPlayerId={goalsByPlayerId}
        showLabels={false}
        teamAPlayers={teamAPlayers}
        teamBPlayers={teamBPlayers}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  screenSections: { gap: spacing.md },
  resultCard: { gap: spacing.sm },
  scoreRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    position: 'relative',
  },
  scoreColon: {
    left: 0,
    position: 'absolute',
    right: 0,
    textAlign: 'center',
  },
  scoreValue: { flex: 1, textAlign: 'center' },
});
