import { Redirect, useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Avatar,
  Button,
  Card,
  FeedbackBanner,
  NumberStepper,
  spacing,
  TextField,
} from '@teamizer/ui';

import type { AdminPlayerDetail, PlayerDetail } from '../api/contracts';
import { useAppServices } from '../providers/app-services-context';
import { useSession } from '../session/session-context';
import { playerRouteFor } from '../statistics/statistics';
import { AppScreen } from '../ui/app-screen';
import { AvatarManager } from './avatar-manager';
import type { PreparedAvatar } from './avatar-picker';
import { canEditPlayerProfile } from './player-admin';
import {
  playerAttributeKeys,
  useAdminPlayerController,
} from './use-admin-player-controller';
import { useProfileController } from './use-profile-controller';

export function PlayerProfileEditScreen({ playerId }: { playerId: string }) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const allowNavigation = useRef(false);
  const { apiClient } = useAppServices();
  const { state, refreshCurrentUser } = useSession();
  const authenticated = state.status === 'AUTHENTICATED' ? state : null;
  const currentPlayerId = authenticated?.currentUser.player.id ?? '';
  const role = authenticated?.currentUser.user.role ?? 'PLAYER';
  const mayEdit = Boolean(
    authenticated && canEditPlayerProfile(role, currentPlayerId, playerId),
  );
  const adminMode = mayEdit && role === 'ADMIN';
  const administrationDisabled = Boolean(
    adminMode && authenticated?.currentUser.player.status !== 'ACTIVE',
  );
  const ownProfile = useProfileController({
    apiClient,
    enabled: mayEdit && !adminMode,
    playerId,
    refreshCurrentUser,
  });
  const managedProfile = useAdminPlayerController({
    administrationDisabled,
    apiClient,
    currentPlayerId: currentPlayerId || null,
    enabled: adminMode,
    playerId,
    refreshCurrentUser,
  });
  const dirty = adminMode
    ? managedProfile.unsavedChanges
    : ownProfile.nameDirty;

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (!dirty || allowNavigation.current) return;
        event.preventDefault();
        Alert.alert(t('profile.discardTitle'), t('profile.discardMessage'), [
          { text: t('profile.keepEditing'), style: 'cancel' },
          {
            text: t('profile.discard'),
            style: 'destructive',
            onPress: () => {
              allowNavigation.current = true;
              navigation.dispatch(event.data.action);
            },
          },
        ]);
      }),
    [dirty, navigation, t],
  );

  if (!authenticated || !mayEdit) {
    return <Redirect href={playerRouteFor(playerId)} />;
  }

  const query = adminMode
    ? managedProfile.detailQuery
    : ownProfile.profileQuery;

  return (
    <AppScreen keyboardAvoiding scroll underHeader contentStyle={styles.screen}>
      {query.isPending ? (
        <AppText tone="muted">{t('profile.loading')}</AppText>
      ) : null}
      {query.isError ? (
        <View style={styles.state}>
          <FeedbackBanner
            message={t('common.connectionRetry')}
            title={t('profile.unavailable')}
            tone="error"
          />
          <Button
            label={t('common.retry')}
            onPress={() => void query.refetch()}
            variant="secondary"
          />
        </View>
      ) : null}
      {query.data ? (
        adminMode ? (
          <AdminEditContent
            administrationDisabled={administrationDisabled}
            controller={managedProfile}
            player={managedProfile.detailQuery.data!}
          />
        ) : (
          <OwnEditContent
            controller={ownProfile}
            player={ownProfile.profileQuery.data!}
          />
        )
      ) : null}
    </AppScreen>
  );
}

type OwnController = ReturnType<typeof useProfileController>;
type AdminController = ReturnType<typeof useAdminPlayerController>;

export function OwnEditContent({
  controller,
  player,
}: {
  controller: OwnController;
  player: PlayerDetail;
}) {
  const { t } = useTranslation();
  return (
    <>
      <EditHeading player={player} />
      <MutationFeedback
        error={controller.errorMessage}
        message={controller.message}
      />
      <IdentityCard
        avatarBusy={controller.avatarPending}
        name={controller.name}
        nameBusy={controller.namePending}
        player={player}
        onChangeName={controller.setName}
        onRemoveAvatar={controller.removeAvatar}
        onUploadAvatar={controller.uploadAvatar}
      />
      <Button
        busy={controller.namePending}
        disabled={!controller.canSaveName}
        label={t('profile.saveChanges')}
        onPress={controller.saveName}
      />
    </>
  );
}

export function AdminEditContent({
  administrationDisabled,
  controller,
  player,
}: {
  administrationDisabled: boolean;
  controller: AdminController;
  player: AdminPlayerDetail;
}) {
  const { t } = useTranslation();
  return (
    <>
      <EditHeading player={player} />
      {administrationDisabled ? (
        <FeedbackBanner
          message={t('adminPlayer.readOnly')}
          title={t('adminPlayer.readOnlyTitle')}
          tone="warning"
        />
      ) : null}
      <MutationFeedback
        error={controller.errorMessage}
        message={controller.message}
      />
      <IdentityCard
        avatarBusy={controller.avatarPending || controller.removeAvatarPending}
        disabled={administrationDisabled}
        name={controller.name}
        nameBusy={controller.updatePending}
        player={player}
        onChangeName={controller.setName}
        onRemoveAvatar={controller.removeAvatar}
        onUploadAvatar={controller.uploadAvatar}
      />
      <Card padding="compact" style={styles.card}>
        <AppText accessibilityRole="header" variant="heading">
          {t('adminPlayer.ratings')}
        </AppText>
        <View>
          {playerAttributeKeys.map((key) => {
            const label = t(`attributes.${key}`);
            return (
              <NumberStepper
                decreaseLabel={t('attributes.decrease', { label })}
                disabled={controller.busy || administrationDisabled}
                increaseLabel={t('attributes.increase', { label })}
                key={key}
                label={label}
                maximum={10}
                minimum={1}
                onChange={(value) => controller.setAttribute(key, value)}
                value={controller.attributes[key]}
                valueLabel={t('attributes.value', {
                  label,
                  maximum: 10,
                  value: controller.attributes[key],
                })}
              />
            );
          })}
        </View>
      </Card>
      {player.type === 'GUEST' && player.account.state !== 'REGISTERED' ? (
        <AccountManagementCard
          administrationDisabled={administrationDisabled}
          controller={controller}
          player={player}
        />
      ) : null}
      <StatusManagement
        administrationDisabled={administrationDisabled}
        controller={controller}
        status={player.status}
      />
      <Button
        busy={controller.updatePending}
        disabled={!controller.canSaveDetails}
        label={t('profile.saveChanges')}
        onPress={controller.saveDetails}
      />
    </>
  );
}

function EditHeading({ player }: { player: PlayerDetail }) {
  return (
    <View style={styles.heading}>
      <Avatar name={player.name} size="hero" url={player.avatarUrl} />
      <AppText
        accessibilityRole="header"
        numberOfLines={2}
        style={styles.headingName}
        variant="title"
      >
        {player.name}
      </AppText>
    </View>
  );
}

function IdentityCard({
  avatarBusy,
  disabled = false,
  name,
  nameBusy,
  player,
  onChangeName,
  onRemoveAvatar,
  onUploadAvatar,
}: {
  avatarBusy: boolean;
  disabled?: boolean;
  name: string;
  nameBusy: boolean;
  player: PlayerDetail;
  onChangeName(value: string): void;
  onRemoveAvatar(): Promise<unknown>;
  onUploadAvatar(file: PreparedAvatar): Promise<unknown>;
}) {
  const { t } = useTranslation();
  return (
    <Card padding="compact" style={styles.card}>
      <AppText accessibilityRole="header" variant="heading">
        {t('profile.displayName')}
      </AppText>
      <TextField
        autoCapitalize="words"
        editable={!disabled && !nameBusy}
        label={t('profile.playerName')}
        maxLength={120}
        onChangeText={onChangeName}
        value={name}
      />
      <AvatarManager
        busy={avatarBusy || disabled}
        name={player.name}
        showPreview={false}
        url={player.avatarUrl}
        onRemove={async () => {
          await onRemoveAvatar();
        }}
        onUpload={async (file) => {
          await onUploadAvatar(file);
        }}
      />
    </Card>
  );
}

function AccountManagementCard({
  administrationDisabled,
  controller,
  player,
}: {
  administrationDisabled: boolean;
  controller: AdminController;
  player: AdminPlayerDetail;
}) {
  const { t } = useTranslation();
  const invitation = player.account.state === 'INVITED' ? player.account : null;
  return (
    <Card padding="compact" style={styles.card}>
      <AppText accessibilityRole="header" variant="heading">
        {t('adminPlayer.accountAccess')}
      </AppText>
      {invitation ? (
        <View style={styles.compactCopy}>
          <AppText variant="bodyStrong">
            {t('adminPlayer.invitationPending')}
          </AppText>
          <AppText tone="muted">{invitation.email}</AppText>
        </View>
      ) : (
        <>
          <AppText tone="muted">{t('adminPlayer.invitationHint')}</AppText>
          <TextField
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            editable={!controller.busy && !administrationDisabled}
            error={
              controller.invitationEmail.length > 0 &&
              !controller.invitationEmailValid
                ? t('adminPlayer.invalidEmail')
                : null
            }
            inputMode="email"
            keyboardType="email-address"
            label={t('adminPlayer.email')}
            maxLength={254}
            onChangeText={controller.setInvitationEmail}
            textContentType="emailAddress"
            value={controller.invitationEmail}
          />
        </>
      )}
      <Button
        accessibilityHint={t('adminPlayer.sendInvitationHint')}
        busy={controller.invitationPending}
        disabled={!controller.canSubmitInvitation}
        label={
          invitation
            ? t('adminPlayer.resendInvitation')
            : t('adminPlayer.sendInvitation')
        }
        onPress={controller.invite}
        variant="secondary"
      />
      <Button
        accessibilityState={{ expanded: controller.showAdvancedConversion }}
        disabled={controller.busy || administrationDisabled}
        label={
          controller.showAdvancedConversion
            ? t('adminPlayer.hideAdvanced')
            : t('adminPlayer.advancedOptions')
        }
        onPress={controller.toggleAdvancedConversion}
        variant="ghost"
      />
      {controller.showAdvancedConversion ? (
        <View style={styles.advanced}>
          <AppText variant="bodyStrong">
            {t('adminPlayer.linkIdentity')}
          </AppText>
          <AppText tone="muted">{t('adminPlayer.conversionHint')}</AppText>
          <TextField
            autoCapitalize="none"
            autoCorrect={false}
            editable={!controller.busy && !administrationDisabled}
            label={t('adminPlayer.firebaseUid')}
            maxLength={255}
            onChangeText={controller.setAuthProviderId}
            value={controller.authProviderId}
          />
          <Button
            busy={controller.conversionPending}
            disabled={
              !controller.authProviderId.trim() ||
              controller.busy ||
              administrationDisabled
            }
            label={t('adminPlayer.convert')}
            onPress={controller.convert}
            variant="secondary"
          />
        </View>
      ) : null}
    </Card>
  );
}

function StatusManagement({
  administrationDisabled,
  controller,
  status,
}: {
  administrationDisabled: boolean;
  controller: AdminController;
  status: 'ACTIVE' | 'INACTIVE';
}) {
  const { t } = useTranslation();
  if (status === 'ACTIVE' && controller.confirmingDeactivation) {
    return (
      <Card padding="compact" style={styles.destructiveCard}>
        <FeedbackBanner
          message={t('adminPlayer.confirmText')}
          title={t('adminPlayer.confirmTitle')}
          tone="warning"
        />
        <Button
          disabled={controller.busy || administrationDisabled}
          label={t('adminPlayer.keepActive')}
          onPress={controller.cancelDeactivation}
          variant="secondary"
        />
        <Button
          busy={controller.updatePending}
          disabled={administrationDisabled}
          label={t('adminPlayer.confirmDeactivate')}
          onPress={controller.confirmDeactivation}
          variant="destructive"
        />
      </Card>
    );
  }

  return (
    <View style={styles.destructiveArea}>
      <Button
        disabled={controller.busy || administrationDisabled}
        label={
          status === 'ACTIVE'
            ? t('adminPlayer.deactivate')
            : t('adminPlayer.reactivate')
        }
        onPress={() => controller.requestStatusChange(status)}
        variant={status === 'ACTIVE' ? 'destructive' : 'secondary'}
      />
    </View>
  );
}

function MutationFeedback({
  error,
  message,
}: {
  error: string | null;
  message: string | null;
}) {
  return (
    <>
      {message ? <FeedbackBanner message={message} tone="success" /> : null}
      {error ? <FeedbackBanner message={error} tone="error" /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.md },
  state: { gap: spacing.md },
  heading: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
  },
  headingName: { textAlign: 'center' },
  card: { gap: spacing.md },
  compactCopy: { gap: spacing.xxs },
  advanced: { gap: spacing.md },
  destructiveArea: { marginTop: spacing.sm },
  destructiveCard: { gap: spacing.md, marginTop: spacing.sm },
});
