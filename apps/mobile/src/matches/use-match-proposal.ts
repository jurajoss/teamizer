import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ApiClientError,
  type AuthenticatedApiClient,
} from '../api/authenticated-api-client';
import type { MatchDetail, TeamProposal } from '../api/contracts';
import {
  createTransientProposal,
  isStaleProposalConflict,
  movePlayer,
  swapPlayers,
  validateProposal,
  type TransientTeamProposal,
} from './match-flow';
import type { SetOpenMatchFeedback } from './open-match-feedback';
import { openMatchErrorFeedback } from './open-match-feedback';
import {
  matchQueryKeys,
  publishMatchState,
  refreshMatchState,
} from './match-query-keys';

type ProposalApi = Pick<
  AuthenticatedApiClient,
  'generateTeams' | 'getMatch' | 'startMatch'
>;

export type GeneratedProposalResult =
  | {
      status: 'READY';
      match: MatchDetail;
      proposal: TransientTeamProposal;
    }
  | { status: 'STALE'; match: MatchDetail };

export async function resolveGeneratedProposal(
  apiClient: ProposalApi,
  match: MatchDetail,
  response: TeamProposal,
): Promise<GeneratedProposalResult> {
  const currentMatch = await apiClient.getMatch(match.id);
  if (currentMatch.stateVersion !== match.stateVersion) {
    return { status: 'STALE', match: currentMatch };
  }

  return {
    status: 'READY',
    match: currentMatch,
    proposal: createTransientProposal(currentMatch, response),
  };
}

export async function startMatchWithProposal(
  apiClient: ProposalApi,
  match: MatchDetail,
  proposal: TransientTeamProposal | null,
): Promise<MatchDetail> {
  if (!proposal) {
    throw new Error('A generated proposal is required to start the Match.');
  }

  const validation = validateProposal(match, proposal);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  return apiClient.startMatch(match.id, {
    teamAPlayerIds: proposal.teamAPlayerIds,
    teamBPlayerIds: proposal.teamBPlayerIds,
    proposalReceipt: proposal.proposalReceipt,
  });
}

export function useMatchProposal({
  apiClient,
  match,
  setFeedback,
}: {
  apiClient: AuthenticatedApiClient;
  match: MatchDetail;
  setFeedback: SetOpenMatchFeedback;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [proposal, setProposal] = useState<TransientTeamProposal | null>(null);
  const [selectedSwapPlayerId, setSelectedSwapPlayerId] = useState<
    string | null
  >(null);
  const [confirmingStart, setConfirmingStart] = useState(false);

  const invalidate = useCallback(() => {
    setProposal(null);
    setSelectedSwapPlayerId(null);
    setConfirmingStart(false);
  }, []);

  const generationMutation = useMutation({
    mutationFn: () => apiClient.generateTeams(match.id),
    onSuccess: async (response) => {
      try {
        const result = await resolveGeneratedProposal(
          apiClient,
          match,
          response,
        );
        queryClient.setQueryData(matchQueryKeys.detail(match.id), result.match);

        if (result.status === 'STALE') {
          throw new Error(t('teams.regenerateHint'));
        }

        setProposal(result.proposal);
        setSelectedSwapPlayerId(null);
        setFeedback({ tone: 'success', text: t('teams.proposalReady') });
      } catch {
        invalidate();
        setFeedback({
          tone: 'error',
          title: t('teams.proposalRejected'),
          text: t('teams.failed'),
        });
      }
    },
    onError: (error) =>
      setFeedback(openMatchErrorFeedback(error, t('teams.failed'), t)),
  });
  const startMutation = useMutation({
    mutationFn: () => startMatchWithProposal(apiClient, match, proposal),
    onSuccess: async (startedMatch) => {
      invalidate();
      await publishMatchState(queryClient, startedMatch);
    },
    onError: async (error) => {
      setConfirmingStart(false);
      if (error instanceof ApiClientError && isStaleProposalConflict(error)) {
        invalidate();
        setFeedback({
          tone: 'warning',
          title: t('teams.regenerateTitle'),
          text: t('teams.regenerateHint'),
        });
        await refreshMatchState(queryClient, match.id);
        return;
      }
      setFeedback(openMatchErrorFeedback(error, t('teams.startFailed'), t));
    },
  });

  const move = (playerId: string) => {
    setProposal((current) =>
      current ? movePlayer(current, playerId) : current,
    );
    setSelectedSwapPlayerId(null);
    setConfirmingStart(false);
  };

  const selectSwap = (playerId: string) => {
    if (!selectedSwapPlayerId) {
      setSelectedSwapPlayerId(playerId);
      return;
    }

    setProposal((current) =>
      current ? swapPlayers(current, selectedSwapPlayerId, playerId) : current,
    );
    setSelectedSwapPlayerId(null);
    setConfirmingStart(false);
  };

  return {
    proposal,
    selectedSwapPlayerId,
    confirmingStart,
    generationPending: generationMutation.isPending,
    startPending: startMutation.isPending,
    generate: () => generationMutation.mutate(),
    start: () => startMutation.mutate(),
    beginStartConfirmation: () => setConfirmingStart(true),
    cancelStartConfirmation: () => setConfirmingStart(false),
    invalidate,
    move,
    selectSwap,
  };
}
