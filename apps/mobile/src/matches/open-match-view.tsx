import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  AppText,
  Avatar,
  Button,
  colors,
  FeedbackBanner,
  layout,
  NumberStepper,
  spacing,
  StatusPill,
  Surface,
  TextField,
} from '@teamizer/ui';

import {
  ApiClientError,
  type AuthenticatedApiClient,
} from '../api/authenticated-api-client';
import type { Attendance, CurrentUser, MatchDetail } from '../api/contracts';
import {
  canMovePlayer,
  canShowAdminMatchControls,
  canSubmitStart,
  createTransientProposal,
  isStaleProposalConflict,
  movePlayer,
  proposalWasAdjusted,
  swapPlayers,
  type TransientTeamProposal,
  validateParticipantGroups,
  validateProposal,
} from './match-flow';
import {
  matchQueryKeys,
  publishMatchState,
  refreshMatchState,
} from './match-query-keys';

const attributeLabels = {
  speed: 'Speed',
  endurance: 'Endurance',
  defense: 'Defense',
  attack: 'Attack',
  technique: 'Technique',
} as const;

type AttributeKey = keyof typeof attributeLabels;
type GuestDraft = {
  name: string;
  attributes: Record<AttributeKey, number>;
};

const emptyGuest = (): GuestDraft => ({
  name: '',
  attributes: {
    speed: 5,
    endurance: 5,
    defense: 5,
    attack: 5,
    technique: 5,
  },
});

export function OpenMatchView({
  apiClient,
  currentUser,
  match,
}: {
  apiClient: AuthenticatedApiClient;
  currentUser: CurrentUser;
  match: MatchDetail;
}) {
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [proposal, setProposal] = useState<TransientTeamProposal | null>(null);
  const [message, setMessage] = useState<{
    tone: 'error' | 'success' | 'info' | 'warning';
    title?: string | undefined;
    text: string;
  } | null>(null);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guest, setGuest] = useState<GuestDraft>(emptyGuest);
  const [selectedSwapPlayerId, setSelectedSwapPlayerId] = useState<
    string | null
  >(null);
  const [confirmingStart, setConfirmingStart] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const participantData = useMemo(
    () => validateParticipantGroups(match),
    [match],
  );
  const active = currentUser.player.status === 'ACTIVE';
  const isAdmin =
    active && canShowAdminMatchControls(currentUser.user.role, match.status);

  const refreshMatch = async () => {
    await refreshMatchState(queryClient, match.id);
  };

  const attendanceMutation = useMutation({
    mutationFn: async (attendance: Attendance | null) => {
      if (attendance === 'GOING') {
        await apiClient.registerGoing(match.id);
      } else if (attendance === 'NOT_GOING') {
        await apiClient.updateParticipant(
          match.id,
          currentUser.player.id,
          attendance,
        );
      } else {
        await apiClient.removeRegistration(match.id);
      }
    },
    onSuccess: async () => {
      setProposal(null);
      setMessage({
        tone: 'success',
        text: 'Your attendance has been updated.',
      });
      await refreshMatch();
    },
    onError: (error) =>
      setMessage(apiErrorMessage(error, 'Attendance could not be updated.')),
  });

  const participantMutation = useMutation({
    mutationFn: async ({
      attendance,
      playerId,
    }: {
      attendance: Attendance;
      playerId: string;
    }) => {
      if (
        attendance === 'GOING' &&
        match.participants.unanswered.some(({ id }) => id === playerId)
      ) {
        await apiClient.addParticipant(match.id, { playerId });
        return;
      }
      await apiClient.updateParticipant(match.id, playerId, attendance);
    },
    onSuccess: async () => {
      setProposal(null);
      setMessage({ tone: 'success', text: 'Participant attendance updated.' });
      await refreshMatch();
    },
    onError: (error) =>
      setMessage(
        apiErrorMessage(error, 'Participant attendance could not be updated.'),
      ),
  });

  const guestMutation = useMutation({
    mutationFn: () =>
      apiClient.addParticipant(match.id, {
        guest: {
          name: guest.name,
          attributes: guest.attributes,
        },
      }),
    onSuccess: async ({ player }) => {
      setProposal(null);
      setGuest(emptyGuest());
      setGuestOpen(false);
      setMessage({
        tone: 'success',
        text: `${player?.name ?? 'Guest'} is now a persistent Player and is going to this Match.`,
      });
      await refreshMatch();
    },
    onError: (error) =>
      setMessage(apiErrorMessage(error, 'Guest could not be created.')),
  });

  const generationMutation = useMutation({
    mutationFn: () => apiClient.generateTeams(match.id),
    onSuccess: async (response) => {
      try {
        const currentMatch = await apiClient.getMatch(match.id);
        if (currentMatch.stateVersion !== match.stateVersion) {
          queryClient.setQueryData(
            matchQueryKeys.detail(match.id),
            currentMatch,
          );
          throw new Error(
            'Attendance changed while teams were being generated. Generate again from the latest Match.',
          );
        }
        const nextProposal = createTransientProposal(currentMatch, response);
        queryClient.setQueryData(matchQueryKeys.detail(match.id), currentMatch);
        setProposal(nextProposal);
        setSelectedSwapPlayerId(null);
        setMessage({
          tone: 'success',
          text: 'A fresh team proposal is ready. It stays only on this screen until Start.',
        });
      } catch (error) {
        setProposal(null);
        setMessage({
          tone: 'error',
          title: 'Proposal rejected',
          text:
            error instanceof Error
              ? error.message
              : 'The server returned an invalid proposal.',
        });
      }
    },
    onError: (error) =>
      setMessage(apiErrorMessage(error, 'Teams could not be generated.')),
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!proposal) {
        throw new Error('Generate teams before starting the Match.');
      }
      const validation = validateProposal(match, proposal);
      if (!validation.valid) {
        throw new Error(validation.reason);
      }
      return apiClient.startMatch(match.id, {
        teamAPlayerIds: proposal.teamAPlayerIds,
        teamBPlayerIds: proposal.teamBPlayerIds,
        proposalReceipt: proposal.proposalReceipt,
      });
    },
    onSuccess: async (startedMatch) => {
      setProposal(null);
      setConfirmingStart(false);
      await publishMatchState(queryClient, startedMatch);
    },
    onError: async (error) => {
      setConfirmingStart(false);
      if (error instanceof ApiClientError && isStaleProposalConflict(error)) {
        setProposal(null);
        setMessage({
          tone: 'warning',
          title: 'Teams need to be generated again',
          text: 'Attendance or Match status changed before Start. The latest Match has been loaded.',
        });
        await refreshMatch();
        return;
      }
      setMessage(apiErrorMessage(error, 'The Match could not be started.'));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiClient.cancelMatch(match.id),
    onSuccess: async (cancelledMatch) => {
      setProposal(null);
      setConfirmingCancel(false);
      await publishMatchState(queryClient, cancelledMatch);
    },
    onError: async (error) => {
      setConfirmingCancel(false);
      setMessage(apiErrorMessage(error, 'The Match could not be cancelled.'));
      if (error instanceof ApiClientError && error.status === 409) {
        await refreshMatch();
      }
    },
  });

  if (!participantData.valid) {
    return (
      <View style={styles.section}>
        <FeedbackBanner
          tone="error"
          title="Participant data unavailable"
          message={participantData.reason}
        />
        <Button label="Refresh Match" onPress={() => void refreshMatch()} />
      </View>
    );
  }

  const playersById = participantData.playersById;
  const proposalValidation = proposal
    ? validateProposal(match, proposal)
    : null;
  const mayGenerate = active && match.participants.going.length >= 2;
  const busy =
    attendanceMutation.isPending ||
    participantMutation.isPending ||
    guestMutation.isPending ||
    generationMutation.isPending ||
    startMutation.isPending ||
    cancelMutation.isPending;

  return (
    <View style={styles.section}>
      {!active ? (
        <FeedbackBanner
          tone="warning"
          title="Match actions unavailable"
          message="Your Player is inactive. You can still view attendance, but cannot change it or start this Match."
        />
      ) : null}
      {message ? (
        <FeedbackBanner
          tone={message.tone}
          message={message.text}
          {...(message.title ? { title: message.title } : {})}
        />
      ) : null}

      <Surface style={styles.attendanceCard}>
        <View style={styles.sectionHeading}>
          <AppText variant="eyebrow" tone="brand">
            YOUR RESPONSE
          </AppText>
          <AppText variant="heading">Are you playing?</AppText>
          <AppText tone="muted">
            Choose Going, Not going, or clear your answer.
          </AppText>
        </View>
        <View style={styles.buttonRow}>
          <Button
            busy={
              attendanceMutation.isPending &&
              attendanceMutation.variables === 'GOING'
            }
            disabled={!active || busy || match.myAttendance === 'GOING'}
            fullWidth={false}
            label="Going"
            onPress={() => attendanceMutation.mutate('GOING')}
          />
          <Button
            busy={
              attendanceMutation.isPending &&
              attendanceMutation.variables === 'NOT_GOING'
            }
            disabled={!active || busy || match.myAttendance === 'NOT_GOING'}
            fullWidth={false}
            label="Not going"
            onPress={() => attendanceMutation.mutate('NOT_GOING')}
            variant="secondary"
          />
          <Button
            busy={
              attendanceMutation.isPending &&
              attendanceMutation.variables === null
            }
            disabled={!active || busy || match.myAttendance === null}
            fullWidth={false}
            label="Clear answer"
            onPress={() => attendanceMutation.mutate(null)}
            variant="ghost"
          />
        </View>
      </Surface>

      <ParticipantOverview
        busy={busy}
        isAdmin={isAdmin}
        match={match}
        onUpdate={(playerId, attendance) =>
          participantMutation.mutate({ playerId, attendance })
        }
      />

      <GuestSection
        busy={guestMutation.isPending}
        disabled={!active || busy}
        draft={guest}
        open={guestOpen}
        onChange={setGuest}
        onSubmit={() => {
          const name = guest.name.trim();
          if (!name) {
            setMessage({ tone: 'error', text: 'Enter a guest name.' });
            return;
          }
          guestMutation.mutate();
        }}
        onToggle={() => setGuestOpen((open) => !open)}
      />

      <View style={styles.generationSection}>
        <View style={styles.sectionHeading}>
          <AppText variant="eyebrow" tone="brand">
            TEAMS
          </AppText>
          <AppText variant="heading">Build the sides</AppText>
          <AppText tone="muted">
            Teamizer balances the current Going players. Generate again to
            replace the proposal.
          </AppText>
        </View>
        {!mayGenerate ? (
          <FeedbackBanner
            tone="info"
            message="At least two Going players are required before teams can be generated."
          />
        ) : null}
        <Button
          busy={generationMutation.isPending}
          disabled={!mayGenerate || busy}
          label={proposal ? 'Generate different teams' : 'Generate teams'}
          onPress={() => generationMutation.mutate()}
          variant={proposal ? 'secondary' : 'primary'}
        />
      </View>

      {proposal ? (
        <ProposalEditor
          playersById={playersById}
          proposal={proposal}
          selectedSwapPlayerId={selectedSwapPlayerId}
          wide={width >= 700}
          onMove={(playerId) => {
            setProposal((current) =>
              current ? movePlayer(current, playerId) : current,
            );
            setSelectedSwapPlayerId(null);
            setConfirmingStart(false);
          }}
          onSelectSwap={(playerId) => {
            if (!selectedSwapPlayerId) {
              setSelectedSwapPlayerId(playerId);
              return;
            }
            setProposal((current) =>
              current
                ? swapPlayers(current, selectedSwapPlayerId, playerId)
                : current,
            );
            setSelectedSwapPlayerId(null);
            setConfirmingStart(false);
          }}
        />
      ) : null}

      {proposal ? (
        <Surface tone="brand" style={styles.startArea}>
          <View style={styles.sectionHeading}>
            <AppText variant="heading">Start Match</AppText>
            <AppText tone="muted">
              {proposalWasAdjusted(proposal)
                ? 'Your adjusted teams will become the final, locked rosters.'
                : 'These proposed teams will become the final, locked rosters.'}
            </AppText>
          </View>
          {proposalValidation && !proposalValidation.valid ? (
            <FeedbackBanner tone="error" message={proposalValidation.reason} />
          ) : null}
          {confirmingStart ? (
            <View style={styles.confirmation}>
              <FeedbackBanner
                tone="warning"
                title="Lock attendance and teams?"
                message="Starting is authoritative. Attendance and final teams cannot change afterward. Scoring will still begin separately."
              />
              <View style={styles.buttonRowEnd}>
                <Button
                  disabled={startMutation.isPending}
                  fullWidth={false}
                  label="Keep editing"
                  onPress={() => setConfirmingStart(false)}
                  variant="secondary"
                />
                <Button
                  busy={startMutation.isPending}
                  fullWidth={false}
                  label="Confirm Start"
                  onPress={() => startMutation.mutate()}
                />
              </View>
            </View>
          ) : (
            <Button
              disabled={!canSubmitStart(match, proposal, busy)}
              label="Start Match"
              onPress={() => setConfirmingStart(true)}
            />
          )}
        </Surface>
      ) : null}

      {isAdmin ? (
        <Surface tone="muted" style={styles.cancelArea}>
          <View style={styles.sectionHeading}>
            <AppText variant="heading">Cancel Match</AppText>
            <AppText tone="muted">
              Administrator action. Cancellation cannot be undone.
            </AppText>
          </View>
          {confirmingCancel ? (
            <View style={styles.confirmation}>
              <FeedbackBanner
                tone="warning"
                title="Cancel this Match?"
                message="Attendance is preserved for history, but registration and Start will close."
              />
              <View style={styles.buttonRowEnd}>
                <Button
                  disabled={cancelMutation.isPending}
                  fullWidth={false}
                  label="Keep Match"
                  onPress={() => setConfirmingCancel(false)}
                  variant="secondary"
                />
                <Button
                  busy={cancelMutation.isPending}
                  fullWidth={false}
                  label="Confirm cancellation"
                  onPress={() => cancelMutation.mutate()}
                  variant="danger"
                />
              </View>
            </View>
          ) : (
            <Button
              disabled={busy}
              label="Cancel Match"
              onPress={() => setConfirmingCancel(true)}
              variant="danger"
            />
          )}
        </Surface>
      ) : null}
    </View>
  );
}

function ParticipantOverview({
  busy,
  isAdmin,
  match,
  onUpdate,
}: {
  busy: boolean;
  isAdmin: boolean;
  match: MatchDetail;
  onUpdate(playerId: string, attendance: Attendance): void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <AppText variant="eyebrow" tone="brand">
          ATTENDANCE
        </AppText>
        <AppText variant="heading">Who’s in</AppText>
      </View>
      <Surface padding="none" style={styles.participantSurface}>
        <ParticipantGroup
          attendance="GOING"
          busy={busy}
          isAdmin={isAdmin}
          label="Going"
          players={match.participants.going}
          onUpdate={onUpdate}
        />
        <ParticipantGroup
          attendance="NOT_GOING"
          busy={busy}
          isAdmin={isAdmin}
          label="Not going"
          players={match.participants.notGoing}
          onUpdate={onUpdate}
        />
        <ParticipantGroup
          attendance={null}
          busy={busy}
          isAdmin={isAdmin}
          label="Unanswered"
          players={match.participants.unanswered}
          onUpdate={onUpdate}
        />
      </Surface>
      {isAdmin ? (
        <FeedbackBanner
          tone="info"
          message="Admin controls affect another active Player’s pre-start attendance."
        />
      ) : null}
    </View>
  );
}

function ParticipantGroup({
  attendance,
  busy,
  isAdmin,
  label,
  players,
  onUpdate,
}: {
  attendance: Attendance | null;
  busy: boolean;
  isAdmin: boolean;
  label: string;
  players: MatchDetail['participants']['going'];
  onUpdate(playerId: string, attendance: Attendance): void;
}) {
  return (
    <View style={styles.participantGroup}>
      <View style={styles.groupHeading}>
        <AppText variant="bodyStrong">{label}</AppText>
        <AppText variant="caption" tone="muted">
          {players.length}
        </AppText>
      </View>
      {players.length === 0 ? (
        <AppText tone="muted">No players here.</AppText>
      ) : (
        players.map((player) => (
          <View key={player.id} style={styles.participantRow}>
            <Avatar name={player.name} size="small" url={player.avatarUrl} />
            <View style={styles.playerName}>
              <AppText variant="bodyStrong">{player.name}</AppText>
              {player.type === 'GUEST' ? (
                <StatusPill label="GUEST" tone="neutral" />
              ) : null}
            </View>
            {isAdmin ? (
              <View style={styles.adminRowActions}>
                {attendance !== 'GOING' ? (
                  <Button
                    disabled={busy}
                    fullWidth={false}
                    label="Set going"
                    onPress={() => onUpdate(player.id, 'GOING')}
                    variant="ghost"
                  />
                ) : null}
                {attendance !== 'NOT_GOING' ? (
                  <Button
                    disabled={busy}
                    fullWidth={false}
                    label="Set not going"
                    onPress={() => onUpdate(player.id, 'NOT_GOING')}
                    variant="ghost"
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

function GuestSection({
  busy,
  disabled,
  draft,
  open,
  onChange,
  onSubmit,
  onToggle,
}: {
  busy: boolean;
  disabled: boolean;
  draft: GuestDraft;
  open: boolean;
  onChange(draft: GuestDraft): void;
  onSubmit(): void;
  onToggle(): void;
}) {
  return (
    <Surface tone="muted" style={styles.guestArea}>
      <View style={styles.sectionHeading}>
        <AppText variant="heading">Bringing a guest?</AppText>
        <AppText tone="muted">
          Create a persistent guest Player and add them as Going. Ratings are
          private balancing inputs.
        </AppText>
      </View>
      <Button
        disabled={disabled}
        label={open ? 'Close guest form' : 'Add a guest'}
        onPress={onToggle}
        variant="secondary"
      />
      {open ? (
        <View style={styles.guestForm}>
          <TextField
            autoCapitalize="words"
            editable={!disabled}
            label="Guest name"
            maxLength={120}
            onChangeText={(name) => onChange({ ...draft, name })}
            placeholder="e.g. Sam"
            value={draft.name}
          />
          <View>
            {(Object.keys(attributeLabels) as AttributeKey[]).map((key) => (
              <NumberStepper
                disabled={disabled}
                key={key}
                label={attributeLabels[key]}
                maximum={10}
                minimum={1}
                onChange={(value) =>
                  onChange({
                    ...draft,
                    attributes: { ...draft.attributes, [key]: value },
                  })
                }
                value={draft.attributes[key]}
              />
            ))}
          </View>
          <Button
            busy={busy}
            disabled={disabled}
            label="Create guest and add"
            onPress={onSubmit}
          />
        </View>
      ) : null}
    </Surface>
  );
}

function ProposalEditor({
  playersById,
  proposal,
  selectedSwapPlayerId,
  wide,
  onMove,
  onSelectSwap,
}: {
  playersById: Map<string, MatchDetail['participants']['going'][number]>;
  proposal: TransientTeamProposal;
  selectedSwapPlayerId: string | null;
  wide: boolean;
  onMove(playerId: string): void;
  onSelectSwap(playerId: string): void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.proposalHeading}>
        <View style={styles.sectionHeading}>
          <AppText variant="eyebrow" tone="brand">
            CURRENT PROPOSAL
          </AppText>
          <AppText variant="heading">
            {proposalWasAdjusted(proposal)
              ? 'Adjusted teams'
              : 'Balanced teams'}
          </AppText>
        </View>
        <AppText variant="caption" tone="muted">
          Balance {proposal.balance.balanceScore.toFixed(3)} · Variety{' '}
          {proposal.balance.historyScore.toFixed(3)}
        </AppText>
      </View>
      {selectedSwapPlayerId ? (
        <FeedbackBanner
          tone="info"
          message={`Choose someone on the other team to swap with ${playersById.get(selectedSwapPlayerId)?.name ?? 'the selected player'}.`}
        />
      ) : null}
      <View style={[styles.teamColumns, wide && styles.teamColumnsWide]}>
        <ProposalTeam
          ids={proposal.teamAPlayerIds}
          playersById={playersById}
          proposal={proposal}
          selectedSwapPlayerId={selectedSwapPlayerId}
          side="A"
          onMove={onMove}
          onSelectSwap={onSelectSwap}
        />
        <ProposalTeam
          ids={proposal.teamBPlayerIds}
          playersById={playersById}
          proposal={proposal}
          selectedSwapPlayerId={selectedSwapPlayerId}
          side="B"
          onMove={onMove}
          onSelectSwap={onSelectSwap}
        />
      </View>
    </View>
  );
}

function ProposalTeam({
  ids,
  playersById,
  proposal,
  selectedSwapPlayerId,
  side,
  onMove,
  onSelectSwap,
}: {
  ids: string[];
  playersById: Map<string, MatchDetail['participants']['going'][number]>;
  proposal: TransientTeamProposal;
  selectedSwapPlayerId: string | null;
  side: 'A' | 'B';
  onMove(playerId: string): void;
  onSelectSwap(playerId: string): void;
}) {
  const selectedIsThisSide = selectedSwapPlayerId
    ? ids.includes(selectedSwapPlayerId)
    : false;

  return (
    <Surface padding="none" style={styles.proposalTeam}>
      <View
        style={[
          styles.teamHeading,
          side === 'A' ? styles.teamASoft : styles.teamBSoft,
        ]}
      >
        <AppText
          variant="heading"
          style={side === 'A' ? styles.teamAText : styles.teamBText}
        >
          Team {side}
        </AppText>
        <AppText variant="caption" tone="muted">
          {ids.length} {ids.length === 1 ? 'player' : 'players'}
        </AppText>
      </View>
      {ids.map((id) => {
        const player = playersById.get(id);
        if (!player) {
          return null;
        }
        const maySwapWithSelection =
          selectedSwapPlayerId !== null && !selectedIsThisSide;
        const movingAllowed = canMovePlayer(proposal, id);
        const selected = selectedSwapPlayerId === id;

        return (
          <View
            key={id}
            style={[styles.proposalPlayerRow, selected && styles.selectedRow]}
          >
            <Avatar name={player.name} size="small" url={player.avatarUrl} />
            <View style={styles.playerName}>
              <AppText variant="bodyStrong">{player.name}</AppText>
              {player.type === 'GUEST' ? (
                <AppText variant="caption" tone="muted">
                  Guest
                </AppText>
              ) : null}
            </View>
            <Button
              fullWidth={false}
              label={
                selected
                  ? 'Cancel swap'
                  : maySwapWithSelection
                    ? 'Swap here'
                    : movingAllowed
                      ? `Move to ${side === 'A' ? 'B' : 'A'}`
                      : 'Select swap'
              }
              onPress={() => {
                if (selected || maySwapWithSelection || !movingAllowed) {
                  onSelectSwap(id);
                } else {
                  onMove(id);
                }
              }}
              variant="ghost"
            />
          </View>
        );
      })}
    </Surface>
  );
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    return {
      tone: 'error' as const,
      title: error.status === 0 ? 'Connection problem' : undefined,
      text: error.message || fallback,
    };
  }
  return {
    tone: 'error' as const,
    text: error instanceof Error ? error.message : fallback,
  };
}

const styles = StyleSheet.create({
  section: { gap: spacing.xl },
  sectionHeading: { gap: spacing.xs },
  attendanceCard: { gap: spacing.lg },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  buttonRowEnd: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  participantSurface: { overflow: 'hidden' },
  participantGroup: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  groupHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  participantRow: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: layout.minimumTouchTarget + 8,
    paddingVertical: spacing.xs,
  },
  playerName: { flex: 1, gap: spacing.xxs, minWidth: 120 },
  adminRowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs },
  guestArea: { gap: spacing.lg },
  guestForm: { gap: spacing.lg },
  generationSection: { gap: spacing.lg },
  proposalHeading: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  teamColumns: { gap: spacing.md },
  teamColumnsWide: { alignItems: 'flex-start', flexDirection: 'row' },
  proposalTeam: { flex: 1, minWidth: 0, overflow: 'hidden' },
  teamHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  teamASoft: { backgroundColor: colors.teamASoft },
  teamBSoft: { backgroundColor: colors.teamBSoft },
  teamAText: { color: colors.teamA },
  teamBText: { color: colors.teamB },
  proposalPlayerRow: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 68,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  selectedRow: { backgroundColor: colors.brandSoft },
  startArea: { gap: spacing.lg },
  cancelArea: { gap: spacing.lg, marginTop: spacing.xl },
  confirmation: { gap: spacing.md },
});
