import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Avatar,
  borderWidths,
  Button,
  Card,
  FeedbackBanner,
  spacing,
  TextField,
  useTheme,
} from '@teamizer/ui';

import type { AuthenticatedApiClient } from '../api/authenticated-api-client';
import type { Attendance } from '../api/contracts';
import { AttendanceChoiceButtons } from '../attendance/attendance-control';
import { profileQueryKeys } from '../profiles/profile-query-keys';
import { useAppServices } from '../providers/app-services-context';
import { useSession } from '../session/session-context';
import { AppScreen } from '../ui/app-screen';
import { matchRouteFor } from './match-flow';
import { matchQueryKeys, refreshMatchState } from './match-query-keys';
import type { OpenMatchFeedback } from './open-match-feedback';
import { openMatchErrorFeedback } from './open-match-feedback';
import {
  canAccessParticipantEditor,
  participantAttendanceTransition,
  participantEditorGroups,
  participantEditorSearchOptions,
  updateParticipantAttendance,
  type ParticipantAttendanceState,
  type ParticipantEditorGroups,
  type ParticipantEditorPlayer,
} from './participant-editor-model';

const playerSearchDebounceMs = 300;

export function ParticipantEditorScreen({ matchId }: { matchId: string }) {
  const { apiClient } = useAppServices();
  const { state: session } = useSession();
  const identityMayManage =
    session.status === 'AUTHENTICATED' &&
    session.currentUser.user.role === 'ADMIN' &&
    session.currentUser.player.status === 'ACTIVE';
  const editor = useParticipantEditorController({
    apiClient,
    enabled: identityMayManage,
    matchId,
  });

  if (!identityMayManage) {
    return <ParticipantEditorAuthorizationRedirect matchId={matchId} />;
  }

  if (editor.matchQuery.isPending) {
    return (
      <ParticipantEditorFrame>
        <AppText tone="muted">{editor.t('match.loading')}</AppText>
      </ParticipantEditorFrame>
    );
  }

  if (editor.matchQuery.isError || !editor.match) {
    return (
      <ParticipantEditorFrame>
        <FeedbackBanner
          message={editor.t('common.connectionRetry')}
          title={editor.t('match.loadFailed')}
          tone="error"
        />
        <Button
          label={editor.t('common.retry')}
          onPress={() => void editor.matchQuery.refetch()}
          variant="secondary"
        />
      </ParticipantEditorFrame>
    );
  }

  if (
    !canAccessParticipantEditor(
      session.currentUser.user.role,
      session.currentUser.player.status,
      editor.match.status,
    )
  ) {
    return <ParticipantEditorAuthorizationRedirect matchId={matchId} />;
  }

  return (
    <ParticipantEditorFrame>
      <TextField
        autoCapitalize="words"
        label={editor.t('attendance.searchPlayers')}
        maxLength={120}
        onChangeText={editor.setSearchDraft}
        placeholder={editor.t('attendance.searchPlayersPlaceholder')}
        value={editor.searchDraft}
      />

      {editor.playersQuery.isPending ? (
        <AppText tone="muted">{editor.t('attendance.loadingPlayers')}</AppText>
      ) : null}
      {editor.playersQuery.isError ? (
        <View style={styles.stateArea}>
          <FeedbackBanner
            message={editor.t('common.connectionRetry')}
            title={editor.t('attendance.playersUnavailable')}
            tone="error"
          />
          <Button
            fullWidth={false}
            label={editor.t('common.retry')}
            onPress={() => void editor.playersQuery.refetch()}
            variant="secondary"
          />
        </View>
      ) : null}

      {!editor.playersQuery.isError && !editor.playersQuery.isPending ? (
        <>
          <ParticipantEditorGroupsView
            errors={editor.rowFeedback}
            groups={editor.groups}
            pendingAttendances={editor.pendingAttendances}
            onChange={editor.changeAttendance}
          />
          {editor.empty ? (
            <View style={styles.stateArea}>
              <AppText variant="heading">
                {editor.t('attendance.noPlayersFound')}
              </AppText>
              <AppText tone="muted">
                {editor.t('attendance.noPlayersFoundHint')}
              </AppText>
            </View>
          ) : null}
          {editor.playersQuery.hasNextPage ? (
            <Button
              busy={editor.playersQuery.isFetchingNextPage}
              label={editor.t('ranking.loadMore')}
              onPress={() => void editor.playersQuery.fetchNextPage()}
              variant="secondary"
            />
          ) : null}
        </>
      ) : null}
    </ParticipantEditorFrame>
  );
}

export function ParticipantEditorAuthorizationRedirect({
  matchId,
}: {
  matchId: string;
}) {
  return <Redirect href={matchRouteFor(matchId)} />;
}

function useParticipantEditorController({
  apiClient,
  enabled,
  matchId,
}: {
  apiClient: AuthenticatedApiClient;
  enabled: boolean;
  matchId: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const pendingAttendancesRef = useRef(new Map<string, Attendance>());
  const [pendingAttendances, setPendingAttendances] = useState<
    ReadonlyMap<string, Attendance>
  >(new Map());
  const [rowFeedback, setRowFeedback] = useState<
    ReadonlyMap<string, OpenMatchFeedback>
  >(new Map());
  const matchQuery = useQuery({
    queryKey: matchQueryKeys.detail(matchId),
    queryFn: () => apiClient.getMatch(matchId),
    enabled,
  });
  const match = matchQuery.data ?? null;
  const mayManage = enabled && match?.status === 'OPEN_FOR_REGISTRATION';

  useEffect(() => {
    const timeout = setTimeout(
      () => setSearch(searchDraft.trim()),
      playerSearchDebounceMs,
    );
    return () => clearTimeout(timeout);
  }, [searchDraft]);

  const playersQuery = useInfiniteQuery({
    queryKey: profileQueryKeys.adminList('ACTIVE', search),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiClient.getPlayers(participantEditorSearchOptions(search, pageParam)),
    getNextPageParam: (page) => page.nextCursor,
    enabled: mayManage,
  });
  const groups = useMemo(
    () =>
      match
        ? participantEditorGroups(playersQuery.data?.pages, match, search)
        : emptyGroups(),
    [match, playersQuery.data?.pages, search],
  );
  const mutation = useMutation({
    mutationFn: ({
      current,
      next,
      playerId,
    }: {
      current: ParticipantAttendanceState;
      next: ParticipantAttendanceState;
      playerId: string;
    }) =>
      updateParticipantAttendance(apiClient, matchId, playerId, current, next),
    onSuccess: async (changed, { playerId }) => {
      setRowFeedback((current) => withoutMapKey(current, playerId));
      if (changed) await refreshMatchState(queryClient, matchId);
    },
    onError: (error, { playerId }) => {
      const feedback = openMatchErrorFeedback(
        error,
        t('attendance.participantFailed'),
        t,
      );
      setRowFeedback((current) => new Map(current).set(playerId, feedback));
    },
    onSettled: (_data, _error, { playerId }) => {
      pendingAttendancesRef.current.delete(playerId);
      setPendingAttendances(new Map(pendingAttendancesRef.current));
    },
  });

  const changeAttendance = (
    playerId: string,
    current: ParticipantAttendanceState,
    next: Attendance,
  ) => {
    if (pendingAttendancesRef.current.has(playerId)) return;
    const transition = participantAttendanceTransition(current, next);
    if (transition.kind === 'NONE') {
      setRowFeedback((feedback) => withoutMapKey(feedback, playerId));
      return;
    }
    if (transition.kind === 'UNSUPPORTED') return;

    pendingAttendancesRef.current.set(playerId, next);
    setPendingAttendances(new Map(pendingAttendancesRef.current));
    setRowFeedback((feedback) => withoutMapKey(feedback, playerId));
    mutation.mutate({
      current,
      next,
      playerId,
    });
  };

  return {
    changeAttendance,
    empty: allPlayers(groups).length === 0,
    groups,
    match,
    matchQuery,
    pendingAttendances,
    playersQuery,
    rowFeedback,
    searchDraft,
    setSearchDraft,
    t,
  };
}

function ParticipantEditorFrame({ children }: { children: React.ReactNode }) {
  return (
    <AppScreen
      scroll
      underHeader
      contentStyle={styles.screen}
      contentWidth="readable"
    >
      {children}
    </AppScreen>
  );
}

export function ParticipantEditorGroupsView({
  errors,
  groups,
  pendingAttendances,
  onChange,
}: {
  errors: ReadonlyMap<string, OpenMatchFeedback>;
  groups: ParticipantEditorGroups;
  pendingAttendances: ReadonlyMap<string, Attendance>;
  onChange(
    playerId: string,
    current: ParticipantAttendanceState,
    next: Attendance,
  ): void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.groups}>
      <ParticipantEditorGroup
        attendance="GOING"
        errors={errors}
        label={t('attendance.going')}
        pendingAttendances={pendingAttendances}
        players={groups.going}
        onChange={onChange}
      />
      <ParticipantEditorGroup
        attendance="NOT_GOING"
        errors={errors}
        label={t('attendance.notGoing')}
        pendingAttendances={pendingAttendances}
        players={groups.notGoing}
        onChange={onChange}
      />
      <ParticipantEditorGroup
        attendance={null}
        errors={errors}
        label={t('attendance.unanswered')}
        pendingAttendances={pendingAttendances}
        players={groups.unanswered}
        onChange={onChange}
      />
    </View>
  );
}

export function ParticipantEditorGroup({
  attendance,
  errors,
  label,
  pendingAttendances,
  players,
  onChange,
}: {
  attendance: ParticipantAttendanceState;
  errors: ReadonlyMap<string, OpenMatchFeedback>;
  label: string;
  pendingAttendances: ReadonlyMap<string, Attendance>;
  players: ParticipantEditorPlayer[];
  onChange(
    playerId: string,
    current: ParticipantAttendanceState,
    next: Attendance,
  ): void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (players.length === 0) return null;

  return (
    <View style={styles.group}>
      <AppText variant="bodyStrong">
        {t('attendance.groupCount', { count: players.length, label })}
      </AppText>
      <Card padding="none" style={styles.groupCard}>
        {players.map((player, index) => {
          const pendingAttendance = pendingAttendances.get(player.id);
          const error = errors.get(player.id);
          const metadata = player.type === 'GUEST' ? t('common.guest') : null;
          return (
            <View
              key={player.id}
              style={[
                styles.playerRowBoundary,
                index > 0 && {
                  borderTopColor: colors.border,
                  borderTopWidth: borderWidths.subtle,
                },
              ]}
            >
              <View style={styles.playerRow}>
                <Avatar
                  name={player.name}
                  size="small"
                  url={player.avatarUrl}
                />
                <View style={styles.playerCopy}>
                  <AppText numberOfLines={1} variant="bodyStrong">
                    {player.name}
                  </AppText>
                  {metadata ? (
                    <AppText tone="muted" variant="caption">
                      {metadata}
                    </AppText>
                  ) : null}
                </View>
                <AttendanceChoiceButtons
                  attendance={attendance}
                  compact
                  disabled={pendingAttendance !== undefined}
                  goingAccessibilityLabel={`${t('attendance.setGoing')}: ${player.name}`}
                  notGoingAccessibilityLabel={`${t('attendance.setNotGoing')}: ${player.name}`}
                  pendingAttendance={pendingAttendance}
                  onChange={(next) =>
                    onChange(player.id, player.attendance, next)
                  }
                />
              </View>
              {error ? (
                <AppText
                  accessibilityLiveRegion="polite"
                  style={styles.rowError}
                  tone="error"
                  variant="caption"
                >
                  {error.text}
                </AppText>
              ) : null}
            </View>
          );
        })}
      </Card>
    </View>
  );
}

function allPlayers(
  groups: ParticipantEditorGroups,
): ParticipantEditorPlayer[] {
  return [...groups.going, ...groups.notGoing, ...groups.unanswered];
}

function emptyGroups(): ParticipantEditorGroups {
  return { going: [], notGoing: [], unanswered: [] };
}

function withoutMapKey<Key, Value>(
  source: ReadonlyMap<Key, Value>,
  key: Key,
): ReadonlyMap<Key, Value> {
  const next = new Map(source);
  next.delete(key);
  return next;
}

const styles = StyleSheet.create({
  screen: { gap: spacing.md },
  stateArea: { alignItems: 'flex-start', gap: spacing.sm },
  groups: { gap: spacing.md },
  group: { gap: spacing.xs },
  groupCard: { overflow: 'hidden' },
  playerRowBoundary: { width: '100%' },
  playerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  playerCopy: { flex: 1, minWidth: 0 },
  rowError: {
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
});
