import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  AppText,
  Avatar,
  BrandLockup,
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
import { AvatarManager } from '../../../../src/profiles/avatar-manager';
import type { PreparedAvatar } from '../../../../src/profiles/avatar-picker';
import {
  canAccessPlayerAdministration,
  guestConversionErrorMessage,
  requiresDeactivationConfirmation,
} from '../../../../src/profiles/player-admin';
import { profileQueryKeys } from '../../../../src/profiles/profile-query-keys';
import { useAppServices } from '../../../../src/providers/app-services-context';
import { useSession } from '../../../../src/session/session-context';
import { statisticsQueryKeys } from '../../../../src/statistics/statistics-query-keys';
import { AppScreen } from '../../../../src/ui/app-screen';

const attributeLabels = {
  speed: 'Speed',
  endurance: 'Endurance',
  defense: 'Defense',
  attack: 'Attack',
  technique: 'Technique',
} as const;
type AttributeKey = keyof typeof attributeLabels;
const defaultAttributes: Record<AttributeKey, number> = {
  speed: 5,
  endurance: 5,
  defense: 5,
  attack: 5,
  technique: 5,
};

export default function AdminPlayerDetailRoute() {
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
      setMessage('Player details have been updated.');
      await publish(player);
      setNameOverride(null);
      setAttributesOverride(null);
    },
  });
  const avatarMutation = useMutation({
    mutationFn: (file: PreparedAvatar) =>
      apiClient.uploadAdminPlayerAvatar(playerId ?? '', file),
    onSuccess: async (player) => {
      setMessage('Player photo has been updated.');
      await publish(player);
    },
  });
  const removeAvatarMutation = useMutation({
    mutationFn: async () => {
      await apiClient.deletePlayerAvatar(playerId ?? '');
      return apiClient.getAdminPlayerDetail(playerId ?? '');
    },
    onSuccess: async (player) => {
      setMessage('Player photo has been removed.');
      await publish(player);
    },
  });
  const conversionMutation = useMutation({
    mutationFn: () => apiClient.convertGuest(playerId ?? '', authProviderId),
    onSuccess: async () => {
      setAuthProviderId('');
      setMessage(
        'Guest converted. The permanent Player identity and history were preserved.',
      );
      const player = await apiClient.getAdminPlayerDetail(playerId ?? '');
      await publish(player);
    },
  });
  const error =
    updateMutation.error ??
    avatarMutation.error ??
    removeAvatarMutation.error ??
    conversionMutation.error;
  const errorMessage = conversionMutation.error
    ? guestConversionErrorMessage(conversionMutation.error)
    : error instanceof Error
      ? error.message
      : 'The change could not be saved.';
  const busy =
    updateMutation.isPending ||
    avatarMutation.isPending ||
    removeAvatarMutation.isPending ||
    conversionMutation.isPending;

  if (
    state.status !== 'AUTHENTICATED' ||
    !canAccessPlayerAdministration(state.currentUser.user.role)
  ) {
    return <Redirect href="/home" />;
  }

  return (
    <AppScreen scroll contentStyle={styles.screen}>
      <View style={styles.topBar}>
        <BrandLockup compact />
        <Button
          fullWidth={false}
          label="Back"
          onPress={() => returnToPlayers()}
          variant="ghost"
        />
      </View>
      {!playerId ? (
        <FeedbackBanner
          tone="error"
          title="Player unavailable"
          message="This administrative link is missing a valid Player ID."
        />
      ) : null}
      {detailQuery.isPending && playerId ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="heading">Loading Player…</AppText>
          <AppText tone="muted">
            Reading identity, history, and private ratings.
          </AppText>
        </Surface>
      ) : null}
      {detailQuery.isError ? (
        <View style={styles.stateCard}>
          <FeedbackBanner
            tone="error"
            title="Player unavailable"
            message="Check your connection and try again."
          />
          <Button
            label="Try again"
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
              title="Administration is read-only"
              message="Your administrator Player is inactive. Another active administrator must reactivate it before you can manage Players."
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
                  PUBLIC IDENTITY
                </AppText>
                <AppText variant="heading">Player details</AppText>
              </View>
              <TextField
                autoCapitalize="words"
                editable={!busy && !administrationDisabled}
                label="Player name"
                maxLength={120}
                onChangeText={setNameOverride}
                value={name}
              />
              <Button
                busy={updateMutation.isPending}
                disabled={!name.trim() || administrationDisabled}
                label="Save Player details"
                onPress={() => updateMutation.mutate({ name, attributes })}
              />
            </Surface>
            <Surface style={styles.columnCard}>
              <View style={styles.sectionHeading}>
                <AppText variant="eyebrow" tone="brand">
                  ADMIN ONLY
                </AppText>
                <AppText variant="heading">Internal balancing ratings</AppText>
                <AppText tone="muted">
                  These 1–10 values affect future team generation and are never
                  shown to normal Players.
                </AppText>
              </View>
              <View>
                {(Object.keys(attributeLabels) as AttributeKey[]).map((key) => (
                  <NumberStepper
                    disabled={busy || administrationDisabled}
                    key={key}
                    label={attributeLabels[key]}
                    maximum={10}
                    minimum={1}
                    onChange={(value) =>
                      setAttributesOverride((current) => ({
                        ...(current ?? attributes),
                        [key]: value,
                      }))
                    }
                    value={attributes[key]}
                  />
                ))}
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
          {detailQuery.data.type === 'GUEST' ? (
            <Surface tone="brand" style={styles.columnCard}>
              <View style={styles.sectionHeading}>
                <AppText variant="eyebrow" tone="brand">
                  GUEST CONVERSION
                </AppText>
                <AppText variant="heading">
                  Link a provisioned Firebase identity
                </AppText>
                <AppText tone="muted">
                  Conversion creates a PLAYER account for this exact Player ID.
                  It does not create a Firebase account.
                </AppText>
              </View>
              <TextField
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy && !administrationDisabled}
                label="Firebase UID"
                maxLength={255}
                onChangeText={setAuthProviderId}
                value={authProviderId}
              />
              <Button
                busy={conversionMutation.isPending}
                disabled={
                  !authProviderId.trim() || busy || administrationDisabled
                }
                label="Convert guest to regular Player"
                onPress={() => conversionMutation.mutate()}
              />
            </Surface>
          ) : null}
          <Surface tone="muted" style={styles.destructiveArea}>
            <View style={styles.sectionHeading}>
              <AppText variant="eyebrow" tone="error">
                PLAYER STATUS
              </AppText>
              <AppText variant="heading">
                {detailQuery.data.status === 'ACTIVE'
                  ? 'Deactivate Player'
                  : 'Reactivate Player'}
              </AppText>
              <AppText tone="muted">
                Deactivation prevents new Match actions but preserves the Player
                ID, account link, avatar, attributes, and all history. Players
                are never hard-deleted in MVP.
              </AppText>
            </View>
            {detailQuery.data.status === 'ACTIVE' && confirmingDeactivation ? (
              <View style={styles.confirmation}>
                <FeedbackBanner
                  tone="warning"
                  title="Deactivate this Player?"
                  message="Their historical Matches remain intact, but they cannot join or operate new Matches."
                />
                <View style={styles.actions}>
                  <Button
                    disabled={busy || administrationDisabled}
                    fullWidth={false}
                    label="Keep active"
                    onPress={() => setConfirmingDeactivation(false)}
                    variant="secondary"
                  />
                  <Button
                    busy={updateMutation.isPending}
                    fullWidth={false}
                    label="Confirm deactivation"
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
                    ? 'Deactivate Player'
                    : 'Reactivate Player'
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
  return (
    <View style={styles.heading}>
      <Avatar name={player.name} size="large" url={player.avatarUrl} />
      <View style={styles.headingCopy}>
        <View style={styles.actions}>
          <StatusPill label="ADMIN VIEW" tone="info" />
          <StatusPill
            label={player.status}
            tone={player.status === 'ACTIVE' ? 'success' : 'neutral'}
          />
          <StatusPill label={player.type === 'GUEST' ? 'GUEST' : 'REGULAR'} />
        </View>
        <AppText accessibilityRole="header" variant="title">
          {player.name}
        </AppText>
        <AppText tone="muted">
          {player.statistics.matches} finished Matches ·{' '}
          {player.statistics.goals} goals
        </AppText>
      </View>
    </View>
  );
}

function returnToPlayers(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/admin/players' as Href);
}

const styles = StyleSheet.create({
  screen: { gap: spacing.xxl },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginTop: spacing.lg,
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
