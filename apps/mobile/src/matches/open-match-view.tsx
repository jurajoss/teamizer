import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Avatar,
  Button,
  FeedbackBanner,
  layout,
  NumberStepper,
  spacing,
  StatusPill,
  Surface,
  TextField,
  useTheme,
} from '@teamizer/ui';

import {
  ApiClientError,
  type AuthenticatedApiClient,
} from '../api/authenticated-api-client';
import type { Attendance, CurrentUser, MatchDetail } from '../api/contracts';
import { localizedErrorMessage } from '../i18n/localized-error';
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

type AttributeKey = 'speed' | 'endurance' | 'defense' | 'attack' | 'technique';
const attributeKeys: AttributeKey[] = [
  'speed',
  'endurance',
  'defense',
  'attack',
  'technique',
];
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
  const { t } = useTranslation();
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
        text: t('attendance.updated'),
      });
      await refreshMatch();
    },
    onError: (error) =>
      setMessage(apiErrorMessage(error, t('attendance.updateFailed'), t)),
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
      setMessage({ tone: 'success', text: t('attendance.participantUpdated') });
      await refreshMatch();
    },
    onError: (error) =>
      setMessage(apiErrorMessage(error, t('attendance.participantFailed'), t)),
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
        text: t('guest.success', { name: player?.name ?? t('common.guest') }),
      });
      await refreshMatch();
    },
    onError: (error) =>
      setMessage(apiErrorMessage(error, t('guest.failed'), t)),
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
          throw new Error(t('teams.regenerateHint'));
        }
        const nextProposal = createTransientProposal(currentMatch, response);
        queryClient.setQueryData(matchQueryKeys.detail(match.id), currentMatch);
        setProposal(nextProposal);
        setSelectedSwapPlayerId(null);
        setMessage({
          tone: 'success',
          text: t('teams.proposalReady'),
        });
      } catch {
        setProposal(null);
        setMessage({
          tone: 'error',
          title: t('teams.proposalRejected'),
          text: t('teams.failed'),
        });
      }
    },
    onError: (error) =>
      setMessage(apiErrorMessage(error, t('teams.failed'), t)),
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!proposal) {
        throw new Error(t('teams.generate'));
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
          title: t('teams.regenerateTitle'),
          text: t('teams.regenerateHint'),
        });
        await refreshMatch();
        return;
      }
      setMessage(apiErrorMessage(error, t('teams.startFailed'), t));
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
      setMessage(apiErrorMessage(error, t('cancellation.failed'), t));
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
          title={t('match.unavailable')}
          message={t('common.connectionRetry')}
        />
        <Button
          label={t('attendance.refresh')}
          onPress={() => void refreshMatch()}
        />
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
          title={t('attendance.actionsUnavailable')}
          message={t('attendance.inactiveHint')}
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
            {t('attendance.response').toUpperCase()}
          </AppText>
          <AppText variant="heading">{t('attendance.question')}</AppText>
        </View>
        <View style={styles.buttonRow}>
          <Button
            busy={
              attendanceMutation.isPending &&
              attendanceMutation.variables === 'GOING'
            }
            disabled={!active || busy || match.myAttendance === 'GOING'}
            fullWidth={false}
            label={t('attendance.going')}
            onPress={() => attendanceMutation.mutate('GOING')}
          />
          <Button
            busy={
              attendanceMutation.isPending &&
              attendanceMutation.variables === 'NOT_GOING'
            }
            disabled={!active || busy || match.myAttendance === 'NOT_GOING'}
            fullWidth={false}
            label={t('attendance.notGoing')}
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
            label={t('attendance.clear')}
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
            setMessage({ tone: 'error', text: t('guest.missingName') });
            return;
          }
          guestMutation.mutate();
        }}
        onToggle={() => setGuestOpen((open) => !open)}
      />

      <View style={styles.generationSection}>
        <View style={styles.sectionHeading}>
          <AppText variant="eyebrow" tone="brand">
            {t('teams.title').toUpperCase()}
          </AppText>
          <AppText variant="heading">{t('teams.build')}</AppText>
          <AppText tone="muted">{t('teams.buildHint')}</AppText>
        </View>
        {!mayGenerate ? (
          <FeedbackBanner tone="info" message={t('teams.minimum')} />
        ) : null}
        <Button
          busy={generationMutation.isPending}
          disabled={!mayGenerate || busy}
          label={proposal ? t('teams.generateDifferent') : t('teams.generate')}
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
            <AppText variant="heading">{t('teams.start')}</AppText>
            <AppText tone="muted">
              {proposalWasAdjusted(proposal)
                ? t('teams.adjustedStartHint')
                : t('teams.startHint')}
            </AppText>
          </View>
          {proposalValidation && !proposalValidation.valid ? (
            <FeedbackBanner
              tone="error"
              message={t('errors.INVALID_TEAM_COMPOSITION')}
            />
          ) : null}
          {confirmingStart ? (
            <View style={styles.confirmation}>
              <FeedbackBanner
                tone="warning"
                title={t('teams.lockTitle')}
                message={t('teams.lockHint')}
              />
              <View style={styles.buttonRowEnd}>
                <Button
                  disabled={startMutation.isPending}
                  fullWidth={false}
                  label={t('teams.keepEditing')}
                  onPress={() => setConfirmingStart(false)}
                  variant="secondary"
                />
                <Button
                  busy={startMutation.isPending}
                  fullWidth={false}
                  label={t('teams.confirmStart')}
                  onPress={() => startMutation.mutate()}
                />
              </View>
            </View>
          ) : (
            <Button
              disabled={!canSubmitStart(match, proposal, busy)}
              label={t('teams.start')}
              onPress={() => setConfirmingStart(true)}
            />
          )}
        </Surface>
      ) : null}

      {isAdmin ? (
        <Surface tone="muted" style={styles.cancelArea}>
          <View style={styles.sectionHeading}>
            <AppText variant="heading">{t('cancellation.title')}</AppText>
            <AppText tone="muted">{t('cancellation.hint')}</AppText>
          </View>
          {confirmingCancel ? (
            <View style={styles.confirmation}>
              <FeedbackBanner
                tone="warning"
                title={t('cancellation.confirmTitle')}
                message={t('cancellation.confirmHint')}
              />
              <View style={styles.buttonRowEnd}>
                <Button
                  disabled={cancelMutation.isPending}
                  fullWidth={false}
                  label={t('cancellation.keep')}
                  onPress={() => setConfirmingCancel(false)}
                  variant="secondary"
                />
                <Button
                  busy={cancelMutation.isPending}
                  fullWidth={false}
                  label={t('cancellation.confirm')}
                  onPress={() => cancelMutation.mutate()}
                  variant="danger"
                />
              </View>
            </View>
          ) : (
            <Button
              disabled={busy}
              label={t('cancellation.title')}
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
  const { t } = useTranslation();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <AppText variant="eyebrow" tone="brand">
          {t('attendance.title').toUpperCase()}
        </AppText>
        <AppText variant="heading">{t('attendance.who')}</AppText>
      </View>
      <Surface padding="none" style={styles.participantSurface}>
        <ParticipantGroup
          attendance="GOING"
          busy={busy}
          isAdmin={isAdmin}
          label={t('attendance.going')}
          players={match.participants.going}
          onUpdate={onUpdate}
        />
        <ParticipantGroup
          attendance="NOT_GOING"
          busy={busy}
          isAdmin={isAdmin}
          label={t('attendance.notGoing')}
          players={match.participants.notGoing}
          onUpdate={onUpdate}
        />
        <ParticipantGroup
          attendance={null}
          busy={busy}
          isAdmin={isAdmin}
          label={t('attendance.unanswered')}
          players={match.participants.unanswered}
          onUpdate={onUpdate}
        />
      </Surface>
      {isAdmin ? (
        <FeedbackBanner tone="info" message={t('admin.playersHint')} />
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
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View
      style={[styles.participantGroup, { borderBottomColor: colors.border }]}
    >
      <View style={styles.groupHeading}>
        <AppText variant="bodyStrong">{label}</AppText>
        <AppText variant="caption" tone="muted">
          {players.length}
        </AppText>
      </View>
      {players.length === 0 ? (
        <AppText tone="muted">{t('attendance.empty')}</AppText>
      ) : (
        players.map((player) => (
          <View
            key={player.id}
            style={[styles.participantRow, { borderTopColor: colors.border }]}
          >
            <Avatar name={player.name} size="small" url={player.avatarUrl} />
            <View style={styles.playerName}>
              <AppText variant="bodyStrong">{player.name}</AppText>
              {player.type === 'GUEST' ? (
                <StatusPill label={t('status.guest')} tone="neutral" />
              ) : null}
            </View>
            {isAdmin ? (
              <View style={styles.adminRowActions}>
                {attendance !== 'GOING' ? (
                  <Button
                    disabled={busy}
                    fullWidth={false}
                    label={t('attendance.setGoing')}
                    onPress={() => onUpdate(player.id, 'GOING')}
                    variant="ghost"
                  />
                ) : null}
                {attendance !== 'NOT_GOING' ? (
                  <Button
                    disabled={busy}
                    fullWidth={false}
                    label={t('attendance.setNotGoing')}
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
  const { t } = useTranslation();
  return (
    <Surface tone="muted" style={styles.guestArea}>
      <View style={styles.sectionHeading}>
        <AppText variant="heading">{t('guest.title')}</AppText>
        <AppText tone="muted">{t('guest.hint')}</AppText>
      </View>
      <Button
        disabled={disabled}
        label={open ? t('guest.close') : t('guest.add')}
        onPress={onToggle}
        variant="secondary"
      />
      {open ? (
        <View style={styles.guestForm}>
          <TextField
            autoCapitalize="words"
            editable={!disabled}
            label={t('guest.name')}
            maxLength={120}
            onChangeText={(name) => onChange({ ...draft, name })}
            placeholder={t('guest.placeholder')}
            value={draft.name}
          />
          <View>
            {attributeKeys.map((key) => {
              const label = t(`attributes.${key}`);
              return (
                <NumberStepper
                  decreaseLabel={t('attributes.decrease', { label })}
                  disabled={disabled}
                  increaseLabel={t('attributes.increase', { label })}
                  key={key}
                  label={label}
                  maximum={10}
                  minimum={1}
                  onChange={(value) =>
                    onChange({
                      ...draft,
                      attributes: { ...draft.attributes, [key]: value },
                    })
                  }
                  value={draft.attributes[key]}
                  valueLabel={t('attributes.value', {
                    label,
                    value: draft.attributes[key],
                    maximum: 10,
                  })}
                />
              );
            })}
          </View>
          <Button
            busy={busy}
            disabled={disabled}
            label={t('guest.create')}
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
  const { t } = useTranslation();
  return (
    <View style={styles.section}>
      <View style={styles.proposalHeading}>
        <View style={styles.sectionHeading}>
          <AppText variant="eyebrow" tone="brand">
            {t('teams.current').toUpperCase()}
          </AppText>
          <AppText variant="heading">
            {proposalWasAdjusted(proposal)
              ? t('teams.adjusted')
              : t('teams.balanced')}
          </AppText>
        </View>
        <AppText variant="caption" tone="muted">
          {t('teams.balance', {
            balance: proposal.balance.balanceScore.toFixed(3),
            variety: proposal.balance.historyScore.toFixed(3),
          })}
        </AppText>
      </View>
      {selectedSwapPlayerId ? (
        <FeedbackBanner
          tone="info"
          message={t('teams.selectSwap', {
            name:
              playersById.get(selectedSwapPlayerId)?.name ?? t('common.player'),
          })}
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
  const { colors } = useTheme();
  const { t } = useTranslation();
  const selectedIsThisSide = selectedSwapPlayerId
    ? ids.includes(selectedSwapPlayerId)
    : false;

  return (
    <Surface padding="none" style={styles.proposalTeam}>
      <View
        style={[
          styles.teamHeading,
          {
            backgroundColor:
              side === 'A' ? colors.teamASurface : colors.teamBSurface,
          },
        ]}
      >
        <AppText
          variant="heading"
          style={{ color: side === 'A' ? colors.teamAText : colors.teamBText }}
        >
          {t('common.team', { side })}
        </AppText>
        <AppText variant="caption" tone="muted">
          {t('common.playerCount', { count: ids.length })}
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
            style={[
              styles.proposalPlayerRow,
              { borderTopColor: colors.border },
              selected && {
                backgroundColor: colors.accentSoft,
              },
            ]}
          >
            <Avatar name={player.name} size="small" url={player.avatarUrl} />
            <View style={styles.playerName}>
              <AppText variant="bodyStrong">{player.name}</AppText>
              {player.type === 'GUEST' ? (
                <AppText variant="caption" tone="muted">
                  {t('common.guest')}
                </AppText>
              ) : null}
            </View>
            <Button
              fullWidth={false}
              label={
                selected
                  ? t('teams.cancelSwap')
                  : maySwapWithSelection
                    ? t('teams.swapHere')
                    : movingAllowed
                      ? t('teams.moveTo', {
                          side: side === 'A' ? 'B' : 'A',
                        })
                      : t('teams.selectSwapAction')
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

function apiErrorMessage(
  error: unknown,
  fallback: string,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (error instanceof ApiClientError) {
    return {
      tone: 'error' as const,
      title: undefined,
      text: localizedErrorMessage(error, t) || fallback,
    };
  }
  return {
    tone: 'error' as const,
    text: fallback,
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
  proposalPlayerRow: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 68,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  startArea: { gap: spacing.lg },
  cancelArea: { gap: spacing.lg, marginTop: spacing.xl },
  confirmation: { gap: spacing.md },
});
