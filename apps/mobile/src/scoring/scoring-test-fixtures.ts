import type { MatchDetail } from '../api/contracts';

export const ids = {
  userA: '00000000-0000-4000-8000-000000000001',
  userB: '00000000-0000-4000-8000-000000000002',
  match: '00000000-0000-4000-8000-000000000010',
  sport: '00000000-0000-4000-8000-000000000020',
  teamA: '00000000-0000-4000-8000-000000000030',
  teamB: '00000000-0000-4000-8000-000000000031',
  playerA: '00000000-0000-4000-8000-000000000040',
  playerB: '00000000-0000-4000-8000-000000000041',
  playerC: '00000000-0000-4000-8000-000000000042',
  playerD: '00000000-0000-4000-8000-000000000043',
} as const;

function player(id: string, name: string) {
  return {
    id,
    name,
    type: 'REGULAR' as const,
    status: 'ACTIVE' as const,
    avatarUrl: null,
  };
}

export function inProgressMatch(
  overrides: Partial<MatchDetail> = {},
): MatchDetail {
  const teamAPlayers = [player(ids.playerA, 'Ada'), player(ids.playerB, 'Ben')];
  const teamBPlayers = [
    player(ids.playerC, 'Cleo'),
    player(ids.playerD, 'Dan'),
  ];

  return {
    id: ids.match,
    sport: {
      id: ids.sport,
      name: 'Football',
      teamsPerMatch: 2,
      playersOnFieldPerTeam: 3,
    },
    startsAt: '2026-08-28T18:00:00.000Z',
    location: 'Pitch A',
    status: 'IN_PROGRESS',
    stateVersion: 4,
    myAttendance: 'GOING',
    participants: {
      going: [...teamAPlayers, ...teamBPlayers],
      notGoing: [],
      unanswered: [],
    },
    teams: [
      { id: ids.teamA, side: 'A', players: teamAPlayers },
      { id: ids.teamB, side: 'B', players: teamBPlayers },
    ],
    provenance: {
      mode: 'ALGORITHM',
      algorithmVersion: 'v1',
      configurationVersion: 'v1',
    },
    result: null,
    ...overrides,
  };
}

export function finishedMatch(score = { teamA: 1, teamB: 0 }): MatchDetail {
  return inProgressMatch({
    status: 'FINISHED',
    stateVersion: 5,
    result: {
      score,
      playerGoals: [
        { playerId: ids.playerA, goals: score.teamA },
        { playerId: ids.playerB, goals: 0 },
        { playerId: ids.playerC, goals: score.teamB },
        { playerId: ids.playerD, goals: 0 },
      ],
    },
  });
}
