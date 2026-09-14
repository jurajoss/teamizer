import { useInfiniteQuery } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import type { Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Avatar,
  Button,
  FeedbackBanner,
  radii,
  spacing,
  StatusPill,
  Surface,
  TextField,
  useTheme,
} from '@teamizer/ui';

import type { PlayersPage } from '../../../../src/api/contracts';
import {
  asyncContentState,
  canAccessPlayerAdministration,
} from '../../../../src/profiles/player-admin';
import { profileQueryKeys } from '../../../../src/profiles/profile-query-keys';
import { useAppServices } from '../../../../src/providers/app-services-context';
import { useSession } from '../../../../src/session/session-context';
import { AppScreen } from '../../../../src/ui/app-screen';

const PAGE_SIZE = 25;

export default function AdminPlayerListRoute() {
  const { t } = useTranslation();
  const { colors } = useTheme();
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
    <AppScreen scroll underHeader contentStyle={styles.screen}>
      <Surface tone="muted" style={styles.filters}>
        <TextField
          autoCapitalize="words"
          label={t('admin.search')}
          maxLength={120}
          onChangeText={setDraftQuery}
          onSubmitEditing={() => setQuery(draftQuery.trim())}
          placeholder={t('admin.searchPlaceholder')}
          returnKeyType="search"
          value={draftQuery}
        />
        <View style={styles.filterActions}>
          <Button
            fullWidth={false}
            label={t('admin.searchAction')}
            onPress={() => setQuery(draftQuery.trim())}
          />
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((option) => (
            <Button
              fullWidth={false}
              key={option}
              label={
                option === 'ALL'
                  ? t('admin.all')
                  : option === 'ACTIVE'
                    ? t('common.active')
                    : t('common.inactive')
              }
              onPress={() => setStatus(option)}
              variant={status === option ? 'secondary' : 'ghost'}
            />
          ))}
        </View>
      </Surface>

      {contentState === 'LOADING' ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="heading">{t('admin.loadingPlayers')}</AppText>
        </Surface>
      ) : null}
      {contentState === 'ERROR' ? (
        <View style={styles.stateCard}>
          <FeedbackBanner
            tone="error"
            title={t('admin.playersUnavailable')}
            message={t('common.connectionRetry')}
          />
          <Button
            label={t('common.retry')}
            onPress={() => void playersQuery.refetch()}
            variant="secondary"
          />
        </View>
      ) : null}
      {contentState === 'EMPTY' ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="heading">{t('admin.noPlayers')}</AppText>
          <AppText tone="muted">{t('admin.noPlayersHint')}</AppText>
        </Surface>
      ) : null}
      {contentState === 'READY' ? (
        <View accessibilityLabel={t('admin.playerList')} style={styles.list}>
          {players.map((player) => (
            <Pressable
              accessibilityHint={t('admin.managePlayerHint')}
              accessibilityLabel={t('admin.managePlayer', {
                name: player.name,
              })}
              accessibilityRole="button"
              key={player.id}
              onPress={() => router.push(`/admin/players/${player.id}` as Href)}
              style={({ pressed }) => [
                styles.playerRow,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && { backgroundColor: colors.accentSoft },
              ]}
            >
              <Avatar name={player.name} url={player.avatarUrl} />
              <View style={styles.playerCopy}>
                <AppText variant="bodyStrong">{player.name}</AppText>
                <AppText variant="caption" tone="muted">
                  {player.type === 'GUEST'
                    ? t('admin.guestKind')
                    : t('admin.regularKind')}
                </AppText>
              </View>
              <StatusPill
                label={
                  player.status === 'ACTIVE'
                    ? t('status.active')
                    : t('status.inactive')
                }
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
              label={t('ranking.loadMore')}
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

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  filters: { gap: spacing.md },
  filterActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  stateCard: { gap: spacing.md },
  list: { gap: spacing.sm },
  playerRow: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    minHeight: 76,
    padding: spacing.md,
  },
  playerCopy: { flex: 1, minWidth: 140 },
});
