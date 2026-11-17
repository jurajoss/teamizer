import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import type { MatchDetail, UpcomingMatch } from '../api/contracts';
import {
  matchQueryKeys,
  publishMatchState,
  refreshMatchState,
} from './match-query-keys';
import { statisticsQueryKeys } from '../statistics/statistics-query-keys';

const matchId = '00000000-0000-4000-8000-000000000001';

const upcomingMatch: UpcomingMatch = {
  id: matchId,
  sport: {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Football',
    teamsPerMatch: 2,
    playersOnFieldPerTeam: 5,
  },
  startsAt: '2026-08-28T18:00:00.000Z',
  location: 'Pitch A',
  status: 'OPEN_FOR_REGISTRATION',
  stateVersion: 3,
  myAttendance: 'GOING',
};

function matchDetail(overrides: Partial<MatchDetail> = {}): MatchDetail {
  return {
    ...upcomingMatch,
    participants: { going: [], notGoing: [], unanswered: [] },
    teams: null,
    provenance: null,
    result: null,
    ...overrides,
  };
}

describe('Match query updates', () => {
  it('refreshes only upcoming and the affected Match after attendance changes', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
      setQueryData: vi.fn(),
    };

    await refreshMatchState(queryClient, matchId);

    expect(queryClient.invalidateQueries.mock.calls).toEqual([
      [{ queryKey: matchQueryKeys.upcoming, refetchType: 'all' }],
      [{ queryKey: matchQueryKeys.detail(matchId), refetchType: 'active' }],
    ]);
  });

  it('publishes authoritative Start so the canonical route enters scoring directly', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(matchQueryKeys.upcoming, [upcomingMatch]);
    const match = matchDetail({ status: 'IN_PROGRESS', stateVersion: 4 });

    await publishMatchState(queryClient, match);

    expect(queryClient.getQueryData(matchQueryKeys.detail(matchId))).toEqual(
      match,
    );
    expect(queryClient.getQueryData(matchQueryKeys.upcoming)).toEqual([
      expect.objectContaining({
        id: matchId,
        status: 'IN_PROGRESS',
        stateVersion: 4,
      }),
    ]);
  });

  it('adds an active Match to Home when an overdue detail is started', async () => {
    const queryClient = new QueryClient();
    const futureOpen = {
      ...upcomingMatch,
      id: '00000000-0000-4000-8000-000000000099',
      startsAt: '2099-08-28T18:00:00.000Z',
    };
    queryClient.setQueryData(matchQueryKeys.upcoming, [futureOpen]);
    const active = matchDetail({
      status: 'IN_PROGRESS',
      startsAt: '2020-08-28T18:00:00.000Z',
      stateVersion: 4,
    });

    await publishMatchState(queryClient, active);

    expect(queryClient.getQueryData(matchQueryKeys.upcoming)).toEqual([
      expect.objectContaining({ id: matchId, status: 'IN_PROGRESS' }),
      futureOpen,
    ]);
  });

  it('invalidates the finished list and derived statistics after completion', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
      setQueryData: vi.fn(),
    };

    await publishMatchState(
      queryClient,
      matchDetail({ status: 'FINISHED', stateVersion: 5 }),
    );

    expect(queryClient.invalidateQueries.mock.calls).toEqual([
      [{ queryKey: matchQueryKeys.upcoming, refetchType: 'active' }],
      [{ queryKey: matchQueryKeys.finished, refetchType: 'active' }],
      [{ queryKey: statisticsQueryKeys.root, refetchType: 'active' }],
    ]);
  });

  it.each(['FINISHED', 'CANCELLED'] as const)(
    'removes an authoritative %s Match from the cached home list',
    async (status) => {
      const queryClient = new QueryClient();
      queryClient.setQueryData(matchQueryKeys.upcoming, [upcomingMatch]);

      await publishMatchState(queryClient, matchDetail({ status }));

      expect(queryClient.getQueryData(matchQueryKeys.upcoming)).toEqual([]);
    },
  );

  it('does not invent a home entry when only a directly opened detail is known', async () => {
    const queryClient = new QueryClient();

    await publishMatchState(queryClient, matchDetail());

    expect(queryClient.getQueryData(matchQueryKeys.upcoming)).toBeUndefined();
  });
});
