import { describe, expect, it } from 'vitest';

import type {
  MatchDetail,
  MatchSummary,
  UpcomingMatch,
} from '../api/contracts';
import {
  canCreateMatch,
  defaultMatchesFilter,
  formatMatchListDate,
  matchListAvatarLimit,
  matchListPlayers,
  matchListTeamPlayers,
  matchListScore,
  matchesIndexEmptyState,
  matchesIndexSections,
  personalMatchGoals,
  personalMatchResult,
} from './matches-index-model';

const ids = {
  finished: '00000000-0000-4000-8000-000000000001',
  upcoming: '00000000-0000-4000-8000-000000000002',
  sport: '00000000-0000-4000-8000-000000000003',
  current: '00000000-0000-4000-8000-000000000004',
  teammate: '00000000-0000-4000-8000-000000000005',
  opponent: '00000000-0000-4000-8000-000000000006',
  outsider: '00000000-0000-4000-8000-000000000007',
  teamA: '00000000-0000-4000-8000-000000000008',
  teamB: '00000000-0000-4000-8000-000000000009',
};

describe('Matches index presentation model', () => {
  it('uses the unfiltered All view as the canonical Matches-root default', () => {
    expect(defaultMatchesFilter).toBe('all');
  });

  it('groups All and filters upcoming and finished without reordering', () => {
    const upcoming = [upcomingMatch()];
    const finished = [finishedMatch()];

    expect(matchesIndexSections('all', upcoming, finished)).toEqual([
      { kind: 'upcoming', matches: upcoming },
      { kind: 'finished', matches: finished },
    ]);
    expect(matchesIndexSections('upcoming', upcoming, finished)).toEqual([
      { kind: 'upcoming', matches: upcoming },
    ]);
    expect(matchesIndexSections('finished', upcoming, finished)).toEqual([
      { kind: 'finished', matches: finished },
    ]);
  });

  it('keeps an overdue OPEN Match in the upcoming section', () => {
    const overdue = {
      ...upcomingMatch(),
      startsAt: '2000-01-01T18:00:00.000Z',
    };

    expect(matchesIndexSections('upcoming', [overdue], [])).toEqual([
      { kind: 'upcoming', matches: [overdue] },
    ]);
  });

  it.each([
    ['all', 0, 0, 'all'],
    ['all', 1, 0, null],
    ['upcoming', 0, 2, 'upcoming'],
    ['upcoming', 1, 0, null],
    ['finished', 3, 0, 'finished'],
    ['finished', 0, 1, null],
  ] as const)(
    'selects the %s empty state intentionally',
    (filter, upcomingCount, finishedCount, expected) => {
      expect(matchesIndexEmptyState(filter, upcomingCount, finishedCount)).toBe(
        expected,
      );
    },
  );

  it('formats a compact Prague date without time or location', () => {
    expect(formatMatchListDate('2026-12-16T18:00:00.000Z', 'cs')).toEqual({
      date: '16. 12.',
      weekday: 'ST',
    });
  });

  it('uses real team players for finished rows and de-duplicates identities', () => {
    const match = detail();
    match.teams?.[1]?.players.push(match.teams[0]!.players[0]!);

    expect(matchListPlayers(match).map(({ id }) => id)).toEqual([
      ids.current,
      ids.teammate,
      ids.opponent,
    ]);
  });

  it('shares ordered, de-duplicated participants from both teams with history rows', () => {
    const match = detail();
    match.teams?.[1]?.players.push(match.teams[0]!.players[0]!);

    expect(matchListTeamPlayers(match.teams ?? []).map(({ id }) => id)).toEqual(
      [ids.current, ids.teammate, ids.opponent],
    );
  });

  it('derives the personal result, including a neutral nonparticipant state', () => {
    const match = detail();

    expect(personalMatchResult(match, ids.current)).toBe('WIN');
    expect(personalMatchResult(match, ids.opponent)).toBe('LOSS');
    expect(personalMatchResult(match, ids.outsider)).toBe('DID_NOT_PLAY');
    expect(
      personalMatchResult(
        {
          ...match,
          result: {
            ...match.result!,
            score: { teamA: 2, teamB: 2 },
          },
        },
        ids.current,
      ),
    ).toBe('DRAW');
    expect(personalMatchResult(undefined, ids.current)).toBeNull();
    expect(
      personalMatchResult({ ...match, teams: null }, ids.current),
    ).toBeNull();
  });

  it('shows only an authoritative finished score', () => {
    expect(matchListScore(detail())).toEqual({ teamA: 2, teamB: 1 });
    expect(
      matchListScore({
        ...detail(),
        status: 'IN_PROGRESS',
        result: null,
      }),
    ).toBeNull();
  });

  it('shows explicit personal goals only for a participating player', () => {
    const match = detail();
    match.result!.playerGoals = [{ playerId: ids.current, goals: 3 }];

    expect(personalMatchGoals(match, ids.current)).toBe(3);
    expect(personalMatchGoals(match, ids.teammate)).toBe(0);
    expect(personalMatchGoals(match, ids.outsider)).toBeNull();
    expect(personalMatchGoals(undefined, ids.current)).toBeNull();
  });

  it('keeps phone stacks compact, allows tablet growth, and gates creation', () => {
    expect(matchListAvatarLimit('phone', 'upcoming', 360)).toBe(3);
    expect(matchListAvatarLimit('phone', 'finished', 374)).toBe(2);
    expect(matchListAvatarLimit('phone', 'finished', 375)).toBe(3);
    expect(matchListAvatarLimit('tablet', 'upcoming', 768)).toBe(8);
    expect(matchListAvatarLimit('tablet', 'finished', 768)).toBe(8);
    expect(canCreateMatch('PLAYER')).toBe(false);
    expect(canCreateMatch('ADMIN')).toBe(true);
  });
});

function player(id: string, name: string) {
  return {
    id,
    name,
    type: 'REGULAR' as const,
    status: 'ACTIVE' as const,
    avatarUrl: null,
  };
}

function upcomingMatch(): UpcomingMatch {
  return {
    id: ids.upcoming,
    sport: sport(),
    startsAt: '2026-12-16T18:00:00.000Z',
    location: 'Pitch A',
    status: 'OPEN_FOR_REGISTRATION',
    stateVersion: 1,
    myAttendance: 'GOING',
  };
}

function finishedMatch(): MatchSummary {
  return {
    id: ids.finished,
    sport: sport(),
    startsAt: '2026-12-03T18:00:00.000Z',
    location: 'Pitch A',
    status: 'FINISHED',
    stateVersion: 4,
  };
}

function detail(): MatchDetail {
  const current = player(ids.current, 'Current Player');
  const teammate = player(ids.teammate, 'Team Mate');
  const opponent = player(ids.opponent, 'Opponent');
  return {
    ...finishedMatch(),
    myAttendance: 'GOING',
    participants: {
      going: [current, teammate, opponent],
      notGoing: [],
      unanswered: [],
    },
    teams: [
      { id: ids.teamA, side: 'A', players: [current, teammate] },
      { id: ids.teamB, side: 'B', players: [opponent] },
    ],
    provenance: null,
    result: {
      score: { teamA: 2, teamB: 1 },
      playerGoals: [],
    },
  };
}

function sport() {
  return {
    id: ids.sport,
    name: 'Football',
    teamsPerMatch: 2,
    playersOnFieldPerTeam: 3,
  };
}
