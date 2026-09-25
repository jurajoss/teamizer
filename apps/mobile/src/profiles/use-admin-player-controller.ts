import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AuthenticatedApiClient } from '../api/authenticated-api-client';
import type {
  AdminPlayerDetail,
  UpdateAdminPlayerInput,
} from '../api/contracts';
import { localizedErrorMessage } from '../i18n/localized-error';
import { matchQueryKeys } from '../matches/match-query-keys';
import { statisticsQueryKeys } from '../statistics/statistics-query-keys';
import type { PreparedAvatar } from './avatar-picker';
import {
  canSubmitGuestInvitation,
  isValidInvitationEmail,
  normalizeInvitationEmail,
  requiresDeactivationConfirmation,
} from './player-admin';
import { profileQueryKeys } from './profile-query-keys';

export type PlayerAttributeKey =
  'speed' | 'endurance' | 'defense' | 'attack' | 'technique';

export const playerAttributeKeys: PlayerAttributeKey[] = [
  'speed',
  'endurance',
  'defense',
  'attack',
  'technique',
];

const defaultAttributes: Record<PlayerAttributeKey, number> = {
  speed: 5,
  endurance: 5,
  defense: 5,
  attack: 5,
  technique: 5,
};

type AdminPlayerQueryClient = Pick<
  QueryClient,
  'invalidateQueries' | 'setQueryData'
>;

type AdminPlayerApi = Pick<
  AuthenticatedApiClient,
  | 'convertGuest'
  | 'deletePlayerAvatar'
  | 'getAdminPlayerDetail'
  | 'inviteGuest'
  | 'updateAdminPlayer'
  | 'uploadAdminPlayerAvatar'
>;

export function updateManagedPlayer(
  apiClient: AdminPlayerApi,
  playerId: string,
  input: UpdateAdminPlayerInput,
): Promise<AdminPlayerDetail> {
  return apiClient.updateAdminPlayer(playerId, input);
}

export function inviteGuestPlayer(
  apiClient: AdminPlayerApi,
  playerId: string,
  email: string,
) {
  return apiClient.inviteGuest(playerId, email);
}

export async function publishAdminPlayer(
  queryClient: AdminPlayerQueryClient,
  player: AdminPlayerDetail,
  currentPlayerId: string | null,
  refreshCurrentUser: () => Promise<void>,
): Promise<void> {
  queryClient.setQueryData(profileQueryKeys.adminDetail(player.id), player);
  queryClient.setQueryData(statisticsQueryKeys.player(player.id), player);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: profileQueryKeys.root }),
    queryClient.invalidateQueries({ queryKey: statisticsQueryKeys.root }),
    queryClient.invalidateQueries({ queryKey: matchQueryKeys.root }),
    player.id === currentPlayerId ? refreshCurrentUser() : Promise.resolve(),
  ]);
}

export async function removeAdminPlayerAvatar(
  apiClient: AdminPlayerApi,
  playerId: string,
): Promise<AdminPlayerDetail> {
  await apiClient.deletePlayerAvatar(playerId);
  return apiClient.getAdminPlayerDetail(playerId);
}

export function convertGuestPlayer(
  apiClient: AdminPlayerApi,
  playerId: string,
  authProviderId: string,
): ReturnType<AdminPlayerApi['convertGuest']> {
  return apiClient.convertGuest(playerId, authProviderId);
}

export function useAdminPlayerController({
  administrationDisabled,
  apiClient,
  currentPlayerId,
  enabled,
  playerId,
  refreshCurrentUser,
}: {
  administrationDisabled: boolean;
  apiClient: AuthenticatedApiClient;
  currentPlayerId: string | null;
  enabled: boolean;
  playerId: string | null;
  refreshCurrentUser(): Promise<void>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [attributesOverride, setAttributesOverride] = useState<Record<
    PlayerAttributeKey,
    number
  > | null>(null);
  const [authProviderId, setAuthProviderId] = useState('');
  const [invitationEmail, setInvitationEmail] = useState('');
  const [showAdvancedConversion, setShowAdvancedConversion] = useState(false);
  const [confirmingDeactivation, setConfirmingDeactivation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const detailQuery = useQuery({
    queryKey: profileQueryKeys.adminDetail(playerId ?? 'invalid'),
    queryFn: () => apiClient.getAdminPlayerDetail(playerId ?? ''),
    enabled: enabled && playerId !== null,
  });
  const name = nameOverride ?? detailQuery.data?.name ?? '';
  const attributes =
    attributesOverride ?? detailQuery.data?.attributes ?? defaultAttributes;
  const publish = (player: AdminPlayerDetail) =>
    publishAdminPlayer(
      queryClient,
      player,
      currentPlayerId,
      refreshCurrentUser,
    );
  const updateMutation = useMutation({
    mutationFn: (input: UpdateAdminPlayerInput) =>
      updateManagedPlayer(apiClient, playerId ?? '', input),
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
    mutationFn: () => removeAdminPlayerAvatar(apiClient, playerId ?? ''),
    onSuccess: async (player) => {
      setMessage(t('adminPlayer.photoRemoved'));
      await publish(player);
    },
  });
  const conversionMutation = useMutation({
    mutationFn: () =>
      convertGuestPlayer(apiClient, playerId ?? '', authProviderId),
    onSuccess: async () => {
      setAuthProviderId('');
      setMessage(t('adminPlayer.conversionSuccess'));
      const player = await apiClient.getAdminPlayerDetail(playerId ?? '');
      await publish(player);
    },
  });
  const invitationMutation = useMutation({
    mutationFn: () =>
      inviteGuestPlayer(apiClient, playerId ?? '', invitationEmail),
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
  const busy =
    updateMutation.isPending ||
    avatarMutation.isPending ||
    removeAvatarMutation.isPending ||
    invitationMutation.isPending ||
    conversionMutation.isPending;

  return {
    detailQuery,
    name,
    attributes,
    authProviderId,
    invitationEmail,
    invitationEmailValid: isValidInvitationEmail(invitationEmail),
    showAdvancedConversion,
    confirmingDeactivation,
    message,
    errorMessage: error
      ? localizedErrorMessage(
          error,
          t,
          invitationMutation.error
            ? 'adminPlayer.invitationFailed'
            : 'adminPlayer.saveFailed',
        )
      : null,
    busy,
    updatePending: updateMutation.isPending,
    avatarPending: avatarMutation.isPending,
    removeAvatarPending: removeAvatarMutation.isPending,
    invitationPending: invitationMutation.isPending,
    conversionPending: conversionMutation.isPending,
    canSubmitInvitation: canSubmitGuestInvitation(
      invitationEmail,
      busy,
      administrationDisabled,
    ),
    setName: setNameOverride,
    setAttribute: (key: PlayerAttributeKey, value: number) =>
      setAttributesOverride((current) => ({
        ...(current ?? attributes),
        [key]: value,
      })),
    setAuthProviderId,
    setInvitationEmail,
    toggleAdvancedConversion: () =>
      setShowAdvancedConversion((current) => !current),
    saveDetails: () => updateMutation.mutate({ name, attributes }),
    uploadAvatar: (file: PreparedAvatar) => avatarMutation.mutateAsync(file),
    removeAvatar: () => removeAvatarMutation.mutateAsync(),
    invite: () => invitationMutation.mutate(),
    convert: () => conversionMutation.mutate(),
    requestStatusChange: (status: 'ACTIVE' | 'INACTIVE') => {
      if (requiresDeactivationConfirmation(status)) {
        setConfirmingDeactivation(true);
        return;
      }
      updateMutation.mutate({ status: 'ACTIVE' });
    },
    cancelDeactivation: () => setConfirmingDeactivation(false),
    confirmDeactivation: () => updateMutation.mutate({ status: 'INACTIVE' }),
  };
}
