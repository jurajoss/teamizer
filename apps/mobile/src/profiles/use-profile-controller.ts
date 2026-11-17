import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AuthenticatedApiClient } from '../api/authenticated-api-client';
import type { PlayerDetail } from '../api/contracts';
import { localizedErrorMessage } from '../i18n/localized-error';
import { matchQueryKeys } from '../matches/match-query-keys';
import { statisticsQueryKeys } from '../statistics/statistics-query-keys';
import type { PreparedAvatar } from './avatar-picker';
import { asyncContentState } from './player-admin';
import { profileQueryKeys } from './profile-query-keys';

type ProfileQueryClient = Pick<
  QueryClient,
  'invalidateQueries' | 'setQueryData'
>;

type ProfileApi = Pick<
  AuthenticatedApiClient,
  | 'deletePlayerAvatar'
  | 'getPlayerDetail'
  | 'updateOwnPlayer'
  | 'uploadOwnPlayerAvatar'
>;

export async function publishOwnProfile(
  queryClient: ProfileQueryClient,
  player: PlayerDetail,
  refreshCurrentUser: () => Promise<void>,
): Promise<void> {
  queryClient.setQueryData(profileQueryKeys.current(player.id), player);
  queryClient.setQueryData(statisticsQueryKeys.player(player.id), player);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: statisticsQueryKeys.root }),
    queryClient.invalidateQueries({ queryKey: profileQueryKeys.root }),
    queryClient.invalidateQueries({ queryKey: matchQueryKeys.root }),
    refreshCurrentUser(),
  ]);
}

export async function removeOwnAvatar(
  apiClient: ProfileApi,
  playerId: string,
): Promise<PlayerDetail> {
  await apiClient.deletePlayerAvatar(playerId);
  return apiClient.getPlayerDetail(playerId);
}

export function hasOwnProfileNameChanged(
  savedName: string | undefined,
  editedName: string,
): boolean {
  return savedName !== undefined && editedName.trim() !== savedName;
}

export function useProfileController({
  apiClient,
  enabled = true,
  playerId,
  refreshCurrentUser,
}: {
  apiClient: AuthenticatedApiClient;
  enabled?: boolean;
  playerId: string | null;
  refreshCurrentUser(): Promise<void>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const profileQuery = useQuery({
    queryKey: statisticsQueryKeys.player(playerId ?? 'invalid'),
    queryFn: () => apiClient.getPlayerDetail(playerId ?? ''),
    enabled: enabled && playerId !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const name = nameOverride ?? profileQuery.data?.name ?? '';
  const publish = (player: PlayerDetail) =>
    publishOwnProfile(queryClient, player, refreshCurrentUser);
  const nameMutation = useMutation({
    mutationFn: () => apiClient.updateOwnPlayer(playerId ?? '', { name }),
    onSuccess: async (player) => {
      setMessage(t('profile.updatedName'));
      await publish(player);
      setNameOverride(null);
    },
  });
  const avatarMutation = useMutation({
    mutationFn: (file: PreparedAvatar) =>
      apiClient.uploadOwnPlayerAvatar(playerId ?? '', file),
    onSuccess: async (player) => {
      setMessage(t('profile.updatedPhoto'));
      await publish(player);
    },
  });
  const removeAvatarMutation = useMutation({
    mutationFn: () => removeOwnAvatar(apiClient, playerId ?? ''),
    onSuccess: async (player) => {
      setMessage(t('profile.removedPhoto'));
      await publish(player);
    },
  });
  const mutationError =
    nameMutation.error ?? avatarMutation.error ?? removeAvatarMutation.error;
  const nameDirty = hasOwnProfileNameChanged(profileQuery.data?.name, name);

  return {
    profileQuery,
    contentState: asyncContentState(
      profileQuery.isPending,
      profileQuery.isError,
      profileQuery.data ? 1 : 0,
    ),
    name,
    nameDirty,
    setName: setNameOverride,
    message,
    errorMessage: mutationError
      ? localizedErrorMessage(mutationError, t, 'profile.saveFailed')
      : null,
    namePending: nameMutation.isPending,
    avatarPending: avatarMutation.isPending || removeAvatarMutation.isPending,
    canSaveName: nameDirty && Boolean(name.trim()) && !nameMutation.isPending,
    saveName: () => nameMutation.mutate(),
    uploadAvatar: (file: PreparedAvatar) => avatarMutation.mutateAsync(file),
    removeAvatar: () => removeAvatarMutation.mutateAsync(),
  };
}
