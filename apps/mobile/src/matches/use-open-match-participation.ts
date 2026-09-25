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

export async function updateAttendanceAsAdministrator(
  apiClient: ParticipationApi,
  match: MatchDetail,
  playerId: string,
  attendance: Attendance,
): Promise<void> {
  const isUnanswered = match.participants.unanswered.some(
    ({ id }) => id === playerId,
  );

  if (attendance === 'GOING' && isUnanswered) {
    await apiClient.addParticipant(match.id, { playerId });
    return;
  }

  await apiClient.updateParticipant(match.id, playerId, attendance);
}

export function useOpenMatchParticipation({
  apiClient,
  currentUser,
  match,
  invalidateProposal,
  setFeedback,
}: {
  apiClient: AuthenticatedApiClient;
  currentUser: CurrentUser;
  match: MatchDetail;
  invalidateProposal(): void;
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
      invalidateProposal();
      setFeedback({ tone: 'success', text: t('attendance.updated') });
      await refreshMatch();
    },
    onError: (error) =>
      setFeedback(
        openMatchErrorFeedback(error, t('attendance.updateFailed'), t),
      ),
  });
  const participantMutation = useMutation({
    mutationFn: ({
      attendance,
      playerId,
    }: {
      attendance: Attendance;
      playerId: string;
    }) =>
      updateAttendanceAsAdministrator(apiClient, match, playerId, attendance),
    onSuccess: async () => {
      invalidateProposal();
      setFeedback({
        tone: 'success',
        text: t('attendance.participantUpdated'),
      });
      await refreshMatch();
    },
    onError: (error) =>
      setFeedback(
        openMatchErrorFeedback(error, t('attendance.participantFailed'), t),
      ),
  });
  const guestMutation = useMutation({
    mutationFn: () => createGuestParticipant(apiClient, match.id, guest),
    onSuccess: async ({ player }) => {
      invalidateProposal();
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
        attendanceMutation.mutate(attendance),
    },
    participant: {
      isPending: participantMutation.isPending,
      update: (playerId: string, attendance: Attendance) =>
        participantMutation.mutate({ playerId, attendance }),
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
