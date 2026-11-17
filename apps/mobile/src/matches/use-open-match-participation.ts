import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AuthenticatedApiClient } from '../api/authenticated-api-client';
import type { Attendance, CurrentUser, MatchDetail } from '../api/contracts';
import type { SetOpenMatchFeedback } from './open-match-feedback';
import { openMatchErrorFeedback } from './open-match-feedback';
import { refreshMatchState } from './match-query-keys';

export type GuestAttributeKey =
  'speed' | 'endurance' | 'defense' | 'attack' | 'technique';

export const guestAttributeKeys: GuestAttributeKey[] = [
  'speed',
  'endurance',
  'defense',
  'attack',
  'technique',
];

export type GuestDraft = {
  name: string;
  attributes: Record<GuestAttributeKey, number>;
};

export function emptyGuestDraft(): GuestDraft {
  return {
    name: '',
    attributes: {
      speed: 5,
      endurance: 5,
      defense: 5,
      attack: 5,
      technique: 5,
    },
  };
}

type ParticipationApi = Pick<
  AuthenticatedApiClient,
  | 'addParticipant'
  | 'registerGoing'
  | 'removeRegistration'
  | 'updateParticipant'
>;

export function createGuestParticipant(
  apiClient: ParticipationApi,
  matchId: string,
  guest: GuestDraft,
) {
  return apiClient.addParticipant(matchId, {
    guest: { name: guest.name, attributes: guest.attributes },
  });
}

export async function updateOwnAttendance(
  apiClient: ParticipationApi,
  matchId: string,
  playerId: string,
  attendance: Attendance | null,
): Promise<void> {
  if (attendance === 'GOING') {
    await apiClient.registerGoing(matchId);
    return;
  }

  if (attendance === 'NOT_GOING') {
    await apiClient.updateParticipant(matchId, playerId, attendance);
    return;
  }

  await apiClient.removeRegistration(matchId);
}

export function useOpenMatchParticipation({
  apiClient,
  currentUser,
  match,
  onAttendanceChanged,
  setFeedback,
}: {
  apiClient: AuthenticatedApiClient;
  currentUser: CurrentUser;
  match: MatchDetail;
  onAttendanceChanged(): void;
  setFeedback: SetOpenMatchFeedback;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [guestOpen, setGuestOpen] = useState(false);
  const [guest, setGuest] = useState<GuestDraft>(emptyGuestDraft);
  const refreshMatch = () => refreshMatchState(queryClient, match.id);
  const attendanceMutation = useMutation({
    mutationFn: (attendance: Attendance | null) =>
      updateOwnAttendance(
        apiClient,
        match.id,
        currentUser.player.id,
        attendance,
      ),
    onSuccess: async () => {
      onAttendanceChanged();
      setFeedback({ tone: 'success', text: t('attendance.updated') });
      await refreshMatch();
    },
    onError: (error) =>
      setFeedback(
        openMatchErrorFeedback(error, t('attendance.updateFailed'), t),
      ),
  });
  const guestMutation = useMutation({
    mutationFn: () => createGuestParticipant(apiClient, match.id, guest),
    onSuccess: async ({ player }) => {
      onAttendanceChanged();
      setGuest(emptyGuestDraft());
      setGuestOpen(false);
      setFeedback({
        tone: 'success',
        text: t('guest.success', {
          name: player?.name ?? t('common.guest'),
        }),
      });
      await refreshMatch();
    },
    onError: (error) =>
      setFeedback(openMatchErrorFeedback(error, t('guest.failed'), t)),
  });

  const submitGuest = () => {
    if (!guest.name.trim()) {
      setFeedback({ tone: 'error', text: t('guest.missingName') });
      return;
    }
    guestMutation.mutate();
  };

  return {
    attendance: {
      isPending: attendanceMutation.isPending,
      pendingValue: attendanceMutation.variables,
      update: (attendance: Attendance | null) =>
        attendanceMutation.mutateAsync(attendance),
    },
    guest: {
      draft: guest,
      isOpen: guestOpen,
      isPending: guestMutation.isPending,
      setDraft: setGuest,
      submit: submitGuest,
      toggle: () => setGuestOpen((open) => !open),
    },
    refreshMatch,
  };
}
