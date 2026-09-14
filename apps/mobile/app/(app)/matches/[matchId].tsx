import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Avatar,
  Button,
  FeedbackBanner,
  layout,
  radii,
  spacing,
  StatusPill,
  Surface,
  useTheme,
} from '@teamizer/ui';

import { ApiClientError } from '../../../src/api/authenticated-api-client';
import type { MatchDetail, MatchTeam } from '../../../src/api/contracts';
import { formatMatchDate } from '../../../src/matches/match-flow';
import { OpenMatchView } from '../../../src/matches/open-match-view';
import {
  matchQueryKeys,
  publishMatchState,
} from '../../../src/matches/match-query-keys';
import { matchViewportKey } from '../../../src/navigation/match-navigation';
import { useAppServices } from '../../../src/providers/app-services-context';
import { usePreferences } from '../../../src/preferences/preferences-context';
import { useSession } from '../../../src/session/session-context';
import { expoCompletionCrypto } from '../../../src/scoring/completion-crypto';
import type { LocalMatchDraftV1 } from '../../../src/scoring/local-match-draft';
import { SCORING_PLAYER_GOAL_TARGET_MIN_HEIGHT } from '../../../src/scoring/scoring-layout';
import {
  ScoringSessionController,
  shouldInitializeScoringSession,
  type MatchCompletionGateway,
  type ScoringSessionState,
} from '../../../src/scoring/scoring-session-controller';
import { AppScreen } from '../../../src/ui/app-screen';
import { FoundationScreen } from '../../../src/ui/foundation-screen';

export default function MatchScoringRoute() {
  const { t } = useTranslation();
  const parameters = useLocalSearchParams<{ matchId?: string | string[] }>();
  const matchId =
    typeof parameters.matchId === 'string' ? parameters.matchId : null;
  const { state: session } = useSession();
  const scoringOwnerId =
    session.status === 'AUTHENTICATED' ? session.currentUser.user.id : null;
  const { apiClient, scoringDraftRepository } = useAppServices();
  const queryClient = useQueryClient();
  const matchQuery = useQuery({
    queryKey: matchQueryKeys.detail(matchId ?? 'invalid'),
    queryFn: () => apiClient.getMatch(matchId ?? ''),
    enabled: matchId !== null,
  });
  const refetchMatch = matchQuery.refetch;
  const controller = useMemo(() => {
    // Reading both values makes this controller an explicit per-owner/per-Match
    // session boundary even though its gateway methods accept Match IDs.
    void matchId;
    void scoringOwnerId;
    const gateway: MatchCompletionGateway = {
      complete: async (id, request, idempotencyKey) => {
        const response = await apiClient.completeMatch(
          id,
          request,
          idempotencyKey,
        );
        await publishMatchState(queryClient, response.match);
        return response;
      },
      refresh: async (id) => {
        await queryClient.invalidateQueries({
          queryKey: matchQueryKeys.detail(id),
          refetchType: 'none',
        });
        const match = await queryClient.fetchQuery({
          queryKey: matchQueryKeys.detail(id),
          queryFn: () => apiClient.getMatch(id),
        });
        await publishMatchState(queryClient, match);
        return match;
      },
    };

    return new ScoringSessionController(
      scoringDraftRepository,
      gateway,
      expoCompletionCrypto,
    );
  }, [apiClient, matchId, queryClient, scoringDraftRepository, scoringOwnerId]);
  const [scoringState, setScoringState] = useState<ScoringSessionState>(
    controller.currentState,
  );

  useEffect(() => controller.subscribe(setScoringState), [controller]);

  useEffect(() => {
    if (
      session.status === 'AUTHENTICATED' &&
      matchQuery.data &&
      shouldInitializeScoringSession(
        session.currentUser.player.status,
        matchQuery.data.status,
      )
    ) {
      void controller.initialize(session.currentUser.user.id, matchQuery.data);
    }
  }, [controller, matchQuery.data, session]);

  useEffect(() => {
    if (matchQuery.data) {
      void publishMatchState(queryClient, matchQuery.data);
    }
  }, [matchQuery.data, queryClient]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && matchId) {
        void refetchMatch();
      }
    });

    return () => subscription.remove();
  }, [matchId, refetchMatch]);

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
  state: ScoringSessionState;
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

  if (state.status === 'SCORING') {
    return (
      <ActiveScoring
        controller={controller}
        draft={state.draft}
        match={state.match}
        message={state.message}
      />
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
          variant="danger"
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
          variant="danger"
        />
      </View>
    );
  }

  if (state.status === 'FINISHED') {
    return (
      <FinishedMatch
        cleanupWarning={state.cleanupWarning ? t('match.cleanupWarning') : null}
        match={state.match}
        message={
          state.message?.startsWith('Another device')
            ? t('match.finalConflict')
            : state.message
              ? t('match.finalSaved')
              : null
        }
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

function ActiveScoring({
  controller,
  draft,
  match,
  message,
}: {
  controller: ScoringSessionController;
  draft: LocalMatchDraftV1;
  match: MatchDetail;
  message: string | null;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const pending = draft.completion.state === 'PENDING';

  const finish = async () => {
    setFinishing(true);
    try {
      await controller.finish();
    } finally {
      setFinishing(false);
      setConfirming(false);
    }
  };

  return (
    <View style={styles.sectionGap}>
      <Scoreboard score={draft.score} />
      {message ? (
        <FeedbackBanner
          tone={pending ? 'warning' : 'info'}
          message={
            pending
              ? t('match.completionPending')
              : message.startsWith('Your saved score')
                ? t('match.restored')
                : t('match.completionUnconfirmed')
          }
        />
      ) : null}
      <PlayerScoringTeams
        controller={controller}
        disabled={pending}
        draft={draft}
        match={match}
      />
      <Surface tone="muted" style={styles.finishArea}>
        <View style={styles.finishCopy}>
          <AppText variant="heading">{t('match.finish')}</AppText>
          <AppText tone="muted">{t('match.finishHint')}</AppText>
        </View>
        {confirming && !pending ? (
          <View style={styles.confirmation}>
            <FeedbackBanner
              tone="warning"
              title={t('match.submitResult')}
              message={t('match.authoritativeResult', {
                score: `${draft.score.teamA}–${draft.score.teamB}`,
              })}
            />
            <View style={styles.buttonRow}>
              <Button
                disabled={finishing}
                fullWidth={false}
                label={t('common.cancel')}
                onPress={() => setConfirming(false)}
                variant="secondary"
              />
              <Button
                busy={finishing}
                fullWidth={false}
                label={t('match.confirmFinish')}
                onPress={() => void finish()}
              />
            </View>
          </View>
        ) : (
          <Button
            busy={finishing}
            label={pending ? t('match.retryCompletion') : t('match.finish')}
            onPress={() => (pending ? void finish() : setConfirming(true))}
            variant={pending ? 'primary' : 'danger'}
          />
        )}
      </Surface>
    </View>
  );
}

function Scoreboard({ score }: { score: LocalMatchDraftV1['score'] }) {
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

function PlayerScoringTeams({
  controller,
  disabled,
  draft,
  match,
}: {
  controller: ScoringSessionController;
  disabled: boolean;
  draft: LocalMatchDraftV1;
  match: MatchDetail;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const teams = orderedTeams(match);

  return (
    <View style={[styles.teamColumns, width >= 700 && styles.teamColumnsWide]}>
      {teams.map((team) => (
        <Surface key={team.id} padding="none" style={styles.scoringTeam}>
          <View
            style={[
              styles.teamTitle,
              {
                backgroundColor:
                  team.side === 'A' ? colors.teamASurface : colors.teamBSurface,
              },
            ]}
          >
            <AppText
              variant="heading"
              style={{
                color: team.side === 'A' ? colors.teamAText : colors.teamBText,
              }}
            >
              {t('common.team', { side: team.side })}
            </AppText>
          </View>
          {team.players.map((player) => (
            <PlayerGoalRow
              avatarUrl={player.avatarUrl}
              disabled={disabled}
              goals={draft.playerGoals[player.id] ?? 0}
              key={player.id}
              name={player.name}
              onDecrement={() => void controller.decrement(player.id)}
              onIncrement={() => void controller.increment(player.id)}
            />
          ))}
        </Surface>
      ))}
    </View>
  );
}

function PlayerGoalRow({
  avatarUrl,
  disabled,
  goals,
  name,
  onDecrement,
  onIncrement,
}: {
  avatarUrl: string | null;
  disabled: boolean;
  goals: number;
  name: string;
  onDecrement(): void;
  onIncrement(): void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.playerRow, { borderTopColor: colors.border }]}>
      <Pressable
        accessibilityHint={t('match.addGoalHint')}
        accessibilityLabel={t('match.addGoalLabel', { name, count: goals })}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onIncrement}
        style={({ pressed }) => [
          styles.addGoalTarget,
          pressed && !disabled && { backgroundColor: colors.accentSoft },
          disabled && styles.disabled,
        ]}
      >
        <View style={styles.playerIdentity}>
          <Avatar name={name} url={avatarUrl} />
          <View style={styles.playerCopy}>
            <AppText variant="bodyStrong">{name}</AppText>
            <AppText variant="caption" tone="muted">
              {t('match.tapAdd')}
            </AppText>
          </View>
        </View>
        <AppText variant="title">{goals}</AppText>
      </Pressable>
      <Pressable
        accessibilityLabel={t('match.removeGoal', { name })}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || goals === 0 }}
        disabled={disabled || goals === 0}
        onPress={onDecrement}
        style={({ pressed }) => [
          styles.decrement,
          {
            borderLeftColor: colors.border,
          },
          pressed && { backgroundColor: colors.surfaceSubtle },
          (disabled || goals === 0) && styles.disabled,
        ]}
      >
        <AppText variant="heading" tone="muted">
          −
        </AppText>
      </Pressable>
    </View>
  );
}

function FinalTeamRosters({ match }: { match: MatchDetail }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  return (
    <View style={[styles.teamColumns, width >= 700 && styles.teamColumnsWide]}>
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
      <Scoreboard score={result.score} />
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
  scoringTeam: { flex: 1, minWidth: 0, overflow: 'hidden' },
  teamTitle: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  playerRow: {
    alignItems: 'stretch',
    borderTopWidth: 1,
    flexDirection: 'row',
    minHeight: SCORING_PLAYER_GOAL_TARGET_MIN_HEIGHT,
  },
  addGoalTarget: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  playerIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  playerCopy: { flex: 1, minWidth: 0 },
  decrement: {
    alignItems: 'center',
    borderLeftWidth: 1,
    justifyContent: 'center',
    minWidth: layout.minimumTouchTarget + 8,
  },
  disabled: { opacity: 0.45 },
  finishArea: { gap: spacing.lg, marginTop: spacing.lg },
  finishCopy: { gap: spacing.xs },
  confirmation: { gap: spacing.md },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  finalPlayerRow: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: layout.minimumTouchTarget,
  },
  finalPlayerIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
});
