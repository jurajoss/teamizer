import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { useAppServices } from '../providers/app-services-context';
import { expoCompletionCrypto } from '../scoring/completion-crypto';
import {
  ScoringSessionController,
  shouldInitializeScoringSession,
  type ScoringSessionState,
} from '../scoring/scoring-session-controller';
import { createMatchCompletionGateway } from './match-completion-gateway';
import { matchQueryKeys, publishMatchState } from './match-query-keys';

export function useMatchRouteController({
  matchId,
  scoringIdentity,
}: {
  matchId: string | null;
  scoringIdentity: {
    userId: string;
    playerStatus: 'ACTIVE' | 'INACTIVE';
  } | null;
}) {
  const { apiClient, scoringDraftRepository } = useAppServices();
  const queryClient = useQueryClient();
  const scoringUserId = scoringIdentity?.userId ?? null;
  const scoringPlayerStatus = scoringIdentity?.playerStatus ?? null;
  const matchQuery = useQuery({
    queryKey: matchQueryKeys.detail(matchId ?? 'invalid'),
    queryFn: () => apiClient.getMatch(matchId ?? ''),
    enabled: matchId !== null,
  });
  const refetchMatch = matchQuery.refetch;
  const controller = useMemo(() => {
    // These dependencies make the controller an explicit per-owner/per-Match
    // session boundary even though the gateway accepts Match IDs per call.
    void matchId;
    void scoringUserId;
    return new ScoringSessionController(
      scoringDraftRepository,
      createMatchCompletionGateway(apiClient, queryClient),
      expoCompletionCrypto,
    );
  }, [apiClient, matchId, queryClient, scoringDraftRepository, scoringUserId]);
  const [scoringState, setScoringState] = useState<ScoringSessionState>(
    controller.currentState,
  );

  useEffect(() => controller.subscribe(setScoringState), [controller]);

  useEffect(() => {
    if (
      scoringUserId &&
      scoringPlayerStatus &&
      matchQuery.data &&
      shouldInitializeScoringSession(
        scoringPlayerStatus,
        matchQuery.data.status,
      )
    ) {
      void controller.initialize(scoringUserId, matchQuery.data);
    }
  }, [controller, matchQuery.data, scoringPlayerStatus, scoringUserId]);

  useEffect(() => {
    if (matchQuery.data) {
      void publishMatchState(queryClient, matchQuery.data);
    }
  }, [matchQuery.data, queryClient]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && matchId) {
        void refetchMatch();
      }
    });

    return () => subscription.remove();
  }, [matchId, refetchMatch]);

  useFocusEffect(
    useCallback(() => {
      if (matchId) void refetchMatch();
    }, [matchId, refetchMatch]),
  );

  return { apiClient, controller, matchQuery, scoringState };
}

export function scoringIdentityForSession(
  currentUser: {
    user: { id: string };
    player: { status: 'ACTIVE' | 'INACTIVE' };
  } | null,
) {
  return currentUser
    ? {
        userId: currentUser.user.id,
        playerStatus: currentUser.player.status,
      }
    : null;
}
