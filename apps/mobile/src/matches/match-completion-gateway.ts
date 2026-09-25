import type { QueryClient } from '@tanstack/react-query';

import type { AuthenticatedApiClient } from '../api/authenticated-api-client';
import type { MatchCompletionGateway } from '../scoring/scoring-session-controller';
import { matchQueryKeys, publishMatchState } from './match-query-keys';

type MatchRouteApi = Pick<AuthenticatedApiClient, 'completeMatch' | 'getMatch'>;

type MatchRouteQueryClient = Pick<
  QueryClient,
  'fetchQuery' | 'invalidateQueries' | 'setQueryData'
>;

export function createMatchCompletionGateway(
  apiClient: MatchRouteApi,
  queryClient: MatchRouteQueryClient,
): MatchCompletionGateway {
  return {
    complete: async (matchId, request, idempotencyKey) => {
      const response = await apiClient.completeMatch(
        matchId,
        request,
        idempotencyKey,
      );
      await publishMatchState(queryClient, response.match);
      return response;
    },
    refresh: async (matchId) => {
      await queryClient.invalidateQueries({
        queryKey: matchQueryKeys.detail(matchId),
        refetchType: 'none',
      });
      const match = await queryClient.fetchQuery({
        queryKey: matchQueryKeys.detail(matchId),
        queryFn: () => apiClient.getMatch(matchId),
      });
      await publishMatchState(queryClient, match);
      return match;
    },
  };
}
