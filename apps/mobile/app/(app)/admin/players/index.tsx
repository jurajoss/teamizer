import { useInfiniteQuery } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import type { Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  AppText,
  Avatar,
  BrandLockup,
  Button,
  colors,
  FeedbackBanner,
  radii,
  spacing,
  StatusPill,
  Surface,
  TextField,
} from '@teamizer/ui';

import type { PlayersPage } from '../../../../src/api/contracts';
import {
  asyncContentState,
  canAccessPlayerAdministration,
  playerKindLabel,
} from '../../../../src/profiles/player-admin';
import { profileQueryKeys } from '../../../../src/profiles/profile-query-keys';
import { useAppServices } from '../../../../src/providers/app-services-context';
import { useSession } from '../../../../src/session/session-context';
import { AppScreen } from '../../../../src/ui/app-screen';

const PAGE_SIZE = 25;

export default function AdminPlayerListRoute() {
  const { state } = useSession();
  const { apiClient } = useAppServices();
  const [draftQuery, setDraftQuery] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | 'ALL'>('ALL');
  const playersQuery = useInfiniteQuery({
    queryKey: profileQueryKeys.adminList(status, query),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiClient.getPlayers({
        status,
        limit: PAGE_SIZE,
        ...(query ? { q: query } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor,
    enabled:
      state.status === 'AUTHENTICATED' &&
      canAccessPlayerAdministration(state.currentUser.user.role),
  });

  if (
    state.status !== 'AUTHENTICATED' ||
    !canAccessPlayerAdministration(state.currentUser.user.role)
  ) {
    return <Redirect href="/home" />;
  }
  const players = flattenPlayers(playersQuery.data?.pages);
  const contentState = asyncContentState(
    playersQuery.isPending,
    playersQuery.isError,
    players.length,
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
      <View style={styles.heading}>
        <StatusPill label="ADMIN" tone="info" />
        <AppText accessibilityRole="header" variant="title">
          Player management
        </AppText>
        <AppText tone="muted">
          Manage permanent Player identities, guests, status, photos, and
          internal ratings.
        </AppText>
      </View>
      <Surface tone="muted" style={styles.filters}>
        <TextField
          autoCapitalize="words"
          label="Search by name"
          maxLength={120}
          onChangeText={setDraftQuery}
          onSubmitEditing={() => setQuery(draftQuery.trim())}
          placeholder="e.g. Alex"
          returnKeyType="search"
          value={draftQuery}
        />
        <View style={styles.filterActions}>
          <Button
            fullWidth={false}
            label="Search"
            onPress={() => setQuery(draftQuery.trim())}
          />
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((option) => (
            <Button
              fullWidth={false}
              key={option}
              label={
                option === 'ALL'
                  ? 'All'
                  : option === 'ACTIVE'
                    ? 'Active'
                    : 'Inactive'
              }
              onPress={() => setStatus(option)}
              variant={status === option ? 'secondary' : 'ghost'}
            />
          ))}
        </View>
      </Surface>

      {contentState === 'LOADING' ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="heading">Loading Players…</AppText>
          <AppText tone="muted">Reading regular and guest identities.</AppText>
        </Surface>
      ) : null}
      {contentState === 'ERROR' ? (
        <View style={styles.stateCard}>
          <FeedbackBanner
            tone="error"
            title="Players unavailable"
            message="Check your connection and try again."
          />
          <Button
            label="Try again"
            onPress={() => void playersQuery.refetch()}
            variant="secondary"
          />
        </View>
      ) : null}
      {contentState === 'EMPTY' ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="heading">No matching Players</AppText>
          <AppText tone="muted">Try another name or status.</AppText>
        </Surface>
      ) : null}
      {contentState === 'READY' ? (
        <View
          accessibilityLabel="Administrative Player list"
          style={styles.list}
        >
          {players.map((player) => (
            <Pressable
              accessibilityHint="Opens administrative Player details"
              accessibilityLabel={`Manage ${player.name}`}
              accessibilityRole="button"
              key={player.id}
              onPress={() => router.push(`/admin/players/${player.id}` as Href)}
              style={({ pressed }) => [
                styles.playerRow,
                pressed && styles.playerRowPressed,
              ]}
            >
              <Avatar name={player.name} url={player.avatarUrl} />
              <View style={styles.playerCopy}>
                <AppText variant="bodyStrong">{player.name}</AppText>
                <AppText variant="caption" tone="muted">
                  {playerKindLabel(player.type)}
                </AppText>
              </View>
              <StatusPill
                label={player.status}
                tone={player.status === 'ACTIVE' ? 'success' : 'neutral'}
              />
              <AppText
                accessibilityElementsHidden
                tone="subtle"
                variant="heading"
              >
                ›
              </AppText>
            </Pressable>
          ))}
          {playersQuery.hasNextPage ? (
            <Button
              busy={playersQuery.isFetchingNextPage}
              label="Load more Players"
              onPress={() => void playersQuery.fetchNextPage()}
              variant="secondary"
            />
          ) : null}
        </View>
      ) : null}
    </AppScreen>
  );
}

function flattenPlayers(pages: PlayersPage[] | undefined) {
  return pages?.flatMap(({ items }) => items) ?? [];
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
  heading: { gap: spacing.sm, marginTop: spacing.lg, maxWidth: 620 },
  filters: { gap: spacing.md },
  filterActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  stateCard: { gap: spacing.md },
  list: { gap: spacing.sm },
  playerRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    minHeight: 76,
    padding: spacing.md,
  },
  playerRowPressed: { backgroundColor: colors.brandSoft },
  playerCopy: { flex: 1, minWidth: 140 },
});
