import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { finishedMatch, ids } from '../scoring/scoring-test-fixtures';
import { createMatchCompletionGateway } from './match-completion-gateway';
import { matchQueryKeys } from './match-query-keys';

describe('Match route controller seam', () => {
  it('publishes completion and authoritative refresh through the existing Match caches', async () => {
    const completed = finishedMatch();
    const api = {
      completeMatch: vi.fn().mockResolvedValue({
        match: completed,
        idempotentReplay: false,
      }),
      getMatch: vi.fn().mockResolvedValue(completed),
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const gateway = createMatchCompletionGateway(api, queryClient);
    const request = {
      score: { teamA: 1, teamB: 0 },
      playerGoals: [{ playerId: ids.playerA, goals: 1 }],
    };

    await gateway.complete(ids.match, request, 'completion-key');
    expect(api.completeMatch).toHaveBeenCalledWith(
      ids.match,
      request,
      'completion-key',
    );
    expect(queryClient.getQueryData(matchQueryKeys.detail(ids.match))).toEqual(
      completed,
    );

    queryClient.removeQueries({ queryKey: matchQueryKeys.detail(ids.match) });
    await expect(gateway.refresh(ids.match)).resolves.toEqual(completed);
    expect(api.getMatch).toHaveBeenCalledWith(ids.match);
    expect(queryClient.getQueryData(matchQueryKeys.detail(ids.match))).toEqual(
      completed,
    );
  });
});
