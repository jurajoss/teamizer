import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  AppText,
  Avatar,
  BrandLockup,
  Button,
  colors,
  FeedbackBanner,
  layout,
  radii,
  spacing,
  StatusPill,
  Surface,
} from '@teamizer/ui';

import { ApiClientError } from '../../../src/api/authenticated-api-client';
import type { MatchDetail, MatchTeam } from '../../../src/api/contracts';
import { formatMatchDate } from '../../../src/matches/match-flow';
import { OpenMatchView } from '../../../src/matches/open-match-view';
import {
  matchQueryKeys,
  publishMatchState,
} from '../../../src/matches/match-query-keys';
import {
  leaveMatch,
  matchViewportKey,
} from '../../../src/navigation/match-navigation';
import { useAppServices } from '../../../src/providers/app-services-context';
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
          title="Match unavailable"
          message="This Match link is missing a valid Match ID."
        />
      </MatchPageFrame>
    );
  }

  if (matchQuery.isPending) {
    return (
      <MatchPageFrame>
        <Surface tone="muted" style={styles.centeredState}>
          <AppText variant="heading">Loading Match…</AppText>
          <AppText tone="muted">
            Checking final teams and any score saved on this device.
          </AppText>
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
          title={notFound ? 'Match unavailable' : 'Match could not load'}
          message={
            notFound
              ? 'This Match does not exist or is no longer available.'
              : 'Check your connection and try again. Your local score has not been changed.'
          }
        />
        {!notFound ? (
          <Button label="Try again" onPress={() => void matchQuery.refetch()} />
        ) : null}
      </MatchPageFrame>
    );
  }

  if (session.status !== 'AUTHENTICATED') {
    return <FoundationScreen busy message="Checking your Teamizer profile…" />;
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
          title="Match cancelled"
          message="This Match is read-only. Attendance, teams, Start, and scoring are unavailable."
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
          title="Scoring unavailable"
          message="Your Player is inactive. You can view the final teams, but Match scoring requires an active Player."
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
          <AppText variant="heading">Checking local score…</AppText>
          <AppText tone="muted">
            Validating this account’s durable draft and final teams.
          </AppText>
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
          <AppText variant="heading">Refreshing Match state…</AppText>
          <AppText tone="muted">
            Scoring controls are paused while the authoritative result is
            checked.
          </AppText>
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
    <AppScreen scroll contentStyle={styles.screen}>
      <View style={styles.topBar}>
        <BrandLockup compact />
        <Button
          fullWidth={false}
          label="Back"
          onPress={() => leaveMatch(router)}
          variant="ghost"
        />
      </View>
      {children}
    </AppScreen>
  );
}

function MatchHeading({ match }: { match: MatchDetail }) {
  const statusLabel = match.status.replaceAll('_', ' ');

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
          {formatMatchDate(match.startsAt)}
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
  if (state.status === 'LOADING') {
    return null;
  }

  if (state.status === 'READY_TO_START') {
    return (
      <View style={styles.sectionGap}>
        <FinalTeamRosters match={state.match} />
        <FeedbackBanner
          tone="info"
          title="Score on this device"
          message="Scoring starts at 0–0 and stays only on this device until you finish the Match."
        />
        <Button
          label="Start scoring"
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
              ? 'Saved score is corrupt'
              : 'Saved score is stale'
          }
          message={`${state.message} Scoring stays blocked until you discard this unrecoverable local draft.`}
        />
        <Button
          label="Discard local draft"
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
          title="Scoring is blocked"
          message={state.message}
        />
        <Button
          label="Discard local draft"
          onPress={() => void controller.discardDraft()}
          variant="danger"
        />
      </View>
    );
  }

  if (state.status === 'FINISHED') {
    return (
      <FinishedMatch
        cleanupWarning={state.cleanupWarning}
        match={state.match}
        message={state.message}
      />
    );
  }

  return (
    <FeedbackBanner
      tone="warning"
      title="Scoring unavailable"
      message={state.message}
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
        <FeedbackBanner tone={pending ? 'warning' : 'info'} message={message} />
      ) : null}
      <PlayerScoringTeams
        controller={controller}
        disabled={pending}
        draft={draft}
        match={match}
      />
      <Surface tone="muted" style={styles.finishArea}>
        <View style={styles.finishCopy}>
          <AppText variant="heading">Finish Match</AppText>
          <AppText tone="muted">
            Completion is irreversible. Only the first submitted result wins.
          </AppText>
        </View>
        {confirming && !pending ? (
          <View style={styles.confirmation}>
            <FeedbackBanner
              tone="warning"
              title="Submit this final result?"
              message={`${draft.score.teamA}–${draft.score.teamB} will become the authoritative Match result.`}
            />
            <View style={styles.buttonRow}>
              <Button
                disabled={finishing}
                fullWidth={false}
                label="Cancel"
                onPress={() => setConfirming(false)}
                variant="secondary"
              />
              <Button
                busy={finishing}
                fullWidth={false}
                label="Confirm finish"
                onPress={() => void finish()}
              />
            </View>
          </View>
        ) : (
          <Button
            busy={finishing}
            label={pending ? 'Retry completion' : 'Finish Match'}
            onPress={() => (pending ? void finish() : setConfirming(true))}
            variant={pending ? 'primary' : 'danger'}
          />
        )}
      </Surface>
    </View>
  );
}

function Scoreboard({ score }: { score: LocalMatchDraftV1['score'] }) {
  return (
    <Surface padding="medium" style={styles.scoreboard}>
      <View style={[styles.scoreSide, styles.teamASoft]}>
        <AppText variant="eyebrow" style={styles.teamAText}>
          TEAM A
        </AppText>
        <AppText accessibilityLabel={`Team A, ${score.teamA}`} variant="score">
          {score.teamA}
        </AppText>
      </View>
      <AppText accessibilityElementsHidden variant="heading" tone="subtle">
        –
      </AppText>
      <View style={[styles.scoreSide, styles.teamBSoft]}>
        <AppText variant="eyebrow" style={styles.teamBText}>
          TEAM B
        </AppText>
        <AppText accessibilityLabel={`Team B, ${score.teamB}`} variant="score">
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
  const { width } = useWindowDimensions();
  const teams = orderedTeams(match);

  return (
    <View style={[styles.teamColumns, width >= 700 && styles.teamColumnsWide]}>
      {teams.map((team) => (
        <Surface key={team.id} padding="none" style={styles.scoringTeam}>
          <View
            style={[
              styles.teamTitle,
              team.side === 'A' ? styles.teamASoft : styles.teamBSoft,
            ]}
          >
            <AppText
              variant="heading"
              style={team.side === 'A' ? styles.teamAText : styles.teamBText}
            >
              Team {team.side}
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
  return (
    <View style={styles.playerRow}>
      <Pressable
        accessibilityHint="Adds one goal"
        accessibilityLabel={`${name}, ${goals} goals, add one`}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onIncrement}
        style={({ pressed }) => [
          styles.addGoalTarget,
          pressed && !disabled && styles.addGoalPressed,
          disabled && styles.disabled,
        ]}
      >
        <View style={styles.playerIdentity}>
          <Avatar name={name} url={avatarUrl} />
          <View style={styles.playerCopy}>
            <AppText variant="bodyStrong">{name}</AppText>
            <AppText variant="caption" tone="muted">
              Tap to add +1
            </AppText>
          </View>
        </View>
        <AppText variant="title">{goals}</AppText>
      </Pressable>
      <Pressable
        accessibilityLabel={`Remove one goal from ${name}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || goals === 0 }}
        disabled={disabled || goals === 0}
        onPress={onDecrement}
        style={({ pressed }) => [
          styles.decrement,
          pressed && styles.decrementPressed,
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
  const { width } = useWindowDimensions();

  return (
    <View style={[styles.teamColumns, width >= 700 && styles.teamColumnsWide]}>
      {orderedTeams(match).map((team) => (
        <Surface key={team.id} style={styles.rosterTeam}>
          <AppText
            variant="eyebrow"
            style={team.side === 'A' ? styles.teamAText : styles.teamBText}
          >
            TEAM {team.side}
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
  const result = match.result;

  if (!result) {
    return (
      <FeedbackBanner
        tone="error"
        message="The server marked this Match finished without a readable result."
      />
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
              style={team.side === 'A' ? styles.teamAText : styles.teamBText}
            >
              Team {team.side}
            </AppText>
            {team.players.map((player) => (
              <View key={player.id} style={styles.finalPlayerRow}>
                <View style={styles.finalPlayerIdentity}>
                  <Avatar
                    name={player.name}
                    size="small"
                    url={player.avatarUrl}
                  />
                  <AppText variant="bodyStrong">{player.name}</AppText>
                </View>
                <AppText variant="bodyStrong">
                  {goals.get(player.id) ?? 0} goals
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
  screen: { gap: spacing.xxl },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
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
  teamASoft: { backgroundColor: colors.teamASoft },
  teamBSoft: { backgroundColor: colors.teamBSoft },
  teamAText: { color: colors.teamA },
  teamBText: { color: colors.teamB },
  scoringTeam: { flex: 1, minWidth: 0, overflow: 'hidden' },
  teamTitle: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  playerRow: {
    alignItems: 'stretch',
    borderTopColor: colors.border,
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
  addGoalPressed: { backgroundColor: colors.brandSoft },
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
    borderLeftColor: colors.border,
    borderLeftWidth: 1,
    justifyContent: 'center',
    minWidth: layout.minimumTouchTarget + 8,
  },
  decrementPressed: { backgroundColor: colors.surfaceMuted },
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
    borderTopColor: colors.border,
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
