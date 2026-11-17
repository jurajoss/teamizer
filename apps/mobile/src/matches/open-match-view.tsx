import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Avatar,
  borderWidths,
  Button,
  Card,
  FeedbackBanner,
  NumberStepper,
  radii,
  sizes,
  spacing,
  TextField,
  useTheme,
} from '@teamizer/ui';

import type { AuthenticatedApiClient } from '../api/authenticated-api-client';
import type { Attendance, CurrentUser, MatchDetail } from '../api/contracts';
import { PersonalAttendanceControl } from '../attendance/attendance-control';
import { usePreferences } from '../preferences/preferences-context';
import { AppIcon } from '../ui/icons/app-icon';
import {
  canShowAdminMatchControls,
  editParticipantsRouteFor,
  editTeamsRouteFor,
  formatMatchDate,
  validateParticipantGroups,
} from './match-flow';
import type { OpenMatchFeedback } from './open-match-feedback';
import { MatchTeamColumns } from './match-team-columns';
import { isTeamDraftValidForMatch } from './team-draft-store';
import {
  guestAttributeKeys,
  type GuestDraft,
  useOpenMatchParticipation,
} from './use-open-match-participation';
import { useMatchCancellation } from './use-match-lifecycle-actions';
import { useMatchProposal } from './use-match-proposal';

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
  const [message, setMessage] = useState<OpenMatchFeedback | null>(null);
  const participantData = useMemo(
    () => validateParticipantGroups(match),
    [match],
  );
  const active = currentUser.player.status === 'ACTIVE';
  const isAdmin =
    active && canShowAdminMatchControls(currentUser.user.role, match.status);
  const proposalActions = useMatchProposal({
    apiClient,
    enabled: active,
    match,
    setFeedback: setMessage,
  });
  const participation = useOpenMatchParticipation({
    apiClient,
    currentUser,
    match,
    onAttendanceChanged: proposalActions.handleAuthoritativeChange,
    setFeedback: setMessage,
  });
  const cancellation = useMatchCancellation({
    apiClient,
    match,
    invalidateProposal: proposalActions.clear,
    setFeedback: setMessage,
  });
  const proposal = proposalActions.proposal;

  if (!participantData.valid) {
    return (
      <View style={styles.screenSections}>
        <FeedbackBanner
          message={t('common.connectionRetry')}
          title={t('match.unavailable')}
          tone="error"
        />
        <Button
          label={t('attendance.refresh')}
          onPress={() => void participation.refreshMatch()}
        />
      </View>
    );
  }

  const busy =
    participation.attendance.isPending ||
    participation.guest.isPending ||
    proposalActions.generationPending ||
    proposalActions.startPending ||
    cancellation.isPending;
  const mayGenerate = active && match.participants.going.length >= 2;
  const mayStart =
    active &&
    !busy &&
    proposal !== null &&
    isTeamDraftValidForMatch(proposal, match);

  return (
    <View style={styles.screenSections}>
      {message ? (
        <FeedbackBanner
          message={message.text}
          tone={message.tone}
          {...(message.title ? { title: message.title } : {})}
        />
      ) : null}
      {!active ? (
        <FeedbackBanner
          message={t('attendance.inactiveHint')}
          title={t('attendance.actionsUnavailable')}
          tone="warning"
        />
      ) : null}

      <MatchInformation match={match} />
      <MatchAttendanceSection
        active={active}
        attendance={match.myAttendance}
        busy={busy}
        pendingValue={participation.attendance.pendingValue}
        updating={participation.attendance.isPending}
        onUpdate={participation.attendance.update}
      />
      <MatchParticipantsSection
        busy={busy || !active}
        guest={participation.guest}
        isAdmin={isAdmin}
        match={match}
        onEditParticipants={() =>
          router.push(editParticipantsRouteFor(match.id))
        }
      />
      <MatchTeamsSection
        generating={proposalActions.generationPending}
        mayGenerate={mayGenerate}
        playersById={participantData.playersById}
        proposal={proposal}
        stale={proposalActions.stale}
        onEdit={() => router.push(editTeamsRouteFor(match.id))}
        onGenerate={proposalActions.generate}
      />

      {proposal ? (
        <MatchStartAction
          confirming={proposalActions.confirmingStart}
          enabled={mayStart}
          pending={proposalActions.startPending}
          onBegin={proposalActions.beginStartConfirmation}
          onCancel={proposalActions.cancelStartConfirmation}
          onConfirm={proposalActions.start}
        />
      ) : null}

      {isAdmin ? (
        <MatchCancellationSection
          confirming={cancellation.confirming}
          pending={cancellation.isPending}
          onBegin={cancellation.beginConfirmation}
          onCancel={cancellation.cancelConfirmation}
          onConfirm={cancellation.cancel}
        />
      ) : null}
    </View>
  );
}

export function MatchInformation({ match }: { match: MatchDetail }) {
  const { colors } = useTheme();
  const { language } = usePreferences();
  const { t } = useTranslation();
  return (
    <Card padding="compact" style={styles.informationCard}>
      <View style={styles.informationRow}>
        <AppIcon color={colors.textSecondary} name="matches" />
        <View style={styles.informationCopy}>
          <AppText variant="bodyStrong">
            {formatMatchDate(match.startsAt, language)}
          </AppText>
          <AppText tone="muted" variant="caption">
            {match.sport.name}
          </AppText>
        </View>
      </View>
      <View style={styles.informationRow}>
        <AppIcon color={colors.textSecondary} name="location" />
        <AppText tone={match.location ? 'default' : 'muted'}>
          {match.location ?? t('match.locationMissing')}
        </AppText>
      </View>
    </Card>
  );
}

export function MatchAttendanceSection({
  active,
  attendance,
  busy,
  pendingValue,
  updating,
  onUpdate,
}: {
  active: boolean;
  attendance: Attendance | null;
  busy: boolean;
  pendingValue: Attendance | null | undefined;
  updating: boolean;
  onUpdate(attendance: Attendance | null): Promise<void> | void;
}) {
  const { t } = useTranslation();

  return (
    <Card padding="compact" style={styles.attendanceCard}>
      <AppText variant="heading">{t('attendance.myAttendance')}</AppText>
      <PersonalAttendanceControl
        attendance={attendance}
        disabled={!active || busy}
        pendingAttendance={
          updating && pendingValue !== null ? pendingValue : undefined
        }
        onChange={onUpdate}
      />
    </Card>
  );
}

export function MatchParticipantsSection({
  busy,
  guest,
  isAdmin,
  match,
  onEditParticipants,
}: {
  busy: boolean;
  guest: ReturnType<typeof useOpenMatchParticipation>['guest'];
  isAdmin: boolean;
  match: MatchDetail;
  onEditParticipants(): void;
}) {
  const { t } = useTranslation();
  return (
    <Card padding="compact" style={styles.participantsCard}>
      <AppText variant="heading">{t('attendance.participants')}</AppText>
      <ParticipantGroup
        label={t('attendance.going')}
        players={match.participants.going}
      />
      <ParticipantGroup
        label={t('attendance.notGoing')}
        players={match.participants.notGoing}
      />
      <View style={styles.participantActions}>
        <TextAction
          disabled={busy}
          icon={guest.isOpen ? 'decline' : 'add'}
          label={guest.isOpen ? t('guest.close') : t('guest.add')}
          onPress={guest.toggle}
        />
        {isAdmin ? (
          <TextAction
            disabled={busy}
            icon="edit"
            label={t('attendance.editParticipantsAction')}
            onPress={onEditParticipants}
          />
        ) : null}
      </View>
      {guest.isOpen ? (
        <GuestForm
          busy={guest.isPending}
          disabled={busy}
          draft={guest.draft}
          onChange={guest.setDraft}
          onSubmit={guest.submit}
        />
      ) : null}
    </Card>
  );
}

function ParticipantGroup({
  label,
  players,
}: {
  label: string;
  players: MatchDetail['participants']['going'];
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.participantGroup}>
      <AppText tone="muted" variant="bodyStrong">
        {t('attendance.groupCount', { count: players.length, label })}
      </AppText>
      {players.length > 0 ? (
        <View style={styles.participantGrid}>
          {players.map((player) => (
            <View
              key={player.id}
              style={[
                styles.participantTile,
                {
                  backgroundColor: colors.surfaceSubtle,
                  borderColor: colors.border,
                },
              ]}
            >
              <Avatar name={player.name} size="small" url={player.avatarUrl} />
              <AppText numberOfLines={2} style={styles.participantName}>
                {player.name}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function GuestForm({
  busy,
  disabled,
  draft,
  onChange,
  onSubmit,
}: {
  busy: boolean;
  disabled: boolean;
  draft: GuestDraft;
  onChange(draft: GuestDraft): void;
  onSubmit(): void;
}) {
  const { t } = useTranslation();
  return (
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
      {guestAttributeKeys.map((key) => {
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
              maximum: 10,
              value: draft.attributes[key],
            })}
          />
        );
      })}
      <Button
        busy={busy}
        disabled={disabled}
        label={t('guest.create')}
        onPress={onSubmit}
      />
    </View>
  );
}

export function MatchTeamsSection({
  generating,
  mayGenerate,
  playersById,
  proposal,
  stale,
  onEdit,
  onGenerate,
}: {
  generating: boolean;
  mayGenerate: boolean;
  playersById: Map<string, MatchDetail['participants']['going'][number]>;
  proposal: ReturnType<typeof useMatchProposal>['proposal'];
  stale: boolean;
  onEdit(): void;
  onGenerate(): void;
}) {
  const { t } = useTranslation();
  return (
    <Card padding="compact" style={styles.teamsCard}>
      <AppText variant="heading">{t('teams.title')}</AppText>
      {stale ? (
        <FeedbackBanner
          message={t('teams.staleHint')}
          title={t('teams.staleTitle')}
          tone="warning"
        />
      ) : null}
      {!mayGenerate ? (
        <FeedbackBanner message={t('teams.minimum')} tone="info" />
      ) : null}
      {generating && !proposal ? (
        <AppText tone="muted">{t('teams.generating')}</AppText>
      ) : null}
      {proposal ? (
        <MatchTeamColumns
          teamAPlayers={playersForTeam(proposal.teamAPlayerIds, playersById)}
          teamBPlayers={playersForTeam(proposal.teamBPlayerIds, playersById)}
        />
      ) : null}
      {proposal ? (
        <View style={styles.teamActions}>
          <TextAction
            busy={generating}
            disabled={!mayGenerate || generating}
            icon="regenerate"
            label={stale ? t('teams.update') : t('teams.regenerate')}
            onPress={onGenerate}
          />
          <TextAction
            disabled={generating || !mayGenerate}
            icon="edit"
            label={t('teams.edit')}
            onPress={onEdit}
          />
        </View>
      ) : null}
    </Card>
  );
}

function playersForTeam(
  playerIds: string[],
  playersById: Map<string, MatchDetail['participants']['going'][number]>,
): MatchDetail['participants']['going'] {
  return playerIds.flatMap((id) => {
    const player = playersById.get(id);
    return player ? [player] : [];
  });
}

export function TextAction({
  busy = false,
  compact = false,
  disabled = false,
  icon,
  label,
  onPress,
}: {
  busy?: boolean;
  compact?: boolean;
  disabled?: boolean;
  icon: 'add' | 'complete' | 'decline' | 'edit' | 'regenerate';
  label: string;
  onPress(): void;
}) {
  const { colors } = useTheme();
  const foreground = disabled ? colors.textDisabled : colors.accent;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.textAction,
        compact && styles.textActionCompact,
        pressed && !disabled && { backgroundColor: colors.accentSoft },
      ]}
    >
      <AppIcon color={foreground} name={icon} size={sizes.icon.small} />
      <AppText
        numberOfLines={compact ? 2 : undefined}
        style={[styles.textActionLabel, { color: foreground }]}
        variant="bodyStrong"
      >
        {label}
      </AppText>
    </Pressable>
  );
}

export function MatchStartAction({
  confirming,
  enabled,
  pending,
  onBegin,
  onCancel,
  onConfirm,
}: {
  confirming: boolean;
  enabled: boolean;
  pending: boolean;
  onBegin(): void;
  onCancel(): void;
  onConfirm(): void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const startIcon = (
    <AppIcon
      color={enabled ? colors.accentContrast : colors.textDisabled}
      name="play"
      size={sizes.icon.medium}
    />
  );

  return (
    <View style={styles.primaryActionArea}>
      {confirming ? (
        <View style={styles.confirmation}>
          <FeedbackBanner
            message={t('teams.lockHint')}
            title={t('teams.lockTitle')}
            tone="warning"
          />
          <View style={styles.startConfirmationActions}>
            <Button
              disabled={pending}
              fullWidth
              label={t('teams.keepEditing')}
              onPress={onCancel}
              variant="secondary"
            />
            <Button
              busy={pending}
              fullWidth
              icon={startIcon}
              label={t('teams.start')}
              onPress={onConfirm}
            />
          </View>
        </View>
      ) : (
        <Button
          disabled={!enabled}
          icon={startIcon}
          label={t('teams.start')}
          onPress={onBegin}
        />
      )}
    </View>
  );
}

export function MatchCancellationSection({
  confirming,
  pending,
  onBegin,
  onCancel,
  onConfirm,
}: {
  confirming: boolean;
  pending: boolean;
  onBegin(): void;
  onCancel(): void;
  onConfirm(): void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return confirming ? (
    <View style={styles.confirmation}>
      <FeedbackBanner
        message={t('cancellation.confirmHint')}
        title={t('cancellation.confirmTitle')}
        tone="warning"
      />
      <View style={styles.confirmationActions}>
        <Button
          disabled={pending}
          fullWidth={false}
          label={t('cancellation.keep')}
          onPress={onCancel}
          variant="secondary"
        />
        <Button
          busy={pending}
          fullWidth={false}
          label={t('cancellation.confirm')}
          onPress={onConfirm}
          variant="destructive"
        />
      </View>
    </View>
  ) : (
    <Pressable
      accessibilityLabel={t('cancellation.title')}
      accessibilityRole="button"
      accessibilityState={{ disabled: pending }}
      disabled={pending}
      onPress={onBegin}
      style={({ pressed }) => [
        styles.cancelAction,
        { opacity: pending ? 0.55 : pressed ? 0.7 : 1 },
      ]}
    >
      <AppText
        style={{ color: pending ? colors.textDisabled : colors.danger }}
        variant="bodyStrong"
      >
        {t('cancellation.title')}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenSections: { gap: spacing.md },
  informationCard: { gap: spacing.sm },
  informationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: sizes.compactControl,
  },
  informationCopy: { flex: 1, gap: spacing.xxs },
  attendanceCard: { gap: spacing.sm },
  participantsCard: { gap: spacing.md },
  participantGroup: { gap: spacing.xs },
  participantGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  participantTile: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: borderWidths.subtle,
    flexDirection: 'row',
    flexGrow: 1,
    gap: spacing.xs,
    minHeight: sizes.minimumTouchTarget,
    minWidth: 144,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  participantName: { flex: 1, minWidth: 0 },
  participantActions: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-around',
  },
  guestForm: { gap: spacing.md, width: '100%' },
  teamsCard: { gap: spacing.md },
  teamActions: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-around',
  },
  textAction: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: sizes.minimumTouchTarget,
    paddingHorizontal: spacing.xs,
  },
  textActionCompact: { flex: 0, minHeight: sizes.compactControl },
  textActionLabel: { flexShrink: 1, textAlign: 'center' },
  primaryActionArea: { marginTop: spacing.xs },
  cancelAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: sizes.minimumTouchTarget,
    width: '100%',
  },
  confirmation: { gap: spacing.md },
  startConfirmationActions: { gap: spacing.sm },
  confirmationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
});
