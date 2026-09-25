import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ApiClientError,
  type AuthenticatedApiClient,
} from '../api/authenticated-api-client';
import type { MatchDetail } from '../api/contracts';
import type { SetOpenMatchFeedback } from './open-match-feedback';
import { openMatchErrorFeedback } from './open-match-feedback';
import { publishMatchState, refreshMatchState } from './match-query-keys';

type CancellationApi = Pick<AuthenticatedApiClient, 'cancelMatch'>;

export function cancelOpenMatch(
  apiClient: CancellationApi,
  matchId: string,
): Promise<MatchDetail> {
  return apiClient.cancelMatch(matchId);
}

export function shouldRefreshAfterCancellationError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 409;
}

export function useMatchCancellation({
  apiClient,
  match,
  invalidateProposal,
  setFeedback,
}: {
  apiClient: AuthenticatedApiClient;
  match: MatchDetail;
  invalidateProposal(): void;
  setFeedback: SetOpenMatchFeedback;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const mutation = useMutation({
    mutationFn: () => cancelOpenMatch(apiClient, match.id),
    onSuccess: async (cancelledMatch) => {
      invalidateProposal();
      setConfirming(false);
      await publishMatchState(queryClient, cancelledMatch);
    },
    onError: async (error) => {
      setConfirming(false);
      setFeedback(openMatchErrorFeedback(error, t('cancellation.failed'), t));
      if (shouldRefreshAfterCancellationError(error)) {
        await refreshMatchState(queryClient, match.id);
      }
    },
  });

  return {
    confirming,
    isPending: mutation.isPending,
    beginConfirmation: () => setConfirming(true),
    cancelConfirmation: () => setConfirming(false),
    cancel: () => mutation.mutate(),
  };
}
