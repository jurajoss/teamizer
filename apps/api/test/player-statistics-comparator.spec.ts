import { describe, expect, it } from 'vitest';

import type { PlayerStatisticsSummaryDto } from '../src/players/player.dto';
import {
  buildAttendanceStats,
  compareRankingCandidates,
  type RankingCandidate,
} from '../src/players/player-statistics.service';

function candidate(
  name: string,
  statistics: Partial<PlayerStatisticsSummaryDto>,
  id = name,
): RankingCandidate {
  const matches = statistics.matches ?? 0;
  return {
    player: { id, name },
    statistics: {
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: null,
      goals: 0,
      goalsPerMatch: null,
      attendance: {
        playedMatches: matches,
        totalMatches: matches,
        percentage: matches === 0 ? null : 100,
      },
      ...statistics,
    },
  };
}

function ordered(first: RankingCandidate, second: RankingCandidate): boolean {
  return [second, first].sort(compareRankingCandidates)[0] === first;
}

describe('ranking comparator', () => {
  it('applies win rate before Matches played', () => {
    expect(
      ordered(
        candidate('Higher rate', { matches: 1, wins: 1 }),
        candidate('More Matches', { matches: 10, wins: 9 }),
      ),
    ).toBe(true);
  });

  it('uses Matches played when win rate is tied', () => {
    expect(
      ordered(
        candidate('Four Matches', { matches: 4, wins: 2 }),
        candidate('Two Matches', { matches: 2, wins: 1 }),
      ),
    ).toBe(true);
  });

  it('uses goals per Match after equal rate and Matches', () => {
    expect(
      ordered(
        candidate('More GPM', { matches: 2, wins: 1, goals: 3 }),
        candidate('Less GPM', { matches: 2, wins: 1, goals: 1 }),
      ),
    ).toBe(true);
  });

  it('preserves the total-goals criterion when displayed goals per Match ties', () => {
    expect(
      ordered(
        candidate('One Goal', {
          matches: 20_001,
          wins: 0,
          goals: 1,
          goalsPerMatch: 0,
        }),
        candidate('Zero Goals', {
          matches: 20_001,
          wins: 0,
          goals: 0,
          goalsPerMatch: 0,
        }),
      ),
    ).toBe(true);
  });

  it('uses name and then ID for the final deterministic tie', () => {
    const statistics = { matches: 1, wins: 0, goals: 0 };
    expect(
      ordered(candidate('Alpha', statistics), candidate('Zulu', statistics)),
    ).toBe(true);
    expect(
      ordered(
        candidate('Same', statistics, 'a'),
        candidate('Same', statistics, 'b'),
      ),
    ).toBe(true);
  });

  it('always places zero-Match Players after participants', () => {
    expect(
      ordered(
        candidate('Participant', { matches: 1, wins: 0 }),
        candidate('Zero', {}),
      ),
    ).toBe(true);
  });
});

describe('attendance statistics', () => {
  it('returns an unavailable percentage when there are no FINISHED Matches', () => {
    expect(buildAttendanceStats([], 0)).toEqual({
      playedMatches: 0,
      totalMatches: 0,
      percentage: null,
    });
  });

  it('returns zero when FINISHED Matches exist without participation', () => {
    expect(buildAttendanceStats([], 3)).toEqual({
      playedMatches: 0,
      totalMatches: 3,
      percentage: 0,
    });
  });

  it('counts each Match once and rounds to the nearest integer', () => {
    expect(buildAttendanceStats(['one', 'one', 'two'], 3)).toEqual({
      playedMatches: 2,
      totalMatches: 3,
      percentage: 67,
    });
  });

  it('rejects an impossible attendance count above the denominator', () => {
    expect(() => buildAttendanceStats(['one', 'two'], 1)).toThrow(
      'Player attendance cannot exceed the total number of FINISHED Matches.',
    );
  });
});
