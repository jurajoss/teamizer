import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Avatar,
  BrandLockup,
  Button,
  FeedbackBanner,
  radii,
  spacing,
  StatusPill,
  Surface,
  TextField,
} from '@teamizer/ui';

import type { PlayerDetail } from '../../src/api/contracts';
import { profileQueryKeys } from '../../src/profiles/profile-query-keys';
import { AvatarManager } from '../../src/profiles/avatar-manager';
import type { PreparedAvatar } from '../../src/profiles/avatar-picker';
import { asyncContentState } from '../../src/profiles/player-admin';
import { useAppServices } from '../../src/providers/app-services-context';
import { useSession } from '../../src/session/session-context';
import {
  formatGoalsPerMatch,
  formatWinRate,
} from '../../src/statistics/statistics';
import { statisticsQueryKeys } from '../../src/statistics/statistics-query-keys';
import { AppScreen } from '../../src/ui/app-screen';
import { FoundationScreen } from '../../src/ui/foundation-screen';

export default function ProfileRoute() {
  const { state, refreshCurrentUser } = useSession();
  const { apiClient } = useAppServices();
  const queryClient = useQueryClient();
  const playerId =
    state.status === 'AUTHENTICATED' ? state.currentUser.player.id : null;
  const profileQuery = useQuery({
    queryKey: profileQueryKeys.current(playerId ?? 'invalid'),
    queryFn: () => apiClient.getPlayerDetail(playerId ?? ''),
    enabled: playerId !== null,
  });
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const name = nameOverride ?? profileQuery.data?.name ?? '';

  const publish = async (player: PlayerDetail) => {
    queryClient.setQueryData(profileQueryKeys.current(player.id), player);
    queryClient.setQueryData(statisticsQueryKeys.player(player.id), player);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: statisticsQueryKeys.root }),
      queryClient.invalidateQueries({ queryKey: profileQueryKeys.root }),
      refreshCurrentUser(),
    ]);
  };
  const nameMutation = useMutation({
    mutationFn: () => apiClient.updateOwnPlayer(playerId ?? '', { name }),
    onSuccess: async (player) => {
      setMessage('Your Player name has been updated.');
      await publish(player);
      setNameOverride(null);
    },
  });
  const avatarMutation = useMutation({
    mutationFn: (file: PreparedAvatar) =>
      apiClient.uploadOwnPlayerAvatar(playerId ?? '', file),
    onSuccess: async (player) => {
      setMessage('Your Player photo has been updated.');
      await publish(player);
    },
  });
  const removeAvatarMutation = useMutation({
    mutationFn: async () => {
      await apiClient.deletePlayerAvatar(playerId ?? '');
      return apiClient.getPlayerDetail(playerId ?? '');
    },
    onSuccess: async (player) => {
      setMessage('Your Player photo has been removed.');
      await publish(player);
    },
  });
  const mutationError =
    nameMutation.error ?? avatarMutation.error ?? removeAvatarMutation.error;

  if (state.status !== 'AUTHENTICATED') {
    return <FoundationScreen busy message="Checking your Player profile…" />;
  }
  const contentState = asyncContentState(
    profileQuery.isPending,
    profileQuery.isError,
    profileQuery.data ? 1 : 0,
  );

  return (
    <AppScreen scroll contentStyle={styles.screen}>
      <View style={styles.topBar}>
        <BrandLockup compact />
        <Button
          fullWidth={false}
          label="Back"
          onPress={() => returnHome()}
          variant="ghost"
        />
      </View>

      {contentState === 'LOADING' ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="heading">Loading your profile…</AppText>
          <AppText tone="muted">
            Reading your Player identity and results.
          </AppText>
        </Surface>
      ) : null}
      {contentState === 'ERROR' ? (
        <View style={styles.stateCard}>
          <FeedbackBanner
            tone="error"
            title="Profile unavailable"
            message="Check your connection and try again."
          />
          <Button
            label="Try again"
            onPress={() => void profileQuery.refetch()}
            variant="secondary"
          />
        </View>
      ) : null}
      {contentState === 'EMPTY' ? (
        <FeedbackBanner
          tone="error"
          title="Profile unavailable"
          message="The API returned no Player profile. Try again."
        />
      ) : null}
      {contentState === 'READY' && profileQuery.data ? (
        <>
          <ProfileHeading player={profileQuery.data} />
          {message ? <FeedbackBanner tone="success" message={message} /> : null}
          {mutationError ? (
            <FeedbackBanner
              tone="error"
              message={
                mutationError instanceof Error
                  ? mutationError.message
                  : 'The profile change could not be saved.'
              }
            />
          ) : null}
          <Surface style={styles.formCard}>
            <View style={styles.sectionHeading}>
              <AppText variant="eyebrow" tone="brand">
                PUBLIC PROFILE
              </AppText>
              <AppText variant="heading">Display name</AppText>
              <AppText tone="muted">
                Your balancing ratings stay private and cannot be viewed or
                edited here.
              </AppText>
            </View>
            <TextField
              autoCapitalize="words"
              editable={!nameMutation.isPending}
              label="Player name"
              maxLength={120}
              onChangeText={setNameOverride}
              value={name}
            />
            <Button
              busy={nameMutation.isPending}
              disabled={!name.trim() || name.trim() === profileQuery.data.name}
              label="Save name"
              onPress={() => nameMutation.mutate()}
            />
          </Surface>
          <Surface style={styles.formCard}>
            <AvatarManager
              busy={avatarMutation.isPending || removeAvatarMutation.isPending}
              name={profileQuery.data.name}
              url={profileQuery.data.avatarUrl}
              onRemove={async () => {
                await removeAvatarMutation.mutateAsync();
              }}
              onUpload={async (file) => {
                await avatarMutation.mutateAsync(file);
              }}
            />
          </Surface>
          <StatisticsCard player={profileQuery.data} />
        </>
      ) : null}
    </AppScreen>
  );
}

function ProfileHeading({ player }: { player: PlayerDetail }) {
  return (
    <View style={styles.heading}>
      <Avatar name={player.name} size="hero" url={player.avatarUrl} />
      <View style={styles.headingCopy}>
        <View style={styles.pills}>
          <StatusPill
            label={player.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'}
            tone={player.status === 'ACTIVE' ? 'success' : 'neutral'}
          />
          <StatusPill label="REGULAR PLAYER" tone="neutral" />
        </View>
        <AppText accessibilityRole="header" variant="title">
          {player.name}
        </AppText>
        <AppText tone="muted">
          Your permanent Teamizer Player identity and finished-Match record.
        </AppText>
      </View>
    </View>
  );
}

function StatisticsCard({ player }: { player: PlayerDetail }) {
  const metrics = [
    ['Matches', String(player.statistics.matches)],
    ['Win rate', formatWinRate(player.statistics.winRate)],
    ['Goals', String(player.statistics.goals)],
    ['Goals / Match', formatGoalsPerMatch(player.statistics.goalsPerMatch)],
  ] as const;
  return (
    <Surface tone="brand" style={styles.formCard}>
      <View style={styles.sectionHeading}>
        <AppText variant="eyebrow" tone="brand">
          PERFORMANCE
        </AppText>
        <AppText variant="heading">Finished-Match summary</AppText>
      </View>
      <View style={styles.metrics}>
        {metrics.map(([label, value]) => (
          <View key={label} style={styles.metric}>
            <AppText variant="heading">{value}</AppText>
            <AppText variant="caption" tone="muted">
              {label}
            </AppText>
          </View>
        ))}
      </View>
    </Surface>
  );
}

function returnHome(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
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
    gap: spacing.xl,
    marginTop: spacing.lg,
  },
  headingCopy: { flex: 1, gap: spacing.sm, minWidth: 220 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stateCard: { gap: spacing.md },
  formCard: { gap: spacing.lg },
  sectionHeading: { gap: spacing.xs },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: {
    backgroundColor: 'rgba(255,255,255,0.64)',
    borderRadius: radii.md,
    flexBasis: 120,
    flexGrow: 1,
    gap: spacing.xxs,
    padding: spacing.md,
  },
});
