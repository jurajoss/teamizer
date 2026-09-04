import type { QueryClient } from '@tanstack/react-query';

import type { MatchDetail, UpcomingMatch } from '../api/contracts';
import { statisticsQueryKeys } from '../statistics/statistics-query-keys';

export const matchQueryKeys = {
  root: ['matches'] as const,
  upcoming: ['matches', 'upcoming'] as const,
  detail: (matchId: string) => ['matches', 'detail', matchId] as const,
};

type MatchQueryClient = Pick<QueryClient, 'invalidateQueries' | 'setQueryData'>;

export async function refreshMatchState(
  queryClient: MatchQueryClient,
  matchId: string,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: matchQueryKeys.upcoming,
    refetchType: 'all',
  });
  await queryClient.invalidateQueries({
    queryKey: matchQueryKeys.detail(matchId),
    refetchType: 'active',
  });
}

export async function publishMatchState(
  queryClient: MatchQueryClient,
  match: MatchDetail,
): Promise<void> {
  queryClient.setQueryData(matchQueryKeys.detail(match.id), match);
  queryClient.setQueryData<UpcomingMatch[]>(
    matchQueryKeys.upcoming,
    (matches) => reconcileUpcomingMatches(matches, match),
  );
  await queryClient.invalidateQueries({
    queryKey: matchQueryKeys.upcoming,
    refetchType: 'active',
  });
  if (match.status === 'FINISHED') {
    await queryClient.invalidateQueries({
      queryKey: statisticsQueryKeys.root,
      refetchType: 'active',
    });
  }
}

function reconcileUpcomingMatches(
  matches: UpcomingMatch[] | undefined,
  match: MatchDetail,
): UpcomingMatch[] | undefined {
  if (!matches) {
    return matches;
  }

  if (match.status === 'FINISHED' || match.status === 'CANCELLED') {
    return matches.filter(({ id }) => id !== match.id);
  }

  const index = matches.findIndex(({ id }) => id === match.id);
  if (index === -1) {
    return match.status === 'IN_PROGRESS'
      ? [...matches, toUpcomingMatch(match)].sort(compareUpcomingMatches)
      : matches;
  }

  const updated = [...matches];
  updated[index] = toUpcomingMatch(match);
  return updated.sort(compareUpcomingMatches);
}

function toUpcomingMatch(match: MatchDetail): UpcomingMatch {
  return {
    id: match.id,
    sport: match.sport,
    startsAt: match.startsAt,
    location: match.location,
    status: match.status,
    stateVersion: match.stateVersion,
    myAttendance: match.myAttendance,
  };
}

function compareUpcomingMatches(
  left: UpcomingMatch,
  right: UpcomingMatch,
): number {
  const startsAtComparison = left.startsAt.localeCompare(right.startsAt);
  return startsAtComparison !== 0
    ? startsAtComparison
    : left.id.localeCompare(right.id);
}
