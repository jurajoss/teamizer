import { useLocalSearchParams } from 'expo-router';
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
import type { MatchDetail, MatchTeam } from '../../../src/api/contracts';
import { formatMatchDate } from '../../../src/matches/match-flow';
import { OpenMatchView } from '../../../src/matches/open-match-view';
import {
  scoringIdentityForSession,
  useMatchRouteController,
} from '../../../src/matches/use-match-route';
import { matchViewportKey } from '../../../src/navigation/match-navigation';
import { usePrimaryNavigationHiddenWhileFocused } from '../../../src/navigation/primary-navigation-visibility';
import { usePreferences } from '../../../src/preferences/preferences-context';
import { useSession } from '../../../src/session/session-context';
import { ActiveScoringScreen } from '../../../src/scoring/active-scoring-screen';
import type {
  ScoringSessionController,
  ScoringSessionState,
} from '../../../src/scoring/scoring-session-controller';
import {
  completionOutcomeTranslationKey,
  isActiveScoringStatus,
} from '../../../src/scoring/scoring-session-presentation';
import { AppScreen } from '../../../src/ui/app-screen';
import { FoundationScreen } from '../../../src/ui/foundation-screen';

export default function MatchScoringRoute() {
  const { t } = useTranslation();
  const parameters = useLocalSearchParams<{ matchId?: string | string[] }>();
  const matchId =
    typeof parameters.matchId === 'string' ? parameters.matchId : null;
  const { state: session } = useSession();
  const currentUser =
    session.status === 'AUTHENTICATED' ? session.currentUser : null;
  const { apiClient, controller, matchQuery, scoringState } =
    useMatchRouteController({
      matchId,
      scoringIdentity: scoringIdentityForSession(currentUser),
    });
  usePrimaryNavigationHiddenWhileFocused(
    isActiveScoringStatus(scoringState.status) &&
      matchQuery.data?.status === 'IN_PROGRESS' &&
      currentUser?.player.status === 'ACTIVE',
  );

  if (!matchId) {
    return (
      <MatchPageFrame>
        <FeedbackBanner
          tone="error"
          title={t('match.unavailable')}
          message={t('match.missingId')}
        />
      </MatchPageFrame>
    );
  }

  if (matchQuery.isPending) {
    return (
      <MatchPageFrame>
        <Surface tone="muted" style={styles.centeredState}>
          <AppText variant="heading">{t('match.loading')}</AppText>
        </Surface>
      </MatchPageFrame>
    );
  }

  if (matchQuery.isError) {
    const notFound =
      matchQuery.error instanceof ApiClientError &&
      matchQuery.error.status === 404;
    return (
      <MatchPageFrame>
        <FeedbackBanner
          tone="error"
          title={notFound ? t('match.unavailable') : t('match.loadFailed')}
          message={notFound ? t('match.notFound') : t('common.connectionRetry')}
        />
        {!notFound ? (
          <Button
            label={t('common.retry')}
            onPress={() => void matchQuery.refetch()}
          />
        ) : null}
      </MatchPageFrame>
    );
  }

  if (session.status !== 'AUTHENTICATED') {
    return <FoundationScreen busy message={t('auth.checking')} />;
  }

  if (matchQuery.data.status === 'OPEN_FOR_REGISTRATION') {
    return (
      <MatchPageFrame key={matchViewportKey(matchQuery.data.status)}>
        <MatchHeading match={matchQuery.data} />
        <OpenMatchView
          apiClient={apiClient}
          currentUser={session.currentUser}
          key={`${matchQuery.data.id}:${matchQuery.data.stateVersion}`}
          match={matchQuery.data}
        />
      </MatchPageFrame>
    );
  }

  if (matchQuery.data.status === 'CANCELLED') {
    return (
      <MatchPageFrame key={matchViewportKey(matchQuery.data.status)}>
        <MatchHeading match={matchQuery.data} />
        <FeedbackBanner
          tone="warning"
          title={t('match.cancelled')}
          message={t('match.cancelledHint')}
        />
      </MatchPageFrame>
    );
  }

  if (matchQuery.data.status === 'FINISHED') {
    return (
      <MatchPageFrame key={matchViewportKey(matchQuery.data.status)}>
        <MatchHeading match={matchQuery.data} />
        <FinishedMatch match={matchQuery.data} />
      </MatchPageFrame>
    );
  }

  if (session.currentUser.player.status !== 'ACTIVE') {
    return (
      <MatchPageFrame
        key={matchViewportKey(matchQuery.data.status, 'INACTIVE')}
      >
        <MatchHeading match={matchQuery.data} />
        <FinalTeamRosters match={matchQuery.data} />
        <FeedbackBanner
          tone="warning"
          title={t('match.scoringUnavailable')}
          message={t('match.inactiveScoring')}
        />
      </MatchPageFrame>
    );
  }

  if (scoringState.status === 'LOADING') {
    return (
      <MatchPageFrame
        key={matchViewportKey(matchQuery.data.status, scoringState.status)}
      >
        <MatchHeading match={matchQuery.data} />
        <Surface tone="muted" style={styles.centeredState}>
          <AppText variant="heading">{t('match.checkingScore')}</AppText>
        </Surface>
      </MatchPageFrame>
    );
  }

  if (scoringState.match.stateVersion !== matchQuery.data.stateVersion) {
    return (
      <MatchPageFrame
        key={matchViewportKey(matchQuery.data.status, scoringState.status)}
      >
        <MatchHeading match={matchQuery.data} />
        <Surface tone="muted" style={styles.centeredState}>
          <AppText variant="heading">{t('match.refreshing')}</AppText>
        </Surface>
      </MatchPageFrame>
    );
  }

  if (scoringState.status === 'SCORING') {
    return (
      <ActiveScoringScreen
        draft={scoringState.draft}
        key={matchViewportKey(matchQuery.data.status, scoringState.status)}
        match={scoringState.match}
        notice={scoringState.notice}
        onAddGoal={(playerId) => void controller.increment(playerId)}
        onFinish={() => controller.finish()}
        onRemoveGoal={(playerId) => void controller.decrement(playerId)}
      />
    );
  }

  return (
    <MatchPageFrame
      key={matchViewportKey(matchQuery.data.status, scoringState.status)}
    >
      <MatchHeading match={scoringState.match} />
      <ScoringStateView controller={controller} state={scoringState} />
    </MatchPageFrame>
  );
}

function MatchPageFrame({ children }: { children: React.ReactNode }) {
  return (
    <AppScreen scroll underHeader contentStyle={styles.screen}>
      {children}
    </AppScreen>
  );
}

function MatchHeading({ match }: { match: MatchDetail }) {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const statusLabel = {
    OPEN_FOR_REGISTRATION: t('status.open'),
    IN_PROGRESS: t('status.inProgress'),
    FINISHED: t('status.finished'),
    CANCELLED: t('status.cancelled'),
  }[match.status];

  return (
    <View style={styles.heading}>
      <StatusPill
        label={statusLabel}
        tone={match.status === 'IN_PROGRESS' ? 'info' : 'neutral'}
      />
      <View style={styles.headingCopy}>
        <AppText accessibilityRole="header" variant="title">
          {match.sport.name}
        </AppText>
        <AppText tone="muted">
          {formatMatchDate(match.startsAt, language)}
          {match.location ? ` · ${match.location}` : ''}
        </AppText>
      </View>
    </View>
  );
}

function ScoringStateView({
  controller,
  state,
}: {
  controller: ScoringSessionController;
  state: Exclude<ScoringSessionState, { status: 'SCORING' }>;
}) {
  const { t } = useTranslation();
  if (state.status === 'LOADING') {
    return null;
  }

  if (state.status === 'READY_TO_START') {
    return (
      <View style={styles.sectionGap}>
        <FinalTeamRosters match={state.match} />
        <FeedbackBanner
          tone="info"
          title={t('match.scoreOnDevice')}
          message={t('match.scoreOnDeviceHint')}
        />
        <Button
          label={t('match.startScoring')}
          onPress={() => void controller.startScoring()}
        />
      </View>
    );
  }

  if (state.status === 'CORRUPT_DRAFT' || state.status === 'STALE_DRAFT') {
    return (
      <View style={styles.sectionGap}>
        <FeedbackBanner
          tone="error"
          title={
            state.status === 'CORRUPT_DRAFT'
              ? t('match.savedCorrupt')
              : t('match.savedStale')
          }
          message={t('match.discardHint')}
        />
        <Button
          label={t('match.discardDraft')}
          onPress={() => void controller.discardDraft()}
          variant="destructive"
        />
      </View>
    );
  }

  if (state.status === 'BLOCKED') {
    return (
      <View style={styles.sectionGap}>
        <FeedbackBanner
          tone="error"
          title={t('match.scoringBlocked')}
          message={t('match.storageBlocked')}
        />
        <Button
          label={t('match.discardDraft')}
          onPress={() => void controller.discardDraft()}
          variant="destructive"
        />
      </View>
    );
  }

  if (state.status === 'FINISHED') {
    const messageKey = completionOutcomeTranslationKey(state.outcome);
    return (
      <FinishedMatch
        cleanupWarning={state.cleanupWarning ? t('match.cleanupWarning') : null}
        match={state.match}
        message={messageKey ? t(messageKey) : null}
      />
    );
  }

  return (
    <FeedbackBanner
      tone="warning"
      title={t('match.scoringUnavailable')}
      message={t('match.cancelledHint')}
    />
  );
}

function FinishedScoreboard({
  score,
}: {
  score: NonNullable<MatchDetail['result']>['score'];
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Surface padding="medium" style={styles.scoreboard}>
      <View
        style={[styles.scoreSide, { backgroundColor: colors.teamASurface }]}
      >
        <AppText variant="eyebrow" style={{ color: colors.teamAText }}>
          {t('common.team', { side: 'A' }).toUpperCase()}
        </AppText>
        <AppText
          accessibilityLabel={`${t('common.team', { side: 'A' })}, ${score.teamA}`}
          variant="score"
        >
          {score.teamA}
        </AppText>
      </View>
      <AppText accessibilityElementsHidden variant="heading" tone="subtle">
        –
      </AppText>
      <View
        style={[styles.scoreSide, { backgroundColor: colors.teamBSurface }]}
      >
        <AppText variant="eyebrow" style={{ color: colors.teamBText }}>
          {t('common.team', { side: 'B' }).toUpperCase()}
        </AppText>
        <AppText
          accessibilityLabel={`${t('common.team', { side: 'B' })}, ${score.teamB}`}
          variant="score"
        >
          {score.teamB}
        </AppText>
      </View>
    </Surface>
  );
}

function FinalTeamRosters({ match }: { match: MatchDetail }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { isTablet } = useResponsiveLayout();

  return (
    <View style={[styles.teamColumns, isTablet && styles.teamColumnsWide]}>
      {orderedTeams(match).map((team) => (
        <Surface key={team.id} style={styles.rosterTeam}>
          <AppText
            variant="eyebrow"
            style={{
              color: team.side === 'A' ? colors.teamAText : colors.teamBText,
            }}
          >
            {t('common.team', { side: team.side }).toUpperCase()}
          </AppText>
          {team.players.map((player) => (
            <View key={player.id} style={styles.rosterRow}>
              <Avatar name={player.name} size="small" url={player.avatarUrl} />
              <AppText variant="bodyStrong">{player.name}</AppText>
            </View>
          ))}
        </Surface>
      ))}
    </View>
  );
}

function FinishedMatch({
  cleanupWarning,
  match,
  message,
}: {
  cleanupWarning?: string | null;
  match: MatchDetail;
  message?: string | null;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const result = match.result;

  if (!result) {
    return (
      <FeedbackBanner tone="error" message={t('match.unreadableResult')} />
    );
  }

  const goals = new Map(
    result.playerGoals.map(({ playerId, goals: total }) => [playerId, total]),
  );

  return (
    <View style={styles.sectionGap}>
      {message ? <FeedbackBanner tone="success" message={message} /> : null}
      {cleanupWarning ? (
        <FeedbackBanner tone="warning" message={cleanupWarning} />
      ) : null}
      <FinishedScoreboard score={result.score} />
      <View style={styles.teamColumns}>
        {orderedTeams(match).map((team) => (
          <Surface key={team.id} style={styles.rosterTeam}>
            <AppText
              variant="heading"
              style={{
                color: team.side === 'A' ? colors.teamAText : colors.teamBText,
              }}
            >
              {t('common.team', { side: team.side })}
            </AppText>
            {team.players.map((player) => (
              <View
                key={player.id}
                style={[
                  styles.finalPlayerRow,
                  { borderTopColor: colors.border },
                ]}
              >
                <View style={styles.finalPlayerIdentity}>
                  <Avatar
                    name={player.name}
                    size="small"
                    url={player.avatarUrl}
                  />
                  <AppText variant="bodyStrong">{player.name}</AppText>
                </View>
                <AppText variant="bodyStrong">
                  {t('common.goalCount', { count: goals.get(player.id) ?? 0 })}
                </AppText>
              </View>
            ))}
          </Surface>
        ))}
      </View>
    </View>
  );
}

function orderedTeams(match: MatchDetail): MatchTeam[] {
  return [...(match.teams ?? [])].sort((first, second) =>
    first.side.localeCompare(second.side),
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  heading: { gap: spacing.md },
  headingCopy: { gap: spacing.xxs },
  sectionGap: { gap: spacing.xl },
  centeredState: { gap: spacing.xs, marginTop: spacing.xxl },
  teamColumns: { gap: spacing.md },
  teamColumnsWide: { alignItems: 'flex-start', flexDirection: 'row' },
  rosterTeam: { flex: 1, gap: spacing.md, minWidth: 0 },
  rosterRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  scoreboard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  scoreSide: {
    alignItems: 'center',
    borderRadius: radii.md,
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  finalPlayerRow: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: sizes.minimumTouchTarget,
  },
  finalPlayerIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
});
