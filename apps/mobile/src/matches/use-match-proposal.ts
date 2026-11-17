import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ApiClientError,
  type AuthenticatedApiClient,
} from '../api/authenticated-api-client';
import type { MatchDetail, TeamProposal } from '../api/contracts';
import {
  createTransientProposal,
  isStaleProposalConflict,
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
import {
  createTeamDraft,
  isTeamDraftValidForMatch,
  isTeamDraftStale,
  useTeamDraft,
} from './team-draft-store';

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

type GenerationIntent = 'INITIAL' | 'REPLACE';

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

export async function generateLocalProposal(
  apiClient: ProposalApi,
  match: MatchDetail,
): Promise<GeneratedProposalResult> {
  const response = await apiClient.generateTeams(match.id);
  return resolveGeneratedProposal(apiClient, match, response);
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
  enabled,
  match,
  setFeedback,
}: {
  apiClient: AuthenticatedApiClient;
  enabled: boolean;
  match: MatchDetail;
  setFeedback: SetOpenMatchFeedback;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const proposal = useTeamDraft(
    (state) => state.draftsByMatchId[match.id] ?? null,
  );
  const setDraft = useTeamDraft((state) => state.setDraft);
  const markStale = useTeamDraft((state) => state.markStale);
  const clearDraft = useTeamDraft((state) => state.clearDraft);
  const [confirmingStart, setConfirmingStart] = useState(false);
  const initialAttemptKey = useRef<string | null>(null);
  const currentParticipantIds = match.participants.going.map(({ id }) => id);
  const stale = proposal
    ? isTeamDraftStale(proposal, currentParticipantIds)
    : false;

  const generationMutation = useMutation({
    mutationFn: async (intent: GenerationIntent) => ({
      intent,
      result: await generateLocalProposal(apiClient, match),
    }),
    onSuccess: ({ intent, result }) => {
      try {
        queryClient.setQueryData(matchQueryKeys.detail(match.id), result.match);

        if (result.status === 'STALE') {
          if (proposal) markStale(match.id);
          setFeedback({
            tone: 'warning',
            title: t('teams.staleTitle'),
            text: t('teams.staleHint'),
          });
          return;
        }

        setDraft(
          match.id,
          createTeamDraft(
            result.proposal,
            result.match.participants.going.map(({ id }) => id),
          ),
        );
        setConfirmingStart(false);
        if (intent === 'REPLACE') setFeedback(null);
      } catch {
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
    mutationFn: () => {
      if (!proposal || !isTeamDraftValidForMatch(proposal, match)) {
        throw new Error('The local team draft is stale or invalid.');
      }
      return startMatchWithProposal(apiClient, match, proposal);
    },
    onSuccess: async (startedMatch) => {
      clearDraft(match.id);
      setConfirmingStart(false);
      await publishMatchState(queryClient, startedMatch);
    },
    onError: async (error) => {
      setConfirmingStart(false);
      if (error instanceof ApiClientError && isStaleProposalConflict(error)) {
        markStale(match.id);
        setFeedback({
          tone: 'warning',
          title: t('teams.staleTitle'),
          text: t('teams.staleHint'),
        });
        await refreshMatchState(queryClient, match.id);
        return;
      }
      setFeedback(openMatchErrorFeedback(error, t('teams.startFailed'), t));
    },
  });

  useEffect(() => {
    const attemptKey = `${match.id}:${match.stateVersion}`;
    const mayGenerate =
      enabled &&
      match.status === 'OPEN_FOR_REGISTRATION' &&
      match.participants.going.length >= 2;
    if (
      proposal ||
      !mayGenerate ||
      generationMutation.isPending ||
      initialAttemptKey.current === attemptKey
    ) {
      return;
    }

    initialAttemptKey.current = attemptKey;
    generationMutation.mutate('INITIAL');
  }, [enabled, generationMutation, match, proposal]);

  const dismissStartConfirmation = useCallback(
    () => setConfirmingStart(false),
    [],
  );

  return {
    proposal,
    stale,
    confirmingStart,
    generationPending: generationMutation.isPending,
    startPending: startMutation.isPending,
    generate: () => generationMutation.mutate('REPLACE'),
    start: () => startMutation.mutate(),
    beginStartConfirmation: () => setConfirmingStart(true),
    cancelStartConfirmation: dismissStartConfirmation,
    handleAuthoritativeChange: dismissStartConfirmation,
    clear: () => clearDraft(match.id),
  };
}
