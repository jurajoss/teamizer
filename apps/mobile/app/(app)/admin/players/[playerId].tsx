import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Avatar,
  Button,
  FeedbackBanner,
  NumberStepper,
  spacing,
  StatusPill,
  Surface,
  TextField,
} from '@teamizer/ui';

import type {
  AdminPlayerDetail,
  UpdateAdminPlayerInput,
} from '../../../../src/api/contracts';
import { matchQueryKeys } from '../../../../src/matches/match-query-keys';
import { localizedErrorMessage } from '../../../../src/i18n/localized-error';
import { AvatarManager } from '../../../../src/profiles/avatar-manager';
import type { PreparedAvatar } from '../../../../src/profiles/avatar-picker';
import {
  canAccessPlayerAdministration,
  canInviteGuest,
  canSubmitGuestInvitation,
  isValidInvitationEmail,
  normalizeInvitationEmail,
  requiresDeactivationConfirmation,
} from '../../../../src/profiles/player-admin';
import { profileQueryKeys } from '../../../../src/profiles/profile-query-keys';
import { useAppServices } from '../../../../src/providers/app-services-context';
import { useSession } from '../../../../src/session/session-context';
import { statisticsQueryKeys } from '../../../../src/statistics/statistics-query-keys';
import { AppScreen } from '../../../../src/ui/app-screen';

type AttributeKey = 'speed' | 'endurance' | 'defense' | 'attack' | 'technique';
const attributeKeys: AttributeKey[] = [
  'speed',
  'endurance',
  'defense',
  'attack',
  'technique',
];
const defaultAttributes: Record<AttributeKey, number> = {
  speed: 5,
  endurance: 5,
  defense: 5,
  attack: 5,
  technique: 5,
};

export default function AdminPlayerDetailRoute() {
  const { t } = useTranslation();
  const parameters = useLocalSearchParams<{ playerId?: string | string[] }>();
  const playerId =
    typeof parameters.playerId === 'string' ? parameters.playerId : null;
  const { state, refreshCurrentUser } = useSession();
  const { apiClient } = useAppServices();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const detailQuery = useQuery({
    queryKey: profileQueryKeys.adminDetail(playerId ?? 'invalid'),
    queryFn: () => apiClient.getAdminPlayerDetail(playerId ?? ''),
    enabled:
      playerId !== null &&
      state.status === 'AUTHENTICATED' &&
      canAccessPlayerAdministration(state.currentUser.user.role),
  });
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [attributesOverride, setAttributesOverride] = useState<Record<
    AttributeKey,
    number
  > | null>(null);
  const [authProviderId, setAuthProviderId] = useState('');
  const [invitationEmail, setInvitationEmail] = useState('');
  const [showAdvancedConversion, setShowAdvancedConversion] = useState(false);
  const [confirmingDeactivation, setConfirmingDeactivation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const name = nameOverride ?? detailQuery.data?.name ?? '';
  const attributes =
    attributesOverride ?? detailQuery.data?.attributes ?? defaultAttributes;
  const currentPlayerId =
    state.status === 'AUTHENTICATED' ? state.currentUser.player.id : null;
  const administrationDisabled =
    state.status !== 'AUTHENTICATED' ||
    state.currentUser.player.status !== 'ACTIVE';

  const publish = async (player: AdminPlayerDetail) => {
    queryClient.setQueryData(profileQueryKeys.adminDetail(player.id), player);
    queryClient.setQueryData(statisticsQueryKeys.player(player.id), player);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: profileQueryKeys.root }),
      queryClient.invalidateQueries({ queryKey: statisticsQueryKeys.root }),
      queryClient.invalidateQueries({ queryKey: matchQueryKeys.root }),
      player.id === currentPlayerId ? refreshCurrentUser() : Promise.resolve(),
    ]);
  };
  const updateMutation = useMutation({
    mutationFn: (input: UpdateAdminPlayerInput) =>
      apiClient.updateAdminPlayer(playerId ?? '', input),
    onSuccess: async (player) => {
      setConfirmingDeactivation(false);
      setMessage(t('adminPlayer.updated'));
      await publish(player);
      setNameOverride(null);
      setAttributesOverride(null);
    },
  });
  const avatarMutation = useMutation({
    mutationFn: (file: PreparedAvatar) =>
      apiClient.uploadAdminPlayerAvatar(playerId ?? '', file),
    onSuccess: async (player) => {
      setMessage(t('adminPlayer.photoUpdated'));
      await publish(player);
    },
  });
  const removeAvatarMutation = useMutation({
    mutationFn: async () => {
      await apiClient.deletePlayerAvatar(playerId ?? '');
      return apiClient.getAdminPlayerDetail(playerId ?? '');
    },
    onSuccess: async (player) => {
      setMessage(t('adminPlayer.photoRemoved'));
      await publish(player);
    },
  });
  const conversionMutation = useMutation({
    mutationFn: () => apiClient.convertGuest(playerId ?? '', authProviderId),
    onSuccess: async () => {
      setAuthProviderId('');
      setMessage(t('adminPlayer.conversionSuccess'));
      const player = await apiClient.getAdminPlayerDetail(playerId ?? '');
      await publish(player);
    },
  });
  const invitationMutation = useMutation({
    mutationFn: () => apiClient.inviteGuest(playerId ?? '', invitationEmail),
    onSuccess: (invitation) => {
      setInvitationEmail(normalizeInvitationEmail(invitationEmail));
      setMessage(
        t(
          invitation.status === 'ACCEPTED'
            ? 'adminPlayer.invitationAlreadyAccepted'
            : 'adminPlayer.invitationSent',
        ),
      );
    },
  });
  const error =
    updateMutation.error ??
    removeAvatarMutation.error ??
    invitationMutation.error ??
    conversionMutation.error;
  const errorMessage = localizedErrorMessage(
    error,
    t,
    invitationMutation.error
      ? 'adminPlayer.invitationFailed'
      : 'adminPlayer.saveFailed',
  );
  const busy =
    updateMutation.isPending ||
    avatarMutation.isPending ||
    removeAvatarMutation.isPending ||
    invitationMutation.isPending ||
    conversionMutation.isPending;
  const invitationEmailValid = isValidInvitationEmail(invitationEmail);

  if (
    state.status !== 'AUTHENTICATED' ||
    !canAccessPlayerAdministration(state.currentUser.user.role)
  ) {
    return <Redirect href="/home" />;
  }

  return (
    <AppScreen scroll underHeader contentStyle={styles.screen}>
      {!playerId ? (
        <FeedbackBanner
          tone="error"
          title={t('adminPlayer.unavailable')}
          message={t('adminPlayer.missingId')}
        />
      ) : null}
      {detailQuery.isPending && playerId ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="heading">{t('playerDetail.loading')}</AppText>
        </Surface>
      ) : null}
      {detailQuery.isError ? (
        <View style={styles.stateCard}>
          <FeedbackBanner
            tone="error"
            title={t('adminPlayer.unavailable')}
            message={t('common.connectionRetry')}
          />
          <Button
            label={t('common.retry')}
            onPress={() => void detailQuery.refetch()}
            variant="secondary"
          />
        </View>
      ) : null}
      {detailQuery.data ? (
        <>
          <AdminHeading player={detailQuery.data} />
          {administrationDisabled ? (
            <FeedbackBanner
              tone="warning"
              title={t('adminPlayer.readOnlyTitle')}
              message={t('adminPlayer.readOnly')}
            />
          ) : null}
          {message ? <FeedbackBanner tone="success" message={message} /> : null}
          {error ? (
            <FeedbackBanner tone="error" message={errorMessage} />
          ) : null}
          <View style={[styles.columns, width >= 700 && styles.columnsWide]}>
            <Surface style={styles.columnCard}>
              <View style={styles.sectionHeading}>
                <AppText variant="eyebrow" tone="brand">
                  {t('adminPlayer.publicIdentity').toUpperCase()}
                </AppText>
                <AppText variant="heading">{t('adminPlayer.details')}</AppText>
              </View>
              <TextField
                autoCapitalize="words"
                editable={!busy && !administrationDisabled}
                label={t('profile.playerName')}
                maxLength={120}
                onChangeText={setNameOverride}
                value={name}
              />
              <Button
                busy={updateMutation.isPending}
                disabled={!name.trim() || administrationDisabled}
                label={t('adminPlayer.saveDetails')}
                onPress={() => updateMutation.mutate({ name, attributes })}
              />
            </Surface>
            <Surface style={styles.columnCard}>
              <View style={styles.sectionHeading}>
                <AppText variant="eyebrow" tone="brand">
                  {t('adminPlayer.adminOnly').toUpperCase()}
                </AppText>
                <AppText variant="heading">{t('adminPlayer.ratings')}</AppText>
                <AppText tone="muted">{t('adminPlayer.ratingsHint')}</AppText>
              </View>
              <View>
                {attributeKeys.map((key) => {
                  const label = t(`attributes.${key}`);
                  return (
                    <NumberStepper
                      decreaseLabel={t('attributes.decrease', { label })}
                      disabled={busy || administrationDisabled}
                      increaseLabel={t('attributes.increase', { label })}
                      key={key}
                      label={label}
                      maximum={10}
                      minimum={1}
                      onChange={(value) =>
                        setAttributesOverride((current) => ({
                          ...(current ?? attributes),
                          [key]: value,
                        }))
                      }
                      value={attributes[key]}
                      valueLabel={t('attributes.value', {
                        label,
                        value: attributes[key],
                        maximum: 10,
                      })}
                    />
                  );
                })}
              </View>
            </Surface>
          </View>
          <Surface style={styles.columnCard}>
            <AvatarManager
              busy={busy || administrationDisabled}
              name={detailQuery.data.name}
              url={detailQuery.data.avatarUrl}
              onRemove={async () => {
                await removeAvatarMutation.mutateAsync();
              }}
              onUpload={async (file) => {
                await avatarMutation.mutateAsync(file);
              }}
            />
          </Surface>
          {canInviteGuest(
            state.currentUser.user.role,
            detailQuery.data.type,
          ) ? (
            <>
              <Surface tone="brand" style={styles.columnCard}>
                <View style={styles.sectionHeading}>
                  <AppText variant="eyebrow" tone="brand">
                    {t('adminPlayer.accountAccess').toUpperCase()}
                  </AppText>
                  <AppText variant="heading">
                    {t('adminPlayer.inviteAsUser')}
                  </AppText>
                  <AppText tone="muted">
                    {t('adminPlayer.invitationHint')}
                  </AppText>
                </View>
                <TextField
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  editable={!busy && !administrationDisabled}
                  error={
                    invitationEmail.length > 0 && !invitationEmailValid
                      ? t('adminPlayer.invalidEmail')
                      : null
                  }
                  inputMode="email"
                  keyboardType="email-address"
                  label={t('adminPlayer.email')}
                  maxLength={254}
                  onChangeText={setInvitationEmail}
                  textContentType="emailAddress"
                  value={invitationEmail}
                />
                <Button
                  accessibilityHint={t('adminPlayer.sendInvitationHint')}
                  busy={invitationMutation.isPending}
                  disabled={
                    !canSubmitGuestInvitation(
                      invitationEmail,
                      busy,
                      administrationDisabled,
                    )
                  }
                  label={t('adminPlayer.sendInvitation')}
                  onPress={() => invitationMutation.mutate()}
                />
              </Surface>
              <Surface tone="muted" style={styles.columnCard}>
                <Button
                  accessibilityState={{ expanded: showAdvancedConversion }}
                  disabled={busy || administrationDisabled}
                  label={
                    showAdvancedConversion
                      ? t('adminPlayer.hideAdvanced')
                      : t('adminPlayer.advancedOptions')
                  }
                  onPress={() =>
                    setShowAdvancedConversion((current) => !current)
                  }
                  variant="ghost"
                />
                {showAdvancedConversion ? (
                  <>
                    <View style={styles.sectionHeading}>
                      <AppText variant="heading">
                        {t('adminPlayer.linkIdentity')}
                      </AppText>
                      <AppText tone="muted">
                        {t('adminPlayer.conversionHint')}
                      </AppText>
                    </View>
                    <TextField
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!busy && !administrationDisabled}
                      label={t('adminPlayer.firebaseUid')}
                      maxLength={255}
                      onChangeText={setAuthProviderId}
                      value={authProviderId}
                    />
                    <Button
                      busy={conversionMutation.isPending}
                      disabled={
                        !authProviderId.trim() || busy || administrationDisabled
                      }
                      label={t('adminPlayer.convert')}
                      onPress={() => conversionMutation.mutate()}
                      variant="secondary"
                    />
                  </>
                ) : null}
              </Surface>
            </>
          ) : null}
          <Surface tone="muted" style={styles.destructiveArea}>
            <View style={styles.sectionHeading}>
              <AppText variant="eyebrow" tone="error">
                {t('adminPlayer.playerStatus').toUpperCase()}
              </AppText>
              <AppText variant="heading">
                {detailQuery.data.status === 'ACTIVE'
                  ? t('adminPlayer.deactivate')
                  : t('adminPlayer.reactivate')}
              </AppText>
              <AppText tone="muted">{t('adminPlayer.statusHint')}</AppText>
            </View>
            {detailQuery.data.status === 'ACTIVE' && confirmingDeactivation ? (
              <View style={styles.confirmation}>
                <FeedbackBanner
                  tone="warning"
                  title={t('adminPlayer.confirmTitle')}
                  message={t('adminPlayer.confirmText')}
                />
                <View style={styles.actions}>
                  <Button
                    disabled={busy || administrationDisabled}
                    fullWidth={false}
                    label={t('adminPlayer.keepActive')}
                    onPress={() => setConfirmingDeactivation(false)}
                    variant="secondary"
                  />
                  <Button
                    busy={updateMutation.isPending}
                    fullWidth={false}
                    label={t('adminPlayer.confirmDeactivate')}
                    onPress={() =>
                      updateMutation.mutate({ status: 'INACTIVE' })
                    }
                    variant="danger"
                  />
                </View>
              </View>
            ) : (
              <Button
                disabled={busy || administrationDisabled}
                label={
                  detailQuery.data.status === 'ACTIVE'
                    ? t('adminPlayer.deactivate')
                    : t('adminPlayer.reactivate')
                }
                onPress={() =>
                  requiresDeactivationConfirmation(detailQuery.data.status)
                    ? setConfirmingDeactivation(true)
                    : updateMutation.mutate({ status: 'ACTIVE' })
                }
                variant={
                  detailQuery.data.status === 'ACTIVE' ? 'danger' : 'secondary'
                }
              />
            )}
          </Surface>
        </>
      ) : null}
    </AppScreen>
  );
}

function AdminHeading({ player }: { player: AdminPlayerDetail }) {
  const { t } = useTranslation();
  return (
    <View style={styles.heading}>
      <Avatar name={player.name} size="large" url={player.avatarUrl} />
      <View style={styles.headingCopy}>
        <View style={styles.actions}>
          <StatusPill label={t('status.adminView')} tone="info" />
          <StatusPill
            label={
              player.status === 'ACTIVE'
                ? t('status.active')
                : t('status.inactive')
            }
            tone={player.status === 'ACTIVE' ? 'success' : 'neutral'}
          />
          <StatusPill
            label={
              player.type === 'GUEST' ? t('status.guest') : t('status.regular')
            }
          />
        </View>
        <AppText accessibilityRole="header" variant="title">
          {player.name}
        </AppText>
        <AppText tone="muted">
          {t('adminPlayer.summary', {
            matches: player.statistics.matches,
            goals: player.statistics.goals,
          })}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  headingCopy: { flex: 1, gap: spacing.sm, minWidth: 220 },
  stateCard: { gap: spacing.md },
  columns: { gap: spacing.lg },
  columnsWide: { alignItems: 'flex-start', flexDirection: 'row' },
  columnCard: { flex: 1, gap: spacing.lg, minWidth: 0 },
  sectionHeading: { gap: spacing.xs },
  destructiveArea: { gap: spacing.lg, marginTop: spacing.lg },
  confirmation: { gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
