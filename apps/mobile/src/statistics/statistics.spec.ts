import { describe, expect, it, vi } from 'vitest';

import type {
  PlayerMatchHistoryPage,
  RankingRow,
  RankingsPage,
} from '../api/contracts';
import {
  fetchAllRankingRows,
  formatGoalsPerMatch,
  formatRankingStatistic,
  formatWinRate,
  historyRows,
  playerEditRouteFor,
  playerRouteFor,
  rankingRows,
  rankingsRoute,
  statisticsViewState,
} from './statistics';

describe('statistics presentation', () => {
  it.each([
    [true, false, 0, 'loading'],
    [false, true, 0, 'error'],
    [false, false, 0, 'empty'],
    [false, false, 1, 'success'],
  ] as const)(
    'maps loading=%s error=%s count=%s to %s',
    (loading, error, count, expected) => {
      expect(statisticsViewState(loading, error, count)).toBe(expected);
    },
  );

  it('loads every ranking page before client-side criterion sorting', async () => {
    const pages: Record<string, RankingsPage> = {
      first: {
        items: [rankingRow('regular', 'Regular', 2, 1, 1)],
        nextCursor: 'next',
      },
      next: {
        items: [rankingRow('guest', 'Guest', 3, 2, 4, 'GUEST')],
        nextCursor: null,
      },
    };
    const getPage = vi.fn(({ cursor }: { cursor?: string; limit: number }) =>
      Promise.resolve(pages[cursor ?? 'first']!),
    );

    const rows = await fetchAllRankingRows(getPage);

    expect(rows.map(({ player }) => player.name)).toEqual(['Regular', 'Guest']);
    expect(rows[1]?.player.type).toBe('GUEST');
    expect(getPage).toHaveBeenNthCalledWith(1, { limit: 100 });
    expect(getPage).toHaveBeenNthCalledWith(2, {
      cursor: 'next',
      limit: 100,
    });
  });

  it.each([
    ['winRate', ['Bravo', 'Alpha', 'Charlie', 'Zero']],
    ['goalsPerMatch', ['Bravo', 'Alpha', 'Charlie', 'Zero']],
    ['participation', ['Charlie', 'Alpha', 'Bravo', 'Zero']],
  ] as const)('sorts the %s ranking descending', (criterion, names) => {
    const rows = [
      rankingRow('alpha', 'Alpha', 10, 8, 10),
      rankingRow('bravo', 'Bravo', 4, 4, 12),
      rankingRow('charlie', 'Charlie', 12, 6, 6),
      rankingRow('zero', 'Zero', 0, 0, 0),
    ];

    const sorted = rankingRows(rows, criterion);

    expect(sorted.map(({ player }) => player.name)).toEqual(names);
    expect(sorted.map(({ rank }) => rank)).toEqual([1, 2, 3, 4]);
  });

  it('breaks complete ties by name then id and keeps zero-Match players last', () => {
    const rows = [
      rankingRow('z-id', 'Same', 2, 1, 2),
      rankingRow('beta-zero', 'Beta', 0, 0, 0),
      rankingRow('alpha-zero', 'Alpha', 0, 0, 0),
      rankingRow('a-id', 'Same', 2, 1, 2),
    ];

    expect(rankingRows(rows, 'winRate').map(({ player }) => player.id)).toEqual(
      ['a-id', 'z-id', 'alpha-zero', 'beta-zero'],
    );
  });

  it('sorts participation by percentage, then played Matches, with null last', () => {
    const higherPercentage = rankingRow('high', 'High', 2, 0, 0);
    higherPercentage.statistics.attendance = {
      playedMatches: 2,
      totalMatches: 4,
      percentage: 50,
    };
    const morePlayed = rankingRow('more', 'More', 5, 0, 0);
    morePlayed.statistics.attendance = {
      playedMatches: 5,
      totalMatches: 10,
      percentage: 40,
    };
    const lessPlayed = rankingRow('less', 'Less', 3, 0, 0);
    lessPlayed.statistics.attendance = {
      playedMatches: 3,
      totalMatches: 10,
      percentage: 40,
    };
    const zero = rankingRow('zero', 'Zero', 0, 0, 0);
    zero.statistics.attendance = {
      playedMatches: 0,
      totalMatches: 10,
      percentage: 0,
    };
    const unavailable = rankingRow('none', 'None', 0, 0, 0);
    unavailable.statistics.attendance = {
      playedMatches: 0,
      totalMatches: 0,
      percentage: null,
    };

    expect(
      rankingRows(
        [unavailable, lessPlayed, zero, morePlayed, higherPercentage],
        'participation',
      ).map(({ player }) => player.name),
    ).toEqual(['High', 'More', 'Less', 'Zero', 'None']);
  });

  it('preserves chronological history order across server pages', () => {
    const pages = [
      { items: [{ id: 'newest' }, { id: 'middle' }] },
      { items: [{ id: 'oldest' }] },
    ] as unknown as PlayerMatchHistoryPage[];

    expect(historyRows(pages).map(({ id }) => id)).toEqual([
      'newest',
      'middle',
      'oldest',
    ]);
  });

  it('formats zero-Match rates as N/A and avoids floating-point noise', () => {
    expect(formatWinRate(null)).toBe('N/A');
    expect(formatGoalsPerMatch(null)).toBe('N/A');
    expect(formatWinRate(2 / 3)).toBe('66.7%');
    expect(formatGoalsPerMatch(2 / 3)).toBe('0.67');
  });

  it('formats exactly one selected ranking statistic', () => {
    const row = rankingRow('one', 'One', 3, 2, 18);

    expect(formatRankingStatistic(row, 'winRate', 'cs')).toBe('66,7 %');
    expect(formatRankingStatistic(row, 'goalsPerMatch', 'en')).toBe('6.00');
    expect(formatRankingStatistic(row, 'participation', 'en')).toBe('15 %');
  });

  it('formats defined and unavailable attendance percentages', () => {
    const attended = rankingRow('player', 'Player', 17, 0, 0);
    const unavailable = rankingRow('zero', 'Zero', 0, 0, 0);
    unavailable.statistics.attendance = {
      playedMatches: 0,
      totalMatches: 0,
      percentage: null,
    };

    expect(formatRankingStatistic(attended, 'participation', 'en')).toBe(
      '85 %',
    );
    expect(formatRankingStatistic(attended, 'participation', 'cs')).toBe(
      '85 %',
    );
    expect(formatRankingStatistic(unavailable, 'participation', 'en')).toBe(
      '—',
    );
  });

  it('renders unavailable rates as a neutral dash for zero-Match players', () => {
    const row = rankingRow('zero', 'Zero', 0, 0, 0);

    expect(formatRankingStatistic(row, 'winRate', 'en')).toBe('—');
    expect(formatRankingStatistic(row, 'goalsPerMatch', 'en')).toBe('—');
  });

  it('builds the ranking and Player-detail navigation destinations', () => {
    expect(rankingsRoute()).toBe('/rankings');
    expect(playerRouteFor('player-id')).toBe('/players/player-id');
    expect(playerEditRouteFor('player-id')).toBe('/players/player-id/edit');
  });
});

function rankingRow(
  id: string,
  name: string,
  matches: number,
  wins: number,
  goals: number,
  type: 'REGULAR' | 'GUEST' = 'REGULAR',
): RankingRow {
  return {
    rank: 99,
    player: {
      avatarUrl: null,
      id,
      name,
      status: 'ACTIVE',
      type,
    },
    statistics: {
      draws: 0,
      goals,
      goalsPerMatch: matches === 0 ? null : goals / matches,
      losses: matches - wins,
      matches,
      winRate: matches === 0 ? null : wins / matches,
      wins,
      attendance: {
        playedMatches: matches,
        totalMatches: 20,
        percentage: Math.round((matches / 20) * 100),
      },
    },
  };
}
