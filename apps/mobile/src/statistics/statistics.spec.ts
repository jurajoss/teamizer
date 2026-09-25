import { describe, expect, it } from 'vitest';

import type { PlayerMatchHistoryPage, RankingsPage } from '../api/contracts';
import {
  formatGoalsPerMatch,
  formatWinRate,
  historyRows,
  playerRouteFor,
  rankingRows,
  statisticsRoute,
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

  it('preserves the authoritative ranking order exactly as received', () => {
    const pages = [
      { items: [{ rank: 1 }, { rank: 2 }] },
      { items: [{ rank: 3 }] },
    ] as unknown as RankingsPage[];

    expect(rankingRows(pages).map(({ rank }) => rank)).toEqual([1, 2, 3]);
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

  it('builds the ranking and Player-detail navigation destinations', () => {
    expect(statisticsRoute()).toBe('/statistics');
    expect(playerRouteFor('player-id')).toBe('/players/player-id');
  });
});
