import { Redirect, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
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
  useResponsiveLayout,
} from '@teamizer/ui';

import type { AdminPlayerDetail } from '../../../../src/api/contracts';
import { AvatarManager } from '../../../../src/profiles/avatar-manager';
import {
  canAccessPlayerAdministration,
  canInviteGuest,
} from '../../../../src/profiles/player-admin';
import {
  playerAttributeKeys,
  useAdminPlayerController,
} from '../../../../src/profiles/use-admin-player-controller';
import { useAppServices } from '../../../../src/providers/app-services-context';
import { useSession } from '../../../../src/session/session-context';
import { AppScreen } from '../../../../src/ui/app-screen';

export default function AdminPlayerDetailRoute() {
  const { t } = useTranslation();
  const parameters = useLocalSearchParams<{ playerId?: string | string[] }>();
  const playerId =
    typeof parameters.playerId === 'string' ? parameters.playerId : null;
  const { state, refreshCurrentUser } = useSession();
  const { apiClient } = useAppServices();
  const { isTablet } = useResponsiveLayout();
  const authorized =
    state.status === 'AUTHENTICATED' &&
    canAccessPlayerAdministration(state.currentUser.user.role);
  const currentPlayerId =
    state.status === 'AUTHENTICATED' ? state.currentUser.player.id : null;
  const administrationDisabled =
    state.status !== 'AUTHENTICATED' ||
    state.currentUser.player.status !== 'ACTIVE';
  const player = useAdminPlayerController({
    administrationDisabled,
    apiClient,
    currentPlayerId,
    enabled: authorized,
    playerId,
    refreshCurrentUser,
  });
  const { detailQuery } = player;

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
          {player.message ? (
            <FeedbackBanner tone="success" message={player.message} />
          ) : null}
          {player.errorMessage ? (
            <FeedbackBanner tone="error" message={player.errorMessage} />
          ) : null}
          <View style={[styles.columns, isTablet && styles.columnsWide]}>
            <Surface style={styles.columnCard}>
              <View style={styles.sectionHeading}>
                <AppText variant="eyebrow" tone="brand">
                  {t('adminPlayer.publicIdentity').toUpperCase()}
                </AppText>
                <AppText variant="heading">{t('adminPlayer.details')}</AppText>
              </View>
              <TextField
                autoCapitalize="words"
                editable={!player.busy && !administrationDisabled}
                label={t('profile.playerName')}
                maxLength={120}
                onChangeText={player.setName}
                value={player.name}
              />
              <Button
                busy={player.updatePending}
                disabled={!player.name.trim() || administrationDisabled}
                label={t('adminPlayer.saveDetails')}
                onPress={player.saveDetails}
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
                {playerAttributeKeys.map((key) => {
                  const label = t(`attributes.${key}`);
                  return (
                    <NumberStepper
                      decreaseLabel={t('attributes.decrease', { label })}
                      disabled={player.busy || administrationDisabled}
                      increaseLabel={t('attributes.increase', { label })}
                      key={key}
                      label={label}
                      maximum={10}
                      minimum={1}
                      onChange={(value) => player.setAttribute(key, value)}
                      value={player.attributes[key]}
                      valueLabel={t('attributes.value', {
                        label,
                        value: player.attributes[key],
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
              busy={player.busy || administrationDisabled}
              name={detailQuery.data.name}
              url={detailQuery.data.avatarUrl}
              onRemove={async () => {
                await player.removeAvatar();
              }}
              onUpload={async (file) => {
                await player.uploadAvatar(file);
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
                  editable={!player.busy && !administrationDisabled}
                  error={
                    player.invitationEmail.length > 0 &&
                    !player.invitationEmailValid
                      ? t('adminPlayer.invalidEmail')
                      : null
                  }
                  inputMode="email"
                  keyboardType="email-address"
                  label={t('adminPlayer.email')}
                  maxLength={254}
                  onChangeText={player.setInvitationEmail}
                  textContentType="emailAddress"
                  value={player.invitationEmail}
                />
                <Button
                  accessibilityHint={t('adminPlayer.sendInvitationHint')}
                  busy={player.invitationPending}
                  disabled={!player.canSubmitInvitation}
                  label={t('adminPlayer.sendInvitation')}
                  onPress={player.invite}
                />
              </Surface>
              <Surface tone="muted" style={styles.columnCard}>
                <Button
                  accessibilityState={{
                    expanded: player.showAdvancedConversion,
                  }}
                  disabled={player.busy || administrationDisabled}
                  label={
                    player.showAdvancedConversion
                      ? t('adminPlayer.hideAdvanced')
                      : t('adminPlayer.advancedOptions')
                  }
                  onPress={player.toggleAdvancedConversion}
                  variant="ghost"
                />
                {player.showAdvancedConversion ? (
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
                      editable={!player.busy && !administrationDisabled}
                      label={t('adminPlayer.firebaseUid')}
                      maxLength={255}
                      onChangeText={player.setAuthProviderId}
                      value={player.authProviderId}
                    />
                    <Button
                      busy={player.conversionPending}
                      disabled={
                        !player.authProviderId.trim() ||
                        player.busy ||
                        administrationDisabled
                      }
                      label={t('adminPlayer.convert')}
                      onPress={player.convert}
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
            {detailQuery.data.status === 'ACTIVE' &&
            player.confirmingDeactivation ? (
              <View style={styles.confirmation}>
                <FeedbackBanner
                  tone="warning"
                  title={t('adminPlayer.confirmTitle')}
                  message={t('adminPlayer.confirmText')}
                />
                <View style={styles.actions}>
                  <Button
                    disabled={player.busy || administrationDisabled}
                    fullWidth={false}
                    label={t('adminPlayer.keepActive')}
                    onPress={player.cancelDeactivation}
                    variant="secondary"
                  />
                  <Button
                    busy={player.updatePending}
                    fullWidth={false}
                    label={t('adminPlayer.confirmDeactivate')}
                    onPress={player.confirmDeactivation}
                    variant="destructive"
                  />
                </View>
              </View>
            ) : (
              <Button
                disabled={player.busy || administrationDisabled}
                label={
                  detailQuery.data.status === 'ACTIVE'
                    ? t('adminPlayer.deactivate')
                    : t('adminPlayer.reactivate')
                }
                onPress={() =>
                  player.requestStatusChange(detailQuery.data.status)
                }
                variant={
                  detailQuery.data.status === 'ACTIVE'
                    ? 'destructive'
                    : 'secondary'
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
