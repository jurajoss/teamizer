import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../api/authenticated-api-client';
import type { AuthenticatedApiClient } from '../api/authenticated-api-client';
import type { CurrentUser, OnboardingInput } from '../api/contracts';
import { matchQueryKeys } from '../matches/match-query-keys';
import { statisticsQueryKeys } from '../statistics/statistics-query-keys';
import { QueryTeamizerIdentityClient } from './teamizer-identity-client';

const currentUser: CurrentUser = {
  user: {
    id: 'b7e72ff0-7ae8-47de-aa2c-d77eefbe02d5',
    role: 'PLAYER',
    notificationsEnabled: true,
    createdAt: '2026-08-28T10:00:00.000Z',
  },
  player: {
    id: '17d13986-b1ab-4ebc-a7b8-ac832e0bdb8b',
    name: 'Gaz',
    type: 'REGULAR',
    status: 'ACTIVE',
    avatarUrl: null,
  },
};

const input: OnboardingInput = {
  name: 'Gaz',
  attributes: {
    speed: 5,
    endurance: 5,
    defense: 5,
    attack: 5,
    technique: 5,
  },
};

function createApiClient(): AuthenticatedApiClient {
  return {
    getCurrentUser: vi.fn().mockResolvedValue(currentUser),
    onboard: vi.fn().mockResolvedValue(currentUser),
  } as unknown as AuthenticatedApiClient;
}

describe('QueryTeamizerIdentityClient', () => {
  it('posts onboarding and then refreshes /me before returning the identity', async () => {
    const apiClient = createApiClient();
    const client = new QueryTeamizerIdentityClient(
      new QueryClient(),
      apiClient,
    );

    await expect(client.onboard('firebase-uid', input)).resolves.toEqual(
      currentUser,
    );

    expect(apiClient.onboard).toHaveBeenCalledWith(input);
    expect(apiClient.getCurrentUser).toHaveBeenCalledOnce();
    expect(
      vi.mocked(apiClient.onboard).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(apiClient.getCurrentUser).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('handles an already-onboarded race by refreshing /me', async () => {
    const apiClient = createApiClient();
    vi.mocked(apiClient.onboard).mockRejectedValue(
      new ApiClientError(409, 'USER_ALREADY_ONBOARDED', 'Already onboarded.'),
    );
    const client = new QueryTeamizerIdentityClient(
      new QueryClient(),
      apiClient,
    );

    await expect(client.onboard('firebase-uid', input)).resolves.toEqual(
      currentUser,
    );
    expect(apiClient.getCurrentUser).toHaveBeenCalledOnce();
  });

  it('removes identity-relative Match and statistics data when the session identity is cleared', () => {
    const queryClient = new QueryClient();
    const client = new QueryTeamizerIdentityClient(
      queryClient,
      createApiClient(),
    );
    queryClient.setQueryData(matchQueryKeys.upcoming, [
      { myAttendance: 'GOING' },
    ]);
    queryClient.setQueryData(matchQueryKeys.detail('match-id'), {
      myAttendance: 'GOING',
    });
    queryClient.setQueryData(statisticsQueryKeys.rankings, {
      pages: [{ items: [{ rank: 1 }] }],
    });
    queryClient.setQueryData(statisticsQueryKeys.player('player-id'), {
      name: 'Previous account Player',
    });

    client.clear('firebase-uid');

    expect(
      queryClient.getQueriesData({ queryKey: matchQueryKeys.root }),
    ).toEqual([]);
    expect(
      queryClient.getQueriesData({ queryKey: statisticsQueryKeys.root }),
    ).toEqual([]);
  });
});
